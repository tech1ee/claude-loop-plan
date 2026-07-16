export const CONTEXT_SCHEMA_VERSION = 1;
export const CONTEXT_MANAGEMENT_VERSION = 1;
export const HANDOFF_SCHEMA = "pi.loop.handoff.v1";
export const HANDOFF_MAX_BYTES = 64 * 1024;

export type WorkerKind = "scout" | "context-builder" | "researcher" | "reviewer" | "worker" | "oracle" | "rpc";
export type TaskStatus = "pending" | "running" | "succeeded" | "failed" | "blocked" | "timed_out" | "cancelled";
export type UsageSource = "context" | "turn_start" | "turn_end" | "session_start" | "compaction";
export type Usage = { tokens: number | null; contextWindow: number; percent: number | null; timestamp: string; source: UsageSource };
export type SessionState = { id: string | null; file: string | null; generation: number; cwd: string; provider: string | null; model: string | null; thinkingLevel: string | null };
export type Task = {
  taskId: string; runId: string; phase: string; workerKind: WorkerKind; attempt: number; status: TaskStatus;
  startedAt: string | null; endedAt: string | null; budget: Record<string, unknown>; usage: Usage | null;
  handoffPath: string | null; retryable: boolean; handoffAccepted: boolean;
};
export type Compaction = { reason: "manual" | "threshold" | "overflow"; tokensBefore: number; firstKeptEntryId: string; timestamp: string; success: boolean };
export type ActionKind = "read-only" | "routine" | "implementation" | "product-decision" | "destructive";
export type AutonomyMode = "paused" | "ready" | "running";
export type ContinuationStatus = "pending" | "in-flight" | "completed" | "failed";
export type AutonomyNextStep = {
  token: string; step: string; actionKind: ActionKind; requiresApproval: boolean; destructive: boolean;
  maxAttempts: number; completionPredicate: string | null;
};
export type AutonomyState = {
  version: 1; mode: AutonomyMode; approval: { approved: boolean; marker: string | null; at: string | null };
  nextStep: AutonomyNextStep | null;
  continuation: { token: string | null; attempt: number; maxAttempts: number; status: ContinuationStatus; claimedAt: string | null };
  lastReason: string | null; compaction: { pending: boolean; reason: "threshold" | "overflow" | null; requestedAt: string | null };
};
export type ContextState = {
  schemaVersion: number; contextManagementVersion: number; session: SessionState; usage: Usage | null;
  compactions: Compaction[]; tasks: Task[]; autonomy: AutonomyState;
  scheduler: { configuredConcurrency: number; activeConcurrency: number; queue: string[]; backoff: { attempts: number; nextRetryAt: string | null }; lastCapacityEvent: string | null };
  checkpoint: { phase: string | null; step: string | null; detail: string; updatedAt: string };
  recovery: { staleRunningTasks: string[]; quarantinedState: string | null; lastError: string | null };
};
export type PlanState = Record<string, unknown> & { context_management: ContextState };
export type Thresholds = { finish: number; compact: number; stop: number };
export type RoutingDecision = { action: "normal" | "finish-unit" | "persist-and-compact" | "stop-fanout"; reason: string; percent: number | null };

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const stringOr = (value: unknown, fallback: string | null = null): string | null => typeof value === "string" ? value : fallback;
const numberOr = (value: unknown, fallback: number): number => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const status = (value: unknown): TaskStatus => ["pending", "running", "succeeded", "failed", "blocked", "timed_out", "cancelled"].includes(value as string) ? value as TaskStatus : "pending";
const actionKind = (value: unknown): ActionKind => ["read-only", "routine", "implementation", "product-decision", "destructive"].includes(value as string) ? value as ActionKind : "routine";
const autonomyStatus = (value: unknown): ContinuationStatus => ["pending", "in-flight", "completed", "failed"].includes(value as string) ? value as ContinuationStatus : "pending";

export function createAutonomyState(): AutonomyState {
  return { version: 1, mode: "paused", approval: { approved: false, marker: null, at: null }, nextStep: null, continuation: { token: null, attempt: 0, maxAttempts: 1, status: "pending", claimedAt: null }, lastReason: null, compaction: { pending: false, reason: null, requestedAt: null } };
}

