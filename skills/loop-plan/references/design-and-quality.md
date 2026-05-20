# Design & quality reference

Canonical reference combining the **Phase 4 architecture-and-clean-code section structure** with the **universal principles, design-pattern catalog, and refactoring discipline** loaded by Phase 1 / Phase 4 / the implementer-prompt-addendum / the code-quality-reviewer.

Cites: ADR-0004 (auto-record from architecture-tagged clarifications), ADR-0006 (plan IS the spec), ADR-0011 (self-describing code), ADR-0012 (refactoring assessment), ADR-0013 (universal principles), ADR-0014 (safe refactoring), ADR-0015 (rigor selection — universal principles always-on at every tier), ADR-0021 (consolidation of code-quality.md + architecture-design.md).

---

# Part 1 — Phase 4 `## Architecture & clean-code design` section

## Why this section exists

Plans that say only WHAT to do produce code that compiles but rots. Architecture-aware plans say HOW: layering, dependency direction, naming, error/state, and explicit failure-mode review for any task that dispatches agents. Without this, the planner is an order-taker; with it, the planner is an architect.

## The six sub-sections

Every plan's `## Architecture & clean-code design` section MUST have these six in this order.

### 1. Architecture decisions

Table of every ADR governing this work — both new (created by Phase 2 auto-write) and pre-existing (loaded by Phase 0).

```
| ADR-ID  | Title                              | Status   | Origin                  |
|---------|------------------------------------|----------|-------------------------|
| ADR-0001 | Storage hybrid for project decisions | accepted | pre-existing             |
| ADR-0007 | Use Koin for DI                       | proposed | Phase 2 Q3 iteration 1 |
```

Hard rule: every task in `## Plan` cites at least one ADR-ID from this table. Tasks without an ADR are unjustified (Phase 6 drift rule 7).

### 2. Layering & dependency direction

Either a 1-line rule or a small ASCII diagram. State the import direction so reverse imports become detectable violations.

Example: `UI → ViewModel → Repository → DataSource. Reverse imports forbidden.`

### 3. State & error-handling pattern

One paragraph. UiState / Event / Result, or whatever the project's existing pattern is. If the project has a pattern in place, inherit it; only deviate with a new ADR.

### 4. Naming conventions

3–5 rules specific to this change. Inherit project convention; only override with rationale.

### 5. Clean-code rules in scope

