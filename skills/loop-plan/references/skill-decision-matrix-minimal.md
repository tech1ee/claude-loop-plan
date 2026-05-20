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

## Mobile / platform stack

| Task | Use |
|---|---|
| Android/KMP/Compose codebase exploration (Phase 1) | `android-kmp-explorer` subagent (read-only) |
| Coroutine scope leak audit | `android-coroutine-scope-leak-auditor` subagent (read-only) |
| FGS Android 14/15 compliance | `android-fgs-compliance-auditor` subagent (read-only) |
| R8/ProGuard AGP 9 keep-rule audit | `android-r8-proguard-auditor` subagent (read-only) |
| Baseline Profile setup completeness | `android-baseline-profile-checklister` subagent (read-only) |
| iOS/SwiftUI codebase exploration (Phase 1) | `swiftui-explorer` subagent (read-only) |
| Pre-App-Store-submission preflight | `ios-appstore-preflight-auditor` subagent (read-only) |
| Codable semantic edge cases | `ios-codable-edge-auditor` subagent (read-only) |
| Core Data migration eligibility | `ios-coredata-migration-auditor` subagent (read-only) |
| KMP source-set topology audit | `kmp-bridging-topology-auditor` subagent (read-only) |
| SKIE / Swift Export readiness | `kmp-swift-interop-readiness-auditor` subagent (read-only) |
| macOS entitlement / sandbox consistency | `macos-entitlements-distribution-auditor` subagent (read-only) |
| macOS notarytool CI pre-flight | `macos-notarization-preflight-auditor` subagent (read-only) |
| NSViewRepresentable seam audit | `macos-appkit-swiftui-interop-auditor` subagent (read-only) |
| Compose UI architecture design | `compose-architect` subagent |
| KMP data layer design | `datalayer-architect` subagent |

## Web — React / Next.js

| Task | Use |
|---|---|
| React/Next.js/TypeScript codebase exploration (Phase 1) | `react-nextjs-explorer` subagent (read-only) |
| Hooks misuse audit (stale closures, missing deps, conditional hooks) | `react-hooks-misuse-auditor` subagent (read-only) |
| RSC / client boundary violations, data-fetch waterfall | `nextjs-rsc-boundary-auditor` subagent (read-only) |

## Web — TypeScript / Node.js

| Task | Use |
|---|---|
| `any` creep audit, unsafe type assertions, `@ts-ignore` usage | `typescript-strict-mode-auditor` subagent (read-only) |
| Unhandled rejections, blocking event loop, async/callback mixing | `nodejs-async-safety-auditor` subagent (read-only) |

## Web — Python / FastAPI / Django

| Task | Use |
|---|---|
| Blocking calls in async context, asyncio anti-patterns | `python-async-correctness-auditor` subagent (read-only) |
| Migration squash safety, ForeignKey cascade risks, N+1 queries | `django-fastapi-safety-auditor` subagent (read-only) |

## Web — Vue / Nuxt

| Task | Use |
|---|---|
| Destructured reactive state, watch cleanup, computed side effects | `vue-reactivity-pitfalls-auditor` subagent (read-only) |
| SSR/CSR hydration mismatches, server-guard misuse | `nuxt-ssr-hydration-auditor` subagent (read-only) |

## Universal code quality

| Task | Use |
|---|---|
| SRP violation / God-class (LCOM4, LOC, field/method count) | `srp-godclass-auditor` subagent (read-only) |
| Code duplication with Rule-of-Three gate | `dry-duplication-auditor` subagent (read-only) |
| Cyclomatic + cognitive complexity, LOC/method | `complexity-long-method-auditor` subagent (read-only) |
| Dependency-direction / import cycles / layer violations | `dip-dependency-direction-auditor` subagent (read-only) |
| Naming smells: generic suffixes, Hungarian, acronym caps | `naming-conventions-auditor` subagent (read-only) |
| Comment WHAT-vs-WHY violations, expired TODO/FIXME | `comment-quality-auditor` subagent (read-only) |
| Speculative-generality / one-impl interfaces | `yagni-premature-abstraction-auditor` subagent (read-only) |
| Pre-refactor characterization-test coverage gap audit | `char-test-coverage-auditor` subagent (read-only) |
| MADR 4.0.0 ADR completeness | `adr-completeness-auditor` subagent (read-only) |

## Phase 1 explorer selection (by stack)

All explorers run on **Sonnet** — recall-bound, not reasoning-bound:

| Stack | Explorer agent |
|---|---|
| Android / Kotlin / KMP / Compose | `android-kmp-explorer` |
| iOS / SwiftUI | `swiftui-explorer` |
| React / Next.js / TypeScript | `react-nextjs-explorer` |
| Vue / Nuxt | generic `Explore` subagent (model: sonnet) with Vue 3 Composition API + Nuxt 3 SSR scope |
| Python / Django / FastAPI | generic `Explore` subagent (model: sonnet) with async correctness + ORM scope |
| Other | generic `Explore` subagent (model: sonnet) with stack-specific scope |

## Decision tracking

| Task | Use |
|---|---|
| Load existing project ADRs at session/plan start | `~/.claude/bin/new-adr.py list --root <project>` (Phase 0 of loop-plan does this automatically) |
| Create a new ADR from a clarification | `~/.claude/bin/new-adr.py create --root <project> --slug <kebab> --title "<title>"` |
| Supersede an accepted decision | `~/.claude/bin/new-adr.py create --root <project> --slug <kebab> --title "<new title>" --supersedes NNNN` |
| Promote `proposed → accepted` (only on task pass) | `~/.claude/bin/new-adr.py accept --root <project> --id NNNN` |
| Bootstrap a new project for ADRs | `~/.claude/bin/new-adr.py init --root <project>` |