export function normalizeAutonomyState(raw: unknown): AutonomyState {
  const base = createAutonomyState(); if (!isRecord(raw)) return base;
  const step = isRecord(raw.nextStep) && typeof raw.nextStep.token === "string" && typeof raw.nextStep.step === "string" ? {
    token: raw.nextStep.token, step: raw.nextStep.step, actionKind: actionKind(raw.nextStep.actionKind),
    requiresApproval: raw.nextStep.requiresApproval !== false, destructive: raw.nextStep.destructive === true,
    maxAttempts: Math.max(1, Math.min(5, Math.floor(numberOr(raw.nextStep.maxAttempts, 1)))), completionPredicate: stringOr(raw.nextStep.completionPredicate),
  } : null;
  const continuation = isRecord(raw.continuation) ? { ...base.continuation, token: stringOr(raw.continuation.token), attempt: Math.max(0, Math.floor(numberOr(raw.continuation.attempt, 0))), maxAttempts: Math.max(1, Math.min(5, Math.floor(numberOr(raw.continuation.maxAttempts, step?.maxAttempts ?? 1)))), status: autonomyStatus(raw.continuation.status), claimedAt: stringOr(raw.continuation.claimedAt) } : base.continuation;
  return { version: 1, mode: ["paused", "ready", "running"].includes(raw.mode as string) ? raw.mode as AutonomyMode : "paused", approval: isRecord(raw.approval) ? { approved: raw.approval.approved === true, marker: stringOr(raw.approval.marker), at: stringOr(raw.approval.at) } : base.approval, nextStep: step, continuation, lastReason: stringOr(raw.lastReason), compaction: isRecord(raw.compaction) ? { pending: raw.compaction.pending === true, reason: raw.compaction.reason === "threshold" || raw.compaction.reason === "overflow" ? raw.compaction.reason : null, requestedAt: stringOr(raw.compaction.requestedAt) } : base.compaction };
}

export function usageSnapshot(value: unknown, source: UsageSource, now = new Date().toISOString()): Usage | null {
  if (!isRecord(value)) return null;
  const contextWindow = numberOr(value.contextWindow, 0);
  if (contextWindow <= 0) return null;
  const tokens = value.tokens === null ? null : numberOr(value.tokens, NaN);
  const percent = value.percent === null ? null : numberOr(value.percent, NaN);
  if (Number.isNaN(tokens) || Number.isNaN(percent)) return null;
  return { tokens, contextWindow, percent, timestamp: stringOr(value.timestamp, now)!, source };
}

export function createContextState(loop = "loop", now = new Date().toISOString()): ContextState {
  return {
    schemaVersion: CONTEXT_SCHEMA_VERSION, contextManagementVersion: CONTEXT_MANAGEMENT_VERSION,
    session: { id: null, file: null, generation: 0, cwd: loop, provider: null, model: null, thinkingLevel: null }, usage: null,
    compactions: [], tasks: [], autonomy: createAutonomyState(), scheduler: { configuredConcurrency: 2, activeConcurrency: 0, queue: [], backoff: { attempts: 0, nextRetryAt: null }, lastCapacityEvent: null },
    checkpoint: { phase: null, step: null, detail: "", updatedAt: now }, recovery: { staleRunningTasks: [], quarantinedState: null, lastError: null },
  };
}

