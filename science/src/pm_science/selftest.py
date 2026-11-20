"""PolyMechanism science self-test: truth-recovery checks for every analysis
and simulation module. Usage: python -I src/pm_science/selftest.py"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pm_science.avrami import avrami_fit, avrami_predict  # noqa: E402
from pm_science.chain_mech import chain_mechanics, kbt_pn_nm  # noqa: E402
from pm_science.chain_stats import chain_stats  # noqa: E402
from pm_science.diffusion import arrhenius_fit, vrentas_duda  # noqa: E402
from pm_science.flory import critical_point, flory_huggins, spinodal_chi  # noqa: E402
from pm_science.md import build_deck, parse_pm_results, parse_rg_file, parse_thermo  # noqa: E402
from pm_science.ftir import ftir_peak_fit  # noqa: E402
from pm_science.orientation import hermans_factor  # noqa: E402
from pm_science.relax import fit_relaxation  # noqa: E402
from pm_science.rubber import (  # noqa: E402
    neo_hookean_work,
    nominal_stress_uniaxial,
    rubber_elasticity,
    work_density_uniaxial,
)
from pm_science.saxs import saxs_reduce  # noqa: E402
from pm_science.tg_blend import fox_flory_fit, gordon_taylor  # noqa: E402
from pm_science.viscoelastic import rouse_spectrum, shift_factors  # noqa: E402
from pm_science.waxs import waxs_crystallinity  # noqa: E402


def check(results: dict[str, bool]) -> int:
    failed = [name for name, ok in results.items() if not ok]
    for name, ok in results.items():
        print(f"  [{'ok' if ok else 'FAIL'}] {name}")
    return 1 if failed else 0


def main() -> int:
    if len(sys.argv) > 1:
        print("usage: python -I src/pm_science/selftest.py (no arguments)", file=sys.stderr)
        return 2
    rng = np.random.default_rng(42)
    checks: dict[str, bool] = {}

    # 1) WAXS: synth halo+peaks, expect crystallinity near the injected area fraction.
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

    # 2) FTIR: synth peaks incl. O-H band; expect hbondIndex > carbonylIndex=0.
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

    # 3) Hermans: strongly aligned Lorentzian around 0°.
    phi = np.linspace(0.0, 180.0, 181)
    inten = 1.0 / ((phi - 0.0) ** 2 + 25.0) + 1.0 / ((phi - 180.0) ** 2 + 25.0)
    orient = hermans_factor(phi, inten)
    factor = orient["hermansFactor"]
    checks["hermans_factor_positive_and_bounded"] = (
        orient["status"] == "CONVERGED"
        and isinstance(factor, float)
        and 0.0 < factor <= 1.0
    )

    # 4) SAXS: power law I(q)=A·q^-3 + Guinier shoulder → slope ≈ -3.
    q = np.logspace(np.log10(0.01), np.log10(0.5), 60)
    i = 1e-2 * q ** (-3.0) + 1e-6
    saxs = saxs_reduce(q, i)
    slope = saxs["porod"]["slope"]
    checks["saxs_porod_slope_near_minus3"] = (
        saxs["status"] == "CONVERGED"
        and isinstance(slope, float)
        and -4.0 < slope < -2.0
    )

    # 5) KWW recovery: τ=40s, β=0.6 → recovered within tolerance.
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

    # 6) FJC exact extension: f = kBT/b → y=1 → x/Nb = coth(1) − 1 = 0.313036.
    kbt = kbt_pn_nm(300.0)
    fjc = chain_mechanics("fjc", 100.0, 300.0, segment_nm=1.0, probe_force_pn=kbt)
    checks["fjc_extension_exact_at_unit_force"] = (
        fjc["status"] == "OK"
        and abs(float(fjc["probe"]["extensionNm"]) / 100.0 - (1.0 / math.tanh(1.0) - 1.0)) < 1e-3
    )

    # 7) WLC Marko–Siggia truth: x/L=0.5, p=1 nm, T=300 K → f = 1.25·kBT/p.
    wlc = chain_mechanics("wlc", 100.0, 300.0, persistence_nm=1.0, probe_extension_nm=50.0)
    checks["wlc_force_exact_half_extension"] = (
        wlc["status"] == "OK"
        and abs(float(wlc["probe"]["forcePn"]) - 1.25 * kbt) / (1.25 * kbt) < 1e-6
    )

    # 8) 8-chain neo-Hookean limit: N=10⁶ → P(λ=2) ≈ μ(λ−λ⁻²) = 1.75μ; W ≈ 1.0μ.
    p_8chain = nominal_stress_uniaxial(1.0, 1_000_000, 2.0)
    w_8chain = work_density_uniaxial(1.0, 1_000_000, 2.0)
    checks["rubber_neo_hookean_limit"] = (
        abs(p_8chain - 1.75) / 1.75 < 0.005
        and abs(w_8chain - neo_hookean_work(1.0, 2.0)) / neo_hookean_work(1.0, 2.0) < 0.01
    )

    # 9) Rubber tool report: path is monotonic and energy grows with stretch.
    report = rubber_elasticity("uniaxial", 1.0, 200, stretch_x=2.0, max_stretch=2.0)
    stresses = report["path"]["sigmaXMPa"]
    checks["rubber_report_monotonic_stress"] = (
        report["status"] == "OK"
        and all(b >= a for a, b in zip(stresses, stresses[1:]))
        and float(report["workPerVolMPa"]) > float(report["path"]["sigmaXMPa"][0])
    )

    # 10) Rouse: G(0)=νkBT exactly; τp = τ₁/p² exactly.
    chain_density = 1.0e24  # chains per m³ (CG scale)
    rouse = rouse_spectrum(100, 1.5, 3.0e-3, chain_density, 400.0)
    thermal_pa = 1.380649e-23 * 400.0 * chain_density
    tau1 = rouse["tau1S"]
    checks["rouse_front_factor_and_spectrum"] = (
        rouse["status"] == "OK"
        and abs(float(rouse["G0Pa"]) - thermal_pa) / thermal_pa < 1e-9
        and abs(float(rouse["tauModesS"][3]) - tau1 / 16.0) / tau1 < 1e-9
    )

    # 11) WLF universal constants at T = Tg+10 K → a_T = 10^(−17.44·10/61.6).
    shift = shift_factors("wlf", 350.0, [360.0])
    expected_log = -17.44 * 10.0 / (51.6 + 10.0)
    checks["wlf_universal_shift_value"] = (
        shift["status"] == "OK"
        and abs(float(shift["shift"]["log10aT"][0]) - expected_log) < 1e-9
    )

    # 12) Affine orientation truth: uniaxial λ=2 → f = 0.7 exactly.
    stats = chain_stats(100, 1.0, stretch_x=2.0)
    checks["affine_orientation_uniaxial_lambda2"] = (
        stats["status"] == "OK"
        and abs(float(stats["orientation"]["orientationF"]) - 0.7) < 1e-9
        and abs(float(stats["size"]["radiusOfGyrationNm"]) - math.sqrt(100.0 / 6.0)) < 1e-9
    )

    # 13) Avrami recovery: n=3, K=1e−3 → exact on noise-free data.
    t_avr = np.linspace(5.0, 100.0, 80)
    x_avr = 1.0 - np.exp(-1e-3 * t_avr**3)
    avr = avrami_fit(t_avr, x_avr)
    pred = avrami_predict(3.0, 1e-3, [10.0, 50.0])
    checks["avrami_params_recovered"] = (
        avr["status"] == "OK"
        and abs(float(avr["n"]) - 3.0) < 0.02
        and abs(float(avr["K"]) - 1e-3) / 1e-3 < 0.05
        and abs(float(pred["crystallinity"][1]) - (1.0 - math.exp(-1e-3 * 50.0**3))) < 1e-12
    )

    # 14) Flory–Huggins symmetric critical point: N=100 → φc=0.5, χc=0.02.
    crit = critical_point(100, 100)
    blend = flory_huggins(100, 100, chi=0.01, phi=0.5)
    checks["flory_critical_and_stable"] = (
        abs(crit["phiCritical"] - 0.5) < 1e-12
        and abs(crit["chiCritical"] - 0.02) < 1e-12
        and blend["verdict"] == "STABLE_SINGLE_PHASE"
        and abs(float(blend["spinodalChi"]) - 0.02) < 1e-12
    )

    # 15) Gordon–Taylor truth: w=0.5/0.5, Tg 350/450, k=1 → 400 K; Fox–Flory recovery.
    gt = gordon_taylor(0.5, 350.0, 0.5, 450.0)
    masses = [10_000.0, 30_000.0, 100_000.0, 300_000.0]
    tgs = [float(460.0 - 250_000.0 / m) for m in masses]
    ff = fox_flory_fit(masses, tgs)
    checks["tg_models_recovered"] = (
        gt["status"] == "OK"
        and abs(float(gt["TgBlendK"]) - 400.0) < 1e-9
        and ff["status"] == "OK"
        and abs(float(ff["TgInfinityK"]) - 460.0) < 0.5
        and abs(float(ff["K"]) - 250_000.0) / 250_000.0 < 0.02
    )

    # 16) Diffusion: Arrhenius recovery (Ea = 40 kJ/mol); Vrentas–Duda hand value.
    temps_d = np.linspace(280.0, 360.0, 8)
    d_truth = 2.0e-9 * np.exp(-40_000.0 / (8.314462618 * temps_d))
    arr = arrhenius_fit(temps_d, d_truth)
    vd = vrentas_duda(
        d0=1.0e-8,
        activation_j_per_mol=20_000.0,
        omega1=0.1,
        v1_star=1.0,
        k11=0.0084,
        k21_k=-144.0,
        tg1_k=130.0,
        k12=0.00093,
        k22_k=43.4,
        tg2_k=350.0,
        temperature_k=298.15,
    )
    fh_expected = (
        0.0084 * 0.1 * (-144.0 + 298.15 - 130.0)
        + 0.00093 * 0.9 * (43.4 + 298.15 - 350.0)
    )
    d_expected = 1.0e-8 * math.exp(-20_000.0 / (8.314462618 * 298.15)) * math.exp(-0.1 * 1.0 / fh_expected)
    checks["diffusion_arrhenius_and_vrentas_duda"] = (
        arr["status"] == "OK"
        and abs(float(arr["EaJPerMol"]) - 40_000.0) / 40_000.0 < 0.001
        and vd["status"] == "OK"
        and abs(float(vd["D1"]) - d_expected) / d_expected < 1e-9
        and abs(float(vd["freeVolumeOverGamma"]) - fh_expected) < 1e-12
    )

    md_checks(checks)

    exit_code = check(checks)
    print(json.dumps({"summary": {k: bool(v) for k, v in checks.items()}}, ensure_ascii=False))
    return exit_code


def md_checks(checks: dict[str, bool]) -> None:
    """Deck-generation and parser truth checks (no LAMMPS binary needed)."""
    deck = build_deck("equilibrate", 20, 64)
    deck_deform = build_deck("deform", 20, 64, stretch=1.8)
    deck_cool = build_deck("cool", 20, 64, final_temperature=0.1)
    checks["md_deck_structure"] = (
        "fene/standard" in deck
        and "lj/cut 1.1224620483" in deck
        and "read_data" in deck
        and "fix deflect" not in deck
        and "fix deflect" in deck_deform
        and deck.count("fix integr all nvt temp") == 1
        and deck_cool.count("fix integr all nvt temp") == 1
        and deck_cool.splitlines()[-1] == 'print "PM_RESULT job=cool"'
    )
    from pm_science.md import build_data_file

    data_file = build_data_file(20, 64, 0.85)
    atom_rows = [line for line in data_file.split("Atoms # molecular", 1)[1].split("Bonds", 1)[0].strip().splitlines() if line.strip()]
    bond_rows = [line for line in data_file.split("Bonds", 1)[1].strip().splitlines() if line.strip()]
    checks["md_data_file_counts"] = (
        len(atom_rows) == 64 * 20
        and len(bond_rows) == 64 * 19
        and "1216 bonds" in data_file
    )
    stdout = (
        "Step Temp Press PotEng TotEng\n"
        "0 1.0 -10.0 -2000.0 -2000.0\n"
        "1000 1.0 -5.0 -1500.0 -1500.0\n"
        "Loop time of 1.0 on 1 procs\n"
        'print "PM_RESULT job=equilibrate rg=1.23"\n'
        "PM_RESULT job=equilibrate rg=1.23\n"
    )
    parsed = parse_pm_results(stdout)
    thermo = parse_thermo(stdout)
    checks["md_parsers_extract_truth"] = (
        parsed == {"job": "equilibrate", "rg": "1.23"}
        and len(thermo) == 2
        and thermo[-1]["Step"] == 1000.0
        and thermo[-1]["Temp"] == 1.0
    )
    rg = parse_rg_file("# Time-averaged data for fix rgfile\n# TimeStep nchunks c_rgt\n1000 64 1.20 1.25\n2000 64 1.30 1.35\n")
    checks["md_rg_file_mean"] = abs(rg - (1.20 + 1.25 + 1.30 + 1.35) / 4.0) < 1e-12


if __name__ == "__main__":
    raise SystemExit(main())
