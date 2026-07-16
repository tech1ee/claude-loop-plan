# State and verification

## State files

Use `.codex/loop/<slug>.md` for the human-readable plan and `.codex/loop/<slug>.state.json` for resumable state. Keep JSON valid and compact:

```json
{
  "schema_version": 1,
  "slug": "example-change",
  "phase": "explore",
  "goal": "Observable user outcome",
  "success_criteria": [],
  "assumptions": [],
  "unknowns": [],
  "evidence": [],
  "must_haves": {
    "truths": [],
    "artifacts": [],
    "key_links": []
  },
  "verification": []
}
```

Follow the repository's existing state convention instead when one exists. Do not mirror task management systems or durable memory into these files.

## Evidence ledger

Each material claim records a status (`open`, `supported`, `contradicted`), source (`path:line`, command result, or cited URL), and implication. Claims without evidence remain unknowns.

## Four-level artifact check

1. Exists: the required artifact is present.
2. Substantive: it is not a stub, placeholder, or tautology.
3. Wired: callers, exports, configuration, and runtime entry points actually reach it.
4. Observed: a behavioral probe shows real data or user-visible behavior crossing the link.

## Test integrity

Expected values must be derived independently of the system under test. Prove a regression test fails for the intended reason before the fix. Reject tests that call the production implementation to compute their oracle, assert only that mocks were invoked, or pass when the behavior is removed. After the fix, run the focused test, relevant neighboring tests, and the broader suite proportionate to blast radius.
