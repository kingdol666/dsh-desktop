"""Single-chain mechanics: freely jointed chain (FJC) and worm-like chain (WLC)."""

from __future__ import annotations

from typing import Literal

import numpy as np
from numpy.typing import NDArray

FloatArray = NDArray[np.float64]

BOLTZMANN_J_PER_K = 1.380649e-23  # J/K (SI exact)


def kbt_pn_nm(temperature_k: float) -> float:
    """Thermal energy in pN·nm (1 J = 1 N·m = 10²¹ pN·nm)."""
    return BOLTZMANN_J_PER_K * temperature_k * 1.0e21


def langevin(y: FloatArray | float) -> FloatArray | float:
    """Langevin function L(y) = coth(y) − 1/y (per-segment extension of an FJC)."""
    arr = np.asarray(y, dtype=np.float64)
    small = np.abs(arr) < 1e-6
    safe = np.where(small, 1.0, arr)
    value = 1.0 / np.tanh(safe) - 1.0 / safe
    # Series L(y) ≈ y/3 − y³/45 for the removable singularity at 0.
    expansion = arr / 3.0 - arr**3 / 45.0
    return np.where(small, expansion, value)


def inverse_langevin(target: float) -> float:
    """Exact inverse of the Langevin function on y ∈ (0, 200] by bisection.

    :param target: L(y) value, must lie in (0, 1).
    :returns: the unique y with L(y) = target.
    """
    if not 0.0 < target < 1.0:
        raise ValueError("inverse_langevin needs target in (0, 1)")
    low, high = 1e-9, 200.0
    for _ in range(200):
        mid = 0.5 * (low + high)
        value = float(langevin(mid))
        if value < target:
            low = mid
        else:
            high = mid
    return 0.5 * (low + high)


def fjc_extension(
    segment_length_nm: float,
    segments: int,
    force_pn: FloatArray | float,
    temperature_k: float,
) -> FloatArray | float:
    """Exact FJC extension per contour at the given force.

    :param segment_length_nm: Kuhn segment length b (nm).
    :param segments: number of segments N (chain contour = N·b).
    :param force_pn: force(s) (pN).
    :param temperature_k: temperature (K).
    :returns: total extension x (nm), clipped to the contour length.
    """
    thermal = kbt_pn_nm(temperature_k)
    y = np.asarray(force_pn, dtype=np.float64) * segment_length_nm / thermal
    per_segment = np.asarray(langevin(y), dtype=np.float64)
    extension = segments * segment_length_nm * per_segment
    return np.clip(extension, 0.0, segments * segment_length_nm)


def wlc_force(
    persistence_nm: float,
    contour_nm: float,
    extension_nm: FloatArray | float,
    temperature_k: float,
) -> FloatArray | float:
    """Marko–Siggia WLC force for given extension (exact interpolation formula).

    :param persistence_nm: persistence length p (nm).
    :param contour_nm: contour length Lc (nm).
    :param extension_nm: extension(s) x (nm), strictly inside (0, Lc).
    :param temperature_k: temperature (K).
    :returns: force(s) (pN).
    """
    thermal = kbt_pn_nm(temperature_k)
    fraction = np.clip(np.asarray(extension_nm, dtype=np.float64) / contour_nm, 1e-9, 1.0 - 1e-9)
    return (thermal / persistence_nm) * (1.0 / (4.0 * (1.0 - fraction) ** 2) - 0.25 + fraction)


def wlc_extension(
    persistence_nm: float,
    contour_nm: float,
    force_pn: FloatArray | float,
    temperature_k: float,
) -> FloatArray | float:
    """WLC extension at the given force by exact bisection of Marko–Siggia.

    :param persistence_nm: persistence length p (nm).
    :param contour_nm: contour length Lc (nm).
    :param force_pn: force(s) (pN).
    :param temperature_k: temperature (K).
    :returns: extension(s) (nm).
    """
    forces = np.atleast_1d(np.asarray(force_pn, dtype=np.float64))
    out = np.empty_like(forces)
    for i, force in enumerate(forces.flat):
        low, high = 1e-12, contour_nm * (1.0 - 1e-12)
        for _ in range(200):
            mid = 0.5 * (low + high)
            value = float(
                np.atleast_1d(wlc_force(persistence_nm, contour_nm, np.array([mid]), temperature_k))[0]
            )
            if value < force:
                low = mid
            else:
                high = mid
        out.flat[i] = 0.5 * (low + high)
    return out if np.ndim(force_pn) else float(out[0])


