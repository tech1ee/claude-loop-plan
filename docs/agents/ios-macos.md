# iOS / macOS Agents

9 agents for iOS, macOS, Swift, SwiftUI, and Kotlin Multiplatform iOS targets.

---

### `swiftui-explorer`
**Role:** Phase 1 codebase exploration for SwiftUI / iOS repos. Maps views, view-models, navigation, async flows.
**Model:** sonnet **When:** Phase 1, read-only research
**Returns:** file paths, line numbers, patterns, refactoring candidates, deepening opportunities
**Install:** `npx @loopskills/claude-skills --agents swiftui-explorer`

---

### `ios-appstore-preflight-auditor`
**Role:** Required Reason API declarations, PrivacyInfo.xcprivacy field coverage, entitlement-vs-privacy-string consistency.
**Model:** sonnet **When:** before App Store submission
**Returns:** compliance findings per privacy/entitlement category
**Install:** `npx @loopskills/claude-skills --agents ios-appstore-preflight-auditor`

---

### `ios-codable-edge-auditor`
**Role:** Codable semantic edge cases — custom init(from:)/encode(to:), CodingKeys, key strategies, optional handling.
**Model:** sonnet **When:** after Codable type changes
**Returns:** edge-case findings with severity
**Install:** `npx @loopskills/claude-skills --agents ios-codable-edge-auditor`

---

### `ios-coredata-migration-auditor`
**Role:** Core Data migration eligibility — lightweight vs heavyweight, migration policy declarations.
**Model:** sonnet **When:** after Core Data schema changes (new .xcdatamodel version)
**Returns:** migration eligibility verdict + policy gap findings
**Install:** `npx @loopskills/claude-skills --agents ios-coredata-migration-auditor`

---

### `kmp-bridging-topology-auditor`
**Role:** KMP target/source-set topology — deprecated `ios()` shortcut, intermediate source-set topology, `@OptionalExpectation` gaps.
**Model:** sonnet **When:** after KMP target / source-set changes
**Returns:** topology findings with affected declarations
**Install:** `npx @loopskills/claude-skills --agents kmp-bridging-topology-auditor`

---

### `kmp-swift-interop-readiness-auditor`
**Role:** SKIE configuration, Swift Export readiness, Flow→Combine bridging completeness.
**Model:** sonnet **When:** after KMP iOS-target changes
**Returns:** interop readiness verdict per bridging approach
**Install:** `npx @loopskills/claude-skills --agents kmp-swift-interop-readiness-auditor`

---

### `macos-entitlements-distribution-auditor`
**Role:** Entitlement / sandbox / Hardened-Runtime / distribution-channel consistency. MAS-vs-Developer-ID mismatches.
**Model:** sonnet **When:** before macOS code-signing or submission
**Returns:** entitlement consistency findings per distribution channel
**Install:** `npx @loopskills/claude-skills --agents macos-entitlements-distribution-auditor`

---

### `macos-notarization-preflight-auditor`
**Role:** Hardened Runtime, prohibited entitlements, stapling sequencing, CI auth method safety for notarytool.
**Model:** sonnet **When:** before submitting a macOS Developer ID build to notarytool
**Returns:** notarization pre-flight checklist findings
**Install:** `npx @loopskills/claude-skills --agents macos-notarization-preflight-auditor`

---

### `macos-appkit-swiftui-interop-auditor`
**Role:** NSViewRepresentable / NSHostingView seams — Coordinator, lifecycle, gesture-recognizer compliance.
**Model:** sonnet **When:** when introducing or reviewing NSViewRepresentable / NSHostingView seams
**Returns:** interop seam findings per component
**Install:** `npx @loopskills/claude-skills --agents macos-appkit-swiftui-interop-auditor`