export function normalizeContextState(raw: unknown, loop = "loop", now = new Date().toISOString()): { state: ContextState; diagnostics: string[] } {
  const base = createContextState(loop, now); const diagnostics: string[] = [];
  if (!isRecord(raw)) return { state: base, diagnostics: ["context_management is not an object"] };
  const state = { ...base };
  if (raw.schemaVersion !== undefined && raw.schemaVersion !== CONTEXT_SCHEMA_VERSION) diagnostics.push("unsupported context schemaVersion");
  if (raw.contextManagementVersion !== undefined && raw.contextManagementVersion !== CONTEXT_MANAGEMENT_VERSION) diagnostics.push("unsupported contextManagementVersion");
  if (isRecord(raw.session)) state.session = { ...base.session, ...raw.session, generation: Math.max(0, Math.floor(numberOr(raw.session.generation, 0))) } as SessionState;
  state.usage = raw.usage === null ? null : usageSnapshot(raw.usage, "context", now);
  if (raw.usage !== null && raw.usage !== undefined && !state.usage) diagnostics.push("invalid usage snapshot was discarded");
  if (Array.isArray(raw.compactions)) state.compactions = raw.compactions.filter(isRecord).map((item) => ({
    reason: ["manual", "threshold", "overflow"].includes(item.reason as string) ? item.reason as Compaction["reason"] : "manual",
    tokensBefore: Math.max(0, numberOr(item.tokensBefore, 0)), firstKeptEntryId: stringOr(item.firstKeptEntryId, "")!, timestamp: stringOr(item.timestamp, now)!, success: item.success === true,
  })).filter((item) => item.firstKeptEntryId);
  else if (raw.compactions !== undefined) diagnostics.push("invalid compactions were discarded");
  if (Array.isArray(raw.tasks)) state.tasks = raw.tasks.filter(isRecord).map((item) => ({
    taskId: stringOr(item.taskId, "")!, runId: stringOr(item.runId, "")!, phase: stringOr(item.phase, "")!,
    workerKind: ["scout", "context-builder", "researcher", "reviewer", "worker", "oracle", "rpc"].includes(item.workerKind as string) ? item.workerKind as WorkerKind : "worker",
    attempt: Math.max(1, Math.floor(numberOr(item.attempt, 1))), status: status(item.status), startedAt: stringOr(item.startedAt), endedAt: stringOr(item.endedAt),
    budget: isRecord(item.budget) ? item.budget : {}, usage: item.usage ? usageSnapshot(item.usage, "context", now) : null, handoffPath: stringOr(item.handoffPath), retryable: item.retryable === true, handoffAccepted: item.handoffAccepted === true,
  })).filter((item) => item.taskId && item.runId && item.phase);
  else if (raw.tasks !== undefined) diagnostics.push("invalid tasks were discarded");
  if (isRecord(raw.scheduler)) {
    const configured = Math.max(1, Math.min(3, Math.floor(numberOr(raw.scheduler.configuredConcurrency, 2))));
    state.scheduler = { ...base.scheduler, ...raw.scheduler, configuredConcurrency: configured, activeConcurrency: Math.max(0, numberOr(raw.scheduler.activeConcurrency, 0)), queue: Array.isArray(raw.scheduler.queue) ? raw.scheduler.queue.filter((v): v is string => typeof v === "string") : [], backoff: isRecord(raw.scheduler.backoff) ? { attempts: Math.max(0, numberOr(raw.scheduler.backoff.attempts, 0)), nextRetryAt: stringOr(raw.scheduler.backoff.nextRetryAt) } : base.scheduler.backoff };
  }
  if (isRecord(raw.checkpoint)) state.checkpoint = { ...base.checkpoint, ...raw.checkpoint, phase: stringOr(raw.checkpoint.phase), step: stringOr(raw.checkpoint.step), detail: stringOr(raw.checkpoint.detail, "")!, updatedAt: stringOr(raw.checkpoint.updatedAt, now)! };
  if (isRecord(raw.recovery)) state.recovery = { ...base.recovery, ...raw.recovery, staleRunningTasks: Array.isArray(raw.recovery.staleRunningTasks) ? raw.recovery.staleRunningTasks.filter((v): v is string => typeof v === "string") : [], quarantinedState: stringOr(raw.recovery.quarantinedState), lastError: stringOr(raw.recovery.lastError) };
  state.autonomy = normalizeAutonomyState(raw.autonomy);
  if (raw.autonomy !== undefined && !isRecord(raw.autonomy)) diagnostics.push("invalid autonomy state was reset");
  return { state, diagnostics };
}

export function normalizePlanState(raw: unknown, loop = "loop", now = new Date().toISOString()): { state: PlanState; diagnostics: string[] } {
  const root = isRecord(raw) ? { ...raw } : {}; const source = root.context_management ?? root.contextManagement;
  const normalized = normalizeContextState(source, loop, now); root.schemaVersion = typeof root.schemaVersion === "number" ? root.schemaVersion : CONTEXT_SCHEMA_VERSION;
  root.context_management = normalized.state; delete root.contextManagement; return { state: root as PlanState, diagnostics: normalized.diagnostics };
}

export function evaluateUsage(usage: Usage | null | undefined, thresholds: Thresholds = { finish: 60, compact: 70, stop: 85 }): RoutingDecision {
  if (!usage || usage.percent === null) return { action: "stop-fanout", reason: "context usage is unknown; persist before expensive work", percent: null };
  const percent = usage.percent;
  if (percent >= thresholds.stop) return { action: "stop-fanout", reason: `context usage ${percent}% is at or above the stop threshold`, percent };
  if (percent >= thresholds.compact) return { action: "persist-and-compact", reason: `context usage ${percent}% requires persistence and compaction`, percent };
  if (percent >= thresholds.finish) return { action: "finish-unit", reason: `context usage ${percent}% requires finishing the current unit`, percent };
  return { action: "normal", reason: `context usage ${percent}% is below the finish threshold`, percent };
}

