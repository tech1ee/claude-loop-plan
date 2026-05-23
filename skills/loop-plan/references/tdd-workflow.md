# TDD workflow — emission contract + Phase 7c sub-pipeline

Progressive-disclosure reference. Loaded on demand at Phase 4 (emission) and Phase 7c (execution).

Cites: ADR-0007 (strict RED→GREEN), ADR-0009 (mutation testing as terminal quality gate), ADR-0010 (per-task test specs + global Test plan section).

**Model:** vertical-slice (tracer-bullet) TDD. One behavior → one test → one impl → repeat. Never write all tests before all code ("horizontal slicing produces crap tests" — `tdd/SKILL.md`).

---

## Phase 4 emission contract

Every plan that targets executable code MUST emit:

### Per-task fields

For every task in `## Plan` that produces executable code (i.e. is not on the TDD opt-out matrix below), the task block MUST include — BEFORE the implementation steps:

```
Test behaviors:
  1. <Subject + action + observable outcome — WHAT not HOW>
  2. <Each behavior is testable through the public interface>
  3. ...
```

Examples of good behaviors:
- "Checkout succeeds with a valid cart and payment method."
- "Checkout fails when the payment method is expired."
- "Cart total updates immediately when an item is removed."

Each behavior is tested in order by the implementer (tracer-bullet model). Behaviors describe the external contract, not internal mechanics.

If the task opts out of TDD:

```
TDD: skipped — <reason from whitelist>
```

### Global `## Test plan` section

A new top-level section appears after `## Architecture & clean-code design` and before `## Drift check`:

```
## Test plan

### Frameworks
- <stack>: <test framework>
- ...

### Coverage target
- <stack>: NN% line / NN% branch (default 85/80)

### Mutation tool + threshold
- <stack>: <stryker | mutmut | pitest | muter>
- Tiered thresholds (per Stryker model): high NN / low NN / break NN
- Security/auth-tagged tasks: high 90 / low 70 / break 60
- Execution-time budget per task: 15 min wall-clock

### Behavioral test quality criteria
- Tests verify behavior through public interfaces only (no internal mocking of own modules)
- Test names describe WHAT not HOW ("should checkout with valid cart" not "should call PaymentService.charge")
- Each listed behavior has a corresponding test
- No tautological tests (expected value not computed by calling SUT)

### Opt-outs
- <task-id>: <reason from whitelist>

### Cited ADRs
- ADR-0007, ADR-0009, ADR-0010
```

---

## Phase 7c sub-pipeline (per executable task)

The orchestrator wraps each Phase 7c task in this 5-step expansion. Step 1 is the implementer dispatch (with internal TDD cycling); steps 2–5 are post-dispatch verification.

```
1. implementer (vertical-slice TDD)
   — Receives the Test behaviors: list + implementer-prompt-addendum.md
   — Cycles internally: one failing test → make GREEN → refactor → next behavior
   — Never writes all tests first (horizontal slicing produces crap tests)
   — Refactors ONLY after all behaviors are GREEN
   — Returns with all behaviors passing

2. test-runner mode: unit → must report PASS (GREEN).
   If FAIL: implementer did not satisfy all behaviors — re-dispatch with
   failure context (max 2 retries before user surface).

3. spec-reviewer behavioral test audit:
   (a) Each listed behavior has a test
   (b) Tests use public interface only — no internal mocking of own modules
   (c) Test names describe WHAT not HOW
   (d) No tautological tests (self-referential expected values)
   Findings block advancement if behavioral audit FAILS.

4. test-runner mode: mutation → terminal quality gate.
   Per-stack tool from Test plan § Mutation tool + threshold. Tiered thresholds
   applied per § Mutation tool + threshold below. Equivalent-mutant noise:
   low-tier surfaces surviving mutants to spec-reviewer for triage (advisory).
   15-min budget per task.

5. ADR confirm + accept — only after all gates green.
   Per-task confirmation appended to cited ADRs; proposed → accepted.
```

