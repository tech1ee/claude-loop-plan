import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { truncateToWidth } from "@earendil-works/pi-tui";

type StepStatus = "pending" | "running" | "done" | "blocked" | "skipped";
type Step = { id: string; title: string; description: string; status: StepStatus; percent: number };
type Progress = { loop: string; steps: Step[]; currentDetail: string; updatedAt: number };

const stepSchema = Type.Object({
  id: Type.String(),
  title: Type.String(),
  description: Type.String(),
});

const progressSchema = Type.Object({
  action: Type.Union([
    Type.Literal("init"), Type.Literal("update"), Type.Literal("complete"),
    Type.Literal("fail"), Type.Literal("reset"),
  ]),
  loop: Type.Optional(Type.String()),
  steps: Type.Optional(Type.Array(stepSchema)),
  stepId: Type.Optional(Type.String()),
  status: Type.Optional(Type.Union([
    Type.Literal("pending"), Type.Literal("running"), Type.Literal("done"),
    Type.Literal("blocked"), Type.Literal("skipped"),
  ])),
  percent: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
  detail: Type.Optional(Type.String()),
});

type ProgressInput = {
  action: "init" | "update" | "complete" | "fail" | "reset";
  loop?: string;
  steps?: Array<{ id: string; title: string; description: string }>;
  stepId?: string;
  status?: StepStatus;
  percent?: number;
  detail?: string;
};

function progressBar(percent: number, width = 18): string {
  const filled = Math.round((Math.max(0, Math.min(100, percent)) / 100) * width);
  return `[${"█".repeat(filled)}${"░".repeat(width - filled)}] ${Math.round(percent)}%`;
}

function normalize(input: ProgressInput, current?: Progress): Progress {
  if (input.action === "init") {
    return {
      loop: input.loop ?? "loop",
      steps: (input.steps ?? []).map((step) => ({ ...step, status: "pending", percent: 0 })),
      currentDetail: input.detail ?? "Starting",
      updatedAt: Date.now(),
    };
  }
  if (input.action === "reset") return { loop: "loop", steps: [], currentDetail: "", updatedAt: Date.now() };
  if (!current) throw new Error("Initialize loop progress before updating it");

  const steps = current.steps.map((step) => ({ ...step }));
  if (input.stepId) {
    const step = steps.find((candidate) => candidate.id === input.stepId);
    if (!step) throw new Error(`Unknown loop step: ${input.stepId}`);
    if (input.status === "running") {
      for (const candidate of steps) if (candidate.id !== step.id && candidate.status === "running") candidate.status = "pending";
    }
    if (input.status) step.status = input.status;
    if (input.percent !== undefined) step.percent = input.percent;
    if (input.status === "done") step.percent = 100;
  }
  const currentDetail = input.detail ?? current.currentDetail;
  return { ...current, steps, currentDetail, updatedAt: Date.now() };
}

function renderWidget(progress: Progress) {
  return (_tui: unknown, theme: { fg: (color: string, text: string) => string }) => ({
    render(width: number): string[] {
      if (!progress.steps.length) return [];
      const completed = progress.steps.filter((step) => step.status === "done" || step.status === "skipped").length;
      const running = progress.steps.find((step) => step.status === "running");
      const overall = ((completed + (running ? running.percent / 100 : 0)) / progress.steps.length) * 100;
      const lines = [
        theme.fg("accent", `◈ ${progress.loop}  ${progressBar(overall)}`),
        theme.fg("muted", `  ${progress.currentDetail}`),
      ];
      for (const step of progress.steps) {
        const icon = step.status === "done" ? "✓" : step.status === "running" ? "▶" : step.status === "blocked" ? "!" : step.status === "skipped" ? "–" : "○";
        const color = step.status === "done" ? "success" : step.status === "running" ? "accent" : step.status === "blocked" ? "error" : "dim";
        const suffix = step.status === "running" ? ` ${progressBar(step.percent, 12)}` : "";
        lines.push(truncateToWidth(`  ${theme.fg(color, `${icon} ${step.title}`)}${theme.fg("muted", ` — ${step.description}`)}${suffix}`, width));
      }
      return lines.map((line) => truncateToWidth(line, width));
    },
    invalidate() {},
  });
}

export default function (pi: ExtensionAPI) {
  let progress: Progress | undefined;

  const refresh = (ctx: ExtensionContext) => {
    if (!progress || !progress.steps.length) {
      ctx.ui.setWidget("loop-progress", undefined);
      ctx.ui.setStatus("loop-progress", undefined);
      return;
    }
    const completed = progress.steps.filter((step) => step.status === "done" || step.status === "skipped").length;
    ctx.ui.setWidget("loop-progress", renderWidget(progress));
    ctx.ui.setStatus("loop-progress", `${completed}/${progress.steps.length} checkpoints`);
  };

  pi.registerTool({
    name: "loop_progress",
    label: "Loop progress",
    description: "Maintain the visible checkpoint list for loop-plan or loop-debug. Call init once, then update at every phase boundary and when the current phase makes meaningful progress.",
    parameters: progressSchema,
    async execute(_toolCallId, input: ProgressInput, _signal, _onUpdate, ctx) {
      try {
        progress = normalize(input, progress);
        refresh(ctx);
        const current = progress.steps.find((step) => step.status === "running");
        return {
          content: [{ type: "text", text: current ? `Progress updated: ${current.title} (${current.percent}%).` : "Progress updated." }],
          details: { loop: progress.loop, completed: progress.steps.filter((step) => step.status === "done").length, total: progress.steps.length },
        };
      } catch (error) {
        return { content: [{ type: "text", text: `Progress update failed: ${(error as Error).message}` }], isError: true, details: {} };
      }
    },
  });

  pi.registerCommand("loop-progress", {
    description: "Show or clear the active loop checkpoint panel",
    handler: async (args, ctx) => {
      if (args.trim() === "clear") {
        progress = undefined;
        refresh(ctx);
        return;
      }
      if (!progress?.steps.length) ctx.ui.notify("No active loop progress. Start /loop-plan or /loop-debug.", "info");
      else refresh(ctx);
    },
  });

  pi.on("session_start", (_event, ctx) => refresh(ctx));
  pi.on("session_shutdown", (_event, ctx) => {
    progress = undefined;
    refresh(ctx);
  });
}
