"""PolyMechanism science self-test: real CAE coupon + synthetic-data recovery for
every characterization tool. Usage: python -I src/pm_science/selftest.py <cae-root>"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pm_science.cae import run_cae, summarize  # noqa: E402
from pm_science.ftir import ftir_peak_fit  # noqa: E402
from pm_science.orientation import hermans_factor  # noqa: E402
from pm_science.relax import fit_relaxation  # noqa: E402
from pm_science.saxs import saxs_reduce  # noqa: E402
from pm_science.waxs import waxs_crystallinity  # noqa: E402


def check(results: dict[str, bool]) -> int:
    failed = [name for name, ok in results.items() if not ok]
    for name, ok in results.items():
        print(f"  [{'ok' if ok else 'FAIL'}] {name}")
    return 1 if failed else 0


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: selftest.py <cae-checkout-root>", file=sys.stderr)
        return 2
    rng = np.random.default_rng(42)
    checks: dict[str, bool] = {}

    # 1) Real CAE engine coupon.
    result = run_cae(sys.argv[1], mode="coupon", extra_args={"mesh": "4,8", "stretch-x": "1.2", "stretch-y": "1.1"})
    summary = summarize(result)
    checks["cae_coupon_converged_with_provenance"] = (
        summary["status"] == "CONVERGED"
        and summary["valid"] is True
        and isinstance(summary["sourceSha256"], str)
        and len(summary["sourceSha256"]) == 64
    )

    # 2) WAXS: synth halo+peaks, expect crystallinity near the injected area fraction.
    x = np.linspace(10.0, 35.0, 300)
    halo = 100.0 * np.exp(-((x - 20.0) ** 2) / (4.0 * 5.0**2))
    peak = 60.0 * np.exp(-((x - 22.5) ** 2) / (4.0 * 1.0**2))
    y = halo + peak + rng.normal(0, 1.0, x.size)
    waxs = waxs_crystallinity(x, y)
    peak_centers = [float(p["center2Theta"]) for p in waxs["peaks"]]
    checks["waxs_crystallinity_recovered"] = (
        waxs["status"] == "CONVERGED"
        and isinstance(waxs["crystallinityIndex"], float)
        and 0.05 < float(waxs["crystallinityIndex"]) < 0.25
        and float(waxs["fit"]["r2"]) > 0.95
        and any(abs(center - 22.5) < 0.2 for center in peak_centers)
    )

    # 3) FTIR: synth peaks incl. O-H band; expect hbondIndex > carbonylIndex=0.
    w = np.linspace(800.0, 3800.0, 900)
    spec = (
        0.8 * np.exp(-((w - 3330.0) ** 2) / (4.0 * 120.0**2))
        + 0.5 * np.exp(-((w - 2940.0) ** 2) / (4.0 * 60.0**2))
        + 0.3 * np.exp(-((w - 1090.0) ** 2) / (4.0 * 80.0**2))
        + 0.05 * w / 3800.0
        + rng.normal(0, 0.005, w.size)
    )
    ftir = ftir_peak_fit(w, spec, peak_centers_guess=(3330.0, 2940.0, 1090.0))
    checks["ftir_hbond_detected_carbonyl_absent"] = (
        ftir["status"] == "CONVERGED"
        and float(ftir["hbondIndex"]) > 0.0
        and float(ftir["carbonylIndex"]) < 0.2 * float(ftir["hbondIndex"])
        and float(ftir["fit"]["r2"]) > 0.9
    )

    # 4) Hermans: strongly aligned Lorentzian around 0° → f close to +1 is
    # impossible for a broad scan; check the sign and range instead.
    phi = np.linspace(0.0, 180.0, 181)
    inten = 1.0 / ((phi - 0.0) ** 2 + 25.0) + 1.0 / ((phi - 180.0) ** 2 + 25.0)
    orient = hermans_factor(phi, inten)
    factor = orient["hermansFactor"]
    checks["hermans_factor_positive_and_bounded"] = (
        orient["status"] == "CONVERGED"
        and isinstance(factor, float)
        and 0.0 < factor <= 1.0
    )

    # 5) SAXS: power law I(q)=A·q^-3 + Guinier shoulder → slope ≈ -3.
    q = np.logspace(np.log10(0.01), np.log10(0.5), 60)
    i = 1e-2 * q ** (-3.0) + 1e-6
    saxs = saxs_reduce(q, i)
    slope = saxs["porod"]["slope"]
    checks["saxs_porod_slope_near_minus3"] = (
        saxs["status"] == "CONVERGED"
        and isinstance(slope, float)
        and -4.0 < slope < -2.0
    )

    # 6) KWW recovery: τ=40s, β=0.6 → recovered within tolerance.
    t = np.linspace(1.0, 200.0, 120)
    sig = 100.0 * np.exp(-np.power(t / 40.0, 0.6))
    relax = fit_relaxation(t, sig, model="kww")
    params = relax["params"]
    checks["kww_params_recovered"] = (
        relax["status"] == "CONVERGED"
        and abs(float(params["tau"]) - 40.0) / 40.0 < 0.15
        and abs(float(params["beta"]) - 0.6) < 0.1
        and float(relax["fit"]["r2"]) > 0.99
    )

    print(json.dumps({"summary": {k: bool(v) for k, v in checks.items()}}, ensure_ascii=False))
    return check(checks)


if __name__ == "__main__":
    raise SystemExit(main())
