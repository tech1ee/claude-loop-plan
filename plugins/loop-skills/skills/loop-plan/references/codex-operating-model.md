# Codex operating model

## Capability inventory

Before choosing orchestration, inspect capabilities actually exposed in the session: repository instructions, available skills, MCP/connectors, browser or web research, image/file tools, and collaboration tools. Never hard-code a tool that is absent. Prefer a relevant installed skill over recreating its workflow.

## Delegation tiers

- Quick: parent only, or one scout for a clearly separable lookup.
- Standard: two parallel read-only scouts, then one writer and proportionate review.
- High-risk: two or three distinct scouts, one writer per dependent slice, then parallel correctness/security/test reviewers.

Subagents inherit the active sandbox and approvals. Give each a concrete bounded task, paths or questions, a stop condition, and the required result format. Keep noisy logs in child threads; return distilled evidence to the parent. Default nesting depth is one—do not design a workflow that requires recursive fan-out.

## Codex-native strengths to use

- Native plans for visible progress and phase tracking.
- Commentary updates at meaningful milestones while tools run.
- Parallel subagents for independent exploration, review, tests, and summarization.
- Current web research with primary-source citations for unstable facts.
- Skills and MCP/connectors for specialized workflows or private systems.
- Sandboxed commands, scoped escalation, and explicit approval for higher-impact actions.
- `apply_patch`, dirty-worktree inspection, focused tests, and final diff review for safe edits.

## Stop rules

Stop expanding research when high-impact unknowns are closed, two probes add no material evidence, or the remaining uncertainty is an explicit product decision. Report residual uncertainty rather than hiding it. Stop implementation when required authority is missing, a destructive/external action is necessary, or repository evidence contradicts the requested direction in a way that requires user choice.
