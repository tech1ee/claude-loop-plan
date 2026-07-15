#!/usr/bin/env bash
# loop-skills v0.5.2 — full isolated E2E test suite
# Tests the PUBLISHED package via "npm install --prefix" into a temp dir.
# Never touches the real ~/.claude.
set -uo pipefail

PKG="loop-skills@0.5.2"
PASS=0; FAIL=0; SKIP=0
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

pass() { PASS=$((PASS+1)); echo -e "  ${GREEN}✓${NC} $*"; }
fail() { FAIL=$((FAIL+1)); echo -e "  ${RED}✗${NC} $*"; }
skip() { SKIP=$((SKIP+1)); echo -e "  ${YELLOW}○${NC} $*"; }
section() { echo ""; echo -e "${BLUE}=== $* ===${NC}"; }

assert_file()    { [ -f "$1" ] && pass "$2" || fail "$2 (missing: $1)"; }
assert_no_file() { [ ! -f "$1" ] && pass "$2" || fail "$2 (should not exist: $1)"; }
assert_dir()     { [ -d "$1" ] && pass "$2" || fail "$2 (missing dir: $1)"; }
assert_contains() {
    local file="$1" pattern="$2" msg="$3"
    grep -q "$pattern" "$file" 2>/dev/null && pass "$msg" || fail "$msg (pattern '$pattern' not in $1)"
}
assert_not_contains() {
    local file="$1" pattern="$2" msg="$3"
    ! grep -q "$pattern" "$file" 2>/dev/null && pass "$msg" || fail "$msg (pattern '$pattern' found in $1)"
}
assert_output_contains() {
    local output="$1" pattern="$2" msg="$3"
    echo "$output" | grep -qE "$pattern" && pass "$msg" || fail "$msg (pattern '$pattern' not in output)"
}
assert_output_not_contains() {
    local output="$1" pattern="$2" msg="$3"
    ! echo "$output" | grep -qE "$pattern" && pass "$msg" || fail "$msg (pattern '$pattern' found in output)"
}
assert_exit_zero()    { [ "$1" -eq 0 ] && pass "$2" || fail "$2 (exit $1, expected 0)"; }
assert_exit_nonzero() { [ "$1" -ne 0 ] && pass "$2" || fail "$2 (exit 0, expected nonzero)"; }
assert_executable()   { [ -x "$1" ] && pass "$2" || fail "$2 (not executable: $1)"; }
assert_valid_json()   {
    python3 -c "import json; json.load(open('$1'))" 2>/dev/null && pass "$2" || fail "$2 (invalid JSON: $1)"
}
assert_eq() { [ "$1" = "$2" ] && pass "$3" || fail "$3 (expected '$2', got '$1')"; }

mk_tmp_home() {
    local h; h="$(mktemp -d)"
    mkdir -p "$h/.claude"
    echo "$h"
}

# Run the installed binary with isolated HOME and NO_UPDATE_NOTIFIER
run_cli() {
    local home="$1"; shift
    HOME="$home" NO_UPDATE_NOTIFIER=1 "$CLI_BIN" "$@" 2>&1
}
run_cli_rc() {
    local home="$1"; shift
    HOME="$home" NO_UPDATE_NOTIFIER=1 "$CLI_BIN" "$@" 2>&1
    return $?
}

# ─────────────────────────────────────────────────────────────────────────────
# 0. Install published package into isolated env (npm install --prefix)
# ─────────────────────────────────────────────────────────────────────────────
section "0. Install published $PKG into isolated npm env"
INSTALL_ENV="$(mktemp -d)"
trap 'rm -rf "$INSTALL_ENV"' EXIT

echo "  Running: npm install --prefix $INSTALL_ENV $PKG"
if ! npm install --prefix "$INSTALL_ENV" "$PKG" >/dev/null 2>&1; then
    echo -e "${RED}  FATAL: npm install failed — is npm registry accessible?${NC}"
    exit 1
fi

CLI_BIN="$INSTALL_ENV/node_modules/.bin/loop-skills"
PKG_DIR="$INSTALL_ENV/node_modules/loop-skills"

[ -f "$CLI_BIN" ] && pass "CLI binary available: node_modules/.bin/loop-skills" || { fail "CLI binary missing"; exit 1; }
[ -d "$PKG_DIR" ] && pass "package installed to node_modules/" || { fail "package dir missing"; exit 1; }

