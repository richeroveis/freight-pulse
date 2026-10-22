#!/usr/bin/env python3
"""Fail if any contract public write method has no binding in the frontend.

The reviewer's core complaint was that the DApp flow promised lifecycle actions
the frontend never signed. This guard ties the two together: every
``@gl.public.write`` method in contracts/freight_pulse.py must appear as a quoted
function name inside a frontend file that also drives ``writeContract`` (through
the shared ``sendWrite`` helper). Run it in CI so a future lifecycle method cannot
ship without a UI binding.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "contracts" / "freight_pulse.py"
FRONTEND_SRC = ROOT / "frontend" / "src"

WRITE_DECORATOR = "@gl.public.write"
METHOD_RE = re.compile(r"^\s*def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(")


def public_write_methods() -> list[str]:
    if not CONTRACT_PATH.exists():
        raise SystemExit(f"contract not found: {CONTRACT_PATH}")
    methods: list[str] = []
    lines = CONTRACT_PATH.read_text(encoding="utf-8").splitlines()
    pending = False
    for line in lines:
        if line.strip() == WRITE_DECORATOR:
            pending = True
            continue
        if pending:
            match = METHOD_RE.match(line)
            if match:
                methods.append(match.group(1))
            pending = False
    return methods


def binding_sources() -> list[tuple[str, str]]:
    """Return (relative path, text) for frontend files that sign transactions."""
    sources: list[tuple[str, str]] = []
    for path in sorted(FRONTEND_SRC.rglob("*.ts*")):
        text = path.read_text(encoding="utf-8")
        if "writeContract" in text or "sendWrite" in text:
            sources.append((path.relative_to(ROOT).as_posix(), text))
    return sources


def covered_bindings(sources: list[tuple[str, str]]) -> dict[str, list[str]]:
    covered: dict[str, list[str]] = {}
    for method in public_write_methods():
        needle = f'"{method}"'
        files = [name for name, text in sources if needle in text]
        if files:
            covered[method] = files
    return covered


def main() -> int:
    methods = public_write_methods()
    sources = binding_sources()
    covered = covered_bindings(sources)

    missing = [method for method in methods if method not in covered]

    print(f"contract public write methods: {len(methods)}")
    for method in methods:
        if method in covered:
            print(f"  BOUND   {method}  <- {', '.join(covered[method])}")
        else:
            print(f"  MISSING {method}  (no writeContract/sendWrite binding in frontend/src)")

    if missing:
        print(
            f"\nFAIL: {len(missing)} lifecycle write method(s) have no frontend binding: "
            + ", ".join(missing),
        )
        return 1

    print(f"\nOK: all {len(methods)} contract write methods are bound in the frontend.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
