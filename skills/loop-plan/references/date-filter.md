# Date filter reference — strict recipe

Purpose: force the Phase 3 research to return only recent sources (post-2025-10-01), bypassing the WebSearch tool's lack of native date filter.

## Baseline: every search query

**Before** firing any `WebSearch`:

1. Append `after:2025-10-01` to the query string.
2. Append the **current year** as a bare token (`2026`).
3. If the topic is a library/framework version, append `"<library> <version>"` too.

Example transformation:

```
topic:           "spec-driven development Claude Code"
query actually:  "spec-driven development Claude Code after:2025-10-01 2026"
```

The `after:` operator is Google's documented search syntax and WebSearch passes query strings through. It's imperfect — some pages lack publication dates in crawl metadata — but it cuts stale results significantly and costs nothing.

## Layer 2: allowed_domains bias

Pass `allowed_domains` to WebSearch when you want to hard-restrict to fresh-by-construction sources:

```json
{
  "query": "<query with after: and year>",
  "allowed_domains": [
    "arxiv.org",
    "github.com",
    "code.claude.com",
    "claude.com",
    "anthropic.com",
    "platform.claude.com",
    "docs.claude.com",
    "developer.apple.com",
    "developer.android.com",
    "kotlinlang.org",
    "developer.mozilla.org"
  ]
}
```

Use this for "official docs first" passes. For community sentiment, open the domain list up.

## Layer 3: meta-tag post-filter (mandatory)

**Every URL returned by WebSearch MUST be verified** before it can be cited. The verification protocol:

1. `WebFetch` the URL with a short prompt: *"Extract the publication or last-updated date of this page. Look at `<meta property='article:published_time'>`, `<meta name='date'>`, `<time datetime=...>`, JSON-LD `datePublished`, the visible publication byline in the first 30 lines, or git 'last updated' footer. Return only the ISO date, or the word NONE if no date is found."*
2. Parse the returned date. Reject if:
   - Date is NONE
   - Date is before 2025-10-01
   - Date is a suspiciously round value with no day component ("2025" alone)
3. Keep the date in memory for the citation.

**A source without a verifiable date cannot be cited.** This is a hard rule — no exceptions. If you cannot find 10 verifiable sources after reasonable effort, report the gap honestly; do not pad with undated sources.

## Layer 4: CLAUDE.md-level rule

The skill's system prompt (this file) already states: "No source dated before 2025-10-01 may be cited." This rule is echoed to every subagent you dispatch in Phase 3. Subagents start with empty context — they WILL forget unless you repeat the rule in their prompt.

**Template for the research subagent prompt** (Phase 3):

```
Topic: <derived from clarifications>
Hard rules (non-negotiable):
- Every WebSearch query appends `after:2025-10-01 2026`
- Every fetched URL must have its publication date verified via meta-tag / time / JSON-LD
- Sources without a verifiable post-2025-10-01 date are discarded, not cited
- Minimum 10 verifiable sources; if you cannot find 10, report the gap
- Include at least one negative / skeptical source per topic
- Return citations in the format: "<finding> — <URL> (<YYYY-MM-DD>) — credibility 0-1"
```

## Preferred fresh sources (April 2026)

- **Claude Code official**: code.claude.com, platform.claude.com, claude.com/blog, anthropic.com/engineering
- **Spec & research**: arxiv.org (2025+), github.com/github/spec-kit/releases, github.com/anthropics/claude-code
- **Library docs**: context7 MCP (use this instead of WebSearch for any library/framework question)
- **Community (use sparingly)**: simonwillison.net, humanlayer.dev/blog, claudefa.st, claudelog.com

## What to avoid

- SEO listicles ("best X in 2024", "top 10 Y")
- Cached StackOverflow answers without a visible last-edit date
- Medium articles without a visible publication date
- Wikipedia for anything that changes quickly
- Any page where the first `after:2025-10-01` filter strips it out — that's a signal, not a bug

## If layer 3 is too expensive (fallback)

If Phase 3 needs > 15 WebFetches to verify dates, you can accept queries where the URL itself contains the year: `arxiv.org/abs/2512.xxxxx`, `claude.com/blog/2026/.../*`, or GitHub release URLs with a dated tag. Only use this fallback when date verification is clearly impractical for the topic — never silently.
