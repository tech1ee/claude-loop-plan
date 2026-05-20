# Contributing

Thanks for wanting to improve loop skills. Contributions are welcome — bug fixes, skill improvements, new agents, and documentation.

## Setup

```bash
git clone https://github.com/tech1ee/claude-loop-plan
cd claude-loop-plan
npm install
npm run build
npm test
python3 test/check-unicode.test.py
python3 test/check-skill-safety.test.py
python3 test/generate-checksums.test.py
```

All of these must pass before opening a PR.

---

## Types of contributions

### Skill content improvements

The most valuable contributions. If a phase produces bad output for your use case, open a [skill improvement issue](https://github.com/tech1ee/claude-loop-plan/issues/new?template=skill_improvement.yml) first — describe what broke and what should have happened. This helps narrow down which phase and what kind of fix is needed.

Skill files live in:
- `skills/loop-plan/SKILL.md` + `skills/loop-plan/references/`
- `skills/loop-debug/SKILL.md` + `skills/loop-debug/references/`

After editing skill content, regenerate checksums:

```bash
python3 ci/generate-checksums.py
```

### New agents

Add a Markdown file to `agents/`. Follow the existing agent format — frontmatter with `name`, `description`, and `model`, then the agent's system prompt.

After adding an agent, regenerate checksums:

```bash
python3 ci/generate-checksums.py
```

### Installer changes

Source is in `src/install.ts`. Tests are in `test/installer.test.ts`.

After changes:

```bash
npm run build
npm test
```

The installer must:
- Never run automatically on `npm install` (no `postinstall`)
- Only write to `~/.claude/` — no system directories, no root required
- Show every file write before it happens
- Ask for confirmation before overwriting existing files (unless `--force`)

### CI script changes

Scripts are in `ci/`. Tests are in `test/`. The CI scripts are Python 3.8+ compatible — no dependencies outside the standard library.

---

## CI gates

All 6 gates must pass before merge:

| Gate | Command | What it checks |
|------|---------|----------------|
| **Privacy grep** | (in CI YAML) | No `/Users/<name>/` paths or private vault refs in shipped files |
| **Hidden Unicode** | `python3 ci/check-unicode.py skills/ agents/` | No bidi/invisible/lookalike characters |
| **Shell safety** | `python3 ci/check-skill-safety.py skills/ agents/` | No dangerous shell commands in skill blocks |
| **Checksum freshness** | `python3 ci/generate-checksums.py && git diff checksums.txt` | checksums.txt must be current |
| **Node.js tests** | `npm test` | Installer behavior tests (Node 18, 20, 22) |
| **Python tests** | `python3 test/check-*.test.py && python3 test/generate-checksums.test.py` | CI script unit tests |

The privacy grep gate rejects:
- `/Users/<name>/` — personal absolute paths
- `vault-projects.json` — personal project mapping
- `rules/personal-paths.md` — personal paths config

Skills may legitimately reference `~/Documents/expertise/` as an optional vault integration path — that's documented behavior, not a private file.

---

## What ships in the package

The npm package includes:

```
dist/src/install.js   compiled installer (bin entry)
skills/               skill Markdown files + references
agents/               agent Markdown files
bin/                  Python helper scripts
commands/             slash-command Markdown files
checksums.txt         SHA-256 integrity manifest
```

The package does **not** include:

```
src/           TypeScript source
test/          test files
ci/            CI scripts
dist/test/     compiled test files
node_modules/
```

---

## Releasing

1. Bump `version` in `package.json`
2. Update `CHANGELOG.md` with the new version entry
3. Regenerate checksums: `python3 ci/generate-checksums.py`
4. Commit: `git commit -m "chore: release vX.Y.Z"`
5. Tag: `git tag vX.Y.Z && git push && git push origin vX.Y.Z`

The release workflow runs automatically on `v*` tags. It:
- Runs all CI gates
- Regenerates checksums
- Publishes to npm with provenance (`--provenance`)
- Creates a GitHub release with `checksums.txt` attached

Publishing requires membership in the `@loopskills` npm organization.
