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
import ast
import hashlib
import json
import os
import re
import signal
import subprocess
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


# --- guard-mutation: source-level mutation testing of a SUT against its suite ---


def _collect_docstring_ids(tree: ast.AST) -> set:
    """Return id()s of Constant nodes that are docstrings.

    A docstring is a `str` Constant that is the value of the first statement
    (an ``ast.Expr``) in the body of a Module / ClassDef / FunctionDef /
    AsyncFunctionDef. Such constants are equivalent mutants — rewriting them
    never changes runtime behavior — so the string-literal mutation must skip
    them. (We detect the pattern directly rather than via ast.get_docstring so
    we get the NODE identity, not just the text.)
    """
    doc_ids: set = set()
    docstring_owners = (
        ast.Module,
        ast.ClassDef,
        ast.FunctionDef,
        ast.AsyncFunctionDef,
    )
    for node in ast.walk(tree):
        if isinstance(node, docstring_owners):
            body = getattr(node, "body", None)
            if body:
                first = body[0]
                if (
                    isinstance(first, ast.Expr)
                    and isinstance(first.value, ast.Constant)
                    and isinstance(first.value.value, str)
                ):
                    doc_ids.add(id(first.value))
    return doc_ids


class _MutationVisitor(ast.NodeVisitor):
    """Locates the first applicable node for each mutation kind.

    Records the earliest matching AST node per category. Source rewriting is done
    via ast.unparse on a deep-copied tree so each mutation yields a distinct,
    syntactically valid source.

    String-literal selection skips docstring constants (module/class/function/
    method level): mutating a docstring is an equivalent mutant that always
    survives, so it must not be chosen as the "first string literal".
    """

    def __init__(self) -> None:
        self.first_return = None      # ast.Return with a non-None, non-NameConstant value
        self.first_bool = None        # ast.Constant whose value is a bool
        self.first_compare_op = None  # (compare_node, op_index)
        self.first_number = None      # ast.Constant whose value is int/float (not bool)
        self.first_string = None      # ast.Constant whose value is str (non-docstring)
        self._docstring_ids: set = set()

    def visit(self, node: ast.AST):
        # When entering at a tree root, precompute the docstring-constant id set
        # for that exact tree so the string-literal selection can skip them.
        if isinstance(node, ast.Module):
            self._docstring_ids = _collect_docstring_ids(node)
        return super().visit(node)

    def visit_Return(self, node: ast.Return) -> None:
        if self.first_return is None and node.value is not None:
            # Skip `return None` / bare-None returns.
            if not (isinstance(node.value, ast.Constant) and node.value.value is None):
                self.first_return = node
        self.generic_visit(node)

    def visit_Compare(self, node: ast.Compare) -> None:
        if self.first_compare_op is None:
            for idx, op in enumerate(node.ops):
                if type(op) in _COMPARE_FLIP:
                    self.first_compare_op = (node, idx)
                    break
        self.generic_visit(node)

    def visit_Constant(self, node: ast.Constant) -> None:
        value = node.value
        if isinstance(value, bool):
            if self.first_bool is None:
                self.first_bool = node
        elif isinstance(value, (int, float)):
            if self.first_number is None:
                self.first_number = node
        elif isinstance(value, str):
            if self.first_string is None and id(node) not in self._docstring_ids:
                self.first_string = node
        self.generic_visit(node)


_COMPARE_FLIP = {
    ast.Eq: ast.NotEq,
    ast.NotEq: ast.Eq,
    ast.Lt: ast.GtE,
    ast.Gt: ast.LtE,
    ast.LtE: ast.Gt,
    ast.GtE: ast.Lt,
}


def _node_id(node: ast.AST) -> tuple:
    """Stable position key to relocate the target node in a fresh tree copy."""
    return (type(node).__name__, getattr(node, "lineno", -1), getattr(node, "col_offset", -1))


