#!/usr/bin/env python3
"""Tests for ci/check-unicode.py — behaviors 1-2 from plan T5."""

import subprocess
import sys
import tempfile
from pathlib import Path


def run(args: list[str]) -> tuple[int, str, str]:
    result = subprocess.run(
        [sys.executable, "ci/check-unicode.py", *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout, result.stderr


def test_behavior_1_detects_zero_width_space():
    """check-unicode.py exits non-zero when input contains U+200B (zero-width space)."""
    with tempfile.NamedTemporaryFile(suffix=".md", mode="w", delete=False) as f:
        f.write("# Clean file\n")
        f.write("This line has a​problem.\n")  # U+200B
        path = f.name
    code, _, stderr = run([path])
    assert code == 1, f"Expected exit 1 for zero-width space, got {code}"
    assert "zero-width space" in stderr.lower() or "U+200B" in stderr, \
        f"Expected name in stderr: {stderr}"
    Path(path).unlink()
    print("PASS: behavior 1 — detects U+200B")


def test_behavior_2_clean_file_exits_zero():
    """check-unicode.py exits 0 for clean skill files."""
    with tempfile.NamedTemporaryFile(suffix=".md", mode="w", delete=False) as f:
        f.write("# A clean skill file\n\nThis has no hidden characters.\n")
        path = f.name
    code, stdout, _ = run([path])
    assert code == 0, f"Expected exit 0 for clean file, got {code}"
    assert "OK" in stdout, f"Expected OK in stdout: {stdout}"
    Path(path).unlink()
    print("PASS: behavior 2 — clean file exits 0")


if __name__ == "__main__":
    test_behavior_1_detects_zero_width_space()
    test_behavior_2_clean_file_exits_zero()
    print("\nAll check-unicode tests passed.")
