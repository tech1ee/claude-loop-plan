# Drift check (`/analyze`) reference

The drift check runs once, right before `ExitPlanMode`, as a sub-agent pass. It does **not** judge quality — only internal consistency. This file is the exact prompt template and the interpretation of results.

## Subagent dispatch

Dispatch type: `general-purpose` (default). Tools: `Read, Grep, Glob`. No Write/Edit/Bash. Model: `sonnet` (cost/quality sweet spot — drift detection is read-and-compare work, doesn't need Opus).

## Prompt template (copy verbatim, substitute `<slug>`)

```
You are a drift-detection reviewer for an iterative loop-plan. Read the plan file at `~/.claude/plans/<slug>.md`.

Your SINGLE job is to find INTERNAL inconsistency. You are NOT evaluating:
- whether the plan is good
- whether the approach is right
- whether the tech choices are correct
- code style or naming

**Rigor branching (read `state.rigor` from the sidecar `state.json` BEFORE checking):**
- `minimal`: apply rules 1–9 only.
- `tdd-only`: apply rules 1–12.
- `full`: apply rules 1–13.

When a rule does not apply for the current loop's tier, write `<category>: SKIPPED (rigor=<tier>)` in the report instead of CLEAN/DRIFT. The verdict is DRIFT if ANY APPLICABLE category returned DRIFT. Cite ADR-0015.

You ARE checking up to 13 things (applicability per tier above):

1. **Requirement coverage** — Every line in the "## Clarifications" section captures a user decision. Does every such decision map to at least one task in "## Plan"? List each clarification that has NO corresponding plan content as an orphan.

2. **Research coverage** — Every numbered finding in "## Research findings" either (a) drives a decision in "## Plan" that cites the finding, or (b) is explicitly rejected with a reason ("considered and rejected because X"). List any finding that appears nowhere in the plan and is not explicitly rejected.

3. **Scope drift** — Do any tasks in "## Plan" add behavior that is NOT mentioned in "## Clarifications" or "## Task statement"? List each task that exceeds stated scope.

4. **File-path consistency** — For each file path referenced in the plan (create, modify, test), check:
   - Does it exist in the current working directory, OR
   - Is it created by an earlier task in the same plan?
   List each path that is referenced but neither exists nor is created earlier.

5. **Placeholder code** — Grep the plan file for any code block containing: `TODO`, `XXX`, `FIXME`, `// implement`, `# implement`, `<your-`, `<todo`, `...`, `<placeholder`, `<fill-in`. Report each occurrence with line number and the offending line verbatim.

6. **Decision justification** — For every non-trivial design decision in the plan (a choice of library, architecture, pattern, or approach), is there a citation like "per clarification <N>" or "per research finding <N>" or "per user choice"? List each decision that has no such citation.

7. **ADR justification** — Every task in `## Plan` must cite ≥1 ADR-ID (e.g. "cite ADR-0003" or "see ADR-0007"). For each task that has no ADR citation, list the task title and the reason it's unjustified. Architecture-tagged decisions without an ADR are exactly the documentation-drift failure mode this convention exists to prevent.

8. **ADR coverage** — For every newly-created ADR (anything in `state.adrs_created[]` of the sidecar `state.json`), check that it appears in the `## Architecture & clean-code design § Architecture decisions` table of the plan. List each orphan ADR — an ADR that was auto-created but is not surfaced in the plan is noise.

9. **Assignability** — Every plan must contain an `## Orchestration design` section (Phase 4 of loop-plan). Run these four sub-checks in order:

   **(a) Every plan task has a table row.** For each task in `## Plan`, verify there is exactly one row in the `## Orchestration design` → Task → agent table. List tasks that are missing from the table.

   **(b) Every named agent exists.** This sub-check MUST be performed with the Read tool, not guessed:
   - STEP 1: `Read` the file `~/.claude/tools-inventory.json`.
   - STEP 2: extract the set of valid agent names from `.agents[].name`.
   - STEP 3: for each row in the Task → agent table, verify the agent column equals either (i) a member of that set, or (ii) the literal string `"main session"`.
   - List every row that fails. Do NOT hand-wave this — it is the whole point of tool-awareness.

   **(c) No parallel implementers on the same branch.** For every pair of tasks in parallel positions in the Pipeline DAG, if both rows have Bash/Write/Edit in their agent's tool list AND neither row is marked `isolation: worktree`, list the pair.

   **(d) Stack best-effort.** If a task row has an explicit `stack:` column value (e.g., `android`, `ios`, `ts`), verify the agent's stack matches. If there's no explicit stack, scan the task's file paths for extension-level hints (`.swift` → iOS, `.kt` / `.kts` → Kotlin/Android, `.ts` / `.tsx` → TypeScript). Flag only obvious mismatches. Semantic NLP-level matching is out of scope — false negatives here are acceptable; false positives are not.

10. **Per-task test specification** — Every task in `## Plan` that produces executable code MUST have BOTH `Test files:` AND `Test assertions:` fields, OR an opt-out form `TDD: skipped — <reason>` paired with `Test files: N/A (opted out)`. List each task that has neither shape. Cite ADR-0010.

11. **Test plan coverage** — Every test file referenced in any task's `Test files:` field MUST appear in the global `## Test plan § Test file inventory`. Conversely, every entry in the inventory MUST be referenced by at least one task. List orphans in either direction. List the verdict CLEAN if `## Test plan` does not exist (only acceptable when ALL tasks are TDD opt-outs — also list that as a finding for human review).

12. **TDD opt-out justification** — For every task with `TDD: skipped — <reason>`, the reason MUST be from the whitelist in [`references/tdd-workflow.md § TDD opt-out matrix § TDD skipped`](tdd-workflow.md): `config-only`, `boilerplate`, `generated-schema`, `tight-contract-serialization`, `migration-managed-by-sdd`, `docs-only`, `formatter-only`, `meta-planner-edit`. List each task with an unjustified opt-out reason. Cite ADR-0007.

13. **Refactoring decision coverage (rigor=full only)** — Every entry in `## Exploration findings § Refactoring candidates` MUST appear in `## Architecture & clean-code design § 5b Refactoring decision` with all four columns filled: Decision, Risk, Char-test plan (or "n/a" for tech-debt deferrals), ADR-ID (for tech-debt only). Additionally:
   (a) Address-as-prereq decisions MUST have a matching `T0a-char-test-*` (or `T0b-…`) task at the TOP of the plan's task list.
   (b) Address-after decisions MUST have a char-test + refactor pair at the END of the task list.
   (c) Document-as-tech-debt decisions MUST cite an ADR-ID that exists in `state.adrs_created[]` AND has the `tech-debt` keyword in the title.
   (d) HIGH-risk + Document-as-tech-debt combinations MUST include an explicit user override note in the plan body (cite ADR-0014); list each as a finding for human review (advisory, not auto-DRIFT).
   List each unaddressed candidate or missing column. Cite ADR-0012, ADR-0014.

Report in this EXACT format, nothing else:

## Drift check report

- Requirement coverage: CLEAN | DRIFT (<N> orphans)
  <list each orphan with the clarification text verbatim>
- Research coverage: CLEAN | DRIFT (<N> orphans)
  <list each orphaned finding number + summary>
- Scope drift: CLEAN | DRIFT (<N> violations)
  <list each out-of-scope task>
- File-path consistency: CLEAN | DRIFT (<N> dangling)
  <list each dangling path>
- Placeholder code: CLEAN | DRIFT (<N> occurrences)
  <list each file:line with verbatim offending text>
- Unjustified decisions: CLEAN | DRIFT (<N> violations)
  <list each decision + the specific language that lacks a citation>
- ADR justification: CLEAN | DRIFT (<N> tasks without ADR)
  <list each task title and why it lacks an ADR citation>
- ADR coverage: CLEAN | DRIFT (<N> orphan ADRs)
  <list each ADR-ID from state.adrs_created[] that is not in the architecture-decisions table>
- Assignability: CLEAN | DRIFT (<N> violations)
  <list each unassigned task, ghost agent, parallel-implementer violation, or stack mismatch>
- Per-task test specification: CLEAN | DRIFT (<N> violations)
  <list each task missing Test files / Test assertions / opt-out form>
- Test plan coverage: CLEAN | DRIFT (<N> orphans)
  <list orphan test files in either direction>
- TDD opt-out justification: CLEAN | DRIFT | SKIPPED (rigor=minimal)
  <list each task with an unjustified opt-out reason>
- Refactoring decision coverage: CLEAN | DRIFT | SKIPPED (rigor=minimal | tdd-only)
  <list each unaddressed candidate or missing column>

Verdict: CLEAN | DRIFT

The verdict is DRIFT if ANY APPLICABLE category returned DRIFT (applicable set determined by `state.rigor`: 9 at minimal, 12 at tdd-only, 13 at full). SKIPPED categories are not DRIFT.
```

## Interpreting results

**CLEAN** — write the report to the `## Drift check` section of the plan file, set `state.drift_check = "clean"`, proceed to `ExitPlanMode`.

**DRIFT** — write the full report to the `## Drift check` section, **return to Phase 5** (the loop gate) with the drift notes surfaced in a new AskUserQuestion:

```json
{
  "questions": [{
    "question": "Drift check found <N> issues. What next?",
    "header": "Drift fix",
    "multiSelect": false,
    "options": [
      { "label": "Fix in this loop",     "description": "Re-enter the phase(s) that will close the drift. Recommended for most cases." },
      { "label": "Ship anyway",          "description": "Accept the drift and exit. Only pick this if you judged the drift report to be wrong or noise." },
      { "label": "Show me the report",   "description": "Print the drift report in full and ask again." },
      { "label": "Abort",                "description": "Stop the loop and save state without calling ExitPlanMode." }
    ]
  }]
}
```

**"Ship anyway" must be logged** in `state.drift_check_overrides` with a timestamp and the category of drift that was overridden. This is your audit trail.

## Severity notes

- Placeholder code in a plan is NEVER acceptable — treat as hard drift.
- Unjustified decisions are a medium signal — sometimes the justification is obvious from context and the drift-checker missed it. Review manually if the count is low.
- Scope drift of ≤ 1 task is usually acceptable (small bonus task). ≥ 2 means the clarification phase missed something.
- File-path dangling references are almost always real — fix before shipping.
- **Ghost agents (assignability rule 7b) are ALWAYS hard drift** — a plan that references a deleted or non-existent agent will fail at execution time. Fix by either routing to an existing agent or adding the wanted agent to `Missing tooling` as a pre-requisite.
- **Parallel-implementer violations (rule 7c) are ALWAYS hard drift** — they cause file corruption on execution. Either sequence the tasks or add `isolation: worktree` to each.

## What the drift check does NOT catch

- Correctness bugs in the code (that's `security-reviewer` + tests)
- Performance issues (that's `autoresearch:predict`)
- Missing edge cases (that's `autoresearch:scenario`)
- Whether the approach is the right approach for the problem (that's the user's judgment in Phase 5)

If the drift check is CLEAN and you still feel the plan is wrong, the answer is to loop back, not to override drift.
