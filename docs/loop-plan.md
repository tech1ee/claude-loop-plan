# `/loop-plan` — Iterative Research-Driven Planner

`/loop-plan` is a 7-phase planning skill for [Claude Code](https://claude.ai/code) that enforces a research loop before any code is written. It explores your codebase, asks targeted questions, searches the internet with today's date, and writes a plan — then loops until you decide to ship.

## Table of contents

- [Quick start](#quick-start)
- [How the loop works](#how-the-loop-works)
- [Phase reference](#phase-reference)
- [Exit signals](#exit-signals)
- [Plan file structure](#plan-file-structure)
- [Architecture decisions (ADRs)](#architecture-decisions-adrs)
- [Resuming a plan](#resuming-a-plan)
- [Tips](#tips)
- [Example session](#example-session)

---

## Quick start

Open Claude Code and type:

```
/loop-plan <describe the feature or change>
```

Examples:

```
/loop-plan add a sync queue for offline-first editing
/loop-plan refactor the auth middleware to use JWT instead of sessions
/loop-plan add push notifications to the Android app
```

The skill announces the phases as it runs. At Phase 5 you choose: ship, loop for more research, ask more questions, or explore more of the codebase.

---

## How the loop works

```
Phase 0  ──→  Phase 1  ──→  Phase 2  ──→  Phase 3  ──→  Phase 4
 Seed         Explore        Clarify       Research       Plan
                                                            │
                                              ┌─────────────┘
                                              ↓
                                          Phase 5  (loop gate)
                                         ╱    │    ╲
                              Ship it   /     │     \ More questions
                                       /      │      \
                                Phase 6    Phase 3     Phase 2
                              Drift check  (again)     (again)
                                   │
                                   ↓
                               Phase 7
                               Execute
```

Each iteration through the loop refines the plan. You control when it's ready.

---

## Phase reference

### Phase 0 — Seed

Loop-plan derives a slug from your task statement, checks if a plan file already exists (for resume), and loads context:

- Global `CLAUDE.md` and project-level `CLAUDE.md`
- Accepted ADRs from `<project>/.claude/decisions/`
- Project state from the expertise vault (if configured)
- Tool inventory (agents, skills, commands available)

A plan file is created at `~/.claude/plans/<slug>.md`.

---

### Phase 1 — Codebase exploration

1–3 parallel read-only subagents explore different domains of your codebase simultaneously:

| Domain | What the subagent finds |
|--------|------------------------|
| **Similar features** | Existing implementations, execution paths, patterns you can follow or extend |
| **Architecture & deps** | Modules, interfaces, upstream/downstream consumers — zoom out first, then drill in |
| **Tests & edge cases** | Existing tests, error paths, corner cases already handled |

Each finding is verified with a citation verifier before being written to the plan — file paths and line numbers must be accurate.

Subagents also report two additional sections per touched file:
- **Refactoring candidates** — smells with risk level and suggested handling
- **Deepening opportunities** — shallow modules that hide too little complexity

> [!NOTE]
> The explorer subagents are read-only. They cannot modify files. If you're on a complex cross-cutting change, all 3 domains run in parallel. For a narrow config change, only 1 explorer runs.

---

### Phase 2 — Clarify gate

Claude asks only the questions that cannot be answered by reading the codebase. For new features on the first iteration, this includes:

1. **Longevity** — throwaway prototype, 1–2 year lifespan, or production core?
2. **Scale** — one internal caller, small team, or many teams / external API?
3. **Centrality** — core module used everywhere, or a leaf module?
4. **Rigor** — Minimal · TDD-only · Full

The rigor choice gates the downstream review pipeline. Most tasks use **TDD-only** (the default). **Full** adds refactoring assessment and 11-dimension code review. **Minimal** skips the review pipeline entirely.

> [!TIP]
> If you find Claude asking too many questions, answer the ones that matter and tell it to proceed. The question limit is 2 `AskUserQuestion` calls per loop iteration.

---

### Phase 3 — Internet research

Date-strict research using context7 + WebSearch. Claude actively filters out results older than 60 days for fast-moving APIs and frameworks.

Research covers:
- Current best practices and patterns for the technology involved
- Library-specific API changes (context7 for official docs)
- Known pitfalls and anti-patterns (GitHub issues, Stack Overflow, HN)
- Alternative approaches and their trade-offs

Findings are written to the plan with source URLs and dates.

> [!IMPORTANT]
> The "date-strict" rule means Claude won't rely on training data for library APIs. It always fetches current docs. This prevents plans built on deprecated APIs or patterns that changed in recent versions.

---

### Phase 4 — Plan

The plan is written to `~/.claude/plans/<slug>.md` with:

- **Tasks** — each with test assertions, target files, and line references
- **Test specs** — explicit: what file, what function, what assertions
- **Architecture decisions** — MADR-style ADRs auto-created for significant choices
- **Orchestration design** — which agents handle which tasks, and in what order
- **Tech-debt deferrals** — smells identified in Phase 1 that won't be addressed now

Every architecture decision cites at least one principle from the project's code of conduct.

---

### Phase 5 — Loop gate

```
╔══════════╦══════════════════╦═════════════════╦═══════════════════╗
║ Ship it  ║  More research   ║  More questions  ║  More exploration ║
╚══════════╩══════════════════╩═════════════════╩═══════════════════╝
```

This is the moment you decide. Review the plan in `~/.claude/plans/<slug>.md`, then:

- **Ship it** → proceeds to Phase 6 drift check, then execution
- **More research** → back to Phase 3 with a refined query
- **More questions** → back to Phase 2 for follow-up clarifications
- **More exploration** → back to Phase 1 to explore a specific code area

---

### Phase 6 — Drift check

Before execution, Claude verifies:

1. Every task maps to the goal stated in Phase 2
2. Research findings are cited in the tasks that use them
3. All accepted ADRs are respected or explicitly superseded
4. Test specs are complete (file + function + assertions)
5. No task's scope exceeds what was agreed in Phase 2

If drift is found, the loop returns to Phase 5 for another iteration.

---

### Phase 7 — Execute

`ExitPlanMode` is called and subagent-driven execution begins. Each task runs through:

1. **Implementer** (Opus 4.7) — writes the code per the task spec
2. **Test runner** — verifies tests pass
3. **Spec-reviewer** — confirms implementation matches the plan spec
4. **Code-quality-reviewer** — 11-dimension quality check
5. Re-review if either reviewer returns NEEDS_REWORK

---

## Exit signals

Say any of these at the Phase 5 gate to begin execution:

| English | Russian |
|---------|---------|
| `ship it` | `поехали` |
| `go` | `начинай` |
| `let's build` | `погнали` |
| `start working` | |
| `looks good` | |
| `build it` | |

---

## Plan file structure

```markdown
# Add sync queue for offline-first editing — Loop Plan

**Status:** draft — iteration 2
**Created:** 2026-05-20
**Loop skill:** loop-plan v1

## Task statement
add a sync queue for offline-first editing

## Goal & success criteria
**Goal:** Offline edits queue and sync reliably when connectivity returns
**Success criteria:**
- Edits made offline appear in the queue within 50ms
- Queue drains within 3s of reconnection
- Zero data loss across process restart

## Exploration findings
...

## Clarifications
...

## Research findings
...

## Plan
### Task 1 — Create SyncQueue data class
...

## Architecture & clean-code design
...

## Test plan
...

## Drift check
...
```

---

## Architecture decisions (ADRs)

Loop-plan auto-creates ADRs for significant architecture choices made during Phase 2. ADR files are written to `<project>/.claude/decisions/` in MADR 4.0.0 format.

```bash
# View all ADRs for a project
~/.claude/bin/new-adr.py list --root <project>

# Output:
# 0001 | accepted  | Use Room over SQLite directly
# 0002 | proposed  | Queue persistence strategy
# 0003 | accepted  | Eventual consistency model
```

ADRs created during planning start with status `proposed`. They flip to `accepted` when the associated task passes all review gates in Phase 7.

---

## Resuming a plan

Plans save state between sessions. If you close Claude Code mid-loop:

```
/loop-plan add a sync queue for offline-first editing
```

Claude Code will detect the existing plan file and resume from the last completed phase.

State is stored at `~/.claude/plans/<slug>.state.json`. To start fresh instead:

```bash
rm ~/.claude/plans/add-sync-queue-for-offline-first*.{md,state.json}
```

---

## Tips

**Getting better exploration results:**
- Describe the task with the feature's domain language, not implementation language: "sync queue for offline-first editing" not "add a queue class to SyncManager.kt"
- If Phase 1 misses something important, use "More exploration" at the Phase 5 gate and say what specifically to look for

**Getting better research results:**
- If research missed a specific library or pattern, use "More research" at Phase 5 and name what to research
- Date-strict research sometimes misses older but still-relevant patterns — you can tell Claude to include pre-2025 sources for stable APIs

**Getting better plans:**
- After Phase 4, read the plan file before reaching the Phase 5 gate — Claude will show you where it is
- Use "More questions" if you notice a decision was made that you'd have answered differently in Phase 2
- The loop is designed to iterate — 2–3 iterations is normal for complex features

**Rigor guidance:**
- **Minimal** — config changes, documentation, very small targeted edits
- **TDD-only** (default) — most features and bug fixes, enforces test specs
- **Full** — APIs, shared libraries, security-sensitive code, anything many callers depend on
