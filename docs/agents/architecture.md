# Architecture Agents

2 agents for architecture design and review (Kotlin/Compose/KMP).

---

### `compose-architect`
**Role:** Designs Jetpack Compose / Compose Multiplatform UI architecture — MVVM + UiState patterns, decomposing large composables. Design phase only, not implementation.
**Model:** opus **When:** building or refactoring Compose UI, designing MVVM + UiState patterns
**Returns:** architecture blueprint with component design, data flows, build sequences
**Install:** `npx @loopskills/claude-skills --agents compose-architect`

---

### `datalayer-architect`
**Role:** Designs the KMP data layer — repositories, Ktor, Room, Koin, coroutine flows. Design phase only.
**Model:** opus **When:** building the KMP data layer, designing repository patterns
**Returns:** data layer architecture with source sets, module structure, flow patterns
**Install:** `npx @loopskills/claude-skills --agents datalayer-architect`
