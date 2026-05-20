# Changelog

## v0.2.2 — 2026-05-20

**Agent updates (23 agents):**
- `adr-completeness-auditor`, `char-test-coverage-auditor`, `comment-quality-auditor`, `complexity-long-method-auditor`, `dip-dependency-direction-auditor`, `dry-duplication-auditor`, `naming-conventions-auditor`, `research-agent`, `security-reviewer`, `srp-godclass-auditor`, `yagni-premature-abstraction-auditor` — updated to latest versions
- `android-baseline-profile-checklister`, `android-coroutine-scope-leak-auditor`, `android-fgs-compliance-auditor`, `android-r8-proguard-auditor` — updated Android audit agents
- `ios-appstore-preflight-auditor`, `ios-codable-edge-auditor`, `ios-coredata-migration-auditor`, `kmp-bridging-topology-auditor`, `kmp-swift-interop-readiness-auditor` — updated iOS/KMP agents
- `macos-appkit-swiftui-interop-auditor`, `macos-entitlements-distribution-auditor`, `macos-notarization-preflight-auditor` — updated macOS agents

**Skill updates:**
- `loop-plan/SKILL.md` — Phase 1 explorer prompts refined; caveman-style compact subagent prompt guidance added
- `loop-plan/references/skill-decision-matrix-minimal.md` — updated routing rules

**Documentation:**
- README `### Supporting agents` expanded from 7 → 40 agents, organized into 8 groups
- `docs/agents.md` — full reference entries for all 40 agents (Role, Used in, Returns, thresholds)

**Testing:**
- `test/e2e-published.sh` — 24-scenario / 91-assertion E2E suite against the published tarball

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