Skipped tasks (TDD opt-out — see § TDD opt-out matrix below): only step 1 runs without behavioral cycle. No post-dispatch gates.

---

## Behavioral test quality gate (spec-reviewer dimension)

The spec-reviewer receives the `Test behaviors:` list and verifies the test suite after the implementer completes. This replaces the pre-dispatch anti-tamper snapshot model.

| Dimension | Passing | Failing |
|---|---|---|
| Coverage | One test per listed behavior | Any behavior has no corresponding test |
| Interface discipline | Tests call only public methods/properties | Tests directly access private/internal state |
| Naming | Test names describe external outcome | Test names describe internal call sequence |
| Independence | Expected values are independent fixtures | Expected value computed by calling SUT |
| Mock discipline | Only system boundaries mocked (HTTP, DB, time) | Own modules mocked to isolate internals |

When spec-reviewer finds failures in any dimension: NEEDS_REWORK returned to implementer. Implementer must fix without changing the behavior list (behaviors are the spec).

---

## Mutation testing — language matrix (ADR-0009)

Per-stack default tools and tiered thresholds. Override in `## Test plan § Mutation tool + threshold` per project.

| Stack | Tool | Default tier (high / low / break) | Notes |
|---|---|---|---|
| TS / JS | Stryker (incremental mode) | 80 / 60 / 50 | `npx stryker run --incremental` |
| Python | mutmut | 80 / 60 / 50 | full Cosmic Ray run via nightly only |
| Java / Kotlin | PIT / Pitest | 80 / 60 / 50 | `./gradlew pitest` |
| Swift | Muter | 80 / 60 / 50 | scaling caveat — keep scope per-task |
| security/auth-tagged tasks | (any of above) | 90 / 70 / 60 | escalated thresholds |
| no tool configured for stack | — | — | gate skipped, recorded as `skipped — no tool for stack` |

### Tier behavior
- **≥ high**: PASS — task advances cleanly.
- **low ≤ score < high**: WARN — surfaces surviving mutants to spec-reviewer for triage; task advances; mutation report appended to plan.
- **break ≤ score < low**: WARN (same as low — both warn tiers).
- **< break**: HARD-BLOCK — mutation gate fails; re-dispatch implementer with mutation gap context; max 2 retries before user surface.

### Equivalent-mutant noise
Per Trail of Bits 2026-04-01: AI-assisted triage delivers 80% of insights for 1% of effort. When a low-tier surviving mutant is surfaced to the spec-reviewer, it includes the line + operator + mutated code. Reviewer marks as `equivalent` (false-positive) or `actionable` (test missing). Equivalent verdicts are never blocking — they are recorded in the plan as `mutation_triage_notes`.

### Execution-time budget
Each `test-runner mode: mutation` invocation is bounded at 15 minutes wall-clock (industry norm — multiple 2025 sources). On budget exceed, the runner kills the mutation tool and reports `BUDGET_EXCEEDED`. Orchestrator records `state.tests_state[].mutation_score = "skipped — budget exceeded (15 min)"` and the task advances. Configurable per-project via `## Test plan § Mutation tool + threshold § budget_minutes`.

---

## Anti-cheating guardrails (ADR-NEW-D — applies at rigor=tdd-only and rigor=full)

Research consensus (ImpossibleBench 2025, METR reward-hacking 2025, Meta ACH FSE-2025, TDD-Governance arxiv:2604.26615) shows prevention beats detection. The primary guarantee is structural; detection is the backstop.

### Layered guardrails (applied per-task by the orchestrator — Phase 7b)

**P1 — Separation of duties (load-bearing anti-cheat control)**

The `test-writer` agent authors tests from the `Test behaviors:` spec **before** the implementer is dispatched. The implementer never writes the tests it must satisfy. The orchestrator:
1. Dispatches `test-writer` subagent with task spec by-value → test-writer returns file paths + RED proof.
2. Calls `test-integrity.py snapshot --task <id> --files <paths>` to hash-lock tests.
3. Dispatches implementer — tests are read-only (PreToolUse hook blocks edits).
4. Calls `test-integrity.py verify --task <id>` after GREEN — any tamper → HARD-BLOCK.

