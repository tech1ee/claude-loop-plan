# React / Next.js Agents

3 agents for React, Next.js, and TypeScript frontend codebases.

---

### `react-nextjs-explorer`
**Role:** Phase 1 codebase exploration for React / Next.js / TypeScript repos. Maps components, hooks, routing, server/client boundaries, data-fetch patterns, state management.
**Model:** sonnet **When:** Phase 1, read-only research
**Returns:** file paths, line numbers, component tree, execution flows, refactoring candidates, deepening opportunities
**Related:** `react-hooks-misuse-auditor` (audit after exploration), `nextjs-rsc-boundary-auditor` (audit RSC boundaries)
**Install:** `npx @loopskills/claude-skills --agents react-nextjs-explorer`

---

### `react-hooks-misuse-auditor`
**Role:** Stale closures in useEffect/useCallback/useMemo, missing dependency arrays, hooks called conditionally or outside components.
**Model:** sonnet **When:** before merge on React component changes
**Returns:** hooks misuse findings with severity HIGH/MED/LOW
**Related:** delegates RSC boundary issues to `nextjs-rsc-boundary-auditor`
**Install:** `npx @loopskills/claude-skills --agents react-hooks-misuse-auditor`

---

### `nextjs-rsc-boundary-auditor`
**Role:** Missing 'use client' directives, browser-only APIs in Server Components, non-serializable props across RSC/client boundary, data-fetch waterfalls.
**Model:** sonnet **When:** before merge on Next.js page/component changes
**Returns:** RSC boundary violation findings with severity
**Related:** delegates hooks misuse to `react-hooks-misuse-auditor`
**Install:** `npx @loopskills/claude-skills --agents nextjs-rsc-boundary-auditor`
