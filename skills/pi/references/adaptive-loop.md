# Adaptive loop protocol for Pi

This protocol keeps loop-plan and loop-debug useful without turning every task into a maximal-cost investigation.

## Strategy

Use the durable context contract in [`context-management.md`](./context-management.md) for every checkpoint, fan-out decision, and child merge. Use a funnel:

1. **Triage** — classify task as `quick`, `standard`, or `high-risk` using impact, uncertainty, and reversibility.
2. **Inventory** — inspect the runtime's agents, skills, extensions, packages, active tools, model, and MCP configuration. Record names and paths only; never dump prompt bodies or secrets.
3. **Evidence ledger** — track each unknown or claim with `id`, `claim`, `source`, `confidence`, `impact`, `status`, and `next_probe`.
4. **Probe selection** — choose the highest-impact unresolved item with the best expected information gain per cost.
5. **Adaptive fanout** — start with one scout for quick work, 1–2 specialists for standard work, and never exceed two active workers by default (three only when explicitly high-risk).
6. **Reconcile** — merge evidence, remove duplicate claims, downgrade unsupported claims, and re-score unresolved items.
7. **Stop or escalate** — stop when high-impact unknowns are closed, two rounds add no material evidence, or the budget is exhausted. Escalate only when residual risk justifies more cost.

The loop is not allowed to claim “no blind spots”. It must report inspected surfaces, residual unknowns, and the stopping reason.

## Default budgets

These are ceilings, not targets:

| Tier | Initial children | Follow-up rounds | Child turns | Wall time | Research calls |
|---|---:|---:|---:|---:|---:|
| quick | 1 | 1 | 8 | 3 min | 0 |
| standard | 2 | 2 | 12 | 8 min | 3 |
| high-risk | 4 | 4 | 20 | 20 min | 8 |

Use the smallest tier that can prove the goal. A budget may be increased only with a stated risk-based reason. Persist `loop_context` usage/checkpoint state before fan-out and phase transitions. Register and complete a structured next-step token at each boundary; only an approved, non-destructive intent may advance automatically. Every child returns a bounded `pi.loop.handoff.v1`; the parent validates identity, attempt, schema, and evidence before merging. Progress updates happen at phase or round boundaries, not after every tool call. At 60%, finish the unit; at 70%, persist and request compaction at `agent_settled`; at 85% or unknown usage, stop fan-out and use serialized handoff/fresh context.

## Capability routing

- `scout` — cheap repository map and caller search.
- `context-builder` — evidence synthesis and implementation handoff.
- `researcher` — external, current, primary-source research only when it can change the design.
- `reviewer` — adversarial validation of a plan or diff; read-only unless explicitly assigned a writer role.
- `worker` — sole writer after explicit approval.
- `oracle` — decision consistency / drift review when the plan has unresolved trade-offs. RPC/process isolation is escalation-only.
- User/project agents — use only when inventory confirms they exist and their declared role matches the task.

Prefer the active OpenAI model for orchestration. If the runtime exposes multiple models, use a cheaper model for broad scouts and a stronger model for synthesis or high-risk review. Never assume a model ID or API key; record the selected provider/model and fallback behavior.

## Tool and MCP routing

Use only capabilities confirmed by the inventory snapshot. Core read/write/edit/bash tools are sufficient for most repository work. Use a discovered extension/custom tool when it provides a real seam (for example, a test runner, browser, database, or deployment check). MCP is optional: if no MCP server/tool is discovered, continue with local tools and record `mcp: unavailable`; never fabricate an MCP tool name. Do not execute or read arbitrary configuration outside the discovered safe roots.

## Evidence ledger minimum

A claim is closed only when it has a source and confidence:

```json
{
  "id": "E1",
  "claim": "The request enters through ...",
  "source": "src/router.ts:42-57",
  "confidence": "high",
  "impact": "high",
  "status": "verified",
  "next_probe": null
}
```

Unsupported or conflicting evidence remains `open` or `conflicted`; it is never silently promoted into the plan.
