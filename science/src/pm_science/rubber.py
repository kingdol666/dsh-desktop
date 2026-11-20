"""Rubber elasticity: 8-chain (Arruda–Boyce) network with exact neo-Hookean limit."""

from __future__ import annotations

from collections.abc import Callable
from typing import Literal

import numpy as np
from numpy.typing import NDArray

from pm_science.chain_mech import inverse_langevin

FloatArray = NDArray[np.float64]


def _chain_stretch(stretches: tuple[float, float, float]) -> float:
    """Chain stretch λc = sqrt(I₁/3) for the given principal stretches."""
    return float(np.sqrt(sum(value * value for value in stretches) / 3.0))


def true_stress(
    shear_modulus_mpa: float,
    links_per_chain: int,
    stretches: tuple[float, float, float],
) -> tuple[float, float, float]:
    """8-chain principal Cauchy stresses up to the incompressibility pressure.

    Only stress *differences* are physical in an incompressible network; the
    returned triple uses the same arbitrary pressure reference for all axes.
    :param shear_modulus_mpa: small-strain shear modulus μ (MPa).
    :param links_per_chain: rigid links per chain N (≥ 2).
    :param stretches: principal stretches (λx, λy, λz).
    :returns: (σx, σy, σz) in MPa, pressure reference chosen so mean = 0.
    """
    if shear_modulus_mpa <= 0.0 or links_per_chain < 2:
        raise ValueError("shear modulus must be positive and links_per_chain >= 2")
    lambda_chain = _chain_stretch(stretches)
    if lambda_chain / np.sqrt(links_per_chain) >= 1.0:
        raise ValueError(
            f"chain stretch {lambda_chain:.3f} reaches chain lock (√N={np.sqrt(links_per_chain):.3f}); "
            "increase links_per_chain or reduce stretches"
        )
    beta = inverse_langevin(lambda_chain / np.sqrt(links_per_chain))
    factor = shear_modulus_mpa * np.sqrt(links_per_chain) * beta / (3.0 * lambda_chain)
    raw = [factor * value * value for value in stretches]
    mean = sum(raw) / 3.0
    return (raw[0] - mean, raw[1] - mean, raw[2] - mean)


def nominal_stress_uniaxial(
    shear_modulus_mpa: float,
    links_per_chain: int,
    stretch: float,
) -> float:
    """8-chain uniaxial nominal (engineering) stress P = (σx − σy)/λ.

    The transverse surfaces are traction-free (σy = σz = 0), so the physical
    draw-axis stress is the principal difference, which is invariant under the
    arbitrary incompressibility pressure.
    """
    if stretch <= 0.0:
        raise ValueError("stretch must be positive")
    sigma = true_stress(shear_modulus_mpa, links_per_chain, (stretch, 1.0 / np.sqrt(stretch), 1.0 / np.sqrt(stretch)))
    return float((sigma[0] - sigma[1]) / stretch)


def _simpson(integrand: Callable[[float], float], low: float, high: float, points: int = 400) -> float:
    """Composite Simpson integration of a scalar function on [low, high]."""
    if points % 2 == 1:
        points += 1
    grid = np.linspace(low, high, points + 1)
    values = np.array([integrand(float(v)) for v in grid], dtype=np.float64)
    step = (high - low) / points
    weights = np.ones(points + 1)
    weights[1:-1:2] = 4.0
    weights[2:-1:2] = 2.0
    return float((step / 3.0) * np.dot(weights, values))


def work_density_uniaxial(
    shear_modulus_mpa: float,
    links_per_chain: int,
    stretch: float,
) -> float:
    """Deformation work per unit volume W = ∫₁^λ P(λ')dλ' (MPa, i.e. mJ/mm³)."""
    if stretch <= 1.0:
        return 0.0
    return _simpson(
        lambda lam: nominal_stress_uniaxial(shear_modulus_mpa, links_per_chain, lam),
        1.0,
        stretch,
    )


