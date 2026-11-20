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


HANDLERS = {
    "waxs": _waxs,
    "ftir": _ftir,
    "saxs": _saxs,
    "hermans": _hermans,
    "relax": _relax,
    "literature_read": _literature_read,
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
