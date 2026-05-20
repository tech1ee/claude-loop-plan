# Proactive MCP Usage

Use without being asked. These are not optional.

| MCP | When |
|---|---|
| `context7` (resolve-library-id → query-docs) | ANY library/framework/API/SDK/CLI/cloud-service question, even well-known ones (React, Next.js, Prisma, Tailwind, Django, Spring Boot). Training data may be stale. Phase 3 default for known libs. Skip for refactoring, writing from scratch, debugging business logic, general programming concepts. |
| `memory` (search_nodes, read_graph) | Session start — recall project context and past decisions. |
| `memory` (create_entities, add_observations) | After every significant task — persist what was learned. |
| Notion MCP (notion-search, notion-update-page, notion-fetch) | When work relates to a tracked project; update status; pull PRDs/specs. |
| Figma MCP (get_design_context, get_screenshot, get_variable_defs) | When implementing UI that has Figma designs. Load `figma-use` skill before any `use_figma` API call. |
| Playwright / Chrome DevTools MCP | When testing web UI — take screenshots, check accessibility, inspect network. |
| `mobile-mcp` (`mobile_take_screenshot`, `mobile_list_elements_on_screen`, `mobile_press_button`, `mobile_launch_app`, `mobile_list_available_devices`) | When working on Android / KMP / iOS with an emulator or device available. Replaces manual `adb` / `xcrun simctl` shell-out for screenshot regression, UI inspection, logcat-style diagnostics, app launch in `/loop-debug` Phase 1 (state capture) and Phase 6 (post-impl verification). Cross-platform — same tool surface for both targets in a KMP repo. |
| Sentry MCP | When debugging production errors or following up on Sentry issues. |
| Gmail / Google Calendar MCP | When the task involves scheduling, responding to outreach, or reading thread context. |
| Plausible MCP | When the task involves traffic analytics or site stats for tracked sites. |

## Session protocol

**Start:**
1. `mcp__memory__search_nodes` for project name derived from `pwd`.
2. `git status` + `git log --oneline -10` (if in a repo).
3. Check Notion for the project's current status field.

**End:**
1. `mcp__memory__add_observations` for decisions, learnings, unfinished work.
2. Update Notion project status if applicable.
3. Note pending work for next session.

## Do not

- Do not use `context7` for refactors, from-scratch scripts, business-logic debugging, code review, general programming concepts.
- Do not paste huge docs into context — use `query-docs` with a focused query.
- Do not skip memory protocol because "I remember" — memory is for future sessions, not this one.
- Do not script third-party social apps (Instagram / TikTok / X / YouTube / Threads) via `mobile-mcp` for media or content pipelines. Reasons: ToS violations, account bans, anti-automation defenses (emulator fingerprinting, captchas, integrity checks), `FLAG_SECURE` blocking UI dumps. For media-pipeline validation, use `ffprobe` / `mediainfo` on the file directly, or build a thin owned test-harness app. `mobile-mcp` is for testing **your own apps**.
