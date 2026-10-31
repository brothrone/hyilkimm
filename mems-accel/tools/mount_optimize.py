#!/usr/bin/env python3
"""운용 RPM 범위에 맞춰 TPU 막대 마운트(2x2 또는 3x2 유닛) 후보를 탐색한다.

1) 스로틀 → RPM 추정: 모터 전압 ≈ 스로틀 x 배터리 전압, 프롭 토크 ∝ RPM² 이므로 전류 강하도 RPM²에 비례.
   RPM = KV·V·t − δ·(RPM/RPM_full)²,  δ = KV·V − RPM_full   (모터 KV·V = 무부하 RPM)
2) 후보 평가: E(영률) 불확실성(15/26/40 MPa)에서 순항 1P 주파수와 이착륙 1P에서의
   카메라 CG 및 상단 점 전달률(병진+회전 연성)의 최악값으로 점수를 매긴다.

사용: python3 mount_optimize.py [--rpm-full 10000] [--throttle 0.4] [--hmax 12]
"""
import argparse
import itertools
import numpy as np
import mount_estimate as me


def rpm_at(throttle, rpm_full, no_load):
    """토크 ∝ RPM² 모델로 스로틀에서의 RPM 계산 (고정점 반복)."""
    delta = no_load - rpm_full
    n = throttle * no_load
    for _ in range(200):
        n = throttle * no_load - delta * (n / rpm_full) ** 2
    return n


