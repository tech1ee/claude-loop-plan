# state.json schema + resume protocol

Path: `~/.claude/plans/<slug>.state.json`

Sidecar file that lets a loop-plan session resume across Claude Code restarts, compactions, or explicit `/resume` commands.

## Schema

```json
{
  "slug": "offline-feed-caching",
  "version": 1,
  "created_at": "2026-04-15T13:22:00-07:00",
  "last_update_at": "2026-04-15T14:07:00-07:00",
  "task_statement": "Add offline caching to the feed screen with conflict resolution.",
  "iteration": 3,
  "current_phase": "5",
  "plan_path": "~/.claude/plans/offline-feed-caching.md",

  "exploration_history": [
    {
      "iteration": 1,
      "agents_dispatched": ["android-kmp-explorer", "swiftui-explorer"],
      "domains": ["similar-features", "architecture-and-deps", "tests-and-edge-cases"],
      "findings_summary": "1 paragraph per domain…",
      "timestamp": "2026-04-15T13:25:00-07:00"
    }
  ],

  "clarifications": [
    {
      "iteration": 1,
      "questions": [
        {
          "question": "Which screens need offline caching?",
          "header": "Scope",
          "multiSelect": true,
          "options": ["Feed only", "Feed + profile", "All screens"],
          "answer": "Feed + profile"
        }
      ],
      "timestamp": "2026-04-15T13:28:00-07:00"
    }
  ],

  "research_history": [
    {
      "iteration": 2,
      "queries_fired": 8,
      "sources_verified": 12,
      "sources_rejected": 5,
      "reject_reasons": ["undated", "pre-2025-10", "undated"],
      "findings_file": "~/.claude/plans/offline-feed-caching.md#research-findings-iteration-2",
      "timestamp": "2026-04-15T13:50:00-07:00"
    }
  ],

  "loop_gate_history": [
    {
      "iteration": 1,
      "choice": "More research",
      "timestamp": "2026-04-15T13:35:00-07:00"
    },
    {
      "iteration": 2,
      "choice": "More clarification",
      "timestamp": "2026-04-15T14:01:00-07:00"
    }
  ],

  "drift_check": null,
  "drift_check_overrides": [],

  "exit_signal": null,
  "exit_signal_source": null,

  // Deprecated 2026-04-28 (ADR-0018) — compact gate removed.
  // Old state files may still carry these; new ones omit them.
  // "awaiting_compact": false,
  // "compact_handoff_at": null,
  // "compact_verified_at": null,

  "execution": {
    "started_at": null,
    "completed_at": null,
    "tasks_completed": [],
    "blockers": [],
    "agents_dispatched": [],
    "execution_log_path": null
  },

  "constitution_consulted": false,
  "constitution_path": null,

  "project_decisions": [
    {
      "adr_id": "0001",
      "status": "accepted",
      "title": "Use Koin for DI"
    }
  ],

  "adrs_created": [
    {
      "adr_id": "0007",
      "slug": "use-room-3-for-persistence",
      "status": "proposed",
      "source_clarification_iteration": 2,
      "skipped": false
    }
  ],

  "pattern_candidates": [
    {
      "pattern_slug": "event-sourcing-for-decisions",
      "source_adrs": ["projA/0003", "projB/0007", "projC/0012"],
      "project_count": 3
    }
  ],

  "rigor": "tdd-only",

  // ── Goal-fidelity fields (ADR-NEW-C, added 2026-05-23) ──────────────────
  "goal": "Make the loop skills reliably achieve and validate their stated goal.",

  "success_criteria": [
    "SC1. <observable criterion — measurable, no placeholder>",
    "SC2. ..."
  ],

  "must_haves": {
    "truths": [
      "<observable statement that must be true in the codebase — behavioral, checkable>"
    ],
    "artifacts": [
      { "path": "<file path>", "provides": "<what it must contain/do>" }
    ],
    "key_links": [
      { "from": "<A>", "to": "<B>", "via": "<mechanism — e.g. import, settings.json entry, CLI call>" }
    ]
  },

  "verification": {
    "status": null,
    "score": null,
    "gaps": []
  },

  "stages": [
    {
      "id": "stage-1",
      "exit_criteria": ["<measurable criterion — what must be true before stage-2 can begin>"],
      "verification": null
    }
  ],
  // ────────────────────────────────────────────────────────────────────────

  "tests_state": [
    {
      "task_id": "T7",
      "test_files": ["src/foo/test_bar.py"],
      "red_confirmed_at": "2026-04-28T13:42:00-07:00",
      "snapshot_at": "2026-04-28T13:43:00-07:00",
      "green_confirmed_at": "2026-04-28T13:50:00-07:00",
      "tamper_detected": false,
      "mutation_score": 0.85,
      "mutation_threshold_high": 0.80,
      "mutation_threshold_low": 0.60,
      "mutation_threshold_break": 0.50,
      "mutation_tier_result": "high"
    }
  ],

  "date_filter": {
    "cutoff": "2025-10-01",
    "current_year_tag": "2026",
    "allowed_domains_default": [
      "arxiv.org", "github.com", "code.claude.com", "claude.com",
      "anthropic.com", "platform.claude.com", "docs.claude.com"
    ]
  },

  "last_active_at": "2026-05-09T13:32:00-07:00",
  "completion_state": "active",
  "gap_acknowledged": [
    {
      "phase": "3",
      "iteration": 2,
      "reason": "research-agent stalled at 600s",
      "fallback": "inline WebSearch x2",
      "timestamp": "2026-04-29T11:00:00-07:00"
    }
  ]
}
```

