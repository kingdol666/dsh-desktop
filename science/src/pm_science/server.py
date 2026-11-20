"""PolyMechanism science MCP server (FastMCP, optional dependency).

Tools exposed as ``mcp__pm_science__<name>`` once wired through
``@deepseek-ai/dsh-mcp-client`` (see docs/polymechanism/09-API与工具契约.md §5).
The module imports lazily so the pure bridge stays usable without fastmcp.
"""

from __future__ import annotations

from typing import Any

import numpy as np


def build_server() -> Any:
    """Construct the FastMCP server; requires the ``mcp`` extra."""
    try:
        from fastmcp import FastMCP
    except ImportError as cause:  # pragma: no cover - exercised only without extra
        raise RuntimeError("install the science extra first: pip install -e '.[mcp]'") from cause
    server: Any = FastMCP("pm_science")

    @server.tool
    def waxs_crystallinity(two_theta_deg: list[float], intensity: list[float]) -> dict[str, Any]:
        """Decompose a 1-D WAXS profile: crystallinity index + peak table."""
        from .waxs import waxs_crystallinity as run

        return run(
            np.asarray(two_theta_deg, dtype=float),
            np.asarray(intensity, dtype=float),
        )

    @server.tool
    def ftir_peak_fit(wavenumber: list[float], absorbance: list[float]) -> dict[str, Any]:
        """Fit pseudo-Voigt peaks; hydrogen-bond and carbonyl indices."""
        from .ftir import ftir_peak_fit as run

        return run(np.asarray(wavenumber, dtype=float), np.asarray(absorbance, dtype=float))

    @server.tool
    def saxs_reduce(q: list[float], intensity: list[float], background: list[float] | None = None) -> dict[str, Any]:
        """1-D SAXS reduction: Guinier Rg + Porod slope."""
        from .saxs import saxs_reduce as run

        bg = np.asarray(background, dtype=float) if background is not None else None
        return run(np.asarray(q, dtype=float), np.asarray(intensity, dtype=float), bg)

    @server.tool
    def hermans_factor(azimuth_deg: list[float], intensity: list[float]) -> dict[str, Any]:
        """Hermans orientation factor from an azimuthal scan."""
        from .orientation import hermans_factor as run

        return run(np.asarray(azimuth_deg, dtype=float), np.asarray(intensity, dtype=float))

    @server.tool
    def fit_relaxation(time_s: list[float], signal: list[float], model: str = "kww") -> dict[str, Any]:
        """Fit Maxwell or KWW relaxation (params + rmse + halfTime)."""
        from .relax import fit_relaxation as run

        return run(np.asarray(time_s, dtype=float), np.asarray(signal, dtype=float), model=model)

    @server.tool
    def chain_mechanics(
        model: str,
        contour_nm: float,
        temperature_k: float,
        segment_nm: float = 1.0,
        persistence_nm: float = 1.0,
        probe_force_pn: float | None = None,
        probe_extension_nm: float | None = None,
    ) -> dict[str, Any]:
        """Single-chain mechanics (FJC/WLC): curve or single-point probe."""
        from .chain_mech import chain_mechanics as run

        return run(
            model,  # type: ignore[arg-type]
            contour_nm,
            temperature_k,
            segment_nm=segment_nm,
            persistence_nm=persistence_nm,
            probe_force_pn=probe_force_pn,
            probe_extension_nm=probe_extension_nm,
        )

    @server.tool
    def rubber_elasticity(
        mode: str,
        shear_modulus_mpa: float,
        links_per_chain: int,
        stretch_x: float = 1.0,
        stretch_y: float = 1.0,
        max_stretch: float = 2.0,
    ) -> dict[str, Any]:
        """8-chain (Arruda-Boyce) stresses and deformation work density."""
        from .rubber import rubber_elasticity as run

        return run(
            mode,  # type: ignore[arg-type]
            shear_modulus_mpa,
            links_per_chain,
            stretch_x=stretch_x,
            stretch_y=stretch_y,
            max_stretch=max_stretch,
        )

    @server.tool
    def rouse_spectrum(
        beads_per_chain: int,
        kuhn_length_nm: float,
        friction_per_bead: float,
        chain_number_density: float,
        temperature_k: float,
    ) -> dict[str, Any]:
        """Rouse linear-viscoelastic spectrum (τ modes, G(t), G'/G'')."""
        from .viscoelastic import rouse_spectrum as run

        return run(beads_per_chain, kuhn_length_nm, friction_per_bead, chain_number_density, temperature_k)

    @server.tool
    def shift_factors(
        model: str,
        reference_temperature_k: float,
        temperatures_k: list[float],
        c1: float = 17.44,
        c2_k: float = 51.6,
    ) -> dict[str, Any]:
        """WLF or VFT time-temperature shift factors log10(aT)."""
        from .viscoelastic import shift_factors as run

        return run(
            model,  # type: ignore[arg-type]
            reference_temperature_k,
            np.asarray(temperatures_k, dtype=float),
            c1=c1,
            c2_k=c2_k,
        )

    @server.tool
    def chain_stats(
        beads_per_chain: int,
        kuhn_length_nm: float,
        stretch_x: float = 1.0,
        stretch_y: float | None = None,
        stretch_z: float | None = None,
    ) -> dict[str, Any]:
        """Ideal-chain sizes + affine orientation factor f(λ)."""
        from .chain_stats import chain_stats as run

        return run(
            beads_per_chain,
            kuhn_length_nm,
            stretch_x=stretch_x,
            stretch_y=stretch_y,
            stretch_z=stretch_z,
        )

    @server.tool
    def avrami_fit(time_s: list[float], crystallinity: list[float]) -> dict[str, Any]:
        """Fit Avrami crystallization kinetics (n, K, halfTime)."""
        from .avrami import avrami_fit as run

        return run(np.asarray(time_s, dtype=float), np.asarray(crystallinity, dtype=float))

    @server.tool
    def flory_huggins(
        n1: int,
        n2: int,
        chi: float,
        phi: float = 0.5,
        temperature_k: float | None = None,
        chi_a: float | None = None,
        chi_b: float = 0.0,
    ) -> dict[str, Any]:
        """Flory-Huggins spinodal, critical point, and blend stability verdict."""
        from .flory import flory_huggins as run

        return run(
            n1,
            n2,
            chi=None if chi == 0.0 and chi_a is not None else chi,
            chi_a=chi_a,
            chi_b=chi_b,
            temperature_k=temperature_k,
            phi=phi,
        )

    @server.tool
    def tg_blend(part: str, **kwargs: float) -> dict[str, Any]:
        """Fox-Flory fit/predict or Gordon-Taylor blend glass transition."""
        from .tg_blend import tg_blend as run

        return run(part, **kwargs)

    @server.tool
    def diffusion(part: str, **kwargs: float) -> dict[str, Any]:
        """Arrhenius fit or Vrentas-Duda free-volume diffusivity."""
        from .diffusion import diffusion as run

        return run(part, **kwargs)  # type: ignore[arg-type]

    return server


def main() -> None:  # pragma: no cover - entry point
    build_server().run()


if __name__ == "__main__":
    main()
