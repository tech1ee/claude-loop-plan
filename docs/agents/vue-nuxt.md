# Vue / Nuxt Agents

2 agents for Vue Composition API and Nuxt SSR/CSR codebases.

---

### `vue-reactivity-pitfalls-auditor`
**Role:** Destructured reactive state losing reactivity, missing watch/watchEffect cleanup, v-for without :key or with index-as-key, computed functions with side effects, `reactive()` on primitives.
**Model:** sonnet **When:** before merge on Vue component / composable changes
**Returns:** reactivity pitfall findings with severity
**Related:** delegates SSR/CSR issues to `nuxt-ssr-hydration-auditor`
**Install:** `npx @loopskills/claude-skills --agents vue-reactivity-pitfalls-auditor`

---

### `nuxt-ssr-hydration-auditor`
**Role:** Browser-only APIs without server guard, hydration mismatches (Date.now, random values, user-from-cookie), useAsyncData/useFetch misuse, middleware order side effects.
**Model:** sonnet **When:** before merge on Nuxt page/component/composable changes
**Returns:** SSR/hydration findings with severity
**Related:** delegates Vue reactivity patterns to `vue-reactivity-pitfalls-auditor`
**Install:** `npx @loopskills/claude-skills --agents nuxt-ssr-hydration-auditor`
