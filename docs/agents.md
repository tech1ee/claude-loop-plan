# Supporting Agents

Loop skills come with an optional set of agents that the orchestration pipeline uses at runtime. These are separate from the skills themselves — you can install all of them, some, or none.

## What agents are

In Claude Code, agents are Markdown files in `~/.claude/agents/`. When loop-plan dispatches a task to an agent, Claude Code loads the agent's Markdown as a system prompt and runs it with its own context and tool access.

Loop-plan uses agents in several places:
- **Phase 1** — read-only explorer agents map the codebase in parallel
- **Phase 3** — research-agent runs 5-step methodology research per domain
- **Phase 6** — second-opinion cross-model review (loop-plan + loop-debug)
- **Phase 7** — implementation pipeline: spec-reviewer and code-quality-reviewer gate each task
- **On-demand** — auditor agents triggered by specific code changes (Android audit, iOS preflight, quality detectors, etc.)

Agents are organized into 8 groups in the installer. Install the groups that match your stack.

---

## Agent reference

### Universal agents

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

### `security-reviewer`

**Role:** Audits just-written code for auth bypass, injection, exposed secrets, and insecure data handling.

**Used in:** After any auth/payment/secrets/data-handling code change (background, advisory).

**Returns:** Findings with >80% confidence only, severity HIGH/MEDIUM/LOW.

**What it checks:** OWASP Top 10, auth bypass patterns, SQL/command injection, hardcoded secrets, insecure deserialization, unsafe redirects.

---

### `srp-godclass-auditor`

**Role:** Detects Single Responsibility Principle violations and God-class smells with quantitative metrics.

**Used in:** After non-trivial class additions or before merge.

**Returns:** LCOM4 score, WMC+ATFD+TCC, LOC, field/method count per flagged class with remediation recommendations.

**Threshold:** Classes with LCOM4 > 1 AND LOC > 200 are flagged as God-class candidates.

---

### `dry-duplication-auditor`

**Role:** Detects code duplication with a Rule-of-Three gate — two copies is fine, three is a required extraction.

**Used in:** After multi-file changes or before merge.

**Returns:** Duplicate blocks with file:line references, copy count, and `LEAVE` (count < 3) or `EXTRACT` (count ≥ 3) verdict.

**Tooling:** Uses jscpd or PMD CPD thresholds; annotates "tool-covered" when native linter already flags it.

---

### `complexity-long-method-auditor`

**Role:** Flags methods with excessive cyclomatic complexity, cognitive complexity, LOC, nesting depth, or parameter count.

**Used in:** After method changes or before merge.

**Returns:** Per-method metrics with PASS/FLAG verdict. Thresholds: cyclomatic > 10, cognitive > 15, LOC > 40, nesting > 3, params > 5.

**Tooling:** lizard (Python/JS/TS), detekt (Kotlin), SwiftLint (Swift), Radon (Python).

---

### `dip-dependency-direction-auditor`

**Role:** Audits Dependency Inversion and Acyclic Dependencies — catches reverse imports, import cycles, and layer violations.

**Used in:** After module/package/layer changes.

**Returns:** Cycle paths with file:line references, layer-violation direction arrows, and `BLOCK` (cycles) or `FLAG` (layer smell) verdicts.

**Tooling:** madge (JS/TS), dependency-cruiser, ArchUnit (JVM/Kotlin).

---

### `naming-conventions-auditor`

**Role:** Detects naming smells: overly generic suffixes (Manager/Helper/Util), id-length names, Hungarian notation, acronym capitalization, missing boolean prefixes.

**Used in:** After type/function/variable additions.

**Returns:** Findings per identifier with smell category and suggested rename.

---

### `comment-quality-auditor`

**Role:** Audits comment hygiene — flags WHAT comments (restating code), expired TODO/FIXME markers, outdated KDoc/JSDoc/docstrings, and undocumented public API.

**Used in:** After code changes.

**Returns:** Per-comment verdict: `WHAT-violation` (delete it), `EXPIRED` (remove or resolve), `STALE` (update), `MISSING-API-DOC` (add it).

---

### `yagni-premature-abstraction-auditor`

