import { test } from "node:test";
import assert from "node:assert/strict";
import { approveAutonomy, claimContinuation, claimPlannerWake, completeContinuation, createAutonomyState, evaluateUsage, normalizePlanState, pauseAutonomy, recoverAutonomy, registerAutonomyIntent, reconcileStaleTasks, requestAutonomyCompaction, transitionTask, type Task } from "../extensions/loop-context-state.js";
import { HANDOFF_SCHEMA, validateHandoff } from "../extensions/loop-handoff.js";

const usage = (percent: number | null) => ({ tokens: percent === null ? null : 100, contextWindow: 1000, percent, timestamp: "2026-07-15T00:00:00.000Z", source: "context" as const });
const task: Task = { taskId: "T1", runId: "R1", phase: "explore", workerKind: "scout", attempt: 1, status: "pending", startedAt: null, endedAt: null, budget: {}, usage: null, handoffPath: null, retryable: false, handoffAccepted: false };

test("thresholds are conservative at exact boundaries and unknown usage stops fanout", () => {
  assert.equal(evaluateUsage(usage(59)).action, "normal");
  assert.equal(evaluateUsage(usage(60)).action, "finish-unit");
  assert.equal(evaluateUsage(usage(70)).action, "persist-and-compact");
  assert.equal(evaluateUsage(usage(85)).action, "stop-fanout");
  assert.equal(evaluateUsage(usage(null)).action, "stop-fanout");
});

test("autonomy requires explicit approval, blocks unsafe actions, and claims exactly once", () => {
  const registered = registerAutonomyIntent(createAutonomyState(), { token: "c1", step: "run routine", actionKind: "implementation", requiresApproval: true, destructive: false });
  assert.equal(registered.error, undefined);
  const pending = registered.state;
  assert.equal(claimContinuation(pending, usage(40)).claimed, false);
  const approved = approveAutonomy(pending, "approved by user", "2026-07-15T00:00:00.000Z");
  const claimed = claimContinuation(approved, usage(40), "2026-07-15T00:00:00.000Z");
  assert.equal(claimed.claimed, true);
  assert.equal(claimContinuation(claimed.state, usage(40)).claimed, false);
  const completed = completeContinuation(claimed.state, "c1", true);
  assert.equal(completed.continuation.status, "pending");
  assert.equal(completed.nextStep, null);
  assert.equal(completed.mode, "ready");
  const unsafe = registerAutonomyIntent(createAutonomyState(), { token: "d1", step: "delete", actionKind: "destructive", requiresApproval: true, destructive: true }).state;
  assert.equal(claimContinuation(approveAutonomy(unsafe, "approved"), usage(40)).claimed, false);
  const authorized = approveAutonomy(createAutonomyState(), "approved plan");
  const routine = registerAutonomyIntent(authorized, { token: "r1", step: "inspect next file", actionKind: "routine", requiresApproval: false, destructive: false }).state;
  assert.equal(routine.approval.approved, true);
  assert.equal(claimContinuation(routine, usage(40)).claimed, true);
  const wake = claimPlannerWake({ ...authorized, mode: "ready", nextStep: null, continuation: { token: null, attempt: 0, maxAttempts: 1, status: "pending", claimedAt: null } }, usage(40), "planner-wake-1");
  assert.equal(wake.claimed, true);
  assert.equal(wake.state.continuation.token, "planner-wake-1");
});

test("autonomy pauses for unknown usage, bounds retries, and recovers in-flight work conservatively", () => {
  const registered = registerAutonomyIntent(approveAutonomy(createAutonomyState(), "approved plan"), { token: "c2", step: "read", actionKind: "read-only", requiresApproval: false, destructive: false, maxAttempts: 1 }).state;
  const unknown = claimContinuation(registered, usage(null));
  assert.equal(unknown.claimed, false);
  assert.equal(unknown.state.mode, "paused");
  const resumed = { ...unknown.state, mode: "ready" as const };
  const claimed = claimContinuation(resumed, usage(20));
  assert.equal(claimed.claimed, true);
  assert.equal(recoverAutonomy(claimed.state).mode, "paused");
  const compaction = requestAutonomyCompaction(claimed.state, "threshold");
  assert.equal(compaction.compaction.pending, true);
  assert.equal(recoverAutonomy(compaction).compaction.pending, false);
  assert.equal(recoverAutonomy(compaction).mode, "paused");
  const staleCompleted = { ...completedAutonomyFixture(), continuation: { token: "old", attempt: 1, maxAttempts: 1, status: "completed" as const, claimedAt: null } };
  assert.equal(recoverAutonomy(staleCompleted).nextStep, null);
});

function completedAutonomyFixture() {
  return { ...approveAutonomy(createAutonomyState(), "approved"), nextStep: { token: "old", step: "old", actionKind: "routine" as const, requiresApproval: false, destructive: false, maxAttempts: 1, completionPredicate: null } };
}

test("task transitions reject invalid and late completion without mutation", () => {
  const running = transitionTask(task, "running", "2026-07-15T00:00:00.000Z").task;
  assert.equal(running.status, "running");
  assert.equal(transitionTask(running, "succeeded").task.status, "succeeded");
  const late = transitionTask({ ...running, status: "succeeded" }, "failed");
  assert.equal(late.changed, false);
  assert.match(late.error ?? "", /late/);
  assert.equal(transitionTask(task, "succeeded").changed, false);
});

test("normalization preserves legacy evidence and quarantines malformed context fields diagnostically", () => {
  const normalized = normalizePlanState({ loop: "demo", phase: "Explore", evidence_ledger: [{ id: "E1" }], context_management: { usage: { tokens: "bad" } } }, "demo");
  assert.equal(normalized.state.evidence_ledger instanceof Array, true);
  assert.ok(normalized.diagnostics.length > 0);
  assert.equal(normalized.state.context_management.usage, null);
  const stale = reconcileStaleTasks({ ...normalized.state.context_management, tasks: [{ ...task, status: "running" }] }, "2026-07-15T00:00:00.000Z");
  assert.equal(stale.tasks[0].status, "timed_out");
  assert.deepEqual(stale.recovery.staleRunningTasks, ["T1"]);
});

const validHandoff = { schema: HANDOFF_SCHEMA, taskId: "T1", runId: "R1", attempt: 1, status: "succeeded", goal: "Map code", question: "What calls it?", allowedPaths: ["src"], budget: { turns: 2 }, model: { provider: "test", id: "model" }, usage: null, findings: [{ claim: "caller exists", evidence: ["src/main.ts:10"] }], openQuestions: [], artifacts: [{ path: "handoff.json", description: "Structured result" }], recovery: { retryable: false, reason: null } };

test("handoff validation enforces identity, evidence, size, and forbidden fields", () => {
  assert.equal(validateHandoff(validHandoff, { taskId: "T1", runId: "R1", attempt: 1 }).ok, true);
  assert.equal(validateHandoff({ ...validHandoff, attempt: 2 }, { taskId: "T1", runId: "R1", attempt: 1 }).ok, false);
  assert.equal(validateHandoff({ ...validHandoff, findings: [{ claim: "unsupported", evidence: ["no citation"] }] }).ok, false);
  assert.equal(validateHandoff({ ...validHandoff, secret: "do-not-store" }).ok, false);
  assert.equal(validateHandoff({ ...validHandoff, goal: "x".repeat(70_000) }).ok, false);
});
