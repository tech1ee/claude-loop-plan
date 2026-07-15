# Android / KMP Agents

5 agents for Android, Kotlin Multiplatform, and Jetpack Compose codebases.

---

### `android-kmp-explorer`
**Role:** Phase 1 codebase exploration for Android/KMP/Compose repos. Maps modules, execution flows, similar features, dependencies.
**Model:** sonnet **When:** Phase 1, read-only research
**Returns:** file paths, line numbers, execution-flow traces, refactoring candidates, deepening opportunities
**Install:** `npx @loopskills/loop-skills --agents android-kmp-explorer`

---

### `android-coroutine-scope-leak-auditor`
**Role:** Static audit of coroutine-scope leaks — GlobalScope, singleton scopes, viewModelScope misuse in Fragments.
**Model:** sonnet **When:** after coroutine scope changes, before release
**Returns:** leak findings with severity HIGH/MED/LOW
**Install:** `npx @loopskills/loop-skills --agents android-coroutine-scope-leak-auditor`

---

### `android-fgs-compliance-auditor`
**Role:** FGS type declarations, exemption-eligibility, Android 14/15 compliance, Play Console use-case match.
**Model:** sonnet **When:** after foreground service changes, before Play submission
**Returns:** compliance findings per FGS type
**Install:** `npx @loopskills/loop-skills --agents android-fgs-compliance-auditor`

---

### `android-r8-proguard-auditor`
**Role:** R8 / ProGuard keep rules for AGP 9.0+ breaking changes, missing reflection keeps, prohibited consumer-rule global options.
**Model:** sonnet **When:** after AGP 9 upgrade, before release builds
**Returns:** keep-rule gap findings
**Install:** `npx @loopskills/loop-skills --agents android-r8-proguard-auditor`

---

### `android-baseline-profile-checklister`
**Role:** Baseline Profile setup completeness — module present, dep versions, CUJs defined, profile in APK.
**Model:** sonnet **When:** before release
**Returns:** checklist pass/fail per setup requirement
**Install:** `npx @loopskills/loop-skills --agents android-baseline-profile-checklister`
