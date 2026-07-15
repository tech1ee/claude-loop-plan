import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { join } from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";
import { Type } from "typebox";

const inputSchema = Type.Object({
  refresh: Type.Optional(Type.Boolean()),
  includeProject: Type.Optional(Type.Boolean()),
});

type Snapshot = Record<string, unknown>;

async function names(path: string): Promise<string[]> {
  try {
    return (await readdir(path, { withFileTypes: true }))
      .filter((entry) => !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .slice(0, 200);
  } catch { return []; }
}

async function file(path: string): Promise<boolean> {
  try { return (await stat(path)).isFile(); } catch { return false; }
}

async function jsonKeys(path: string): Promise<{ packages: unknown[]; extensions: unknown[] }> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    return {
      packages: Array.isArray(value.packages) ? value.packages.slice(0, 100) : [],
      extensions: Array.isArray(value.extensions) ? value.extensions.slice(0, 100) : [],
    };
  } catch { return { packages: [], extensions: [] }; }
}

async function discover(ctx: ExtensionContext, active: { tools: string[]; skills: string[] }): Promise<Snapshot> {
  const home = join(homedir(), ".pi", "agent");
  const project = join(ctx.cwd, ".pi");
  const includeProject = true;
  const globalSettings = await jsonKeys(join(home, "settings.json"));
  const projectSettings = includeProject ? await jsonKeys(join(project, "settings.json")) : { packages: [], extensions: [] };
  const packageRoots = [join(home, "npm"), join(home, "git")];
  const packages = (await Promise.all(packageRoots.map(names))).flat().slice(0, 200);
  const mcpCandidates = [
    join(ctx.cwd, ".mcp.json"), join(ctx.cwd, "mcp.json"), join(project, "mcp.json"),
    join(home, "mcp.json"), join(home, "settings.json"),
  ];
  const mcpConfigFiles = [];
  for (const candidate of mcpCandidates) if (await file(candidate)) mcpConfigFiles.push(candidate);

  return {
    capturedAt: new Date().toISOString(),
    cwd: ctx.cwd,
    model: ctx.model ? { provider: ctx.model.provider, id: ctx.model.id } : null,
    active: { tools: active.tools, skills: active.skills },
    global: {
      agents: await names(join(home, "agents")), skills: await names(join(home, "skills")),
      extensions: await names(join(home, "extensions")), commands: await names(join(home, "prompts")),
      packages, settings: { packages: globalSettings.packages, extensions: globalSettings.extensions },
    },
    project: {
      agents: await names(join(project, "agents")), skills: await names(join(project, "skills")),
      extensions: await names(join(project, "extensions")), chains: await names(join(project, "chains")),
      settings: { packages: projectSettings.packages, extensions: projectSettings.extensions },
    },
    mcp: { configFiles: mcpConfigFiles, status: mcpConfigFiles.length ? "configured" : "not-discovered" },
    note: "Names and paths only; configuration values and prompt bodies are intentionally omitted.",
  };
}

export default function (pi: ExtensionAPI) {
  let active = { tools: [] as string[], skills: [] as string[] };
  let cached: Snapshot | undefined;

  pi.on("before_agent_start", (event) => {
    active = {
      tools: event.systemPromptOptions.selectedTools ?? [],
      skills: (event.systemPromptOptions.skills ?? []).map((skill) => skill.name),
    };
  });

  pi.registerTool({
    name: "loop_inventory",
    label: "Loop capability inventory",
    description: "Discover available Pi agents, skills, extensions, packages, active tools, model, and MCP configuration. Returns names and paths only, never secrets or prompt bodies.",
    parameters: inputSchema,
    async execute(_id, input: { refresh?: boolean; includeProject?: boolean }, _signal, _update, ctx) {
      if (input.refresh || !cached) cached = await discover(ctx, active);
      const snapshot = cached ?? await discover(ctx, active);
      return { content: [{ type: "text", text: JSON.stringify(snapshot, null, 2) }], details: snapshot };
    },
  });

  pi.registerCommand("loop-inventory", {
    description: "Inspect the current loop capability inventory",
    handler: async (_args, ctx) => {
      cached = await discover(ctx, active);
      ctx.ui.notify(`Loop inventory refreshed (${(cached.active as { tools: string[] }).tools.length} active tools).`, "info");
    },
  });
}
