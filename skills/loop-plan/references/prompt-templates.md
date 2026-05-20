# Prompt templates — Phase 1, 2, 5, 7a

Reference file for the four load-bearing prompt templates that used to live inline in SKILL.md. Cite ADR-0021 for the extraction.

These templates are **paste-by-value** — when SKILL.md cites this file, the orchestrator copies the relevant template into the agent prompt or AskUserQuestion call, never asks the agent to read this file.

---

## Phase 1 — Explorer prompt template (read-only subagent)

Use this prompt for every Phase 1 explorer dispatch (`android-kmp-explorer`, `swiftui-explorer`, generic Explore).

### Hard rules for the dispatch

- **Read-only tools only** — Read, Grep, Glob. No Write/Edit/Bash. No Agent (no nested dispatch).
- **One domain per explorer** — similar-features OR architecture-and-deps OR tests-and-edge-cases. Never combine.
- **Pass task text by-value** (orchestration golden rule 5) — paste the relevant clarifications + scope + bug signature directly into the prompt; never say "read the plan file."
- **No self-audit re-fetch.** Audit-tested anti-pattern: if you tell the explorer "re-Read every cited file before returning," the agent burns its turn budget on verification and delivers no report. Trust the agent's anti-hallucination discipline; the orchestrator-side `verify-code-research.py` is the safety net.
- **Partial-report rule:** "If approaching the turn cap, deliver whatever you have with `(unverified)` markers. Partial report beats no report."
- **Refactoring-candidates report (eager, even at non-`full` rigor):** every explorer additionally reports a `## Refactoring candidates` block per touched file. Orchestrator DISCARDS the block at Phase 4 emission if `state.rigor != "full"`. See [`design-and-quality.md § 6 risk rubric`](design-and-quality.md) for the smell + coverage + risk format.

### Skeleton prompt

```
You are a Phase 1 explorer for the loop-plan orchestrator. Read-only tools.

Domain: <similar-features | architecture-and-deps | tests-and-edge-cases>

Task statement (paste verbatim): <from state.task_statement>
Clarifications (paste verbatim): <from state.clarifications>
Affected scope hint: <from prior iteration findings or user>

Find:
1. Key files + line numbers in scope.
2. Execution-flow traces (how data + control flow through the affected paths).
3. Patterns / conventions observed.
4. Already-handled edge cases.
5. Refactoring candidates per touched file (smell + coverage + risk; see design-and-quality.md § 6).

Output format:

## Explorer findings — domain <X>

### Files in scope
- `<path>:<line>` — <one-line description>

### Execution flow
1. <step> at `<path>:<line>`
2. ...

### Conventions
- <pattern or naming convention observed, with citation>

### Edge cases handled
- <case> — see `<path>:<line>`

### Refactoring candidates
- `<file>:<line-range>`
  Smell: <e.g. long method >30 LOC, primitive obsession, feature envy>
  Coverage: <none | unit only | integration only | both>
  Risk: <HIGH | MED | LOW per design-and-quality.md § 6 rubric>
  Suggested decision: <Address-as-prereq | Address-after | Document-as-tech-debt>

Read-only. Do NOT write, edit, or run anything. If approaching the turn cap, deliver partials with `(unverified)` markers.
```

---

## Phase 2 — Question shape patterns (AskUserQuestion call template)

Borrowed from `requirements-interviewer` research (LLMREI 73.7% extraction rate). Four patterns covering the high-leverage question shapes.

### Hard rules

- ≤ 4 questions per AskUserQuestion call (schema limit).
- 2-4 options per question.
- Recommended option **first**, labeled `(Recommended)`.
- Header ≤ 12 chars.
- Max 2 AskUserQuestion calls per Phase 2 entry.
- Never ask "does the plan look good?" — that's Phase 5's job.
- Never reference plan-file content (user may not have seen it).

### Pattern 1 — Context question

For "what's the bigger goal?" / "why does this matter?" — surface the user's actual purpose so research targets the right thing.

```json
{
  "question": "What's the bigger goal this serves?",
  "header": "Goal",
  "multiSelect": false,
  "options": [
    {"label": "<Most likely guess>", "description": "..."},
    {"label": "<Alt 1>", "description": "..."},
    {"label": "<Alt 2>", "description": "..."}
  ]
}
```

### Pattern 2 — Scope question

For "must-have vs nice-to-have" — reveals the actual minimum viable scope.

