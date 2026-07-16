import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { approveAutonomy, claimContinuation, claimPlannerWake, completeAutonomyCompaction, completeContinuation, evaluateUsage, normalizePlanState, normalizeContextState, pauseAutonomy, recoverAutonomy, reconcileStaleTasks, registerAutonomyIntent, requestAutonomyCompaction, resumeAutonomy, transitionTask, usageSnapshot, type ActionKind, type ContextState, type PlanState, type TaskStatus, type Usage, type WorkerKind } from "./loop-context-state.js";
import { mergeHandoff, validateHandoff, type Handoff } from "./loop-handoff.js";

const schema = Type.Object({
  action: Type.Union([Type.Literal("init"), Type.Literal("snapshot"), Type.Literal("checkpoint"), Type.Literal("task"), Type.Literal("handoff"), Type.Literal("reconcile"), Type.Literal("register_next"), Type.Literal("approve"), Type.Literal("pause"), Type.Literal("resume"), Type.Literal("complete_next"), Type.Literal("autonomy_status")]),
  loop: Type.Optional(Type.String()), phase: Type.Optional(Type.String()), step: Type.Optional(Type.String()), detail: Type.Optional(Type.String()),
  taskId: Type.Optional(Type.String()), runId: Type.Optional(Type.String()), workerKind: Type.Optional(Type.String()), status: Type.Optional(Type.String()), attempt: Type.Optional(Type.Integer({ minimum: 1 })),
  budget: Type.Optional(Type.Record(Type.String(), Type.Any())), handoffPath: Type.Optional(Type.String()), retryable: Type.Optional(Type.Boolean()), highRisk: Type.Optional(Type.Boolean()), handoff: Type.Optional(Type.Record(Type.String(), Type.Any())),
  token: Type.Optional(Type.String()), actionKind: Type.Optional(Type.String()), requiresApproval: Type.Optional(Type.Boolean()), destructive: Type.Optional(Type.Boolean()), maxAttempts: Type.Optional(Type.Integer({ minimum: 1 })), completionPredicate: Type.Optional(Type.String()), approvalMarker: Type.Optional(Type.String()), reason: Type.Optional(Type.String()), success: Type.Optional(Type.Boolean()),
});
type Input = { action: "init" | "snapshot" | "checkpoint" | "task" | "handoff" | "reconcile" | "register_next" | "approve" | "pause" | "resume" | "complete_next" | "autonomy_status"; loop?: string; phase?: string; step?: string; detail?: string; taskId?: string; runId?: string; workerKind?: string; status?: string; attempt?: number; budget?: Record<string, unknown>; handoffPath?: string; retryable?: boolean; highRisk?: boolean; handoff?: Record<string, unknown>; token?: string; actionKind?: string; requiresApproval?: boolean; destructive?: boolean; maxAttempts?: number; completionPredicate?: string; approvalMarker?: string; reason?: string; success?: boolean };
const now = () => new Date().toISOString();
const safeLoop = (value: string) => value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "loop";
const pathFor = (ctx: ExtensionContext, loop: string) => join(ctx.cwd, ".pi", "plans", `${safeLoop(loop)}.state.json`);
const usageFor = (ctx: ExtensionContext, source: Usage["source"]): Usage | null => { const usage = ctx.getContextUsage(); return usageSnapshot(usage, source, now()); };
const activeCount = (state: ContextState) => state.tasks.filter((task) => task.status === "running").length;

