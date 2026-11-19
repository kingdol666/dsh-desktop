"""Self-test: run the real CAE coupon through the bridge and assert the contract.

Usage: python -I src/pm_science/selftest.py <path-to-cae-checkout>
Exits 0 only when the engine returns a CONVERGED, valid result with provenance.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pm_science.cae import run_cae, summarize  # noqa: E402


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: selftest.py <cae-checkout-root>", file=sys.stderr)
        return 2
    result = run_cae(sys.argv[1], mode="coupon", extra_args={"mesh": "4,8", "stretch-x": "1.2", "stretch-y": "1.1"})
    summary = summarize(result)
    print(json.dumps(summary, ensure_ascii=False))
    checks = {
        "status converged": summary["status"] == "CONVERGED",
        "valid": summary["valid"] is True,
        "provenance hash": isinstance(summary["sourceSha256"], str) and len(summary["sourceSha256"]) == 64,
        "deterministic": summary["deterministic"] is True,
    }
    failed = [name for name, ok in checks.items() if not ok]
    for name, ok in checks.items():
        print(f"  [{'ok' if ok else 'FAIL'}] {name}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
