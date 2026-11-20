"""Flory–Huggins lattice blending thermodynamics for two polymers."""

from __future__ import annotations

import numpy as np


def spinodal_chi(n1: int, n2: int, phi: float) -> float:
    """Spinodal χ at composition φ: χ_s = ½(1/(N₁φ) + 1/(N₂(1−φ))).

    :param n1: degree of polymerization of component 1.
    :param n2: degree of polymerization of component 2.
    :param phi: volume fraction of component 1 (inside (0, 1)).
    :returns: the spinodal interaction parameter.
    """
    if n1 < 1 or n2 < 1 or not 0.0 < phi < 1.0:
        raise ValueError("n1/n2 >= 1 and 0 < phi < 1 required")
    return 0.5 * (1.0 / (n1 * phi) + 1.0 / (n2 * (1.0 - phi)))


def critical_point(n1: int, n2: int) -> dict[str, float]:
    """Critical composition and χ (g'' = g''' = 0), exact for the lattice model.

    :param n1: degree of polymerization of component 1.
    :param n2: degree of polymerization of component 2.
    :returns: {phiCritical, chiCritical}
    """
    if n1 < 1 or n2 < 1:
        raise ValueError("n1/n2 >= 1 required")
    phi_c = float(np.sqrt(n2) / (np.sqrt(n1) + np.sqrt(n2)))
    chi_c = spinodal_chi(n1, n2, phi_c)
    return {"phiCritical": phi_c, "chiCritical": chi_c}


def critical_temperature(chi_a: float, chi_b: float, chi_critical: float) -> float | None:
    """Upper critical solution temperature from χ(T) = A/T + B, if it exists.

    :param chi_a: enthalpic coefficient A (K).
    :param chi_b: entropic offset B.
    :param chi_critical: target χ at the critical point.
    :returns: Tc in K, or None when no physical solution exists.
    """
    if chi_a <= 0.0:
        return None
    candidate = chi_a / (chi_critical - chi_b)
    return float(candidate) if candidate > 0.0 else None


def free_energy(n1: int, n2: int, chi: float, phi_grid: list[float]) -> dict[str, object]:
    """Lattice free energy per site in kBT units on a composition grid.

    :param n1: degree of polymerization of component 1.
    :param n2: degree of polymerization of component 2.
    :param chi: interaction parameter.
    :param phi_grid: composition samples (0 < φ < 1).
    :returns: {status, phi, g, spinodalChi, definitions}
    """
    phis = np.asarray(phi_grid, dtype=np.float64)
    if phis.size == 0 or np.any(phis <= 0.0) or np.any(phis >= 1.0):
        raise ValueError("phi_grid needs samples strictly inside (0, 1)")
    energy = (phis * np.log(phis) / n1) + ((1.0 - phis) * np.log(1.0 - phis) / n2) + chi * phis * (1.0 - phis)
    return {
        "status": "OK",
        "phi": [float(v) for v in phis],
        "g": [float(v) for v in energy],
        "spinodalChi": [spinodal_chi(n1, n2, float(v)) for v in phis],
        "definitions": {
            "g": "lattice free energy per site in kBT units: φlnφ/N₁ + (1−φ)ln(1−φ)/N₂ + χφ(1−φ)",
            "spinodalChi": "χ above which composition φ is unstable (g'' < 0)",
        },
    }


def flory_huggins(
    n1: int,
    n2: int,
    *,
    chi: float | None = None,
    chi_a: float | None = None,
    chi_b: float = 0.0,
    temperature_k: float | None = None,
    phi: float = 0.5,
    phi_grid_points: int = 49,
) -> dict[str, object]:
    """Blend stability report: spinodal, critical point, and a verdict at φ.

    :param n1: degree of polymerization of component 1 (e.g. PVA).
    :param n2: degree of polymerization of component 2 (e.g. PVP).
    :param chi: interaction parameter (overrides χ(T)).
    :param chi_a: enthalpic coefficient A when χ = A/T + B.
    :param chi_b: entropic offset B when χ = A/T + B (default 0).
    :param temperature_k: temperature used with χ(T).
    :param phi: composition at which the verdict is issued.
    :param phi_grid_points: resolution of the free-energy scan.
    :returns: {status, chi, spinodalChi, critical, temperatureK, verdict, definitions}
    """
    if chi is None:
        if chi_a is None or temperature_k is None or temperature_k <= 0.0:
            raise ValueError("either chi, or chi_a with a positive temperature_k, is required")
        chi = chi_a / temperature_k + chi_b
    critical = critical_point(n1, n2)
    spinodal = spinodal_chi(n1, n2, phi)
    if chi > spinodal:
        verdict = "UNSTABLE_PHASE_SEPARATE"
        note = "χ exceeds the spinodal value at φ; demixing is thermodynamically required"
    else:
        verdict = "STABLE_SINGLE_PHASE"
        note = "χ below spinodal at φ; a metastable binodal zone is not excluded (binodal not computed)"
    grid = list(np.linspace(0.02, 0.98, max(phi_grid_points, 3)))
    scan = free_energy(n1, n2, float(chi), grid)
    tc = critical_temperature(chi_a if chi_a is not None else 0.0, chi_b, critical["chiCritical"]) \
        if (chi_a is not None and temperature_k is None) else None
    return {
        "status": "OK",
        "chi": float(chi),
        "temperatureK": temperature_k,
        "spinodalChi": spinodal,
        "critical": critical,
        "criticalTemperatureK": tc,
        "verdict": verdict,
        "note": note,
        "scan": {"phi": scan["phi"], "g": scan["g"]},
        "definitions": {
            "chiCritical": "χ_c = ½(1/(N₁φc) + 1/(N₂(1−φc))) at φc = √N₂/(√N₁+√N₂)",
            "verdict": "stability at the requested composition against the spinodal criterion",
        },
    }
