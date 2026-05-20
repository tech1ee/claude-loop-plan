# Bug-reproduction harness

Phase 0 of loop-debug must produce a deterministically-failing test that reproduces the user's bug. This file specifies the input format, the extraction heuristics, and the test-writer addendum.

## The 5-tuple bug signature

```
bug_signature = {
  inputs:                <verbatim input/state that triggers the bug>,
  precondition:          <state required for the bug to fire>,
  assertion_that_fails:  <what the user/code expected>,
  actual_output:         <what actually happened>,
  env:                   <runtime env, OS, dependency versions, dataset>
}
```

All 5 fields must be present before Phase 0 can advance to Phase 1. Missing fields → 1 AskUserQuestion call (allowed in Phase 0; counts toward Phase 0's budget).

### Field-by-field

#### `inputs`
The exact data passed in / user action sequence that triggers the bug. Verbatim — do not paraphrase. For UI bugs: tap sequence + form values. For data bugs: input record + IDs. For network bugs: request headers + body.

**Examples:**
- API bug: `POST /v2/charge {amount: 100, currency: "JPY", customer: "cus_abc"}`
- UI bug: `tap "Buy" → tap "Apple Pay" → wait for sheet → tap "Cancel"`
- Data bug: `cache record with ttl_expires_at = "2026-04-29T12:00:00Z" while clock = "2026-04-29T11:59:59Z"`

If inputs are sensitive (PII, payment tokens), redact in the bug signature stored in state but keep the *shape* — the test must still reproduce the bug, so the test fixture needs realistic values.

#### `precondition`
State required for the bug to fire that is NOT in `inputs`. Examples: "user must be logged in," "feature flag X enabled," "device locale = ja-JP," "cache populated by prior session."

If the bug fires from cold state, write `precondition: cold (no prior state required)`.

#### `assertion_that_fails`
What the user / code / spec expected to happen. Phrase as an assertion, not a description.

**Examples:**
- "API returns HTTP 200 with `{"id": "ch_*"}`"
- "Buy button becomes enabled after Apple Pay sheet dismisses"
- "Cache miss resolves to network fetch"

If the user reports the bug as "X doesn't work," ask: *"what did you expect to happen?"*

#### `actual_output`
What actually happened. Verbatim error message / observed behavior. This is the **failure-mode fingerprint** — the regression test must fail with this exact symptom, not a generic failure.

**Examples:**
- `HTTP 500 — "TypeError: Cannot read property 'amount' of null"`
- `Buy button stays disabled forever; no error logged`
- `Cache hit returns stale record`

#### `env`
Runtime context. OS + version, app version, dependency versions for the relevant libs, dataset state for data bugs.

**Examples:**
- `iOS 18.2, iPhone 16 Pro, app v3.4.1, Firebase SDK 11.2.0, en-US locale`
- `Node 20.18, server v2.33, Postgres 16, Redis 7.4, ~10M-row events table`
- `Pixel 9, Android 15, app v3.4.1, Room 3.0.0, Kotlin 2.0.21, ja-JP locale`

For env-independent bugs: `env: deterministic — bug fires regardless of platform/locale/version`.

## Extraction heuristic

When the user files a bug as free-form text, parse in this order:

1. **Look for stack traces / error messages** — these go straight into `actual_output`.
2. **Look for "I expected" / "should" / "supposed to" phrasing** — these go into `assertion_that_fails`.
3. **Look for "I clicked / tapped / called" sequences** — these go into `inputs`.
4. **Look for "when I'm logged in / after I X" qualifiers** — these go into `precondition`.
5. **Look for version / platform / locale mentions** — these go into `env`. If absent, ask once.

If any field is still empty after parsing, **fire one AskUserQuestion** with up to 4 questions filling the gaps. Do NOT fabricate. Do NOT proceed to Phase 1 with missing fields.

## Test-writer addendum

When dispatching `test-writer` in Phase 0, paste this addendum verbatim into the prompt:

```
Debug-mode test-writer addendum.

You are writing a REGRESSION TEST for a known bug, not a feature spec.

The test MUST:
1. Use the exact `inputs` and `precondition` from the bug signature.
2. Set up the exact `env` from the bug signature (mock platform / locale / dependency
   version where the test framework permits).
3. Assert that `assertion_that_fails` holds.
4. FAIL with a message that matches `actual_output` — same exception type, same key
   substrings of the message, same observable behavior.

The test MUST NOT:
1. Be a generic "should not crash" assertion.
2. Use input values different from `inputs` (even if "equivalent").
3. Skip the `precondition` setup ("simplified test").
4. Hide the failure mode behind a try/catch that swallows the bug.

After writing the test, run it once and confirm it fails. If it passes accidentally:
report `BUG_NOT_REPRODUCED` and stop. Do NOT silently green-mark.

If the test framework cannot reproduce the bug deterministically (e.g. flaky timing,
unmockable platform call), report `BUG_NOT_REPRODUCIBLE_DETERMINISTICALLY` with the
specific blocker. Do NOT ship a flaky test as the regression test.

Bug signature (paste-by-value):
<insert state.bug_signature here, JSON-formatted>
```

## Failure modes (Phase 0 stop conditions)

If any of these fire, surface to the user and STOP — do not advance to Phase 1.

| Failure mode | Symptom | User action |
|---|---|---|
| `BUG_NOT_REPRODUCED` | Test passes when run | Either the bug is already fixed, or the reproduction is wrong. Verify the bug still happens before re-attempting. |
| `BUG_NOT_REPRODUCIBLE_DETERMINISTICALLY` | Test is flaky (sometimes passes, sometimes fails) | Either pin down the flake source (timing, env), or accept that this bug needs a different approach (production tracing, condition-based-waiting from `superpowers:systematic-debugging`). |
| `INSUFFICIENT_BUG_SIGNATURE` | Cannot extract one of the 5 fields after AskUserQuestion | Bug report is incomplete; ask the user for the missing piece directly. |
| `TEST_FRAMEWORK_NOT_AVAILABLE` | Project has no runnable test infrastructure | Set up the minimum test infrastructure as a prereq task before continuing. |

## Hash-pin after RED

Once the test fails RED with the expected failure mode, snapshot via:

```bash
~/.claude/bin/test-integrity.py snapshot \
  --root <project-root> \
  --task T0a-regression-test-<slug> \
  --files <test paths>
```

This locks the test files via the T17 PreToolUse hook + `_active_task_files.txt`. The implementer in Phase 6b CANNOT modify these files until `test-integrity.py verify` clears the lock.

Cite ADR-0008 (3-layer anti-tamper).

## Examples

### Example A — Crash bug

```yaml
bug_signature:
  inputs: 'GET /v1/users/me with Authorization: Bearer <revoked-token>'
  precondition: 'token was valid 24h ago, server-side revocation list updated 30 min ago'
  assertion_that_fails: 'response is 401 with body {"error":"token_revoked"}'
  actual_output: 'HTTP 500 — "NullPointerException at AuthFilter.kt:42"'
  env: 'staging, server v4.2.1, Spring Boot 3.4.0, Redis 7.4 for revocation cache'
```

Test (Kotest):
```kotlin
@Test
fun `revoked token returns 401 not 500`() {
    revocationCache.add(REVOKED_TOKEN, expiresAt = 24.hours.fromNow)
    val response = client.get("/v1/users/me") {
        headers { append("Authorization", "Bearer $REVOKED_TOKEN") }
    }
    response.status shouldBe HttpStatusCode.Unauthorized
    response.bodyAsText() shouldContain "token_revoked"
}
```

This test will fail today with the NPE → RED gate satisfied.

### Example B — Stale-cache bug

```yaml
bug_signature:
  inputs: 'load feed page after returning from background'
  precondition: 'app was backgrounded for >5 min; cache TTL is 5 min; clock just crossed TTL boundary'
  assertion_that_fails: 'feed shows fresh content from network'
  actual_output: 'feed shows stale content from cache; no network call fires'
  env: 'iOS 18.2, app v3.4.1, OkHttp 4.12.0 (KMP shared cache layer)'
```

Test (Kotest, KMP):
```kotlin
@Test
fun `expired cache triggers network fetch on foreground resume`() {
    val cache = MockCache(ttl = 5.minutes)
    cache.put("feed", staleContent, populatedAt = 6.minutes.ago)
    val network = MockNetwork(response = freshContent)

    val result = feedRepo.load(cache, network, clock = fixedClock)

    network.callCount shouldBe 1
    result shouldBe freshContent
}
```

Today's behavior: `network.callCount == 0`, `result == staleContent` → test fails RED.

## Cross-references

- `superpowers:systematic-debugging` (`root-cause-tracing.md`) — backward tracing once Phase 1 starts.
- [`../../loop-plan/references/tdd-workflow.md`](../../loop-plan/references/tdd-workflow.md) — RED → GREEN → verify pipeline (loop-debug uses verbatim, the `RED` step is just satisfied at Phase 0 instead of inside the implementer task).
- [`./debug-spec-reviewer.md`](./debug-spec-reviewer.md) — what the spec-reviewer enforces against the fix at Phase 6.
