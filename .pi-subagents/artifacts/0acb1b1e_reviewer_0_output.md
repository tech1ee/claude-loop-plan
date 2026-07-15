## Review

### Strategy classification
- **`loop-plan`** is a **top-down, breadth-first-then-iterative** loop: goal/stack seed → parallel repository fan-out → targeted follow-ups → plan → approval → execution (`skills/pi/loop-plan/SKILL.md:33-61`).
- **`loop-debug`** is a **symptom-driven bottom-up causal loop inside a top-down phase structure**: reproduce symptom → trace origin/propagation → discriminate hypotheses → fix (`skills/pi/loop-debug/SKILL.md:27-52`).
- Neither is purely breadth-first or depth-first. Both converge iteratively, but only after a mandatory broad initial fan-out.

### Prioritized findings

- **High — Unbounded exploration and call/token growth.**  
  `loop-plan` mandates repeated fanout/synthesis/follow-up “until” a broad impact-closure checklist is satisfied (`skills/pi/loop-plan/SKILL.md:53-61`). `loop-debug` similarly mandates 3–5 agents plus follow-ups until every affected entry point is classified (`skills/pi/loop-debug/SKILL.md:44-52`). Neither defines maximum rounds, call/token budget, elapsed-time budget, information-gain threshold, or a diminishing-returns stop rule. Large repositories can therefore produce an effectively unbounded loop.

- **High — Fixed fan-out causes premature depth.**  
  `loop-plan` always starts 2–4 agents covering architecture, tests, similar features, and boundaries (`skills/pi/loop-plan/SKILL.md:46-51`). `loop-debug` always starts 3–5 agents, including a full test audit and boundary sweep (`skills/pi/loop-debug/SKILL.md:44-50`). There is no risk/complexity triage that allows a cheap scout-only path or skips irrelevant domains.

- **High — Debug reproduction can incorrectly terminate on one passing attempt.**  
  `loop-debug` says to stop if the selected reproduction passes and treat the report as stale or wrong (`skills/pi/loop-debug/SKILL.md:38`). This is unsafe for intermittent, timing-sensitive, platform-specific, or environment-dependent bugs. A bounded retry/replay policy should instead classify the bug as “not reproduced” with residual uncertainty.

- **Medium — Repeated evidence production is redundant.**  
  `loop-plan` gathers impact closure in Phase 1, requires it again in the emitted plan, then asks reviewers to re-check correctness/tests/security/simplicity (`skills/pi/loop-plan/SKILL.md:55-61`, `77-87`, `103-115`). `loop-debug` repeats causal/test-audit material in investigation, plan, approval, and execution review (`skills/pi/loop-debug/SKILL.md:52-56`, `68-74`, `78-93`). These should be maintained as a shared evidence ledger, with later phases reviewing deltas rather than regenerating reports.

- **Medium — Progress protocol adds avoidable tool-call overhead.**  
  `loop-debug` explicitly requires progress updates before and after delegated work, audits, probes, and validation commands (`skills/pi/loop-debug/SKILL.md:19-21`). Combined with 3–5 agents and follow-up probes, this can approximately double orchestration calls. Updates should occur at round boundaries or on material state changes, not every operation.

- **Medium — Research has no concrete stopping rule.**  
  Both skills say to prefer “a few authoritative sources” but do not define when research is sufficient (`skills/pi/loop-plan/SKILL.md:73-75`; `skills/pi/loop-debug/SKILL.md:62-64`). External research can therefore become another unbounded phase. Stop when an authoritative source resolves the design question, or when additional sources no longer change the decision.

- **Medium — Validation scope is underspecified.**  
  “The appropriate broader suite” is required but undefined in both skills (`skills/pi/loop-plan/SKILL.md:109-115`; `skills/pi/loop-debug/SKILL.md:82-95`). This can cause either unnecessary full-suite execution or inconsistent acceptance. State should record the selected command and a reason for its scope.

- **Low — State does not explicitly model adaptive exploration.**  
  `loop-plan` requires an `impact_closure` checklist later but does not list it among the state fields (`skills/pi/loop-plan/SKILL.md:24-31`, `61`). Neither state description includes an exploration queue, per-probe cost, evidence provenance, or remaining budget. Resuming cannot reliably preserve adaptive stopping decisions.

### More efficient adaptive exploration algorithm

1. **Triage first:** classify the task as quick/known, standard, or high-risk. Use one cheap scout for quick tasks; reserve broad fan-out for high uncertainty or high impact.
2. **Create an evidence ledger:** track hypotheses/unknowns, affected paths, confidence, expected information gain, and estimated cost.
3. **Run only the highest-value probes:** launch at most 1–2 independent probes per round. Escalate from compact scouts to specialists only when uncertainty or risk remains high.
4. **Use explicit stopping rules:** stop when:
   - all high-impact paths have caller and validation evidence;
   - no unresolved unknown can change the design;
   - two consecutive rounds add no high-impact evidence; or
   - the call/token/time budget is exhausted, with residual risk reported.
5. **Clarify branch-changing decisions early:** ask only questions whose answers would change the exploration branch or design; do not fully close low-value repository areas first.
6. **Research conditionally:** research only unresolved design questions, stopping once authoritative evidence settles them or further sources no longer change the plan.
7. **Verify deltas, not the whole graph:** reviewers inspect changed paths and newly introduced risks. If verification fails, requeue only the failed hypothesis/path instead of restarting broad exploration.
8. **Debug-specific rule:** attempt flaky reproductions a bounded number of times with environment capture; distinguish “not reproduced” from “stale report.”

## Review
- **Correct:** Both skills enforce read-only investigation before approval, explicit approval gates, evidence citations, and post-implementation verification.
- **Fixed:** None; this was a read-only audit.
- **Blocker:** None identified.
- **Note:** The primary optimization is replacing mandatory fixed fan-out and open-ended closure with budgeted, information-gain-driven rounds.