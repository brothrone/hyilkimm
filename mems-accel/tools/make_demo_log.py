#!/usr/bin/env python3
"""펌웨어 없이 vibview.py를 시험하기 위한 가짜 로그 생성 (센서2 = 센서1을 120 Hz 부근에서 증폭)."""
import struct, sys
import numpy as np

ODR, N_MAX, POLL = 1600, 32, 0.010
rng = np.random.default_rng(0)
dur = 20.0
fs1, fs2 = 1600 * 1.01, 1600 * 0.98             # 두 센서의 실제 ODR이 다르다고 가정
LSB = 0.0039


def sig(fs, amp2):
    t = np.arange(int(dur * fs)) / fs
    base = 0.30 * np.sin(2 * np.pi * 95 * t) + 0.12 * np.sin(2 * np.pi * 190 * t)
    y = base + 0.02 * rng.standard_normal(len(t))
    if amp2:
        y = y * 0.6 + 0.5 * np.sin(2 * np.pi * 120 * t)
    z = 1.0 + y                                   # z축은 중력 1 g 포함
    xyz = np.column_stack([0.3 * y, 0.3 * y, z])
    return np.round(xyz / LSB).astype("<i2")


data = [sig(fs1, False), sig(fs2, True)]
blocks = bytearray()
t_us = 123456
pos = [0, 0]
fss = [fs1, fs2]
acc_frac = [0.0, 0.0]
while min(len(data[k]) - pos[k] for k in (0, 1)) > 20:
    for k in (0, 1):
        acc_frac[k] += fss[k] * POLL            # 실제 ODR만큼 샘플이 쌓이므로 블록당 개수가 16/17로 변한다
        n = int(acc_frac[k]); acc_frac[k] -= n
        blk = np.zeros((N_MAX, 3), "<i2")
        blk[:n] = data[k][pos[k]: pos[k] + n]
        pos[k] += n
        blocks += struct.pack("<IBBH", t_us & 0xFFFFFFFF, k, n, 0) + blk.tobytes()
    t_us += int(POLL * 1e6)
hdr = struct.pack("<8sHHBBH14s", b"VIBLOG01", ODR, 200, N_MAX, 16, 3900, b"")
open(sys.argv[1] if len(sys.argv) > 1 else "demo.bin", "wb").write(hdr + bytes(blocks))
