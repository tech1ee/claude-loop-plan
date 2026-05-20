#!/bin/bash
# codex-plan-review.sh — run /codex:review on a single plan file by wrapping it
# in an ephemeral git repo. Exists because the Codex plugin only operates on
# git state, but the second-opinion agent needs to review arbitrary plan files.
#
# Usage: codex-plan-review.sh <plan-file-path>
# Output: Codex review stdout to this script's stdout.
# Exit:   0 on success; 1 on any failure with a diagnostic line on stderr.

set -eu

if [ $# -lt 1 ]; then
  echo "usage: codex-plan-review.sh <plan-file>" >&2
  exit 2
fi

plan="$1"
if [ ! -f "$plan" ]; then
  echo "error: plan file not found: $plan" >&2
  exit 1
fi

# Preflight
if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "error: OPENAI_API_KEY not set in environment" >&2
  exit 1
fi
if ! command -v codex >/dev/null 2>&1; then
  echo "error: @openai/codex CLI not installed; run 'npm install -g @openai/codex'" >&2
  exit 1
fi

# Dynamically find the latest codex plugin version
plugin_root=$(ls -d ~/.claude/plugins/cache/openai-codex/codex/*/ 2>/dev/null \
              | sort -V | tail -1 | sed 's:/*$::')
if [ -z "$plugin_root" ]; then
  echo "error: codex plugin not found in ~/.claude/plugins/cache/openai-codex/" >&2
  exit 1
fi
companion="$plugin_root/scripts/codex-companion.mjs"
if [ ! -f "$companion" ]; then
  echo "error: codex-companion.mjs not found at $companion" >&2
  exit 1
fi

# Ephemeral repo
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM

cd "$tmp"
git init -q
git -c user.email=second-opinion@local -c user.name=second-opinion \
    commit -q --allow-empty -m "empty base for plan review"

# Copy plan in under a stable name so Codex sees it as the only change
cp "$plan" ./plan.md
git add plan.md

# Run Codex review in foreground. --wait keeps it attached so stdout streams back.
# Failures and partial output both go to stdout/stderr verbatim.
node "$companion" review --wait --scope working-tree
