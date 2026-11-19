"""Bridge to the existing oblique biaxial CAE engine (Node).

The engine at ``cae_root`` already ships a deterministic JSON CLI:

    node scripts/cae-run.mjs --mode run|coupon [--time S] [--params JSON]

This module never modifies the engine; it spawns it, captures the single JSON
line on stdout, and normalizes errors into :class:`CaeError`.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any, Mapping

CAE_SCRIPT = Path("scripts") / "cae-run.mjs"


class CaeError(RuntimeError):
    """Raised when the CAE engine cannot be executed or returns invalid output."""

    def __init__(self, message: str, *, returncode: int | None = None, stderr: str = "") -> None:
        super().__init__(message)
        self.returncode = returncode
        self.stderr = stderr


def _extract_json(stdout: str) -> dict[str, Any]:
    """Return the last JSON object printed on stdout (engine emits one JSON line)."""
    for line in reversed(stdout.strip().splitlines()):
        candidate = line.strip()
        if candidate.startswith("{"):
            try:
                parsed = json.loads(candidate)
            except json.JSONDecodeError:
                continue
            if isinstance(parsed, dict):
                return parsed
    raise CaeError("CAE engine did not print a JSON result")


def run_cae(
    cae_root: str | Path,
    *,
    mode: str = "run",
    time_s: float = 0.0,
    params: Mapping[str, Any] | None = None,
    extra_args: Mapping[str, Any] | None = None,
    timeout_s: float = 600.0,
) -> dict[str, Any]:
    """Execute one CAE run and return the parsed engine JSON.

    :param cae_root: absolute path to the oblique-biaxial-film-stretching-equipment checkout.
    :param mode: engine mode, ``run`` or ``coupon``.
    :param time_s: simulated process time in seconds.
    :param params: engine parameter overrides (material/machine/process keys).
    :param extra_args: additional CLI flags forwarded verbatim (values JSON-encoded).
    :param timeout_s: subprocess timeout in seconds.
    :raises CaeError: on a non-zero exit, timeout, or missing JSON output.
    """
    root = Path(cae_root)
    script = root / CAE_SCRIPT
    if not script.is_file():
        raise CaeError(f"CAE engine script not found: {script}")
    argv = ["node", str(script), "--mode", mode]
    if mode == "run":
        argv += ["--time", str(time_s)]
    if params is not None:
        argv += ["--params", json.dumps(dict(params))]
    for key, value in (extra_args or {}).items():
        argv += [f"--{key}", value if isinstance(value, str) else json.dumps(value)]
    try:
        completed = subprocess.run(
            argv,
            cwd=str(root),
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=timeout_s,
            check=False,
        )
    except subprocess.TimeoutExpired as cause:
        raise CaeError(f"CAE run timed out after {timeout_s}s") from cause
    if completed.returncode != 0:
        raise CaeError(
            f"CAE run failed with exit code {completed.returncode}",
            returncode=completed.returncode,
            stderr=completed.stderr[-2000:],
        )
    return _extract_json(completed.stdout)


def summarize(result: Mapping[str, Any]) -> dict[str, Any]:
    """Reduce one engine result to the fields the evidence ledger needs."""
    provenance = result.get("provenance") or {}
    runtime = provenance.get("runtime") or {}
    return {
        "status": result.get("status"),
        "valid": result.get("valid"),
        "model": result.get("model"),
        "schemaVersion": result.get("schemaVersion"),
        "sourceSha256": runtime.get("sourceSha256"),
        "deterministic": runtime.get("deterministic"),
    }
