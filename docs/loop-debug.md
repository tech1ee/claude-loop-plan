# `/loop-debug` — Systematic Regression-First Debugger

`/loop-debug` is a 7-phase debugging skill for [Claude Code](https://claude.ai/code) that enforces a regression test _before_ any investigation begins. It traces root causes, researches fix patterns, and writes a prevention design — not just a patch.

## Table of contents

- [Quick start](#quick-start)
- [The core contract](#the-core-contract)
- [Phase reference](#phase-reference)
- [Intensity levels](#intensity-levels)
- [The T0a / T-fix / T0b model](#the-t0a--t-fix--t0b-model)
- [Exit signals](#exit-signals)
- [Tips](#tips)
- [When to use loop-debug vs a quick fix](#when-to-use-loop-debug-vs-a-quick-fix)
- [Example session](#example-session)

---

## Quick start

Open Claude Code and describe the bug:

```
/loop-debug the feed crashes when the user scrolls past 100 items
/loop-debug sync fails silently when the device is in airplane mode
/loop-debug login returns 200 but the session cookie is not set on iOS Safari
```

Claude will write a regression test first, investigate, research, and plan — then you choose the intensity and say ship it.

---

## The core contract

> **T0a must be RED before the fix. GREEN after. No exceptions.**

Before Claude investigates anything:
1. It extracts a **bug signature** from your description
2. It writes **T0a** — a test that reproduces the failure
3. It runs T0a to confirm it fails (RED)

Only then does investigation begin. The fix must turn T0a GREEN. If it doesn't, the loop continues.

This contract prevents:
- "Fix" that doesn't actually fix the bug
- Regression of the same bug in a future change
- Investigation bias (no pre-formed hypotheses before the test captures the actual behavior)

---

## Phase reference

### Phase 0 — Reproduce

Claude extracts a bug signature from your description — a short normalized string capturing the failure mode, e.g. `feed-crash-scroll-100-items`.

Then it writes **T0a**, a regression test that:
- Exercises the exact code path described
- Asserts the incorrect behavior is present (fails RED)
- Is minimal — tests one thing

> [!IMPORTANT]
> T0a is written as a **characterization test first** — it captures what the code _currently does_. The assertion is then inverted to describe what it _should_ do. This distinguishes a regression test from a unit test.

---

### Phase 1 — Investigate

Three parallel explorers investigate the codebase simultaneously:

| Explorer | Investigates |
|----------|-------------|
| **Root-cause** | Traces the execution path to where the failure originates |
| **Scope** | Maps all callers and consumers that could be affected by the fix |
| **Existing coverage** | Finds tests that already cover the affected code — what's protected, what isn't |

If 3 or more plausible root-cause hypotheses emerge, Claude automatically activates adversarial agent mode: multiple agents investigate competing hypotheses and challenge each other's findings.

---

### Phase 2 — Clarify

A targeted `AskUserQuestion` to confirm:

- **Scope** — is this isolated to the reported scenario, or is it a class of bugs?
- **Severity** — P0 production fire, regression from last release, or long-standing issue?
- **Fix shape** — minimal patch, refactor the surrounding code, or address the root class?
- **Acceptance** — what does "fixed" look like? Is there an existing test we can point to?

> [!NOTE]
> Intensity (minimal/standard/hardened) is **not** chosen here. It's Phase 5 — after you've seen the root-cause findings and plan. This order matters: you can't know the right intensity until you know how deep the bug goes.

---

### Phase 3 — Research

Date-strict research focused on this specific bug class:

- Fix patterns and their trade-offs for this type of failure
- Prevention strategies (what would have caught this earlier)
- Known occurrences in the same library/framework version
- Related CVEs or known issues (for security-relevant bugs)

---

### Phase 4 — Plan

Three-task structure written to `~/.claude/plans/debug-<slug>.md`:

```
T0a — Regression test (already written in Phase 0)
      Status: RED (confirmed)
      File: test/sync/SyncQueueTest.kt
      Asserts: queue.drain() returns FAILURE when offline

T-fix — Minimal fix
       Scope: SyncManager.kt:drain() — offline detection branch
       Changes: replace `networkAvailable` check with ConnectivityManager API
       Required: T0a goes GREEN

T0b — Prevention design
      What would have caught this earlier?
      → Unit test for offline state detection
      → Integration test for drain() under all ConnectivityManager states
      → Lint rule: prohibit direct field access on networkAvailable
```

---

### Phase 5 — Loop gate

Review the root-cause findings and plan, then choose intensity:

```
╔═══════════╦════════════╦════════════╗
║  Minimal  ║  Standard  ║  Hardened  ║
╚═══════════╩════════════╩════════════╝

Then:  [ Ship it ]  [ More research ]  [ Back to Phase N ]
```

The intensity you choose gates the execution pipeline in Phase 6.

---

### Phase 6 — Execute

```
T0a (RED) confirmed
  ↓
Implement T-fix
  ↓
Run T0a → must be GREEN
  ↓
Run full test suite
  ↓
Spec-reviewer (at Standard+)
  ↓
Mutation testing: post-fix score ≥ pre-fix score
  ↓
T0b prevention tasks (at Standard+)
  ↓
Cross-model review (at Standard+)
  ↓
Security pass (at Hardened)
```

If T0a is not GREEN after the fix, Claude returns to Phase 5.

---

## Intensity levels

| | Minimal | Standard | Hardened |
|---|:---:|:---:|:---:|
| T0a regression test | ✓ | ✓ | ✓ |
| Full test suite | ✓ | ✓ | ✓ |
| Spec-reviewer gate | — | ✓ | ✓ |
| Mutation testing | — | ✓ | ✓ |
| T0b prevention design | — | ✓ | ✓ (deep) |
| Cross-model Codex review | — | ✓ | ✓ |
| Security pass | — | — | ✓ |
| Code-quality-reviewer | — | — | ✓ |

**Choose Minimal** for isolated, well-understood bugs with clear reproduction steps and no downstream risk.

**Choose Standard** (default) for production bugs, regressions, and anything with 2+ callers affected.

**Choose Hardened** for security-relevant bugs, data-loss scenarios, or bugs in critical shared infrastructure.

---

## The T0a / T-fix / T0b model

Loop-debug structures every fix into three parts:

### T0a — Regression test
Written before investigation. Captures the exact failure. Must be RED before the fix and GREEN after. Locked during implementation so it cannot be changed.

### T-fix — Minimal fix
The smallest change that turns T0a GREEN. No surrounding cleanup, no refactoring unless it's the root cause. Scope is bounded by what was agreed in Phase 2.

### T0b — Prevention design
What would have caught this before it shipped? T0b produces:
- Additional tests for the bug class (not just this instance)
- Lint rules or static analysis additions
- Code structure changes that make the bug impossible
- Documentation of the invariant that was violated

T0b tasks run after T-fix. At Minimal intensity, T0b is skipped.

---

## Exit signals

Say any of these at the Phase 5 gate after choosing intensity:

| English | Russian |
|---------|---------|
| `ship it` | `поехали` |
| `go` | `начинай` |
| `let's fix` | `погнали` |
| `looks good` | |

---

## Tips

**Writing better bug descriptions:**
- Include what you expected vs. what happened
- Mention the exact scenario (device, OS version, data state) if relevant
- If you have a stack trace or error message, paste it in

**When T0a can't reproduce the bug:**
- Tell Claude the reproduction steps in Phase 2 Clarify
- If the bug is flaky, describe the conditions under which it appears
- Claude will write a best-effort T0a; you can correct it before Phase 6

**Scope creep prevention:**
- Choose **Minimal** fix shape in Phase 2 if you want a surgical patch
- The T-fix is intentionally bounded — surrounding cleanup is a separate task
- Use `/loop-plan` to address the larger refactor if Phase 1 found structural issues

**When the mutation score drops:**
- This means the fix weakened the test suite — some existing tests became irrelevant
- Claude will surface which tests to strengthen before closing the loop
- Do not skip this gate for Standard/Hardened intensity

---

## When to use loop-debug vs a quick fix

| Scenario | Use |
|----------|-----|
| Typo in a string or trivial config value | Just fix it directly |
| UI rendering issue with an obvious cause | Direct fix |
| Bug with clear cause and no test coverage | `/loop-debug` (Minimal) |
| Production bug that users hit | `/loop-debug` (Standard) |
| Bug that appeared before in a different form | `/loop-debug` (Standard) |
| Security vulnerability | `/loop-debug` (Hardened) |
| Data loss scenario | `/loop-debug` (Hardened) |
| Flaky test with unclear cause | `/loop-debug` (Standard — use investigation to find root cause) |

The rule of thumb: if you're not 100% sure why the bug happens, use `/loop-debug`. The investigation phase costs 2 minutes. Shipping a patch that doesn't fix the root cause costs much more.

---

## Example session

```
You: /loop-debug login returns 200 but session cookie not set on iOS Safari

Phase 0  Bug signature: auth-login-200-no-cookie-ios-safari
         Writing T0a regression test...
         ✓ Test written: test/auth/LoginCookieTest.ts
         Running T0a... FAIL (RED) ✓

Phase 1  Investigating root cause...
         Explorer 1: traces /api/auth/login → session middleware → setCookie()
                     found: SameSite=Strict blocks cross-origin cookie on Safari
         Explorer 2: scope — 3 endpoints affected (login, refresh, logout)
         Explorer 3: coverage — 0 tests for cookie attributes

Phase 2  Clarifying:
         → Severity: production — 40% of iOS users affected
         → Fix shape: patch SameSite attribute, add secure flag
         → Acceptance: T0a GREEN + integration test on Safari user-agent

Phase 3  Researching...
         ✓ Safari ITP and SameSite behavior (2024-current)
         ✓ IETF RFC 6265bis — SameSite=Lax for cross-site login flows
         ✓ AWS ALB cookie passthrough documentation

Phase 4  Plan written:
         T0a: LoginCookieTest.ts — asserts cookie present after 200
         T-fix: Set SameSite=Lax + Secure flag in session middleware
         T0b: Integration test for all 3 affected endpoints × Safari UA

Phase 5  Intensity: [ Standard ]   → Ship it

Phase 6  Implementing T-fix...
         T0a: GREEN ✓
         Full suite: 147/147 ✓
         Spec-reviewer: PASS ✓
         Mutation: 89% → 91% (improved) ✓
         T0b tasks: 2/2 ✓
```
