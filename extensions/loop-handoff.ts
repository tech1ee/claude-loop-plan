import { HANDOFF_MAX_BYTES, HANDOFF_SCHEMA, type Task, type Usage } from "./loop-context-state.js";
export { HANDOFF_SCHEMA };

export type HandoffStatus = "succeeded" | "failed" | "blocked" | "cancelled";
export type Handoff = {
  schema: typeof HANDOFF_SCHEMA; taskId: string; runId: string; attempt: number; status: HandoffStatus;
  goal: string; question: string; allowedPaths: string[]; budget: Record<string, unknown>;
  model: { provider: string; id: string }; usage: Usage | null;
  findings: Array<{ claim: string; evidence: string[] }>; openQuestions: string[];
  artifacts: Array<{ path: string; description: string }>; recovery: { retryable: boolean; reason: string | null };
};

type Validation = { ok: true; handoff: Handoff; bytes: number } | { ok: false; errors: string[]; bytes: number };
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const pathEvidence = /(?:^|\s|\()([^\s():]+):([1-9][0-9]*)(?:-[1-9][0-9]*)?(?:\s|\)|$)/;
const forbidden = new Set(["transcript", "rawTranscript", "secret", "secrets", "apiKey", "token", "password", "executableInstructions"]);
function containsForbidden(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbidden);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, child]) => forbidden.has(key) || containsForbidden(child));
}

export function validateHandoff(value: unknown, expected?: { taskId: string; runId: string; attempt: number }): Validation {
  let bytes = 0;
  try { bytes = Buffer.byteLength(JSON.stringify(value)); } catch { return { ok: false, errors: ["handoff is not JSON serializable"], bytes: 0 }; }
  const errors: string[] = [];
  if (bytes > HANDOFF_MAX_BYTES) errors.push(`handoff exceeds ${HANDOFF_MAX_BYTES} bytes`);
  if (!isRecord(value)) return { ok: false, errors: [...errors, "handoff must be an object"], bytes };
  if (containsForbidden(value)) errors.push("handoff contains transcript, secret, or executable-instruction fields");
  if (value.schema !== HANDOFF_SCHEMA) errors.push(`schema must be ${HANDOFF_SCHEMA}`);
  if (!text(value.taskId) || !text(value.runId)) errors.push("taskId and runId are required");
  if (!Number.isInteger(value.attempt) || Number(value.attempt) < 1) errors.push("attempt must be a positive integer");
  if (expected && (value.taskId !== expected.taskId || value.runId !== expected.runId || value.attempt !== expected.attempt)) errors.push("handoff identity or attempt does not match the task");
  if (!["succeeded", "failed", "blocked", "cancelled"].includes(value.status as string)) errors.push("status is invalid");
  if (!text(value.goal) || !text(value.question)) errors.push("goal and question are required");
  if (!Array.isArray(value.allowedPaths) || value.allowedPaths.some((path) => !text(path))) errors.push("allowedPaths must be a non-empty-string array");
  if (!isRecord(value.budget) || !isRecord(value.model) || !text(value.model.provider) || !text(value.model.id)) errors.push("budget and model provider/id are required");
  if (value.usage !== null && value.usage !== undefined && !isRecord(value.usage)) errors.push("usage must be an object or null");
  if (!Array.isArray(value.findings) || value.findings.some((finding) => !isRecord(finding) || !text(finding.claim) || !Array.isArray(finding.evidence) || finding.evidence.length === 0 || finding.evidence.some((evidence) => !text(evidence) || !pathEvidence.test(evidence)))) errors.push("each finding needs claim and path:line evidence");
  if (!Array.isArray(value.openQuestions) || value.openQuestions.some((question) => !text(question))) errors.push("openQuestions must be a string array");
  if (!Array.isArray(value.artifacts) || value.artifacts.some((artifact) => !isRecord(artifact) || !text(artifact.path) || !text(artifact.description))) errors.push("artifacts must contain path and description");
  if (!isRecord(value.recovery) || typeof value.recovery.retryable !== "boolean" || (value.recovery.reason !== null && !text(value.recovery.reason))) errors.push("recovery must contain retryable and nullable reason");
  if (errors.length) return { ok: false, errors, bytes };
  return { ok: true, handoff: value as unknown as Handoff, bytes };
}

export function mergeHandoff(task: Task, handoff: Handoff, now = new Date().toISOString()): { task: Task; accepted: boolean; duplicate: boolean; error?: string } {
  if (task.taskId !== handoff.taskId || task.runId !== handoff.runId || task.attempt !== handoff.attempt) return { task, accepted: false, duplicate: false, error: "handoff identity or attempt mismatch" };
  if (task.handoffAccepted) return { task, accepted: true, duplicate: true };
  const status = handoff.status === "succeeded" ? "succeeded" : handoff.status === "cancelled" ? "cancelled" : handoff.status === "blocked" ? "blocked" : "failed";
  return { task: { ...task, status, endedAt: now, retryable: handoff.recovery.retryable, usage: handoff.usage, handoffAccepted: true }, accepted: true, duplicate: false };
}
