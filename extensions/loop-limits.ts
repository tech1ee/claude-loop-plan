import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { truncateToWidth } from "@earendil-works/pi-tui";

type Theme = { fg: (color: string, text: string) => string };
type WindowLimit = { label: string; maxTokens?: number; maxRequests?: number };
type Config = { windows?: WindowLimit[] };
type RecordUsage = { requests: number; input: number; output: number; cost: number };

type UsageMessage = {
  usage?: { input?: number; output?: number; inputTokens?: number; outputTokens?: number; cost?: { total?: number } };
};

const fmt = (n: number): string => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : `${Math.round(n)}`;
const pct = (value: number, max: number): number => max > 0 ? Math.min(100, Math.max(0, value / max * 100)) : 0;
function bar(value: number, max: number, width = 16): string {
  const filled = Math.round(pct(value, max) / 100 * width);
  return `[${"█".repeat(filled)}${"░".repeat(width - filled)}] ${Math.round(pct(value, max))}%`;
}
function modelKey(ctx: ExtensionContext): string {
  return ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "model unavailable";
}
async function loadConfig(ctx: ExtensionContext): Promise<Config> {
  for (const path of [join(ctx.cwd, ".pi", "loop-limits.json"), join(homedir(), ".pi", "agent", "loop-limits.json")]) {
    try { return JSON.parse(await readFile(path, "utf8")) as Config; } catch { /* optional config */ }
  }
  return {};
}

export default function (pi: ExtensionAPI) {
  const records = new Map<string, RecordUsage>();
  let config: Config = {};
  let currentContext = 0;

  const refresh = (ctx: ExtensionContext) => {
    const key = modelKey(ctx);
    const usage = records.get(key) ?? { requests: 0, input: 0, output: 0, cost: 0 };
    const model = ctx.model as (typeof ctx.model & { contextWindow?: number }) | undefined;
    const contextWindow = model?.contextWindow ?? 0;
    const providerLabel = ctx.model?.provider === "openai-codex" ? "OAuth subscription" : ctx.model?.provider === "openai" ? "API key billing" : "provider billing";
    ctx.ui.setWidget("loop-limits", (_tui, theme: Theme) => ({
      render(width: number): string[] {
        const lines = [theme.fg("accent", `◉ Limits  ${key}`), theme.fg("muted", `  Billing: ${providerLabel}`)];
        if (contextWindow) lines.push(truncateToWidth(`  Context       ${bar(currentContext, contextWindow)}  ${fmt(currentContext)}/${fmt(contextWindow)}`, width));
        else lines.push(theme.fg("muted", "  Context       unavailable"));
        lines.push(truncateToWidth(`  Session       ${fmt(usage.input + usage.output)} tokens  •  ${usage.requests} requests  •  $${usage.cost.toFixed(4)}`, width));
        for (const limit of config.windows ?? []) {
          if (limit.maxTokens) lines.push(truncateToWidth(`  ${limit.label.padEnd(13)} ${bar(usage.input + usage.output, limit.maxTokens)}  ${fmt(usage.input + usage.output)}/${fmt(limit.maxTokens)}`, width));
          else if (limit.maxRequests) lines.push(truncateToWidth(`  ${limit.label.padEnd(13)} ${bar(usage.requests, limit.maxRequests)}  ${usage.requests}/${limit.maxRequests} requests`, width));
        }
        lines.push(theme.fg("dim", "  Remote subscription quota: not exposed by Pi; configured windows are optional."));
        return lines.map((line) => truncateToWidth(line, width));
      },
      invalidate() {},
    }), { placement: "belowEditor" });
  };

  const update = (ctx: ExtensionContext, message?: UsageMessage) => {
    const key = modelKey(ctx); const record = records.get(key) ?? { requests: 0, input: 0, output: 0, cost: 0 };
    const usage = message?.usage; const input = usage?.input ?? usage?.inputTokens ?? 0; const output = usage?.output ?? usage?.outputTokens ?? 0;
    if (message) { record.requests += 1; record.input += input; record.output += output; record.cost += usage?.cost?.total ?? 0; records.set(key, record); }
    currentContext = ctx.getContextUsage()?.tokens ?? input + output;
    refresh(ctx);
  };

  pi.on("session_start", async (_event, ctx) => { config = await loadConfig(ctx); update(ctx); });
  pi.on("turn_end", (_event, ctx) => update(ctx));
  pi.on("message_end", (event, ctx) => { if (event.message.role === "assistant") update(ctx, event.message as UsageMessage); });
  pi.on("model_select", (_event, ctx) => update(ctx));
  pi.registerCommand("loop-limits", {
    description: "Refresh the model and subscription limits panel",
    handler: async (_args, ctx) => { config = await loadConfig(ctx); update(ctx); ctx.ui.notify("Limits panel refreshed. Remote subscription quotas are shown only when the provider exposes them.", "info"); },
  });
  pi.on("session_shutdown", (_event, ctx) => ctx.ui.setWidget("loop-limits", undefined));
}
