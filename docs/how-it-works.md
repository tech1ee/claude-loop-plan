# How Loop Skills Work

## loop-plan phases

```
Phase 0  Seed           Derive slug, check for resume, load context, create plan file
Phase 1  Exploration    Parallel read-only subagents map codebase (similar features / arch / tests)
Phase 2  Clarify gate   AskUserQuestion — decisions the user must make before research
Phase 3  Research       Date-strict internet research (context7 + WebSearch)
Phase 3b Tool inventory Scan installed agents/skills to inform orchestration design
Phase 4  Plan           Write tasks with test specs, architecture decisions, orchestration design
Phase 5  Loop gate      AskUserQuestion — ship it / more research / more questions / more exploration
Phase 6  Drift check    Verify plan against requirements, research, constraints
Phase 7a ExitPlanMode   Summary + hand-off to subagent-driven execution
Phase 7b Execution      Subagents implement tasks with spec-reviewer + code-quality-reviewer gates
```

**Exit signal:** say "ship it" (or equivalent: "go", "let's build", "поехали") at the Phase 5 gate.

## loop-debug phases

```
Phase 0  Reproduce      Extract bug_signature; write T0a regression test (must fail RED)
Phase 1  Investigate    Parallel explorers: root-cause + scope + existing-coverage
Phase 2  Clarify        AskUserQuestion: scope / severity / fix-shape / acceptance
Phase 3  Research       Date-strict fix patterns + prevention strategies for this bug class
Phase 4  Plan           Emit T0a regression + T-fix minimal + T0b prevention-design
Phase 5  Loop gate      Intensity selection (minimal / standard / hardened) + ship/loop/back
Phase 6  Drift + Exec   Drift rules 1-17; ExitPlanMode; RED→impl→GREEN→verify→mutation
```

**Key guarantee:** T0a (the regression test) is written before any investigation. It must be RED before the fix, GREEN after. Post-fix mutation score must be ≥ pre-fix baseline.

## File layout after install

```
~/.claude/
  skills/
    loop-plan/
      SKILL.md              main skill (loaded by Claude Code when you type /loop-plan)
      references/           11+ supporting reference files (orchestration, TDD workflow, etc.)
    loop-debug/
      SKILL.md
      references/           4 reference files (+ inherits loop-plan/references/)
    .install-receipt.json   version, installed_at, skills list, file checksums
  agents/
    spec-reviewer.md        (optional — if selected during install)
    code-quality-reviewer.md
    research-agent.md
    test-runner.md
    second-opinion.md
    android-kmp-explorer.md
    swiftui-explorer.md
  bin/
    new-adr.py              ADR management
    test-integrity.py       Test snapshot + tamper detection
    verify-code-research.py Citation verifier (hallucination guard)
    scan-tooling-parse.py   Tool inventory parser
    should-run-codex.py     Cost gate for cross-model review
    run-codex-review.sh     Codex review runner
    codex-plan-review.sh    Plan-stage Codex reviewer
  commands/
    scan-tooling.md         /scan-tooling slash command
  plans/                    Created by loop-plan at runtime (per-task)
```

## Pi package surface

`package.json` declares a Pi manifest with `skills: ["./skills/pi"]`. Pi therefore loads only the platform-safe skills under `skills/pi/`; it does not load the Claude Code installer payload or the Claude-only reference workflow. The Pi skills use the native `subagent` tool and project-local `.pi/plans/` artifacts. The bundled `loop-progress` extension exposes the `loop_progress` tool and renders a persistent checkpoint widget above the editor; `/loop-progress clear` removes it. Install locally with `pi install /absolute/path/to/claude-loop-plan`, or install the published npm package.

The Claude Code installer and its `~/.claude/` layout remain unchanged for backward compatibility.

## Update mechanism

The installer performs a **non-blocking background check** on every run (unless `NO_UPDATE_NOTIFIER=1` or `CI=1`):

1. On startup, reads a 24-hour TTL cache at `~/.claude/skills/.update-check.json`.
2. If the cache is stale (or missing), fires a `fetch()` to the npm registry dist-tags endpoint.
3. If a newer version exists, prints a one-line notice after the install completes.
4. The fetch is fire-and-forget — it never blocks or fails the install.

To explicitly update: `claude-skills update` runs `npm install -g @loopskills/claude-skills@latest`.
