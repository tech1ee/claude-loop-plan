#!/usr/bin/env python3
"""
detect-tautological-tests.py — AST scan of TEST files for tautological tests
(T2g, Thread 4 / ADR-NEW-D).

Usage:
    detect-tautological-tests.py --tests <files...>

Detects tests that pass trivially without verifying real behavior. Categories:
  assertion-free      a test* function/method that contains NO assertion at all.
  expected-from-call  both operands of an equality are calls to the SAME callable
                      (e.g. assertEqual(f(3), f(3))), or the expected value was
                      itself produced by a call to the asserted callable
                      (expected = f(3); assertEqual(f(3), expected)).
  over-mock           per test function, mock constructions/patches strictly exceed
                      the assertion count (and at least one mock is present).

Exit 1 + one `TAUTOLOGICAL <category> <file>:<line>` line per finding.
Exit 0 (prints "clean") if none. Files that fail to parse are skipped gracefully.

Stdlib-only (ast, argparse). Python 3.9-compatible.
"""
from __future__ import annotations

import argparse
import ast
import re
import sys
from pathlib import Path

_ASSERT_CALL_PREFIXES = ("assert",)  # self.assert*, assertEqual, etc.
# MEDIUM-2: helper methods/functions whose name signals they perform assertions
# on behalf of the test (e.g. self._check_response(...), _assert_valid(...)).
# A call to such a helper counts as "having an assertion", cutting the dominant
# assertion-free false-positive on helper-based suites.
_ASSERT_HELPER_RE = re.compile(r"(_check|_assert|_verify|_expect)")
_RAISES_NAMES = {"assertRaises", "assertRaisesRegex", "raises"}
_FAIL_NAMES = {"fail"}
_MOCK_CTOR_NAMES = {"Mock", "MagicMock", "AsyncMock", "patch"}


def _parse(path: Path):
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    try:
        return ast.parse(text)
    except SyntaxError:
        return None


def _callee_name(call: ast.Call) -> str:
    func = call.func
    if isinstance(func, ast.Attribute):
        return func.attr
    if isinstance(func, ast.Name):
        return func.id
    return ""


def _decorator_name(dec: ast.AST) -> str:
    target = dec.func if isinstance(dec, ast.Call) else dec
    if isinstance(target, ast.Attribute):
        return target.attr
    if isinstance(target, ast.Name):
        return target.id
    return ""


def _is_assertion_node(node: ast.AST) -> bool:
    """True if a node is (or contains at its top level) an assertion."""
    if isinstance(node, ast.Assert):
        return True
    if isinstance(node, ast.Call):
        name = _callee_name(node)
        if name.startswith(_ASSERT_CALL_PREFIXES):
            return True
        if name in _FAIL_NAMES:
            return True
        if name in _RAISES_NAMES:
            return True
    return False


def _count_assertions(func: ast.AST) -> int:
    """Count assertion statements/calls/with-blocks inside a function body."""
    count = 0
    for node in ast.walk(func):
        if isinstance(node, ast.Assert):
            count += 1
        elif isinstance(node, ast.Call):
            name = _callee_name(node)
            if name.startswith(_ASSERT_CALL_PREFIXES) or name in _FAIL_NAMES:
                count += 1
        elif isinstance(node, (ast.With, ast.AsyncWith)):
            for item in node.items:
                ctx = item.context_expr
                if isinstance(ctx, ast.Call) and _callee_name(ctx) in _RAISES_NAMES:
                    count += 1
    return count


def _has_assertion(func: ast.AST) -> bool:
    for node in ast.walk(func):
        if _is_assertion_node(node):
            return True
        # MEDIUM-2: a call to an assertion-helper (name matches _check|_assert|
        # _verify|_expect) counts as having an assertion — the test delegates its
        # checks to the helper instead of asserting inline.
        if isinstance(node, ast.Call):
            callee = _callee_name(node)
            if callee and _ASSERT_HELPER_RE.search(callee):
                return True
        if isinstance(node, (ast.With, ast.AsyncWith)):
            for item in node.items:
                ctx = item.context_expr
                if isinstance(ctx, ast.Call) and _callee_name(ctx) in _RAISES_NAMES:
                    return True
    return False


def _count_mocks(func: ast.AST) -> int:
    """Count mock constructions, patch() calls, and @patch decorators."""
    count = 0
    if isinstance(func, (ast.FunctionDef, ast.AsyncFunctionDef)):
        for dec in func.decorator_list:
            if _decorator_name(dec) == "patch":
                count += 1
    for node in ast.walk(func):
        if isinstance(node, ast.Call):
            if _callee_name(node) in _MOCK_CTOR_NAMES:
                count += 1
    return count