MUST reference [Part 2 § Universal principles](#part-2--universal-principles-checklist-solid-kiss-dry-yagni) below for the principles checklist (SOLID, KISS, DRY, YAGNI). The principles are required at every rigor tier. PLUS 3–5 stack- or change-specific rules called out for this plan.

Examples of stack-specific rules:
- No `!!` / force-unwrap in domain layer
- Pure functions in domain layer; side effects only in repository
- Coroutine scopes never leak past their enclosing ViewModel
- No mutation of files outside designated dirs

The change-specific rules are the delta on top of the universal baseline. Cite ADR-0011 (self-describing code) and ADR-0013 (universal principles).

### 5b. Refactoring decision (rigor=full only)

Required if Phase 1 surfaced any entries in `## Exploration findings § Refactoring candidates` AND `state.rigor == "full"`. Skip the entire sub-section at `rigor=minimal | tdd-only`. Cite ADR-0012, ADR-0014.

The plan emits one row per candidate as a table:

```
| # | Candidate (file:line)        | Risk | Decision           | Char-test plan                                  | Mutation floor   | ADR-ID (tech-debt only) |
|---|------------------------------|------|--------------------|-------------------------------------------------|------------------|-------------------------|
| 1 | src/foo/Bar.kt:42-110        | HIGH | Address-as-prereq  | char-test task T0a covers parseBar / formatBar  | post ≥ pre       | —                       |
| 2 | src/baz/Quux.kt:15           | LOW  | Address-after      | rely on existing tests in test_quux.kt          | post ≥ pre       | —                       |
| 3 | src/legacy/OldThing.kt       | MED  | Document-as-tech-debt | n/a — see ADR                                | n/a              | ADR-0021                |
```

Hard rules:
- HIGH-risk + Document-as-tech-debt requires explicit user override note in the plan body (cite ADR-0014). Drift rule 13(d) surfaces this for human review.
- Address-as-prereq → orchestrator MUST auto-prepend a characterization-test task at the TOP of the plan's task list, named `T0a-char-test-<kebab>` (then `T0b-`, `T0c-`, …). The char-test task is a regular Phase 7b TDD task; its post-impl mutation_score becomes the floor for the matching refactor task.
- Address-after → orchestrator MUST append the char-test + refactor pair at the END of the task list (after the new feature task).
- Document-as-tech-debt → `~/.claude/bin/new-adr.py create --slug <kebab> --title "Tech debt: <summary>"` produces a `tech-debt` tagged ADR with risk level + tracking date in the body. Record ADR-ID in `state.adrs_created[]` AND in the table.
- Mutation floor column is `post ≥ pre` for non-deferred decisions (always — cite ADR-0014). Specific numeric floor is recorded in `state.tests_state[]` at runtime by Phase 7b.

Risk rubric and refactoring options live in [Part 4 § Refactoring decision options](#part-4--refactoring-decision-options) and [Part 5 § Risk-level rubric](#risk-level-rubric-used-by-phase-1-explorer--phase-4--5b-emission).

### 6. Failure-mode review (mandatory if the plan dispatches agents)

The five orchestration failure modes (Ranksquire 2026-04-21):

| Mode | Required mitigation in plan |
|---|---|
| Hallucination cascade | Validation gate (test, schema, or human review) |
| Context overflow | Prompt summarization or capping rule |
| Unbounded loop | Iteration cap + termination condition |
| Tool misuse | Schema validation or restricted tool set |
| Cascading timeout | Backoff + jitter on retries |

For tasks with no agent dispatch, write `N/A — single-session local edits only` and move on. Don't fabricate mitigations.

## Hard rules

1. Every architecture decision in this section MUST cite an ADR-ID. No "we'll use X" lines without an ADR.
2. Section order is fixed (1 → 6). Changing the order breaks drift-check rule 8.
3. The section is mandatory. A plan without it fails Phase 6 drift check.
4. The section is part of the plan; it is NOT a separate spec.md (ADR-0006).

## Decision-detection heuristic — which clarifications auto-create ADRs

Phase 2 calls `new-adr.py create` automatically when a clarification answer maps to one of these whitelisted headers (case-insensitive):

```
Library          Format           State            Auth
Framework        Architecture     Persistence      API
Storage          Structure        Navigation
DI               Layering
Pattern
```

If the AskUserQuestion's `header` field matches one of these, the answer is treated as an architecture/tech decision and auto-recorded as a new ADR with `status: proposed`. Promotion to `accepted` happens at Phase 7b after the cited tasks pass.

If the clarification is about scope, copy, naming, or anything not in the whitelist, no ADR is created — those answers stay in `## Clarifications` only.

## When to manually override

If the heuristic miscategorizes a clarification, the orchestrator can:

- Skip the auto-create (don't call `new-adr.py create`) and note it in `state.adrs_created[]` with `skipped: true`.
- Create an ADR manually for an answer the heuristic missed.

Both overrides are logged in `state.json` for traceability. No silent skips.

---

# Part 2 — Self-describing code rule

Names carry meaning. Functions do one thing. Types document themselves. Comments are reserved for non-obvious WHY: a hidden constraint, a workaround for a specific bug, a counter-intuitive invariant.

### Forbidden
- Comments that restate code (`// increments counter`, `i++`).
- Doc-comments that paraphrase the function name (`/** Returns the user. */ fun getUser()`).
- ASCII-art section banners (`// ============= USERS =============`).
- TODO/FIXME/XXX left in source — use a `tech-debt` ADR or a follow-up task.
- Commented-out code blocks "in case we need them later" — git history is the archive.

### Allowed (and encouraged)
- WHY this implementation choice when the obvious alternative is wrong.
- Reference to a bug ID, issue, or postmortem that motivated a workaround.
- Counter-intuitive invariant ("must be called before X is initialized").
- Public-API doc-comments (KDoc, JSDoc, `///` Swift docs) on `public` declarations — these are contracts, not redundant comments.
- Inline comment for a non-obvious algorithm step that a junior reader couldn't infer in 60 seconds.

### Heuristic
If removing the comment wouldn't confuse a future reader, don't write it. If a reader would have to re-derive the WHY from history, write it.

---

# Part 2 — Universal principles checklist (SOLID, KISS, DRY, YAGNI)

These are always-on at every rigor tier. The plan's `## Architecture & clean-code design § 5 Clean-code rules in scope` cites this section as the principles baseline; it adds 3–5 stack-specific rules on top.

### SOLID (Robert Martin)
- **S — Single Responsibility.** A class/module/function has one reason to change. If you can describe it with "and", split it.
- **O — Open/Closed.** Code is open for extension, closed for modification — extend by adding new types, not editing existing ones (where reasonable; YAGNI applies — don't speculatively make every class extension-ready).
- **L — Liskov Substitution.** Subtypes must be substitutable for their base type without breaking caller assumptions. If overriding changes contract, you've violated LSP.
- **I — Interface Segregation.** Clients shouldn't depend on methods they don't use. Many small focused interfaces beat one fat one.
- **D — Dependency Inversion.** Depend on abstractions, not concretions, ESPECIALLY across module boundaries. Concrete dependencies inside a module are fine.

### KISS — Keep It Simple, Stupid
The simplest code that satisfies the requirements wins. Three similar lines beat a premature abstraction. A 5-line function beats a 3-line function with a 10-line helper. Don't pattern-match for the sake of pattern-matching.

### DRY — Don't Repeat Yourself (Hunt & Thomas, *The Pragmatic Programmer*)
Every piece of knowledge has one canonical representation. **BUT**: only after Rule of Three (see Part 4). DRY before Rule of Three is premature abstraction; it produces brittle shared code that pulls together things that have nothing in common except current shape.

### YAGNI — You Ain't Gonna Need It (Kent Beck)
Don't add abstraction, configuration, or extension points for hypothetical future requirements. Build for what's actually needed; refactor when the third use case shows up. Speculative generality is the most common form of accidental complexity.

### What to look for in code
| Principle | Smell | Fix |
|---|---|---|
| SRP | "and" in the class/function name; methods that touch unrelated state | Split |
| OCP | switch/if-else on type that grows when new types are added | Strategy pattern (only after Rule of Three) |
| LSP | subclass that throws "not supported" or no-ops a base method | Composition over inheritance |
| ISP | clients implementing methods they don't use | Split the interface |
| DIP | high-level module imports a concrete low-level module across boundaries | Inject the abstraction |
| KISS | nested abstractions, factory of factories | Inline; ask "would a junior get this in 60s?" |
| DRY | same logic in 3+ places | Extract; if only 2, leave it |
| YAGNI | extension points, config flags with one value, "for the future" interfaces | Delete; add when needed |

---

# Part 3 — Design pattern catalog

Apply patterns when they solve a real problem, NOT when they exist. Pattern fluency without restraint produces over-engineered code.

| Pattern | When to use | When NOT to use |
|---|---|---|
| **Strategy** | Multiple interchangeable algorithms; selection at runtime | Only one algorithm exists; just call the function |
| **Adapter** | Bridging two incompatible interfaces (e.g. third-party SDK to internal API) | Both interfaces under your control — change one |
| **Decorator** | Adding orthogonal cross-cutting behavior (logging, caching, retries) | Behavior belongs in the core type — modify it |
| **Observer** | Multiple consumers need notification of state change | Only one consumer — direct call |
| **Factory** | Creation logic is complex enough to warrant abstraction (validation, polymorphic dispatch) | Constructor does the job |
| **Repository** | Persistence boundary; testable data access | In-memory CRUD, simple `Map<K,V>` |
| **Builder** | Object with many optional parameters or complex construction order | Few params; named arguments work |
| **State machine** | Behavior depends on a small fixed set of states with clear transitions | Implicit-state code that's not actually a state machine |

### Anti-pattern
> "I learned about hammers, every problem looks like a nail."

If a pattern adds layers without solving a real problem you'd otherwise have to write boilerplate to solve, skip the pattern.

---

# Part 4 — Refactoring trigger heuristics

When to refactor — and when NOT to. Used by the Phase 1 explorer's risk rubric and by the implementer to decide whether to surface `DONE_WITH_CONCERNS — refactor_recommended`.

### Rule of Three (Don Roberts)
Don't extract on the first duplicate. Don't extract on the second duplicate. Refactor when the third occurrence shows up — by then you actually understand the shared shape and the extraction won't be wrong. Extracting on duplicate #1 is premature abstraction; it produces shared code that's wrong because you only had one example.

### Code smells (Martin Fowler, *Refactoring*)
| Smell | Definition | Threshold heuristic |
|---|---|---|
| Long method | Function does too much | > 30 LOC; > 5 conditional branches; mixed levels of abstraction |
| Large class | Too many responsibilities | > 5 instance fields; > 200 LOC; "and" in the class description |
| Primitive obsession | Using primitives where a domain type belongs | `String` for email, money, ID, timestamp — wrap |
| Feature envy | Method uses another class's data more than its own | Method has more `other.foo` than `this.foo` references |
| Shotgun surgery | One conceptual change forces edits in many files | Touching ≥4 files for one logical change |
| Divergent change | One class changes for unrelated reasons | Two reasons to edit a single class |
| God class | One class knows / does too much | All paths lead through it |

### Christer Boumann's "5 lines" rule
If a function is more than 5 lines, ask whether it's doing one thing. Not a hard cap — but a strong signal to look closer. Useful when paired with KISS for greenfield work.

### When NOT to refactor
- The code is correct, simple, and isolated. "It could be cleaner" is not enough.
- You're under deadline pressure on a different task. Use Document-as-tech-debt deferral instead.
- The refactor would touch a hot path you don't have characterization tests for AND `state.rigor != "full"`. Add the tests first, or defer.
- The duplicate count is < 3 (Rule of Three).

## Refactoring decision options

When Phase 1 surfaces a refactoring candidate, Phase 4 § 5b records ONE of three decisions per candidate. Cite ADR-0012.

### Address-as-prerequisite-task
Refactor BEFORE the new feature lands. The orchestrator auto-prepends a `T0a-char-test-<kebab>` task at the TOP of the plan's task list to capture characterization tests, followed by the refactor task itself.

When to choose:
- The new feature change would be hard to make in the current shape.
- The candidate is HIGH-risk and blocking the new feature from landing cleanly.
- The candidate's test coverage today is too thin to refactor safely later.

### Address-after
New feature lands first; a char-test + refactor pair appended at the END of the same plan's task list.

When to choose:
- The new feature is independent of the candidate.
- Refactor would slow the feature without improving it.
- Skipping char-tests + refactor entirely is too risky for next time.

### Document-as-tech-debt-and-defer
No task added now. `new-adr.py create --slug <kebab> --title "Tech debt: <summary>"` produces a `tech-debt` tagged ADR with risk level + tracking date. Future loop-plan invocations load this ADR at Phase 0 and surface it in Phase 1 as a known candidate.

When to choose:
- Candidate is LOW or MED risk AND not blocking the new feature.
- Refactor scope is bigger than this loop can absorb.
- The team agrees to revisit at a future date (recorded in the ADR).

**Hard rule (ADR-0014):** HIGH-risk + Document-as-tech-debt requires explicit user override note. Drift rule 13 surfaces this for human review (advisory, not auto-DRIFT).

---

# Part 5 — Safe refactoring (characterization tests + mutation floor)

Cite Michael Feathers, *Working Effectively with Legacy Code* (2004); the discipline still applies. Three-step pattern:

### Step A — Characterization tests first
Before touching the refactor target, write tests that capture its CURRENT behavior — including any quirks. Test the observable outputs, not the implementation. These tests pin the contract; they survive the refactor unchanged.

### Step B — Record mutation baseline
Run the project's mutation tool against the area; record the score in `state.tests_state[].mutation_score` BEFORE any refactor. This is the safety floor.

### Step C — Refactor under green tests
Execute the refactor through the existing Phase 7b TDD pipeline. Tests stay green throughout (or the refactor is wrong). Post-refactor, mutation score must be ≥ the baseline from step B (cite ADR-0014). If post < pre, the refactor weakened behavior coverage — HARD ABORT.

## Risk-level rubric (used by Phase 1 explorer + Phase 4 § 5b emission)

| Risk | Coverage + complexity | Char-test prereq | Tech-debt deferral allowed? |
|---|---|---|---|
| **HIGH** | No tests OR complex logic (>50 LOC method, >5 branches, mutable state across calls) | MANDATORY (capture behavior before any refactor) | Only with explicit user override note (per ADR-0014) |
| **MED** | Partial tests OR moderate complexity | MANDATORY but lower bar (1–3 char-tests covering main paths) | Yes |
| **LOW** | Well-tested + simple | OPTIONAL (existing tests usually suffice) | Yes |

### Why characterization tests, not "just any" tests
Characterization tests capture what the code DOES, not what it SHOULD do. The first goal of a refactor is "preserve behavior" — including bugs, quirks, and accidental contracts that downstream code may depend on. Once captured, the refactor proceeds safely; bug-fixes happen in a SEPARATE step (with their own RED→GREEN cycle on the now-clean code).

### Mutation-floor rule (rigor=full only)
At Phase 7b step 7 for any refactor task, the orchestrator additionally checks:

```
state.tests_state[<refactor-task>].mutation_score >= state.tests_state[<char-test-task>].mutation_score
```

If post < pre, the refactor weakened behavior coverage — HARD-BLOCK regardless of absolute tier (cite ADR-0014). The tier model from ADR-0009 (`high / low / break`) still applies as the absolute floor; the per-refactor floor is in addition.

Equivalent-mutant noise tolerance (per ADR-0009): if `low <= post < high` AND post < pre, surface to spec-reviewer for triage rather than auto-block. Hard-block only when post drops below the `break` tier OR when both pre and post are in the `high` tier and post < pre.

---

# Part 6 — Quantitative thresholds for narrow detectors (2026)

This section codifies concrete numeric thresholds and native-tool deferral targets for each of the 9 narrow code-quality detector subagents (`*-auditor.md` in `~/.claude/agents/`). Each detector cites these sub-sections as its single source of truth — detectors do NOT re-define principles, they detect violations using these thresholds.

Sources verified post-2025-10-01 (see Phase 3 research findings of the `code-quality-architecture-agents` loop, 2026-05-09).

## SRP / God-class

- **LCOM4 ≥ 2** = warning, **≥ 3** = mandatory split (objectscriptQuality)
- **NDepend LCOM% default 77%**
- **PMD GodClass = WMC + ATFD + TCC composite** (PMD 7.x, `TooManyMethods` default 10, `TooManyFields` default 15)
- **Detekt 1.23.x / 2.0.0-alpha.3:** `LargeClass.allowedLines` 600, `TooManyFunctions.allowedFunctionsPerClass` 11
- **Practical LOC:** > 200 warning, > 500 high-risk
- Heuristic: "Description has 'and'" (cannot describe class without conjunction → SRP violation)
- Native: PMD GodClass, NDepend LCOM%, Detekt LargeClass

## DRY / Rule-of-Three

- **jscpd `--min-tokens` 50** recommended (skip trivial)
- **PMD CPD `--minimum-tokens` 40 default** (Java); 100 for large codebases
- **jscpd `--threshold` CI gate 5–15%** duplicate ratio
- **Rule of Three:** extract on duplicate #3, leave #2; same KNOWLEDGE not same SYNTAX
- False-positive filters: generated files, test setup boilerplate, `jscpd:ignore-start`/`jscpd:ignore-end` markers
- Native: jscpd, PMD CPD

## YAGNI / premature-abstraction

- **Implementer count = 1** for an interface → flag (collapse to concrete class)
- **Strategy with single instance** → flag
- **Generic type used at exactly 1 call-site** → flag
- **Class/function callable only by tests** (Fowler: "only callers are tests") → flag
- Factory class producing exactly one product → flag
- Abstract class / `open` method with zero overriding subclasses → flag
- Feature-flag branches never toggled → dead branch
- Native: PMD `UnusedFormalParameter` / `AbstractClassWithoutAbstractMethod`, Roslyn `CA1040` (empty interfaces), SonarQube `squid:S2094` / `squid:S1610`

## DIP / dependency-direction

- **Import cycle = ERROR, zero tolerance** (ADP / Martin)
- **Layer-violation rules** in dependency-cruiser: `severity: "error"` for forbidden cross-layer pairs
- Native: madge ^9 (`madge --circular`), dependency-cruiser ^16, ArchUnit 1.x (`slices().beFreeOfCycles()`), skott (ESM-native alternative)

## Cyclomatic complexity / Long-method

- **McCabe CC ≤ 10** (Sonar); > 15 untestable in practice
- **SonarQube Cognitive Complexity ≤ 15** (default rule)
- **Detekt:** `CyclomaticComplexMethod.allowedComplexity` 14, `CognitiveComplexMethod.allowedComplexity` 15, `LongMethod.allowedLines` 60
- **SwiftLint `cyclomatic_complexity`:** warn 10, error 20
- **lizard default CCN:** warn 15
- **ESLint `complexity`:** default 20; **Microsoft CA1502:** default 25
- **Radon (Python):** A=1-5, B=6-10, C=11-15, D=16-20, E=21-25, F=26+
- **LOC/method:** > 30 warning, > 60 strong refactor
- **Nesting depth > 3** = smell; **parameter count > 4** = SRP signal
- Native: detekt 2.x, SwiftLint, lizard, radon, PMD `CyclomaticComplexity`

## Naming-conventions

- **ESLint `id-length` default `min: 2`**, exceptions `["i", "j", "k"]`
- **Boolean prefix:** ≥1 of `is`/`has`/`can`/`should`; avoid negation (`notReady`)
- **Generic suffix anti-pattern regex:** `/(Manager|Helper|Util|Utils|Handler|Processor|Misc)$/` without genuine state-management responsibility
- **Acronym capitalization (language-specific):** Java/Kotlin `HttpRequest` (initial-caps only); Go `HTTPRequest` (full-caps for 2-letter acronyms)
- Native: ESLint `id-length`, ktlint, SwiftLint `identifier_name`, Checkstyle `LocalVariableName`/`MemberName`/`MethodName`

## Comment-quality (per ADR-0011 self-describing-code)

- **TODO/FIXME age:** > 30 days advisory, > 90 days must-fix-or-delete
- **WHAT-vs-WHY:** comment paraphrasing identifier or repeating mechanical operation = anti-pattern
- **Outdated doc-comments:** KDoc/JSDoc signature mismatch after rename = drift
- **Commented-out code blocks** → flag
- **Missing public-API doc** when project policy requires it
- Native: detekt 1.23.5 (`CommentOverPrivateFunction`, `CommentOverPrivateProperty`, `OutdatedDocumentation`, `UndocumentedPublicClass/Function/Property`), ESLint `capitalized-comments`, eslint-plugin-unicorn `expiring-todo-comments`, SwiftLint `expiring_todo`

## ADR-completeness (per MADR 4.0.0)

- **Required sections:** "Context and Problem Statement", "Considered Options", "Decision Outcome" (with nested "Consequences")
- **`status` enum:** `proposed | rejected | accepted | deprecated | superseded`
- **Empty / template-placeholder Decision Outcome** → fail
- **`proposed` age > 90 days** → stale flag
- **Dangling `ADR-NNNN` cross-refs** (cited but file missing) → fail
- **MADR 4.0.0 renamed fields:** `deciders` (lowercase), `Confirmation` subsection (not `Validation`)
- Native: `~/.claude/bin/new-adr.py list`, zircote/structured-madr GitHub Action validator

## Characterization-test-coverage (per ADR-0014 safe refactoring)

- **Pre-refactor line coverage floor: 70–80%** (graphite.dev)
- **Branch coverage floor: 60%** on touched conditional paths
- **Mutation score post ≥ pre** (ADR-0014 corroborated by Springer 2025)
- **Test-type breakdown:** unit-only with no integration = partial risk; require ≥1 end-to-end behavioral assertion for public API
- **Signature-only tests** (assert only existence/return type) = inadequate; require concrete input→output pairs
- Native: JaCoCo (Java/Kotlin), gcovr (C/C++), nyc/Istanbul (JS/TS), PITest (`mutationThreshold`), Stryker (`stryker.conf.json mutationScore`), llvm-cov / `xcodebuild -enableCodeCoverage YES`

## Sources (Phase 3 research, 2026-05-09)

- objectscriptQuality LCOM4, NDepend LCOM% blog, PMD 7.x design rules, Detekt 1.23.5 / 2.0.0-alpha.3 complexity ruleset, jscpd npm/GitHub, SonarQube cognitive vs cyclomatic, SwiftLint cyclomatic_complexity, lizard GitHub, Radon docs, ESLint id-length, eslint-plugin-unicorn expiring-todo-comments, MADR 4.0.0 release notes + template, Refactoring Guru speculative generality, Coding Horror "Manager suffix" anti-pattern, Acyclic Dependencies Principle (Martin), madge npm, dependency-cruiser rules-reference, ArchUnit user guide, skott DEV intro, JaCoCo / PITest / Stryker / cloudamite characterization-testing, Springer 2025 mutation testing in test code refactoring.
