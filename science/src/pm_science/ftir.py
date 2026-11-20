"""FTIR peak decomposition and hydrogen-bond / carbonyl indices (numpy/scipy)."""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray
from scipy.optimize import curve_fit

FloatArray = NDArray[np.float64]


def _voigt_ish(x: FloatArray, amp: float, cen: float, width: float, frac: float) -> FloatArray:
    """Pseudo-Voigt: linear mix of Gaussian and Lorentzian."""
    gauss = amp * np.exp(-((x - cen) ** 2) / (4.0 * width**2))
    lorentz = amp * (width**2) / ((x - cen) ** 2 + width**2)
    return frac * lorentz + (1.0 - frac) * gauss


def _model(x: FloatArray, baseline0: float, slope: float, *peaks: float) -> FloatArray:
    y: FloatArray = np.full_like(x, baseline0) + slope * x
    for i in range(0, len(peaks), 4):
        y = y + _voigt_ish(x, peaks[i], peaks[i + 1], peaks[i + 2], min(max(peaks[i + 3], 0.0), 1.0))
    return y


def ftir_peak_fit(
    wavenumber: FloatArray,
    absorbance: float | FloatArray,
    *,
    peak_centers_guess: tuple[float, ...] = (3330.0, 2940.0, 1420.0, 1090.0),
    hbond_region: tuple[float, float] = (3000.0, 3600.0),
    carbonyl_region: tuple[float, float] = (1700.0, 1780.0),
) -> dict[str, object]:
    """Fit baseline + pseudo-Voigt peaks; report hydrogen-bond and carbonyl indices.

    :param wavenumber: wavenumber axis (cm⁻¹, any order).
    :param absorbance: absorbance values.
    :param peak_centers_guess: initial peak centers (cm⁻¹).
    :param hbond_region: O–H stretching region used for the hydrogen-bond index.
    :param carbonyl_region: C=O region used for the carbonyl index.
    :returns: {status, peaks, hbondIndex, carbonylIndex, fit:{rmse,r2}}
    """
    x = np.asarray(wavenumber, dtype=np.float64)
    y = np.asarray(absorbance, dtype=np.float64)
    if x.ndim != 1 or x.size != y.size or x.size < 20:
        raise ValueError("wavenumber/absorbance must be 1-D arrays of equal length >= 20")
    p0: list[float] = [float(y.min()), 0.0]
    lower = [-np.inf, -np.inf]
    upper = [np.inf, np.inf]
    for center in peak_centers_guess:
        anchor = float(y[np.argmin(np.abs(x - center))])
        p0 += [max(anchor, float(y.max()) * 0.1), float(center), 30.0, 0.5]
        lower += [0.0, center - 60.0, 5.0, 0.0]
        upper += [np.inf, center + 60.0, 200.0, 1.0]

    try:
        optimal, _cov = curve_fit(_model, x, y, p0=p0, bounds=(lower, upper), maxfev=30000)
    except (RuntimeError, ValueError) as cause:
        return {"status": "NO_FIT", "reason": str(cause), "hbondIndex": None, "carbonylIndex": None}

    peaks: list[dict[str, object]] = []
    for i in range(2, len(optimal), 4):
        amp, cen, wid, frac = optimal[i], optimal[i + 1], optimal[i + 2], optimal[i + 3]
        peaks.append({
            "centerCm1": round(float(cen), 1),
            "width": round(float(wid), 1),
            "lorentzFraction": round(float(frac), 3),
            "height": round(float(amp), 4),
        })
    fitted = _model(x, *optimal)
    peaks_only = _peaks_only(optimal, x)
    residual = y - fitted
    rmse = float(np.sqrt(np.mean(residual**2)))
    ss_res = float(np.sum(residual**2))
    ss_tot = float(np.sum((y - y.mean()) ** 2))
    r2 = 1.0 - ss_res / max(ss_tot, 1e-12)
    hbond = _region_area(x, peaks_only, hbond_region)
    carbonyl = _region_area(x, peaks_only, carbonyl_region)
    return {
        "status": "CONVERGED",
        "peaks": peaks,
        "hbondIndex": round(float(hbond), 4),
        "carbonylIndex": round(float(carbonyl), 4),
        "definitions": {
            "hbondIndex": f"integrated pseudo-Voigt absorbance area over {hbond_region[0]:.0f}-{hbond_region[1]:.0f} cm^-1 (absorbance·cm^-1)",
            "carbonylIndex": f"integrated pseudo-Voigt absorbance area over {carbonyl_region[0]:.0f}-{carbonyl_region[1]:.0f} cm^-1 (absorbance·cm^-1)",
        },
        "fit": {"rmse": rmse, "r2": round(r2, 5)},
    }


def _region_area(x: FloatArray, y: FloatArray, region: tuple[float, float]) -> float:
    mask = (x >= min(region)) & (x <= max(region))
    return float(np.trapezoid(y[mask], x[mask])) if mask.sum() > 1 else 0.0


def _peaks_only(optimal: FloatArray, x: FloatArray) -> FloatArray:
    y = np.zeros_like(x)
    for i in range(2, len(optimal), 4):
        y = y + _voigt_ish(x, optimal[i], optimal[i + 1], optimal[i + 2], optimal[i + 3])
    return y
