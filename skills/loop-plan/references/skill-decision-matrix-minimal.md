# Skill & Agent Routing (minimal — loop-plan edition)

This is a stripped version of the full skill-decision-matrix, containing only the stacks
that loop-plan and loop-debug reference directly. The full matrix lives in your private
`~/.claude/rules/skill-decision-matrix.md` if you have the complete setup.

## Cross-model review (Codex integration)

Codex auto-fires at multiple spots; all guarded by `~/.claude/bin/should-run-codex.py` cost gate.
All output flows through `~/.claude/bin/run-codex-review.sh`.

| Trigger | Stage | Auto-fire site |
|---|---|---|
| `/loop-plan` Phase 6b | plan | Always |
| `/loop-debug` Phase 1 H1 | plan (root-cause hypothesizer) | `state.intensity ∈ {standard, hardened}` |
| `/loop-debug` Phase 4 sub-4b H3 | plan (triplet review) | `state.intensity ∈ {standard, hardened}` |
| `/loop-debug` Phase 5 H4 | plan (pre-shipit) | `state.intensity ∈ {standard, hardened}` |
| `/loop-debug` Phase 6c H5 | diff (post-fix) | `state.intensity ∈ {standard, hardened}` |

**Kill-switches:** `CODEX_STOP_GATE_OFF=1` (Stop-gate only); `state.intensity == minimal` (skip H1/H3/H4/H5 in loop-debug). All advisory.

## Research stack

| Task | Use |
|---|---|
| Library/API docs before coding | `research-agent` subagent + `context7` MCP |
| "What APIs does library X expose?" | `context7` MCP directly |
| Open-ended topic, 20+ sources — standalone deliverable, run inline | `deep-researcher` skill (main session) |
| Same, but inside loop-plan Phase 3 where orchestrator context must stay clean | `research-agent` subagent with deep-researcher methodology inlined into prompt |
| ≥3 independent research domains in one task | Parallel `research-agent` subagents (one per domain, single message) |
| Autonomous iterative research with date-verification and cross-validation | `autoresearch:research` |
| "What could go wrong with this design?" (Phase 2) | `autoresearch:predict` |
| "Hunt all bugs in this module" (Phase 6) | `autoresearch:debug` |

**Skill-vs-subagent rule**: `deep-researcher` runs in the main session and grows orchestrator context. Inside loop-plan, dispatch `research-agent` subagents instead — subagents have no `Skill` tool of their own.

## Security stack

| Task | Use |
|---|---|
| Drive-by review of just-written diff | `security-reviewer` subagent (background, after security-sensitive edits) |
| Adversarial STRIDE + OWASP red-team pass on changes | `autoresearch:security` |

## Code review stack

| Task | Use |
|---|---|
| Lightweight per-step review during long implementation | `superpowers:code-reviewer` (dispatched mid-plan) |
| Spec compliance gate | `spec-reviewer` subagent |
| Code quality gate | `code-quality-reviewer` subagent |

## Planning stack

| Task | Use |
|---|---|
| Early-stage open exploration | `superpowers:brainstorming` |
| Convert approved design to executable plan | `superpowers:writing-plans` |
| Execute an existing plan with checkpoints | `superpowers:executing-plans` |
| Decompose work into parallel independent subagent tasks | `superpowers:subagent-driven-development` |
| Architecture-aware multi-iteration plan with decision tracking | `loop-plan` skill |
| TDD-enforced multi-iteration plan (rigor=tdd-only or full) | `loop-plan` skill with rigor gate |
| Bug fix with research + scope analysis + prevention design | `/loop-debug` skill |
| Final integration step | `superpowers:finishing-a-development-branch` |

## Architecture & design analysis stack

| Task | Use |
|---|---|
| Explore deepening opportunities in existing codebase | `improve-codebase-architecture` skill |
| Unfamiliar code area — get layer-up module map | `zoom-out` skill |
| Stress-test a plan or design | `grill-me` skill |
| Vision/longevity/scale elicitation for complex new features | Phase 2a of `/loop-plan` (built-in) |
| Hard bug needing feedback-loop + root-cause + prevention design | `loop-debug` skill |
| Medium bug (known domain, no internet research needed) | `diagnose` skill |

## Test integrity

| Task | Use |
|---|---|
| Snapshot test files at RED + lock for impl phase | `~/.claude/bin/test-integrity.py snapshot --root <project> --task <task-id> --files <test files>` |
| Verify tests untampered at GREEN | `~/.claude/bin/test-integrity.py verify --root <project> --task <task-id>` |
| Detect new skip markers | `~/.claude/bin/test-integrity.py scan-skips <files...>` |
| Run mutation testing terminal quality gate | dispatch `test-runner` agent with `mode: mutation` |

## Decision tracking

| Task | Use |
|---|---|
| Load existing project ADRs at session/plan start | `~/.claude/bin/new-adr.py list --root <project>` (Phase 0 of loop-plan does this automatically) |
| Create a new ADR from a clarification | `~/.claude/bin/new-adr.py create --root <project> --slug <kebab> --title "<title>"` |
| Supersede an accepted decision | `~/.claude/bin/new-adr.py create --root <project> --slug <kebab> --title "<new title>" --supersedes NNNN` |
| Promote `proposed → accepted` (only on task pass) | `~/.claude/bin/new-adr.py accept --root <project> --id NNNN` |
| Bootstrap a new project for ADRs | `~/.claude/bin/new-adr.py init --root <project>` |
