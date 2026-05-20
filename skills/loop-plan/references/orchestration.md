# Multi-agent orchestration — when to use what

Decision matrix for fanning out to multiple agents vs. staying single-threaded. Based on April 2026 research into what actually works (Anthropic engineering post, superpowers patterns, Shipyard / MindStudio / Pere Villega writeups).

## Golden rules

1. **~95% of routine coding is wrong for multi-agent.** Single Opus 4.7 session is the right tool for bug fixes, small features, and refactors touching ≤10 files (per ADR-0016). Multi-agent is for *breadth*, not for *productivity*.
2. **Delegation depth: 1 level default, 2 levels max, never 3.** Orchestrator → workers is the sweet spot. Sub-leads exist but the returns diminish sharply past that.
3. **Never parallelize implementers on the same branch.** File-conflict corruption. Use `isolation: worktree` or sequence them.
4. **Token economics: orchestrator-worker costs ~15× a chat and ~4× a single agent.** Anthropic's data: 80% of the quality variance was explained by *tokens spent*, not cleverness. Only worth it for high-value tasks.
5. **Always pass task text by value, not by reference.** The orchestrator pastes the exact task into the subagent prompt. Never "read the plan file at line 42" — that duplicates context.
6. **Background agents auto-deny any permission that isn't pre-approved** — the agent's `tools:` allowlist must be complete. Clarifying questions from a background agent fail silently.

## Pattern catalogue

### A. Single session (default)
**Use for:** everything routine. Bug fixes, small features, refactors, documentation.
**Don't use for:** breadth-first research, adversarial analysis, multi-angle review.
**Token cost:** 1×.

### B. Parallel Explore (read-only fan-out)
**Use for:** Phase 1 code research on a substantive change. Dispatch explorers in parallel, each owning one domain (similar-features / architecture-and-deps / tests-and-edge-cases).
**Agents:** `android-kmp-explorer`, `swiftui-explorer`, generic Explore subagents.
**Don't use for:** debugging (use `superpowers:systematic-debugging` instead), exploratory hunches, related-failure investigations.
**Rule:** one agent per *independent problem domain*. Scale to need: **1** for narrow/config tasks; **2** for focused features; **3** only when all three domains are genuinely independent and the task is cross-cutting. Default to 1-2, not 3.
**Token cost:** ~4× rule-overhead reduction vs monolithic exploration; net cost lower per useful finding.

### C. Orchestrator–Worker (Opus lead + Sonnet/Haiku workers)
**Use for:** breadth-first research, multi-angle code review, competing-hypothesis debugging, cross-layer features. High-value tasks only.
**Pattern:** Opus 4.7 orchestrator (with `effort: max`) coordinates, Opus 4.7 workers execute narrow code-writing/analysis subtasks, Sonnet 4.6 / Haiku 4.5 workers handle judgment-only or mechanical subtasks. Orchestrator synthesizes. See ADR-0016 for tier policy.
**Don't use for:** routine coding, interdependent tasks, shared mutable state.
**Token cost:** ~15× a chat, ~4× a single agent. Only justifiable for high-value work.
**Source:** Anthropic's multi-agent research system — 90.2% better than single Opus on BrowseComp.

### D. Pipeline (subagent-driven development)
**Use for:** Phase 5 implementation default. Fresh implementer per task → `spec-reviewer` → `code-quality-reviewer` → re-review loop until both green.
**Rules:**
- Two-stage review in order: spec first, quality second (spec failures invalidate quality review).
- NEVER dispatch implementers in parallel.
- Controller extracts full task text and pastes it into the subagent prompt — never "read task X from the plan."
- Model tiering (per ADR-0016): **Opus 4.7 is the default** for implementer + spec-reviewer + code-quality-reviewer. Haiku 4.5 only for the `test-runner` between steps. Sonnet 4.6 only for non-gating judgment roles (content review, library lookup).
- Run `test-runner` between implementer and reviewers if tests are affordable.

