#!/usr/bin/env python3
"""generate-checksums.py — recompute checksums.txt for all installable files.

Run from the repo root. Writes checksums.txt in the format:
  <sha256>  <relative-path>

Compatible with `sha256sum -c checksums.txt`.
"""
from __future__ import annotations

import hashlib
import sys
from pathlib import Path

INSTALLABLE_DIRS = ["skills", "agents", "bin", "commands"]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    root = Path(".")
    lines: list[str] = []
    for d in INSTALLABLE_DIRS:
        for p in sorted((root / d).rglob("*")):
            if p.is_file():
                digest = sha256(p)
                rel = p.as_posix()
                lines.append(f"{digest}  {rel}")

    out = "\n".join(lines) + "\n"
    Path("checksums.txt").write_text(out)
    print(f"checksums.txt updated ({len(lines)} files).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
