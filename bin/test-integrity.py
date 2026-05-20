#!/usr/bin/env python3
"""
test-integrity.py — TDD anti-tamper gate for the loop-plan skill.

Subcommands:
  snapshot      At RED: SHA-256 each test file, count assertions, scan skip markers,
                write JSON to ~/.claude/projects/<hash>/tdd-snapshots/<task-id>.json,
                AND append paths to _active_task_files.txt for PreToolUse hook to lock.
  verify        At GREEN: re-hash, re-count, re-scan; compare to snapshot. Exit 1 with
                per-file diff on tamper. Always clears the task's _active_task_files.txt
                entries on exit (success or failure).
  lock-task     Append paths to _active_task_files.txt without snapshotting (manual lock).
  unlock-task   Remove the task's entries from _active_task_files.txt (emergency release).
  scan-skips    Standalone language-aware skip-marker regex scan.
  count-asserts Standalone language-aware assertion counter.

Cite ADR-0008 (3-layer anti-tamper gate) + ADR-0001 (machine-local snapshot storage).
Stdlib-only. macOS POSIX-clean.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

SKIP_PATTERNS: dict[str, list[str]] = {
    ".py": [
        r"@pytest\.mark\.skip\b",
        r"@pytest\.mark\.skipif\b",
        r"\bpytest\.skip\(",
        r"@unittest\.skip\b",
        r"@unittest\.skipIf\b",
        r"@unittest\.skipUnless\b",
    ],
    ".ts": [
        r"\b(it|test|describe)\.skip\(",
        r"\bxit\(",
        r"\bxtest\(",
        r"\bxdescribe\(",
        r"\.skip\.each\(",
    ],
    ".tsx": [],
    ".js": [],
    ".jsx": [],
    ".mjs": [],
    ".cjs": [],
    ".java": [r"@Disabled\b", r"@Ignore\b"],
    ".kt": [r"@Disabled\b", r"@Ignore\b", r"\bxshould\b", r"\bxdescribe\("],
    ".kts": [r"@Disabled\b", r"@Ignore\b"],
    ".swift": [r"\bXCTSkip(?:If|Unless)?\(", r"^\s*func\s+\w*[Dd]isabled"],
}
for _ext in (".tsx", ".js", ".jsx", ".mjs", ".cjs"):
    SKIP_PATTERNS[_ext] = SKIP_PATTERNS[".ts"]

ASSERT_PATTERNS: dict[str, list[str]] = {
    ".py": [
        r"^\s*assert\s",
        r"\bassert\s+\w",
        r"\.assert(?:Equal|True|False|Raises|In|NotIn|Is|IsNone|IsNotNone|Greater|Less|AlmostEqual)\(",
        r"\bpytest\.raises\(",
    ],
    ".ts": [
        r"\bexpect\(",
        r"\bassert(?:Equal|Strict|Deep|Match)?\(",
        r"\bshould\.",
    ],
    ".tsx": [],
    ".js": [],
    ".jsx": [],
    ".mjs": [],
    ".cjs": [],
    ".java": [
        r"\bassert(?:That|Equals|True|False|Null|NotNull|Same|NotSame)\(",
        r"\bAssertions\.",
    ],
    ".kt": [
        r"\bassert(?:That|Equals|True|False|NotNull|Null|Same|NotSame)\(",
        r"\b\w+\s+shouldBe\b",
        r"\bshouldThrow\b",
    ],
    ".kts": [r"\bassert(?:That|Equals|True|False|NotNull|Null)\("],
    ".swift": [
        r"\bXCTAssert(?:Equal|True|False|Nil|NotNil|Throws|NoThrow|Identical|GreaterThan|LessThan)?\(",
    ],
}
for _ext in (".tsx", ".js", ".jsx", ".mjs", ".cjs"):
    ASSERT_PATTERNS[_ext] = ASSERT_PATTERNS[".ts"]


def die(msg: str, code: int = 1) -> None:
    print(f"test-integrity: {msg}", file=sys.stderr)
    sys.exit(code)


def project_hash(root: Path) -> str:
    canonical = str(root.resolve())
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]


def snapshots_dir(root: Path) -> Path:
    return Path.home() / ".claude" / "projects" / project_hash(root) / "tdd-snapshots"


def active_locks_file(root: Path) -> Path:
    return snapshots_dir(root) / "_active_task_files.txt"


def validate_root(root_str: str) -> Path:
    root = Path(root_str).expanduser()
    if not root.is_dir():
        die(f"--root {root} is not a directory")
    return root.resolve()


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def patterns_for(path: Path, table: dict[str, list[str]]) -> list[str]:
    return table.get(path.suffix, [])


def count_asserts_in(path: Path) -> int:
    pats = patterns_for(path, ASSERT_PATTERNS)
    if not pats:
        return 0
    text = path.read_text(encoding="utf-8", errors="replace")
    total = 0
    for p in pats:
        total += len(re.findall(p, text, flags=re.MULTILINE))
    return total


def scan_skips_in(path: Path) -> list[str]:
    pats = patterns_for(path, SKIP_PATTERNS)
    if not pats:
        return []
    text = path.read_text(encoding="utf-8", errors="replace")
    found: list[str] = []
    for p in pats:
        for m in re.finditer(p, text, flags=re.MULTILINE):
            found.append(m.group(0))
    return found


def append_locks(root: Path, task_id: str, files: list[Path]) -> None:
    snapshots_dir(root).mkdir(parents=True, exist_ok=True)
    locks = active_locks_file(root)
    existing: set[str] = set()
    if locks.exists():
        existing = {ln.strip() for ln in locks.read_text(encoding="utf-8").splitlines() if ln.strip()}
    new_lines: list[str] = []
    for fp in files:
        line = f"{fp.resolve()}:{task_id}"
        if line not in existing:
            new_lines.append(line)
            existing.add(line)
    if new_lines:
        with locks.open("a", encoding="utf-8") as f:
            for ln in new_lines:
                f.write(ln + "\n")


def remove_locks(root: Path, task_id: str) -> int:
    locks = active_locks_file(root)
    if not locks.exists():
        return 0
    suffix = f":{task_id}"
    kept: list[str] = []
    removed = 0
    for ln in locks.read_text(encoding="utf-8").splitlines():
        if ln.endswith(suffix):
            removed += 1
            continue
        if ln.strip():
            kept.append(ln)
    if kept:
        locks.write_text("\n".join(kept) + "\n", encoding="utf-8")
    else:
        try:
            locks.unlink()
        except FileNotFoundError:
            pass
    return removed


def cmd_snapshot(args: argparse.Namespace) -> int:
    root = validate_root(args.root)
    files = [Path(f).expanduser() for f in args.files]
    for fp in files:
        if not fp.is_file():
            die(f"file not found: {fp}")
    snap_dir = snapshots_dir(root)
    snap_dir.mkdir(parents=True, exist_ok=True)
    snap_path = snap_dir / f"{args.task}.json"

    files_block: dict[str, dict] = {}
    for fp in files:
        try:
            rel = str(fp.resolve().relative_to(root))
        except ValueError:
            rel = str(fp.resolve())
        files_block[rel] = {
            "abs_path": str(fp.resolve()),
            "sha256": file_sha256(fp),
            "assertion_count": count_asserts_in(fp),
            "skip_markers": scan_skips_in(fp),
        }

    payload = {
        "task_id": args.task,
        "snapshot_at": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "root": str(root),
        "files": files_block,
    }
    snap_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    append_locks(root, args.task, files)

    print(f"snapshot written: {snap_path}")
    print(f"locks appended for task {args.task}: {len(files)} file(s)")
    return 0


def cmd_verify(args: argparse.Namespace) -> int:
    root = validate_root(args.root)
    snap_path = snapshots_dir(root) / f"{args.task}.json"
    if not snap_path.is_file():
        remove_locks(root, args.task)
        die(f"no snapshot for task {args.task} at {snap_path}")

    try:
        snap = json.loads(snap_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        remove_locks(root, args.task)
        die(f"snapshot corrupt: {e}")

    diffs: list[str] = []
    for rel, info in snap["files"].items():
        abs_path = Path(info.get("abs_path") or (root / rel))
        if not abs_path.is_file():
            diffs.append(f"  {rel}\n    - file missing (was present at snapshot)")
            continue
        cur_hash = file_sha256(abs_path)
        cur_asserts = count_asserts_in(abs_path)
        cur_skips = scan_skips_in(abs_path)

        problems: list[str] = []
        if cur_hash != info["sha256"]:
            problems.append(f"hash changed: {info['sha256'][:12]}... -> {cur_hash[:12]}...")
        if cur_asserts < info["assertion_count"]:
            problems.append(
                f"assertion count dropped: {info['assertion_count']} -> {cur_asserts}"
            )
        baseline = set(info.get("skip_markers", []))
        new_skips = [s for s in cur_skips if s not in baseline]
        if new_skips:
            problems.append(f"new skip markers: {new_skips}")
        if problems:
            diffs.append(f"  {rel}\n    - " + "\n    - ".join(problems))

    removed = remove_locks(root, args.task)

    if diffs:
        print(f"TAMPER DETECTED in task {args.task}:", file=sys.stderr)
        for d in diffs:
            print(d, file=sys.stderr)
        print(f"locks released: {removed} entr(y/ies)", file=sys.stderr)
        return 1

    print(f"verify OK for task {args.task}")
    print(f"locks released: {removed} entr(y/ies)")
    return 0


def cmd_lock_task(args: argparse.Namespace) -> int:
    if not args.files:
        die("--files required")
    root_anchor = Path(args.files[0]).expanduser().resolve().parent
    while not (root_anchor / ".git").is_dir() and root_anchor != root_anchor.parent:
        root_anchor = root_anchor.parent
    root = root_anchor if (root_anchor / ".git").is_dir() else Path.cwd().resolve()
    files = [Path(f).expanduser() for f in args.files]
    for fp in files:
        if not fp.exists():
            die(f"file not found: {fp}")
    append_locks(root, args.task, files)
    print(f"locked {len(files)} file(s) for task {args.task} (root: {root})")
    return 0


def cmd_unlock_task(args: argparse.Namespace) -> int:
    projects = (Path.home() / ".claude" / "projects").glob("*/tdd-snapshots/_active_task_files.txt")
    total = 0
    for locks in projects:
        suffix = f":{args.task}"
        kept: list[str] = []
        removed = 0
        for ln in locks.read_text(encoding="utf-8").splitlines():
            if ln.endswith(suffix):
                removed += 1
                continue
            if ln.strip():
                kept.append(ln)
        if kept:
            locks.write_text("\n".join(kept) + "\n", encoding="utf-8")
        else:
            try:
                locks.unlink()
            except FileNotFoundError:
                pass
        total += removed
    print(f"unlocked {total} entr(y/ies) for task {args.task}")
    return 0


def cmd_scan_skips(args: argparse.Namespace) -> int:
    any_found = False
    for f in args.files:
        path = Path(f).expanduser()
        if not path.is_file():
            die(f"file not found: {path}")
        skips = scan_skips_in(path)
        if skips:
            any_found = True
            print(f"{path}: {len(skips)} skip marker(s): {skips}")
        else:
            print(f"{path}: 0 skip markers")
    return 1 if any_found else 0


def cmd_count_asserts(args: argparse.Namespace) -> int:
    for f in args.files:
        path = Path(f).expanduser()
        if not path.is_file():
            die(f"file not found: {path}")
        print(f"{path}: {count_asserts_in(path)}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="test-integrity", description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("snapshot", help="Snapshot test files at RED + lock them")
    s.add_argument("--root", required=True)
    s.add_argument("--task", required=True)
    s.add_argument("--files", required=True, nargs="+")
    s.set_defaults(func=cmd_snapshot)

    v = sub.add_parser("verify", help="Verify test files at GREEN; clears lock either way")
    v.add_argument("--root", required=True)
    v.add_argument("--task", required=True)
    v.set_defaults(func=cmd_verify)

    l = sub.add_parser("lock-task", help="Manually append files to active locks")
    l.add_argument("--task", required=True)
    l.add_argument("--files", required=True, nargs="+")
    l.set_defaults(func=cmd_lock_task)

    u = sub.add_parser("unlock-task", help="Manually clear locks for a task")
    u.add_argument("--task", required=True)
    u.set_defaults(func=cmd_unlock_task)

    sk = sub.add_parser("scan-skips", help="Scan files for skip markers; exit 1 if any found")
    sk.add_argument("files", nargs="+")
    sk.set_defaults(func=cmd_scan_skips)

    ca = sub.add_parser("count-asserts", help="Count assertions per file")
    ca.add_argument("files", nargs="+")
    ca.set_defaults(func=cmd_count_asserts)

    return p


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