PKG_VER="$(node -e "console.log(require('$PKG_DIR/package.json').version)")"
assert_eq "$PKG_VER" "0.5.2" "installed package.json version is 0.5.2"

# ─────────────────────────────────────────────────────────────────────────────
section "1. Security: no personal paths in package contents"
# ─────────────────────────────────────────────────────────────────────────────
PERSONAL_HITS="$(grep -rn "/Users/arman" "$PKG_DIR/agents/" "$PKG_DIR/skills/" "$PKG_DIR/bin/" "$PKG_DIR/commands/" "$PKG_DIR/templates/" 2>/dev/null | wc -l | tr -d ' ')"
assert_eq "$PERSONAL_HITS" "0" "no /Users/arman in agents, skills, bin, commands, templates"

VAULT_HITS="$(grep -rn "vault-projects\.json\|rules/personal-paths\.md" "$PKG_DIR/agents/" "$PKG_DIR/skills/" "$PKG_DIR/bin/" "$PKG_DIR/commands/" "$PKG_DIR/templates/" 2>/dev/null | wc -l | tr -d ' ')"
assert_eq "$VAULT_HITS" "0" "no vault-projects.json / personal-paths.md in package"

HAS_POSTINSTALL="$(node -e "const p=require('$PKG_DIR/package.json'); console.log(p.scripts&&p.scripts.postinstall?'yes':'no')")"
assert_eq "$HAS_POSTINSTALL" "no" "package.json: no postinstall script"

assert_file "$PKG_DIR/checksums.txt" "checksums.txt present in package"

PI_MANIFEST="$(node -e "const p=require('$PKG_DIR/package.json'); process.stdout.write(JSON.stringify(p.pi||{}))")"
echo "$PI_MANIFEST" | grep -q 'skills/pi' && pass "Pi manifest declares skills/pi" || fail "Pi manifest missing skills/pi"

# ─────────────────────────────────────────────────────────────────────────────
section "2. Package structure: required files present"
# ─────────────────────────────────────────────────────────────────────────────
assert_file "$PKG_DIR/skills/loop-plan/SKILL.md"     "loop-plan SKILL.md present"
assert_file "$PKG_DIR/skills/loop-debug/SKILL.md"    "loop-debug SKILL.md present"
assert_file "$PKG_DIR/skills/pi/loop-plan/SKILL.md" "Pi loop-plan skill present"
assert_file "$PKG_DIR/skills/pi/loop-debug/SKILL.md" "Pi loop-debug skill present"
assert_file "$PKG_DIR/skills/pi/loop-audit/SKILL.md" "Pi loop-audit skill present"
assert_dir  "$PKG_DIR/skills/loop-plan/references"   "loop-plan references/ dir present"
assert_dir  "$PKG_DIR/agents"                        "agents/ dir present"
assert_dir  "$PKG_DIR/bin"                           "bin/ dir present"
assert_file "$PKG_DIR/templates/CLAUDE.md.template"  "CLAUDE.md.template present"
assert_file "$PKG_DIR/templates/CONTEXT.md.template" "CONTEXT.md.template present"
assert_file "$PKG_DIR/templates/decisions/INDEX.md.template" "decisions INDEX.md.template present"

AGENT_COUNT="$(ls "$PKG_DIR/agents/"*.md 2>/dev/null | wc -l | tr -d ' ')"
[ "$AGENT_COUNT" -ge 35 ] && pass "agent count ≥35 (got $AGENT_COUNT)" || fail "expected ≥35 agents, got $AGENT_COUNT"

# ─────────────────────────────────────────────────────────────────────────────
section "3. --dry-run: nothing written, manifest shown"
# ─────────────────────────────────────────────────────────────────────────────
H3="$(mk_tmp_home)"; trap 'rm -rf "$H3"' EXIT

OUT3="$(run_cli "$H3" --dry-run --skills loop-plan --no-agents --no-bin)"
RC3=$?