def generate_mutations(source: str) -> list[tuple[str, str]]:
    """Return a list of (description, mutated_source) tuples.

    Each mutation is applied to a fresh parse of the original source, so the
    mutations are independent. Mutations that do not apply or that produce
    source identical to the original are skipped.
    """
    try:
        base_tree = ast.parse(source)
    except SyntaxError:
        return []

    # HIGH-4: compute an UNPARSED baseline once. Comparing the mutated unparsed
    # source against the raw original would mistake cosmetic reformatting (which
    # ast.unparse always applies) for a real mutation. Roundtripping the original
    # the same way removes that noise so true no-op mutations are correctly
    # skipped. Wrapped in try/except: py3.9's ast.unparse has roundtrip bugs on
    # exotic syntax — if even the baseline fails to roundtrip, there is nothing
    # to compare against, so emit no mutations rather than crash.
    try:
        base_unparsed = ast.unparse(ast.parse(source))
    except Exception:
        return []

    scout = _MutationVisitor()
    scout.visit(base_tree)

    mutations: list[tuple[str, str]] = []

    def _emit(desc: str, mutate):
        # HIGH-4: each mutation regenerates from a fresh parse and re-unparses.
        # py3.9 ast.unparse can raise on otherwise-valid trees containing exotic
        # syntax — wrap the WHOLE parse/mutate/unparse so one bad mutation is
        # skipped gracefully instead of crashing the subcommand.
        try:
            tree = ast.parse(source)
            target_visitor = _MutationVisitor()
            target_visitor.visit(tree)
            node = mutate(target_visitor)
            if node is None:
                return
            mutated = ast.unparse(ast.fix_missing_locations(tree))
        except Exception:
            return
        # Compare against the UNPARSED baseline, not the raw source, so cosmetic
        # reformatting is not mistaken for a mutation and real no-ops are skipped.
        if mutated.strip() == base_unparsed.strip():
            return
        mutations.append((desc, mutated + "\n"))

    if scout.first_return is not None:
        def _do_return(v):
            node = v.first_return
            if node is None:
                return None
            node.value = ast.Constant(value=None)
            return node
        _emit("return <expr> -> return None", _do_return)

    if scout.first_bool is not None:
        def _do_bool(v):
            node = v.first_bool
            if node is None:
                return None
            node.value = not node.value
            return node
        orig = scout.first_bool.value
        _emit(f"flip boolean {orig} -> {not orig}", _do_bool)

    if scout.first_compare_op is not None:
        def _do_compare(v):
            pair = v.first_compare_op
            if pair is None:
                return None
            cmp_node, idx = pair
            new_op_cls = _COMPARE_FLIP[type(cmp_node.ops[idx])]
            cmp_node.ops[idx] = new_op_cls()
            return cmp_node
        old_op = type(scout.first_compare_op[0].ops[scout.first_compare_op[1]]).__name__
        new_op = _COMPARE_FLIP[type(scout.first_compare_op[0].ops[scout.first_compare_op[1]])].__name__
        _emit(f"flip comparison {old_op} -> {new_op}", _do_compare)

    if scout.first_number is not None:
        def _do_number(v):
            node = v.first_number
            if node is None:
                return None
            node.value = node.value + 1
            return node
        orig_n = scout.first_number.value
        _emit(f"increment number {orig_n} -> {orig_n + 1}", _do_number)

    if scout.first_string is not None:
        def _do_string(v):
            node = v.first_string
            if node is None:
                return None
            node.value = node.value + "_MUT"
            return node
        _emit("append _MUT to first string literal", _do_string)

    return mutations


