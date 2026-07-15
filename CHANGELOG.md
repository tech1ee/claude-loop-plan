# Changelog

## v0.5.2 — 2026-07-15

**Publish metadata fix:**
- Normalized npm `bin` and repository metadata for the unscoped `loop-skills` package.

## v0.5.1 — 2026-07-15

**Public package correction:**
- Published under the unscoped public npm name `loop-skills` because the `@loopskills` scope did not permit creating the renamed package with the release token.
- Updated installer updates, docs, badges, E2E tests, and metadata to use `loop-skills`.

## v0.5.0 — 2026-07-15

**Brand and package rename:**
- Renamed the primary package to `loop-skills`.
- Renamed the primary CLI to `loop-skills`; `claude-skills` remains an installation alias for compatibility.
- Renamed the GitHub repository to `tech1ee/loop-skills`.
- Updated public documentation, agent install examples, badges, repository links, release tests, and metadata.
- Existing `@loopskills/claude-skills` installs remain available and are not removed.

## v0.4.5 — 2026-07-15

**Adaptive orchestration and capability discovery:**
- Added the adaptive-loop protocol: triage tiers, explicit budgets, evidence ledger, information-gain probe selection, diminishing-return stopping, and residual-risk reporting.
- Added `loop_inventory` to discover active tools, skills, agents, extensions, packages, models, and MCP configuration without exposing secrets or prompt bodies.
- Added `loop_evidence` for atomic, source-backed claim tracking in `.pi/plans/*.state.json`.
- Added capability-aware routing guidance for scouts, context builders, researchers, reviewers, workers, oracles, and user/project agents.
- Added extension type-checking to the test pipeline and synchronized Pi peer dependencies.

## v0.4.4 — 2026-07-15

**Release fix:**
- Synced `package-lock.json` with Pi peer dependencies so clean CI/npm installs work reliably.

## v0.4.3 — 2026-07-14

**Pi progress UI:**
- Added the `loop_progress` tool and bundled Pi extension.
- Displays a persistent checkpoint list above the editor with completed/running/blocked states, current-step progress bars, and short live descriptions.
- Added `/loop-progress` and `/loop-progress clear` commands.
- Loop-plan and loop-debug now update the panel at phase boundaries and during delegated investigation, review, and verification.
- Added extension packaging, checksum, safety, and discovery coverage.

## v0.4.2 — 2026-07-14

**Proactive investigation improvements:**
- Loop planning now requires autonomous impact-closure: follow-up exploration maps callers, consumers, boundaries, similar cases, edge cases, and residual unknowns before asking product questions.
- Loop debugging now performs causal-graph closure instead of stopping at the first plausible stack frame.
- Added explicit test-quality audits covering oracle independence, mock realism, boundary coverage, tautological tests, missing negative cases, and prevention tests.
- Similar-case search and adjacent-entry-point disposition are now required before a debug fix is considered verified.

## v0.4.1 — 2026-07-14

**Release fix:**
- Fixed the Pi package test to run on Node 18, the minimum supported Node version.

## v0.4.0 — 2026-07-14

**Pi support:**
- Added a first-class Pi package manifest (`package.json` → `pi.skills`).
- Added Pi-native `loop-plan`, `loop-debug`, and `loop-audit` skills.
- Pi workflows use native `subagent` orchestration, OpenAI-compatible model selection, `.pi/plans/` artifacts, explicit approval gates, and one-writer safety.
- Added package-discovery and portability tests for Pi.
- Preserved the existing Claude Code installer and skill payload unchanged except for an AskUserQuestion gate contradiction fix.

## v0.3.0 — 2026-05-23

**New agents (2):**
- `loop-verifier` — goal-backward adversarial achievement verifier. Runs a 4-level artifact check (exists → substantive → wired → data-flows) + behavioral probes against a `must_haves` contract. Returns a tri-state verdict (`passed | gaps_found | human_needed`). The execution probes are the hard gate — task-completion narration is never accepted as evidence. Used at every stage boundary in `loop-plan` and at terminal acceptance in `loop-debug`.
- `test-writer` — separate TDD test author (separation-of-duties anti-cheating control). Authors failing tests from a task's `Test behaviors:` spec, proves them RED, and returns file paths for hash-locking before any implementer runs. Refuses to touch production code. Embodies 7 anti-gaming prohibitions (no tautological oracles, no signature-only assertions, no implementation coupling).

**Skill updates — `loop-plan`:**
- Phase 2 HARD GATE: cannot advance if `must_haves.truths[]` is empty, contains "TBD", "better", "improve", or any non-observable predicate
- Phase 7b pre-dispatch anti-cheating: `test-writer` dispatch → hash-lock → `guard-mutation` oracle; post-dispatch: `detect-test-gaming` (D1) + `detect-tautological-tests` (D2) HARD-BLOCKs; per-task Codex cross-vendor review; non-skippable mutation floor
- Stage boundary gates: `loop-verifier` dispatched at each stage; `gaps_found` halts the DAG and generates fix tasks
- Completion gate: `completion_state = "shipped"` ONLY after `loop-verifier` verdict `passed` (or signed-off `human_needed`). Never set on task-count completion alone.

**Skill updates — `loop-debug`:**
- Phase 2 HARD GATE: acceptance criteria lifted into `must_haves` contract before advancing to Phase 3
- Per-task cross-vendor validation on T0a, T-fix, and T0b (Codex `stage:diff`, cost-gated)
- `spec-reviewer` is also handed `must_haves.truths` — verifies the fix satisfies acceptance criteria, not only that T0a is GREEN
- Terminal acceptance check: `loop-verifier` dispatched after T0a GREEN + mutation post≥pre; `gaps_found` → HALT + gap-closure tasks

**Reference files updated:**
- `references/state-schema.md` — `goal`, `must_haves`, `verification`, `stages[]` fields added with HARD GATE rule
- `references/drift-check.md` — Rule 0 (goal coverage: every `must_haves.truth` → ≥1 task) and Rule 0b (cross-vendor per task: every non-opt-out task needs `Cross-vendor validation:` line) now apply at **all** rigor tiers
- `references/tdd-workflow.md` — anti-cheating guardrails section (P1 separation of duties, V2 guard-mutation, D1/D2 detectors, V1 non-skippable mutation floor) + PBT recipe (function-shape → invariant table, Hypothesis template)
- `references/implementer-prompt-addendum.md` — P5 anti-gaming prohibition list (7 rules: no test edits, no hardcoded returns, no `__eq__` overrides, no stack inspection, no sentinel printing, no mining git history, no SUT-as-oracle)

**New bin scripts (2):**
- `bin/detect-test-gaming.py` — static detector for implementer-side gaming patterns (hardcoded returns for test inputs, branching on fixture values, stack inspection, sentinel printing). Exit 1 = HARD-BLOCK.
- `bin/detect-tautological-tests.py` — static detector for tautological test oracles (expected = sut(input) patterns, zero-assertion tests, trivially-always-true assertions). Exit 1 = HARD-BLOCK.

**Bin script updates (2):**
- `bin/should-run-codex.py` — security-class regex broadened (covers `defender`, `injection`, `homoglyph`, `sanitiz`, `redact`, `entitlement`); `_parse_numstat` handles binary files and rename paths correctly
- `bin/test-integrity.py` — `guard-mutation` subcommand added: source-level mutation testing oracle that proves tests are non-tautological by verifying at least one mutant (constant-fold, return-None, comparison-flip, string-literal) causes a test failure

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
