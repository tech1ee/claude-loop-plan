# Decision tracking — Phase 0/2/7c reference

Loaded on demand by loop-plan when a project has `<project>/.claude/decisions/` or when Phase 2 surfaces an architecture-tagged clarification.

## Storage layout

| Where | What | Committed? | Loaded by |
|---|---|---|---|
| `<project>/.claude/decisions/NNNN-<slug>.md` | Project ADRs (MADR 4.0.0 minimal) | yes | Phase 0 (summary), Phase 4 (full body on demand) |
| `<project>/.claude/decisions/INDEX.md` | Auto-generated table of ADR-ID / status / title | yes | imported by `<project>/.claude/CLAUDE.md` |
| `~/.claude/projects/<hash>/journal/<YYYY-MM-DD>.md` | Free-form personal notes / observations | no (machine-local) | not loaded into plans |
| `~/.claude/patterns/<domain>/<name>/PATTERN.md` | Cross-project promoted patterns | yes | Phase 4 (manual pattern check) |
| `~/.claude/patterns/.projects-registry` | List of project roots that ran `init` | yes | `grep-patterns` subcommand |

ADR-0001 (storage hybrid) is the load-bearing decision behind this layout. ADR-0005 (immutability) is the load-bearing decision behind the append-only confirm flow.

## Phase 0 — load existing ADRs

If a `.git` directory is found by walking up from CWD, treat that as the project root. If `<project>/.claude/decisions/` exists:

```
~/.claude/bin/new-adr.py list --root <project-root>
```

Returns one line per ADR: `NNNN | status | title`. Store these as `state.project_decisions[]` summaries.

**Do NOT read ADR bodies upfront** — that blows the token budget. Read a body only when Phase 4 needs to cite or contradict the ADR.

## Phase 2 — auto-write from clarifications

After every `AskUserQuestion` answer, check the question's `header` field against the architecture whitelist (see [`design-and-quality.md`](design-and-quality.md) § Decision-detection heuristic).

If it matches:

```
~/.claude/bin/new-adr.py create --root <project-root> --slug <kebab> --title "<title from answer>"
```

Defaults to `status: proposed`. Record the new ADR-ID in `state.adrs_created[]` with `source_clarification_iteration: <N>`.

If the user is replacing an earlier decision, pass `--supersedes NNNN` instead — this writes a new ADR with the back-reference and flips the old ADR's `status` to `superseded by ADR-<new>`.

## Phase 4 — cite ADRs in tasks + check for cross-project candidates

Every task in `## Plan` must cite ≥1 ADR-ID. Tasks without an ADR are unjustified (Phase 6 drift rule 7).

For each architecture decision in this iteration, run:

```
~/.claude/bin/new-adr.py grep-patterns --slug "<topic keywords>"
```

Reads `~/.claude/patterns/.projects-registry` and scans each registered project's `.claude/decisions/`. If 3+ projects converge on the same approach, the helper prints a `CANDIDATE: ...` line. Surface the candidate in `## Architecture & clean-code design` for manual review. **Never auto-promote** (per ADR-0003 — manual curation).

## Phase 7c — append confirmation + accept

After each task passes spec-reviewer + code-quality-reviewer, for every ADR cited by that task:

```
~/.claude/bin/new-adr.py confirm --root <project-root> --id <NNNN> --outcome pass --note "<task title>"
~/.claude/bin/new-adr.py accept --root <project-root> --id <NNNN>
```

`confirm` appends a bullet under `## Confirmation`. `accept` flips `proposed → accepted` (idempotent — no-op if already accepted). Without the `accept` step, the architecture-compliance layer in `<project>/.claude/CLAUDE.md` would never trigger, since it respects only accepted ADRs.

If a task fails or the plan changes mid-execution, use `--outcome drift` instead.

## Hard rules (cite ADR-0005 immutability)

1. **An accepted ADR's body is never modified.** Only `status:` is mutable.
2. **The only allowed status mutations** are: `proposed → accepted` (via `accept`), `* → superseded by ADR-N` (via `--supersedes`).
3. **`confirm` is append-only** — adds one bullet under `## Confirmation`, never overwrites.
4. **To change a decision**, create a new ADR with `--supersedes NNNN`. Don't edit the old one.

## Project-CLAUDE.md wiring

`new-adr.py init --root <project>` writes a `<project>/.claude/CLAUDE.md` (if missing) containing the architecture-compliance snippet from [`~/.claude/templates/project-claude-md-snippet.md`](../../../templates/project-claude-md-snippet.md). The snippet ends with `@.claude/decisions/INDEX.md` so the ADR list is auto-loaded by Claude Code at session start.

This is the AI-enforced compliance loop (per Shing Lyu 2026-03-01): Claude reads ADRs at session start, treats accepted ones as hard constraints, and surfaces a `🚫 Architecture Violation: ADR-NNNN` warning when a proposed change contradicts an accepted ADR.
