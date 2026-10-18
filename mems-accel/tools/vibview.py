#!/usr/bin/env python3
"""vib_NNN.bin(vibration_logger 펌웨어 출력)을 읽어 CSV, PSD, 전달률 그래프를 만든다.

사용:  python3 vibview.py vib_000.bin [--out 출력폴더] [--nperseg 2048]
센서1을 기체(입력), 센서2를 카메라(출력)에 붙였다고 보고 전달률 |S2/S1|을 계산한다.
"""
import argparse, struct, sys
from pathlib import Path
import numpy as np
from scipy import signal

HEADER = struct.Struct("<8sHHBBH14s")            # 32 바이트
G = 9.80665


def load(path):
    raw = Path(path).read_bytes()
    magic, odr, blk_bytes, max_n, range_g, lsb_ug, _ = HEADER.unpack_from(raw, 0)
    if magic != b"VIBLOG01":
        sys.exit("VIBLOG01 형식이 아닙니다")
    blk = np.dtype([("t", "<u4"), ("sensor", "u1"), ("n", "u1"), ("full", "<u2"),
                    ("s", "<i2", (max_n, 3))])
    assert blk.itemsize == blk_bytes, (blk.itemsize, blk_bytes)
    body = raw[HEADER.size:]
    nblk = len(body) // blk_bytes                # 마지막 불완전 블록은 버림
    blocks = np.frombuffer(body[: nblk * blk_bytes], dtype=blk)

    out = {}
    for k in (0, 1):
        b = blocks[blocks["sensor"] == k]
        if len(b) == 0:
            continue
        acc = np.concatenate([x["s"][: x["n"]] for x in b]).astype(float)
        acc *= lsb_ug * 1e-6                     # g
        t_blk = np.cumsum(np.diff(b["t"].astype(np.int64) & 0xFFFFFFFF, prepend=b["t"][0]) % 2**32) * 1e-6
        counts = b["n"].astype(int)
        # 블록 시각은 읽기 시점이므로, 전체 샘플 수/전체 경과시간으로 실제 fs 추정
        # (ADXL345 내부 클럭 오차 때문에 공칭 ODR과 수 % 다를 수 있음)
        span = t_blk[-1] - t_blk[0]
        fs = (counts[1:].sum() / span) if span > 0 else float(odr)
        out[k] = dict(acc=acc, fs=fs, full=int(b["full"][-1]), nblk=len(b))
    return odr, out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--out", default=None)
    ap.add_argument("--nperseg", type=int, default=4096)
    ap.add_argument("--rpm", type=float, default=None, help="프롭 회전수. 1P/BPF 고조파 표시")
    ap.add_argument("--blades", type=int, default=3)
    a = ap.parse_args()
    odr, d = load(a.file)
    outdir = Path(a.out or Path(a.file).with_suffix(""))
    outdir.mkdir(parents=True, exist_ok=True)

    for k, v in d.items():
        n = len(v["acc"])
        print(f"센서{k+1}: {n}샘플, 실제 fs={v['fs']:.1f} Hz (공칭 {odr}), "
              f"FIFO 가득참 {v['full']}회, 길이 {n / v['fs']:.1f} s")
        t = np.arange(n) / v["fs"]
        np.savetxt(outdir / f"sensor{k+1}.csv", np.column_stack([t, v["acc"] * G]),
                   delimiter=",", header="t_s,x_mps2,y_mps2,z_mps2", comments="", fmt="%.5f")

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(2 if len(d) == 2 else 1, 1, figsize=(9, 7), squeeze=False)
    ax = ax[:, 0]
    psd = {}
    for k, v in d.items():
        for c, name in enumerate("XYZ"):
            x = signal.detrend(v["acc"][:, c])
            f, p = signal.welch(x, v["fs"], nperseg=min(a.nperseg, len(x)), window="hann")
            psd[(k, c)] = (f, p)
            ax[0].semilogy(f, p, label=f"S{k+1} {name}", lw=1)
    marks = []
    if a.rpm:
        f1p = a.rpm / 60
        marks = [(f1p * m, f"{m}P" if m % a.blades else f"{m // a.blades}xBPF") for m in range(1, 3 * a.blades + 1)
                 if m % a.blades == 0 or m <= 2]
    for axx in ax:
        for fm, lab in marks:
            axx.axvline(fm, color="gray", ls="--", lw=.6)
            axx.text(fm, 1, lab, transform=axx.get_xaxis_transform(), fontsize=7, va="top", rotation=90)
    ax[0].set(xlabel="Hz", ylabel="PSD [g²/Hz]", title="Acceleration PSD")
    ax[0].legend(ncol=3); ax[0].grid(True, which="both", alpha=.3)

    if len(d) == 2:
        for c, name in enumerate("XYZ"):
            x1 = signal.detrend(d[0]["acc"][:, c]); x2 = signal.detrend(d[1]["acc"][:, c])
            f1, p1 = psd[(0, c)]; f2, p2 = psd[(1, c)]
            p2i = np.interp(f1, f2, p2)
            ax[1].semilogy(f1, np.sqrt(p2i / np.maximum(p1, 1e-18)), label=name, lw=1)
        ax[1].set(xlabel="Hz", ylabel="|S2/S1|", title="Transmissibility (>1 = amplified)")
        ax[1].axhline(1, color="k", lw=.5); ax[1].legend(); ax[1].grid(True, which="both", alpha=.3)
    fig.tight_layout()
    fig.savefig(outdir / "psd.png", dpi=130)

    fig2, axs = plt.subplots(len(d), 1, figsize=(9, 3.5 * len(d)), squeeze=False, sharex=True)
    for row, (k, v) in enumerate(d.items()):
        x = signal.detrend(v["acc"][:, 2])
        f, tt, S = signal.spectrogram(x, v["fs"], nperseg=1024, noverlap=768)
        im = axs[row, 0].pcolormesh(tt, f, 10 * np.log10(S + 1e-12), shading="auto")
        axs[row, 0].set(ylabel=f"S{k+1} Z  Hz", title=f"Spectrogram S{k+1} Z [dB g²/Hz]")
        for fm, _ in marks:
            axs[row, 0].axhline(fm, color="w", ls="--", lw=.5)
        fig2.colorbar(im, ax=axs[row, 0])
    axs[-1, 0].set_xlabel("s")
    fig2.tight_layout()
    fig2.savefig(outdir / "spectrogram.png", dpi=130)
    print("저장:", outdir)


if __name__ == "__main__":
    main()