export function transitionTask(task: Task, next: TaskStatus, now = new Date().toISOString()): { task: Task; changed: boolean; error?: string } {
  if (task.status === next) return { task, changed: false };
  const terminal = ["succeeded", "failed", "blocked", "timed_out", "cancelled"].includes(task.status);
  if (terminal) return { task, changed: false, error: "late task completion ignored" };
  if (task.status === "pending" && !["running", "cancelled"].includes(next)) return { task, changed: false, error: `invalid transition ${task.status} -> ${next}` };
  if (task.status === "running" && !["succeeded", "failed", "blocked", "timed_out", "cancelled"].includes(next)) return { task, changed: false, error: `invalid transition ${task.status} -> ${next}` };
  return { task: { ...task, status: next, startedAt: task.startedAt ?? (task.status === "pending" ? now : null), endedAt: next === "running" || next === "pending" ? null : now }, changed: true };
}

export function reconcileStaleTasks(state: ContextState, now = new Date().toISOString()): ContextState {
  const stale = state.tasks.filter((task) => task.status === "running").map((task) => task.taskId);
  if (!stale.length) return state;
  return { ...state, tasks: state.tasks.map((task) => stale.includes(task.taskId) ? { ...task, status: "timed_out", endedAt: now, retryable: true } : task), recovery: { ...state.recovery, staleRunningTasks: [...new Set([...state.recovery.staleRunningTasks, ...stale])], lastError: "running tasks were reconciled after session replacement" } };
}

export type IntentInput = Omit<AutonomyNextStep, "maxAttempts" | "completionPredicate"> & { maxAttempts?: number; completionPredicate?: string | null };
export function registerAutonomyIntent(state: AutonomyState, input: IntentInput, now = new Date().toISOString()): { state: AutonomyState; error?: string } {
  if (!input.token || !input.step) return { state, error: "next step requires token and step" };
  if (state.nextStep?.token === input.token) return { state, error: "continuation token already registered" };
  const maxAttempts = Math.max(1, Math.min(5, Math.floor(input.maxAttempts ?? 1)));
  const nextStep = { token: input.token, step: input.step, actionKind: input.actionKind, requiresApproval: input.requiresApproval || input.actionKind === "implementation" || input.actionKind === "product-decision", destructive: input.destructive || input.actionKind === "destructive", maxAttempts, completionPredicate: input.completionPredicate ?? null };
  const approved = state.approval.approved && !nextStep.requiresApproval && !nextStep.destructive && nextStep.actionKind !== "product-decision";
  return { state: { ...state, mode: approved ? "ready" : "paused", nextStep, approval: approved ? state.approval : { approved: false, marker: null, at: null }, continuation: { token: input.token, attempt: 0, maxAttempts, status: "pending", claimedAt: null }, lastReason: approved ? null : "explicit user approval is required" }, };
}
export function approveAutonomy(state: AutonomyState, marker: string, now = new Date().toISOString()): AutonomyState {
  if (!marker.trim()) return { ...state, mode: "paused", lastReason: "approval requires an explicit user marker" };
  const approval = { approved: true, marker: marker.trim().slice(0, 200), at: now };
  if (!state.nextStep) return { ...state, mode: "ready", approval, lastReason: null };
  return { ...state, mode: "ready", approval, lastReason: null };
}
export function pauseAutonomy(state: AutonomyState, reason: string): AutonomyState { return { ...state, mode: "paused", lastReason: reason.slice(0, 300) }; }
export function resumeAutonomy(state: AutonomyState): AutonomyState {
  if (!state.nextStep || state.nextStep.destructive || state.nextStep.actionKind === "product-decision") return pauseAutonomy(state, "resume requires a safe registered step");
  if (!state.approval.approved) return pauseAutonomy(state, "resume requires explicit user approval");
  const status = state.continuation.status === "in-flight" || (state.continuation.status === "failed" && state.continuation.attempt < state.continuation.maxAttempts) ? "pending" : state.continuation.status;
  return { ...state, mode: "ready", continuation: { ...state.continuation, status }, lastReason: null };
}
export function recoverAutonomy(state: AutonomyState): AutonomyState {
  if (state.compaction.pending) return completeAutonomyCompaction({ ...state, continuation: { ...state.continuation, status: state.continuation.status === "in-flight" ? "pending" : state.continuation.status, claimedAt: null } }, false, "reload recovered an incomplete compaction; explicit resume required");
  if (state.continuation.status === "completed") return { ...state, mode: state.approval.approved ? "ready" : "paused", nextStep: null, continuation: { token: null, attempt: 0, maxAttempts: 1, status: "pending", claimedAt: null }, lastReason: "completed step cleared; planner may register the next step" };
  if (state.continuation.status !== "in-flight") return state;
  return pauseAutonomy({ ...state, continuation: { ...state.continuation, status: "pending", claimedAt: null } }, "reload recovered an in-flight continuation; explicit resume required");
}
export function claimPlannerWake(state: AutonomyState, usage: Usage | null, token: string, now = new Date().toISOString()): { state: AutonomyState; claimed: boolean; error?: string } {
  const decision = evaluateUsage(usage);
  if (state.nextStep || state.mode !== "ready" || !state.approval.approved) return { state, claimed: false, error: "planner wake is not eligible" };
  if (decision.action !== "normal") return { state: pauseAutonomy(state, decision.reason), claimed: false, error: decision.reason };
  if (state.continuation.status !== "pending" || state.continuation.token) return { state, claimed: false, error: "planner wake already claimed" };
  return { state: { ...state, mode: "running", continuation: { token, attempt: 1, maxAttempts: 1, status: "in-flight", claimedAt: now }, lastReason: "waking the approved planner to register the next routine step" }, claimed: true };
}

