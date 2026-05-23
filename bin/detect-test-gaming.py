#!/usr/bin/env python3
"""
detect-test-gaming.py — static lint of IMPL files for test-gaming, using TEST
files as context (T2g, Thread 4 / ADR-NEW-D).

Usage:
    detect-test-gaming.py --impl <files...> --tests <files...>

Detects an implementation that "games" its tests rather than implementing real
logic. Categories:
  hardcoded-expected    impl returns/assigns a literal that a test asserts as the
                        expected value (distinctive literals only).
  branch-on-test-input  impl branches on a literal value that a test passes as an
                        argument (distinctive literals only).
  dunder-override       impl class overrides __eq__/__hash__/__bool__ without being
                        a dataclass/attrs class (forces equality/truthiness).
  stack-introspection   impl peeks at the call stack to detect the test harness.
  sentinel-print        impl prints a success sentinel instead of doing real work.

Exit 1 + one `GAMING <category> <file>:<line> <snippet>` line per finding.
Exit 0 (prints "clean") if none. Files that fail to parse are skipped gracefully.

Stdlib-only (ast, argparse). Python 3.9-compatible.
"""
from __future__ import annotations

import argparse
import ast
import sys
from pathlib import Path

# Literals so common they would generate false positives if treated as distinctive.
_BORING_NUMBERS = {-1, 0, 1, 2}
_SENTINEL_STRINGS = {
    "PASS",
    "OK",
    "SUCCESS",
    "ALL TESTS PASS",
    "ALL TESTS PASSED",
    "DONE",
}
_DUNDERS = {"__eq__", "__hash__", "__bool__"}
_STACK_INTROSPECTION = {
    "inspect.stack",
    "sys._getframe",
    "traceback.extract_stack",
    "traceback.format_stack",
}


def _is_distinctive(value: object) -> bool:
    """A literal is distinctive enough to anchor a gaming heuristic."""
    if isinstance(value, str):
        return len(value) >= 4
    if isinstance(value, bool):
        # bool is a subclass of int but never distinctive.
        return False
    if isinstance(value, (int, float)):
        return value not in _BORING_NUMBERS
    return False


def _parse(path: Path):
    """Parse a file to an AST, or return None if it cannot be parsed/read."""
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    try:
        return ast.parse(text)
    except SyntaxError:
        return None


def _const_value(node: ast.AST):
    """Return the literal value of a constant node, or _NO_VALUE otherwise."""
    if isinstance(node, ast.Constant):
        return node.value
    return _NO_VALUE


class _NoValue:
    pass


_NO_VALUE = _NoValue()


def _snippet(node: ast.AST, lines: list[str]) -> str:
    lineno = getattr(node, "lineno", 0)
    if 1 <= lineno <= len(lines):
        return lines[lineno - 1].strip()
    return ""


def _dotted_name(node: ast.AST) -> str:
    """Best-effort dotted name for a Name/Attribute chain (e.g. inspect.stack)."""
    parts: list[str] = []
    cur = node
    while isinstance(cur, ast.Attribute):
        parts.append(cur.attr)
        cur = cur.value
    if isinstance(cur, ast.Name):
        parts.append(cur.id)
    else:
        return ""
    return ".".join(reversed(parts))


def _call_callee_name(call: ast.Call) -> str:
    """Last component of the callee name (handles plain and attribute calls)."""
    func = call.func
    if isinstance(func, ast.Attribute):
        return func.attr
    if isinstance(func, ast.Name):
        return func.id
    return ""


def _is_assertion_like_callee(callee: str) -> bool:
    """Rule 3: True for callees whose literal arguments are NOT test inputs the
    SUT branches on — assertion family (assert*), `fail`, and `get` (lookup by an
    expected key). Their operands are expected/lookup values, not inputs."""
    return callee.startswith("assert") or callee in ("fail", "get")