def neo_hookean_work(shear_modulus_mpa: float, stretch: float) -> float:
    """Neo-Hookean reference W = μ(λ²/2 + 1/λ − 3/2) per unit volume."""
    return shear_modulus_mpa * (stretch * stretch / 2.0 + 1.0 / stretch - 1.5)


def rubber_elasticity(
    mode: Literal["uniaxial", "biaxial"],
    shear_modulus_mpa: float,
    links_per_chain: int,
    *,
    stretch_x: float = 1.0,
    stretch_y: float = 1.0,
    grid_points: int = 40,
    max_stretch: float = 2.0,
) -> dict[str, object]:
    """Full 8-chain response report for one deformation mode.

    :param mode: 'uniaxial' (λy=λz=λx^−1/2) or 'biaxial' (λy given, λz=1/(λxλy)).
    :param shear_modulus_mpa: small-strain shear modulus μ (MPa).
    :param links_per_chain: rigid links per chain N.
    :param stretch_x: draw stretch along x.
    :param stretch_y: fixed transverse stretch (biaxial mode).
    :param grid_points: samples along the x-stretch path.
    :param max_stretch: x-stretch upper bound of the path grid.
    :returns: {status, mode, atStretch, path, workPerVolMPa, neoHookeanRefMPa, definitions}
    """
    if mode == "uniaxial":
        stretches = (stretch_x, 1.0 / np.sqrt(stretch_x), 1.0 / np.sqrt(stretch_x))
        stretch = stretch_x
    elif mode == "biaxial":
        if stretch_y <= 0.0 or stretch_x * stretch_y <= 0.0:
            raise ValueError("biaxial stretches must be positive")
        stretches = (stretch_x, stretch_y, 1.0 / (stretch_x * stretch_y))
        stretch = stretch_x
    else:
        raise ValueError("mode must be 'uniaxial' or 'biaxial'")

    lambda_chain = _chain_stretch(stretches)
    if lambda_chain / np.sqrt(links_per_chain) >= 1.0:
        raise ValueError("chain stretch reaches chain lock; reduce stretches or raise N")
    beta = inverse_langevin(lambda_chain / np.sqrt(links_per_chain))
    stress = true_stress(shear_modulus_mpa, links_per_chain, stretches)
    work = work_density_uniaxial(shear_modulus_mpa, links_per_chain, stretch) if mode == "uniaxial" else None

    path_stretches = np.linspace(1.0, max_stretch, max(grid_points, 2))
    path_stress = []
    path_stretch_chain = []
    for value in path_stretches:
        triple = (
            (float(value), 1.0 / np.sqrt(float(value)), 1.0 / np.sqrt(float(value)))
            if mode == "uniaxial"
            else (float(value), stretch_y, 1.0 / (float(value) * stretch_y))
        )
        sigma = true_stress(shear_modulus_mpa, links_per_chain, triple)
        path_stress.append(round(float(sigma[0]), 6))
        path_stretch_chain.append(round(_chain_stretch(triple), 6))

    return {
        "status": "OK",
        "mode": mode,
        "stretches": [round(float(v), 6) for v in stretches],
        "lambdaChain": round(lambda_chain, 6),
        "beta": round(beta, 6),
        "stressTrueMPa": [round(float(v), 6) for v in stress],
        "workPerVolMPa": None if work is None else round(work, 6),
        "neoHookeanRefMPa": round(neo_hookean_work(shear_modulus_mpa, stretch), 6),
        "path": {
            "stretchX": [round(float(v), 6) for v in path_stretches],
            "sigmaXMPa": path_stress,
            "lambdaChain": path_stretch_chain,
        },
        "definitions": {
            "shearModulusMPa": "8-chain small-strain shear modulus μ (MPa)",
            "lambdaChain": "chain stretch λc = sqrt(I₁/3); lock at √N",
            "stressTrueMPa": "principal Cauchy stresses minus their mean (MPa); only differences are physical",
            "workPerVolMPa": "uniaxial deformation work density ∫₁^λ P dλ' (MPa = mJ/mm³)",
        },
    }
