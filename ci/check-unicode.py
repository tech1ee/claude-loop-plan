#!/usr/bin/env python3
"""check-unicode.py — CI gate that rejects skill/agent files with hidden Unicode.

Scans for bidi markers, zero-width characters, and other invisible Unicode
that can be used to inject prompt payloads that appear safe in editors.

Exit 0 = clean. Exit 1 = suspicious characters found (CI fails).
"""
from __future__ import annotations

import sys
from pathlib import Path

SUSPICIOUS = {
    "​": "zero-width space (U+200B)",
    "‌": "zero-width non-joiner (U+200C)",
    "‍": "zero-width joiner (U+200D)",
    "‪": "left-to-right embedding (U+202A)",
    "‫": "right-to-left embedding (U+202B)",
    "‬": "pop directional formatting (U+202C)",
    "‭": "left-to-right override (U+202D)",
    "‮": "right-to-left override (U+202E)",
    "⁠": "word joiner (U+2060)",
    "⁡": "function application (U+2061)",
    "⁢": "invisible times (U+2062)",
    "⁣": "invisible separator (U+2063)",
    "⁤": "invisible plus (U+2064)",
    "﻿": "BOM / zero-width no-break space (U+FEFF)",
    "­": "soft hyphen (U+00AD)",
    "͏": "combining grapheme joiner (U+034F)",
}


def check_file(path: Path) -> list[str]:
    findings = []
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError as e:
        return [f"  {path}: read error — {e}"]
    for lineno, line in enumerate(text.splitlines(), 1):
        for char, name in SUSPICIOUS.items():
            if char in line:
                findings.append(f"  {path}:{lineno}: {name}")
    return findings


def main() -> int:
    targets = sys.argv[1:]
    if not targets:
        print("Usage: check-unicode.py <file-or-dir>...", file=sys.stderr)
        return 2

    findings: list[str] = []
    for target in targets:
        p = Path(target)
        if p.is_dir():
            for f in p.rglob("*.md"):
                findings.extend(check_file(f))
        elif p.is_file():
            findings.extend(check_file(p))

    if findings:
        print("FAIL — hidden Unicode detected:", file=sys.stderr)
        for f in findings:
            print(f, file=sys.stderr)
        return 1
    print("OK — no hidden Unicode found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
