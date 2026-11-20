"""Isothermal crystallization kinetics: Avrami model fit X(t) = 1 − exp(−K tⁿ)."""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray

FloatArray = NDArray[np.float64]


def avrami_fit(
    time_s: FloatArray | list[float],
    crystallinity: FloatArray | list[float],
) -> dict[str, object]:
    """Fit Avrami exponent n and rate constant K from (t, X) data.

    :param time_s: time values (s, positive).
    :param crystallinity: relative crystallinity X(t) strictly inside (0, 1).
    :returns: {status, n, K, halfTime, fit:{rmse, r2}, pointsUsed, definitions}
    """
    t = np.asarray(time_s, dtype=np.float64)
    x = np.asarray(crystallinity, dtype=np.float64)
    if t.shape != x.shape or t.ndim != 1 or t.size < 6:
        raise ValueError("time/crystallinity must be 1-D arrays of equal length >= 6")
    if np.any(t <= 0.0):
        raise ValueError("time values must be positive")
    mask = (x > 1e-4) & (x < 1.0 - 1e-4)
    if int(mask.sum()) < 6:
        raise ValueError("need >= 6 points with 0 < X < 1")
    t_use = t[mask]
    x_use = x[mask]
    y = np.log(-np.log(1.0 - x_use))
    slope, intercept = np.polyfit(np.log(t_use), y, 1)
    exponent = float(slope)
    rate = float(np.exp(intercept))
    predicted_x = 1.0 - np.exp(-rate * t_use**exponent)
    rmse = float(np.sqrt(np.mean((x_use - predicted_x) ** 2)))
    ss_res = float(np.sum((x_use - predicted_x) ** 2))
    ss_tot = float(np.sum((x_use - x_use.mean()) ** 2))
    half_time = float((np.log(2.0) / rate) ** (1.0 / exponent))
    return {
        "status": "OK",
        "n": round(exponent, 5),
        "K": rate,
        "halfTimeS": round(half_time, 6),
        "fit": {"rmse": rmse, "r2": round(1.0 - ss_res / max(ss_tot, 1e-12), 6)},
        "pointsUsed": int(mask.sum()),
        "definitions": {
            "n": "Avrami exponent (growth dimensionality × nucleation mode)",
            "K": "Avrami rate constant (s^−n)",
            "halfTimeS": "t½ = (ln2/K)^(1/n) (s)",
        },
    }


def avrami_predict(
    exponent: float,
    rate_constant: float,
    time_s: FloatArray | list[float],
) -> dict[str, object]:
    """Evaluate the Avrami curve for given (n, K).

    :param exponent: Avrami exponent n.
    :param rate_constant: rate constant K (s^−n).
    :param time_s: time grid (s).
    :returns: {status, n, K, crystallinity, definitions}
    """
    if exponent <= 0.0 or rate_constant <= 0.0:
        raise ValueError("exponent and rate constant must be positive")
    t = np.asarray(time_s, dtype=np.float64)
    return {
        "status": "OK",
        "n": exponent,
        "K": rate_constant,
        "crystallinity": [float(v) for v in 1.0 - np.exp(-rate_constant * t**exponent)],
        "timeS": [float(v) for v in t],
        "definitions": {
            "crystallinity": "relative crystallinity X(t) = 1 − exp(−K tⁿ)",
        },
    }
