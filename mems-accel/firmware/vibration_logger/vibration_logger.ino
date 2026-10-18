// UAV 카메라 진동 로거: ESP32 + ADXL345 x2 (SPI) + microSD (SPI)
//
// 기존 폴링 방식 대비 변경점
//  1. 센서 FIFO(stream 모드)로 샘플을 빠짐없이 읽음 (loop 폴링 → 누락/중복/에일리어싱 제거)
//  2. 센서 읽기(core 1)와 SD 쓰기(core 0)를 분리, 큐로 연결 (SD 지연이 샘플링을 막지 않음)
//  3. 원시 int16을 바이너리 기록 (부호 처리 버그 수정, 변환은 PC에서)
//  4. 부팅마다 새 파일 생성, 블록마다 us 타임스탬프 기록 (실제 ODR을 PC에서 추정)
//  5. 부팅 시 ADXL345 DEVID(0xE5) 확인, 큐 오버플로/FIFO 가득참 카운트 기록
//
// 파일 형식은 tools/vibview.py 와 맞춰야 한다 (FileHeader / Block 구조체).

#include <SPI.h>
#include <SD.h>
#include <esp_timer.h>

// ---------------- 핀 ----------------
#define CS1     15              // 센서1 (VSPI: SCK18 MISO19 MOSI23)
#define CS2     4               // 센서2
#define SD_CS   5               // SD (HSPI)
#define SD_SCK  14
#define SD_MOSI 13
#define SD_MISO 27
#define LED_PIN 2               // DevKit 내장 LED

// ---------------- 샘플링 설정 ----------------
// 3200 Hz ODR(대역폭 1600 Hz) + 5 ms 주기 읽기 (ADXL345 최대 설정).
// 10000 RPM 3엽 프롭: 1P=167 Hz, BPF=500 Hz, 2xBPF=1 kHz, 3xBPF=1.5 kHz 까지 포함.
// 1600 Hz가 충분하면 ODR_HZ=1600, BW_RATE_CODE=0x0E, POLL_MS=10 (데이터량 절반).
#define ODR_HZ        3200
#define BW_RATE_CODE  0x0F
#define POLL_MS       5
#define FIFO_WATERMARK 16

// ---------------- ADXL345 레지스터 ----------------
#define REG_DEVID       0x00
#define REG_BW_RATE     0x2C
#define REG_POWER_CTL   0x2D
#define REG_DATA_FORMAT 0x31
#define REG_DATAX0      0x32
#define REG_FIFO_CTL    0x38
#define REG_FIFO_STATUS 0x39

#define SPI_HZ 4000000          // ADXL345 최대 5 MHz. 3200 Hz ODR은 SPI 2 MHz 이상 필요(데이터시트)

// ---------------- 기록 형식 ----------------
#define MAX_SAMPLES 32
struct __attribute__((packed)) FileHeader {   // 32 바이트
  char     magic[8];            // "VIBLOG01"
  uint16_t odr_hz;
  uint16_t block_bytes;
  uint8_t  max_samples;
  uint8_t  range_g;
  uint16_t lsb_ug;              // 3900 ug/LSB (full-res)
  uint8_t  reserved[14];
};
struct __attribute__((packed)) Block {        // 200 바이트
  uint32_t t_us;                // 읽기 시점 esp_timer (32비트, PC에서 unwrap)
  uint8_t  sensor;              // 0 또는 1
  uint8_t  n;                   // 유효 샘플 수
  uint16_t fifo_full;           // 누적: FIFO가 가득 찬 채로 읽은 횟수(유실 의심)
  int16_t  s[MAX_SAMPLES][3];
};
static_assert(sizeof(Block) == 200, "Block size");
static_assert(sizeof(FileHeader) == 32, "Header size");

SPIClass sdSPI(HSPI);
QueueHandle_t blockQ;
volatile uint32_t queueDrops = 0;
const uint8_t csPins[2] = {CS1, CS2};
uint16_t fifoFull[2] = {0, 0};

// ---------------- ADXL345 ----------------
void adxlWrite(int cs, uint8_t reg, uint8_t val) {
  SPI.beginTransaction(SPISettings(SPI_HZ, MSBFIRST, SPI_MODE3));
  digitalWrite(cs, LOW);
  SPI.transfer(reg);
  SPI.transfer(val);
  digitalWrite(cs, HIGH);
  SPI.endTransaction();
}

uint8_t adxlRead(int cs, uint8_t reg) {
  SPI.beginTransaction(SPISettings(SPI_HZ, MSBFIRST, SPI_MODE3));
  digitalWrite(cs, LOW);
  SPI.transfer(0x80 | reg);
  uint8_t v = SPI.transfer(0);
  digitalWrite(cs, HIGH);
  SPI.endTransaction();
  return v;
}

