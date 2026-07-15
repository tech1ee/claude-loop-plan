# TypeScript / Node.js Agents

2 agents for TypeScript type safety and Node.js async correctness.

---

### `typescript-strict-mode-auditor`
**Role:** Implicit `any`, unsafe type assertions (`as` casts without narrowing), `@ts-ignore` without justification, missing strict compiler flags in tsconfig.json.
**Model:** sonnet **When:** before merge on TypeScript changes
**Returns:** type safety findings per file + tsconfig.json flag coverage
**Related:** delegates async anti-patterns to `nodejs-async-safety-auditor`
**Install:** `npx @loopskills/loop-skills --agents typescript-strict-mode-auditor`

---

### `nodejs-async-safety-auditor`
**Role:** Unhandled promise rejections, blocking event loop (sync I/O in hot paths), callback/async mixing, fire-and-forget without error handling.
**Model:** sonnet **When:** before merge on Node.js server-side changes
**Returns:** async safety findings with severity
**Related:** delegates TypeScript type safety to `typescript-strict-mode-auditor`
**Install:** `npx @loopskills/loop-skills --agents nodejs-async-safety-auditor`
