# Prevention design — T0b task contract

T0b is the prevention task emitted at Phase 4 alongside T0a (regression test) and T-fix. It does NOT implement anything — it produces a structured list of prevention recommendations across 5 categories. The user picks which (if any) to land as follow-up tasks.

Cite ADR-0019 (this skill), ADR-0014 (mutation floor — the safety net that keeps T-fix honest while T0b prevents the *class* of bug).

## Why the catching/hardening split matters

Per Meta's ACH (Automated Compliance Hardening) research, *catching tests* and *hardening tests* serve different goals:

- **Catching test (T0a)**: detects faults in new or changed code. Fails when this specific bug is reintroduced.
- **Hardening test / rule (T0b)**: prevents the *class* of bug from being introduced in the first place. Fires across the codebase, not just at the bug site.

Conflating them is the failure mode loop-debug exists to defend against. T0a says "this bug must not come back HERE." T0b says "no bug like this can be introduced ANYWHERE."

## The 5 prevention categories

For each bug T0b emits, the categories are evaluated in this order. Most bugs map to 1–2 categories; some map to none (LOW-risk bugs skip T0b).

### 1. `lint-rule` — static syntactic / pattern check

**When to use:** the bug has a syntactic fingerprint a linter can match. Pattern misuse, banned API, missing call to a required helper, unsafe construct.

**Examples:**
- "Missing `WHERE` clause in raw SQL `UPDATE`" → custom ESLint / detekt / SwiftLint rule.
- "Calling `.copy()` without explicit field set on a Kotlin data class with PII" → detekt rule.
- "Using `Date()` without `Clock` injection" → custom detekt rule.

**Format emitted:**
```yaml
category: lint-rule
tool: <eslint|detekt|swiftlint|custom>
rule_id: <slug>
pattern: <regex or AST matcher>
fixer: <auto-fix code if safe; otherwise null>
severity: <error|warn>
justification: <one sentence linking to the bug>
follow_up_task_size: <S|M|L>
```

**Trade-off:** lint catches future violations cheaply but only the syntactic shape — semantically-equivalent bugs slip past. Combine with type-constraint or contract-test for stronger guarantees.

### 2. `type-constraint` — make invalid states unrepresentable

**When to use:** the bug exists because the type system allowed an invalid combination. Nullable that should never be null, two fields that should be mutually exclusive but type allows both, primitive-obsession bug.

**Examples:**
- NPE bug → tighten nullable type, OR introduce sealed-class state instead of optional fields.
- Wrong-currency bug (charged in USD when user picked JPY) → introduce `Money(amount, currency)` value class instead of raw `Int`.
- Mixed-state bug ("loading + error simultaneously") → sealed `UiState` instead of `{loading: Bool, error: String?}`.

**Format emitted:**
```yaml
category: type-constraint
shape: <nullable-tightening|sealed-class|value-class|phantom-type|enum-replacement>
target_type: <fully-qualified type name>
proposed_change: <pseudocode>
breaking: <yes|no — if yes, list call sites>
justification: <one sentence linking to the bug>
follow_up_task_size: <S|M|L>
```

**Trade-off:** strongest prevention (compile-time) but breaks call sites. For shipped products, weigh migration cost vs prevention value. For greenfield code, prefer this category.

### 3. `contract-test` — property / invariant test that runs on every build

**When to use:** the bug is a violation of an *invariant* the system should always hold. Idempotence, conservation, monotonicity, round-trip equivalence, schema compatibility.

**Examples:**
- "Charge endpoint sometimes returns 200 but doesn't persist the charge" → contract: "after `POST /charge` returns 200, GET on the returned id MUST return the charge with same amount."
- "Cache get-after-put returns stale" → contract: "for any (key, value) where put(k,v) succeeded, get(k) returns v until ttl elapses."
- "Migration loses field X on round-trip" → contract: "for any record R, `deserialize(serialize(R)) == R`."

**Format emitted:**
```yaml
category: contract-test
test_kind: <property-based|round-trip|idempotence|conservation|schema-compat>
framework: <kotest|hypothesis|jqwik|swift-testing|fast-check>
invariant: <one-sentence formal statement>
generator: <how inputs are generated — Arb<X>, hypothesis.strategies.X, etc>
target_files: <list of files the test would live in>
justification: <one sentence linking to the bug>
follow_up_task_size: <S|M|L>
```

**Trade-off:** much stronger than example-based tests (catches whole input space) but harder to write and slower to run. Worth it for HIGH-risk bugs (payments, auth, data loss, cache correctness).

### 4. `runtime-invariant` — assertion / guard that fires in production

**When to use:** the bug existed silently in production for a while because no signal fired. Add a runtime check that fails loudly when the invariant breaks (or surfaces a metric / log line).

**Examples:**
- Silent data corruption → `require(record.invariant) { "data corruption: …" }` at write boundary; metric `invariant.violation.count`.
- Auth state inconsistency → `check(user.session != null || !user.isAuthenticated)`; structured log on violation.
- Cache key collision → assert key uniqueness within a request scope; metric `cache.collision.count`.

**Format emitted:**
```yaml
category: runtime-invariant
assertion_kind: <require|check|assert|metric|structured-log>
location: <file:line where to insert>
condition: <pseudocode>
on_violation: <throw|metric|log|all>
performance_cost: <free|negligible|significant>
ship_in: <debug-only|all-builds|sampled-1pct|sampled-0.01pct>
justification: <one sentence linking to the bug>
follow_up_task_size: <S|M|L>
```

