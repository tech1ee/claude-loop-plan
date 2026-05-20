# Orchestration design reference

Progressive-disclosure reference for loop-plan Phase 4's mandatory `## Orchestration design` section. Loaded only when Phase 4 runs.

Every decision in this reference is grounded in `~/.claude/rules/orchestration.md` (pattern catalogue A–F, model tiering, anti-patterns) and `~/.claude/rules/skill-decision-matrix.md` (stack routing). If you find yourself wanting to invent a new rule, update those files first, then reflect the change here.

## 1. Pattern selection decision tree

Research and execution are two separate dimensions. Pick one from each.

### 1a. Phase 1 research pattern (automatic)

Loop-plan Phase 1 already uses Pattern B when there are ≥2 independent exploration domains. Do not re-select or nest Pattern B in the execution walk below — it's a research affordance, not an execution pattern.

### 1b. Phase 5 execution pattern (pick exactly one from A / C / D / E / F)

Walk the task shape top-down. First match wins. **Pattern B is deliberately absent here** — the execution lane is always A/C/D/E/F.

```
1. task.is_high_value AND breadth_research_across_independent_domains
     → Pattern C (orchestrator-worker)

2. task.is_standard_feature_implementation AND has_clear_spec
     → Pattern D (pipeline: implementer → spec-reviewer → code-quality-reviewer)

3. task.touches_files <= 10 AND single_stack AND no_breadth_research
     → Pattern A (single session)

4. task.has_>=3_competing_hypotheses OR adversarial_review_valuable
     → Pattern E (Agent Teams, experimental flag required)

5. task.is_partitioned_across_>=3_independent_targets AND recurring
     → Pattern F (map-reduce via Routines)

default → Pattern A
```