## Field semantics

- `slug` — same as the plan file stem. Derived from task_statement in Phase 0.
- `version` — schema version. Currently `1`. Bump when schema changes.
- `iteration` — current loop iteration, 1-based.
- `current_phase` — one of `"0"`, `"1"`, `"2"`, `"3"`, `"3b"`, `"4"`, `"5"`, `"6"`, `"7a"`, `"7b"`, `"done"`, `"aborted"`. String, not int, because `/` is a future expansion point. **Phase 3b transition:** set `current_phase = "3b"` on entry. On successful completion (tool inventory fresh and query-ready), advance to `"4"`. If the scan-tooling steps fail mid-way, keep `current_phase = "3b"` and add an optional `"3b_status": "failed"` field with the error message — the resume protocol prompts the user to retry or skip. **Phase 7 transitions:** `"7a"` after Phase 6 clears (summary written, ExitPlanMode called); `"7b"` after user approves and autonomous execution begins (compact handoff removed per ADR-0018); `"done"` after the last task in the DAG passes its gate. State files written before 2026-04-28 may carry the legacy `"7c"` value plus `awaiting_compact: true` — treat both as equivalent to `"7b"` and proceed.
- `exploration_history` — append-only, never rewritten. Lets you see what each iteration explored.
- `clarifications` — append-only. Contains the exact questions and answers.
- `research_history` — append-only. Tracks query counts, acceptance/rejection stats, and where findings were written.
- `loop_gate_history` — append-only. Every Phase 5 choice by the user, timestamped.
- `drift_check` — null until Phase 6 runs. Then `"clean"` or `"drift"` with a nested report object.
- `drift_check_overrides` — empty array unless the user chose "Ship anyway". Each entry has timestamp + category + justification.
- `exit_signal` — null until exit. Then the text that triggered exit (`"Ship it"` from the gate, or the matched keyword, or `"/abort"`).
- `exit_signal_source` — one of `"gate"`, `"keyword"`, `"abort"`, `"drift_override"`.
- `constitution_consulted` — boolean. True if a project-local `.claude/constitution.md` was found and read in Phase 0.
- `project_decisions` — array of `{ adr_id, status, title }` summaries loaded at Phase 0 from `<project>/.claude/decisions/` via `new-adr.py list`. Bodies are read on demand at Phase 4. Empty when no project root or no `.claude/decisions/`.
- `adrs_created` — array of `{ adr_id, slug, status, source_clarification_iteration, skipped, reason? }` for ADRs auto-created in Phase 2 of the current loop. `skipped: true` indicates the heuristic matched but the create was deliberately not performed (e.g. no project root); include `reason` then.
- `pattern_candidates` — array of `{ pattern_slug, source_adrs, project_count }` surfaced by Phase 4 / Phase 7b via `new-adr.py grep-patterns`. Manual review only — never auto-promoted (per ADR-0003).
- `tests_state` — append-only per Phase 7c task. Tracks RED→GREEN→verify→mutation progress for audit + resume. Cite ADR-0010 (per-task test specs) + ADR-0009 (mutation gate). Fields per task: `task_id`, `test_files[]`, `red_confirmed_at` (ISO ts at step 2), `snapshot_at` (step 3), `green_confirmed_at` (step 5), `tamper_detected` (boolean from step 6 verify), `mutation_score` (0.0–1.0 OR string `"skipped — budget exceeded (15 min)"` / `"skipped — no tool for stack"`), `mutation_threshold_high`, `mutation_threshold_low`, `mutation_threshold_break` (per ADR-0009 tiered model), `mutation_tier_result` (`"high"` | `"low"` | `"break"` | `"skipped"`). Empty array when `state.rigor == "minimal"` (no TDD pipeline runs) or for plans with all-opt-out tasks.
- `goal` — the task statement distilled to a single outcome sentence. Set at Phase 2 when `must_haves` is captured (ADR-NEW-C). Nullable for backward compat; treated as "not captured" by loop-verifier when null.
- `success_criteria[]` — observable, measurable criteria derived from the user's stated goal + Phase 2 clarifications. Each entry is a complete sentence with a checkable predicate (no "should be better", no "good performance"). HARD GATE: loop-plan **cannot leave Phase 2** if any entry is a placeholder or non-observable. Set alongside `must_haves` (ADR-NEW-C).
- `must_haves` — three-part goal contract consumed by `loop-verifier` at each stage gate (ADR-NEW-C). **truths[]**: observable behavioral claims that must be true in the codebase. **artifacts[]**: concrete files that must exist with a specific `provides` predicate. **key_links[]**: wiring connections that must be verified (`from → to via mechanism`). The `loop-verifier` agent runs a 4-level artifact check + behavioral probes against this contract — never against the executor's narration.
- `verification` — tri-state result from the latest `loop-verifier` run. `status`: one of `passed | gaps_found | human_needed | null`. `score`: `<verified>/<total>` truths. `gaps[]`: structured YAML produced by `loop-verifier` when `status == gaps_found`. `state.completion_state` may only be set to `"shipped"` when `verification.status == "passed"` (or `"human_needed"` with explicit user sign-off) — ADR-NEW-C.
- `stages[]` — array of stage-boundary objects for multi-stage plans. Each stage has `id` (string), `exit_criteria[]` (measurable), and `verification` (the `loop-verifier` verdict object for that stage, null until verified). Stage N+1 execution MUST NOT begin until `stages[N].verification.status == "passed"` or signed-off `human_needed` — ADR-NEW-C.
- `rigor` — one of `"minimal" | "tdd-only" | "full"`. Set at Phase 2 Q0 by the user (cite ADR-0015). **MUST be written to disk immediately after the Q0 answer comes back, BEFORE any Phase 2 Q1+ AskUserQuestion fires** (cite ADR-0021 for the persistence contract — observed null-rigor rate was 92.5% before this fix). If the write fails, retry once; if still failing, surface to user — do not advance with `rigor: null`. **Phase 2 entry-check:** if `state.rigor` is null AND `iteration > 1`, the state was lost between iterations — re-fire Q0 to recover. Consulted by Phase 1 (refactoring-candidates report — eager-computed, discarded if not full), Phase 4 (Architecture / Test plan / § 5b emission branching), Phase 6a (drift rules 10–13 applicability), Phase 7b (TDD pipeline + mutation-floor check). Defaults to `"tdd-only"` if user provides no answer at Q0 (per ADR-0015). Never mutated after Phase 2; persists across loop iterations 2+.
- `date_filter` — the active date filter config. Baseline comes from `references/date-filter.md`. Can be overridden by the user if a topic legitimately requires older sources.
- `last_active_at` — ISO 8601 timestamp of the most recent state.json write. Touched on every state write across all phases. Used by `/loop-plan-audit` (cite ADR-0021) to flag stale plans (>14 days idle, `current_phase ≤ "5"`). Optional for backward compat — pre-2026-05-09 state files lack this field; audit treats them as "unknown" until they're touched again.
- `completion_state` — explicit terminal state: `"active"` while looping (default); `"shipped"` when all DAG tasks pass at Phase 7b; `"aborted"` on user `/abort`; `"abandoned"` set by `/loop-plan-audit --mark-abandoned` when `last_active_at > 14 days ago` AND `current_phase ≤ "5"`. Optional for backward compat — pre-2026-05-09 state files default to `"active"` when read. Cite ADR-0021.
- `gap_acknowledged` — append-only log of subagent stalls + inline fallbacks. Each entry: `{phase, iteration, reason, fallback, timestamp}`. Formalizes what was previously narrative-only in plan markdown (e.g. "research-agent stalled at 600s; used inline WebSearch x2 instead"). Read by `/loop-plan-audit` to surface stall patterns. Cite ADR-0021.