assert_exit_zero $RC3 "dry-run: exits 0"
assert_no_file "$H3/.claude/skills/loop-plan/SKILL.md" "dry-run: SKILL.md not written"
assert_no_file "$H3/.claude/skills/.install-receipt.json" "dry-run: receipt not written"
assert_output_contains "$OUT3" "ry-run|nothing written|Nothing|Dry.run" "dry-run: output mentions dry-run"
assert_output_contains "$OUT3" "loop-plan" "dry-run: output mentions loop-plan path"

# ─────────────────────────────────────────────────────────────────────────────
section "4. Install loop-plan only (--force, --no-agents, --no-bin)"
# ─────────────────────────────────────────────────────────────────────────────
H4="$(mk_tmp_home)"; trap 'rm -rf "$H4"' EXIT

OUT4="$(run_cli "$H4" --skills loop-plan --no-agents --no-bin --force)"
RC4=$?

assert_exit_zero $RC4 "loop-plan install: exits 0"
assert_file "$H4/.claude/skills/loop-plan/SKILL.md" "loop-plan: SKILL.md installed"
assert_dir  "$H4/.claude/skills/loop-plan/references" "loop-plan: references/ installed"
assert_no_file "$H4/.claude/skills/loop-debug/SKILL.md" "loop-plan only: loop-debug NOT installed"
assert_file "$H4/.claude/skills/.install-receipt.json" "loop-plan: receipt written"
assert_valid_json "$H4/.claude/skills/.install-receipt.json" "receipt: valid JSON"

python3 - "$H4/.claude/skills/.install-receipt.json" <<'PYEOF'
import json, sys
r = json.load(open(sys.argv[1]))
assert isinstance(r.get('version'), str), "missing version"
assert 'loop-plan' in r.get('skills', []), "loop-plan not in skills"
assert isinstance(r.get('installed_at'), str), "missing installed_at"
assert len(r.get('files', [])) > 0, "files array empty"
print("OK")
PYEOF
[ $? -eq 0 ] && pass "receipt: correct shape (version, skills, installed_at, files)" || fail "receipt: shape invalid"

# ─────────────────────────────────────────────────────────────────────────────
section "5. loop-debug auto-adds loop-plan dependency"
# ─────────────────────────────────────────────────────────────────────────────
H5="$(mk_tmp_home)"; trap 'rm -rf "$H5"' EXIT

OUT5="$(run_cli "$H5" --skills loop-debug --no-agents --no-bin --force)"
RC5=$?

assert_exit_zero $RC5 "loop-debug auto-dep: exits 0"
assert_file "$H5/.claude/skills/loop-debug/SKILL.md" "loop-debug auto-dep: loop-debug installed"
assert_file "$H5/.claude/skills/loop-plan/SKILL.md"  "loop-debug auto-dep: loop-plan installed"
assert_output_contains "$OUT5" "automatically|auto" "auto-dep: output mentions automatic addition"

python3 - "$H5/.claude/skills/.install-receipt.json" <<'PYEOF'
import json, sys
r = json.load(open(sys.argv[1]))
assert 'loop-plan' in r['skills'] and 'loop-debug' in r['skills'], f"expected both, got {r['skills']}"
print("OK")
PYEOF
[ $? -eq 0 ] && pass "receipt: lists loop-plan + loop-debug" || fail "receipt: should list both skills"

# ─────────────────────────────────────────────────────────────────────────────
section "6. Install both skills + bin scripts"
# ─────────────────────────────────────────────────────────────────────────────
H6="$(mk_tmp_home)"; trap 'rm -rf "$H6"' EXIT

run_cli "$H6" --skills loop-plan,loop-debug --no-agents --force > /dev/null 2>&1

assert_file "$H6/.claude/skills/loop-plan/SKILL.md"  "both+bin: loop-plan installed"
assert_file "$H6/.claude/skills/loop-debug/SKILL.md" "both+bin: loop-debug installed"
assert_file "$H6/.claude/bin/new-adr.py"             "bin: new-adr.py present"
assert_file "$H6/.claude/bin/test-integrity.py"      "bin: test-integrity.py present"
assert_file "$H6/.claude/bin/run-codex-review.sh"    "bin: run-codex-review.sh present"

# Check bin scripts are executable
SCRIPT_COUNT=0; EXECUTABLE_COUNT=0
for script in "$H6/.claude/bin/"*.py "$H6/.claude/bin/"*.sh; do
    [ -f "$script" ] || continue
    SCRIPT_COUNT=$((SCRIPT_COUNT+1))
    [ -x "$script" ] && EXECUTABLE_COUNT=$((EXECUTABLE_COUNT+1))