def collect_test_literals(test_files: list[Path]) -> tuple[set, set]:
    """Return (expected_literals, input_literals) drawn from the test files.

    expected_literals: distinctive literals that appear as the EXPECTED operand
    in assertions (assertEqual-family args, == comparisons).
    input_literals: distinctive literals passed as ARGUMENTS to NON-assertion
    calls (Rule 3) — i.e. genuine test inputs the SUT receives, excluding
    assertion-family operands, `fail` messages, and `get` lookup keys.
    """
    expected: set = set()
    inputs: set = set()

    for path in test_files:
        tree = _parse(path)
        if tree is None:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                callee = _call_callee_name(node)
                if callee.startswith("assertEqual"):
                    # Both positional operands can carry the expected literal;
                    # capture any distinctive constant operand.
                    for arg in node.args[:2]:
                        v = _const_value(arg)
                        if not isinstance(v, _NoValue) and _is_distinctive(v):
                            expected.add(_normalize(v))
                elif callee in ("assertIn", "assertNotIn"):
                    # assertIn(<member>, <container>) — the first positional arg
                    # is the asserted-present member, an expected value. This
                    # covers nested-literal returns checked with membership
                    # (e.g. assertIn("sentinel", g()) vs return ["sentinel"]).
                    if node.args:
                        v = _const_value(node.args[0])
                        if not isinstance(v, _NoValue) and _is_distinctive(v):
                            expected.add(_normalize(v))
                # Rule 3: a literal is a candidate test INPUT only when passed as
                # a POSITIONAL argument to a NON-assertion call. assert*-family
                # callees take the EXPECTED value as an operand (not an input the
                # SUT branches on); `fail` carries a message; `get` looks up by an
                # expected key (`d.get("ENUM")`). Excluding these stops the impl's
                # own enum comparisons (`if cls == "ENUM"`) from being flagged when
                # the enum only ever appears in tests as an expected/lookup value.
                #
                # Only positional .args count as anonymous SUT inputs (the magic
                # `sut("MAGIC")` shape this category targets). A KEYWORD argument
                # names the parameter it fills (`build_response(action="block")`),
                # which is legitimate enumerated DISPATCH — the SUT receives a
                # named enum and routes on it — not a value the impl was tuned to
                # match. Collecting keyword values would false-positive on every
                # such dispatcher (precision pass: favor REAL-code cleanliness).
                if not _is_assertion_like_callee(callee):
                    for arg in node.args:
                        v = _const_value(arg)
                        if not isinstance(v, _NoValue) and _is_distinctive(v):
                            inputs.add(_normalize(v))
            elif isinstance(node, ast.Compare):
                # x == <const> / <const> == x — gather distinctive operands.
                if any(isinstance(op, ast.Eq) for op in node.ops):
                    operands = [node.left, *node.comparators]
                    for operand in operands:
                        v = _const_value(operand)
                        if not isinstance(v, _NoValue) and _is_distinctive(v):
                            expected.add(_normalize(v))

    return expected, inputs


def _normalize(value: object):
    """Normalize literal values so int/float compare structurally by type+value."""
    return (type(value).__name__, value)


def _is_dataclass_decorated(cls: ast.ClassDef) -> bool:
    for dec in cls.decorator_list:
        name = ""
        if isinstance(dec, ast.Call):
            name = _dotted_name(dec.func)
        else:
            name = _dotted_name(dec)
        if not name:
            continue
        if name in {"dataclass", "dataclasses.dataclass", "attr.s", "attrs.define"}:
            return True
        # bare `define` (from attrs import define) or `attr.s`/`attrs.s`
        last = name.split(".")[-1]
        if last in {"dataclass", "define"}:
            return True
        if name in {"attr.s", "attrs.s"}:
            return True
    return False


_PRUNE_SCOPE = (
    ast.FunctionDef,
    ast.AsyncFunctionDef,
    ast.ClassDef,
    ast.Lambda,
)


def _iter_own_nodes(func: ast.AST):
    """Yield every node nested under ``func``'s body whose NEAREST enclosing
    function is ``func`` — pruning at nested function/class/lambda boundaries so
    inner-scope nodes are attributed to the inner scope, not to ``func``."""
    for body_stmt in func.body:
        if isinstance(body_stmt, _PRUNE_SCOPE):
            # A nested def/class statement belongs to the inner scope entirely.
            continue
        stack = [body_stmt]
        while stack:
            cur = stack.pop()
            yield cur
            for child in ast.iter_child_nodes(cur):
                if isinstance(child, _PRUNE_SCOPE):
                    continue
                stack.append(child)


