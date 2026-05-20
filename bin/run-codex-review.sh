#!/usr/bin/env bash
# run-codex-review.sh — Codex orchestration wrapper.
# Per ADR-0023 (active Codex integration, Option A — Sonnet fallback deferred).
#
# Usage:
#   run-codex-review.sh --stage <plan|diff|codebase|security|content> [--target <path>] [--base <sha>] [--head <sha>] \
#                       [--audience "..." --platform "..." --goal "..." --voice "..."]
#
# Behavior:
#   - Enforces 300s timeout externally (F23 — companion has no native timeout).
#   - Stage routing: diff/security → adversarial-review; plan → codex-plan-review.sh (ephemeral repo);
#     codebase → review; content → ephemeral-repo adversarial-review with context envelope (audience/platform/goal/voice).
#   - On Codex failure (rate-limit / quota / timeout — F31 regex): emit REVIEW UNAVAILABLE + log to .codex-failures.log.
#   - Always exit 0 if the wrapper itself ran (advisory contract — never blocks).
#   - Output ends with the mandatory `### outcome` tail block per v3 schema.
#
# Cited ADRs: ADR-0011, ADR-0023, humanizer-codex-content-pipeline (content stage).

set -u

TIMEOUT_S=300
LOG=~/.claude/.codex-failures.log
LIB=~/.claude/bin/codex_review_lib.py

# Parse args
stage=""
target=""
base="main"
head="HEAD"
audience=""
platform=""
goal=""
voice=""
while [ $# -gt 0 ]; do
  case "$1" in
    --stage) stage="$2"; shift 2 ;;
    --target) target="$2"; shift 2 ;;
    --base) base="$2"; shift 2 ;;
    --head) head="$2"; shift 2 ;;
    --audience) audience="$2"; shift 2 ;;
    --platform) platform="$2"; shift 2 ;;
    --goal) goal="$2"; shift 2 ;;
    --voice) voice="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$stage" ]; then
  echo "usage: $0 --stage <plan|diff|codebase|security|content> [--target PATH] [--base SHA] [--head SHA] [--audience ... --platform ... --goal ... --voice ...]" >&2
  exit 2
fi

# Locate companion
plugin_root=$(ls -d ~/.claude/plugins/cache/openai-codex/codex/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::')
companion="$plugin_root/scripts/codex-companion.mjs"

emit_unavailable() {
  local reason="$1"
  echo "## Second opinion — $stage"
  echo ""
  echo "### Findings"
  echo "- [HIGH] N/A — REVIEW UNAVAILABLE: $reason"
  echo "  Consensus: NOT-CHECKED"
  echo "  Impact: Cross-model review skipped — verdict is Claude-only signal."
  echo "  Recommendation: Retry after Codex quota resets, or set CODEX_STOP_GATE_OFF=1 if persistent."
  echo ""
  echo "### Verdict (advisory, never a gate)"
  echo "REVIEW UNAVAILABLE"
  echo ""
  python3 -c "
import sys
sys.path.insert(0, '$HOME/.claude/bin')
from codex_review_lib import build_outcome_block
print(build_outcome_block(reviewer='codex', findings_count=1, severity_counts={'high':1}, unavailable=True, failure_reason='$reason'))
"
  printf '%s\tREVIEW_UNAVAILABLE\t%s\n' "$(date -Iseconds)" "$reason" >> "$LOG" 2>/dev/null || true
  exit 0
}

# Preflight
if [ ! -f "$companion" ] || [ -z "${OPENAI_API_KEY:-}" ]; then
  emit_unavailable "preflight: companion or OPENAI_API_KEY missing"
fi

# Plan-stage uses ephemeral-repo helper (Codex Phase 6b HIGH-1: companion CLI
# does not accept custom-target; ephemeral repo is the workaround).
if [ "$stage" = "plan" ]; then
  if [ -z "$target" ] || [ ! -f "$target" ]; then
    emit_unavailable "plan stage: target file missing"
  fi
  out=$(timeout "$TIMEOUT_S" bash ~/.claude/bin/codex-plan-review.sh "$target" 2>&1)
  rc=$?
elif [ "$stage" = "content" ]; then
  # Content stage: validate envelope, write draft to ephemeral repo, run
  # adversarial-review with context-envelope prompt.
  if [ -z "$target" ] || [ ! -f "$target" ]; then
    emit_unavailable "content stage: target file missing"
  fi
  if [ -z "$audience" ] || [ -z "$platform" ] || [ -z "$goal" ] || [ -z "$voice" ]; then
    emit_unavailable "content stage: requires --audience --platform --goal --voice"
  fi
  prompt=$(python3 -c "
import sys
sys.path.insert(0, '$HOME/.claude/bin')
from codex_review_lib import build_content_prompt
print(build_content_prompt(audience='''$audience''', platform='''$platform''', goal='''$goal''', voice='''$voice'''))
")
  tmpdir=$(mktemp -d)
  trap 'rm -rf "$tmpdir"' EXIT
  cp "$target" "$tmpdir/draft.md"
  (
    cd "$tmpdir"
    git init -q
    git -c user.email=codex@local -c user.name=codex add draft.md
    git -c user.email=codex@local -c user.name=codex commit -q -m "draft for review" >/dev/null 2>&1 || true
  )
  out=$(cd "$tmpdir" && timeout "$TIMEOUT_S" node "$companion" adversarial-review --focus "$prompt" 2>&1)
  rc=$?
else
  argv=$(python3 -c "
import sys
sys.path.insert(0, '$HOME/.claude/bin')
from codex_review_lib import codex_command
print(' '.join(codex_command('$stage', target='$target', base='$base', head='$head')))
")
  # shellcheck disable=SC2086
  out=$(timeout "$TIMEOUT_S" node "$companion" $argv 2>&1)
  rc=$?
fi

# Failure detection
if [ $rc -ne 0 ] || python3 -c "
import sys
sys.path.insert(0, '$HOME/.claude/bin')
from codex_review_lib import is_codex_failure
sys.exit(0 if is_codex_failure(sys.stdin.read()) else 1)
" <<< "$out"; then
  emit_unavailable "codex error (exit=$rc): $(printf '%s' "$out" | head -1 | cut -c1-200)"
fi

# Success — emit Codex output verbatim + append outcome block
printf '%s\n\n' "$out"

# Best-effort: count findings/severity from Codex output (basic regex)
hi=$(printf '%s' "$out" | grep -cE '\[(HIGH|CRITICAL)\]' || true)
me=$(printf '%s' "$out" | grep -cE '\[MEDIUM\]' || true)
lo=$(printf '%s' "$out" | grep -cE '\[LOW\]' || true)
total=$((hi + me + lo))

python3 -c "
import sys
sys.path.insert(0, '$HOME/.claude/bin')
from codex_review_lib import build_outcome_block
print(build_outcome_block(
    reviewer='codex',
    findings_count=$total,
    severity_counts={'high': $hi, 'medium': $me, 'low': $lo, 'critical': 0},
))
"
exit 0