**Never combine two execution patterns in one plan.** Review (Pattern D's gate) can follow any execution pattern, but the main execution lane is exactly one of A / C / D / E / F.

## 2. Agent selection recipe

For every task in the Task sequence, do this in order:

1. **Stack match** — look up the task's technology in `rules/skill-decision-matrix.md`. That's the stack column; it names the shortlist of agents.
2. **Tool requirements** — if the task needs Bash (build/test), filter the shortlist to agents with `Bash` in their `tools`. If the task is read-only review, filter to agents without `Write`/`Edit`/`Bash`.
3. **Model tier** — consult `rules/orchestration.md` §Model tiering. Per ADR-0016, the default is **Opus 4.7** for any code-writing / analysis / review / exploration / security / second-opinion role:
   - Orchestrator / architect / security audit / second-opinion → **Opus 4.7 + `effort: max`**
   - Implementer (any code-writing task) / spec-reviewer / code-quality-reviewer / Phase 1 explorers → **Opus 4.7**
   - Content review / library doc lookup (`research-agent`) → **Sonnet 4.6** (non-gating judgment)
   - Test running / log parsing / translations / Notion sync → **Haiku 4.5** (mechanical only)
4. **Background eligibility** — an agent may run `background: true` ONLY if: (a) it does not have tools capable of executing or writing based on file contents (no Bash, Write, or Edit) — read-only agents with `Read`, `Grep`, `Glob` are safe even when their input is a user-controlled file path, (b) its `maxTurns` is set, (c) it does not require interactive clarification (no `AskUserQuestion`). Example: `security-reviewer` is `background: true` with tools `Read, Grep, Glob` and `maxTurns: 12` — passes rule (a) because file paths are data, not code. Counter-example: an agent with Bash would fail rule (a) because Bash can execute arbitrary content.
5. **Inventory check** — verify the chosen agent exists in `~/.claude/tools-inventory.json`. If not, the task has no assignee — surface in `Missing tooling`.

## 3. Worktree decision rule

From `rules/orchestration.md` §Golden rule 3: *Never parallelize implementers on the same branch.*

Concrete rule for the pipeline DAG:

```
for every pair (task_a, task_b) in parallel_positions:
  if task_a.writes_files AND task_b.writes_files:
    if files(task_a) ∩ files(task_b) != ∅:
      mark as SEQUENTIAL, not parallel
    else:
      mark both with "isolation: worktree"
```

Read-only tasks in parallel positions (explorers, reviewers) do not need worktrees — they can't conflict.

## 4. `## Orchestration design` section template

Copy-paste this into the plan file during Phase 4. Replace bracketed placeholders; delete sub-sections that are N/A. The outer fence uses `~~~` so the inner backtick-fenced DAG renders correctly.

~~~markdown
## Orchestration design

**Dominant pattern:** <A|C|D|E|F> — <one-sentence justification from task shape>.

### Task → agent table

| # | Task | Agent | Model | Background | Stack | Notes |
|---|---|---|---|---|---|---|
| 1 | <task title> | <agent name from inventory OR "main session"> | <opus\|sonnet\|haiku> | <yes\|no> | <android\|ios\|ts\|—> | <maxTurns, depends-on, read-only> |
| 2 | ... | ... | ... | ... | ... | ... |

### Pipeline DAG

```
[Task 1] → [Task 2] ─┬→ [Task 3a]  ┐
                     └→ [Task 3b]  ├→ [Task 4 review gate] → [Task 5]
```

Parallel branches: tasks 3a and 3b. Sequential gate: task 4 must pass before task 5 starts.

### Worktree strategy

- Task 3a and 3b run in parallel and both write files → `isolation: worktree` per orchestration.md golden rule 3.
- Task 4 runs in main branch after both worktrees merge.
- (Or: "N/A — all tasks sequential on main branch.")

### Adaptive recommendations

- **Agent Teams (Pattern E):** <triggered | N/A>. <If triggered, explain which 3–5 hypotheses and which agents become teammates.>
- **Map-Reduce via Routines (Pattern F):** <triggered | N/A>. <If triggered, list the partitions and the shared doc.>
- **Orchestrator-Worker (Pattern C):** <triggered | N/A>. <If triggered, name the Opus 4.7 orchestrator and the Opus 4.7 / Sonnet 4.6 / Haiku 4.5 workers per ADR-0016 tier policy.>

### Missing tooling (gaps)

- <agent-or-skill-name> — <why the plan would want it, what it would do, which task would use it>. No substitute available.
- (Or: "N/A — every task has an assignee in the current inventory.")
~~~

## 5. Adaptive trigger table

**Auto-suggest policy (per ADR-0022 / trigger-system loop):**
- Pattern C is auto-suggested in `## Orchestration design` whenever Phase 1 surfaces ≥3 independent research domains. Emit with rationale; the user can dismiss at the Phase 5 loop gate.
- Pattern E is auto-suggested whenever Phase 1 explorers report ≥3 competing hypotheses (mirrors loop-debug behaviour). The `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` env-gate still applies — emit the suggestion either way; the user enables or skips.
- When picking the per-task agent shortlist for the Pattern D pipeline, consult `~/.claude/data/triggers.json` (the canonical bilingual trigger catalog). Rank candidates by trigger-match score against the task description text.

Agent Teams and Map-Reduce are high-cost and should not fire on routine work. Use this table as the strict trigger gate.

| Pattern | Trigger conditions (ALL must hold) | Hard caps | Source |
|---|---|---|---|
| **E — Agent Teams** | (1) ≥3 competing root-cause hypotheses OR adversarial review provides unique value the pipeline can't, (2) task is **high-value** (a regression reaches production users, touches money / security / auth boundaries, or blocks a ship window — everything else is routine), (3) `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set, (4) task is NOT routine feature dev | 3–5 teammates, 5–6 tasks each, one team per session, no nested teams | orchestration.md §E |
| **F — Map-Reduce via Routines** | (1) work is partitioned across ≥3 independent targets (repos, directories, labels), (2) work is recurring (daily/weekly), (3) target data is in a git repo (sandbox requirement), (4) result shape is write-to-shared-doc | Pro 5/day, Max 15/day, Team 25/day | orchestration.md §F |
| **C — Orchestrator-Worker** | (1) breadth-first research across ≥3 independent domains, (2) task is high-value (justifies ~15× chat token cost), (3) no single agent can cover the breadth | ~15× a chat, ~4× a single agent; reserve for research gains, not execution speed | orchestration.md §C |

If a trigger condition is missing, the pattern does NOT apply — fall back to A/B/D.

## 6. Anti-patterns cheat sheet

From `rules/orchestration.md` §Anti-patterns table. These are hard rules, not style preferences:

- **Do not parallelize implementers on the same branch.** Use worktrees or sequence.
- **Do not delegate 3+ levels deep.** Orchestrator → workers is the ceiling.
- **Do not use `broadcast` in Agent Teams with ≥5 teammates.** Cost scales linearly.
- **Do not write "fix all the tests" or "review the codebase" super-broad prompts.** Specificity wins.
- **Do not re-read the plan file from a subagent.** Pass the task text by value.
- **Do not scale Agent Teams past 5 without per-agent files.** Coordination overhead eats the parallelism gains.
- **Do not use multi-agent for routine coding.** Single Opus 4.7 session is right for 90%+ of editing (ADR-0016 — cost control is the rigor gate, not the model tier).
- **Do not run parallel file writes without worktrees.** Race conditions, lock conflicts.

## 7. Query recipes into `tools-inventory.json`

See `references/tool-inventory.md` §Query recipes for the full jq set. The five most relevant lookups for Phase 4:

1. **Stack shortlist for Android/KMP:** filter agents whose description mentions "KMP" / "Compose" / "Android".
2. **Read-only reviewers (no Bash/Write/Edit):** safe for adversarial input review.
3. **Background-safe agents:** candidates for fire-and-forget auditors post-merge.
4. **MCP servers available:** drives "what context can the implementer pull in?" decisions.
5. **Plugin skills by keyword:** locate superpowers/autoresearch/figma skills for sub-tasks.

## 8. How Phase 4 uses this reference

1. Load this file once when entering Phase 4.
2. For each task in the Task sequence, walk §1 (pattern), §2 (agent), §3 (worktree).
3. Fill in the §4 template, deleting N/A sub-sections.
4. Check §5 adaptive triggers before claiming E or F — if unclear, leave them N/A.
5. Run the §6 anti-pattern cheat sheet against the finished section as a self-check. Any hit → rewrite that row.
6. The drift check in Phase 6 will re-validate assignability against the inventory (§7 of drift-check.md).

## 9. Rendered example

This is what a real `## Orchestration design` section looks like after Phase 4 writes it. Open this file in any markdown renderer (VSCode preview, GitHub, Obsidian) to confirm the outer `~~~` fence contains the inner backtick DAG without collision.

~~~markdown
## Orchestration design

**Dominant pattern:** D — standard feature implementation with clear spec, gated pipeline is the right execution lane.

### Task → agent table

| # | Task | Agent | Model | Background | Stack | Notes |
|---|---|---|---|---|---|---|
| 1 | Scaffold feature module | main session | opus | no | kotlin | — |
| 2 | Implement repository | main session | opus | no | kotlin | depends on 1; code-writing → opus (ADR-0016) |
| 3 | Unit tests | test-runner | haiku | no | kotlin | depends on 2; mechanical → haiku |
| 4 | Spec review | spec-reviewer | opus | yes | — | maxTurns=12, gate; review gate → opus (ADR-0016) |
| 5 | Quality review | code-quality-reviewer | opus | yes | — | maxTurns=12, gate; review gate → opus (ADR-0016) |

### Pipeline DAG

```
[1 Scaffold] → [2 Implement] → [3 Tests] → [4 Spec gate] → [5 Quality gate]
```

Sequential chain. No parallel implementers.

### Worktree strategy

N/A — sequential on main branch.

### Adaptive recommendations

- Agent Teams (Pattern E): N/A — single root-cause hypothesis.
- Map-Reduce (Pattern F): N/A — not partitioned.
- Orchestrator-Worker (Pattern C): N/A — bounded feature, not breadth research.

### Missing tooling

N/A — every task has an assignee in the current inventory.
~~~

If the outer `~~~` fence displays correctly (no visible tildes in the rendered view, code block contains the table + DAG intact), the template is good to ship.
