<div align="center">

<br>

# 🔄 Loop Skills

[![CI](https://github.com/tech1ee/loop-skills/actions/workflows/ci.yml/badge.svg)](https://github.com/tech1ee/loop-skills/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/loop-skills?color=brightgreen&label=npm)](https://www.npmjs.com/package/loop-skills)
[![Node.js ≥18](https://img.shields.io/badge/node-%3E%3D18-blue)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow)](LICENSE)

<br>

</div>

## Quickstart (30-second setup)

1. Run the installer:

```bash
npx loop-skills
```

2. Pick which skills and supporting agents to install. This default flow installs the Claude Code surface into `~/.claude/`.

3. Open Pi, Claude Code, or another supported agent and type `/loop-plan` or `/loop-debug`.

That's it. You're ready to go.

### Codex support

Install the Codex-native plugin from the same package:

```bash
npx loop-skills codex
```

This installs a personal `loop-skills` plugin, registers it in the personal Codex marketplace, and enables it with the Codex CLI. Interactive installs let you select `loop-plan`, `loop-debug`, and `loop-audit`; all three are selected by default. For automation, pass `--skills loop-plan,loop-debug,loop-audit`. Start a new Codex thread, then invoke an installed skill explicitly or describe a matching task and let Codex select it.

The Codex workflows are native adaptations, not path substitutions. They use Codex plans, bounded parallel subagents, role-focused workers and reviewers, current web research, installed skills and MCP connectors, sandboxed commands, scoped approvals, and outcome-level verification. Use `npx loop-skills codex --dry-run` to preview the installation or `--no-enable` to stage the plugin without enabling it.

### Pi support

This package is also a native Pi package. From this repository (or after publishing), install it with:

```bash
pi install /Users/you/path/to/loop-skills
# or: pi install npm:loop-skills
```

Pi loads the platform-safe skills `loop-plan`, `loop-debug`, and `loop-audit` from `skills/pi/`. They use Pi's `subagent` orchestration, work with OpenAI models selected by Pi, store plans under `.pi/plans/`, and gate all writes on explicit approval. The bundled extensions render a checkpoint list above the editor; `loop_progress` drives the loop checklist. Model/subscription limits visualization is installed separately in the local Pi setup. The installer also supports Claude Code via `npx loop-skills` and Codex via `npx loop-skills codex`; the legacy `@loopskills/claude-skills` package remains available for existing users.

---

## Why These Skills Exist

I built these skills to fix the most common failure modes I see when using Claude Code for real engineering work.

---

## #1: The Agent Codes Before Understanding

> "Give me six hours to chop down a tree and I will spend the first four sharpening the axe."
>
> Abraham Lincoln

**The Problem.** You describe a feature. Claude Code starts writing immediately. Three hundred lines in — sometimes five hundred — you realize the architecture is wrong. The wrong abstraction was chosen. An existing pattern wasn't followed. A critical edge case was missed. Reversing course now is expensive.

This isn't Claude's fault. It's doing what you asked. The problem is the workflow: describe → code. There's no research phase. No verification that Claude actually understood the codebase before touching it.

**The Fix** is to use `/loop-plan`. Before writing a single line, it:

- Explores your codebase with parallel read-only agents — finding similar features, mapping upstream consumers, discovering existing tests
- Asks only the questions that can't be answered by reading the code
- Searches the web with today's date — not training-data assumptions from eighteen months ago
- Writes a plan with test specs per task, ADRs for architecture decisions, and an orchestration design

Then it loops. You review the plan, ask for more research, add questions, or say **"ship it."** Only then does Claude start coding.

---

## #2: The Agent Guesses Instead of Asking

> "No-one knows exactly what they want."
>
> David Thomas & Andrew Hunt, [The Pragmatic Programmer](https://pragprog.com/titles/tpp20/the-pragmatic-programmer-20th-anniversary-edition/)

**The Problem.** When something is unclear, Claude fills in the gap. Sometimes it guesses right. Often it doesn't — and the guess is buried 200 lines deep in an implementation before you see it. By then, reversing the assumption is a real cost.

The instinct is to ask the user for everything upfront. But that's the other failure mode: twenty clarifying questions before any work begins, most of which Claude could have answered by just reading the codebase.

**The Fix** is Phase 2 of `/loop-plan`. After exploring the codebase, Claude asks only the decisions that genuinely can't be inferred — longevity of the feature, consistency model, persistence strategy. Everything else it figures out from the code. The result is 2–3 targeted questions instead of twenty generic ones.

---

## #3: The Patch Doesn't Fix The Bug

> "It's not a bug — it's an undocumented feature."
>
> Unknown, but lived by everyone who's shipped a fix that came back

**The Problem.** You describe a bug. Claude patches the symptom. Tests pass. You ship it. Three months later the same root cause manifests differently — a slightly different code path, a new caller, a different input shape. The fix never addressed why it broke, only that it broke.

Or worse: the "fix" didn't actually fix the bug at all. It just moved the failure somewhere less visible.

**The Fix** is to use `/loop-debug`. The first thing it does — before any investigation — is write a regression test that reproduces the failure. This test must fail (RED) before the fix, and pass (GREEN) after. No exceptions.

Only then does Claude investigate root cause. It plans a minimal fix (T-fix) and a prevention design (T0b) — tests and structural changes that make the bug class harder to reintroduce. At Standard intensity, it also runs mutation testing to verify the test suite actually got stronger after the fix, not weaker.

---

## #4: The Agent Declares Victory Without Checking

> "Measurement is the first step that leads to control and eventually to improvement."
>
> H. James Harrington

**The Problem.** Tasks complete. The summary says "done." But did the *goal* actually get achieved? Task-completion and goal-achievement are not the same thing. A plan can have all tasks marked green while the user's original outcome remains unmet — a missing integration, a wired-but-never-called feature, an acceptance criterion answered correctly on paper but never tested in the real codebase.

The failure is subtle: Claude is genuinely trying to help. The summary is honest about what tasks were done. The gap is that no one verified the outcome independently, adversarially, starting from "not achieved" as the default hypothesis.

**The Fix** is the `loop-verifier` agent. It is read-only, adversarial, and intentionally distrustful of narration. At each stage gate, it:

- Reads the `must_haves` contract — observable truths, required artifacts, key wiring links — derived from your original goal
- Runs a 4-level check on every artifact: exists → substantive (not a stub) → wired → real data flows through it
- Runs behavioral probes that execute the actual code against the acceptance criteria
- Returns `passed`, `gaps_found`, or `human_needed` — never "probably fine"

The execution probes are the hard gate. A file can exist. A function can be imported. A test can pass. None of that is sufficient — the agent must observe the behavior you originally asked for. `completion_state = "shipped"` is blocked until the verifier says `passed`.

---

## #5: The Tests Pass But Prove Nothing

> "A test that always passes is worse than no test — it creates false confidence."
>
> Common wisdom in the mutation testing community

**The Problem.** Claude Code writes tests as part of the implementation. Those tests pass. But were they written to prove the behavior, or to fit the implementation? If the same agent writes both the code and the tests, the tests inherit the implementation's assumptions. They validate the code that was written, not the behavior that was required. A tautological test (`expected = sut(input); assert result == expected`) is green by construction — it can never fail, and it proves nothing.

This isn't unique to AI. It's a well-known failure mode in human-written TDD when the "test first" contract isn't enforced. With AI, the failure mode is faster and more consistent: the tests are always structurally sound and always passing, which makes them harder to identify as hollow.

**The Fix** is the `test-writer` agent — a separate agent whose only job is to write failing tests before any implementation exists. It:

- Reads the `Test behaviors:` spec, not the implementation
- Computes expected values independently (by hand, not by calling the SUT)
- Proves each test RED before returning the file paths
- Refuses to touch any production or source file — if asked, it replies `BLOCKED`

The orchestrator hash-locks the test files after `test-writer` returns. The implementer that runs next cannot modify them. Two static analyzers (`detect-test-gaming`, `detect-tautological-tests`) scan the implementation for gaming patterns — hardcoded returns for test inputs, SUT-as-oracle, stack inspection — and HARD-BLOCK on a match. The chain: separate author → locked tests → implementation → gaming scan → mutation proof.

---

## Reference

### Planning

- [**`/loop-plan`**](docs/loop-plan.md) — 7-phase iterative planner: explores codebase → clarifies decisions → researches current patterns → writes plan → loops until you say "ship it" → executes with review gates

### Debugging

- [**`/loop-debug`**](docs/loop-debug.md) — 7-phase debugger: regression test written before investigation → root-cause analysis → fix pattern research → minimal fix + prevention design → intensity-gated execution with mutation testing

### Supporting agents

The installer optionally adds 42 agents across 8 groups. The skills use these at runtime — you pick which groups to install. Full reference: [docs/agents.md](docs/agents.md).

**Universal** — used across all stacks:

- [`loop-verifier`](docs/agents.md#loop-verifier) — goal-backward adversarial verifier (stage gates + terminal acceptance)
- [`test-writer`](docs/agents.md#test-writer) — separate TDD test author, separation-of-duties anti-cheating control
- [`spec-reviewer`](docs/agents.md#spec-reviewer) — verifies implementation matches the plan spec (Phase 7 gate)
- [`code-quality-reviewer`](docs/agents.md#code-quality-reviewer) — 11-dimension code quality review (Phase 7 gate)
- [`research-agent`](docs/agents.md#research-agent) — 5-step methodology research with date verification (Phase 3)
- [`test-runner`](docs/agents.md#test-runner) — test suite execution + mutation testing (Phase 7)
- [`second-opinion`](docs/agents.md#second-opinion) — cross-model Codex review, requires `OPENAI_API_KEY` (Phase 6)
- [`security-reviewer`](docs/agents.md#security-reviewer) — auth/injection/secrets audit
- [`srp-godclass-auditor`](docs/agents.md#srp-godclass-auditor) — God-class + LCOM4 cohesion detector
- [`dry-duplication-auditor`](docs/agents.md#dry-duplication-auditor) — Rule-of-Three duplication gate
- [`complexity-long-method-auditor`](docs/agents.md#complexity-long-method-auditor) — cyclomatic + cognitive complexity
- [`dip-dependency-direction-auditor`](docs/agents.md#dip-dependency-direction-auditor) — import cycles + layer violations
- [`naming-conventions-auditor`](docs/agents.md#naming-conventions-auditor) — naming smell detector
- [`comment-quality-auditor`](docs/agents.md#comment-quality-auditor) — comment hygiene (WHAT vs WHY)
- [`yagni-premature-abstraction-auditor`](docs/agents.md#yagni-premature-abstraction-auditor) — speculative-generality detector
- [`char-test-coverage-auditor`](docs/agents.md#char-test-coverage-auditor) — pre-refactor characterization test coverage gate
- [`adr-completeness-auditor`](docs/agents.md#adr-completeness-auditor) — MADR 4.0.0 schema completeness

**Android / KMP:**

- [`android-kmp-explorer`](docs/agents.md#android-kmp-explorer) — Android/KMP/Compose codebase exploration (Phase 1)
- [`android-coroutine-scope-leak-auditor`](docs/agents.md#android-coroutine-scope-leak-auditor) — GlobalScope/viewModelScope leak detector
- [`android-fgs-compliance-auditor`](docs/agents.md#android-fgs-compliance-auditor) — FGS Android 14/15 compliance
- [`android-r8-proguard-auditor`](docs/agents.md#android-r8-proguard-auditor) — R8/ProGuard AGP 9 keep-rule audit
- [`android-baseline-profile-checklister`](docs/agents.md#android-baseline-profile-checklister) — Baseline Profile setup completeness

**iOS / macOS / KMP interop:**

- [`swiftui-explorer`](docs/agents.md#swiftui-explorer) — iOS/SwiftUI codebase exploration (Phase 1)
- [`ios-appstore-preflight-auditor`](docs/agents.md#ios-appstore-preflight-auditor) — PrivacyInfo + Required Reason API preflight
- [`ios-codable-edge-auditor`](docs/agents.md#ios-codable-edge-auditor) — Codable semantic edge cases
- [`ios-coredata-migration-auditor`](docs/agents.md#ios-coredata-migration-auditor) — Core Data migration eligibility
- [`kmp-bridging-topology-auditor`](docs/agents.md#kmp-bridging-topology-auditor) — KMP source-set topology audit
- [`kmp-swift-interop-readiness-auditor`](docs/agents.md#kmp-swift-interop-readiness-auditor) — SKIE / Swift Export readiness
- [`macos-entitlements-distribution-auditor`](docs/agents.md#macos-entitlements-distribution-auditor) — entitlement/sandbox consistency
- [`macos-notarization-preflight-auditor`](docs/agents.md#macos-notarization-preflight-auditor) — notarytool CI pre-flight
- [`macos-appkit-swiftui-interop-auditor`](docs/agents.md#macos-appkit-swiftui-interop-auditor) — NSViewRepresentable seam audit

**Architecture:**

- [`compose-architect`](docs/agents.md#compose-architect) — Jetpack Compose UI architecture + MVVM design
- [`datalayer-architect`](docs/agents.md#datalayer-architect) — KMP data layer: repos, Ktor, Room, Koin

**React / Next.js:**

- [`react-nextjs-explorer`](docs/agents.md#react-nextjs-explorer) — React/Next.js/TypeScript codebase exploration (Phase 1)
- [`react-hooks-misuse-auditor`](docs/agents.md#react-hooks-misuse-auditor) — stale closures, missing deps, conditional hooks
- [`nextjs-rsc-boundary-auditor`](docs/agents.md#nextjs-rsc-boundary-auditor) — RSC vs client boundaries, data-fetch waterfalls

**TypeScript / Node.js:**

- [`typescript-strict-mode-auditor`](docs/agents.md#typescript-strict-mode-auditor) — `any` creep, unsafe casts, `@ts-ignore` usage
- [`nodejs-async-safety-auditor`](docs/agents.md#nodejs-async-safety-auditor) — unhandled rejections, blocking event loop

**Python:**

- [`python-async-correctness-auditor`](docs/agents.md#python-async-correctness-auditor) — blocking calls in async context, asyncio pitfalls
- [`django-fastapi-safety-auditor`](docs/agents.md#django-fastapi-safety-auditor) — migration safety, cascade risks, N+1 queries

**Vue / Nuxt:**

- [`vue-reactivity-pitfalls-auditor`](docs/agents.md#vue-reactivity-pitfalls-auditor) — destructured state loss, watch cleanup, computed SE
- [`nuxt-ssr-hydration-auditor`](docs/agents.md#nuxt-ssr-hydration-auditor) — SSR/CSR hydration mismatches, server-guard misuse

---

## Documentation

| | |
|---|---|
| 📖 [loop-plan guide](docs/loop-plan.md) | Phase-by-phase reference, tips, example sessions |
| 🐛 [loop-debug guide](docs/loop-debug.md) | Regression-test contract, intensity levels, workflow |
| 🤖 [Agents reference](docs/agents.md) | What each agent does and when it runs |
| ⚙️ [CLI reference](docs/cli.md) | All flags, sub-commands, environment variables |
| 🔧 [How it works](docs/how-it-works.md) | File layout, update mechanism, architecture |
| 📝 [Changelog](CHANGELOG.md) | Version history |

---

## Verify integrity

Every release ships `checksums.txt` with SHA-256 digests of all installed files:

```bash
cd $(npm root -g)/loop-skills
sha256sum -c checksums.txt
```

Or download `checksums.txt` from the [GitHub release](https://github.com/tech1ee/loop-skills/releases) and verify the files in `~/.claude/` directly.

---

## Security

The installer has no `postinstall` hook — nothing runs automatically on `npm install`. It only writes to `~/.claude/`, requires no elevated privileges, and shows every file write before it happens. See [SECURITY.md](SECURITY.md).

---

## Contributing

```bash
git clone https://github.com/tech1ee/loop-skills
cd loop-skills
npm install && npm run build && npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, CI gates, and the release process.

---

## License

[MIT](LICENSE)
