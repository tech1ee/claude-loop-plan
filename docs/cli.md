# CLI Reference

The `loop-skills` command manages the Claude Code installation. The same npm package is also a native Pi package. `claude-skills` remains an alias for compatibility with older installs.

## Pi installation

Install globally or per project with Pi:

```bash
pi install npm:@loopskills/loop-skills
# local checkout:
pi install /absolute/path/to/loop-skills
```

Pi loads the native skills `loop-plan`, `loop-debug`, and `loop-audit` from `skills/pi/`. They use Pi's `subagent` tool, work with the active OpenAI model, store plans under `.pi/plans/`, and require explicit approval before implementation. The package also provides `loop_progress`, `loop_inventory`, and `loop_evidence` tools for live checkpoints, capability discovery, and source-backed adaptive investigation. Pi package updates are managed by Pi:

```bash
pi update --extensions
```

The Claude Code installer below remains available for `~/.claude/` users.

## Commands

### Default — run the installer

```bash
npx @loopskills/loop-skills
# or
loop-skills
```

Launches the interactive installer. Prompts for which skills and agents to install, shows each file write before it happens, and confirms before overwriting existing files.

---

### `update`

```bash
loop-skills update
```

Updates to the latest version by running `npm install -g @loopskills/loop-skills@latest`, then re-runs the installer with `--force` to overwrite existing files.

---

### `list`

```bash
loop-skills list
```

Shows installed skills, their versions, and install timestamps from `~/.claude/skills/.install-receipt.json`.

Example output:

```
Installed skills:
  loop-plan      v0.1.0  (installed 2026-05-20)
  loop-debug     v0.1.0  (installed 2026-05-20)

Installed agents:
  spec-reviewer
  code-quality-reviewer
  research-agent
  test-runner
  second-opinion
  android-kmp-explorer
  swiftui-explorer

Package: @loopskills/loop-skills v0.1.0
```

---

### `verify`

```bash
loop-skills verify
```

Re-verifies SHA-256 checksums of all installed files against `checksums.txt` from the package. Reports any files that have been modified since install.

Example output:

```
Verifying 38 files...
✓ skills/loop-plan/SKILL.md
✓ skills/loop-debug/SKILL.md
✓ agents/spec-reviewer.md
... (all files)
All checksums match.
```

---

### `uninstall`

```bash
loop-skills uninstall
```

Removes all files that were installed. Shows the list of files to be deleted and asks for confirmation before proceeding.

> [!NOTE]
> Uninstall only removes files that were installed by the installer (tracked in the install receipt). It will not remove files you added manually to `~/.claude/`.

---

## Flags

### `--dry-run`

```bash
loop-skills --dry-run
loop-skills --dry-run --skills loop-plan
```

Shows exactly what would be installed without writing any files. Use to preview a fresh install or upgrade.

---

### `--force`

```bash
loop-skills --force
```

Skips the conflict confirmation prompt. Overwrites existing files without asking. Used by `loop-skills update` internally.

---

### `--skills <list>`

```bash
loop-skills --skills loop-plan
loop-skills --skills loop-plan,loop-debug
```

Install only the specified skills (comma-separated). Skips the interactive skill selection prompt.

Valid values: `loop-plan`, `loop-debug`

---

### `--no-agents`

```bash
loop-skills --no-agents
loop-skills --skills loop-plan --no-agents
```

Skip agent installation entirely. Installs only the skill files (SKILL.md + references).

---

### `--no-bin`

```bash
loop-skills --no-bin
```

Skip installation of Python helper scripts to `~/.claude/bin/`. The bin scripts are optional — the skills work without them, but some features (ADR management, test integrity, citation verification) won't be available.

---

## Environment variables

### `NO_UPDATE_NOTIFIER=1`

Suppresses the non-blocking update check that runs on every install.

```bash
NO_UPDATE_NOTIFIER=1 loop-skills
```

### `CI=1`

When set (automatically in GitHub Actions and most CI systems), suppresses the update check and disables interactive prompts. The installer exits with an error if it would need to prompt for anything — use `--force` or `--skills` flags to make the install non-interactive.

---

## Non-blocking update check

On every run (unless `NO_UPDATE_NOTIFIER=1` or `CI=1`), the installer performs a background update check:

1. Reads a 24-hour TTL cache at `~/.claude/skills/.update-check.json`
2. If stale, fires a `fetch()` to the npm registry dist-tags endpoint
3. If a newer version is available, prints a one-line notice after the install completes

The check is fire-and-forget — it never blocks the install. The cache prevents unnecessary network requests.

```
╭──────────────────────────────────────────────────────╮
│  Update available: v0.1.0 → v0.2.0                   │
│  Run: loop-skills update                           │
╰──────────────────────────────────────────────────────╯
```

---

## Install receipt

After every successful install, a receipt is written to `~/.claude/skills/.install-receipt.json`:

```json
{
  "version": "0.1.0",
  "installed_at": "2026-05-20T14:32:00Z",
  "skills": ["loop-plan", "loop-debug"],
  "agents": ["spec-reviewer", "code-quality-reviewer"],
  "checksums": {
    "skills/loop-plan/SKILL.md": "sha256:abc123...",
    "skills/loop-debug/SKILL.md": "sha256:def456..."
  }
}
```

`loop-skills list` and `loop-skills verify` both read from this file.
