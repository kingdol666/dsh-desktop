"""PolyMechanism science MCP server (FastMCP, optional dependency).

Tools exposed as ``mcp__pm_science__<name>`` once wired through
``@deepseek-ai/dsh-mcp-client`` (see docs/polymechanism/09-API与工具契约.md §5).
The module imports lazily so the pure bridge stays usable without fastmcp.
"""

from __future__ import annotations

import os
from typing import Any

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

    return server


def main() -> None:  # pragma: no cover - entry point
    build_server().run()


if __name__ == "__main__":
    main()
