#!/usr/bin/env python3
"""should-run-codex.py — diff-size + security-class skip-on-trivial cost guard.

Decides whether a Codex review should fire for a given diff. Aligned with
Q3 clarification (<50 LOC OR test/docs-only) and ADR-0024. Telemetry-hook
emits SKIP/RUN counter line for threshold recalibration.

Output: `SKIP\\n<reason>` or `RUN\\n<reason>` on stdout (exit 0).
Exit 2 only on git invocation error.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import os
import re
import subprocess
import sys

LOC_THRESHOLD = 50
FILE_COUNT_CEILING = 2

ALWAYS_REVIEW = re.compile(
    r"(auth|payment|secret|\.env|credentials?|token|oauth|jwt|apikey|security|crypto|password"
    r"|defender|injection|homoglyph|sanitiz|redact|entitlement|sandbox)",
    re.IGNORECASE,
)

# Test or docs file classes — always-skip unless it's a lockfile or always-review.
ALWAYS_SKIP_CLASS = re.compile(
    r"(\.md$|\.txt$|\.rst$|LICENSE|CHANGELOG"
    r"|/tests?/|test_[^/]+\.py$|[^/]+Test\.kt$|[^/]+Spec\.swift$|[^/]+\.test\.[^/]+$)",
    re.IGNORECASE,
)

# Dependency-lock files — never skip (supply-chain).
LOCKFILE = re.compile(
    r"(package-lock\.json|yarn\.lock|Cargo\.lock|Podfile\.lock|gradle/wrapper|pnpm-lock\.yaml|requirements.*\.txt|poetry\.lock|composer\.lock)",
    re.IGNORECASE,
)

# Config-only file classes that count as "trivial" (lockfile override above).
CONFIG_SKIP = re.compile(r"(\.json$|\.yaml$|\.yml$|\.toml$|\.ini$)", re.IGNORECASE)


def _normalize_numstat_path(path: str) -> str:
    """Resolve a git rename path to the destination clean path.
    Handles 'old => new' and 'dir/{old => new}.py' brace forms."""
    if "=>" not in path:
        return path
    # brace form: prefix{old => new}suffix  -> prefix + new + suffix
    m = re.search(r"\{(.*?) => (.*?)\}", path)
    if m:
        return path[:m.start()] + m.group(2) + path[m.end():]
    # simple form: old => new
    return path.split("=>")[-1].strip()


def _parse_numstat(text: str) -> tuple[int, int, list[str]]:
    """Parse `git diff --numstat` output. Retains binary-file paths (loc 0) and
    normalizes rename paths to the clean destination so security/skip regexes see
    a real filename. Returns (total_loc, file_count, files)."""
    loc = 0
    files: list[str] = []
    for line in text.splitlines():
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        a, b, path = parts[0], parts[1], parts[2]
        try:
            loc += int(a or 0) + int(b or 0)
        except ValueError:
            pass  # binary file: columns are '-'; contribute 0 LOC but KEEP the path
        files.append(_normalize_numstat_path(path))
    return loc, len(files), files


def decide(loc_delta: int, file_count: int, files: list[str], security_class: bool = False) -> tuple[str, str]:
    """Return (decision, reason) per the gate rules."""
    if security_class:
        return "RUN", "security-class override (forced)"

    if file_count == 0 and loc_delta == 0:
        return "SKIP", "empty diff"

    # 1. Lockfile dependency bump → always RUN (supply-chain override).
    if any(LOCKFILE.search(f) for f in files):
        return "RUN", "lock-bump (supply-chain — always-review)"

    # 2. Security-class file → always RUN.
    if any(ALWAYS_REVIEW.search(f) for f in files):
        return "RUN", "always-review file class (security-sensitive)"

    # 3. All files in always-skip-class → SKIP regardless of LOC.
    skippable = [
        f
        for f in files
        if ALWAYS_SKIP_CLASS.search(f) or CONFIG_SKIP.search(f)
    ]
    if files and len(skippable) == len(files):
        return "SKIP", "all files in always-skip class (docs/tests/config)"

    # 4. Threshold check.
    if loc_delta < LOC_THRESHOLD and file_count <= FILE_COUNT_CEILING:
        return "SKIP", f"below threshold ({loc_delta} LOC, {file_count} files)"

    return "RUN", f"above threshold ({loc_delta} LOC, {file_count} files)"


def log_decision(decision: str, reason: str, loc: int, file_count: int) -> None:
    """Append a telemetry line for ADR-0024 recalibration."""
    log_path = os.environ.get(
        "CODEX_GATE_LOG",
        os.path.expanduser("~/.claude/.codex-gate-decisions.log"),
    )
    try:
        ts = _dt.datetime.now().isoformat()
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(f"{ts}\t{decision}\t{loc}\t{file_count}\t{reason}\n")
    except OSError:
        pass


def _git_diff_stats(base: str, head: str, cwd: str) -> tuple[int, int, list[str]]:
    """Return (loc_delta, file_count, files) from git diff."""
    out = subprocess.check_output(
        ["git", "diff", "--numstat", "--no-renames", f"{base}..{head}"], cwd=cwd, text=True
    )
    return _parse_numstat(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-sha", default="HEAD~1")
    ap.add_argument("--head-sha", default="HEAD")
    ap.add_argument("--cwd", default=os.getcwd())
    ap.add_argument("--loc", type=int, help="bypass git, pass LOC delta directly (testing)")
    ap.add_argument("--files", nargs="*", help="bypass git, pass file list directly (testing)")
    ap.add_argument("--security-class", action="store_true")
    args = ap.parse_args()

    security = bool(args.security_class) or os.environ.get("CODEX_FORCE_SECURITY") == "1"

    if args.loc is not None and args.files is not None:
        loc, files = args.loc, args.files
        file_count = len(files)
    else:
        try:
            loc, file_count, files = _git_diff_stats(args.base_sha, args.head_sha, args.cwd)
        except (subprocess.CalledProcessError, FileNotFoundError) as e:
            print(f"git error: {e}", file=sys.stderr)
            return 2

    decision, reason = decide(loc, file_count, files, security_class=security)
    log_decision(decision, reason, loc, file_count)
    print(decision)
    print(reason)
    return 0


if __name__ == "__main__":
    sys.exit(main())