def cmd_guard_mutation(args: argparse.Namespace) -> int:
    sut = Path(args.sut).expanduser()
    if not sut.is_file():
        die(f"--sut not found: {sut}")
    cwd = Path(args.cwd).expanduser() if args.cwd else sut.resolve().parent
    if not cwd.is_dir():
        die(f"--cwd not a directory: {cwd}")

    # HIGH-3: crash-recovery sidecar. The SUT is repeatedly mutated and restored
    # during this run; a crash mid-mutation would otherwise leave a corrupted
    # SUT on disk. The sidecar holds the canonical original bytes so a fresh run
    # (or a SIGTERM/SIGINT handler) can always restore the SUT.
    sidecar = sut.with_name(sut.name + ".guardmut.bak")

    if sidecar.exists():
        # A prior run crashed mid-mutation: the SUT on disk may be a mutant.
        # The sidecar holds the TRUE original — restore the SUT from it and
        # treat those bytes as the original for this run.
        original_bytes = sidecar.read_bytes()
        sut.write_bytes(original_bytes)
    else:
        original_bytes = sut.read_bytes()
        sidecar.write_bytes(original_bytes)

    try:
        source = original_bytes.decode("utf-8")
    except UnicodeDecodeError:
        # Clean up the sidecar we may have just written before bailing out.
        try:
            sidecar.unlink()
        except FileNotFoundError:
            pass
        die(f"--sut is not valid UTF-8: {sut}")

    # HIGH-3: install signal handlers so a kill mid-mutation restores the SUT and
    # removes the sidecar before exiting non-zero, instead of leaving a mutant on
    # disk. Save and restore the previous handlers around the run.
    def _on_signal(signum, frame):  # noqa: ANN001 — signal handler signature
        try:
            sut.write_bytes(original_bytes)
        finally:
            try:
                sidecar.unlink()
            except FileNotFoundError:
                pass
        os._exit(1)

    prev_handlers: dict = {}
    for _sig in (signal.SIGTERM, signal.SIGINT):
        try:
            prev_handlers[_sig] = signal.signal(_sig, _on_signal)
        except (ValueError, OSError):
            # Not in the main thread (or platform lacks the signal) — skip it.
            pass

    def _restore_handlers() -> None:
        for _sig, _prev in prev_handlers.items():
            try:
                signal.signal(_sig, _prev)
            except (ValueError, OSError):
                pass

    def _finalize_clean() -> None:
        """Restore the SUT, verify under -O, drop the sidecar, restore handlers.

        Returns normally on success. On a genuine restore failure it re-writes
        original_bytes, prints an error, and exits non-zero (leaving the sidecar
        as the recovery artifact).
        """
        sut.write_bytes(original_bytes)
        # -O-safe restore verification: an `assert` would be stripped under
        # `python -O`, so check explicitly and exit non-zero on mismatch.
        if sut.read_bytes() != original_bytes:
            sut.write_bytes(original_bytes)
            _restore_handlers()
            print(
                "test-integrity: guard-mutation failed to restore SUT "
                f"({sut}); sidecar kept for recovery: {sidecar}",
                file=sys.stderr,
            )
            sys.exit(1)
        try:
            sidecar.unlink()
        except FileNotFoundError:
            pass
        _restore_handlers()

    mutations = generate_mutations(source)

    if not mutations:
        _finalize_clean()
        print(f"guard-mutation: no applicable mutations for {sut} (inconclusive)")
        return 2

    breaks = max(0, int(args.breaks))
    if breaks:
        mutations = mutations[:breaks]

    survivors: list[str] = []
    applied = 0
    try:
        for desc, mutated_source in mutations:
            applied += 1
            sut.write_bytes(mutated_source.encode("utf-8"))
            try:
                proc = subprocess.run(
                    args.test_cmd,
                    shell=True,
                    cwd=str(cwd),
                    capture_output=True,
                )
            finally:
                # Restore immediately, before evaluating, so the SUT is never
                # left mutated between iterations or on exception.
                sut.write_bytes(original_bytes)
            caught = proc.returncode != 0
            if not caught:
                survivors.append(desc)
    finally:
        # Belt-and-suspenders: guarantee restoration on any exit path.
        sut.write_bytes(original_bytes)

    # Final restore verification + sidecar removal + handler restore. May exit
    # non-zero if the restore genuinely failed (sidecar then survives as the
    # recovery artifact).
    _finalize_clean()

    if survivors:
        for desc in survivors:
            print(f"SURVIVED: {desc}")
        print(
            f"guard-mutation: {len(survivors)}/{applied} mutation(s) survived "
            f"— suite is weak/tautological"
        )
        return 1

    print(f"guard-mutation OK: all {applied} applied mutation(s) caught")
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

    gm = sub.add_parser(
        "guard-mutation",
        help="Mutate the SUT and verify the suite catches each break (mutation testing)",
    )
    gm.add_argument("--sut", required=True, help="source file under test")
    gm.add_argument("--test-cmd", required=True, help="shell command; exit 0 == GREEN")
    gm.add_argument("--breaks", type=int, default=5, help="max mutations to apply")
    gm.add_argument("--cwd", default=None, help="working dir for test-cmd (default: SUT parent)")
    gm.set_defaults(func=cmd_guard_mutation)

    return p


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
