# Loop context management

The Pi package ships `extensions/loop-context.ts` together with pure state and handoff validators. It records a versioned `context_management` section inside `.pi/plans/<slug>.state.json` while preserving existing plan and evidence fields.

Use `loop_context` for `snapshot`, `checkpoint`, task updates, reconciliation, and bounded child handoffs. The controller remains in the parent session. Fresh children do independent work; forks are for inherited-decision review; RPC/process isolation is escalation-only.

Routing is conservative: below 60% is normal, 60–70% finishes the current unit, 70–85% persists and explicitly compacts, and 85% or unknown usage stops fan-out. The extension never injects telemetry or compacts automatically. Two workers are the default cap; three is reserved for explicitly high-risk work, with excess queued.

State reload reconciles stale running tasks as retryable timeouts. Malformed JSON is quarantined with a diagnostic. Handoffs use `pi.loop.handoff.v1`, are limited to 64 KiB, require path-and-line evidence and matching task/attempt identity, and exclude transcripts, secrets, and executable instructions. This package does not implement subscription quota accounting or promise unlimited concurrency.