**P5 — Strict anti-gaming prompt (applied in `implementer-prompt-addendum.md` tier-conditional section)**

Explicit, concrete prohibition list (see addendum § Anti-gaming prohibitions). Aligned models show ~0% exploit rate (RHB May 2026 — RLHF-aligned) when prohibition is specific and concrete.

**V2 — Guard-mutation (validate the oracle BEFORE impl)**

Before dispatching the implementer, run:
```bash
~/.claude/bin/test-integrity.py guard-mutation --task <id> --files <test-files> --stub <path>
```
Applies 3–5 trivial breaks to a stub, asserts each spec test goes RED. Any test staying GREEN → tautological / assertion-free → HARD-BLOCK (do not proceed to implementer).

**D1 — Impl-diff lint (cheat-detector)**

After the implementer returns, BEFORE spec-reviewer:
```bash
~/.claude/bin/detect-test-gaming.py --diff <impl-diff> --test-files <test-files>
```
Flags: constants verbatim from test expecteds, branches on test-fixture input values, `__eq__`/`__hash__`/`__bool__` overrides outside dataclasses, `inspect.stack()`/`sys._getframe()` outside logging, sentinel-string prints. Any flag → HARD-BLOCK + re-dispatch implementer (max 2 retries).

**D2 — Tautology scanner**

After the implementer returns:
```bash
~/.claude/bin/detect-tautological-tests.py --test-files <test-files>
```
Flags: assertion-free tests, `expected = sut(input)`, zero-variance expecteds, over-mock ratio >50%. Any flag → HARD-BLOCK (re-dispatch test-writer, since the test was authored before impl, a flag here usually means a pre-existing tautology in the test — fix the test, then re-lock + re-impl).

**V1 — Mutation floor (non-skippable when rigor∈{tdd-only,full})**

Mutation gate is **mandatory**. The only valid exemptions are:
- `BUDGET_EXCEEDED` (15-min wall-clock cap) — record `skipped — budget exceeded (15 min)` and advance.
- `no tool configured for stack` — record `skipped — no tool for stack` and advance.

Do NOT skip the mutation gate because "the tests look fine" or "it's a simple task." The mutation floor is the safety net; skipping it is the single biggest risk in fix work (ADR-0014).

### PBT recipe (recommended-not-mandatory for invariant-bearing functions)

After all tracer-bullet behaviors are GREEN, add a Property-Based Test (PBT) for functions with a mathematical invariant. PBT makes special-casing (the dominant cheat — ImpossibleBench: 49–54%) infeasible at scale.

**Function-shape → invariant table:**

| Shape | Invariant | Example |
|---|---|---|
| Round-trip (serializer/deserializer) | `decode(encode(x)) == x` | JSON, protobuf, Base64 |
| Idempotent (normalizer, formatter) | `f(f(x)) == f(x)` | trim, normalize, deduplicate |
| Commutative (merger, combiner) | `f(a,b) == f(b,a)` | union, sum, max |
| Size-relation (filter, sort) | `len(f(x)) <= len(x)` | filter, unique |
| Inverse-pair | `undo(do(x)) == x` | encrypt/decrypt, push/pop |
| Monotone (rank, score) | `a <= b → f(a) <= f(b)` | priority queue, sort key |

**Hypothesis (Python) recipe:**

```python
from hypothesis import given, settings
from hypothesis import strategies as st

@given(st.lists(st.integers()))
@settings(max_examples=1000, deadline=5000)
def test_sort_invariant(xs):
    result = my_sort(xs)
    assert len(result) == len(xs)          # size preserved
    assert sorted(result) == sorted(xs)    # same elements
    assert all(result[i] <= result[i+1] for i in range(len(result)-1))  # ordered
```

**PBT × mutation complementarity:** mutation kills off-by-one errors; PBT kills special-casing. Use both for security-tagged functions and any function that processes user-controlled input.

---

