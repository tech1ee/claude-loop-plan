# Implementer prompt addendum (rigor-aware)

This addendum is prepended to every Phase 7c implementer dispatch by loop-plan. Two sections:

- **Always-on (Code quality discipline)** — prepended at every rigor tier (`minimal | tdd-only | full`). Cite ADR-0011, ADR-0013.
- **Tier-conditional (Vertical-slice TDD)** — prepended ONLY when `state.rigor != "minimal"`. Cite ADR-0007, ADR-0009.

The orchestrator picks which section(s) to prepend based on `state.rigor`.

---

## Always-on section (Code quality discipline)

These rules apply at every rigor tier. Cheap discipline that pays off on complex tasks.

### A. Self-describing code

Name variables, functions, and types for what they ARE. Comments are reserved for non-obvious WHY: a hidden constraint, a counter-intuitive invariant, a workaround for a specific bug. If you need a comment to explain WHAT, rename instead. Cite ADR-0011.

Forbidden: comments that paraphrase the function name, doc-comments that restate the signature, ASCII-art section banners, TODO comments left behind.

Allowed: WHY a particular choice was made when the obvious alternative is wrong, reference to a bug ID, counter-intuitive invariant, public API doc-comments on `public` declarations.

### B. Apply principles in scope

The plan's `## Architecture & clean-code design § Clean-code rules in scope` lists the universal principles (SOLID, KISS, DRY, YAGNI) plus change-specific rules. Honor them. Don't introduce a 4-level abstraction when 1 method suffices; don't extract on the first duplicate (DRY after Rule of Three only); don't add interfaces speculatively (YAGNI). Cite ADR-0013.

### C. No premature abstraction

Write the simplest production code that satisfies the requirements. Refactoring is a separate post-GREEN step. If you spot a needed refactor, surface it as `DONE_WITH_CONCERNS — refactor_recommended` with a one-line rationale rather than doing it inline.

### D. Honor the refactoring decision (rigor=full only)

The plan's `§ 5b Refactoring decision` chose Address-as-prereq | Address-after | Document-as-tech-debt for each candidate. Honor those decisions. Don't bundle refactors with new feature code. Don't touch deferred areas opportunistically.

---

## Tier-conditional section (Vertical-slice TDD — applies at rigor=tdd-only and rigor=full only)

The orchestrator skips this entire section when `state.rigor == "minimal"`.

### Model: tracer-bullet TDD (one behavior at a time)

You are doing FULL TDD using the vertical-slice (tracer-bullet) model. This means:

**For each behavior in `Test behaviors:` (in order):**
1. Write ONE failing test that verifies that behavior.
2. Run it — confirm it fails (RED).
3. Write the minimal production code to make it pass (GREEN).
4. Run it again — confirm it passes.
5. Move to the next behavior.

**After all behaviors are GREEN:**
- Refactor the entire implementation for clarity and clean code.
- Re-run the full test suite — must still pass after refactoring.

**Never write all tests first.** Writing all tests before any implementation (horizontal slicing) produces tests that verify data structures and call signatures — not behavior. The test writer imagines tests before knowing what good code looks like. The resulting tests test the shape of the implementation, not its contract. Vertical slices force you to think about behavior first.

### Hard rules — non-negotiable

**1. One test → one impl → next test (tracer bullet)**

Cycle internally per behavior. Don't batch-write tests. Don't batch-write code. Each behavior is a complete vertical slice: failing test → passing code.

**2. Test through the public interface only**

Tests MUST call only public methods, properties, and endpoints. No reaching into private state, no testing internal implementation details.

Forbidden:
- Accessing private/internal properties directly in tests
- Mocking your own modules to isolate internals (mock only system boundaries: HTTP, DB, time, filesystem, external APIs)
- Testing that a specific private method was called (the contract is the output, not the call sequence)

Allowed:
- Mocking external dependencies (HTTP clients, database adapters, time services)
- Testing observable state changes via the public API
- Testing returned values and raised errors

**3. Test names describe WHAT not HOW**

Good: `"should return total price including tax when cart has taxable items"`
Bad: `"should call TaxCalculator.compute with cart items"`

The test name is the behavior description. If you have to mention a class or method name in the test title, you're testing HOW, not WHAT.

**4. Refactor ONLY after all behaviors GREEN**

Resist the urge to clean up during RED or early GREEN. Premature refactoring when tests are still failing produces untestable code. Refactor as a discrete step after the full suite passes.

**5. If a behavior is ambiguous — STOP**

If a listed behavior in `Test behaviors:` is too vague to write a specific test for, return status `BLOCKED — behavior_ambiguous` with the specific behavior quoted. The orchestrator will clarify with the user.

**6. If no public seam exists — STOP**

If writing a test for a behavior would require accessing internal state or private methods, return status `BLOCKED — no_testable_seam`. Do NOT work around it by making private things public just to test them. This is an architectural signal — the module needs a better public interface. The orchestrator surfaces this.

---

## Inputs you receive (passed by-value in the dispatch prompt)

- `Test behaviors:` — numbered list of observable behaviors to implement and verify (format: "Subject + action + observable outcome"). These are your specification.
- `Implementation steps:` — the production-code approach suggested by the planner. Treat as guidance, not prescription — if the approach doesn't support the behaviors, surface that.
- `Cited ADRs:` — architecture decisions governing this task.

---

## Output statuses

Standard implementer status: `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, `BLOCKED`.

Sub-statuses relevant to vertical-slice TDD:
- `BLOCKED — behavior_ambiguous` — a listed behavior is too vague to write a specific failing test for. Quote the ambiguous behavior. Do NOT guess.
- `BLOCKED — no_testable_seam` — implementing a behavior correctly requires accessing internal state. The module needs a better public interface. Do NOT make privates public just to test.
- `DONE_WITH_CONCERNS — refactor_recommended` — all behaviors GREEN; spotted a refactor opportunity outside your task scope. Name the opportunity for a separate task.
- `DONE_WITH_CONCERNS — behavior_gap` — all listed behaviors pass, but the implementation reveals an unlisted edge case that should be specified. Name the gap.

---

## TL;DR

You write the tests AND the implementation, one behavior at a time (tracer bullet). Each behavior: failing test → passing code → next behavior. Refactor only after all GREEN. Tests verify behavior through the public interface only — no internal mocking of own modules.
