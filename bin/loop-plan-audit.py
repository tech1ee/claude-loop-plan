#!/usr/bin/env python3
"""
loop-plan-audit.py — adherence audit + stale-plan flagging for /loop-plan + /loop-debug.

Reads ~/.claude/plans/*.state.json and reports:
- Total / shipped / aborted / abandoned / stalled counts.
- Rigor-selection rate (Phase 2 Q0 persistence).
- ADR-creation rate.
- Multi-iteration rate (loop value signal).
- Top stalled plans (Phase 7+ idle for >7 days).
- Stale plans (>14 days, current_phase ≤ 5) — cleanup candidates.

Read-only by default. --mark-abandoned mutates `completion_state` only.

Cite ADR-0021.

Usage:
  loop-plan-audit.py                              # default report
  loop-plan-audit.py --json                       # machine-readable
  loop-plan-audit.py --mark-abandoned             # flag stale plans (mutating)
  loop-plan-audit.py --suggest-resume <slug>      # print resume command for one plan
  loop-plan-audit.py --plans-dir <path>           # override default ~/.claude/plans/
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

DEFAULT_PLANS_DIR = Path.home() / ".claude" / "plans"
STALE_THRESHOLD_DAYS = 14
STALL_THRESHOLD_DAYS = 7
TERMINAL_PHASES = {"done", "shipped", "aborted", "complete", "7c-shipped"}


def parse_iso(ts):
    """Parse ISO 8601 timestamp; return None on failure. Naive timestamps assumed UTC."""
    if not ts:
        return None
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, AttributeError):
        return None


def load_states(plans_dir: Path):
    """Read every *.state.json under plans_dir; return list of (path, dict)."""
    states = []
    for p in sorted(plans_dir.glob("*.state.json")):
        try:
            with p.open() as f:
                states.append((p, json.load(f)))
        except (json.JSONDecodeError, OSError) as e:
            print(f"WARN: skipping {p.name}: {e}", file=sys.stderr)
    return states


def days_idle(state: dict, now: datetime) -> float | None:
    """Days since last_active_at; falls back to last_update_at; None if neither."""
    for key in ("last_active_at", "last_update_at"):
        ts = parse_iso(state.get(key))
        if ts:
            return (now - ts).total_seconds() / 86400
    return None


def classify(state: dict, now: datetime) -> str:
    """Return one of: shipped, aborted, abandoned, stalled-7+, active, phase-1-stub."""
    cs = state.get("completion_state")
    if cs in ("shipped", "aborted", "abandoned"):
        return cs
    phase = str(state.get("current_phase", "")).lower()
    if phase in TERMINAL_PHASES:
        return "shipped"
    idle = days_idle(state, now)
    iteration = state.get("iteration", 1)
    if phase in ("7a", "7b", "7c") and idle and idle > STALL_THRESHOLD_DAYS:
        return "stalled-7+"
    if idle and idle > STALE_THRESHOLD_DAYS and phase in ("0", "1", "2", "3", "3b", "4", "5"):
        return "abandoned-candidate"
    if phase == "1" and iteration == 1:
        return "phase-1-stub"
    return "active"


def report(states, now: datetime) -> dict:
    """Aggregate stats; return a dict (json-serializable)."""
    total = len(states)
    classes = {}
    rigor_set = 0
    adr_created = 0
    multi_iter = 0
    gap_acks = 0
    stalled_7 = []
    abandoned_candidates = []

    for path, state in states:
        cls = classify(state, now)
        classes[cls] = classes.get(cls, 0) + 1

        if state.get("rigor"):
            rigor_set += 1
        if state.get("adrs_created"):
            adr_created += 1
        if state.get("iteration", 1) >= 2:
            multi_iter += 1
        if state.get("gap_acknowledged"):
            gap_acks += 1

        if cls == "stalled-7+":
            stalled_7.append({
                "slug": state.get("slug", path.stem.removesuffix(".state")),
                "current_phase": state.get("current_phase"),
                "iteration": state.get("iteration", 1),
                "days_idle": round(days_idle(state, now) or 0, 1),
            })
        elif cls == "abandoned-candidate":
            abandoned_candidates.append({
                "slug": state.get("slug", path.stem.removesuffix(".state")),
                "current_phase": state.get("current_phase"),
                "days_idle": round(days_idle(state, now) or 0, 1),
            })

    stalled_7.sort(key=lambda x: -x["days_idle"])
    abandoned_candidates.sort(key=lambda x: -x["days_idle"])

    return {
        "total": total,
        "classes": classes,
        "rigor_set": rigor_set,
        "adr_created": adr_created,
        "multi_iter": multi_iter,
        "gap_acks": gap_acks,
        "stalled_7": stalled_7[:10],
        "abandoned_candidates": abandoned_candidates[:10],
    }


def pct(n, total):
    return f"{100 * n / total:5.1f}%" if total else "  n/a"


def render_text(rep: dict, now: datetime) -> str:
    total = rep["total"]
    out = []
    out.append(f"Loop-plan adherence audit — {now.date()}")
    out.append("=" * 50)
    out.append(f"Total state files:        {total:>4}")
    out.append("")
    out.append("Classification:")
    for cls in ("shipped", "aborted", "abandoned", "stalled-7+", "abandoned-candidate", "phase-1-stub", "active"):
        n = rep["classes"].get(cls, 0)
        out.append(f"  {cls:<24} {n:>4}  ({pct(n, total)})")
    out.append("")
    out.append("Adherence signals:")
    out.append(f"  Rigor selection rate:      {rep['rigor_set']}/{total} ({pct(rep['rigor_set'], total)})")
    out.append(f"  ADR creation rate:         {rep['adr_created']}/{total} ({pct(rep['adr_created'], total)})")
    out.append(f"  Multi-iteration rate:      {rep['multi_iter']}/{total} ({pct(rep['multi_iter'], total)})")
    out.append(f"  Gap-acknowledged plans:    {rep['gap_acks']}/{total} ({pct(rep['gap_acks'], total)})")
    out.append("")
    if rep["stalled_7"]:
        out.append(f"Top stalled plans (Phase 7+, >{STALL_THRESHOLD_DAYS}d idle):")
        for s in rep["stalled_7"]:
            out.append(f"  {s['slug']:<50} iter {s['iteration']}, Phase {s['current_phase']}, {s['days_idle']}d idle")
        out.append("")
    if rep["abandoned_candidates"]:
        out.append(f"Abandoned candidates (>{STALE_THRESHOLD_DAYS}d, Phase ≤ 5):")
        for s in rep["abandoned_candidates"]:
            out.append(f"  {s['slug']:<50} Phase {s['current_phase']}, {s['days_idle']}d idle")
        out.append("")
    out.append("Run with --mark-abandoned to flip stale plans to completion_state=\"abandoned\".")
    out.append("Run with --suggest-resume <slug> to print the resume command for one plan.")
    return "\n".join(out)


def mark_abandoned(states, now: datetime, plans_dir: Path) -> int:
    """Write completion_state='abandoned' to stale state files. Return count."""
    n = 0
    for path, state in states:
        if classify(state, now) != "abandoned-candidate":
            continue
        state["completion_state"] = "abandoned"
        state["last_active_at"] = now.isoformat()
        tmp = path.with_suffix(".state.json.tmp")
        with tmp.open("w") as f:
            json.dump(state, f, indent=2)
        os.replace(tmp, path)
        n += 1
        print(f"abandoned: {path.name}")
    return n


def suggest_resume(slug: str, plans_dir: Path) -> str:
    """Print a copy-paste resume command for one plan."""
    state_path = plans_dir / f"{slug}.state.json"
    plan_path = plans_dir / f"{slug}.md"
    if not state_path.exists():
        return f"ERROR: no state file at {state_path}"
    with state_path.open() as f:
        state = json.load(f)
    return (
        f"Resume command for {slug}:\n"
        f"  /loop-plan --resume {slug}\n"
        f"  Last phase: {state.get('current_phase')}, iteration {state.get('iteration', 1)}\n"
        f"  Plan file: {plan_path}\n"
        f"  State file: {state_path}\n"
    )


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--plans-dir", type=Path, default=DEFAULT_PLANS_DIR)
    p.add_argument("--json", action="store_true", help="Emit JSON instead of text")
    p.add_argument("--mark-abandoned", action="store_true", help="Flip stale plans to completion_state=abandoned (mutating)")
    p.add_argument("--suggest-resume", metavar="SLUG", help="Print resume command for one plan")
    args = p.parse_args()

    if not args.plans_dir.exists():
        print(f"ERROR: plans dir not found: {args.plans_dir}", file=sys.stderr)
        return 1

    if args.suggest_resume:
        print(suggest_resume(args.suggest_resume, args.plans_dir))
        return 0

    now = datetime.now(timezone.utc)
    states = load_states(args.plans_dir)
    rep = report(states, now)

    if args.mark_abandoned:
        n = mark_abandoned(states, now, args.plans_dir)
        print(f"Marked {n} plan(s) as abandoned.")
        return 0

    if args.json:
        print(json.dumps(rep, indent=2, default=str))
    else:
        print(render_text(rep, now))
    return 0


if __name__ == "__main__":
    sys.exit(main())
