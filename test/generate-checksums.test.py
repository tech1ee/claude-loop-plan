#!/usr/bin/env python3
"""Tests for ci/generate-checksums.py — behavior 5 from plan T5."""

import subprocess
import sys
import tempfile
import hashlib
from pathlib import Path


def run_in_dir(cwd: str) -> tuple[int, str, str]:
    result = subprocess.run(
        [sys.executable, str(Path(__file__).parent.parent / "ci" / "generate-checksums.py")],
        capture_output=True, text=True, cwd=cwd
    )
    return result.returncode, result.stdout, result.stderr


def sha256_of(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def test_behavior_5_checksums_match_actual_files():
    """generate-checksums.py produces sha256sum-compatible output with correct digests."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        # Create minimal installable dir structure
        skills_dir = tmp / "skills" / "loop-plan"
        skills_dir.mkdir(parents=True)
        skill_content = b"# loop-plan\nThis is the skill.\n"
        (skills_dir / "SKILL.md").write_bytes(skill_content)

        # generate-checksums.py also walks agents/, bin/, commands/ — create empty dirs
        for d in ["agents", "bin", "commands"]:
            (tmp / d).mkdir()

        code, stdout, stderr = run_in_dir(tmpdir)
        assert code == 0, f"Expected exit 0, got {code}. stderr: {stderr}"

        checksums_path = tmp / "checksums.txt"
        assert checksums_path.exists(), "checksums.txt was not created"

        lines = checksums_path.read_text().strip().splitlines()
        assert len(lines) == 1, f"Expected 1 entry (one file), got {len(lines)}: {lines}"

        digest, rel_path = lines[0].split("  ", 1)
        assert rel_path == "skills/loop-plan/SKILL.md", \
            f"Unexpected path in checksums.txt: {rel_path}"
        expected = sha256_of(skill_content)
        assert digest == expected, \
            f"Digest mismatch. Expected {expected}, got {digest}"

        assert "checksums.txt updated" in stdout, \
            f"Expected update confirmation in stdout: {stdout}"

    print("PASS: behavior 5 — checksums.txt has correct sha256 digests")


if __name__ == "__main__":
    test_behavior_5_checksums_match_actual_files()
    print("\nAll generate-checksums tests passed.")
