"""Glass-transition models: Fox–Flory molecular-weight dependence and Gordon–Taylor blends."""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray

FloatArray = NDArray[np.float64]


def fox_flory_fit(
    molar_mass: FloatArray | list[float],
    tg_k: FloatArray | list[float],
) -> dict[str, object]:
    """Fit Tg(M) = Tg∞ − K/M by linear regression of Tg against 1/M.

    :param molar_mass: weight-average molar masses (g/mol, positive, >= 3 samples).
    :param tg_k: measured glass transitions (K).
    :returns: {status, TgInfinityK, K, fit:{rmse, r2}, pointsUsed, definitions}
    """
    masses = np.asarray(molar_mass, dtype=np.float64)
    temps = np.asarray(tg_k, dtype=np.float64)
    if masses.shape != temps.shape or masses.ndim != 1 or masses.size < 3:
        raise ValueError("molar_mass/tg_k must be 1-D arrays of equal length >= 3")
    if np.any(masses <= 0.0):
        raise ValueError("molar masses must be positive")
    inverse = 1.0 / masses
    slope, intercept = np.polyfit(inverse, temps, 1)
    predicted = slope * inverse + intercept
    rmse = float(np.sqrt(np.mean((temps - predicted) ** 2)))
    ss_res = float(np.sum((temps - predicted) ** 2))
    ss_tot = float(np.sum((temps - temps.mean()) ** 2))
    return {
        "status": "OK",
        "TgInfinityK": round(float(intercept), 4),
        "K": round(float(-slope), 4),
        "fit": {"rmse": rmse, "r2": round(1.0 - ss_res / max(ss_tot, 1e-12), 6)},
        "pointsUsed": int(masses.size),
        "definitions": {
            "TgInfinityK": "asymptotic glass transition Tg∞ (K) at infinite molar mass",
            "K": "Fox–Flory constant K (K·g/mol); Tg(M) = Tg∞ − K/M",
        },
    }


def fox_flory_predict(tg_infinity_k: float, constant_k: float, molar_mass: float) -> dict[str, object]:
    """Predict Tg for one molar mass with Fox–Flory parameters.

    :param tg_infinity_k: asymptotic Tg∞ (K).
    :param constant_k: Fox–Flory constant (K·g/mol).
    :param molar_mass: molar mass (g/mol).
    :returns: {status, molarMass, TgK, definitions}
    """
    if molar_mass <= 0.0:
        raise ValueError("molar mass must be positive")
    return {
        "status": "OK",
        "molarMass": molar_mass,
        "TgK": round(tg_infinity_k - constant_k / molar_mass, 4),
        "definitions": {"TgK": "Tg(M) = Tg∞ − K/M (K)"},
    }


def gordon_taylor(
    weight1: float,
    tg1_k: float,
    weight2: float,
    tg2_k: float,
    *,
    k_constant: float = 1.0,
) -> dict[str, object]:
    """Gordon–Taylor blend glass transition.

    :param weight1: mass fraction of component 1 (0..1).
    :param tg1_k: component-1 Tg (K).
    :param weight2: mass fraction of component 2 (0..1).
    :param tg2_k: component-2 Tg (K).
    :param k_constant: Gordon–Taylor pair constant k.
    :returns: {status, TgBlendK, inputs, definitions}
    """
    total = weight1 + weight2
    if total <= 0.0 or tg1_k <= 0.0 or tg2_k <= 0.0 or k_constant <= 0.0:
        raise ValueError("positive weights, transitions, and k required")
    w1 = weight1 / total
    w2 = weight2 / total
    tg_blend = (w1 * tg1_k + k_constant * w2 * tg2_k) / (w1 + k_constant * w2)
    return {
        "status": "OK",
        "TgBlendK": round(float(tg_blend), 4),
        "inputs": {"w1": w1, "w2": w2, "Tg1K": tg1_k, "Tg2K": tg2_k, "k": k_constant},
        "definitions": {
            "TgBlendK": "Gordon–Taylor: Tg = (w₁Tg₁ + k·w₂Tg₂)/(w₁ + k·w₂) (K)",
        },
    }


def tg_blend(
    part: str,
    *,
    molar_mass: list[float] | None = None,
    tg_k: list[float] | None = None,
    tg_infinity_k: float | None = None,
    constant_k: float | None = None,
    predict_molar_mass: float | None = None,
    weight1: float | None = None,
    tg1_k: float | None = None,
    weight2: float | None = None,
    tg2_k: float | None = None,
    k_constant: float = 1.0,
) -> dict[str, object]:
    """Dispatch the requested glass-transition computation.

    :param part: 'fox-flory-fit' | 'fox-flory-predict' | 'gordon-taylor'.
    :returns: the corresponding report.
    """
    if part == "fox-flory-fit":
        if molar_mass is None or tg_k is None:
            raise ValueError("fox-flory-fit needs molar_mass and tg_k lists")
        return fox_flory_fit(molar_mass, tg_k)
    if part == "fox-flory-predict":
        if tg_infinity_k is None or constant_k is None or predict_molar_mass is None:
            raise ValueError("fox-flory-predict needs tg_infinity_k, constant_k, predict_molar_mass")
        return fox_flory_predict(tg_infinity_k, constant_k, predict_molar_mass)
    if part == "gordon-taylor":
        if weight1 is None or tg1_k is None or weight2 is None or tg2_k is None:
            raise ValueError("gordon-taylor needs weight1/tg1_k/weight2/tg2_k")
        return gordon_taylor(weight1, tg1_k, weight2, tg2_k, k_constant=k_constant)
    raise ValueError("part must be 'fox-flory-fit', 'fox-flory-predict', or 'gordon-taylor'")
