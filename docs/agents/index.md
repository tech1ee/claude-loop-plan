# Agent Catalog — Cross-Reference Index

40 agents across 8 tiers. All are SRP-focused: one concern, one model tier, one report.

| Agent | Group | Model | Concern | Run with / after |
|---|---|---|---|---|
| spec-reviewer | Universal | opus | spec compliance gate | implementer → spec-reviewer → code-quality-reviewer |
| code-quality-reviewer | Universal | opus | 11-dimension quality sweep | after spec-reviewer |
| research-agent | Universal | sonnet | library docs + best practices | Phase 3 internet research |
| test-runner | Universal | haiku | test suite execution + mutation | after implementer |
| second-opinion | Universal | opus | cross-model Codex review | pre-ship gate |
| security-reviewer | Universal | opus | auth / injection / secrets | after security-sensitive edits |
| srp-godclass-auditor | Universal | opus | God-class + LCOM4 | before merge |
| dry-duplication-auditor | Universal | opus | Rule-of-Three duplication | before merge |
| complexity-long-method-auditor | Universal | opus | cyclomatic + cognitive complexity | before merge |
| dip-dependency-direction-auditor | Universal | opus | import cycles + layer violations | before merge |
| naming-conventions-auditor | Universal | opus | naming smells | before merge |
| comment-quality-auditor | Universal | sonnet | comment hygiene (WHAT vs WHY) | before merge |
| yagni-premature-abstraction-auditor | Universal | sonnet | speculative-generality | before merge |
| char-test-coverage-auditor | Universal | opus | pre-refactor coverage gate | BEFORE refactor |
| adr-completeness-auditor | Universal | opus | MADR 4.0.0 schema completeness | after ADR changes |
| android-kmp-explorer | Android/KMP | sonnet | codebase exploration | Phase 1, read-only |
| android-coroutine-scope-leak-auditor | Android/KMP | sonnet | coroutine scope leaks | before merge |
| android-fgs-compliance-auditor | Android/KMP | sonnet | FGS Android 14/15 compliance | pre Play submission |
| android-r8-proguard-auditor | Android/KMP | sonnet | R8/ProGuard keep-rules | pre release build |
| android-baseline-profile-checklister | Android/KMP | sonnet | Baseline Profile setup | pre release |
| swiftui-explorer | iOS/macOS | sonnet | codebase exploration | Phase 1, read-only |
| ios-appstore-preflight-auditor | iOS/macOS | sonnet | PrivacyInfo + Required Reason API | pre App Store submission |
| ios-codable-edge-auditor | iOS/macOS | sonnet | Codable semantic edge cases | after Codable changes |
| ios-coredata-migration-auditor | iOS/macOS | sonnet | Core Data migration eligibility | after .xcdatamodel changes |
| kmp-bridging-topology-auditor | iOS/macOS | sonnet | KMP source-set topology | after KMP target changes |
| kmp-swift-interop-readiness-auditor | iOS/macOS | sonnet | SKIE / Swift Export readiness | after KMP iOS changes |
| macos-entitlements-distribution-auditor | iOS/macOS | sonnet | entitlement / sandbox consistency | pre code-signing |
| macos-notarization-preflight-auditor | iOS/macOS | sonnet | notarytool CI pre-flight | pre notarization |
| macos-appkit-swiftui-interop-auditor | iOS/macOS | sonnet | NSViewRepresentable seam | after interop changes |
| compose-architect | Architecture | opus | Compose UI architecture + MVVM | design phase |
| datalayer-architect | Architecture | opus | KMP data layer design | design phase |
| react-nextjs-explorer | React/Next.js | sonnet | codebase exploration | Phase 1, read-only |
| react-hooks-misuse-auditor | React/Next.js | sonnet | hooks misuse (stale closures, missing deps) | before merge |
| nextjs-rsc-boundary-auditor | React/Next.js | sonnet | RSC vs client boundaries | before merge |
| typescript-strict-mode-auditor | TypeScript/Node.js | sonnet | any creep, unsafe casts | before merge |
| nodejs-async-safety-auditor | TypeScript/Node.js | sonnet | unhandled rejections, blocking event loop | before merge |
| python-async-correctness-auditor | Python | sonnet | blocking I/O in async context | before merge |
| django-fastapi-safety-auditor | Python | sonnet | migration safety, cascade risks, N+1 | before merge |
| vue-reactivity-pitfalls-auditor | Vue/Nuxt | sonnet | reactive state loss, watch cleanup | before merge |
| nuxt-ssr-hydration-auditor | Vue/Nuxt | sonnet | SSR/CSR hydration mismatches | before merge |

## Per-group docs

- [universal.md](universal.md) — 15 universal agents (any codebase)
- [android.md](android.md) — 5 Android / KMP agents
- [ios-macos.md](ios-macos.md) — 9 iOS / macOS agents
- [architecture.md](architecture.md) — 2 architecture design agents
- [web-react.md](web-react.md) — 3 React / Next.js agents
- [web-typescript.md](web-typescript.md) — 2 TypeScript / Node.js agents
- [python.md](python.md) — 2 Python agents
- [vue-nuxt.md](vue-nuxt.md) — 2 Vue / Nuxt agents

## Install a specific agent

```bash
npx @loopskills/loop-skills --agents <agent-name>
# or comma-separated:
npx @loopskills/loop-skills --agents react-hooks-misuse-auditor,nextjs-rsc-boundary-auditor
```