## Tautological-test detection heuristic (Phase 6b second opinion)

The `second-opinion` agent receives an extended `context_hint` for the test-suite review pass. It flags:

1. **Self-referential expected values**: tests where the expected value is computed by calling the SUT under test. Example: `expect(sortFn([3,1,2])).toEqual(sortFn([3,1,2]))`.
2. **Mock-locks-output**: mock returns hard-coded to match SUT output rather than independent fixtures. Example: a mock returns `{ok: true}` and the assertion checks `result.ok === true` — provides no independent verification.
3. **Assertion-implementation drift**: assertions that mirror impl logic 1:1.
4. **Mock count > assertion count** or **mock setup > test logic** (over-mocking signal).
5. **Missing edge cases for the behaviors listed**: did the test cover boundary / null / empty / max-size cases for each behavior.
6. **Mutation tool fit-for-stack**: e.g. don't propose Stryker for a Python repo.

Findings surface under `## Test-suite second opinion` sub-section in the plan. Per `rules/orchestration.md` cross-model review layer, findings are advisory — never blocking.

Cite Shubham Sharma 2026-03-06 (tautological-test failure mode), Meta JiT InfoQ 2026-04 (cross-model verification pattern).

---

## TDD opt-out matrix

Vertical-slice TDD is the default for every plan task. The following task types may explicitly opt out by adding `TDD: skipped — <reason>`.

### TDD required (default — no opt-out)
- Business logic, domain rules, validation
- Parsing, serialization with non-trivial logic
- Data transformation, query building
- Control-flow code (state machines, dispatch)
- Anything that affects user-visible behavior

### TDD optional (judgment call — author decides)
- UI components in rapid prototyping (visual review primary)
- Library wrappers / integration glue (test the integration, not the wrapper)
- Refactors with no behavior change (existing tests are the gate)

### TDD skipped (explicit opt-out — must cite reason from this list)
- `config-only` — pure configuration files (TOML, YAML, JSON), no logic
- `boilerplate` — scaffolded code with no decisions (e.g. fresh `__init__.py`)
- `generated-schema` — protobuf, GraphQL resolvers, OpenAPI clients (auto-generated)
- `tight-contract-serialization` — serializers where the data shape IS the contract (cite Augment Code 2025)
- `migration-managed-by-sdd` — schema migrations validated via dependency mapping + manual review of top 3 high-impact services + staged rollback
- `docs-only` — markdown / comment changes
- `formatter-only` — lint fixes from PostToolUse hooks
- `meta-planner-edit` — edits to loop-plan / requirements-interviewer / writing-plans skill itself (no runtime tests for prompts)

### Opt-out signaling

In the plan's `## Plan` section, opt-out tasks include:
```
TDD: skipped — <reason from whitelist>
```

### Drift-check rule 12

For every task with `TDD: skipped`, the reason must be from the whitelist above. Otherwise mark as DRIFT (unjustified opt-out).

### Default behavior

When a task's nature is ambiguous, the planner emits TDD-required and the user can override at Phase 5 or via direct plan edit. Better to require an explicit opt-out than to skip silently.

---

## Failure-mode response matrix

| Failure mode | Where caught | Response |
|---|---|---|
| Implementer doesn't satisfy a behavior | step 2 (unit FAIL) | Re-dispatch implementer with failure context; max 2 retries |
| Tests use internal mocking / private access | step 3 (behavioral audit) | NEEDS_REWORK — implementer must fix without changing the behavior list |
| Test names describe HOW not WHAT | step 3 (behavioral audit) | NEEDS_REWORK |
| Tautological tests | step 3 + step 4 (mutation) + Phase 6b second opinion | Mutation: low-tier triage; second opinion: advisory flag |
| Mutation score below break threshold | step 4 (mutation gate) | HARD-BLOCK — re-dispatch implementer with mutation gap context; max 2 retries |
| Missing behaviors (behavior list incomplete) | step 3 (spec-reviewer) | NEEDS_REWORK — implementer adds tests for missing behaviors |