def response(M, K, Kb, f, eta, rP):
    """기초 병진 1 단위 → 상단 점 rP[m]의 변위 노름 (3개 가진 방향 각각)."""
    w = 2 * np.pi * f
    u = np.linalg.solve(K * (1 + 1j * eta) - w**2 * M, Kb)     # 6x3
    out = []
    for j in range(3):
        th = u[3:, j]
        p = u[:3, j] + np.cross(th, rP)
        out.append(np.linalg.norm(p))
    return max(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rpm-full", type=float, default=10000)
    ap.add_argument("--throttle", type=float, default=0.4)
    ap.add_argument("--kv", type=float, default=900)
    ap.add_argument("--blades", type=int, default=3)
    ap.add_argument("--cells", type=int, nargs="+", default=[4, 6], help="배터리 셀 수(3.7 V/셀 공칭)")
    ap.add_argument("--elo", type=float, default=18, help="영률 하한 [MPa]")
    ap.add_argument("--ehi", type=float, default=34, help="영률 상한 [MPa]")
    ap.add_argument("--fmin", type=float, default=12, help="E=15 MPa 일 때 최저 모드 하한 [Hz] (기동 시 처짐 제한)")
    ap.add_argument("--fmax", type=float, default=50, help="E=40 MPa 일 때 최고 모드 상한 [Hz]")
    ap.add_argument("--cradle", action="store_true", help="유닛을 카메라 양 옆면 CG 높이에 부착하는 구조(PY=두 면 사이 간격)")
    ap.add_argument("--dmin", type=float, default=0.8, help="출력 가능한 최소 막대 지름 [mm]")
    ap.add_argument("--eval", type=float, nargs=7, metavar=("NX","NY","PX","PY","ANGLE","D","H"),
                    help="지정한 설계 하나를 E 하한/26/상한에서 상세 평가")
    ap.add_argument("--eta", type=float, default=0.15)
    ap.add_argument("--hmax", type=float, default=12)
    ap.add_argument("--top", type=int, default=8)
    a = ap.parse_args()

    print("== 스로틀 → RPM 추정 (풀스로틀 %.0f RPM) ==" % a.rpm_full)
    cases = {}
    for cells in a.cells:
        n0 = a.kv * 3.7 * cells
        if n0 <= a.rpm_full:
            continue
        n = rpm_at(a.throttle, a.rpm_full, n0)
        cases[cells] = n
        print(f"  {cells}S (무부하 {n0:.0f} RPM): {a.throttle*100:.0f}% → {n:.0f} RPM (1P {n/60:.0f} Hz, BPF {n/60*a.blades:.0f} Hz)")
    lin = a.throttle * a.rpm_full
    print(f"  선형 가정: {lin:.0f} RPM (1P {lin/60:.0f} Hz)")
    cruise = [lin, max(cases.values()) if cases else lin]
    f_cruise = [r / 60 for r in cruise]                       # 순항 1P 범위
    f_climb = a.rpm_full / 60
    print(f"  → 순항 1P ≈ {f_cruise[0]:.0f}~{f_cruise[1]:.0f} Hz, 이착륙 최대 1P ≈ {f_climb:.0f} Hz\n")

    check_f = sorted(set([round(x) for x in f_cruise] + [round(x * a.blades) for x in f_cruise] + [round(f_climb)]))
    rP = np.array([0, 0, 35e-3])                              # 카메라 상단 중앙 (CG 기준)
    if a.eval:
        nx, ny, px, py, ang, d, H = a.eval
        print(f"== 상세 평가: {int(nx)}x{int(ny)} 간격 {px:g}x{py:g} mm, {ang:g}°, d={d:g}, H={H:g}, {'cradle' if a.cradle else '카메라 아래 판'} ==")
        fl = sorted(set(round(x) for x in (f_cruise[0], f_cruise[1], 3 * f_cruise[0], 3 * f_cruise[1], f_climb, 3 * f_climb)))
        print("  E[MPa] | 모드 [Hz] | 상단점 전달률(" + ", ".join(f"{f}Hz" for f in fl) + ") | 1g 정적 처짐")
        for E in (a.elo, 26, a.ehi):
            args = argparse.Namespace(E=E, mass=0.109, cam=[55, 55, 70], plate=1.5, nx=int(nx), ny=int(ny),
                                      px=px, py=py, angle=ang, cradle=a.cradle)
            M, K, Kb, L, gap = me.build(args, d, H)
            ms = me.modes(M, K)
            tr = [response(M, K, Kb, f, a.eta, np.array([0, 0, 35e-3])) for f in fl]
            sag = 9.80665 / (2 * np.pi * ms[0][0]) ** 2 * 1e3
            print(f"  {E:>5g}  | " + " ".join(f"{f:.0f}{n}" for f, n in ms) + " | " + " ".join(f"{t:.2f}" for t in tr) + f" | {sag:.1f} mm")
        return

    rows = []
    for (nx, ny), ang, d, H, px, py in itertools.product(
            [(2, 2), (3, 2)], (20, 25, 30, 35, 40, 45, 50, 60), [x for x in (0.8, 1.0, 1.2, 1.5, 2.0) if x >= a.dmin],
            [h for h in (8, 10, 12, 14, 16, 18, 20) if h <= a.hmax], (30, 36, 42, 48), ((58, 64) if a.cradle else (20, 26, 32, 38))):
        if nx == 3 and px > 30:
            continue
        _, L, gap = me.unit_stiffness(26, d, H, 1.5, ang)
        reach = L * np.cos(np.radians(ang))
        if not a.cradle and ((nx - 1) * px / 2 + reach + d / 2 > 30.5 or (ny - 1) * py / 2 + reach + d / 2 > 21.5):
            continue                                          # 판(61x43) 밖으로 나감
        worst, nom = 0.0, None
        ok = True
        for E in (a.elo, 26, a.ehi):
            args = argparse.Namespace(E=E, mass=0.109, cam=[55, 55, 70], plate=1.5, nx=nx, ny=ny,
                                      px=px, py=py, angle=ang, cradle=a.cradle)
            M, K, Kb, _, _ = me.build(args, d, H)
            ms = me.modes(M, K)
            fmin, fmax = ms[0][0], ms[-1][0]
            if (E == a.elo and fmin < a.fmin) or (E == a.ehi and fmax > a.fmax):
                ok = False
                break
            for f in check_f:
                worst = max(worst, response(M, K, Kb, f, a.eta, rP))
            if E == 26:
                nom = ms
        if ok:
            rows.append((worst, nx, ny, ang, d, H, px, py, L, nom))
    rows.sort(key=lambda r: r[0])
    print(f"조건 만족 후보 {len(rows)}개 (E={a.elo:g}에서 최저 모드 ≥{a.fmin:g} Hz, E={a.ehi:g}에서 최고 모드 ≤{a.fmax:g} Hz, 점수=최악 전달률)")
    print(" 점수  유닛 각도  d    H   간격XxY   L   | E=26 모드 [Hz]")
    for r in rows[:a.top]:
        print(f"{r[0]:5.2f}  {r[1]}x{r[2]}  {r[3]:>3}° {r[4]:.1f} {r[5]:>3}  {r[6]:>3}x{r[7]:<3} {r[8]:4.1f} | "
              + " ".join(f"{f:.0f}{n}" for f, n in r[9]))


if __name__ == "__main__":
    main()