async function atomicWrite(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}
async function load(ctx: ExtensionContext, loop: string): Promise<{ state: PlanState; diagnostics: string[] }> {
  const path = pathFor(ctx, loop); let raw: unknown = {};
  try { raw = JSON.parse(await readFile(path, "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      const quarantine = `${path}.quarantine-${Date.now()}`;
      try { await rename(path, quarantine); } catch { /* best effort: preserve the diagnostic even when permissions prevent quarantine */ }
      const normalized = normalizePlanState({ loop }, loop, now()); normalized.state.context_management.recovery.quarantinedState = quarantine; normalized.state.context_management.recovery.lastError = "malformed state was quarantined";
      await atomicWrite(path, normalized.state); return { state: normalized.state, diagnostics: ["state JSON was malformed and quarantined"] };
    }
  }
  const normalized = normalizePlanState(raw, loop, now());
  if (normalized.diagnostics.length) normalized.state.context_management.recovery.lastError = normalized.diagnostics.join("; ");
  return normalized;
}
async function save(ctx: ExtensionContext, state: PlanState, loop: string): Promise<void> { await atomicWrite(pathFor(ctx, loop), state); }
async function discoverLoop(ctx: ExtensionContext, previousSessionFile?: string): Promise<string> {
  const directory = join(ctx.cwd, ".pi", "plans");
  try {
    const files = (await readdir(directory)).filter((file) => file.endsWith(".state.json"));
    const sessionId = ctx.sessionManager.getSessionId();
    const candidates: Array<{ loop: string; updatedAt: string }> = [];
    for (const file of files) {
      try {
        const raw = JSON.parse(await readFile(join(directory, file), "utf8")) as Record<string, unknown>;
        const context = raw.context_management as Record<string, unknown> | undefined;
        const session = context?.session as Record<string, unknown> | undefined;
        const checkpoint = context?.checkpoint as Record<string, unknown> | undefined;
        const loop = file.slice(0, -".state.json".length);
        if (session?.id === sessionId || (previousSessionFile && session?.file === previousSessionFile)) return loop;
        candidates.push({ loop, updatedAt: typeof checkpoint?.updatedAt === "string" ? checkpoint.updatedAt : "" });
      } catch { /* malformed state is handled when that loop is explicitly loaded */ }
    }
    return candidates.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.loop ?? "loop";
  } catch { return "loop"; }
}
function sessionPatch(ctx: ExtensionContext, current: ContextState, source: Usage["source"]): ContextState {
  const session = ctx.sessionManager; const id = session.getSessionId(); const file = session.getSessionFile() ?? null;
  const changed = current.session.id !== id;
  let thinkingLevel: string | null = current.session.thinkingLevel;
  try { const entries = session.getEntries(); const latest = [...entries].reverse().find((entry) => entry.type === "thinking_level_change"); if (latest?.type === "thinking_level_change") thinkingLevel = latest.thinkingLevel; } catch { /* old or incomplete sessions have no context yet */ }
  return { ...current, session: { ...current.session, id, file, generation: current.session.generation + (changed ? 1 : 0), cwd: ctx.cwd, provider: ctx.model?.provider ?? null, model: ctx.model?.id ?? null, thinkingLevel }, usage: usageFor(ctx, source) };
}
function text(result: string, details: Record<string, unknown> = {}) { return { content: [{ type: "text" as const, text: result }], details }; }

export default function (pi: ExtensionAPI) {
  let activeLoop = "loop";
  let state: PlanState | undefined;
  let pendingCompaction: { reason: "manual" | "threshold" | "overflow"; tokensBefore: number; firstKeptEntryId: string } | undefined;
  let writes = Promise.resolve();
  const persist = (ctx: ExtensionContext, next: PlanState, loop = activeLoop, event?: string) => {
    state = next;
    writes = writes.then(async () => { await save(ctx, next, loop); if (event) pi.appendEntry("loop-context.v1", { event, timestamp: now(), loop }); });
    return writes;
  };
  const ensure = async (ctx: ExtensionContext, loop: string) => { activeLoop = safeLoop(loop); if (!state || state.loop !== activeLoop) { const loaded = await load(ctx, activeLoop); state = loaded.state; } return state; };
  const wakePlanner = async (ctx: ExtensionContext, current: PlanState, source: string): Promise<boolean> => {
    const context = current.context_management; const phase = context.checkpoint.phase?.toLowerCase() ?? "";
    if (!context.autonomy.approval.approved || context.autonomy.nextStep || !["seed", "explore", "clarify", "research", "plan", "execute", "verify"].some((value) => phase.includes(value))) return false;
    const token = `planner-wake-${Date.now()}`; const claimed = claimPlannerWake(context.autonomy, context.usage, token, now());
    if (!claimed.claimed) return false;
    const next = { ...current, context_management: { ...context, autonomy: claimed.state } }; await persist(ctx, next, activeLoop, `${source}_planner_wake`);
    try { pi.sendMessage({ customType: "loop-autonomy", content: "Continue the approved loop plan autonomously. Inspect the durable plan/checkpoint, register the next safe routine step with loop_context, or mark the plan complete/paused if no step remains.", display: false, details: { token } }, { triggerTurn: true, deliverAs: "followUp" }); } catch (error) { await persist(ctx, { ...next, context_management: { ...next.context_management, autonomy: completeContinuation(claimed.state, token, false, `planner wake failed: ${String(error)}`) } }, activeLoop, "planner_wake_failed"); }
    return true;
  };

  pi.registerTool({
    name: "loop_context", label: "Durable loop context", description: "Persist loop checkpoints, task capacity, context usage, and validated child handoffs. Usage is measured only; this tool never injects telemetry or compacts automatically.", parameters: schema,
    async execute(_id, input: Input, _signal, _update, ctx) {
      const loop = safeLoop(input.loop ?? activeLoop); const current = await ensure(ctx, loop); let next = current; const timestamp = now();
      if (input.action === "register_next") {
        const kinds: ActionKind[] = ["read-only", "routine", "implementation", "product-decision", "destructive"];
        if (!input.token || !input.step) return text("register_next requires token and step.", { error: true });
        const registered = registerAutonomyIntent(current.context_management.autonomy, { token: input.token, step: input.step, actionKind: kinds.includes(input.actionKind as ActionKind) ? input.actionKind as ActionKind : "routine", requiresApproval: input.requiresApproval === true, destructive: input.destructive === true, maxAttempts: input.maxAttempts, completionPredicate: input.completionPredicate ?? null }, timestamp);
        if (registered.error) return text(registered.error, { error: true });
        next = { ...current, context_management: { ...current.context_management, autonomy: registered.state } };
      }
      if (input.action === "approve") return text("Approval is user-only. Run /loop-autonomy-approve in Pi.", { error: true, userOnly: true });
      if (input.action === "pause") next = { ...current, context_management: { ...current.context_management, autonomy: pauseAutonomy(current.context_management.autonomy, input.reason ?? input.detail ?? "paused by user") } };
      if (input.action === "resume") return text("Resume is user-only. Run /loop-autonomy-resume in Pi.", { error: true, userOnly: true });
      if (input.action === "complete_next") {
        if (!input.token) return text("complete_next requires token.", { error: true });
        next = { ...current, context_management: { ...current.context_management, autonomy: completeContinuation(current.context_management.autonomy, input.token, input.success === true, input.reason ?? null) } };
      }
      if (input.action === "init") next = { ...current, context_management: { ...reconcileStaleTasks(sessionPatch(ctx, current.context_management, "session_start"), timestamp), autonomy: recoverAutonomy(current.context_management.autonomy) } };
      if (input.action === "reconcile") next = { ...current, context_management: reconcileStaleTasks(sessionPatch(ctx, current.context_management, "context"), timestamp) };
      if (input.action === "snapshot") next = { ...current, context_management: sessionPatch(ctx, current.context_management, "context") };
      if (input.action === "checkpoint") {
        const usage = sessionPatch(ctx, current.context_management, "context"); next = { ...current, context_management: { ...usage, checkpoint: { phase: input.phase ?? usage.checkpoint.phase, step: input.step ?? usage.checkpoint.step, detail: input.detail ?? usage.checkpoint.detail, updatedAt: timestamp } } };
      }
      if (input.action === "task") {
        if (!input.taskId || !input.runId || !input.phase) return text("Task action requires taskId, runId, and phase.", { error: true });
        const context = sessionPatch(ctx, current.context_management, "context"); const tasks = [...context.tasks]; const index = tasks.findIndex((task) => task.taskId === input.taskId && task.runId === input.runId);
        const requested = (input.status ?? "pending") as TaskStatus; let queued = false;
        if (index < 0) {
          const workerKind = (input.workerKind ?? "worker") as WorkerKind; const configured = input.highRisk ? 3 : context.scheduler.configuredConcurrency;
          if (requested === "running" && activeCount(context) >= configured) { queued = true; tasks.push({ taskId: input.taskId, runId: input.runId, phase: input.phase, workerKind, attempt: input.attempt ?? 1, status: "pending", startedAt: null, endedAt: null, budget: input.budget ?? {}, usage: context.usage, handoffPath: input.handoffPath ?? null, retryable: input.retryable === true, handoffAccepted: false }); }
          else tasks.push({ taskId: input.taskId, runId: input.runId, phase: input.phase, workerKind, attempt: input.attempt ?? 1, status: requested, startedAt: requested === "running" ? timestamp : null, endedAt: ["pending", "running"].includes(requested) ? null : timestamp, budget: input.budget ?? {}, usage: context.usage, handoffPath: input.handoffPath ?? null, retryable: input.retryable === true, handoffAccepted: false });
        } else {
          const existing = tasks[index]; const result = transitionTask(existing, requested, timestamp); if (result.error) return text(result.error, { error: true }); tasks[index] = { ...result.task, phase: input.phase, budget: input.budget ?? result.task.budget, handoffPath: input.handoffPath ?? result.task.handoffPath, retryable: input.retryable ?? result.task.retryable, usage: context.usage };
        }
        next = { ...current, context_management: { ...context, tasks, scheduler: { ...context.scheduler, activeConcurrency: activeCount({ ...context, tasks }), queue: queued ? [...context.scheduler.queue, input.taskId] : context.scheduler.queue, lastCapacityEvent: queued ? `queued ${input.taskId}` : context.scheduler.lastCapacityEvent } } };
      }
      if (input.action === "handoff") {
        if (!input.taskId || !input.runId || !input.handoff) return text("Handoff action requires taskId, runId, and handoff.", { error: true });
        const task = current.context_management.tasks.find((candidate) => candidate.taskId === input.taskId && candidate.runId === input.runId); if (!task) return text("Unknown task; handoff was not merged.", { error: true });
        const checked = validateHandoff(input.handoff, { taskId: task.taskId, runId: task.runId, attempt: task.attempt }); if (checked.ok === false) return text(`Handoff rejected: ${checked.errors.join("; ")}`, { error: true, bytes: checked.bytes });
        const merged = mergeHandoff(task, checked.handoff); if (merged.error) return text(`Handoff rejected: ${merged.error}`, { error: true });
        next = { ...current, context_management: { ...current.context_management, tasks: current.context_management.tasks.map((candidate) => candidate === task ? merged.task : candidate) } };
        await persist(ctx, next, loop, merged.duplicate ? "handoff_duplicate" : "handoff_accepted"); return text(merged.duplicate ? "Duplicate handoff ignored." : "Handoff accepted.", { accepted: true, duplicate: merged.duplicate });
      }
      next.context_management.scheduler.activeConcurrency = activeCount(next.context_management);
      await persist(ctx, next, loop, input.action);
      const decision = evaluateUsage(next.context_management.usage);
      return text(input.action === "autonomy_status" ? "Autonomy status loaded." : `Context checkpoint saved. Routing: ${decision.action}.`, { path: pathFor(ctx, loop), routing: decision, tasks: next.context_management.tasks.length, autonomy: next.context_management.autonomy });
    },
  });

  pi.registerCommand("loop-context", { description: "Show durable context routing and checkpoint state", handler: async (_args, ctx) => { const current = await ensure(ctx, activeLoop); const decision = evaluateUsage(current.context_management.usage); const autonomy = current.context_management.autonomy; ctx.ui.notify(`Loop context: ${decision.action} (${decision.percent ?? "unknown"}%). Autonomy: ${autonomy.mode}; next: ${autonomy.nextStep?.step ?? "none"}.`, "info"); } });
  pi.registerCommand("loop-autonomy-approve", { description: "Approve safe routine loop continuation", handler: async (args, ctx) => { const current = await ensure(ctx, activeLoop); const marker = args.trim() || "approved by user"; const next = { ...current, context_management: { ...current.context_management, autonomy: approveAutonomy(current.context_management.autonomy, marker, now()) } }; await persist(ctx, next, activeLoop, "autonomy_approved"); ctx.ui.notify("Loop autonomy approved for safe registered steps.", "info"); } });
  pi.registerCommand("loop-autonomy-resume", { description: "Resume paused safe loop continuation", handler: async (_args, ctx) => { const current = await ensure(ctx, activeLoop); const next = { ...current, context_management: { ...current.context_management, autonomy: resumeAutonomy(current.context_management.autonomy) } }; await persist(ctx, next, activeLoop, "autonomy_resumed"); await wakePlanner(ctx, next, "resume"); ctx.ui.notify(`Loop autonomy: ${next.context_management.autonomy.mode}.`, "info"); } });
  pi.registerCommand("loop-autonomy-pause", { description: "Pause automatic loop continuation", handler: async (args, ctx) => { const current = await ensure(ctx, activeLoop); const next = { ...current, context_management: { ...current.context_management, autonomy: pauseAutonomy(current.context_management.autonomy, args.trim() || "paused by user") } }; await persist(ctx, next, activeLoop, "autonomy_paused"); ctx.ui.notify("Loop autonomy paused.", "info"); } });
  pi.on("session_start", async (event, ctx) => { activeLoop = await discoverLoop(ctx, event.previousSessionFile); const current = await ensure(ctx, activeLoop); const next = { ...current, context_management: { ...reconcileStaleTasks(sessionPatch(ctx, current.context_management, "session_start")), autonomy: recoverAutonomy(current.context_management.autonomy) } }; await persist(ctx, next, activeLoop, "session_start"); await wakePlanner(ctx, next, "session_start"); });
  pi.on("session_before_compact", async (event, ctx) => { pendingCompaction = { reason: event.reason, tokensBefore: event.preparation.tokensBefore, firstKeptEntryId: event.preparation.firstKeptEntryId }; const current = await ensure(ctx, activeLoop); const autonomy = event.signal.aborted ? completeAutonomyCompaction(current.context_management.autonomy, false, "compaction was cancelled") : event.reason === "threshold" || event.reason === "overflow" ? requestAutonomyCompaction(current.context_management.autonomy, event.reason, now()) : current.context_management.autonomy; const next = { ...current, context_management: { ...current.context_management, autonomy, usage: usageSnapshot({ tokens: event.preparation.tokensBefore, contextWindow: ctx.getContextUsage()?.contextWindow ?? 1, percent: ctx.getContextUsage()?.percent ?? null }, "context") } }; await persist(ctx, next, activeLoop, "compaction_before"); });
  pi.on("session_compact", async (event, ctx) => { const current = await ensure(ctx, activeLoop); const record = pendingCompaction ?? { reason: event.reason, tokensBefore: event.compactionEntry.tokensBefore, firstKeptEntryId: event.compactionEntry.firstKeptEntryId }; const next = { ...current, context_management: { ...current.context_management, autonomy: completeAutonomyCompaction(current.context_management.autonomy, true), usage: null, compactions: [...current.context_management.compactions, { ...record, timestamp: now(), success: true }] } }; pendingCompaction = undefined; await persist(ctx, next, activeLoop, "compaction"); });
  pi.on("model_select", async (event, ctx) => { const current = await ensure(ctx, activeLoop); const next = { ...current, context_management: { ...current.context_management, session: { ...current.context_management.session, provider: event.model.provider, model: event.model.id } } }; await persist(ctx, next, activeLoop, "model_select"); });
  pi.on("turn_start", async (_event, ctx) => { const current = await ensure(ctx, activeLoop); await persist(ctx, { ...current, context_management: sessionPatch(ctx, current.context_management, "turn_start") }, activeLoop, "turn_start"); });
  pi.on("turn_end", async (_event, ctx) => { const current = await ensure(ctx, activeLoop); await persist(ctx, { ...current, context_management: sessionPatch(ctx, current.context_management, "turn_end") }, activeLoop, "turn_end"); });
  pi.on("agent_settled", async (_event, ctx) => {
    const current = await ensure(ctx, activeLoop); const timestamp = now(); const context = sessionPatch(ctx, current.context_management, "turn_end"); const decision = evaluateUsage(context.usage);
    if (decision.action === "persist-and-compact") {
      const autonomy = context.autonomy.compaction.pending ? context.autonomy : requestAutonomyCompaction(context.autonomy, "threshold", timestamp); const next = { ...current, context_management: { ...context, autonomy } }; await persist(ctx, next, activeLoop, "autonomy_compact_requested"); ctx.compact(); return;
    }
    if (decision.action === "stop-fanout") { await persist(ctx, { ...current, context_management: { ...context, autonomy: pauseAutonomy(context.autonomy, decision.reason) } }, activeLoop, "autonomy_paused"); return; }
    if (!context.autonomy.nextStep) {
      if (context.autonomy.continuation.status === "in-flight" && context.autonomy.continuation.token?.startsWith("planner-wake-")) {
        const failed = completeContinuation(context.autonomy, context.autonomy.continuation.token, false, "planner wake settled without registering a next step"); await persist(ctx, { ...current, context_management: { ...context, autonomy: failed } }, activeLoop, "planner_wake_incomplete");
      } else await wakePlanner(ctx, { ...current, context_management: context }, "settled");
      return;
    }
    const claimed = claimContinuation(context.autonomy, context.usage, timestamp); const next = { ...current, context_management: { ...context, autonomy: claimed.state } }; await persist(ctx, next, activeLoop, claimed.claimed ? "autonomy_claimed" : "agent_settled");
    if (!claimed.claimed || !claimed.state.nextStep) return;
    try { pi.sendMessage({ customType: "loop-autonomy", content: `Continue registered routine step: ${claimed.state.nextStep.step}. Complete token ${claimed.state.nextStep.token} when finished.`, display: false, details: { token: claimed.state.nextStep.token, attempt: claimed.state.continuation.attempt } }, { triggerTurn: true, deliverAs: "followUp" }); }
    catch (error) { const failed = completeContinuation(claimed.state, claimed.state.nextStep.token, false, `continuation trigger failed: ${String(error)}`); await persist(ctx, { ...next, context_management: { ...context, autonomy: failed } }, activeLoop, "autonomy_trigger_failed"); }
  });
  pi.on("context", async (_event, ctx) => { const current = await ensure(ctx, activeLoop); await persist(ctx, { ...current, context_management: sessionPatch(ctx, current.context_management, "context") }); return; });
  pi.on("session_shutdown", async (_event, ctx) => { if (!state) return; const next = pendingCompaction ? { ...state, context_management: { ...state.context_management, autonomy: completeAutonomyCompaction(state.context_management.autonomy, false, "session ended before compaction completed"), usage: null, compactions: [...state.context_management.compactions, { ...pendingCompaction, timestamp: now(), success: false }] } } : { ...state, context_management: sessionPatch(ctx, state.context_management, "context") }; pendingCompaction = undefined; await persist(ctx, next, activeLoop, "session_shutdown"); state = undefined; });
}
