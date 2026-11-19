"""Hermans orientation factor from azimuthal WAXS scans (numpy)."""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray

FloatArray = NDArray[np.float64]


def hermans_factor(
    azimuth_deg: FloatArray,
    intensity: FloatArray,
    *,
    baseline: float = 0.0,
) -> dict[str, object]:
    """Compute the Hermans orientation factor f = (3⟨cos²φ⟩−1)/2 from an azimuthal scan.

    :param azimuth_deg: azimuthal angle φ in degrees (0..360), any order.
    :param intensity: background-subtracted azimuthal intensity of one reflection.
    :param baseline: intensity floor subtracted before weighting.
    :returns: {status, hermansFactor, meanCos2, angleOfMaxDeg, spreadDeg}
    """
    phi = np.deg2rad(np.asarray(azimuth_deg, dtype=np.float64))
    y = np.asarray(intensity, dtype=np.float64) - baseline
    if phi.ndim != 1 or phi.size != y.size or phi.size < 8:
        raise ValueError("azimuth_deg/intensity must be 1-D arrays of equal length >= 8")
    if np.any(y < 0):
        y = np.clip(y, 0.0, None)
    total = float(y.sum())
    if total <= 0:
        return {"status": "NO_SIGNAL", "hermansFactor": None}
    mean_cos2 = float(np.sum(y * np.cos(phi) ** 2) / total)
    factor = 0.5 * (3.0 * mean_cos2 - 1.0)
    strongest = int(np.argmax(y))
    weighted = y / total
    spread = float(np.sqrt(np.sum(weighted * (np.rad2deg(phi) - np.rad2deg(phi[strongest])) ** 2)))
    return {
        "status": "CONVERGED",
        "hermansFactor": round(factor, 4),
        "meanCos2": round(mean_cos2, 5),
        "angleOfMaxDeg": round(float(np.rad2deg(phi[strongest])) % 360.0, 2),
        "spreadDeg": round(spread, 2),
    }
