# Changelog

## v0.1.0 — 2026-05-20

Initial public release.

**Skills:**
- `loop-plan` v1 — 7-phase iterative research-driven planner for Claude Code
- `loop-debug` v1 — 7-phase research-driven debugger with regression-test-first contract

**Installer:**
- Interactive multiselect for skills and supporting agents
- `--dry-run`, `--force`, `--skills`, `--no-agents`, `--no-bin` CLI flags
- Conflict detection with confirm prompt (bypassed by `--force`)
- Install receipt with version, timestamp, and selected components
- Non-blocking update check with 24h TTL cache
- `claude-skills update` / `list` / `verify` / `uninstall` sub-commands

**Security:**
- `ci/check-unicode.py` — hidden Unicode / bidi injection scanner
- `ci/check-skill-safety.py` — shell-block network-command scanner
- `ci/generate-checksums.py` — SHA-256 integrity manifest
- Privacy grep CI gate (no personal paths leak into published files)
- npm provenance on all releases

**Planned for v0.2.0:**
- Minisign release signatures
- `claude-skills list --available` (registry listing)
- Additional skills (loop-debug enhancements, quality-pipeline)
