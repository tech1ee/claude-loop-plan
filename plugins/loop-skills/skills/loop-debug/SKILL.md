---
name: loop-debug
description: Reproduce, diagnose, fix, and prevent software bugs with Codex using a strict red-green loop, parallel root-cause investigation, current research when needed, and adversarial verification. Use for regressions, flaky behavior, failures, and performance bugs; not for feature design.
---

# Loop Debug for Codex

Use Codex's native subagents, sandbox, repository tools, and verification to prove the bug, identify the causal chain, apply the smallest correct fix, and make recurrence harder.

Read [`../loop-plan/references/codex-operating-model.md`](../loop-plan/references/codex-operating-model.md) and [`../loop-plan/references/state-and-verification.md`](../loop-plan/references/state-and-verification.md) first.

## Contract

- Translate the report into a concrete `bug_signature`: input/precondition, observed result, expected result, environment, frequency, and first known regression when available.
- Do not patch production code before a regression test or behavioral harness demonstrates the failure. If reproduction is impossible, state why and use the closest honest probe—never manufacture a red test.
- Separate evidence from hypotheses. Every causal claim needs a `path:line`, command output, log, trace, or primary-source citation.
- Use parallel read-only subagents for distinct investigations, not duplicate guesses. The parent owns synthesis and final edits.
- Preserve unrelated worktree changes. Fix the causal chain with the smallest coherent patch; do not smuggle in refactors.

## Phase 0 — Reproduce RED

Inspect applicable instructions and test conventions. Create the smallest regression test or harness that fails for the expected reason. Prefer a test-writer subagent with write scope limited to the named test file; the parent must inspect the oracle before accepting it. Record the exact failing command and failure signal in `.codex/loop/<slug>.state.json`.

If the bug is flaky, gather repeated-run evidence and control nondeterminism. If it depends on an unavailable external system, isolate the boundary and clearly label what remains unverified.

## Phase 1 — Investigate the causal chain

For a standard bug, run two parallel read-only investigations:

1. trace execution and state from entry point to failure, including alternate callers;
2. map existing coverage, similar bugs, edge cases, and likely regression range.

Add a specialist only when a distinct domain warrants it, such as concurrency, security, persistence, or performance. Require evidence and falsification conditions for every hypothesis. Reconcile results, then run the highest-information probe. Repeat until one hypothesis explains the signature and viable alternatives are disproved or recorded.

## Phase 2 — Research when freshness matters

Use current primary sources for runtime/library/platform behavior that may have changed. Research must change a diagnosis, fix choice, or prevention strategy; otherwise stay local.

## Phase 3 — Design the fix and prevention

Define:

- `T0a`: the locked regression behavior;
- `T-fix`: minimal production change that breaks the causal chain;
- `T0b`: prevention through an invariant, boundary check, stronger type, additional same-class tests, or observability.

Ask the user only if scope, compatibility, data migration, or risk tolerance cannot be inferred. When the user asked only for diagnosis, stop with findings. When they asked for a fix, continue unless new authority is required.

## Phase 4 — GREEN and harden

Use one writer for the production fix. Do not let the writer weaken `T0a`. Run the regression test, neighboring tests, and proportionate broader suite. Scan for test gaming and ensure the test fails again when the behavioral fix is intentionally neutralized or otherwise demonstrate that it is sensitive to the defect.

For standard or high-risk bugs, use fresh read-only reviewers for causal correctness, same-class gaps, and patch simplicity/security. Resolve validated findings.

## Phase 5 — Verify the real outcome

Re-run the original reproduction against the actual user-visible path or data flow. Apply the four-level verification check. Report the root cause, proof of RED and GREEN, changed files, commands, prevention added, and residual uncertainty. Never call a bug fixed solely because a unit test passes.
