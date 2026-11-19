"""PolyMechanism science MCP server (FastMCP, optional dependency).

Tools exposed as ``mcp__pm_science__<name>`` once wired through
``@deepseek-ai/dsh-mcp-client`` (see docs/polymechanism/09-API与工具契约.md §5).
The module imports lazily so the pure bridge stays usable without fastmcp.
"""

from __future__ import annotations

import os
from typing import Any

import numpy as np

from .cae import CaeError, run_cae, summarize

PM_CAE_ROOT = os.environ.get("PM_CAE_ROOT", "")


def _cae_root() -> str:
    if not PM_CAE_ROOT:
        raise RuntimeError("PM_CAE_ROOT environment variable is required")
    return PM_CAE_ROOT


def build_server() -> Any:
    """Construct the FastMCP server; requires the ``mcp`` extra."""
    try:
        from fastmcp import FastMCP
    except ImportError as cause:  # pragma: no cover - exercised only without extra
        raise RuntimeError("install the science extra first: pip install -e '.[mcp]'") from cause
    server: Any = FastMCP("pm_science")

    @server.tool
    def cae_run(mode: str = "run", time_s: float = 0.0, params: dict[str, Any] | None = None) -> dict[str, Any]:
        """Run the oblique biaxial CAE engine and return its verified JSON result."""
        result = run_cae(_cae_root(), mode=mode, time_s=time_s, params=params)
        return {"result": result, "summary": summarize(result)}

    @server.tool
    def cae_coupon(mesh: str = "4,8", stretch_x: float = 1.2, stretch_y: float = 1.1) -> dict[str, Any]:
        """Run the affine verification coupon (fast engine self-check)."""
        result = run_cae(
            _cae_root(),
            mode="coupon",
            extra_args={"mesh": mesh, "stretch-x": str(stretch_x), "stretch-y": str(stretch_y)},
        )
        return {"result": result, "summary": summarize(result)}

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

    return server


def main() -> None:  # pragma: no cover - entry point
    build_server().run()


if __name__ == "__main__":
    main()