def _collect_function_internal_assigns(tree: ast.AST) -> set:
    """Return the set of id()s of Assign/AnnAssign nodes whose nearest enclosing
    scope is a FunctionDef/AsyncFunctionDef body (R1).

    Walk every FunctionDef and collect the Assign/AnnAssign nodes nested anywhere
    inside its body, but stop descending at a nested function/lambda boundary so
    each assign is attributed to its OWN nearest enclosing function — never to an
    outer one. Class-body and module-level assigns (config constants) are never
    collected, so they are excluded from hardcoded-expected.
    """
    internal: set = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for sub in _iter_own_nodes(node):
                if isinstance(sub, (ast.Assign, ast.AnnAssign)):
                    internal.add(id(sub))
    return internal


def _collect_multireturn_value_nodes(tree: ast.AST) -> set:
    """Rule 1: id()s of Return/Assign/AnnAssign nodes whose ENCLOSING function
    has >=2 Return statements.

    A branching function with multiple return points is doing real logic (a
    classifier / enum-producer), not faking a single answer — so the distinctive
    constants in ITS returns/assigns must NOT be flagged as hardcoded-expected.
    Returns are attributed to their nearest enclosing function (nested defs are
    pruned), so an outer function isn't credited with an inner function's returns.
    """
    multireturn: set = set()
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        own_nodes = list(_iter_own_nodes(node))
        return_count = sum(1 for n in own_nodes if isinstance(n, ast.Return))
        if return_count >= 2:
            for n in own_nodes:
                if isinstance(n, (ast.Return, ast.Assign, ast.AnnAssign)):
                    multireturn.add(id(n))
    return multireturn


def _iter_value_position_constants(value_node: ast.AST):
    """Rule 2: yield ast.Constant nodes in VALUE position within ``value_node``,
    EXCLUDING dict KEYS and ast.Subscript slice constants.

    A dict key (`{"k": v}` → "k") is structure, not a faked value; a subscript
    slice (`rep["total"]` → "total") is a lookup index, not a returned/assigned
    value. Only true value-position constants (dict values, list/tuple/set
    elements, f-string parts, bare returned/assigned constants) are candidates.
    """
    stack = [value_node]
    while stack:
        cur = stack.pop()
        if isinstance(cur, ast.Constant):
            yield cur
            continue
        if isinstance(cur, ast.Dict):
            # Skip keys; descend only into values. (None keys = dict unpacking.)
            for val in cur.values:
                if val is not None:
                    stack.append(val)
            continue
        if isinstance(cur, ast.Subscript):
            # Descend into the subscripted value but NOT the slice (index const).
            stack.append(cur.value)
            continue
        for child in ast.iter_child_nodes(cur):
            stack.append(child)


def _count_return_literals(tree: ast.AST) -> dict:
    """Map each normalized distinctive literal to the number of DISTINCT
    ast.Return statements whose value subtree contains that literal (R2).

    A literal appearing in >=2 distinct Return statements is enum-like (returned
    from multiple branches) and must NOT be flagged as a single hardcoded fake.
    """
    counts: dict = {}
    for node in ast.walk(tree):
        if not (isinstance(node, ast.Return) and node.value is not None):
            continue
        # Per-Return de-dup: a literal repeated within ONE return counts once.
        seen_here: set = set()
        for sub in ast.walk(node.value):
            if isinstance(sub, ast.Constant) and _is_distinctive(sub.value):
                seen_here.add(_normalize(sub.value))
        for key in seen_here:
            counts[key] = counts.get(key, 0) + 1
    return counts