### E. Adversarial Agent Teams (experimental — `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`)
**Use for:** hard production bugs (3–5 teammates investigate competing root-cause hypotheses, message each other to disprove each other's theories), architecture debates, 3-way PR review (security / perf / tests).
**Rules:**
- One team per session, no nested teams, lead is fixed for team lifetime.
- Start with 3–5 teammates, 5–6 tasks each. Scaling past 5 without per-agent files has diminishing returns.
- Prefer named messages over `broadcast` — broadcast cost scales linearly with team size.
- Don't use for daily feature work. Token cost doesn't pencil out.

### F. Map-Reduce via Routines
**Use for:** scheduled/partitioned recurring work. N cloud-scheduled sessions each process a partition (repo, directory, label) and write results to a shared doc. Replaces cron/GitHub Actions.
**Pro/Max/Team caps:** 5/15/25 routines per day.
**Requires:** target data must be in a git repo (cloud sandbox clones fresh per run).

## Anti-patterns (documented waste — don't do these)

| Anti-pattern | Why it fails |
|---|---|
| Parallel implementers on same branch | File writes conflict, agents overwrite each other. Use worktrees or sequence. |
| 3+ levels of delegation | Non-deterministic debugging hell, "rainbow deployment" problems. |
| `broadcast` in Agent Teams with ≥5 teammates | Cost scales linearly with team size. |
| "Fix all the tests" / "review the codebase" super-broad prompts | Agents get lost. Specificity wins. |
| Subagents that re-read the plan file | Duplicates the orchestrator's context. |
| Team sizes >5 without clear per-agent files | Coordination overhead exceeds parallelism gains. |
| Multi-agent for routine coding | Single-agent Opus 4.7 session is the right tool for 90%+ of editing work (ADR-0016). |
| 3 Phase-1 explorers on a narrow / config task | Overkill. 1-2 explorers on focused or config tasks; 3 only for genuinely cross-cutting features. |
| Routine coding on Sonnet/Haiku for cost reasons | Per ADR-0016, all code-writing dispatches go to Opus 4.7. Cost control is the `/loop-plan` rigor gate (ADR-0015 — `minimal` tier skips the heavy pipeline), not the model tier. |
| Running multi-agent without worktrees when parallel file writes happen | Race conditions, lock conflicts. |

## Model tiering quick-ref (per agent role)

Per ADR-0016, **Opus 4.7 is the default** for any task involving coding, architecture, analysis, review, exploration, security, or high-responsibility judgment. **Sonnet 4.6** is reserved for non-gating judgment work. **Haiku 4.5** is reserved for purely mechanical operations.

| Role | Model | Rationale |
|---|---|---|
| Orchestrator / planner / architect | **Opus 4.7 + `effort: max`** | Cross-cutting reasoning. Extended thinking unlocks cheaper execution at the worker layer. |
| Implementer (all code-writing tasks) | **Opus 4.7** | "All coding" per ADR-0016. CursorBench +12 pts vs 4.6 directly applies. |
| Spec / code-quality / refactor-trajectory review | **Opus 4.7** | Review gates are load-bearing. False PASS ships bad code; subtle dimensions (principles, mutation-floor) need top capability. |
| Code exploration — generic `Explore` subagent | **Sonnet 4.6** | Read-only Phase-1; recall-bound, not reasoning-bound — same rationale as narrow stack explorers. Per ADR-0022 extended 2026-05-14. |
| Code exploration — `android-kmp-explorer`, `swiftui-explorer` | **Sonnet 4.6** | Read-only Phase-1 explorers; recall-bound, not reasoning-bound. Per ADR-0022 (refines ADR-0016). |
| Security audit | **Opus 4.7** | False negatives cost most. Already Opus; now 4.7 by alias. |
| Cross-model second opinion | **Opus 4.7** | Pre-merge / pre-ship gate; needs equal weight to the orchestrator. |
| Compose / data-layer architecture | **Opus 4.7 + `effort: max`** | Pure architecture work; already at top tier. |
| Content review | Sonnet 4.6 | Voice/style judgment, not technical-correctness gating. |
| Library doc / API lookup (`research-agent`) | Sonnet 4.6 | context7 does the heavy lifting; Sonnet synthesizes. Bumped from Haiku per ADR-0016. |
| Test running, log parsing, translations, Notion sync | Haiku 4.5 | Pure mechanical. Opus is wasted bandwidth here. |

**Pricing note (ADR-0016):** Opus 4.7 is $5/$25 per M tokens (unchanged from 4.6 at the headline level), but the new tokenizer maps the same input to roughly 1.0–1.35× more tokens, so effective cost is 0–35% higher per dispatch. Cost control lives at the `/loop-plan` rigor gate (`minimal` tier per ADR-0015 skips the heavy pipeline entirely).

**Versioning approach:** the `model:` frontmatter field uses the alias (`opus`, `sonnet`, `haiku`) — never a version-pinned ID like `claude-opus-4-7`. The harness resolves the alias to the current frontier in each family, so future Opus releases are picked up automatically without touching agent files.

## Cross-model review layer (second opinion)

For high-stakes work, layer a cross-model review on top of the Claude-native flow using the `second-opinion` agent (routes through OpenAI Codex plugin).

Auto-trigger surface significantly expanded under ADR-0023 (active Codex integration) + ADR-0024 (diff-size cost guard). All flows through `~/.claude/bin/run-codex-review.sh` (300s timeout, F31 regex, Option A `REVIUE UNAVAILABLE` passthrough — Sonnet fallback deferred).

| Moment | Trigger | Stage | Cost gate | Invocation |
|---|---|---|---|---|
| End of `loop-plan` Phase 6 | automatic | `plan` | none (plan stage is always reviewed) | loop-plan dispatches the agent after drift check |
| `/loop-debug` Phase 1 H1 (root-cause Codex explorer) | automatic when `state.intensity ∈ {standard,hardened}` | `plan` | should-run-codex.py | per ADR-0023 |
| `/loop-debug` Phase 4 sub-4b H3 (triplet review) | automatic, tier-gated | `plan` | should-run-codex.py | per ADR-0023 |
| `/loop-debug` Phase 5 H4 (pre-shipit) | automatic, tier-gated | `plan` | none (just before ship) | per ADR-0023 |
| `/loop-debug` Phase 6c H5 (post-fix diff) | automatic, tier-gated | `diff` | should-run-codex.py | per ADR-0023 |
| `/ship-check` step 5b | automatic | `diff` | should-run-codex.py | ship-check dispatches on `git diff main...HEAD` |
| Stop-gate (every turn-end) | automatic, `CODEX_STOP_GATE_OFF=1` to disable | working-tree diff | should-run-codex.py | `codex-stop-review-wrapper.py` registered in Stop block |
| SubagentStop systemMessage suggest | automatic, FAIL × N threshold | n/a — recommends `/codex:rescue` | n/a | `codex-rescue-suggest.py` registered in SubagentStop block |
| Security-sensitive edit | explicit `/second-opinion security <path>` | `security` | bypass (always run on security path) | STRIDE prompt addendum |
| Quarterly / pre-refactor | explicit `/second-opinion codebase <glob>` | `codebase` | n/a | long-context whole-module pass |
| Standalone plan review | explicit `/second-opinion plan <slug>` | `plan` | n/a | for plans outside loop-plan |

**Everything is advisory.** Findings surface with severity (HIGH / MEDIUM / LOW combined) + consensus metadata (Claude AGREES / DISAGREES / NOT-CHECKED). Never blocks exit. Per April 2026 research — [Nature Sci Rep 2026](https://www.nature.com/articles/s41598-026-42705-7) on adversarial persuasion, [arxiv 2511.07784](https://arxiv.org/abs/2511.07784) on debate collapse — unanimous AI agreement is not a gate we should trust.

**When disagreement is the signal**: the point of a second opinion is the cases where Codex flags something Claude missed. If both models agree on everything, the second opinion is low-value for that review. If they disagree, that's the most useful data point.

**Failure mode to watch**: sycophancy. Both models trained on similar corpora → same blind spots → ensemble independence breaks. Homogenisation is real (Nature npj Digital Medicine 2026 — 58-62% sycophancy rate). Don't interpret consensus as validation.

**Prerequisites**: OPENAI_API_KEY in shell env, `codex@openai-codex` plugin installed. If either is missing, the agent returns "REVIEW UNAVAILABLE" as a single HIGH finding and the pipeline continues — the feature is advisory and absence is never a blocker.

## Product / PM frameworks

19 product-* framework skills + 5 `/product-*` workflow slash-commands are vendored from `deanpeters/Product-Manager-Skills` (CC BY-NC-SA 4.0, private mirror). All run as docstring-only markdown the orchestrator reads — no implementer dispatch, no model-tiering implications. Routing details: `@rules/skill-decision-matrix.md` § Product / PM frameworks.

## When in doubt

- One session first. Add a second agent only if the task genuinely has *independent* subproblems.
- Background + `maxTurns` caps for every auditor/reviewer.
- `isolation: worktree` for any agent that edits files in parallel with another.
- Preload `skills:` instead of `Read`-ing them inside the system prompt.
- Add a cross-model second opinion (`/second-opinion`) only for high-stakes work — plans, security-sensitive diffs, pre-merge gates. Advisory, never blocking.
- Use `/loop-plan` for any non-trivial task — its Phase 3b auto-refreshes the tool inventory and its Phase 4 emits an `## Orchestration design` section that encodes the rules on this page.