done
[ $SCRIPT_COUNT -gt 0 ] && pass "bin: at least one script present ($SCRIPT_COUNT total)" || fail "bin: no scripts found"
[ $SCRIPT_COUNT -eq $EXECUTABLE_COUNT ] && pass "bin: all $SCRIPT_COUNT scripts are executable" || fail "bin: $((SCRIPT_COUNT-EXECUTABLE_COUNT)) scripts NOT executable"

# ─────────────────────────────────────────────────────────────────────────────
section "7. Agent install — Android/KMP + Universal subset"
# ─────────────────────────────────────────────────────────────────────────────
H7="$(mk_tmp_home)"; trap 'rm -rf "$H7"' EXIT

run_cli "$H7" --skills loop-plan --agents android-kmp-explorer,spec-reviewer --no-bin --force > /dev/null 2>&1

assert_file "$H7/.claude/agents/android-kmp-explorer.md" "agent: android-kmp-explorer.md installed"
assert_file "$H7/.claude/agents/spec-reviewer.md"        "agent: spec-reviewer.md installed"
assert_no_file "$H7/.claude/agents/swiftui-explorer.md"  "agent: unselected swiftui-explorer NOT installed"

# ─────────────────────────────────────────────────────────────────────────────
section "8. --no-agents: skip all agents"
# ─────────────────────────────────────────────────────────────────────────────
H8="$(mk_tmp_home)"; trap 'rm -rf "$H8"' EXIT

run_cli "$H8" --skills loop-plan --no-agents --no-bin --force > /dev/null 2>&1