**Role:** Detects speculative-generality smells: one-implementation interfaces, single-product factories, dead extension points, generic types used at only one call-site.

**Used in:** After introducing interfaces/factories/extension points.

**Returns:** Smell type, evidence, and `SIMPLIFY` recommendation with before/after sketch.

---

### `char-test-coverage-auditor`

**Role:** Audits characterization-test coverage of code about to be refactored — ensures the mutation floor condition `post ≥ pre` can be met.

**Used in:** Before any HIGH-risk refactor (required by loop-plan's pre-change refactoring assessment at `rigor: full`).

**Returns:** Line/branch coverage of touched lines, mutation score baseline, behavior-vs-signature assertion ratio.

> [!IMPORTANT]
> Run this BEFORE the refactor, not after. Its purpose is to establish the baseline so the post-refactor mutation gate has a floor to compare against.

---

### `adr-completeness-auditor`

**Role:** Audits ADR files against MADR 4.0.0 schema — checks required sections, status enum values, stale `proposed` decisions older than 90 days, and dangling cross-references.

**Used in:** After ADR additions or status changes.

**Returns:** Per-ADR verdict with missing sections, invalid status values, and stale/dangling ref list.

---

## Android / KMP agents

### `android-kmp-explorer`

**Role:** Android/Kotlin/KMP/Compose codebase exploration.

**Used in:** Phase 1 — dispatched when the codebase is detected as Android/Kotlin/KMP.

**Returns:** File paths, line numbers, execution-flow traces, conventions, refactoring candidates, and deepening opportunities.

**Covers:** Kotlin source sets, Compose UI structure, KMP shared modules, Gradle configs, Room schemas, Hilt/Koin wiring, WorkManager jobs.

---

### `android-coroutine-scope-leak-auditor`

**Role:** Static analysis for coroutine scope leak patterns — GlobalScope usage, singleton-scoped coroutines, `viewModelScope` misuse in Fragments, `runBlocking` on main thread.

**Used in:** After coroutine scope changes or before release.

**Returns:** Leak pattern, file:line, severity, and recommended replacement scope.

---

### `android-fgs-compliance-auditor`

**Role:** Audits Foreground Service type declarations, exemption-eligibility, Android 14/15 behavioral changes, and Play Console use-case match.

**Used in:** After foreground service changes or before Play submission.

**Returns:** FGS type matrix compliance, `mediaProcessing` 6-hour timing compliance, exemption eligibility verdict.

---

### `android-r8-proguard-auditor`

**Role:** Audits R8/ProGuard keep rules for AGP 9.0+ breaking changes — removal of `proguard-android.txt`, missing reflection keeps, prohibited consumer-rule global options.

**Used in:** After AGP 9 upgrade or before release builds.

**Returns:** Per-rule verdict: `SAFE`, `BROKEN` (AGP 9 regression), or `MISSING` (reflection/annotation keep absent).

---

### `android-baseline-profile-checklister`

**Role:** Verifies Baseline Profile setup completeness — module present, dependency versions correct, CUJs defined, profile included in APK.

**Used in:** Before release to verify Baseline Profile is actually effective.

**Returns:** Checklist with PASS/FAIL per item and a go/no-go verdict.

---

## iOS / macOS / KMP interop agents

### `swiftui-explorer`

**Role:** iOS/SwiftUI codebase exploration.

**Used in:** Phase 1 — dispatched when the codebase is detected as iOS/Swift.

**Returns:** File paths, line numbers, view/view-model structure, navigation flows, async patterns, and dependency wiring.

**Covers:** SwiftUI views, view models, `@EnvironmentObject`/`@StateObject` wiring, async/await flows, Core Data models, URLSession layers.

---

### `ios-appstore-preflight-auditor`

**Role:** Pre-submission preflight for Required Reason API declarations, `PrivacyInfo.xcprivacy` field coverage, and entitlement-vs-privacy-string consistency.

**Used in:** Before App Store submission.

**Returns:** Missing Required Reason API entries, `PrivacyInfo.xcprivacy` gaps, inconsistent entitlement/privacy-string pairs.

---

### `ios-codable-edge-auditor`

**Role:** Audits Codable types for semantic edge cases: custom `init(from:)/encode(to:)`, CodingKeys alignment, key-decoding strategies, optional vs required field handling.

**Used in:** After Codable type changes.

**Returns:** Per-type findings with edge case category and risk level.

---

### `ios-coredata-migration-auditor`

**Role:** Audits Core Data schema changes for lightweight-migration eligibility and heavyweight-migration policy declarations.

**Used in:** After adding a new `.xcdatamodel` version.

**Returns:** `LIGHTWEIGHT-ELIGIBLE` or `HEAVYWEIGHT-REQUIRED` verdict with mapping model requirements.

---

### `kmp-bridging-topology-auditor`

**Role:** Audits KMP target/source-set topology — deprecated `ios()` shortcut usage, intermediate source-set gaps, `@OptionalExpectation` declarations.

**Used in:** After Kotlin Multiplatform target or source-set changes.

**Returns:** Topology diagram, deprecated-API flags, missing intermediate source sets.

---

### `kmp-swift-interop-readiness-auditor`

**Role:** Audits KMP iOS-target interop readiness — SKIE configuration, Swift Export eligibility (Kotlin 2.2.20+), Flow→Combine bridging completeness.

**Used in:** After KMP iOS-target changes.

**Returns:** Recommendation: SKIE / Swift Export / Obj-C interop with gap list per approach.

---

### `macos-entitlements-distribution-auditor`

**Role:** Audits entitlement/sandbox/Hardened Runtime/distribution-channel consistency — catches MAS-vs-Developer-ID mismatches Xcode doesn't lint.

**Used in:** Before macOS code-signing or submission.

**Returns:** Per-entitlement verdict: `CONSISTENT`, `MAS-INCOMPATIBLE`, `SANDBOX-CONFLICT`, or `HARDENED-RUNTIME-MISSING`.

---

### `macos-notarization-preflight-auditor`

**Role:** Pre-flight for `notarytool` submission — Hardened Runtime completeness, prohibited entitlements, stapling sequencing, CI auth method safety.

**Used in:** Before submitting a macOS Developer ID build to notarytool.

**Returns:** Go/no-go with specific flags for prohibited entitlements or missing Hardened Runtime flags.

---

### `macos-appkit-swiftui-interop-auditor`

**Role:** Audits `NSViewRepresentable`/`NSHostingView` seams — Coordinator pattern correctness, lifecycle compliance, gesture-recognizer conflicts.

**Used in:** When introducing or reviewing AppKit ↔ SwiftUI interop seams.

**Returns:** Per-seam finding with Coordinator gap, lifecycle mismatch, or gesture conflict.

---

## Architecture agents

### `compose-architect`

**Role:** Designs Jetpack Compose / Compose Multiplatform UI architecture — MVVM + UiState patterns, composable decomposition, Material 3 compliance.

**Used in:** Design phase when building or refactoring Compose UI. Returns architecture blueprints, not implementation code.

**Returns:** Component hierarchy, UiState design, data flow, composable responsibility boundaries.

---

### `datalayer-architect`

**Role:** Designs the KMP data layer — repositories, Ktor client, Room, Koin DI, coroutine flows. Android + iOS source sets.

**Used in:** Design phase for data layer work. Returns architecture and patterns, not implementation code.

**Returns:** Repository interface design, source-of-truth strategy, cache invalidation policy, Koin module structure.

---

## React / Next.js agents

### `react-nextjs-explorer`

**Role:** React/Next.js/TypeScript codebase exploration.

**Used in:** Phase 1 — dispatched when the codebase is detected as React/Next.js.

**Returns:** File paths, component tree, hook dependencies, data-fetch patterns, routing structure, conventions.

---

### `react-hooks-misuse-auditor`

**Role:** Detects React hook misuse: stale closures, missing `useEffect` dependencies, conditional hook calls, hooks in non-component functions.

**Used in:** After React hook changes or before merge.

**Returns:** Per-hook finding with stale-closure evidence, missing deps list, and conditional-call location.

---

### `nextjs-rsc-boundary-auditor`

**Role:** Audits React Server Component vs client component boundaries — accidental `"use client"` spread, data-fetch waterfall patterns, missing `Suspense` boundaries.

**Used in:** After Next.js App Router changes.

**Returns:** RSC/client boundary map, waterfall locations, `Suspense` gap list.

---

## TypeScript / Node.js agents

### `typescript-strict-mode-auditor`

**Role:** Detects `any` type creep, unsafe casts (`as unknown as X`), `@ts-ignore`/`@ts-expect-error` usage, and implicit `any` escape hatches.

**Used in:** After TypeScript changes or when enabling `strict` mode.

**Returns:** Per-file count of `any`, unsafe casts, and suppression comments with suggested types.

---

### `nodejs-async-safety-auditor`

**Role:** Detects unhandled promise rejections, missing `await`, blocking event-loop operations (`fs.readFileSync` in request path), and unsafe `process.exit` calls.

**Used in:** After Node.js async code changes.

**Returns:** Per-finding: pattern type, file:line, risk level (BLOCKS-EVENT-LOOP / SILENT-REJECTION / CRASH-RISK).

---

## Python agents

### `python-async-correctness-auditor`

**Role:** Detects blocking calls in async context (`time.sleep`, `requests.get`), `asyncio` pitfalls (bare `asyncio.run` in coroutines, `gather` without error handling), and missing `await`.

**Used in:** After Python async code changes.

**Returns:** Per-finding: blocking call location, recommended async replacement.

---

### `django-fastapi-safety-auditor`

**Role:** Audits Django/FastAPI code for migration safety (cascade deletes, large-table `ALTER TABLE`), N+1 query patterns, and missing `select_related`/`prefetch_related`.

**Used in:** After ORM model or query changes.

**Returns:** Migration risk verdict (`SAFE` / `REQUIRES-DOWNTIME` / `DATA-LOSS-RISK`), N+1 locations, missing prefetch patterns.

---

## Vue / Nuxt agents

### `vue-reactivity-pitfalls-auditor`

**Role:** Detects Vue 3 reactivity pitfalls: destructured reactive state loss, missing `watch` cleanup, computed side effects, `ref` vs `reactive` misuse.

**Used in:** After Vue component changes.

**Returns:** Per-finding with reactivity pattern, state-loss risk, and corrected pattern.

---

### `nuxt-ssr-hydration-auditor`

**Role:** Audits Nuxt SSR/CSR hydration mismatches — `window`/`document` access without client-only guards, `useAsyncData` misuse, `<ClientOnly>` gaps.

**Used in:** After Nuxt page or composable changes.

**Returns:** Hydration mismatch locations, missing `process.client` guards, `<ClientOnly>` recommendations.

---

## Install specific agents

The interactive installer lets you pick by group. To install specific agents non-interactively, use `--agents`:

```bash
# Install loop-plan + only the Phase 7 review gates
claude-skills --skills loop-plan --agents spec-reviewer,code-quality-reviewer,test-runner --no-bin

# Android project: Phase 1 explorer + Android audit agents
claude-skills --skills loop-plan,loop-debug \
  --agents android-kmp-explorer,android-coroutine-scope-leak-auditor,android-fgs-compliance-auditor,android-r8-proguard-auditor

# iOS project: Phase 1 explorer + iOS/macOS auditors
claude-skills --skills loop-plan,loop-debug \
  --agents swiftui-explorer,ios-appstore-preflight-auditor,kmp-swift-interop-readiness-auditor

# Full stack (TypeScript + quality gates)
claude-skills --skills loop-plan,loop-debug \
  --agents react-nextjs-explorer,typescript-strict-mode-auditor,spec-reviewer,code-quality-reviewer,security-reviewer
```

---

## Agents loop-plan doesn't install

These agents are part of Claude Code's built-in catalog and don't need to be installed separately:

- `Explore` — generic read-only codebase explorer (used for non-Android/iOS/React stacks)
- `Plan` — used for architecture design phases

If you're on Android, iOS, or React/Next.js, install the matching stack explorer for better Phase 1 results than the generic `Explore` agent.
