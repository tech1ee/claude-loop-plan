---
name: loop-audit
description: Audit loop skills, agents, chains, and project orchestration for correctness, portability, safety, and useful verification. Produces findings first and applies fixes only with explicit approval.
---

# Loop Audit for Pi

Use this when auditing an agent harness or its planning/debugging skills.

## Contract

- Inspect the actual package, loaded skills, agent definitions, chains, scripts, and tests.
- Separate findings into correctness, portability, safety, usability, and validation.
- Cite exact file paths and line ranges. Classify severity: blocker, high, medium, low.
- Do not edit during the audit pass. After presenting findings, ask whether to apply the accepted fixes.
- Never run untrusted repository scripts merely because they are documented; inspect them first.

## Audit sequence

1. Map package metadata and discovery rules for the current host (Pi package manifest, `skills/`, `.pi/agents/`, `.pi/chains/`, extensions, and settings).
2. Check every skill for tool/lifecycle assumptions unavailable in Pi: Claude-only tools, slash commands, hidden state paths, unsupported frontmatter, and claims of automatic execution.
3. Check orchestration: distinct read-only versus writer roles, one-writer rule, model/provider assumptions, timeout/stop conditions, error propagation, and user approval gates.
4. Check safety: prompt-injection resistance, shell quoting, path traversal, destructive commands, secret exposure, network/research claims, and whether tests can actually fail.
5. Check references and docs for broken links, contradictory phase names, stale versions, unreachable gates, and mismatch between packaged files and tests.
6. Run only safe, focused validation after inspection: build, unit tests, package dry-run, static scans, and documented checksum checks. Record skipped commands and why.

## Required report

```text
Summary: <one paragraph>

Blockers
- [severity] path:line — evidence; impact; smallest fix

Portability
Safety
Workflow correctness
Validation gaps

Recommended patch order
1. ...

Commands run
- command — result
```

After the user approves a patch set, use one writer (`worker`) or the parent session to apply it. Re-run the relevant tests and a fresh audit. Do not broaden the patch to unrelated product behavior.