**Trade-off:** catches bugs in production rather than at compile-time, so always-late vs always-early. Sampled invariants are good for performance-sensitive paths.

### 5. `mock-harness` — improved test infrastructure to make this bug class easier to test

**When to use:** the bug went undetected because the test infrastructure made it hard to reproduce. Time-dependent, env-dependent, integration-shaped bugs that unit tests couldn't catch.

**Examples:**
- Timing bug → introduce `TestClock` / `FakeScheduler` to make all time-dependent code testable.
- Locale bug → standardize a `LocaleHarness` that injects locale into every Composable / View under test.
- Integration bug → add a `TestContainers` fixture for the misbehaving service.

**Format emitted:**
```yaml
category: mock-harness
shape: <fake-clock|locale-harness|test-containers|fake-network|fake-storage|other>
files_to_add: <list>
files_to_modify: <list of existing test files that adopt the harness>
ergonomic_cost: <minimal|noticeable|significant>
justification: <one sentence linking to the bug>
follow_up_task_size: <S|M|L>
```

**Trade-off:** infrastructure work (cost) for capability gain (tests can now reach a bug class they previously couldn't). Pays off when the same bug class recurs.

## Decision tree by bug class

| Bug class | Recommended categories (priority order) |
|---|---|
| **NPE / unwrap-nil** | type-constraint (tighten nullability) + lint-rule (banned `!!` / `force-unwrap` in target package) |
| **Off-by-one / boundary** | contract-test (property-based with boundary generator) + runtime-invariant (range assert) |
| **Race condition** | mock-harness (FakeScheduler / virtual time) + contract-test (concurrent property) |
| **Stale cache** | contract-test (get-after-put invariant) + runtime-invariant (TTL violation metric) |
| **Validation gap** | type-constraint (newtype wrap raw input) + lint-rule (require validator at boundary) |
| **Wrong-currency / wrong-unit** | type-constraint (value class / phantom type) — single most effective category here |
| **Auth bypass** | runtime-invariant (assert auth context) + contract-test (auth required for X) + lint-rule (banned unguarded route) |
| **Data corruption / serde drift** | contract-test (round-trip property) + runtime-invariant (write-time assert) |
| **i18n / locale** | mock-harness (LocaleHarness) + lint-rule (banned hardcoded date format) |
| **Memory leak** | contract-test (LeakCanary fixture) + mock-harness (managed lifecycle scope) |
| **Migration / schema-drift** | contract-test (schema-compat test) + runtime-invariant (version-mismatch fail-loud) |
| **Scope creep / "while I'm here"** | lint-rule (commit-msg pattern enforcing single-purpose) + reviewer-policy (advisory) |

## When T0b is skipped

T0b is auto-emitted for MED/HIGH-risk bugs. It's skipped when:

- `state.bug_risk == "LOW"` (typo in error message, dev-only logging gap, cosmetic bug). User can opt in.
- `intensity == "minimal"` (always skipped per ADR-0019).
- Bug is a one-time data fix (e.g. corrupt row in production DB) — no class to prevent.

`intensity == "hardened"` makes T0b mandatory regardless of risk.

## Output format (Phase 6b)

T0b's output is appended to the plan file in this shape:

```markdown
### T0b — prevention-design-<slug> output

The fix landed (T-fix is GREEN, mutation post ≥ pre). Recommendations to prevent
the **class** of bug from recurring:

#### Recommendation 1: <category> — <short title>
- **Justification:** …
- **Follow-up task size:** S/M/L
- **Apply?** ☐ Accept   ☐ Reject   ☐ Defer (open as ADR-tech-debt)

[…repeat per recommendation…]
```

The user reviews the list and selects which to land. Each accepted item becomes a follow-up task in a future loop-plan / loop-debug invocation. Rejected items get a one-line "rejected because X" record in `state.prevention_recommendations[]`. Deferred items become tech-debt ADRs (cite ADR-0014's deferral pattern).

## Anti-patterns

| Anti-pattern | Why it fails |
|---|---|
| Emitting T0b implementation alongside T-fix | Scope explosion — T-fix must stay minimal. T0b is advisory; user picks. |
| Recommending all 5 categories every time | Cognitive load. Pick 1–2 highest-value ones per bug. |
| `category: contract-test` with no concrete invariant | Useless — "add property test for X" is not a prevention; it's a wish. State the invariant. |
| Missing `breaking: yes/no` on type-constraint changes | Causes silent migration cost. Always enumerate call sites. |
| Recommending `runtime-invariant` with `performance_cost: significant` and no sampling | Production hazard. Default to sampled or debug-only when cost is high. |
| Auto-applying any T0b recommendation without user review | Violates the contract — T0b is advisory. Apply requires explicit user accept. |

## Cross-references

- [`./bug-reproduction-harness.md`](./bug-reproduction-harness.md) — Phase 0 input format that feeds T0a and T0b's `justification` fields.
- [`./debug-drift-rules.md`](./debug-drift-rules.md) — rule 17 enforces T0b emission for non-LOW-risk bugs.
- [`../../loop-plan/references/design-and-quality.md`](../../loop-plan/references/design-and-quality.md) § principles — SOLID/KISS/DRY/YAGNI apply to T0b recommendations themselves.
- `superpowers:systematic-debugging` (`defense-in-depth.md`) — multi-layer prevention model that informs the 5 categories above.
