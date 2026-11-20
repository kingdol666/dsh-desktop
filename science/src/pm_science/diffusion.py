"""Small-molecule transport in polymers: Arrhenius and Vrentas–Duda free volume."""

from __future__ import annotations

from typing import Literal

import numpy as np
from numpy.typing import NDArray

FloatArray = NDArray[np.float64]

GAS_CONSTANT_J_PER_MOL_K = 8.314462618


def arrhenius_fit(
    temperature_k: FloatArray | list[float],
    diffusivity: FloatArray | list[float],
) -> dict[str, object]:
    """Fit D(T) = D₀·exp(−Ea/(RT)) by regression of ln D against 1/T.

    :param temperature_k: absolute temperatures (K, positive, >= 4 samples).
    :param diffusivity: diffusivities (m²/s, positive).
    :returns: {status, D0, EaJPerMol, EaKJPerMol, fit:{rmseLog, r2Log}, definitions}
    """
    temps = np.asarray(temperature_k, dtype=np.float64)
    diffs = np.asarray(diffusivity, dtype=np.float64)
    if temps.shape != diffs.shape or temps.ndim != 1 or temps.size < 4:
        raise ValueError("temperature/diffusivity must be 1-D arrays of equal length >= 4")
    if np.any(temps <= 0.0) or np.any(diffs <= 0.0):
        raise ValueError("temperatures and diffusivities must be positive")
    inverse_t = 1.0 / temps
    log_d = np.log(diffs)
    slope, intercept = np.polyfit(inverse_t, log_d, 1)
    predicted = slope * inverse_t + intercept
    ss_res = float(np.sum((log_d - predicted) ** 2))
    ss_tot = float(np.sum((log_d - log_d.mean()) ** 2))
    activation = float(-GAS_CONSTANT_J_PER_MOL_K * slope)
    return {
        "status": "OK",
        "D0": float(np.exp(intercept)),
        "EaJPerMol": round(activation, 2),
        "EaKJPerMol": round(activation / 1000.0, 4),
        "fit": {"rmseLog": float(np.sqrt(ss_res / temps.size)), "r2Log": round(1.0 - ss_res / max(ss_tot, 1e-12), 6)},
        "pointsUsed": int(temps.size),
        "definitions": {
            "D0": "Arrhenius pre-factor (m²/s)",
            "EaJPerMol": "activation energy Ea from −R·slope(lnD vs 1/T) (J/mol)",
        },
    }


def vrentas_duda(
    d0: float,
    activation_j_per_mol: float,
    omega1: float,
    v1_star: float,
    k11: float,
    k21_k: float,
    tg1_k: float,
    k12: float,
    k22_k: float,
    tg2_k: float,
    temperature_k: float,
    *,
    gamma: float = 1.0,
) -> dict[str, object]:
    """Vrentas–Duda solvent self-diffusivity at one state point.

    D₁ = D₀·exp(−E/(RT))·exp(−ω₁V₁*/(Vfh/γ)), Vfh/γ = K₁₁ω₁(K₂₁ + T − T_g1) + K₁₂ω₂(K₂₂ + T − T_g2)
    :param d0: pre-factor (m²/s).
    :param activation_j_per_mol: activation energy E (J/mol).
    :param omega1: solvent mass fraction.
    :param v1_star: solvent specific critical free volume (cm³/g).
    :param k11: solvent free-volume constant (cm³/g·K).
    :param k21_k: solvent free-volume constant (K).
    :param tg1_k: solvent glass transition (K).
    :param k12: polymer free-volume constant (cm³/g·K).
    :param k22_k: polymer free-volume constant (K).
    :param tg2_k: polymer glass transition (K).
    :param temperature_k: temperature (K).
    :param gamma: free-volume overlap factor (default 1).
    :returns: {status, D1, freeVolumeOverGamma, definitions}
    """
    if temperature_k <= 0.0 or omega1 < 0.0 or omega1 > 1.0:
        raise ValueError("temperature must be positive and omega1 a valid mass fraction")
    omega2 = 1.0 - omega1
    fh = (
        k11 * omega1 * (k21_k + temperature_k - tg1_k)
        + k12 * omega2 * (k22_k + temperature_k - tg2_k)
    )
    if fh <= 0.0:
        raise ValueError("free-volume term is non-positive at this state point")
    value = d0 * np.exp(-activation_j_per_mol / (GAS_CONSTANT_J_PER_MOL_K * temperature_k)) * np.exp(
        -omega1 * v1_star / fh
    )
    return {
        "status": "OK",
        "D1": float(value),
        "freeVolumeOverGamma": float(fh),
        "definitions": {
            "D1": "solvent self-diffusivity (m²/s); parameters follow Vrentas & Duda (1979)",
            "freeVolumeOverGamma": "hole free volume divided by γ (cm³/g)",
        },
    }


def diffusion(
    part: Literal["arrhenius", "vrentas-duda"],
    **kwargs: object,
) -> dict[str, object]:
    """Dispatch the requested transport computation.

    :param part: 'arrhenius' (needs temperature_k/diffusivity lists) or 'vrentas-duda'.
    :returns: the corresponding report.
    """
    if part == "arrhenius":
        temps = kwargs.get("temperature_k")
        diffs = kwargs.get("diffusivity")
        if not isinstance(temps, list) or not isinstance(diffs, list):
            raise ValueError("arrhenius needs temperature_k and diffusivity lists")
        return arrhenius_fit(temps, diffs)
    if part == "vrentas-duda":
        required = (
            "d0", "activation_j_per_mol", "omega1", "v1_star", "k11", "k21_k",
            "tg1_k", "k12", "k22_k", "tg2_k", "temperature_k",
        )
        missing = [name for name in required if kwargs.get(name) is None]
        if missing:
            raise ValueError(f"vrentas-duda missing parameters: {', '.join(missing)}")
        return vrentas_duda(
            d0=float(kwargs["d0"]),  # type: ignore[arg-type]
            activation_j_per_mol=float(kwargs["activation_j_per_mol"]),  # type: ignore[arg-type]
            omega1=float(kwargs["omega1"]),  # type: ignore[arg-type]
            v1_star=float(kwargs["v1_star"]),  # type: ignore[arg-type]
            k11=float(kwargs["k11"]),  # type: ignore[arg-type]
            k21_k=float(kwargs["k21_k"]),  # type: ignore[arg-type]
            tg1_k=float(kwargs["tg1_k"]),  # type: ignore[arg-type]
            k12=float(kwargs["k12"]),  # type: ignore[arg-type]
            k22_k=float(kwargs["k22_k"]),  # type: ignore[arg-type]
            tg2_k=float(kwargs["tg2_k"]),  # type: ignore[arg-type]
            temperature_k=float(kwargs["temperature_k"]),  # type: ignore[arg-type]
            gamma=float(kwargs.get("gamma") or 1.0),  # type: ignore[arg-type]
        )
    raise ValueError("part must be 'arrhenius' or 'vrentas-duda'")
