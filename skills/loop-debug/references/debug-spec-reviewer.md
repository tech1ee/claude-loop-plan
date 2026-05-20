# Debug-mode spec-reviewer override

The default `spec-reviewer` agent assumes a "spec" is a feature description — what new behavior the change should add. For loop-debug, the spec is implicit and *different*: a fix passes review if and only if it (1) makes the regression test pass, (2) is minimal, (3) doesn't weaken the existing safety net, (4) doesn't sneak in scope. This file is the addendum that loop-debug pastes by-value into the spec-reviewer's prompt at Phase 6b dispatch.

**Design note:** loop-debug does NOT fork the `spec-reviewer` agent. We pass a `context_hint` and override its interpretation via prompt addendum. Same agent file, same model (Opus 4.7 per ADR-0016), different mode. Cite ADR-0019.

## The addendum (paste verbatim into spec-reviewer prompt)

```
Debug-mode spec for this task.

The "spec" you're reviewing is NOT a feature description. It is an implicit
contract derived from the bug under investigation:

1. **Regression test passes GREEN.** The T0a regression test that was RED at
   the start of this task MUST be GREEN after the fix. If it's still RED, the
   fix is incomplete. If it's flaky (sometimes RED, sometimes GREEN), the fix
   is wrong — return SPEC-NOT-COMPLIANT.

2. **Fix is minimal.** The fix touches ONLY files implicated by the confirmed
   root-cause hypothesis (read `state.root_cause_hypotheses[].file_paths`
   where `status: confirmed`). Any unimplicated file modified by the fix is
   a SPEC-NOT-COMPLIANT verdict — even if the change "looks like an improvement"
   (especially if it does).

   Cosmetic edits in unimplicated files (renames, formatting, import reorder)
   are also SPEC-NOT-COMPLIANT. They belong in a separate refactor task with
   its own char-test prereq.

3. **Post-fix mutation ≥ pre-fix mutation.** The mutation score after the fix
   MUST be ≥ the snapshot score from before the fix (per ADR-0014). If the
   plan declared `Mutation pre-snapshot:` and `Mutation post-check:` lines, the
   implementer's task report MUST contain both numbers. If post < pre, return
   SPEC-NOT-COMPLIANT — the safety net was weakened.

4. **No scope explosion.** If the implementer reported they spotted refactoring
   opportunities or "while I'm here" cleanup and acted on it, return
   SPEC-NOT-COMPLIANT. The correct behavior is `DONE_WITH_CONCERNS — refactor_recommended`
   without acting. The user opens follow-up tasks at their discretion.

5. **Test files unchanged.** The T0a test files are locked via the T17 PreToolUse
   hook (`_active_task_files.txt`). The implementer MUST NOT modify them. Run
   `~/.claude/bin/test-integrity.py verify --root <project> --task <task-id>` —
   if it returns non-zero, the test files were tampered with: SPEC-NOT-COMPLIANT.

This addendum OVERRIDES any feature-spec interpretation. Apply WHEN
`context_hint.debug_mode == true`.

State context (paste-by-value):
- bug_signature: <state.bug_signature>
- root_cause_hypotheses (confirmed only): <filtered list>
- pre_mutation_score: <state.mutation_pre>
- T0a test paths: <state.red_test_path>
- T-fix declared file scope: <T-fix.Files modified>
```

## Verdict semantics

The spec-reviewer returns one of three verdicts in debug mode:

| Verdict | Meaning | Loop-debug action |
|---|---|---|
| `SPEC-COMPLIANT` | All 5 criteria pass. Fix is minimal, regression GREEN, mutation post ≥ pre, no scope explosion, tests untampered. | Advance to `code-quality-reviewer`. |
| `SPEC-NOT-COMPLIANT` | One or more criteria failed. | Re-dispatch implementer with the failure reason in the prompt. Hard cap 3 retries; on the 4th failure, surface to user. |
| `SPEC-COMPLIANT-WITH-CONCERNS` | All 5 criteria pass BUT the implementer reported `DONE_WITH_CONCERNS — refactor_recommended` (which IS the correct behavior — they spotted an issue and didn't act). | Advance to `code-quality-reviewer`. Append the concerns to a `## Follow-ups` section in the plan for the user to triage post-ship. |

## What the debug spec-reviewer does NOT do

- It does NOT evaluate code quality / style / readability — that's the `code-quality-reviewer`'s job (dimensions 9–11).
- It does NOT run security-style review — that's `security-reviewer` (dispatched at hardened intensity).
- It does NOT re-run the test suite — that's `test-runner`'s job, dispatched separately.
- It does NOT decide whether the root cause was correctly identified — that's the user's job at Phase 5 loop gate (where they reviewed Phase 1 findings).
- It does NOT auto-approve a fix that "obviously works" — even a one-line fix gets all 5 criteria checked.

## Pre-mutation snapshot mechanics

The implementer must record the pre-mutation score BEFORE running their fix. Concretely:

1. **Phase 6b setup step** runs `test-runner mode: mutation --baseline-only` against the test set that exercises the buggy code path. Result is `pre_mutation_score` written to `state.mutation_pre`.
2. **Implementer task** runs the fix.
3. **Phase 6b verify step** runs `test-runner mode: mutation` against the same test set. Result is `post_mutation_score` written to `state.mutation_post`.
4. **Spec-reviewer at Phase 6b** reads both numbers from state and applies the criterion.

If `state.mutation_pre` is missing (setup step never ran), the spec-reviewer returns `SPEC-NOT-COMPLIANT — pre-mutation snapshot missing` and loop-debug halts. This is unrecoverable without re-running setup; the user must abort the task and restart Phase 6b.

## Anti-patterns

| Anti-pattern | Why it fails |
|---|---|
| Forking spec-reviewer into a `debug-spec-reviewer` agent | Doubles maintenance. The override-via-prompt approach (this file) is the chosen design per ADR-0019 § 5. |
| Passing `context_hint` without the verbatim addendum | The agent has no way to know "debug mode" means anything specific without the criteria spelled out. |
| Skipping pre-mutation snapshot for "fast" fixes | Then criterion 3 can't be evaluated. The cost (one mutation run) is the cost of admission. |
| Returning `SPEC-COMPLIANT` for a fix that touched unimplicated files because "the diff is small" | Criterion 2 has no size threshold. ANY unimplicated file is DRIFT. |
| Auto-approving the implementer's `DONE_WITH_CONCERNS` without recording the concern | Concerns must land in `## Follow-ups` — otherwise the user never sees them. |

## Cross-references

- [`./bug-reproduction-harness.md`](./bug-reproduction-harness.md) — `bug_signature` schema (criterion 1 setup).
- [`./debug-drift-rules.md`](./debug-drift-rules.md) — drift rule 14 enforces criterion 2 at plan level; spec-reviewer enforces it at exec level. Defense in depth.
- [`./prevention-design.md`](./prevention-design.md) — T0b runs AFTER spec-reviewer signs off on T-fix.
- [`../../loop-plan/references/design-and-quality.md`](../../loop-plan/references/design-and-quality.md) § dimensions — `code-quality-reviewer`'s 11 dimensions, run after debug spec-reviewer.
- ADR-0014 — mutation floor.
- ADR-0016 — Opus 4.7 default for spec-reviewer.
- ADR-0019 — this skill's umbrella decision.
