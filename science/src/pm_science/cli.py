"""JSON stdin/stdout bridge for the Host's pm-science tools.

The Host spawns this script with the science virtualenv interpreter and sends
one request, so no FastMCP process has to stay alive:

    {"tool": "waxs", "args": {"twoTheta": [...], "intensity": [...]}}

It answers with ``{"ok": true, "data": {...}}`` or a structured error. Input
arrays are produced by the Host from workspace CSV files.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# ``-I`` keeps the script directory off sys.path; add the package root.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Windows consoles default to GBK; the Host always speaks UTF-8 JSON.
if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import numpy as np  # noqa: E402


def _array(value: object) -> np.ndarray:
    return np.asarray(value, dtype=float)


def _waxs(args: dict[str, object]) -> dict[str, object]:
    from pm_science.waxs import waxs_crystallinity

    centers = args.get("peakCenters") or [22.5]
    return waxs_crystallinity(
        _array(args["twoTheta"]),
        _array(args["intensity"]),
        halo_center_guess=float(args.get("haloCenter", 20.0)),
        peak_centers_guess=tuple(float(value) for value in centers),
        halo_width_guess=float(args.get("haloWidth", 5.0)),
        peak_width_guess=float(args.get("peakWidth", 1.2)),
    )


def _ftir(args: dict[str, object]) -> dict[str, object]:
    from pm_science.ftir import ftir_peak_fit

    centers = args.get("peakCenters") or [3330.0, 2940.0, 1420.0, 1090.0]
    return ftir_peak_fit(
        _array(args["wavenumber"]),
        _array(args["absorbance"]),
        peak_centers_guess=tuple(float(value) for value in centers),
    )


def _saxs(args: dict[str, object]) -> dict[str, object]:
    from pm_science.saxs import saxs_reduce

    background = args.get("background")
    return saxs_reduce(
        _array(args["q"]),
        _array(args["intensity"]),
        None if background is None else _array(background),
    )


def _hermans(args: dict[str, object]) -> dict[str, object]:
    from pm_science.orientation import hermans_factor

    return hermans_factor(
        _array(args["azimuth"]),
        _array(args["intensity"]),
        baseline=float(args.get("baseline", 0.0)),
    )


def _relax(args: dict[str, object]) -> dict[str, object]:
    from pm_science.relax import fit_relaxation

    return fit_relaxation(
        _array(args["time"]),
        _array(args["signal"]),
        model=str(args.get("model", "kww")),
    )


def _literature_read(args: dict[str, object]) -> dict[str, object]:
    from pypdf import PdfReader

    path = Path(str(args["path"]))
    max_chars = int(args.get("maxChars", 16000))
    reader = PdfReader(str(path))
    passages: list[str] = []
    for page in reader.pages:
        try:
            passages.append(page.extract_text() or "")
        except Exception:  # noqa: BLE001 - a damaged page must not kill the read
            passages.append("")
    text = "\n".join(passages).strip()
    meta = reader.metadata or {}
    title = meta.get("/Title") if hasattr(meta, "get") else None
    author = meta.get("/Author") if hasattr(meta, "get") else None
    return {
        "status": "OK",
        "path": str(path),
        "pages": len(reader.pages),
        "title": str(title) if title else None,
        "author": str(author) if author else None,
        "chars": len(text),
        "truncated": len(text) > max_chars,
        "text": text[:max_chars],
    }


def _literature_search(args: dict[str, object]) -> dict[str, object]:
    from pm_science.litsearch import search_works

    return search_works(dict(args))


def _literature_download(args: dict[str, object]) -> dict[str, object]:
    from pm_science.litsearch import download_doi

    return download_doi(dict(args))


def _literature_browser_download(args: dict[str, object]) -> dict[str, object]:
    from pm_science.litbrowser import download_via_browser

    return download_via_browser(dict(args))


def _literature_screen(args: dict[str, object]) -> dict[str, object]:
    from pm_science.litsearch import screen_candidates

    return screen_candidates(dict(args))


def _chain_mech(args: dict[str, object]) -> dict[str, object]:
    from pm_science.chain_mech import chain_mechanics

    probe_force = args.get("probeForcePn")
    probe_extension = args.get("probeExtensionNm")
    return chain_mechanics(
        str(args["model"]),
        float(args["contourNm"]),
        float(args["temperatureK"]),
        segment_nm=float(args.get("segmentNm", 1.0)),
        persistence_nm=float(args.get("persistenceNm", 1.0)),
        probe_force_pn=None if probe_force is None else float(probe_force),
        probe_extension_nm=None if probe_extension is None else float(probe_extension),
        grid_points=int(args.get("gridPoints", 60)),
    )


def _rubber(args: dict[str, object]) -> dict[str, object]:
    from pm_science.rubber import rubber_elasticity

    return rubber_elasticity(
        str(args["mode"]),
        float(args["shearModulusMPa"]),
        int(args["linksPerChain"]),
        stretch_x=float(args.get("stretchX", 1.0)),
        stretch_y=float(args.get("stretchY", 1.0)),
        grid_points=int(args.get("gridPoints", 40)),
        max_stretch=float(args.get("maxStretch", 2.0)),
    )


def _viscoelastic(args: dict[str, object]) -> dict[str, object]:
    part = str(args["part"])
    if part == "rouse":
        from pm_science.viscoelastic import rouse_spectrum

        return rouse_spectrum(
            int(args["beadsPerChain"]),
            float(args["kuhnLengthNm"]),
            float(args["frictionPerBead"]),
            float(args["chainNumberDensity"]),
            float(args["temperatureK"]),
            modes_reported=int(args.get("modesReported", 10)),
        )
    from pm_science.viscoelastic import shift_factors

    temps = args.get("temperaturesK")
    if not isinstance(temps, list):
        raise ValueError("shift needs temperaturesK list")
    shift_model = str(args.get("shiftModel", "wlf"))
    c1 = args.get("c1")
    c2 = args.get("c2K")
    return shift_factors(
        shift_model,  # type: ignore[arg-type]
        float(args["referenceTemperatureK"]),
        [float(v) for v in temps],
        **({
            "c1": float(c1),
            "c2_k": float(c2),
        } if c1 is not None and c2 is not None else {}),
        vft_t_inf_k=None if args.get("vftTinfK") is None else float(args["vftTinfK"]),  # type: ignore[arg-type]
    )


def _chain_stats(args: dict[str, object]) -> dict[str, object]:
    from pm_science.chain_stats import chain_stats

    stretch_y = args.get("stretchY")
    stretch_z = args.get("stretchZ")
    return chain_stats(
        int(args["beadsPerChain"]),
        float(args["kuhnLengthNm"]),
        stretch_x=float(args.get("stretchX", 1.0)),
        stretch_y=None if stretch_y is None else float(stretch_y),
        stretch_z=None if stretch_z is None else float(stretch_z),
    )


def _avrami(args: dict[str, object]) -> dict[str, object]:
    from pm_science.avrami import avrami_fit, avrami_predict

    times = args.get("time")
    x = args.get("crystallinity")
    if isinstance(times, list) and isinstance(x, list):
        return avrami_fit([float(v) for v in times], [float(v) for v in x])
    exponent = args.get("n")
    rate = args.get("K")
    predict_time = args.get("predictTime")
    if exponent is None or rate is None or not isinstance(predict_time, list):
        raise ValueError("avrami needs time+crystallinity lists, or n+K+predictTime")
    return avrami_predict(float(exponent), float(rate), [float(v) for v in predict_time])


def _flory(args: dict[str, object]) -> dict[str, object]:
    from pm_science.flory import flory_huggins

    chi = args.get("chi")
    chi_a = args.get("chiA")
    chi_b = args.get("chiB")
    temperature = args.get("temperatureK")
    return flory_huggins(
        int(args["n1"]),
        int(args["n2"]),
        chi=None if chi is None else float(chi),
        chi_a=None if chi_a is None else float(chi_a),
        chi_b=float(chi_b if chi_b is not None else 0.0),
        temperature_k=None if temperature is None else float(temperature),
        phi=float(args.get("phi", 0.5)),
        phi_grid_points=int(args.get("gridPoints", 49)),
    )


def _tg_blend(args: dict[str, object]) -> dict[str, object]:
    from pm_science.tg_blend import tg_blend

    masses = args.get("molarMass")
    temps = args.get("tgK")
    return tg_blend(
        str(args["part"]),
        molar_mass=[float(v) for v in masses] if isinstance(masses, list) else None,
        tg_k=[float(v) for v in temps] if isinstance(temps, list) else None,
        tg_infinity_k=None if args.get("tgInfinityK") is None else float(args["tgInfinityK"]),
        constant_k=None if args.get("constantK") is None else float(args["constantK"]),
        predict_molar_mass=None if args.get("predictMolarMass") is None else float(args["predictMolarMass"]),
        weight1=None if args.get("weight1") is None else float(args["weight1"]),
        tg1_k=None if args.get("tg1K") is None else float(args["tg1K"]),
        weight2=None if args.get("weight2") is None else float(args["weight2"]),
        tg2_k=None if args.get("tg2K") is None else float(args["tg2K"]),
        k_constant=float(args.get("kConstant", 1.0)),
    )


def _diffusion(args: dict[str, object]) -> dict[str, object]:
    from pm_science.diffusion import diffusion as run_diffusion

    temps = args.get("temperatureK")
    diffs = args.get("diffusivity")
    if isinstance(temps, list) and isinstance(diffs, list):
        return run_diffusion("arrhenius", temperature_k=[float(v) for v in temps], diffusivity=[float(v) for v in diffs])
    fields = {
        key: args[key]
        for key in (
            "d0", "activationJPerMol", "omega1", "v1Star", "k11", "k21K", "tg1K",
            "k12", "k22K", "tg2K", "temperatureK", "gamma",
        )
        if key in args
    }
    snake = {
        "d0": "d0", "activationJPerMol": "activation_j_per_mol", "omega1": "omega1",
        "v1Star": "v1_star", "k11": "k11", "k21K": "k21_k", "tg1K": "tg1_k",
        "k12": "k12", "k22K": "k22_k", "tg2K": "tg2_k", "temperatureK": "temperature_k",
        "gamma": "gamma",
    }
    return run_diffusion("vrentas-duda", **{snake[key]: value for key, value in fields.items()})


def _md_run(args: dict[str, object]) -> dict[str, object]:
    from pm_science.md import run_md

    return run_md(args)


def _waxs_pro(args: dict[str, object]) -> dict[str, object]:
    from pm_science.waxs_pro import air_remove, orientation_hermans, peak_fit_pro

    op = str(args.get("op", ""))
    if op == "airremove":
        air = args.get("air")
        if air is None:
            raise ValueError("airremove requires an air intensity array")
        return air_remove(
            _array(args["twoTheta"]),
            _array(args["sample"]),
            _array(air),
            edge_points=int(args.get("edgePoints", 10)),
            window=None
            if args.get("window") is None
            else (float(args["window"][0]), float(args["window"][1])),
        )
    if op == "peakfit":
        return peak_fit_pro(
            _array(args["twoTheta"]),
            _array(args["intensity"]),
            list(args.get("peaks") or []),
            wavelength_angstrom=float(args.get("wavelengthAngstrom", 1.5418)),
            scherrer_constant=float(args.get("scherrerConstant", 0.89)),
            fit_range=None
            if args.get("fitRange") is None
            else (float(args["fitRange"][0]), float(args["fitRange"][1])),
        )
    if op == "orientation":
        air = args.get("air")
        return orientation_hermans(
            _array(args["azimuth"]),
            _array(args["intensity"]),
            float(args["twoThetaPeak"]),
            None if air is None else _array(air),
            k=float(args.get("k", 1.0)),
            gap_masks=[(float(w[0]), float(w[1])) for w in (args.get("gapMasks") or [])],
            fit_range=(
                float(args.get("fitRange", [90.0, 180.0])[0]),
                float(args.get("fitRange", [90.0, 180.0])[1]),
            ),
            wavelength_angstrom=float(args.get("wavelengthAngstrom", 1.5418)),
            legacy_baseline_square=bool(args.get("legacyBaselineSquare", False)),
        )
    raise ValueError(f"unknown waxs_pro op: {op}")


def _report(args: dict[str, object]) -> dict[str, object]:
    from pm_science.report import render_report

    payload = args.get("payload")
    if not isinstance(payload, dict):
        raise ValueError("report requires a payload object")
    return render_report(
        payload,
        str(args["outputDir"]),
        str(args.get("name", "report")),
    )


HANDLERS = {
    "waxs": _waxs,
    "ftir": _ftir,
    "saxs": _saxs,
    "hermans": _hermans,
    "relax": _relax,
    "literature_read": _literature_read,
    "literature_search": _literature_search,
    "literature_download": _literature_download,
    "literature_browser_download": _literature_browser_download,
    "literature_screen": _literature_screen,
    "chain_mech": _chain_mech,
    "rubber": _rubber,
    "viscoelastic": _viscoelastic,
    "chain_stats": _chain_stats,
    "avrami": _avrami,
    "flory": _flory,
    "tg_blend": _tg_blend,
    "diffusion": _diffusion,
    "md_run": _md_run,
    "waxs_pro": _waxs_pro,
    "report": _report,
}


def main() -> int:
    try:
        request = json.load(sys.stdin)
        tool = str(request["tool"])
        handler = HANDLERS.get(tool)
        if handler is None:
            raise ValueError(f"unknown science tool: {tool}")
        data = handler(dict(request.get("args") or {}))
        print(json.dumps({"ok": True, "data": data}, ensure_ascii=False))
        return 0
    except Exception as cause:  # noqa: BLE001 - the Host turns this into a tool error
        print(json.dumps({
            "ok": False,
            "error": {"code": "SCIENCE_TOOL_FAILED", "message": str(cause)},
        }, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
