# Claude Loop Skills

**loop-plan** and **loop-debug** for [Claude Code](https://claude.ai/code) — a research-first iterative planner and a systematic debugger, delivered as a single npm package.

```
npx @loopskills/claude-skills
```

## What you get

| Skill | Invoke | What it does |
|---|---|---|
| **loop-plan** | `/loop-plan` | 7-phase iterative planner: explores codebase → asks clarifying questions → researches the internet → writes a plan → loops until you say "ship it" |
| **loop-debug** | `/loop-debug` | 7-phase debugger: reproduces the bug as a failing test → investigates root cause → researches fix patterns → plans T0a regression + T-fix + T0b prevention → loops until resolved |

## Install

Requires Node.js ≥18. No global install needed — `npx` works:

```bash
npx @loopskills/claude-skills
```

Or install globally for the `claude-skills` command:

```bash
npm install -g @loopskills/claude-skills
claude-skills
```

The interactive installer lets you choose which skills and supporting agents to include. All files go into `~/.claude/` — nothing else is touched.

## Update

```bash
claude-skills update
```

Or update the package and re-run the installer:

```bash
npm install -g @loopskills/claude-skills@latest
claude-skills --force
```

## Usage

After install, open Claude Code and type:

- `/loop-plan` — start a planning session for a new feature or significant change
- `/loop-debug` — start a debugging session for a non-trivial bug

Both skills loop through research and questions until you choose "Ship it" to begin execution.

## Verify integrity

Every release ships a `checksums.txt`. Verify your install matches:

```bash
# In the npm package directory (or download from the GitHub release)
sha256sum -c checksums.txt
```

## Uninstall

```bash
claude-skills uninstall
```

## How it works

See [docs/how-it-works.md](docs/how-it-works.md) for the phase-by-phase breakdown.

## Supporting agents

The installer optionally installs agents that loop-plan's orchestration pipeline uses:

| Agent | Role |
|---|---|
| `spec-reviewer` | Verifies implementation matches the plan spec |
| `code-quality-reviewer` | 11-dimension code quality gate |
| `research-agent` | 5-step methodology research |
| `test-runner` | Runs test suites + mutation testing |
| `second-opinion` | Cross-model Codex review (requires `OPENAI_API_KEY`) |
| `android-kmp-explorer` | Android/KMP/Compose codebase exploration |
| `swiftui-explorer` | iOS/SwiftUI codebase exploration |

## License

MIT
