# Workflow Phases (Full Reference)

Deep reference for the 6-phase research-first workflow. The task-type → phases table in CLAUDE.md is the decision logic; this file is the playbook for each phase.

## Phase 0 — Requirements Interview (new features/projects only)

Invoke `requirements-interviewer` when starting something new where requirements are unclear.

- 6-phase structured interview: Context → Scope → Feature Deep-Dive → NFR Sweep → Gap Analysis → Validation.
- One question at a time, multiple-choice when possible, progressive disclosure (broad → narrow).
- Apply JTBD ("When [situation], I want to [motivation], so I can [outcome]").
- 5 Whys when the user describes a solution instead of a problem.
- Check 8 hidden gap categories: assumption, edge case, integration, performance, security, error, temporal, data.

**Output** → `docs/requirements/`: PRD.md, user-stories.md, decisions.md, interview-notes.md.
**Hard gate:** do not proceed until requirements are documented and confirmed.
**Skip when:** bug fixes, refactors, trivial changes, user provides complete spec, continuing prior work.

## Phase 1 — Code Research

Scale effort to the task. New feature/significant: 2–3 Explore agents in parallel. Bug fix/small: 1 agent or direct Grep/Glob. Trivial: read the file.

For substantial work, dispatch up to 3 parallel Explore agents:

| Focus | What to find |
|---|---|
| Similar features | Existing implementations, execution paths, data flows, patterns |
| Architecture & deps | Modules, classes, interfaces, upstream/downstream consumers |
| Tests & edge cases | Existing tests, handled edge cases, error paths |

Each agent must report: key files with line numbers, execution-flow traces, patterns/conventions, dependencies, already-handled corner cases.

**Hard gate:** understand what code is affected, its corner cases, and what breaks after the change.

## Phase 2 — Impact Analysis (features/significant only)

Invoke `autoresearch:predict` with 5 adversarial personas:

| Persona | Focus |
|---|---|
| Architect | Structural soundness, fit with existing architecture |
| Security Engineer | Attack vectors — auth bypass, injection, data exposure |
| Performance Engineer | Scale issues — memory leaks, N+1, UI jank |
| Reliability Engineer | Failure modes, race conditions, edge cases |
| Devil's Advocate | What are we missing, what assumptions are wrong, worst case |

**Output:** ranked risks, bad decisions to avoid, things affected.
**Hard gate:** if critical risks found, address them in the design phase.

## Phase 3 — Internet Research

Scale to the task. New feature / significant decision → full `deep-researcher` or `autoresearch:research` (autonomous, iterative, with date-verification and cross-validation). Bug fix / known pattern → `context7` + quick WebSearch. Trivial / well-understood → skip.

For substantial work, `deep-researcher` 5-step methodology:

1. **Query decomposition** — ≥5 sub-questions. Must include: best current solutions; positive AND negative sentiment; common mistakes; alternatives/trade-offs; actual date/version.
2. **Multi-source search** — ≥20 sources across official docs (via `context7` first), blogs, Stack Overflow, GitHub issues, Reddit/HN, benchmarks.
3. **Credibility scoring** — 0.0–1.0 on authority, currency, objectivity, accuracy, coverage.
4. **Critical synthesis** — group findings, identify consensus (3+ sources = HIGH confidence), highlight conflicts, separate facts from opinions.
5. **Structured output** — report to `docs/research/` with findings, sentiment, recommended approach, risks.

**Hard gate:** include actual user/developer feedback, not just official docs.

## Phase 4 — Design & Planning

1. **Design** (`superpowers:brainstorming`): feed ALL research findings, propose 2–3 approaches each referencing specific research findings, trade-offs based on data, approve section-by-section.
2. **Plan** (`superpowers:writing-plans`): bite-sized 2–5-min tasks, real code blocks, exact paths/line numbers/commands, reference which research drives each decision.

## Phase 5 — Implementation

Use `superpowers:subagent-driven-development` or `:executing-plans`.

- Dispatch parallel agents for independent tasks.
- Each task: implement → run tests → verify.
- After security-sensitive changes: `security-reviewer` subagent in background.
- After all tasks: `superpowers:verification-before-completion` — full test suite, evidence everything works.
- Finish with `superpowers:finishing-a-development-branch`.

## Phase 6 — Post-Implementation Quality

- `autoresearch:scenario` — discover missed edge cases.
- `autoresearch:debug` — hunt bugs in new code.
- `autoresearch:security` — STRIDE + OWASP red-team.
- `autoresearch:fix` — auto-repair findings.
- Final `security-reviewer` background agent.

## Bug-Fix Variant (skip Phase 0)

For non-trivial bugs, prefer **`/loop-debug`** — the iterative research-driven bug-fixer (sister to `/loop-plan`). It enforces a regression-test-first contract (Phase 0 reproduces the bug as a failing test before any investigation), auto-triggers Pattern E when ≥3 root-cause hypotheses surface, and emits a 3-task split (T0a regression + T-fix minimal + T0b prevention) gated by the post-fix mutation floor (ADR-0014). Cite ADR-0019.

For ad-hoc / trivial bug fixes that don't warrant the full loop:

```
1. CODE RESEARCH — Explore agents find all usages of the buggy code
2. IMPACT ANALYSIS — autoresearch:predict
3. INTERNET RESEARCH — deep-researcher if not a known pattern
4. SYSTEMATIC DEBUGGING — superpowers:systematic-debugging (root cause)
5. FIX — autoresearch:fix (iterative repair with guard tests)
6. VERIFY — superpowers:verification-before-completion
```

The 7-phase `/loop-debug` flow:

```
0. REPRODUCE       — extract bug_signature; test-writer writes T0a → must fail RED
1. INVESTIGATE     — parallel explorers (root-cause + scope + existing-coverage); auto-Pattern-E ≥3 hypotheses
2. CLARIFY         — AskUserQuestion: scope / severity / fix-shape / acceptance (NOT rigor)
3. RESEARCH        — date-strict: fix patterns + prevention strategies for THIS bug class
4. PLAN            — emit T0a regression + T-fix minimal + T0b prevention-design
5. LOOP GATE       — intensity HERE (minimal|standard|hardened) + ship/loop/back-to-X
6. DRIFT + EXEC    — drift rules 1–13 + 14–17; ExitPlanMode; RED→impl→GREEN→verify→mutation+post≥pre
```

## Quick-Research Variant

Skip 1–2. Go straight to Phase 3 (`deep-researcher`). Deliver the report.

## Self-Improvement Loop

After every significant task:
1. What worked well → persist to memory MCP.
2. What was slow / required retry → persist as improvement opportunity.
3. Were research findings accurate → update source confidence.
4. Patterns worth reusing → save to memory MCP.