def chain_mechanics(
    model: Literal["fjc", "wlc"],
    contour_nm: float,
    temperature_k: float,
    *,
    segment_nm: float = 1.0,
    persistence_nm: float = 1.0,
    force_grid: tuple[float, float] = (0.01, 50.0),
    probe_force_pn: float | None = None,
    probe_extension_nm: float | None = None,
    grid_points: int = 60,
) -> dict[str, object]:
    """Build a force–extension curve plus optional single-point probes.

    :param model: 'fjc' (exact Langevin) or 'wlc' (Marko–Siggia).
    :param contour_nm: contour length Lc (nm).
    :param temperature_k: temperature (K).
    :param segment_nm: FJC Kuhn length b (nm).
    :param persistence_nm: WLC persistence length p (nm).
    :param force_grid: force grid bounds for the FJC curve (pN).
    :param probe_force_pn: report the extension at this force instead of a grid.
    :param probe_extension_nm: report the force at this extension (WLC).
    :param grid_points: number of curve samples.
    :returns: {status, model, curve|probes, contourNm, definitions}
    """
    if contour_nm <= 0.0 or temperature_k <= 0.0 or grid_points < 2:
        raise ValueError("contour/temperature must be positive and grid_points >= 2")
    definitions = {
        "contourNm": "chain contour length Lc (nm)",
        "forcePn": "end-to-end force (pN)",
        "extensionNm": "end-to-end extension (nm)",
    }
    if model == "fjc":
        if segment_nm <= 0.0 or contour_nm < segment_nm:
            raise ValueError("FJC needs segment_nm > 0 and contour >= segment")
        segments = max(int(round(contour_nm / segment_nm)), 1)
        if probe_force_pn is not None:
            extension = fjc_extension(segment_nm, segments, probe_force_pn, temperature_k)
            return {
                "status": "OK",
                "model": "fjc",
                "segments": segments,
                "contourNm": contour_nm,
                "probe": {"forcePn": probe_force_pn, "extensionNm": float(extension)},
                "definitions": definitions,
            }
        grid = np.linspace(force_grid[0], force_grid[1], grid_points)
        return {
            "status": "OK",
            "model": "fjc",
            "segments": segments,
            "contourNm": contour_nm,
            "curve": {
                "forcePn": [round(float(v), 6) for v in grid],
                "extensionNm": [
                    round(float(v), 6)
                    for v in fjc_extension(segment_nm, segments, grid, temperature_k)
                ],
            },
            "definitions": definitions,
        }
    if model == "wlc":
        if persistence_nm <= 0.0:
            raise ValueError("WLC needs persistence_nm > 0")
        if probe_extension_nm is not None:
            if not 0.0 < probe_extension_nm < contour_nm:
                raise ValueError("probe extension must lie strictly inside (0, contour)")
            force = wlc_force(persistence_nm, contour_nm, probe_extension_nm, temperature_k)
            return {
                "status": "OK",
                "model": "wlc",
                "contourNm": contour_nm,
                "persistenceNm": persistence_nm,
                "probe": {"forcePn": float(force), "extensionNm": probe_extension_nm},
                "definitions": definitions,
            }
        fraction = np.linspace(0.01, 0.99, grid_points)
        extension = fraction * contour_nm
        force = wlc_force(persistence_nm, contour_nm, extension, temperature_k)
        return {
            "status": "OK",
            "model": "wlc",
            "contourNm": contour_nm,
            "persistenceNm": persistence_nm,
            "curve": {
                "forcePn": [round(float(v), 6) for v in force],
                "extensionNm": [round(float(v), 6) for v in extension],
            },
            "definitions": definitions,
        }
    raise ValueError("model must be 'fjc' or 'wlc'")
