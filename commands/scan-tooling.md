---
description: Rebuild ~/.claude/tools-inventory.json from filesystem + settings.json. Staleness via find -newer.
argument-hint: "[--if-stale | --force]"
allowed-tools: Bash, Read, Glob, Write
---

Rebuild the tool inventory used by `loop-plan` Phase 3b for tool-aware planning. Idempotent, read-only against the filesystem, no network, no shell interpolation of user-controlled file contents (safety).

## Scanned roots

```
~/.claude/agents
~/.claude/skills
~/.claude/commands
~/.claude/plugins/cache
~/.claude/plugins/marketplaces
~/.claude/settings.json
```

Note `plugins/marketplaces` is included — autoresearch and some other plugins install there, not under `cache/`.

## Flow

Parse `$ARGUMENTS`. Default when invoked by loop-plan is `--if-stale`. Manual invocation usually wants `--force`.

### Step 1 — Staleness check (`--if-stale` only)

One POSIX `find` call. Portable across macOS and Linux — no `-printf`, no `stat`:

```bash
cache=~/.claude/tools-inventory.json
rebuild=1
if [ -f "$cache" ]; then
  newer=$(find \
    ~/.claude/agents \
    ~/.claude/skills \
    ~/.claude/commands \
    ~/.claude/plugins/cache \
    ~/.claude/plugins/marketplaces \
    ~/.claude/settings.json \
    -newer "$cache" -print -quit 2>/dev/null)
  [ -z "$newer" ] && rebuild=0
fi
```

If `rebuild=0`, print `Inventory fresh. Cache: ~/.claude/tools-inventory.json` and exit 0. Otherwise proceed.

### Step 2 — Scan agents

```bash
# Local agents
for f in ~/.claude/agents/*.md; do
  [ -f "$f" ] || continue
  python3 ~/.claude/bin/scan-tooling-parse.py "$f"
done > /tmp/inventory-agents.jsonl

# Plugin agents — every .md under any plugin's agents/ directory
{
  find ~/.claude/plugins/cache -type f -name "*.md" -path "*/agents/*" 2>/dev/null
  find ~/.claude/plugins/marketplaces -type f -name "*.md" -path "*/agents/*" 2>/dev/null
} | while read -r f; do
  python3 ~/.claude/bin/scan-tooling-parse.py "$f"
done > /tmp/inventory-plugin-agents.jsonl
```

One JSON object per line. The Python parser handles all value escaping — no shell interpolation of file contents anywhere.

### Step 3 — Scan skills

Two roots, recursive. Using `find` instead of shell globbing so the `<version>` segment in `plugins/cache/<plugin>/<version>/skills/` is traversed correctly, and so `plugins/marketplaces/*` is included:

```bash
{
  find ~/.claude/skills -mindepth 2 -maxdepth 3 -name SKILL.md -type f 2>/dev/null
  find ~/.claude/plugins/cache -name SKILL.md -type f 2>/dev/null
  find ~/.claude/plugins/marketplaces -name SKILL.md -type f 2>/dev/null
} | while read -r f; do
  python3 ~/.claude/bin/scan-tooling-parse.py "$f"
done > /tmp/inventory-skills.jsonl
```

For each skill entry, post-process in jq to tag the source: `local` if the path starts with `~/.claude/skills/`, `plugin` otherwise.

### Step 4 — Scan commands

```bash
for f in ~/.claude/commands/*.md; do
  [ -f "$f" ] || continue
  python3 ~/.claude/bin/scan-tooling-parse.py "$f"
done > /tmp/inventory-commands.jsonl
```

### Step 5 — Read settings.json

```bash
mcp_and_plugins=$(jq '{
  mcp_servers: (.mcpServers // {} | to_entries | map({
    name: .key,
    command: .value.command,
    env_vars: (.value.env // {} | keys)
  })),
  enabled_plugins: (.enabledPlugins // {} | to_entries | map(select(.value == true) | .key))
}' ~/.claude/settings.json)
```

Only env var **names** are recorded, never values — done by `keys` on the env object.

### Step 6 — Assemble