def _same_callable(a: ast.AST, b: ast.AST) -> bool:
    """True if two call nodes invoke the same callable by structural name."""
    if not (isinstance(a, ast.Call) and isinstance(b, ast.Call)):
        return False
    try:
        na = ast.dump(a.func)
        nb = ast.dump(b.func)
    except Exception:
        return False
    return na == nb


def _equality_operands(node: ast.AST):
    """Yield (left, right) operand pairs for assertEqual-family / == comparisons."""
    pairs = []
    if isinstance(node, ast.Call):
        name = _callee_name(node)
        if name.startswith("assertEqual") and len(node.args) >= 2:
            pairs.append((node.args[0], node.args[1]))
    elif isinstance(node, ast.Compare):
        if any(isinstance(op, ast.Eq) for op in node.ops):
            operands = [node.left, *node.comparators]
            for i in range(len(operands) - 1):
                pairs.append((operands[i], operands[i + 1]))
    return pairs


# Variable names that conventionally hold an "expected"/"want"/"result" value.
_EXPECTED_VAR_NAMES = {"expected", "exp", "want", "result"}


def _collect_expected_var_calls(func: ast.AST) -> dict:
    """Map var name -> Call node for `expected = f(3)`-style assignments."""
    mapping: dict = {}
    for node in ast.walk(func):
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id in _EXPECTED_VAR_NAMES:
                    mapping[target.id] = node.value
    return mapping


def _scan_func_for_expected_from_call(func: ast.AST) -> list[int]:
    """Return line numbers of expected-from-call findings within one function."""
    findings: list[int] = []
    expected_vars = _collect_expected_var_calls(func)

    for node in ast.walk(func):
        for left, right in _equality_operands(node):
            # Both operands are calls to the same callable.
            if _same_callable(left, right):
                findings.append(getattr(node, "lineno", 0))
                continue
            # One operand is a Name bound to a call; compare to the other call.
            for var_side, call_side in ((left, right), (right, left)):
                if (
                    isinstance(var_side, ast.Name)
                    and var_side.id in expected_vars
                    and isinstance(call_side, ast.Call)
                ):
                    if _same_callable(call_side, expected_vars[var_side.id]):
                        findings.append(getattr(node, "lineno", 0))
                        break
    return findings


def _iter_test_functions(tree: ast.AST):
    """Yield (func_node, lineno) for every test* function (module- or class-level)."""
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            for member in node.body:
                if isinstance(member, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    if member.name.startswith("test"):
                        yield member
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if node.name.startswith("test"):
                yield node


def scan_test_file(path: Path) -> list[tuple[str, int]]:
    tree = _parse(path)
    if tree is None:
        return []

    findings: list[tuple[str, int]] = []
    seen: set = set()

    # Dedup: a class-level test method is reachable both via ClassDef walk and
    # via the module walk; collect functions once by identity.
    funcs = []
    func_ids: set = set()
    for func in _iter_test_functions(tree):
        if id(func) not in func_ids:
            func_ids.add(id(func))
            funcs.append(func)

    for func in funcs:
        # assertion-free
        if not _has_assertion(func):
            key = ("assertion-free", func.lineno)
            if key not in seen:
                seen.add(key)
                findings.append(key)

        # expected-from-call
        for lineno in _scan_func_for_expected_from_call(func):
            key = ("expected-from-call", lineno)
            if key not in seen:
                seen.add(key)
                findings.append(key)

        # over-mock (advisory; strict threshold)
        mock_count = _count_mocks(func)
        assert_count = _count_assertions(func)
        if mock_count >= 1 and mock_count > assert_count:
            key = ("over-mock", func.lineno)
            if key not in seen:
                seen.add(key)
                findings.append(key)

    return findings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="detect-tautological-tests",
        description="AST scan of test files for tautological tests.",
    )
    parser.add_argument("--tests", required=True, nargs="+", help="test files")
    args = parser.parse_args(argv)

    test_files = [Path(p).expanduser() for p in args.tests]

    all_findings: list[str] = []
    for path in test_files:
        for category, lineno in scan_test_file(path):
            all_findings.append(f"TAUTOLOGICAL {category} {path}:{lineno}")

    if all_findings:
        for line in all_findings:
            print(line)
        return 1

    print("clean")
    return 0


if __name__ == "__main__":
    sys.exit(main())
