# Contributing

## Setup

```bash
git clone https://github.com/loopskills/claude-loop-plan
cd claude-loop-plan
npm install
npm run build
npm test
python3 test/check-unicode.test.py
python3 test/check-skill-safety.test.py
python3 test/generate-checksums.test.py
```

## What ships in the package

The npm package includes:
- `dist/src/install.js` — compiled installer (bin entry)
- `skills/` — skill Markdown files
- `agents/` — agent Markdown files
- `bin/` — Python/shell helper scripts
- `commands/` — slash-command Markdown files
- `checksums.txt` — SHA-256 integrity manifest

The package does NOT include:
- `src/` — TypeScript source
- `test/` — test files
- `ci/` — CI scripts
- `dist/test/` — compiled test files
- Any personal paths, private vault references, or `~/.claude/rules/` content

## CI gates (all must pass before merge)

1. **Privacy grep** — no `/Users/<name>/` paths or private vault refs in shipped files
2. **Hidden Unicode scan** — `ci/check-unicode.py skills/ agents/`
3. **Shell-block safety** — `ci/check-skill-safety.py skills/ agents/`
4. **Checksum freshness** — `checksums.txt` must be current with `ci/generate-checksums.py`
5. **Node.js tests** — `npm test` on Node 18, 20, 22
6. **Python tests** — `python3 test/check-*.test.py && python3 test/generate-checksums.test.py`

## Updating skill content

Skill files live in `skills/loop-plan/` and `skills/loop-debug/`. Edit them directly — no build step needed. After editing, regenerate checksums:

```bash
python3 ci/generate-checksums.py
```

Verify no personal paths leaked:

```bash
python3 ci/check-unicode.py skills/ agents/
python3 ci/check-skill-safety.py skills/ agents/
```

## Releasing

1. Bump `version` in `package.json`.
2. Update `CHANGELOG.md`.
3. Regenerate checksums: `python3 ci/generate-checksums.py`.
4. Commit and push. Tag `vX.Y.Z`. The release workflow publishes to npm automatically.

The `@loopskills` npm org requires org membership to publish.

## Architecture decisions

See `.github/` for CI configuration. The installer has no `postinstall` hook by design — nothing runs automatically on `npm install`. All file writes happen after interactive confirmation (or `--force`).
