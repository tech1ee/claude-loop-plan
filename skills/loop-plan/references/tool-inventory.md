# Tool inventory reference

Schema, query recipes, and mtime protocol for `~/.claude/tools-inventory.json`. Loaded on demand when loop-plan Phase 3b runs.

## Why this file exists

Loop-plan needs to name specific agents/skills/MCP servers in its Phase 4 output. Without a cached registry, every plan either (a) hand-waves ("dispatch a review agent"), or (b) wastes tokens re-enumerating `~/.claude/` each run. Caching the registry once, invalidating it via mtime, and querying it per task matches the DeerFlow `get_available_tools()` pattern and the MCP-Zero on-demand-lookup principle.

## Inventory JSON schema (v1)

```json
{
  "version": 1,
  "generated_at": "2026-04-15T14:23:00Z",
  "scanned_roots": [
    "~/.claude/agents",
    "~/.claude/skills",
    "~/.claude/commands",
    "~/.claude/plugins/cache",
    "~/.claude/plugins/marketplaces",
    "~/.claude/settings.json"
  ],
  "agents": [
    {
      "name": "security-reviewer",
      "path": "~/.claude/agents/security-reviewer.md",
      "model": "opus",
      "tools": ["Read", "Grep", "Glob"],
      "background": true,
      "max_turns": 12,
      "description": "Review code proactively after auth/payment/secret changes.",
      "agent_source": "local",
      "mcpServers": null
    }
  ],
  "skills": [
    {
      "name": "deep-researcher",
      "path": "~/.claude/skills/deep-researcher/SKILL.md",
      "source": "local",
      "description": "5-step methodology, >=20 sources, credibility scoring.",
      "allowed_tools": ["WebSearch", "WebFetch", "Read", "Write"]
    }
  ],
  "commands": [
    {
      "name": "ship-check",
      "path": "~/.claude/commands/ship-check.md",
      "description": "Pre-merge / pre-release validation gate with hard evidence",
      "argument_hint": "[optional: base branch, default=main]"
    }
  ],
  "mcp_servers": [
    { "name": "notion", "command": "npx @notionhq/notion-mcp-server", "env_vars": ["NOTION_API_KEY"] }
  ],
  "enabled_plugins": ["superpowers@claude-plugins-official", "context7@claude-plugins-official"],
  "orchestration_patterns": [
    "A-single", "B-parallel-explore", "C-orchestrator-worker",
    "D-pipeline", "E-agent-teams", "F-map-reduce"
  ],
  "model_tiers": {
    "orchestrator": "opus",
    "reviewer": "sonnet",
    "research": "haiku"
  }
}
```

## Field semantics

- **`generated_at`** — ISO 8601 UTC. The cache file's own filesystem mtime is what the staleness check compares against — the generated_at field is informational.
- **`agents[].tools`** — JSON array of tool names. The parser auto-splits known CSV fields (`tools`, `disallowedTools`, `allowed-tools`) into arrays so consumers can use `.tools[] | select(. == "Bash")` or `.tools | index("Write") | not`.
- **`agents[].agent_source`** — one of `"local"` (under `~/.claude/agents/`), `"plugin-root"` (under `plugins/(cache|marketplaces)/<plugin>/[version/]agents/<file>.md` — directly invocable), or `"plugin-nested"` (under deeper paths like `plugins/.../skills/<skill>/agents/<file>.md` — skill-scoped sub-agents). Use `plugin-root` as the default "visible to the planner" filter.
- **`agents[].mcpServers`** — JSON array of MCP server names this agent depends on, or `null` if none. Captured from indented YAML lists in the frontmatter (e.g. `mcpServers:\n  - notion`).
- **`agents[].background`** — boolean; drives the pattern selector's "can this agent run in background without stealing a permission prompt" check.
- **`skills[].source`** — `"local"` if under `~/.claude/skills/`, `"plugin"` if under `~/.claude/plugins/cache/`. Plugin skills are version-pinned and may disappear on plugin update — treat as slightly less stable.
- **`orchestration_patterns`** — fixed enumeration mirroring `rules/orchestration.md` §Pattern catalogue. Referenced by `references/orchestration-design.md` decision tree.
- **`model_tiers`** — default role→model mapping from `rules/orchestration.md` §Model tiering. Overridden per-agent by the agent's own `model:` frontmatter field. Per ADR-0016 (2026-04-28), the default tier for any code-writing or analysis dispatch is **opus** (Opus 4.7). Sonnet is reserved for non-gating judgment (content review, library lookup); Haiku is reserved for mechanical roles (test runner, translations, Notion sync).

## mtime invalidation protocol

Cache is considered **stale** iff a single POSIX `find` call returns a non-empty result:

```bash
find ~/.claude/agents ~/.claude/skills ~/.claude/commands \
     ~/.claude/plugins/cache ~/.claude/plugins/marketplaces \
     ~/.claude/settings.json \
     -newer ~/.claude/tools-inventory.json -print -quit
```

One command, portable across macOS and Linux (no `-printf`, no `stat -f`). The cache file's own mtime is the sole staleness reference — no per-file mtime map is persisted in the JSON.

`/scan-tooling --if-stale` runs this check first and exits no-op if fresh. Loop-plan Phase 3b uses the same check inline.

`/scan-tooling --force` skips the check and rebuilds unconditionally — used manually after editing many files at once or when debugging.

## Query recipes (jq one-liners)

Loop-plan queries the inventory per task, not in bulk. These are the standard lookups:

### Which agents have Bash?

```bash
jq '.agents[] | select(.tools[] == "Bash") | .name' ~/.claude/tools-inventory.json
```

### Read-only sonnet reviewers (safe for untrusted input review)?

```bash
jq '.agents[] | select(.model == "sonnet") | select(.tools | index("Bash") | not) | select(.tools | index("Write") | not) | select(.tools | index("Edit") | not) | .name' ~/.claude/tools-inventory.json
```

### Background-safe agents (for fire-and-forget auditors)?

```bash
jq '.agents[] | select(.background == true) | {name, model, tools}' ~/.claude/tools-inventory.json
```

### Plugin skills matching a keyword?

```bash
jq --arg kw "review" '.skills[] | select(.description | test($kw; "i")) | {name, source}' ~/.claude/tools-inventory.json
```

### Available MCP servers + enabled plugins?

```bash
jq '{mcp: .mcp_servers, plugins: .enabled_plugins}' ~/.claude/tools-inventory.json
```

## Hard rules

- **Never wholesale-inject** `tools-inventory.json` into the planner's context or the plan file. Query per task.
- **Never edit the inventory by hand** — it's generated. Edits won't survive the next `/scan-tooling`.
- **Never cite an agent not in the inventory.** If loop-plan wants one that doesn't exist, surface it in the plan's `Missing tooling` sub-section.
- **Never skip the staleness check.** Stale inventories produce plans that reference deleted agents.
- **Never run `/scan-tooling` inside a background subagent** — scanning files that a malicious attacker controls could be coerced via prompt injection. Main session only.

## What's deliberately NOT in the schema

- Tool *usage frequency* or popularity metrics — that's a v3 feature.
- Cross-agent capability overlap maps — belongs in `rules/skill-decision-matrix.md`, not the inventory.
- Cost/token estimates per agent invocation — too noisy to cache; compute at query time if needed.
- Live MCP tool definitions — MCP servers advertise tools at runtime via the MCP protocol, not at filesystem scan time. The inventory lists the *server*, not its tools.
