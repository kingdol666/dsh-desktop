"""WAXS crystallinity via amorphous-halo + crystalline-peak decomposition (numpy/scipy)."""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray
from scipy.optimize import curve_fit

FloatArray = NDArray[np.float64]


def _model(x: FloatArray, amp_a: float, cen_a: float, wid_a: float, *cryst: float) -> FloatArray:
    """Amorphous halo (one Gaussian) + N crystalline Gaussians."""
    y = _gaussian(x, amp_a, cen_a, wid_a)
    for i in range(0, len(cryst), 3):
        y = y + _gaussian(x, cryst[i], cryst[i + 1], cryst[i + 2])
    return y


def _gaussian(x: FloatArray, amp: float, cen: float, wid: float) -> FloatArray:
    return amp * np.exp(-((x - cen) ** 2) / (4.0 * wid**2))


def waxs_crystallinity(
    two_theta_deg: FloatArray,
    intensity: FloatArray,
    *,
    halo_center_guess: float = 20.0,
    peak_centers_guess: tuple[float, ...] = (22.5,),
    halo_width_guess: float = 5.0,
    peak_width_guess: float = 1.2,
) -> dict[str, object]:
    """Decompose a 1D WAXS profile and return crystallinity with quality metrics.

    :param two_theta_deg: 2θ axis in degrees (sorted ascending).
    :param intensity: background-subtracted intensity.
    :param halo_center_guess: amorphous halo center (2θ, deg).
    :param peak_centers_guess: crystalline peak centers (2θ, deg).
    :param halo_width_guess: halo width parameter (deg).
    :param peak_width_guess: peak width parameter (deg).
    :returns: {crystallinityIndex, status, peaks:[{center,width,areaFraction}], fit:{rmse,r2}}
    """
    x = np.asarray(two_theta_deg, dtype=np.float64)
    y = np.asarray(intensity, dtype=np.float64)
    if x.ndim != 1 or y.ndim != 1 or x.size != y.size or x.size < 20:
        raise ValueError("two_theta_deg/intensity must be 1-D arrays of equal length >= 20")
    order = np.argsort(x)
    x, y = x[order], y[order]

    p0: list[float] = [float(y.max()), halo_center_guess, halo_width_guess]
    lower = [0.0, float(x.min()), 0.5]
    upper = [np.inf, float(x.max()), float(x.max() - x.min())]
    for center in peak_centers_guess:
        p0 += [float(y.max() * 0.5), float(center), peak_width_guess]
        lower += [0.0, float(x.min()), 0.2]
        upper += [np.inf, float(x.max()), 10.0]

    try:
        optimal, _cov = curve_fit(_model, x, y, p0=p0, bounds=(lower, upper), maxfev=20000)
    except (RuntimeError, ValueError) as cause:
        return {"status": "NO_FIT", "reason": str(cause), "crystallinityIndex": None}

    amp_a, cen_a, wid_a = optimal[0], optimal[1], optimal[2]
    cryst = optimal[3:]
    halo = _gaussian(x, amp_a, cen_a, wid_a)
    crystalline = np.zeros_like(x)
    peaks: list[dict[str, object]] = []
    for i in (range(0, len(cryst), 3)):
        peak = _gaussian(x, cryst[i], cryst[i + 1], cryst[i + 2])
        crystalline = crystalline + peak
        peaks.append({
            "center2Theta": round(float(cryst[i + 1]), 3),
            "width": round(float(cryst[i + 2]), 3),
            "areaFraction": round(float(peak.sum() / max(crystalline.sum(), 1e-12)), 4),
        })
    total = crystalline.sum() + halo.sum()
    index = float(crystalline.sum() / max(total, 1e-12))
    fitted = _model(x, *optimal)
    rmse = float(np.sqrt(np.mean((y - fitted) ** 2)))
    ss_res = float(np.sum((y - fitted) ** 2))
    ss_tot = float(np.sum((y - y.mean()) ** 2))
    r2 = 1.0 - ss_res / max(ss_tot, 1e-12)
    return {
        "status": "CONVERGED",
        "crystallinityIndex": round(index, 4),
        "halo": {"center2Theta": round(float(cen_a), 3), "width": round(float(wid_a), 3)},
        "peaks": peaks,
        "fit": {"rmse": rmse, "r2": round(r2, 5)},
    }
