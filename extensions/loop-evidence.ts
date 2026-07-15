import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { Type } from "typebox";

type Status = "open" | "verified" | "conflicted" | "rejected";
type Evidence = {
  id: string; claim: string; source: string; confidence: "low" | "medium" | "high";
  impact: "low" | "medium" | "high"; status: Status; nextProbe: string | null;
};

const schema = Type.Object({
  action: Type.Union([Type.Literal("init"), Type.Literal("add"), Type.Literal("resolve"), Type.Literal("conflict"), Type.Literal("reset")]),
  loop: Type.String(), id: Type.Optional(Type.String()), claim: Type.Optional(Type.String()),
  source: Type.Optional(Type.String()), confidence: Type.Optional(Type.Union([Type.Literal("low"), Type.Literal("medium"), Type.Literal("high")])),
  impact: Type.Optional(Type.Union([Type.Literal("low"), Type.Literal("medium"), Type.Literal("high")])),
  nextProbe: Type.Optional(Type.String()),
});

type Input = {
  action: "init" | "add" | "resolve" | "conflict" | "reset"; loop: string; id?: string;
  claim?: string; source?: string; confidence?: Evidence["confidence"]; impact?: Evidence["impact"]; nextProbe?: string;
};

function safeLoop(value: string): string { return value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "loop"; }
function statePath(ctx: ExtensionContext, loop: string): string { return join(ctx.cwd, ".pi", "plans", `${safeLoop(loop)}.state.json`); }

async function load(ctx: ExtensionContext, loop: string): Promise<Record<string, unknown>> {
  try { return JSON.parse(await readFile(statePath(ctx, loop), "utf8")) as Record<string, unknown>; } catch { return { loop, evidence_ledger: [] }; }
}
async function save(ctx: ExtensionContext, loop: string, state: Record<string, unknown>): Promise<void> {
  const path = statePath(ctx, loop); await mkdir(join(ctx.cwd, ".pi", "plans"), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`; await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, "utf8"); await rename(tmp, path);
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "loop_evidence",
    label: "Loop evidence ledger",
    description: "Maintain verified claims and unresolved probes for an adaptive loop. Every claim needs a source, confidence, impact, and status.",
    parameters: schema,
    async execute(_id, input: Input, _signal, _update, ctx) {
      const state = await load(ctx, input.loop);
      let ledger = Array.isArray(state.evidence_ledger) ? [...state.evidence_ledger] as Evidence[] : [];
      if (input.action === "reset" || input.action === "init") ledger = [];
      if (input.action === "add" || input.action === "init") {
        if (!input.id || !input.claim || !input.source || !input.confidence || !input.impact) throw new Error("add requires id, claim, source, confidence, and impact");
        ledger = ledger.filter((item) => item.id !== input.id);
        ledger.push({ id: input.id, claim: input.claim, source: input.source, confidence: input.confidence, impact: input.impact, status: "open", nextProbe: input.nextProbe ?? null });
      }
      if ((input.action === "resolve" || input.action === "conflict") && !input.id) throw new Error(`${input.action} requires id`);
      if (input.action === "resolve" || input.action === "conflict") {
        const item = ledger.find((candidate) => candidate.id === input.id); if (!item) throw new Error(`Unknown evidence id: ${input.id}`);
        item.status = input.action === "resolve" ? "verified" : "conflicted"; item.nextProbe = input.nextProbe ?? null;
      }
      state.evidence_ledger = ledger; state.evidence_updated_at = new Date().toISOString(); await save(ctx, input.loop, state);
      const open = ledger.filter((item) => item.status === "open" || item.status === "conflicted").length;
      return { content: [{ type: "text", text: `Evidence ledger: ${ledger.length} total, ${open} unresolved.` }], details: { total: ledger.length, unresolved: open, path: statePath(ctx, input.loop) } };
    },
  });
}
