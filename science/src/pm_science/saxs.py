"""SAXS 1-D reduction: background subtraction, Guinier region, Porod slope (numpy)."""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray

FloatArray = NDArray[np.float64]


def _guinier_fit(q: FloatArray, ln_i: FloatArray, max_qr: float) -> dict[str, object]:
    """Fit the Guinier region self-consistently in ln I vs q².

    The Guinier law is ln I = ln I(0) − Rg²q²/3, so the regression variable is
    q², not q. A power-law regression on ln q would return a meaningless
    "Rg" (it estimates the Porod/fractal exponent instead). The window grows
    until q·Rg reaches ``max_qr``, iterating because the cap depends on Rg.
    """
    if q.size < 5:
        return {"status": "NO_FIT", "reason": "fewer than 5 positive-q points"}
    slope, intercept = np.polyfit(q[:5] ** 2, ln_i[:5], 1)
    if slope >= 0:
        return {"status": "NO_FIT", "reason": "ln I vs q² has non-negative slope"}
    rg = float(np.sqrt(-3.0 * slope))
    mask = q <= max_qr / rg
    iterations = 0
    for _ in range(20):
        iterations += 1
        if not np.isfinite(rg) or rg <= 1.5:
            return {"status": "NO_FIT", "reason": f"unphysical Rg={rg:.3f} Å"}
        mask = q <= max_qr / rg
        if int(mask.sum()) < 5:
            return {"status": "NO_FIT", "reason": "fewer than 5 points inside q·Rg cap"}
        slope, intercept = np.polyfit(q[mask] ** 2, ln_i[mask], 1)
        if slope >= 0:
            return {"status": "NO_FIT", "reason": "ln I vs q² has non-negative slope"}
        nxt = float(np.sqrt(-3.0 * slope))
        if abs(nxt - rg) <= 1e-3:
            rg = nxt
            break
        rg = nxt
    fitted = intercept + slope * q[mask] ** 2
    rmse = float(np.sqrt(np.mean((ln_i[mask] - fitted) ** 2)))
    qr = q[mask] * rg
    qr_max = float(qr[-1])
    if qr_max < 0.5:
        return {
            "status": "NO_FIT",
            "reason": f"q·Rg only reaches {qr_max:.3f}; no Guinier curvature in the measured window",
            "rg": round(rg, 3),
            "qRgRange": [float(qr[0]), qr_max],
        }
    if rmse > 0.08:
        return {
            "status": "NO_FIT",
            "reason": f"Guinier residual rmse={rmse:.4f} is too large for a linear ln I vs q² region",
            "rg": round(rg, 3),
            "qRgRange": [float(qr[0]), qr_max],
        }
    return {
        "status": "CONVERGED",
        "rg": round(rg, 3),
        "rmse": rmse,
        "fitRange": [float(q[mask][0]), float(q[mask][-1])],
        "qRgRange": [float(qr[0]), qr_max],
        "points": int(mask.sum()),
        "iterations": iterations,
    }


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
    ln_i = np.log(subtracted[keep])
    qk = qx[keep]
    guinier = _guinier_fit(qk, ln_i, guinier_max_qr)

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
