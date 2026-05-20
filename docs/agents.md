# Supporting Agents

Loop skills come with an optional set of agents that the orchestration pipeline uses at runtime. These are separate from the skills themselves — you can install all of them, some, or none.

## What agents are

In Claude Code, agents are Markdown files in `~/.claude/agents/`. When loop-plan dispatches a task to an agent, Claude Code loads the agent's Markdown as a system prompt and runs it with its own context and tool access.

Loop-plan uses agents in two places:
- **Phase 1** — read-only explorer agents map the codebase in parallel
- **Phase 7** — implementation pipeline: spec-reviewer and code-quality-reviewer gate each task

---

## Agent reference

### `spec-reviewer`

**Role:** Verifies that an implementation matches the plan spec.

**Used in:** Phase 7 — runs after each implementer task completes.

**Returns:** `SPEC-COMPLIANT` or `NOT-SPEC-COMPLIANT: <reasons>` with specific line references.

**What it checks:**
- Does the implementation match the task's stated goal?
- Are all files listed in "Files to change" actually changed?
- Are the test assertions from the spec present and non-trivial?
- Was anything added that the spec didn't ask for?

> [!NOTE]
> spec-reviewer is intentionally strict. It only checks whether the spec was followed — not whether the code is good. That's code-quality-reviewer's job. Separation of concerns means neither reviewer second-guesses the other.

---

### `code-quality-reviewer`

**Role:** 11-dimension code quality check.

**Used in:** Phase 7 — runs after spec-reviewer passes.

**Returns:** `QUALITY-PASS` or `NEEDS-REWORK: <findings>` with dimension labels.

**The 11 dimensions:**
1. Naming — identifiers are self-describing, no abbreviations
2. Single responsibility — each function does one thing
3. DRY — no unnecessary duplication (Rule of Three gate)
4. YAGNI — no speculative abstractions
5. Error handling — failures are explicit, not swallowed
6. Test quality — assertions test behavior, not implementation details
7. Dependency direction — no upward or circular imports
8. Interface design — APIs are minimal and hard to misuse
9. Comments — WHY only, not WHAT
10. Complexity — no function over cyclomatic complexity 10
11. Mutability — minimal shared mutable state

> [!NOTE]
> At `rigor: minimal`, code-quality-reviewer is skipped. At `rigor: tdd-only`, it runs but dimensions 1–5 are advisory (not blocking). At `rigor: full`, all 11 dimensions are gating.

---

### `research-agent`

**Role:** 5-step methodology research with date verification and cross-validation.

**Used in:** Phase 3 — dispatched for each research domain in parallel.

**Returns:** Structured findings with source URLs, dates, and confidence scores (HIGH/MED/LOW).

**5-step methodology:**
1. Decompose the query into ≥5 sub-questions
2. Search ≥15 sources (official docs via context7, blogs, issues, benchmarks)
3. Score source credibility (authority, currency, objectivity)
4. Synthesize across sources — flag conflicts, identify consensus (3+ sources = HIGH)
5. Return findings with full citation trail

> [!NOTE]
> research-agent applies a date filter: for fast-moving APIs and frameworks, results older than 60 days are flagged. Claude's training data is not used as a substitute for current docs.

---

### `test-runner`

**Role:** Runs the project's test suite and reports pass/fail with failing test names.

**Used in:** Phase 7 — runs between implementer and spec-reviewer.

**Returns:** `PASS: N/N` or `FAIL: N/M — [list of failing tests]`

**Auto-detects:** Gradle/Kotlin, `xcodebuild` (iOS), `npm test`, `pytest`, `swift test`.

For mutation testing (Standard/Hardened intensity in loop-debug), test-runner also runs the mutation engine and reports: `mutation score: X% → Y%` (post must be ≥ pre).

---

### `second-opinion`

**Role:** Cross-model review via OpenAI Codex.

**Used in:** Phase 6 (loop-plan) and Phase 6 (loop-debug Standard/Hardened).

**Requires:** `OPENAI_API_KEY` in your shell environment.

**Returns:** Findings labeled with severity (HIGH/MEDIUM/LOW) and a `Claude AGREES/DISAGREES` meta-tag.

> [!IMPORTANT]
> second-opinion findings are **advisory** — they never block execution. The value is the cases where Codex flags something Claude missed. If both models agree on everything, the second opinion is low-signal for that review. Disagreement is the useful data point.

If `OPENAI_API_KEY` is not set, second-opinion returns `REVIEW UNAVAILABLE` and the pipeline continues.

---

### `android-kmp-explorer`

**Role:** Android/Kotlin/KMP/Compose codebase exploration.

**Used in:** Phase 1 — dispatched when the codebase is detected as Android/Kotlin/KMP.

**Returns:** File paths, line numbers, execution-flow traces, conventions, refactoring candidates, and deepening opportunities.

**Covers:** Kotlin source sets, Compose UI structure, KMP shared modules, Gradle configs, Room schemas, Hilt/Koin wiring, WorkManager jobs.

---

### `swiftui-explorer`

**Role:** iOS/SwiftUI codebase exploration.

**Used in:** Phase 1 — dispatched when the codebase is detected as iOS/Swift.

**Returns:** File paths, line numbers, view/view-model structure, navigation flows, async patterns, and dependency wiring.

**Covers:** SwiftUI views, view models, `@EnvironmentObject`/`@StateObject` wiring, async/await flows, Core Data models, URLSession layers.

---

## Install individual agents

By default, the installer lets you pick which agents to include. To install individual agents without running the full installer:

```bash
# Install only the spec-reviewer and code-quality-reviewer
claude-skills --skills loop-plan --no-agents
# Then manually copy from the package:
cp $(npm root -g)/@loopskills/claude-skills/agents/spec-reviewer.md ~/.claude/agents/
cp $(npm root -g)/@loopskills/claude-skills/agents/code-quality-reviewer.md ~/.claude/agents/
```

---

## Agents loop-plan doesn't install

These agents are used internally by loop-plan but are already part of Claude Code's built-in agent catalog and don't need to be installed:

- `Explore` — generic read-only codebase explorer (used for non-Android/iOS stacks)
- `Plan` — used for architecture design phases

If you're on an Android or iOS project, install `android-kmp-explorer` or `swiftui-explorer` for better Phase 1 results than the generic `Explore` agent.
