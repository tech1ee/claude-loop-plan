#!/usr/bin/env python3
"""check-skill-safety.py — CI gate that rejects skill files with shell network fetches.

Looks for ```bash / ```sh / ```shell code blocks in Markdown files that contain
commands that could exfiltrate data or download malicious payloads.

Exit 0 = clean. Exit 1 = dangerous patterns found (CI fails).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

# Commands that should never appear in a bundled skill's shell blocks.
NETWORK_PATTERNS = [
    re.compile(r'\bcurl\s', re.IGNORECASE),
    re.compile(r'\bwget\s', re.IGNORECASE),
    re.compile(r'\bnc\s', re.IGNORECASE),            # netcat
    re.compile(r'\bnetcat\b', re.IGNORECASE),
    re.compile(r'\bpython3?\s+-c\s+', re.IGNORECASE),  # python -c "..." (eval)
    re.compile(r'\beval\s+', re.IGNORECASE),
    re.compile(r'\bexec\s+\$\(', re.IGNORECASE),
    re.compile(r'\bssh\s+', re.IGNORECASE),
    re.compile(r'\brsync\s+', re.IGNORECASE),
    re.compile(r'\bscp\s+', re.IGNORECASE),
]

SHELL_FENCE_RE = re.compile(r'^```(?:bash|sh|shell)\s*$', re.IGNORECASE)
CLOSE_FENCE_RE = re.compile(r'^```\s*$')


def check_file(path: Path) -> list[str]:
    findings = []
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError as e:
        return [f"  {path}: read error — {e}"]

    lines = text.splitlines()
    in_shell_block = False
    block_start = 0

    for lineno, line in enumerate(lines, 1):
        if not in_shell_block:
            if SHELL_FENCE_RE.match(line.strip()):
                in_shell_block = True
                block_start = lineno
        else:
            if CLOSE_FENCE_RE.match(line.strip()):
                in_shell_block = False
            else:
                for pat in NETWORK_PATTERNS:
                    if pat.search(line):
                        findings.append(
                            f"  {path}:{lineno}: dangerous pattern '{pat.pattern}' "
                            f"in shell block starting at line {block_start}"
                        )
    return findings


def main() -> int:
    targets = sys.argv[1:]
    if not targets:
        print("Usage: check-skill-safety.py <file-or-dir>...", file=sys.stderr)
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
        print("FAIL — dangerous shell commands in skill files:", file=sys.stderr)
        for f in findings:
            print(f, file=sys.stderr)
        return 1
    print("OK — no dangerous patterns found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