## Resume protocol

When loop-plan is invoked with a slug that already has a `state.json`:

1. Read `state.json`.
2. Read the plan file at `state.plan_path`.
3. Announce: "Resuming `<slug>` from iteration `<N>`, phase `<P>`. Last action: `<most recent loop_gate_history entry>`."
4. Ask the user: *"Resume from phase `<P>`, restart the current iteration, or start fresh?"* (AskUserQuestion, 3 options).
5. Honor their choice:
   - **Resume** → jump directly to `state.current_phase`
   - **Restart iteration** → rewind to Phase 1 of the current iteration
   - **Start fresh** → back up `state.json` to `state.json.bak-<timestamp>`, create a new state, start at Phase 0

## Atomic write pattern

State updates must be atomic to survive crashes:

```bash
# Write to a temp file, then mv. mv is atomic on POSIX.
jq '. + $new_fields' ~/.claude/plans/<slug>.state.json > ~/.claude/plans/<slug>.state.json.tmp
mv ~/.claude/plans/<slug>.state.json.tmp ~/.claude/plans/<slug>.state.json
```

Do NOT do `> ~/.claude/plans/<slug>.state.json` — if Claude Code crashes mid-write, you lose the file.

## What NOT to put in state.json

- Raw subagent transcripts (they go in the plan file or nowhere)
- Verbatim research quotes (the plan file already has them, citation lives there)
- User free-text messages that weren't answers to an AskUserQuestion
- Anything sensitive (state.json is plaintext, no encryption)

## Inspecting state.json from the shell

Useful one-liners:

```bash
# Current phase
jq -r '.current_phase' ~/.claude/plans/<slug>.state.json

# Iteration count
jq -r '.iteration' ~/.claude/plans/<slug>.state.json

# Last loop gate choice
jq -r '.loop_gate_history[-1].choice // "none yet"' ~/.claude/plans/<slug>.state.json

# All rejected source reasons across history
jq -r '[.research_history[].reject_reasons] | flatten | .[]' ~/.claude/plans/<slug>.state.json

# All active loop-plan states
ls ~/.claude/plans/*.state.json | xargs -I{} jq -r '"\(.slug)\t\(.current_phase)\t\(.iteration)"' {}
```
