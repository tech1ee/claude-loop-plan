#!/usr/bin/env python3
"""verify-code-research.py — validate file:line citations in subagent reports.

Parses citations of the form `path:line — claimed_content` (or `path:N-M`),
reads the file, checks the claimed content is a substring of the cited line(s).
Designed to run after android-kmp-explorer / swiftui-explorer / generic Explore
subagents return — catches off-by-one lines, fabricated paths, and quote drift.

Usage:
    verify-code-research.py REPORT_FILE [--root PATH] [--json]
    verify-code-research.py - < report.md            # stdin

Exit codes:
    0 — all citations PASS
    1 — one or more FAIL or PARTIAL
    2 — usage error
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# Match `path:line` or `path:N-M`, optionally followed by `— claim` (em-dash variants).
# Path = chars/digits/underscore/dot/dash/slash, must end with `.<ext>`.
# Backticks around the citation or claim are tolerated.
CITATION_RE = re.compile(
    r"""
    `?                              # optional opening backtick around path:line
    (?P<path>[\w./\-]+\.[A-Za-z0-9]+) # file path (must have an extension)
    :
    (?P<line_start>\d+)
    (?:\s*[-–—]\s*(?P<line_end>\d+))?  # optional end line (- en-dash em-dash)
    `?                              # optional closing backtick
    (?:                             # optional content claim
        \s*[—–-]\s*       # separator: em/en-dash or hyphen
        `?(?P<claim>[^\n`]+?)`?     # claim (no newline; backtick-bounded if present)
    )?
    \s*(?=$|[\n\)])                 # end of line / paren close
    """,
    re.VERBOSE | re.MULTILINE,
)

# Inverted form: `<claim>` at `<path>:<line>` — claim BEFORE the path.
INVERTED_RE = re.compile(
    r"""
    `(?P<claim>[^`\n]{4,})`           # backticked claim
    \s+at\s+
    `?(?P<path>[\w./\-]+\.[A-Za-z0-9]+) # path
    :(?P<line_start>\d+)
    (?:[-–—](?P<line_end>\d+))?
    `?
    """,
    re.VERBOSE,
)


def normalize(s: str) -> str:
    """Normalize whitespace + smart quotes for substring comparison."""
    if not s:
        return ""
    s = s.replace("‘", "'").replace("’", "'")
    s = s.replace("“", '"').replace("”", '"')
    s = re.sub(r"\s+", " ", s).strip()
    return s


def normalize_strict(s: str) -> str:
    """Aggressive normalize: strip ALL whitespace and lowercase.
    Used as a fallback for quotes where the file collapses multi-line statements
    and inner-paren whitespace differs from the claim."""
    return re.sub(r"\s+", "", normalize(s)).lower()


SKIP_DIR_FRAGMENTS = ("/build/", "/.gradle/", "/.git/", "/node_modules/",
                       "/DerivedData/", "/.build/", "/Pods/", "/.idea/")


def _is_skipped(p: Path) -> bool:
    s = str(p)
    return any(frag in s for frag in SKIP_DIR_FRAGMENTS)


def resolve_path(path_str: str, root: Path) -> Path:
    """Resolve a citation path. Handles:
    - absolute paths (use directly)
    - relative paths under root (use directly if exists)
    - bare basenames (rglob from root, prefer match)
    - elision like 'androidMain/.../PlatformModule.kt' (basename + path-fragment hint)
    """
    p = Path(path_str)
    if p.is_absolute():
        return p
    direct = (root / path_str).resolve()
    if direct.exists():
        return direct
    # Strip any '...' elision and use the trailing basename as the search target,
    # plus the leading non-elision fragment as a path hint.
    parts = [pp for pp in path_str.split("/") if pp and pp != "..."]
    if not parts:
        return direct
    target_name = parts[-1]
    hint = "/".join(parts[:-1])  # may be empty
    matches = [m for m in root.rglob(target_name) if not _is_skipped(m)]
    if not matches:
        return direct  # will fail in read step
    if len(matches) == 1:
        return matches[0]
    # Multiple matches — score by how much of the hint appears in the path
    if hint:
        scored = [(str(m).count(hint), len(str(m)), m) for m in matches]
        scored.sort(key=lambda x: (-x[0], x[1]))
        if scored[0][0] > 0:
            return scored[0][2]
    # Otherwise prefer shortest absolute path (least likely to be in nested test)
    matches.sort(key=lambda m: len(str(m)))
    return matches[0]


def auto_detect_root(report_text: str, fallback: Path) -> Path:
    """If the report has absolute paths, find the deepest common ancestor
    that contains a project marker (.git, build.gradle.kts, package.json,
    Package.swift, *.xcodeproj). Falls back to CWD."""
    abs_paths = []
    for m in re.finditer(r"`?(/[\w./\-]+\.[A-Za-z0-9]+)`?:\d", report_text):
        ap = Path(m.group(1))
        if ap.exists() and ap.is_file():
            abs_paths.append(ap)
    if not abs_paths:
        return fallback
    # walk up from the first absolute path until we find a project marker
    markers = (".git", "build.gradle.kts", "build.gradle", "settings.gradle.kts",
               "package.json", "Package.swift", "Cargo.toml", "pyproject.toml")
    for ancestor in [abs_paths[0].parent, *abs_paths[0].parents]:
        if any((ancestor / m).exists() for m in markers):
            return ancestor
    return fallback


def read_lines(path: Path, start: int, end: int | None,
               clamp: bool = False) -> tuple[bool, str, str]:
    """Returns (ok, content, error). With clamp=True, end > EOF is clamped to EOF
    rather than treated as an error (used for COLLAPSED / OFF_BY_ONE expansion)."""
    if not path.exists():
        return False, "", "file not found"
    if not path.is_file():
        return False, "", "not a regular file"
    try:
        with path.open(encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
    except OSError as e:
        return False, "", f"read error: {e}"
    n = len(lines)
    e = end if end is not None else start
    if start < 1 or start > n:
        return False, "", f"line {start} out of range (file has {n} lines)"
    if e > n:
        if clamp:
            e = n
        else:
            return False, "", f"line {start}-{e} out of range (file has {n} lines)"
    return True, "".join(lines[start - 1 : e]), ""


def verify_citation(c: dict, root: Path) -> dict:
    path = resolve_path(c["path"], root)
    ok, content, err = read_lines(path, c["line_start"], c["line_end"])
    res = {
        **c,
        "resolved_path": str(path),
        "verdict": None,
        "notes": "",
        "file_content": content,
    }
    if not ok:
        res["verdict"] = "FAIL"
        res["notes"] = err
        return res
    if c["claim"] is None:
        res["verdict"] = "PASS"
        res["notes"] = "(file:line exists; no content claim to verify)"
        return res
    claim_n = normalize(c["claim"]).strip("`")
    content_n = normalize(content)
    if claim_n and claim_n in content_n:
        res["verdict"] = "PASS"
        res["notes"] = "exact substring"
        return res
    # COLLAPSED check: claim is a multi-line statement around line_start.
    # Look 2 lines backward (in case agent cited the body line of a `single { ... }` block
    # whose opener is above) through 10 lines forward.
    end_line = c["line_end"] or c["line_start"]
    win_start = max(1, c["line_start"] - 2)
    win_end = end_line + 10
    ok2, expanded, _ = read_lines(path, win_start, win_end, clamp=True)
    if ok2:
        exp_n = normalize(expanded)
        # Try strict (whitespace-collapsed) substring match first
        if claim_n in exp_n:
            res["verdict"] = "COLLAPSED"
            res["notes"] = f"claim found in lines {win_start}-{win_end} (multi-line/wrapped)"
            return res
        # Fall back to ultra-strict (all whitespace stripped) — handles `(\n    foo,` vs `(foo,`
        if normalize_strict(c["claim"]) in normalize_strict(expanded):
            res["verdict"] = "COLLAPSED"
            res["notes"] = f"claim matches lines {win_start}-{win_end} ignoring inner whitespace"
            return res
    # Off-by-one check: scan ±3 lines, smaller |delta| first
    for delta in (-1, 1, -2, 2, -3, 3):
        adj_start = c["line_start"] + delta
        if adj_start < 1:
            continue
        ok3, alt, _ = read_lines(path, adj_start, adj_start)
        if ok3 and claim_n in normalize(alt):
            res["verdict"] = "OFF_BY_ONE"
            res["notes"] = f"claim is on line {adj_start} (delta {delta:+d}), not {c['line_start']}"
            return res
    # PARTIAL last resort: first 30 chars match expanded range
    short = claim_n[:30]
    if short and ok2 and short in normalize(expanded):
        res["verdict"] = "PARTIAL"
        res["notes"] = "first 30 chars match nearby; rest diverges"
        return res
    res["verdict"] = "FAIL"
    snippet = content_n[:80].replace("\n", " ")
    res["notes"] = f"claim not in line. file has: {snippet}"
    return res


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.strip().split("\n")[0])
    ap.add_argument("report", help="path to report file (or '-' for stdin)")
    ap.add_argument("--root", default=".", help="project root for relative paths")
    ap.add_argument("--json", action="store_true", help="emit JSON instead of table")
    args = ap.parse_args()

    text = sys.stdin.read() if args.report == "-" else Path(args.report).read_text()
    explicit_root = Path(args.root).resolve()
    root = auto_detect_root(text, explicit_root) if args.root == "." else explicit_root

    raw = []
    for m in CITATION_RE.finditer(text):
        raw.append({
            "path": m["path"],
            "line_start": int(m["line_start"]),
            "line_end": int(m["line_end"]) if m["line_end"] else None,
            "claim": (m["claim"] or "").strip() or None,
        })
    # Inverted-form pass: `<claim>` at `<path>:<line>`
    for m in INVERTED_RE.finditer(text):
        raw.append({
            "path": m["path"],
            "line_start": int(m["line_start"]),
            "line_end": int(m["line_end"]) if m["line_end"] else None,
            "claim": m["claim"].strip() or None,
        })

    seen = set()
    citations = []
    for c in raw:
        key = (c["path"], c["line_start"], c["line_end"], c["claim"])
        if key not in seen:
            seen.add(key)
            citations.append(c)

    results = [verify_citation(c, root) for c in citations]

    if args.json:
        print(json.dumps({
            "root": str(root),
            "raw_matches": len(raw),
            "unique_citations": len(citations),
            "results": [{k: v for k, v in r.items() if k != "file_content"} for r in results],
        }, indent=2))
    else:
        if not results:
            print("No file:line citations found in report.", file=sys.stderr)
            return 0
        print(f"Root: {root}")
        print(f"Citations: {len(raw)} matched, {len(citations)} unique\n")
        print(f"{'#':>3} {'Verdict':<11} {'Path':<60} {'Line':<10} Notes")
        print("-" * 130)
        counts = {}
        for i, r in enumerate(results, 1):
            counts[r["verdict"]] = counts.get(r["verdict"], 0) + 1
            line_repr = f"{r['line_start']}-{r['line_end']}" if r["line_end"] else str(r["line_start"])
            short = r["resolved_path"]
            home = str(Path.home())
            if short.startswith(home):
                short = "~" + short[len(home):]
            if len(short) > 60:
                short = "..." + short[-57:]
            print(f"{i:>3} {r['verdict']:<11} {short:<60} {line_repr:<10} {r['notes']}")
        print()
        print("Summary: " + ", ".join(f"{n} {k}" for k, n in sorted(counts.items())))

    failed = sum(1 for r in results if r["verdict"] in ("FAIL", "OFF_BY_ONE"))
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