```bash
generated_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

jq -n \
  --slurpfile agents /tmp/inventory-agents.jsonl \
  --slurpfile plugin_agents /tmp/inventory-plugin-agents.jsonl \
  --slurpfile skills /tmp/inventory-skills.jsonl \
  --slurpfile commands /tmp/inventory-commands.jsonl \
  --argjson mcp_plugins "$mcp_and_plugins" \
  --arg generated_at "$generated_at" \
  '{
    version: 1,
    generated_at: $generated_at,
    scanned_roots: [
      "~/.claude/agents",
      "~/.claude/skills",
      "~/.claude/commands",
      "~/.claude/plugins/cache",
      "~/.claude/plugins/marketplaces",
      "~/.claude/settings.json"
    ],
    agents: (
      ($agents | map(. + {agent_source: "local"}))
      +
      ($plugin_agents | map(. + {agent_source: (
        if (._path // "" | test("/agents/[^/]+\\.md$")) then "plugin-root" else "plugin-nested" end
      )}))
      | map(select(.name != null and (has("name"))))
      | unique_by(.name + "::" + (.agent_source // "unknown"))
    ),
    skills: ($skills
      | map(. + {source: (if (._path // "" | startswith(env.HOME + "/.claude/skills/")) then "local" else "plugin" end)})
      | unique_by((.name // "unknown") + "::" + (.source // "unknown"))),
    commands: $commands,
    mcp_servers: $mcp_plugins.mcp_servers,
    enabled_plugins: $mcp_plugins.enabled_plugins,
    orchestration_patterns: ["A-single","B-parallel-explore","C-orchestrator-worker","D-pipeline","E-agent-teams","F-map-reduce"],
    model_tiers: {orchestrator: "opus", reviewer: "sonnet", research: "haiku"}
  }' > ~/.claude/tools-inventory.json.tmp && mv ~/.claude/tools-inventory.json.tmp ~/.claude/tools-inventory.json
```

Atomic write: `.tmp` + `mv`. No concurrent reader sees a half-written file.

### Step 7 — Cleanup + summary

```bash
rm -f /tmp/inventory-agents.jsonl /tmp/inventory-plugin-agents.jsonl /tmp/inventory-skills.jsonl /tmp/inventory-commands.jsonl
na=$(jq '.agents | length' ~/.claude/tools-inventory.json)
ns=$(jq '.skills | length' ~/.claude/tools-inventory.json)
nc=$(jq '.commands | length' ~/.claude/tools-inventory.json)
nm=$(jq '.mcp_servers | length' ~/.claude/tools-inventory.json)
np=$(jq '.enabled_plugins | length' ~/.claude/tools-inventory.json)
echo "Inventory: $na agents, $ns skills, $nc commands, $nm MCP servers, $np plugins."
echo "Cache: ~/.claude/tools-inventory.json (generated_at $(jq -r '.generated_at' ~/.claude/tools-inventory.json))."
```

## Hard rules

- **Main session only.** Do NOT run this from a background subagent — agent/skill files under `~/.claude/` are attacker-influenceable via prompt injection, and scanning them in a background context bypasses the permission UI.
- **Read-only against the filesystem** except for writing `~/.claude/tools-inventory.json` (+ its `.tmp`) and the `/tmp/inventory-*.jsonl` staging files.
- **No network.** No `curl`, no `gh api`, no package manager lookups.
- **No secrets in output.** Only env var *names* are recorded (via `jq | keys`), never values.
- **No shell interpolation of file contents.** All frontmatter parsing goes through `~/.claude/bin/scan-tooling-parse.py`, which is stdlib Python — no `eval`, no `exec`, no shell. Values are passed into jq via `--slurpfile` or `--argjson`, never via shell concatenation.
- **Atomic writes.** Always `.tmp` then `mv`.
- **Staleness is filesystem-mtime-only** via `find -newer`. No per-file mtime map is persisted in the JSON — the cache file's own mtime is the sole source of truth. This is portable and POSIX.
- **Python3 is required.** Stock on macOS (`/usr/bin/python3`, 3.9+) and every supported Linux distro. No external deps (no PyYAML, no yq).

## Invoked by

- `loop-plan` Phase 3b, which calls the same Bash steps inline after checking `find -newer <cache>`.
- Manual, by the user, after installing or removing agents, skills, plugins, or MCP servers.
