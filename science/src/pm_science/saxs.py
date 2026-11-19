"""SAXS 1-D reduction: background subtraction, Guinier region, Porod slope (numpy)."""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray

FloatArray = NDArray[np.float64]


def saxs_reduce(
    q: FloatArray,
    intensity: FloatArray,
    background: FloatArray | None = None,
    *,
    guinier_max_qr: float = 1.3,
    porod_q_min: float = 0.2,
) -> dict[str, object]:
    """Reduce a 1-D SAXS curve: background subtraction + Guinier Rg + Porod slope.

    :param q: scattering vector magnitude (Å⁻¹, ascending).
    :param intensity: sample intensity.
    :param background: optional background intensity (same grid).
    :param guinier_max_qr: upper bound on q·Rg for the Guinier fit window search.
    :param porod_q_min: lower q for the Porod slope window.
    :returns: {status, points, backgroundSubtracted, guinier:{rg,fitRange,quality}, porod:{slope,fitRange}}
    """
    qx = np.asarray(q, dtype=np.float64)
    iy = np.asarray(intensity, dtype=np.float64)
    if qx.ndim != 1 or qx.size != iy.size or qx.size < 10:
        raise ValueError("q/intensity must be 1-D arrays of equal length >= 10")
    if not np.all(np.diff(qx) > 0):
        raise ValueError("q must be strictly ascending")
    subtracted = iy if background is None else iy - np.asarray(background, dtype=np.float64)
    keep = (subtracted > 0) & (qx > 0)
    if keep.sum() < 5:
        return {"status": "NO_SIGNAL", "points": int(keep.sum())}

    # Guinier: scan the low-q window for the best exponential fit with q·Rg cap.
    best: dict[str, object] | None = None
    ln_i = np.log(subtracted[keep])
    qk = qx[keep]
    ln_q = np.log(qk)
    for window in range(5, min(len(qk) + 1, 25)):
        slope, intercept = np.polyfit(ln_q[:window], ln_i[:window], 1)
        if slope >= 0:
            continue
        rg_squared = -3.0 * slope
        rg = float(np.sqrt(rg_squared)) if rg_squared > 0 else 0.0
        if rg <= 0 or qk[window - 1] * rg > guinier_max_qr:
            continue
        fitted = intercept + slope * ln_q[:window]
        rmse = float(np.sqrt(np.mean((ln_i[:window] - fitted) ** 2)))
        if best is None or rmse < float(best["rmse"]):
            best = {
                "rmse": rmse,
                "rg": round(rg, 3),
                "fitRange": [float(qk[0]), float(qk[window - 1])],
            }
    guinier = best if best is not None else {"rg": None, "note": "no valid Guinier window"}

    # Porod: power-law slope in the high-q window.
    window_mask = qx >= porod_q_min * (qx.max() - qx.min()) + qx.min()
    if window_mask.sum() >= 4:
        porod_slope, _ = np.polyfit(np.log(qx[window_mask]), np.log(np.clip(subtracted[window_mask], 1e-12, None)), 1)
        porod = {"slope": round(float(porod_slope), 3), "fitRange": [float(qx[window_mask][0]), float(qx[-1])]}
    else:
        porod = {"slope": None, "note": "insufficient high-q points"}

    return {
        "status": "CONVERGED",
        "points": int(keep.sum()),
        "backgroundSubtracted": background is not None,
        "guinier": guinier,
        "porod": porod,
    }
