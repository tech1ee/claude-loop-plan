# Durable context management

`loop_context` is the v1 measurement and handoff boundary for loop-plan and loop-debug. Pass the same lowercase kebab-case loop slug used for `.pi/plans/<slug>.state.json`.

## Routing contract

- Below 60% context usage: normal work.
- At 60% and below 70%: finish the current unit and do not start another fan-out round.
- At 70% and below 85%: persist a checkpoint, then explicitly compact before expensive work.
- At or above 85%, after compaction when usage is `null`, or after a compaction failure: stop fan-out and resume through serialized handoff/fresh context.
- Missing usage is unknown, never zero. The extension checkpoints and requests compaction only at safe lifecycle boundaries; it never compacts during active work or uses a timer.

Use the controller in the parent session for approval, phase transitions, synthesis, and final verification. Independent work uses bounded fresh children with explicit goal, question, allowed paths, budget, and return schema. Use a fork only for inherited-decision/oracle review. Use RPC/process isolation only for escalation, long-running isolation, or recovery.

The default scheduler cap is two active workers. Three is permitted only when the task is explicitly high-risk; excess work remains queued. Rate-limit or transport failures reduce the next attempt to one worker and permit one bounded read-only retry. No subscription quota or unlimited-concurrency claim is made.

## Checkpoints and handoffs

Call `loop_context` with `snapshot` before fan-out and `checkpoint` before phase transitions. At each phase boundary, use `register_next` with a unique token, bounded retry budget, action classification, approval requirement, and completion predicate; call `complete_next` before registering the following token. Only an explicitly approved, non-destructive routine/read-only intent can trigger one follow-up, and only from `agent_settled`; if an approved non-terminal checkpoint has no registered next step, the runtime sends one planner wake to make the controller register it instead of waiting for a user nudge. Use `pause`, `resume`, and `autonomy_status` to make gates and reasons visible. Every child must return a `pi.loop.handoff.v1` object through `handoff`; it is limited to 64 KiB and must include task identity, attempt, status, goal/question, allowed paths, budget, model/usage snapshot, findings with `path:line` evidence, open questions, artifacts, and retry metadata. Raw transcripts, secrets, and executable instructions are rejected. Parent merge validates task ID, run ID, attempt, schema, evidence, and idempotence; duplicate or late completion does not mutate state.

The durable snapshot lives beside existing plan state and is backward-compatible: legacy fields such as `phase` and `evidence_ledger` remain untouched. A malformed JSON snapshot is renamed to a `.quarantine-*` file and a diagnostic is recorded. Running tasks found after reload/session replacement become `timed_out` and retryable rather than silently disappearing.
