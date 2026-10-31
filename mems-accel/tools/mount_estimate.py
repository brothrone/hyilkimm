#!/usr/bin/env python3
"""TPU 막대 마운트의 고유진동수와 전달률을 FEA 전에 대략 추정한다.

모델: 유닛 하나 = 중간 절점에서 만나는 아래 3개 + 위 3개 막대(대칭 삼각대 2개 직렬).
  막대는 축강성 EA/L 만 가진 핀 접합 트러스(굽힘 무시 → 실제보다 약간 부드럽게 나옴).
  판과 카메라는 강체, 카메라는 질량과 관성모멘트만 반영, 6자유도 고유치 해석.

사용: python3 mount_estimate.py [--E 26] [--nx 5] [--ny 3] [--angle 60]
      --angle 은 막대와 판(수평) 사이 각도.
"""
import argparse
import numpy as np
from scipy.linalg import eigh

G = 9.80665


def unit_stiffness(E, d, H, plate, theta_deg):
    """유닛 1개의 3x3 병진 강성 [N/m]. 직렬 두 삼각대이므로 한 삼각대의 절반."""
    gap = H - 2 * plate                       # 두 판 사이 [mm]
    h = gap / 2                               # 삼각대 높이
    th = np.radians(theta_deg)
    L = h / np.sin(th)                        # 막대 길이
    k = E * (np.pi * d**2 / 4) / L * 1e3      # N/mm → N/m  (E[MPa]=N/mm²)
    kz = 3 * k * np.sin(th) ** 2
    kxy = 1.5 * k * np.cos(th) ** 2
    return np.diag([kxy, kxy, kz]) / 2, L, gap


def build(args, d, H):
    Ku, L, gap = unit_stiffness(args.E, d, H, args.plate, args.angle)
    m = args.mass
    a, b, c = args.cam                         # 카메라 상자 X, Y, Z [mm]
    I = m / 12 * np.array([b**2 + c**2, a**2 + c**2, a**2 + b**2]) * 1e-6
    M = np.diag([m, m, m, *I])
    zc = -(args.plate + c / 2) * 1e-3          # 부착점은 CG보다 이만큼 아래 (CG 기준 z 좌표)
    xs = (np.arange(args.nx) - (args.nx - 1) / 2) * args.px * 1e-3
    ys = (np.arange(args.ny) - (args.ny - 1) / 2) * args.py * 1e-3
    if getattr(args, "cradle", False):         # 카메라 양 옆면, CG 높이에 유닛 부착 (유닛 축 = Y)
        kxy, kz = Ku[0, 0], Ku[2, 2]
        sites = [(np.array([x, s * args.py * 0.5e-3, 0.0]), np.diag([kxy, kz, kxy]))
                 for x in xs for s in (-1, 1)]
    else:
        sites = [(np.array([x, y, zc]), Ku) for x in xs for y in ys]
    K = np.zeros((6, 6))
    Kb = np.zeros((6, 3))                      # 기초 병진 변위 → 카메라 CG에 가해지는 힘/모멘트
    for r, Kl in sites:                        # r: CG → 부착점
        S = np.array([[0, -r[2], r[1]], [r[2], 0, -r[0]], [-r[1], r[0], 0]])
        B = np.hstack([np.eye(3), -S])         # 부착점 변위 = u + θ x r
        K += B.T @ Kl @ B
        Kb += B.T @ Kl
    return M, K, Kb, L, gap


def modes(M, K):
    w2, V = eigh(K, M)
    out = []
    for i in range(6):
        v = V[:, i] * np.sqrt(np.diag(M))      # 질량 가중 후 지배 자유도 판별
        out.append((np.sqrt(max(w2[i], 0)) / (2 * np.pi), "XYZ"[int(np.argmax(np.abs(v[:3])))]
                    if np.argmax(np.abs(v)) < 3 else "rX rY rZ".split()[int(np.argmax(np.abs(v))) - 3]))
    return sorted(out)


def transmissibility(M, K, Kb, f, eta):
    w = 2 * np.pi * f
    A = K * (1 + 1j * eta) - w**2 * M
    u = np.linalg.solve(A, Kb)                 # 열 j = j방향 기초 변위
    return [abs(u[j, j]) for j in range(3)]    # 카메라 CG 병진 가속도 / 기초 가속도


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--E", type=float, default=26.0, help="TPU 동적 영률 [MPa] (실측 필요)")
    ap.add_argument("--mass", type=float, default=0.109)
    ap.add_argument("--cam", type=float, nargs=3, default=[55, 55, 70])
    ap.add_argument("--plate", type=float, default=1.5)
    ap.add_argument("--nx", type=int, default=5)
    ap.add_argument("--ny", type=int, default=3)
    ap.add_argument("--px", type=float, default=None, help="X 유닛 간격 [mm], 기본 61/nx")
    ap.add_argument("--py", type=float, default=None, help="Y 유닛 간격 [mm], 기본 43/ny")
    ap.add_argument("--angle", type=float, default=60.0)
    ap.add_argument("--eta", type=float, default=0.15, help="TPU 손실계수(감쇠)")
    ap.add_argument("--rpm", type=float, default=10000)
    ap.add_argument("--blades", type=int, default=3)
    a = ap.parse_args()
    a.px = a.px or 61 / a.nx
    a.py = a.py or 43 / a.ny
    f1p = a.rpm / 60
    fs = [("1P", f1p), ("BPF", f1p * a.blades), ("2xBPF", 2 * f1p * a.blades)]
    print(f"E={a.E} MPa, 카메라 {a.mass*1e3:.0f} g, 유닛 {a.nx}x{a.ny}, 막대각 {a.angle}°(수평 기준), η={a.eta}")
    print(f"가진: 1P={f1p:.0f} Hz, BPF={f1p*a.blades:.0f} Hz")
    print(f"{'H':>3} {'d':>4} {'L':>5} | 고유진동수 [Hz] (모드)                           | 전달률(X/Y/Z)  1P / BPF")
    for H in (8, 10, 12):
        for d in (1.0, 1.5, 2.0):
            M, K, Kb, L, gap = build(a, d, H)
            ms = modes(M, K)
            mtxt = " ".join(f"{f:5.0f}{n}" for f, n in ms)
            t1 = transmissibility(M, K, Kb, fs[0][1], a.eta)
            t2 = transmissibility(M, K, Kb, fs[1][1], a.eta)
            print(f"{H:>3} {d:>4} {L:5.1f} | {mtxt} | "
                  f"{t1[0]:.2f}/{t1[1]:.2f}/{t1[2]:.2f}  {t2[0]:.2f}/{t2[1]:.2f}/{t2[2]:.2f}")


if __name__ == "__main__":
    main()