```json
{
  "question": "Which of these are must-have for v1?",
  "header": "Scope",
  "multiSelect": true,
  "options": [
    {"label": "<feature/concern 1>", "description": "..."},
    {"label": "<feature/concern 2>", "description": "..."},
    {"label": "<feature/concern 3>", "description": "..."},
    {"label": "<feature/concern 4>", "description": "..."}
  ]
}
```

### Pattern 3 — Constraint question

For "what's the hardest constraint?" — single-select. The hard constraint shapes everything else.

```json
{
  "question": "What's the hardest constraint here?",
  "header": "Constraint",
  "multiSelect": false,
  "options": [
    {"label": "<perf | size | time | compat>", "description": "..."},
    {"label": "<alt constraint>", "description": "..."},
    {"label": "<alt constraint>", "description": "..."}
  ]
}
```

### Pattern 4 — Trade-off question (with previews)

For "accept slower X for smaller Y, or reverse?" — side-by-side previews when comparing concrete artifacts.

```json
{
  "question": "Bundle size vs first-render speed — which matters more?",
  "header": "Trade-off",
  "multiSelect": false,
  "options": [
    {
      "label": "Smaller bundle (Recommended)",
      "description": "+200ms first render, -40% bundle.",
      "preview": "// code or table comparing the two outcomes"
    },
    {
      "label": "Faster first render",
      "description": "Larger bundle, sub-50ms TTFB.",
      "preview": "// alt code/table"
    }
  ]
}
```

---

## Phase 5 — Loop-gate AskUserQuestion shape

Fired at end of every loop iteration. Routes to one of: re-enter Phase 1 / 2 / 3, or advance to Phase 6.

```json
{
  "questions": [{
    "question": "Loop iteration <N> complete. What next?",
    "header": "Next step",
    "multiSelect": false,
    "options": [
      {"label": "Ship it", "description": "Run drift check and exit into plan approval. Pick this when the plan is ready to execute."},
      {"label": "More research", "description": "Re-enter Phase 3 with a narrower question set. Pick this when the research left specific trade-offs unresolved."},
      {"label": "More exploration", "description": "Re-enter Phase 1 with a narrower file scope. Pick this when the codebase context is still fuzzy."},
      {"label": "More clarification", "description": "Re-enter Phase 2 with follow-up questions. Pick this when YOU want to redirect the plan before more work happens."}
    ]
  }]
}
```

### Keyword fallback

If the user's most recent free-text message in this loop contains any of these strings (case-insensitive), skip the gate question and proceed directly to Phase 6 as if "Ship it":

- English: `ship it`, `start working`, `lets build`, `build it`, `looks good`, `go ahead`
- Russian: `поехали`, `начинай`, `погнали`, `пошли`, `готово`

### Loop-back routing

| Choice | Next state.current_phase | What happens |
|---|---|---|
| Ship it | `"6"` | Drift check + second opinion, then Phase 7 |
| More research | `"3"` | Re-enter Phase 3 with narrowed queries |
| More exploration | `"1"` | Re-enter Phase 1 with updated scope |
| More clarification | `"2"` | Re-enter Phase 2 with follow-up questions |

State update: append `{iteration, choice, timestamp}` to `state.loop_gate_history`.

---

## Phase 7a — 5-line ExitPlanMode summary template

Print this 5-line summary directly above `ExitPlanMode`. Exactly five points; no more, no less.

```
1. **Goal:** <1-line restatement of the task statement>
2. **Approach:** <chosen design from Phase 4 § 1 Architecture decisions>
3. **Tasks:** T1: <name>, T2: <name>, ... T_N: <name>
4. **Risks:** <top 1-2 risks from Phase 4 § 6 failure-mode review>
5. **Verification:** <how the user will know it shipped — tests, mutation gate, ADR-NNNN accepted>
```

Then call `ExitPlanMode` with the plan content. The plan file is read by ExitPlanMode automatically — do NOT paste the full plan into the summary.

**Hard rule:** if the plan is too complex to summarize in 5 lines, the plan is too complex. Loop back to Phase 5 and ask the user to scope down.

---

## Cross-references

- [`phase3-subagent-template.md`](phase3-subagent-template.md) — Phase 3 research-agent prompt (52 lines, separate file because it's the longest template).
- [`design-and-quality.md`](design-and-quality.md) — § 6 risk rubric used in Phase 1 refactoring-candidates block.
- [`design-and-quality.md`](design-and-quality.md) § Decision-detection heuristic — header whitelist for Phase 2 auto-ADR creation.
- [`drift-check.md`](drift-check.md) — Phase 6a sub-agent prompt (separate template, owned by drift-check.md not this file).
