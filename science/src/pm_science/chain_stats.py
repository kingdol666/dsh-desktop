"""Chain statistics: ideal-chain sizes and affine-deformation orientation."""

from __future__ import annotations

import numpy as np


def ideal_chain(beads_per_chain: int, kuhn_length_nm: float) -> dict[str, float]:
    """Ideal (Gaussian) chain size measures.

    :param beads_per_chain: Kuhn segments per chain N.
    :param kuhn_length_nm: Kuhn length b (nm).
    :returns: {meanSquareEndNm2, radiusOfGyrationNm}
    """
    if beads_per_chain < 2 or kuhn_length_nm <= 0.0:
        raise ValueError("beads_per_chain >= 2 and kuhn_length_nm > 0 required")
    b = float(kuhn_length_nm)
    return {
        "meanSquareEndNm2": beads_per_chain * b * b,
        "radiusOfGyrationNm": float(np.sqrt(beads_per_chain * b * b / 6.0)),
    }


def affine_orientation(
    stretch_x: float,
    stretch_y: float | None = None,
    stretch_z: float | None = None,
) -> dict[str, float]:
    """Affine (instantaneous) network orientation under deformation.

    Uniaxial default: λy = λz = λx^−1/2. For general deformation the second
    Legendre order parameter of the x axis is computed from the stretch ratios.
    :param stretch_x: stretch along x.
    :param stretch_y: optional stretch along y.
    :param stretch_z: optional stretch along z.
    :returns: {lambdaChain, meanCos2X, orientationF}
    """
    if stretch_x <= 0.0:
        raise ValueError("stretch_x must be positive")
    if stretch_y is None:
        stretch_y = 1.0 / np.sqrt(stretch_x)
    if stretch_z is None:
        stretch_z = stretch_y
    if stretch_y <= 0.0 or stretch_z <= 0.0:
        raise ValueError("stretches must be positive")
    squares = (stretch_x**2, float(stretch_y) ** 2, float(stretch_z) ** 2)
    mean_cos2 = squares[0] / sum(squares)
    order = 0.5 * (3.0 * mean_cos2 - 1.0)
    lambda_chain = float(np.sqrt(sum(squares) / 3.0))
    return {
        "lambdaChain": lambda_chain,
        "meanCos2X": float(mean_cos2),
        "orientationF": float(order),
    }


def chain_stats(
    beads_per_chain: int,
    kuhn_length_nm: float,
    *,
    stretch_x: float = 1.0,
    stretch_y: float | None = None,
    stretch_z: float | None = None,
) -> dict[str, object]:
    """Combined size + orientation report for one chain population.

    :param beads_per_chain: Kuhn segments per chain N.
    :param kuhn_length_nm: Kuhn length b (nm).
    :param stretch_x: stretch along x (1 = undeformed).
    :param stretch_y: optional transverse stretch (default affine uniaxial).
    :param stretch_z: optional thickness stretch (defaults to stretch_y).
    :returns: {status, size, orientation, definitions}
    """
    size = ideal_chain(beads_per_chain, kuhn_length_nm)
    orientation = affine_orientation(stretch_x, stretch_y, stretch_z)
    return {
        "status": "OK",
        "size": size,
        "orientation": orientation,
        "definitions": {
            "radiusOfGyrationNm": "ideal-chain Rg = sqrt(Nb²/6) (nm); real melts are larger (excluded volume)",
            "orientationF": "Hermans factor f = (3⟨cos²θ⟩−1)/2 of the x axis under affine deformation; measured values sit at or below this bound",
            "lambdaChain": "chain stretch λc = sqrt(I₁/3)",
        },
    }
