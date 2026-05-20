# Universal Agents

These 15 agents work with any codebase regardless of language or framework. Install them for every project.

---

### `spec-reviewer`
**Role:** Verifies that an implementation matches the written spec/plan/task. Binary verdict: SPEC-COMPLIANT or NOT.
**Model:** opus **When:** after every implementation step, before code-quality-reviewer
**Returns:** binary verdict with precise reasons
**Related:** run before `code-quality-reviewer`
**Install:** `npx @loopskills/claude-skills --agents spec-reviewer`

---

### `code-quality-reviewer`
**Role:** 11-dimension code quality sweep — maintainability, clarity, dead code, naming, duplication, idiomatic patterns.
**Model:** opus **When:** after spec-reviewer passes
**Returns:** structured findings per dimension
**Related:** run after `spec-reviewer`
**Install:** `npx @loopskills/claude-skills --agents code-quality-reviewer`

---

### `research-agent`
**Role:** Library docs, API references, and best-practice lookup using context7 MCP + web search with mandatory date constraints.
**Model:** sonnet **When:** Phase 3 internet research during planning
**Returns:** concise technical summary with source dates
**Install:** `npx @loopskills/claude-skills --agents research-agent`

---

### `test-runner`
**Role:** Detects and runs the project's test suite (gradle / xcodebuild / npm / pytest / swift test). Reports pass/fail + failing test names.
**Model:** haiku **When:** after implementation, between implementer and reviewers
**Returns:** pass/fail verdict + failing test list
**Install:** `npx @loopskills/claude-skills --agents test-runner`

---

### `second-opinion`
**Role:** Cross-model code review via OpenAI Codex. Advisory — never blocking. Requires `OPENAI_API_KEY`.
**Model:** opus **When:** pre-ship gate, high-stakes diffs
**Returns:** advisory findings with severity + consensus metadata
**Install:** `npx @loopskills/claude-skills --agents second-opinion`

---

### `security-reviewer`
**Role:** Auth bypass, injection, exposed secrets, insecure data handling. Reports findings with >80% confidence only.
**Model:** opus **When:** after any auth/payment/secret/data-handling code change
**Returns:** high-confidence security findings with concrete impact
**Install:** `npx @loopskills/claude-skills --agents security-reviewer`

---

### `srp-godclass-auditor`
**Role:** Detects SRP violations and God-class smells using LCOM4, WMC+ATFD+TCC, LOC, field/method counts.
**Model:** opus **When:** after non-trivial class additions, before merge
**Returns:** quantitative metrics per class, BLOCK/FLAG/PASS verdict
**Related:** `dry-duplication-auditor`, `complexity-long-method-auditor`
**Install:** `npx @loopskills/claude-skills --agents srp-godclass-auditor`

---

### `dry-duplication-auditor`
**Role:** Finds code duplication with Rule-of-Three gate (duplicate-of-2: leave; duplicate-of-3: extract).
**Model:** opus **When:** after multi-file changes, before merge
**Returns:** duplicate blocks with file:line, Rule-of-Three verdict
**Install:** `npx @loopskills/claude-skills --agents dry-duplication-auditor`

---

### `complexity-long-method-auditor`
**Role:** Cyclomatic + cognitive complexity, LOC/method, nesting depth, parameter count.
**Model:** opus **When:** after method changes, before merge
**Returns:** complexity metrics per method, threshold violations
**Install:** `npx @loopskills/claude-skills --agents complexity-long-method-auditor`

---

### `dip-dependency-direction-auditor`
**Role:** Dependency inversion + acyclic dependencies — reverse imports, import cycles, layer violations.
**Model:** opus **When:** after module/package/layer changes
**Returns:** cycle report, layer violation list
**Install:** `npx @loopskills/claude-skills --agents dip-dependency-direction-auditor`

---

### `naming-conventions-auditor`
**Role:** Naming smells — generic suffixes (Manager/Helper/Util), id-length, Hungarian, acronym capitalization, boolean prefixes.
**Model:** opus **When:** after type/function/variable additions
**Returns:** naming violations with suggested alternatives
**Install:** `npx @loopskills/claude-skills --agents naming-conventions-auditor`

---

### `comment-quality-auditor`
**Role:** Comment hygiene — WHAT-vs-WHY violations, expired TODO/FIXME, outdated doc-comments, undocumented public API.
**Model:** sonnet **When:** after code changes
**Returns:** comment violations with file:line
**Install:** `npx @loopskills/claude-skills --agents comment-quality-auditor`

---

### `yagni-premature-abstraction-auditor`
**Role:** Speculative-generality smells — one-impl interfaces, single-product factories, dead extension points.
**Model:** sonnet **When:** after introducing interfaces/factories/extension points
**Returns:** premature abstraction findings with evidence
**Install:** `npx @loopskills/claude-skills --agents yagni-premature-abstraction-auditor`

---

### `char-test-coverage-auditor`
**Role:** Pre-refactor characterization-test coverage audit. Must run BEFORE refactoring high-risk code.
**Model:** opus **When:** BEFORE any HIGH-risk refactor
**Returns:** line/branch coverage of touched lines, mutation score baseline
**Install:** `npx @loopskills/claude-skills --agents char-test-coverage-auditor`

---

### `adr-completeness-auditor`
**Role:** MADR 4.0.0 schema completeness — required sections, status enum, stale-proposed >90d, dangling cross-refs.
**Model:** opus **When:** after ADR additions / status changes
**Returns:** per-ADR findings with MADR 4.0.0 compliance verdict
**Install:** `npx @loopskills/claude-skills --agents adr-completeness-auditor`
