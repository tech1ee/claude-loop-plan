# Security Policy

## What the installer does

- Copies skill and agent Markdown files from this package into `~/.claude/skills/` and `~/.claude/agents/`.
- Copies bin scripts into `~/.claude/bin/` and sets them executable (`chmod 0755`).
- Writes an install receipt to `~/.claude/skills/.install-receipt.json`.
- Performs a non-blocking version check via `fetch()` to the npm registry. This is fire-and-forget and never blocks the install.

## What the installer does NOT do

- No `postinstall` script — nothing runs automatically on `npm install`.
- No network requests during skill file copying.
- No telemetry, analytics, or usage tracking of any kind.
- No writes outside `~/.claude/` (the install target directory is always confirmed before first write).
- No root / sudo privileges requested or required.

## Verifying a release

Every release attaches a `checksums.txt` to the GitHub release assets. Verify after install:

```bash
# Download checksums.txt from the release, then:
sha256sum -c checksums.txt
```

npm provenance records are attached to each published version (viewable on npmjs.com under the version's "Provenance" tab).

## Planned: Minisign signatures (v0.2.0)

Release binaries will be signed with [minisign](https://jedisct1.github.io/minisign/) starting in v0.2.0. The public key will be pinned in this file once established.

## Reporting a vulnerability

Open a [GitHub Security Advisory](../../security/advisories/new) (private disclosure). We aim to respond within 72 hours.

For lower-severity issues (false positives in CI scripts, documentation errors), a regular GitHub issue is fine.

## Scope

The CI scripts (`ci/check-unicode.py`, `ci/check-skill-safety.py`, `ci/generate-checksums.py`) are in scope. They run on skill content before it ships — bypassing them would allow malicious skills to reach users.

Out of scope: the npm registry infrastructure itself, GitHub Actions infrastructure, issues in third-party dependencies (report those upstream).
