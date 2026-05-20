# Debug-mode drift rules (extends loop-plan's drift-check.md)

Loop-debug's Phase 6a drift check applies all of loop-plan's base rules 1–13 (per `state.intensity`, mapped from loop-plan's `state.rigor`) PLUS four bug-specific rules unique to debug. This file specifies rules 14–17 and shows how to invoke the drift-check sub-agent.

Cite ADR-0019 (this skill), ADR-0014 (mutation floor — the source of rule 16).

## Intensity → rule applicability

Loop-debug uses `state.intensity` instead of `state.rigor`. Mapping:

| `state.intensity` | Maps to loop-plan tier | Applicable rules |
|---|---|---|
| `minimal` | minimal | 1–9, 14, 15 |
| `standard` | tdd-only | 1–12, 14, 15, 16, 17 (when bug_risk ≥ MED) |
| `hardened` | full | 1–13, 14, 15, 16, 17 (always), plus dimension-11 reviewer at exec |

When a rule does not apply for the current intensity, write `<rule>: SKIPPED (intensity=<tier>)` instead of CLEAN/DRIFT.

## The 4 debug-specific rules

### Rule 14 — Fix-scope is minimal

**Always applies (all intensities).**

The `T-fix-<slug>` task touches only files implicated by the **confirmed root-cause hypothesis** in `state.root_cause_hypotheses[]` (where `status: confirmed`). Any other file touched is DRIFT.

Specifically:
- Refactoring outside the implicated call chain is DRIFT.
- "Cleanup while I'm here" of unrelated code is DRIFT.
- Renaming, formatting, import reorganization in unimplicated files is DRIFT.

If the implementer needs to refactor an unimplicated file to make the fix work, that refactor must be a **separate task** (not part of T-fix), with its own char-test prereq (cite ADR-0014's char-test pattern) and its own post-≥-pre mutation check.

**How the drift sub-agent checks this:**
- Read `state.root_cause_hypotheses[].file_paths` → "implicated set."
- Read T-fix's `Files modified:` declaration in the plan.
- Verdict DRIFT if any file in T-fix's modified set is not in the implicated set.
- Verdict CLEAN if all modified files are implicated.

**Edge case:** type-constraint changes in T0b's recommendation list (when accepted) are NOT bound by rule 14 — they're a separate accepted task, not part of T-fix.

### Rule 15 — Regression test reproduces THIS bug

**Always applies (all intensities).**

The T0a regression test, at RED gate (Phase 0), failed with a message that matches `bug_signature.actual_output`. The drift sub-agent verifies the plan's `## Bug signature` section is consistent with what T0a asserts.

**Concretely, the test must NOT be:**
- A generic `assertNotNull(result)` or `expect(noException)` — these pass for the wrong reason.
- A fixture that asserts only that the buggy code path doesn't crash, ignoring the wrong output.
- A test that uses different inputs / preconditions than `bug_signature` ("equivalent inputs" is DRIFT).

**The test MUST:**
- Use exact `inputs` from `bug_signature` (or a redacted but shape-preserving version for PII).
- Set up exact `precondition` from `bug_signature`.
- Assert against `assertion_that_fails` from `bug_signature`.
- At RED gate, fail with a message containing key substrings of `actual_output`.

**How the drift sub-agent checks this:**
- Read T0a's test file (path from `state.red_test_path`).
- Diff its assertions against `state.bug_signature.assertion_that_fails`.
- Diff its setup against `state.bug_signature.precondition`.
- Verdict DRIFT if assertion or setup diverges materially. Cosmetic differences (variable naming) are CLEAN.

### Rule 16 — Post-fix mutation ≥ pre-fix mutation

**Applies at standard + hardened intensities. SKIPPED at minimal.**

The plan emits the mutation floor check (cite ADR-0014). Specifically the plan must contain:
- A `T-fix` task that lists `Mutation pre-snapshot:` (a `test-runner mode: mutation --baseline-only` invocation against the relevant test set BEFORE the implementer runs).
- A `T-fix` task that lists `Mutation post-check:` (a `test-runner mode: mutation` invocation AFTER GREEN).
- A `T-fix` task that lists `Hard block on post < pre:` with the exit policy (HARD-BLOCK, surface surviving mutants, do not advance).

**How the drift sub-agent checks this:**
- Search T-fix's task body for the three lines above.
- Verdict DRIFT if any are missing or rephrased to soften ("advisory only," "log warning") at standard tier.
- At hardened tier, additionally check that thresholds are 90/70/60 (vs 80/60/50 default).

**Note on equivalent mutants:** rule 16 doesn't require post == pre at the *individual* surviving-mutant level — equivalent mutants in real-world projects are 4–39% (per Phase 3 finding Q3). The check is on the *aggregate score*. If pre-fix had 20 surviving mutants and post-fix has 21, that's a regression even if the new survivor is provably equivalent — the user must explicitly approve the new survivor before advancing (per ADR-0014's advisory-tier policy at the `notice` band; the `break` band is the hard floor).

### Rule 17 — T0b prevention emitted for non-LOW-risk bugs

**Applies at standard intensity when `state.bug_risk ∈ {MED, HIGH}`. Always applies at hardened intensity.**

If the bug's risk classification is MED or HIGH, the plan must include a `T0b-prevention-design-<slug>` task. Missing T0b is DRIFT.

**Risk classification** comes from Phase 1 Domain 3 explorer (existing test coverage):
- HIGH: bug crashed in production, bug in payment / auth / data-integrity code, bug in hot code path (>10% of requests), no test coverage on the buggy path.
- MED: bug surfaced in QA but not production, bug in feature code with partial test coverage.
- LOW: typo in error message, dev-only logging gap, cosmetic UI tweak, comment fix.

If the explorer's risk classification is missing, the drift sub-agent treats it as MED (require T0b).

**How the drift sub-agent checks this:**
- Read `state.bug_risk` (or default MED if unset).
- Search the plan for a `### T0b — prevention-design-<slug>` heading.
- At standard tier with bug_risk MED/HIGH: verdict DRIFT if T0b heading is absent.
- At hardened tier: verdict DRIFT if T0b heading is absent (regardless of bug_risk).
- LOW-risk bugs at standard tier with T0b absent: verdict CLEAN (T0b is opt-in for LOW).

## Drift sub-agent prompt template

Dispatch type: `general-purpose`. Tools: `Read, Grep, Glob`. No Write/Edit/Bash. Model: `sonnet` (drift detection is read-and-compare; doesn't need Opus).

```
You are a drift-detection reviewer for an iterative loop-debug. Read the plan
file at `~/.claude/plans/<slug>.md` and the state file at
`~/.claude/plans/<slug>.state.json`.

Your SINGLE job is to find INTERNAL inconsistency. You are NOT evaluating:
- whether the fix is good
- whether the approach is right
- code style or naming

**Intensity branching (read `state.intensity` from the sidecar BEFORE checking):**
- `minimal`: apply rules 1–9, 14, 15.
- `standard`: apply rules 1–12, 14, 15, 16, 17 (when bug_risk ≥ MED).
- `hardened`: apply rules 1–13, 14, 15, 16, 17 (always).

When a rule does not apply, write `<rule>: SKIPPED (intensity=<tier>)`.
Verdict is DRIFT if ANY APPLICABLE rule returned DRIFT. Cite ADR-0019.

You ARE checking up to 17 things:

[Rules 1–13: copy verbatim from ../../loop-plan/references/drift-check.md]

14. **Fix-scope is minimal** — Read `state.root_cause_hypotheses[]` to find the
    implicated file set (`status: confirmed` hypothesis's `file_paths`). Read
    T-fix's `Files modified:` declaration. Verdict DRIFT if any T-fix file is
    not in the implicated set. List each unauthorized file.

15. **Regression test reproduces THIS bug** — Read T0a's test file (path from
    `state.red_test_path`). Diff its setup against `state.bug_signature.precondition`
    and its assertions against `state.bug_signature.assertion_that_fails`. Verdict
    DRIFT if either diverges materially.

16. **Post-fix mutation ≥ pre-fix mutation** — Search T-fix for three lines:
    "Mutation pre-snapshot:", "Mutation post-check:", "Hard block on post < pre:".
    Verdict DRIFT if any missing or rephrased to soften.

17. **T0b prevention emitted for non-LOW-risk bugs** — Read `state.bug_risk`.
    At standard with bug_risk ∈ {MED, HIGH} OR at hardened: verify a
    "### T0b — prevention-design-<slug>" heading exists. Verdict DRIFT if absent.

Output format (one verdict per rule, in numeric order):

Rule 1: CLEAN | DRIFT (reason)
Rule 2: ...
…
Rule 17: ...

Final verdict: CLEAN | DRIFT
```

## Re-loop policy

Same as loop-plan. If verdict is DRIFT:

1. Surface findings to user (which rules failed, what evidence).
2. Return to Phase 5 (the loop gate).
3. User picks: revise the plan (re-enter Phase 4 → Phase 6) or override (rare, requires explicit "ignore drift rule X" with justification appended to plan).

Hard cap: 3 drift cycles. On 4th DRIFT verdict, surface to user that the plan has structural problems and needs manual restructure (don't auto-loop forever).

## Cross-references

- [`../../loop-plan/references/drift-check.md`](../../loop-plan/references/drift-check.md) — base rules 1–13.
- [`./bug-reproduction-harness.md`](./bug-reproduction-harness.md) — `bug_signature` schema referenced by rule 15.
- [`./prevention-design.md`](./prevention-design.md) — T0b output format referenced by rule 17.
- ADR-0014 — mutation-floor source for rule 16.
- ADR-0019 — this skill's umbrella decision.