// FIFO에서 한 샘플(6바이트)을 꺼낸다. 부호 있는 int16으로 조합하는 것이 핵심.
void adxlReadSample(int cs, int16_t *xyz) {
  uint8_t buf[7] = {(uint8_t)(0xC0 | REG_DATAX0), 0, 0, 0, 0, 0, 0};
  SPI.beginTransaction(SPISettings(SPI_HZ, MSBFIRST, SPI_MODE3));
  digitalWrite(cs, LOW);
  SPI.transferBytes(buf, buf, 7);
  digitalWrite(cs, HIGH);
  SPI.endTransaction();
  for (int i = 0; i < 3; i++)
    xyz[i] = (int16_t)((uint16_t)buf[2 + 2 * i] << 8 | buf[1 + 2 * i]);
  delayMicroseconds(5);         // 데이터시트: FIFO 연속 읽기 사이 최소 5 us
}

bool adxlInit(int cs) {
  if (adxlRead(cs, REG_DEVID) != 0xE5) return false;
  adxlWrite(cs, REG_POWER_CTL, 0x00);              // standby
  adxlWrite(cs, REG_BW_RATE, BW_RATE_CODE);
  adxlWrite(cs, REG_DATA_FORMAT, 0x0B);            // FULL_RES, ±16 g
  adxlWrite(cs, REG_FIFO_CTL, 0x80 | FIFO_WATERMARK); // stream 모드
  adxlWrite(cs, REG_POWER_CTL, 0x08);              // measure
  return true;
}

// ---------------- 태스크 ----------------
void sensorTask(void *) {
  TickType_t last = xTaskGetTickCount();
  for (;;) {
    vTaskDelayUntil(&last, pdMS_TO_TICKS(POLL_MS));
    for (uint8_t k = 0; k < 2; k++) {
      uint8_t n = adxlRead(csPins[k], REG_FIFO_STATUS) & 0x3F;
      if (n == 0) continue;
      if (n >= 32) fifoFull[k]++;
      if (n > MAX_SAMPLES) n = MAX_SAMPLES;

      static Block b;                              // 이 태스크에서만 사용
      b.t_us = (uint32_t)esp_timer_get_time();
      b.sensor = k;
      b.n = n;
      b.fifo_full = fifoFull[k];
      for (uint8_t i = 0; i < n; i++) adxlReadSample(csPins[k], b.s[i]);
      if (xQueueSend(blockQ, &b, 0) != pdTRUE) queueDrops++;
    }
  }
}

void writerTask(void *arg) {
  File f = *(File *)arg;
  static Block b;
  uint32_t lastFlush = millis();
  uint32_t blocks = 0;
  for (;;) {
    if (xQueueReceive(blockQ, &b, pdMS_TO_TICKS(100)) == pdTRUE) {
      f.write((uint8_t *)&b, sizeof(b));
      blocks++;
    }
    if (millis() - lastFlush >= 1000) {            // 전원이 끊겨도 최대 ~1초만 손실
      f.flush();
      lastFlush = millis();
      digitalWrite(LED_PIN, !digitalRead(LED_PIN));
      if ((blocks % 200) < 5)
        Serial.printf("blocks=%lu queueDrops=%lu fifoFull=%u/%u\n",
                      (unsigned long)blocks, (unsigned long)queueDrops,
                      fifoFull[0], fifoFull[1]);
    }
  }
}

// ---------------- 초기화 ----------------
[[noreturn]] void fail(const char *msg) {          // LED 빠르게 깜빡이며 정지
  for (;;) {
    Serial.println(msg);
    for (int i = 0; i < 10; i++) { digitalWrite(LED_PIN, i & 1); delay(100); }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  pinMode(CS1, OUTPUT); digitalWrite(CS1, HIGH);   // 버스 혼선 방지
  pinMode(CS2, OUTPUT); digitalWrite(CS2, HIGH);
  pinMode(SD_CS, OUTPUT); digitalWrite(SD_CS, HIGH);
  SPI.begin();
  sdSPI.begin(SD_SCK, SD_MISO, SD_MOSI, SD_CS);
  delay(200);

  if (!SD.begin(SD_CS, sdSPI, 8000000)) fail("SD 인식 실패 (5V 연결, FAT32 확인)");

  char name[24];
  int idx = 0;
  do { snprintf(name, sizeof(name), "/vib_%03d.bin", idx++); } while (SD.exists(name) && idx < 1000);
  static File f;
  f = SD.open(name, FILE_WRITE);
  if (!f) fail("파일 생성 실패");

  if (!adxlInit(CS1)) fail("센서1 응답 없음 (배선/CS 확인)");
  if (!adxlInit(CS2)) fail("센서2 응답 없음 (배선/CS 확인)");

  FileHeader h = {};
  memcpy(h.magic, "VIBLOG01", 8);
  h.odr_hz = ODR_HZ;
  h.block_bytes = sizeof(Block);
  h.max_samples = MAX_SAMPLES;
  h.range_g = 16;
  h.lsb_ug = 3900;
  f.write((uint8_t *)&h, sizeof(h));
  f.flush();

  blockQ = xQueueCreate(256, sizeof(Block));       // 5 ms 주기에서 약 0.6 s 분량 버퍼(약 51 KB)
  Serial.printf("기록 시작: %s (ODR %d Hz)\n", name, ODR_HZ);

  xTaskCreatePinnedToCore(writerTask, "writer", 6144, &f, 1, nullptr, 0);
  xTaskCreatePinnedToCore(sensorTask, "sensor", 4096, nullptr, 3, nullptr, 1);
}

void loop() { vTaskDelay(portMAX_DELAY); }