export function claimContinuation(state: AutonomyState, usage: Usage | null, now = new Date().toISOString()): { state: AutonomyState; claimed: boolean; error?: string } {
  const decision = evaluateUsage(usage);
  if (!state.nextStep) return { state, claimed: false, error: "no registered next step" };
  if (state.mode !== "ready" || !state.approval.approved) return { state: pauseAutonomy(state, "explicit approval is required"), claimed: false, error: "approval gate is not satisfied" };
  if (state.nextStep.destructive || state.nextStep.actionKind === "product-decision") return { state: pauseAutonomy(state, "destructive or product-decision work requires user approval"), claimed: false, error: "unsafe action is not eligible for automatic continuation" };
  if (decision.action === "stop-fanout") return { state: pauseAutonomy({ ...state, lastReason: decision.reason }, decision.reason), claimed: false, error: decision.reason };
  if (decision.action === "persist-and-compact") return { state: { ...state, lastReason: decision.reason }, claimed: false, error: decision.reason };
  if (state.continuation.status !== "pending" || state.continuation.attempt >= state.continuation.maxAttempts) return { state: { ...state, mode: "paused", lastReason: "continuation retry budget exhausted" }, claimed: false, error: "continuation is not pending or retry budget is exhausted" };
  return { state: { ...state, mode: "running", continuation: { ...state.continuation, token: state.nextStep.token, attempt: state.continuation.attempt + 1, maxAttempts: state.nextStep.maxAttempts, status: "in-flight", claimedAt: now }, lastReason: null }, claimed: true };
}
export function completeContinuation(state: AutonomyState, token: string, success: boolean, reason: string | null = null): AutonomyState {
  if (state.continuation.token !== token || state.continuation.status !== "in-flight") return state;
  const retry = !success && state.continuation.attempt < state.continuation.maxAttempts;
  if (success) return { ...state, mode: state.approval.approved ? "ready" : "paused", nextStep: null, continuation: { token: null, attempt: 0, maxAttempts: 1, status: "pending", claimedAt: null }, lastReason: reason ?? "continuation completed; planner may register the next token" };
  return { ...state, mode: retry ? "ready" : "paused", continuation: { ...state.continuation, status: retry ? "pending" : "failed", claimedAt: state.continuation.claimedAt }, lastReason: reason ?? (retry ? "continuation failed; bounded retry is available" : "continuation failed; retry budget exhausted") };
}
export function requestAutonomyCompaction(state: AutonomyState, reason: "threshold" | "overflow", now = new Date().toISOString()): AutonomyState { return { ...state, compaction: { pending: true, reason, requestedAt: now }, lastReason: "context threshold reached; compaction requested" }; }
export function completeAutonomyCompaction(state: AutonomyState, success: boolean, reason: string | null = null): AutonomyState { return { ...state, compaction: { ...state.compaction, pending: false }, mode: success ? state.mode : "paused", lastReason: reason ?? (success ? null : "compaction failed; continuation paused") }; }
