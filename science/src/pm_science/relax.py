"""Relaxation-model fitting: Maxwell elements and KWW stretched exponential (scipy)."""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray
from scipy.optimize import curve_fit

FloatArray = NDArray[np.float64]


def _maxwell(t: FloatArray, e0: float, tau: float) -> FloatArray:
    return e0 * np.exp(-t / tau)


def _kww(t: FloatArray, e0: float, tau: float, beta: float) -> FloatArray:
    return e0 * np.exp(-np.power(t / tau, beta))


def fit_relaxation(
    time_s: FloatArray,
    signal: FloatArray,
    *,
    model: str = "kww",
) -> dict[str, object]:
    """Fit stress/property relaxation data with Maxwell or KWW.

    :param time_s: time axis (s, ascending, positive).
    :param signal: relaxing quantity (e.g. stress or orientation proxy).
    :param model: 'maxwell' (single element) or 'kww' (stretched exponential).
    :returns: {status, model, params:{...}, fit:{rmse,r2}, halfTime}
    """
    t = np.asarray(time_s, dtype=np.float64)
    y = np.asarray(signal, dtype=np.float64)
    if t.ndim != 1 or t.size != y.size or t.size < 6:
        raise ValueError("time_s/signal must be 1-D arrays of equal length >= 6")
    if np.any(t <= 0) or not np.all(np.diff(t) > 0):
        raise ValueError("time_s must be positive and strictly ascending")
    y0 = float(y[0])
    if y0 <= 0:
        return {"status": "NO_SIGNAL", "reason": "initial signal must be positive"}

    if model == "maxwell":
        p0 = [y0, max(float(t[len(t) // 2]), 1e-6)]

        def fn(x: FloatArray, e0: float, tau: float) -> FloatArray:
            return _maxwell(x, e0, tau)

        names = ("e0", "tau")
    elif model == "kww":
        p0 = [y0, max(float(t[len(t) // 2]), 1e-6), 0.6]

        def fn(x: FloatArray, e0: float, tau: float, beta: float) -> FloatArray:
            return _kww(x, e0, tau, beta)

        names = ("e0", "tau", "beta")
    else:
        raise ValueError("model must be 'maxwell' or 'kww'")

    try:
        optimal, _cov = curve_fit(fn, t, y, p0=p0, maxfev=20000,
                                  bounds=([0.0, 1e-9] + ([0.05] if model == "kww" else []),
                                          [np.inf, np.inf] + ([1.0] if model == "kww" else [])))
    except (RuntimeError, ValueError) as cause:
        return {"status": "NO_FIT", "reason": str(cause), "model": model}

    fitted = fn(t, *optimal)
    rmse = float(np.sqrt(np.mean((y - fitted) ** 2)))
    ss_res = float(np.sum((y - fitted) ** 2))
    ss_tot = float(np.sum((y - y0) ** 2))
    r2 = 1.0 - ss_res / max(ss_tot, 1e-12)
    params = {name: round(float(value), 6) for name, value in zip(names, optimal)}
    half = params["tau"] * (np.log(2.0) ** (1.0 / params.get("beta", 1.0)))
    return {
        "status": "CONVERGED",
        "model": model,
        "params": params,
        "fit": {"rmse": rmse, "r2": round(r2, 5)},
        "halfTime": round(float(half), 4),
    }