AGENT_FILES="$(find "$H8/.claude" -name "*.md" -path "*/agents/*" 2>/dev/null | wc -l | tr -d ' ')"
assert_eq "$AGENT_FILES" "0" "--no-agents: zero agent .md files installed"

# ─────────────────────────────────────────────────────────────────────────────
section "9. --force overwrites existing skill"
# ─────────────────────────────────────────────────────────────────────────────
H9="$(mk_tmp_home)"; trap 'rm -rf "$H9"' EXIT
mkdir -p "$H9/.claude/skills/loop-plan"
echo "# ORIGINAL CONTENT" > "$H9/.claude/skills/loop-plan/SKILL.md"

run_cli "$H9" --skills loop-plan --no-agents --no-bin --force > /dev/null 2>&1

grep -q "ORIGINAL CONTENT" "$H9/.claude/skills/loop-plan/SKILL.md" && fail "--force: file not overwritten" || pass "--force: SKILL.md overwritten"
assert_contains "$H9/.claude/skills/loop-plan/SKILL.md" "loop-plan" "--force: SKILL.md has real content"

# ─────────────────────────────────────────────────────────────────────────────
section "10. Conflict detection without --force"
# ─────────────────────────────────────────────────────────────────────────────
H10="$(mk_tmp_home)"; trap 'rm -rf "$H10"' EXIT
mkdir -p "$H10/.claude/skills/loop-plan"
echo "# ORIGINAL" > "$H10/.claude/skills/loop-plan/SKILL.md"

# Non-interactive (stdin closed) → clack confirms cancel → should not overwrite
run_cli "$H10" --skills loop-plan --no-agents --no-bin < /dev/null > /dev/null 2>&1 || true

CONTENT10="$(cat "$H10/.claude/skills/loop-plan/SKILL.md" 2>/dev/null)"
[ "$CONTENT10" = "# ORIGINAL" ] && pass "conflict: without --force, original file preserved" || fail "conflict: file overwritten without --force"

# ─────────────────────────────────────────────────────────────────────────────
section "11. list command"
# ─────────────────────────────────────────────────────────────────────────────
H11="$(mk_tmp_home)"; trap 'rm -rf "$H11"' EXIT

OUT11_EMPTY="$(run_cli "$H11" list)"
assert_output_contains "$OUT11_EMPTY" "No install receipt|receipt|install" "list: explains no receipt when empty"

run_cli "$H11" --skills loop-plan --no-agents --no-bin --force > /dev/null 2>&1
OUT11_FULL="$(run_cli "$H11" list)"
assert_output_contains "$OUT11_FULL" "0.3.0" "list: shows version 0.3.0"
assert_output_contains "$OUT11_FULL" "loop-plan" "list: shows loop-plan in skills"

# ─────────────────────────────────────────────────────────────────────────────
section "12. verify command"
# ─────────────────────────────────────────────────────────────────────────────
H12="$(mk_tmp_home)"; trap 'rm -rf "$H12"' EXIT

OUT12_EMPTY="$(HOME="$H12" NO_UPDATE_NOTIFIER=1 "$CLI_BIN" verify 2>&1)"; RC12_EMPTY=$?
assert_exit_nonzero $RC12_EMPTY "verify: exits nonzero when no receipt"

run_cli "$H12" --skills loop-plan --no-agents --no-bin --force > /dev/null 2>&1
OUT12_CLEAN="$(HOME="$H12" NO_UPDATE_NOTIFIER=1 "$CLI_BIN" verify 2>&1)"; RC12_CLEAN=$?
assert_exit_zero $RC12_CLEAN "verify: exits 0 on clean install"
assert_output_contains "$OUT12_CLEAN" "OK|ok" "verify: reports OK count"

echo "TAMPERED" >> "$H12/.claude/skills/loop-plan/SKILL.md"
OUT12_TAMPER="$(HOME="$H12" NO_UPDATE_NOTIFIER=1 "$CLI_BIN" verify 2>&1)"; RC12_TAMPER=$?
assert_exit_nonzero $RC12_TAMPER "verify: exits nonzero after file tamper"
assert_output_contains "$OUT12_TAMPER" "MODIFIED|changed" "verify: reports modified file"

# ─────────────────────────────────────────────────────────────────────────────
section "13. init command — empty project (decline confirmation)"
# ─────────────────────────────────────────────────────────────────────────────
H13_HOME="$(mk_tmp_home)"; H13_PROJECT="$(mktemp -d)"
trap 'rm -rf "$H13_HOME" "$H13_PROJECT"' EXIT
cd "$H13_PROJECT" && git init -q

OUT13="$(echo 'n' | HOME="$H13_HOME" NO_UPDATE_NOTIFIER=1 "$CLI_BIN" init 2>&1)"
assert_output_contains "$OUT13" "scaffold|Scaffold|missing|Missing|init|Init|Cancel|cancel|foundation|Foundation" "init: mentions project init / scaffolding"

cd - > /dev/null

# ─────────────────────────────────────────────────────────────────────────────
section "14. init command — complete project (nothing to do)"
# ─────────────────────────────────────────────────────────────────────────────
H14_HOME="$(mk_tmp_home)"; H14_PROJECT="$(mktemp -d)"
trap 'rm -rf "$H14_HOME" "$H14_PROJECT"' EXIT
cd "$H14_PROJECT" && git init -q
mkdir -p .claude/decisions docs && touch .claude/CLAUDE.md CONTEXT.md

OUT14="$(HOME="$H14_HOME" NO_UPDATE_NOTIFIER=1 "$CLI_BIN" init 2>&1)"
assert_output_contains "$OUT14" "complete|already|Nothing" "init: complete project reports nothing to init"

cd - > /dev/null

# ─────────────────────────────────────────────────────────────────────────────
section "15. Invalid skill name rejected"
# ─────────────────────────────────────────────────────────────────────────────
H15="$(mk_tmp_home)"; trap 'rm -rf "$H15"' EXIT

OUT15="$(HOME="$H15" NO_UPDATE_NOTIFIER=1 "$CLI_BIN" --skills nonexistent-skill --no-agents 2>&1)"; RC15=$?
assert_exit_nonzero $RC15 "invalid skill: exits nonzero"
assert_output_contains "$OUT15" "Unknown skill|nonexistent-skill" "invalid skill: error names bad skill"

# ─────────────────────────────────────────────────────────────────────────────
section "16. Invalid agent name rejected"
# ─────────────────────────────────────────────────────────────────────────────
H16="$(mk_tmp_home)"; trap 'rm -rf "$H16"' EXIT

OUT16="$(HOME="$H16" NO_UPDATE_NOTIFIER=1 "$CLI_BIN" --skills loop-plan --agents no-such-agent 2>&1)"; RC16=$?
assert_exit_nonzero $RC16 "invalid agent: exits nonzero"
assert_output_contains "$OUT16" "Unknown agent|no-such-agent" "invalid agent: error names bad agent"

# ─────────────────────────────────────────────────────────────────────────────
section "17. NO_UPDATE_NOTIFIER suppresses update notice"
# ─────────────────────────────────────────────────────────────────────────────
H17="$(mk_tmp_home)"; trap 'rm -rf "$H17"' EXIT

OUT17="$(run_cli "$H17" --skills loop-plan --no-agents --no-bin --force 2>&1)"
assert_output_not_contains "$OUT17" "Update available" "NO_UPDATE_NOTIFIER: no update notice in output"

# ─────────────────────────────────────────────────────────────────────────────
section "18. --no-bin: bin scripts not installed, skills are"
# ─────────────────────────────────────────────────────────────────────────────
H18="$(mk_tmp_home)"; trap 'rm -rf "$H18"' EXIT

run_cli "$H18" --skills loop-plan --no-agents --no-bin --force > /dev/null 2>&1

assert_no_file "$H18/.claude/bin/new-adr.py"   "--no-bin: new-adr.py NOT installed"
assert_file "$H18/.claude/skills/loop-plan/SKILL.md" "--no-bin: SKILL.md still installed"

# ─────────────────────────────────────────────────────────────────────────────
section "19. Agent content: no personal paths after install"
# ─────────────────────────────────────────────────────────────────────────────
H19="$(mk_tmp_home)"; trap 'rm -rf "$H19"' EXIT

run_cli "$H19" --skills loop-plan --agents android-kmp-explorer,code-quality-reviewer,spec-reviewer --no-bin --force > /dev/null 2>&1

PERSONAL_IN_INSTALLED=0
for f in "$H19/.claude/agents/"*.md; do
    [ -f "$f" ] || continue
    grep -q "/Users/arman" "$f" && { PERSONAL_IN_INSTALLED=$((PERSONAL_IN_INSTALLED+1)); echo "  LEAK: $(basename $f)"; }
done
[ $PERSONAL_IN_INSTALLED -eq 0 ] && pass "installed agent files: no /Users/arman path" || fail "$PERSONAL_IN_INSTALLED agent(s) contain /Users/arman"

# ─────────────────────────────────────────────────────────────────────────────
section "20. Idempotent install (run twice with --force)"
# ─────────────────────────────────────────────────────────────────────────────
H20="$(mk_tmp_home)"; trap 'rm -rf "$H20"' EXIT

run_cli "$H20" --skills loop-plan --no-agents --no-bin --force > /dev/null 2>&1
run_cli "$H20" --skills loop-plan --no-agents --no-bin --force > /dev/null 2>&1

assert_valid_json "$H20/.claude/skills/.install-receipt.json" "idempotent: receipt still valid after 2nd install"
assert_file "$H20/.claude/skills/loop-plan/SKILL.md" "idempotent: SKILL.md present after 2nd install"

# ─────────────────────────────────────────────────────────────────────────────
section "21. Full install (all skills + broad agent set)"
# ─────────────────────────────────────────────────────────────────────────────
H21="$(mk_tmp_home)"; trap 'rm -rf "$H21"' EXIT

ALL_AGENTS="android-kmp-explorer,swiftui-explorer,spec-reviewer,code-quality-reviewer,research-agent,security-reviewer,test-runner"
run_cli "$H21" --skills loop-plan,loop-debug --agents "$ALL_AGENTS" --force > /dev/null 2>&1

assert_file "$H21/.claude/skills/loop-plan/SKILL.md"  "full: loop-plan installed"
assert_file "$H21/.claude/skills/loop-debug/SKILL.md" "full: loop-debug installed"
assert_file "$H21/.claude/agents/android-kmp-explorer.md"  "full: android-kmp-explorer installed"
assert_file "$H21/.claude/agents/swiftui-explorer.md"      "full: swiftui-explorer installed"
assert_file "$H21/.claude/agents/spec-reviewer.md"         "full: spec-reviewer installed"
assert_file "$H21/.claude/agents/code-quality-reviewer.md" "full: code-quality-reviewer installed"
assert_file "$H21/.claude/bin/new-adr.py"                  "full: bin scripts installed"
assert_valid_json "$H21/.claude/skills/.install-receipt.json" "full: receipt valid JSON"

python3 - "$H21/.claude/skills/.install-receipt.json" "$ALL_AGENTS" <<'PYEOF'
import json, sys
r = json.load(open(sys.argv[1]))
for a in sys.argv[2].split(','):
    assert a in r.get('agents', []), f"agent '{a}' missing from receipt"
print("OK")
PYEOF
[ $? -eq 0 ] && pass "full: all selected agents in receipt" || fail "full: agents missing from receipt"

# ─────────────────────────────────────────────────────────────────────────────
section "22. References directory — key files present"
# ─────────────────────────────────────────────────────────────────────────────
H22="$(mk_tmp_home)"; trap 'rm -rf "$H22"' EXIT

run_cli "$H22" --skills loop-plan --no-agents --no-bin --force > /dev/null 2>&1

REFS="$H22/.claude/skills/loop-plan/references"
for f in design-and-quality.md tdd-workflow.md state-schema.md orchestration.md drift-check.md workflow-phases.md orchestration-design.md; do
    assert_file "$REFS/$f" "references: $f present"
done

# ─────────────────────────────────────────────────────────────────────────────
section "23. SKILL.md content integrity"
# ─────────────────────────────────────────────────────────────────────────────
H23="$(mk_tmp_home)"; trap 'rm -rf "$H23"' EXIT

run_cli "$H23" --skills loop-plan,loop-debug --no-agents --no-bin --force > /dev/null 2>&1

for skill in loop-plan loop-debug; do
    SKILL_FILE="$H23/.claude/skills/$skill/SKILL.md"
    assert_not_contains "$SKILL_FILE" "/Users/arman" "$skill SKILL.md: no personal path"
    assert_contains "$SKILL_FILE" "Phase" "$skill SKILL.md: mentions Phase workflow"
    assert_contains "$SKILL_FILE" "loop-" "$skill SKILL.md: references loop skill name"
done

# ─────────────────────────────────────────────────────────────────────────────
section "24. Real ~/.claude was NOT touched during any test"
# ─────────────────────────────────────────────────────────────────────────────
REAL_RECEIPT="$HOME/.claude/skills/.install-receipt.json"
if [ ! -f "$REAL_RECEIPT" ]; then
    pass "real ~/.claude: no install receipt (clean)"
else
    # Receipt pre-exists — check it was not modified by our tests
    MTIME="$(stat -f %m "$REAL_RECEIPT" 2>/dev/null || stat -c %Y "$REAL_RECEIPT" 2>/dev/null)"
    NOW="$(date +%s)"
    AGE=$(( NOW - MTIME ))
    [ $AGE -gt 120 ] && pass "real ~/.claude: receipt pre-exists and was NOT touched by tests (age ${AGE}s)" || fail "real ~/.claude: receipt was recently modified — test isolation breach"
fi

REAL_SKILL="$HOME/.claude/skills/loop-plan/SKILL.md"
if [ -f "$REAL_SKILL" ]; then
    MTIME2="$(stat -f %m "$REAL_SKILL" 2>/dev/null || stat -c %Y "$REAL_SKILL" 2>/dev/null)"
    AGE2=$(( $(date +%s) - MTIME2 ))
    [ $AGE2 -gt 120 ] && pass "real ~/.claude/skills/loop-plan/SKILL.md: pre-exists, NOT touched by tests" || fail "real SKILL.md: recently modified — test isolation breach"
else
    pass "real ~/.claude: no loop-plan SKILL.md (not globally installed)"
fi

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════"
TOTAL=$((PASS + FAIL + SKIP))
if [ $FAIL -eq 0 ]; then
    echo -e "  ${GREEN}${BOLD}PASSED: ${PASS}/${TOTAL}${NC}"
    [ $SKIP -gt 0 ] && echo -e "  ${YELLOW}SKIPPED: ${SKIP}${NC}"
    echo "═══════════════════════════════════════════"
    exit 0
else
    echo -e "  ${GREEN}passed: ${PASS}${NC}  ${RED}failed: ${FAIL}${NC}  ${YELLOW}skipped: ${SKIP}${NC}"
    echo "═══════════════════════════════════════════"
    exit 1
fi