def scan_impl(
    impl_path: Path,
    expected_literals: set,
    input_literals: set,
) -> list[tuple[str, int, str]]:
    """Return a list of (category, lineno, snippet) findings for one impl file."""
    tree = _parse(impl_path)
    if tree is None:
        return []
    try:
        lines = impl_path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        lines = []

    findings: list[tuple[str, int, str]] = []

    # R1: only Assign/AnnAssign inside a function body count as hardcoded-expected
    # candidates. Returns are always candidates (kept from prior behavior).
    function_internal_assigns = _collect_function_internal_assigns(tree)
    # R2: enum-like literals returned from >=2 distinct Return statements are
    # excluded from flagging.
    return_literal_counts = _count_return_literals(tree)
    # Rule 1: returns/assigns inside a function with >=2 Return statements are a
    # branching classifier doing real logic — never hardcoded-expected.
    multireturn_value_nodes = _collect_multireturn_value_nodes(tree)

    for node in ast.walk(tree):
        # hardcoded-expected: return/assign whose VALUE contains (anywhere,
        # nested) a distinctive literal that a test asserts as expected. Walking
        # the value subtree covers dict values (`return {"k": "sentinel"}`),
        # list elements (`return ["sentinel"]`), f-string parts, and annotated
        # assignments (`x: str = "sentinel"`) — not just top-level constants.
        # R1 scopes assigns to function bodies; R2 skips enum-like repeats.
        value_node = None
        if isinstance(node, ast.Return) and node.value is not None:
            value_node = node.value
        elif isinstance(node, ast.Assign):
            if id(node) in function_internal_assigns:
                value_node = node.value
        elif isinstance(node, ast.AnnAssign) and node.value is not None:
            if id(node) in function_internal_assigns:
                value_node = node.value

        # Rule 1: a multi-return (branching classifier) function's returns/assigns
        # carry real per-branch logic, not a single faked answer — skip them.
        if value_node is not None and id(node) in multireturn_value_nodes:
            value_node = None

        if value_node is not None:
            # Rule 2: collect only VALUE-position constants — dict keys and
            # subscript slice constants are structure/lookups, not faked values.
            for sub in _iter_value_position_constants(value_node):
                v = sub.value
                if _is_distinctive(v) and _normalize(v) in expected_literals:
                    # R2: enum-like literal (>=2 distinct returns) — skip.
                    if return_literal_counts.get(_normalize(v), 0) >= 2:
                        continue
                    findings.append(
                        ("hardcoded-expected", node.lineno, _snippet(node, lines))
                    )
                    break

        # branch-on-test-input: if x == <const> / <const> == x / <const> in (...)
        if isinstance(node, ast.Compare):
            ops = node.ops
            operands = [node.left, *node.comparators]
            if any(isinstance(op, ast.Eq) for op in ops):
                for operand in operands:
                    v = _const_value(operand)
                    if not isinstance(v, _NoValue) and _is_distinctive(v):
                        if _normalize(v) in input_literals:
                            findings.append(
                                (
                                    "branch-on-test-input",
                                    node.lineno,
                                    _snippet(node, lines),
                                )
                            )
                            break
            if any(isinstance(op, ast.In) for op in ops):
                # <const> in (...) — left literal against a container.
                v = _const_value(node.left)
                if not isinstance(v, _NoValue) and _is_distinctive(v):
                    if _normalize(v) in input_literals:
                        findings.append(
                            (
                                "branch-on-test-input",
                                node.lineno,
                                _snippet(node, lines),
                            )
                        )

        # dunder-override: class defining __eq__/__hash__/__bool__ not a dataclass.
        if isinstance(node, ast.ClassDef):
            if not _is_dataclass_decorated(node):
                for member in node.body:
                    if isinstance(member, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        if member.name in _DUNDERS:
                            findings.append(
                                (
                                    "dunder-override",
                                    member.lineno,
                                    _snippet(member, lines),
                                )
                            )

        # stack-introspection + sentinel-print: both anchored on calls.
        if isinstance(node, ast.Call):
            dotted = _dotted_name(node.func)
            if dotted in _STACK_INTROSPECTION:
                findings.append(
                    ("stack-introspection", node.lineno, _snippet(node, lines))
                )
            # print("PASS") and friends.
            callee = _call_callee_name(node)
            if callee == "print" and node.args:
                first = node.args[0]
                v = _const_value(first)
                if isinstance(v, str) and v.strip().upper() in _SENTINEL_STRINGS:
                    findings.append(
                        ("sentinel-print", node.lineno, _snippet(node, lines))
                    )

    return findings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="detect-test-gaming",
        description="Static lint of impl files for test-gaming patterns.",
    )
    parser.add_argument("--impl", required=True, nargs="+", help="implementation files")
    parser.add_argument("--tests", required=True, nargs="+", help="test files (context)")
    args = parser.parse_args(argv)

    test_files = [Path(p).expanduser() for p in args.tests]
    impl_files = [Path(p).expanduser() for p in args.impl]

    expected_literals, input_literals = collect_test_literals(test_files)

    all_findings: list[str] = []
    for impl_path in impl_files:
        for category, lineno, snippet in scan_impl(
            impl_path, expected_literals, input_literals
        ):
            all_findings.append(f"GAMING {category} {impl_path}:{lineno} {snippet}")

    if all_findings:
        for line in all_findings:
            print(line)
        return 1

    print("clean")
    return 0


if __name__ == "__main__":
    sys.exit(main())
