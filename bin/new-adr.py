#!/usr/bin/env python3
"""
new-adr.py — MADR 4.0.0 ADR helper for the loop-plan skill.

Subcommands:
  init          Create <root>/.claude/decisions/, write CLAUDE.md snippet, register root.
  create        Write next-numbered ADR from template; optional --supersedes flips old status.
  accept        Flip status: proposed → accepted. Idempotent. Adds one Confirmation note.
  confirm       Append a single bullet under ## Confirmation. Append-only.
  list          Print "NNNN | status | title" for every ADR in <root>.
  index         Refresh <root>/.claude/decisions/INDEX.md (markdown table).
  grep-patterns Scan ~/.claude/patterns/.projects-registry roots for ADRs matching --slug.

Hard rules (cite ADR-0002 MADR + ADR-0005 immutability):
  - Accepted ADRs: only `status:` is mutable, only via --supersedes or accept.
  - confirm appends, never overwrites.
  - All file ops scoped to <root>/.claude/decisions/. Symlinked outside-root → refuse.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from datetime import date
from pathlib import Path

TEMPLATE_PATH = Path.home() / ".claude" / "templates" / "madr-minimal.md"
SNIPPET_PATH = Path.home() / ".claude" / "templates" / "project-claude-md-snippet.md"
REGISTRY_PATH = Path.home() / ".claude" / "patterns" / ".projects-registry"

ADR_FILENAME_RE = re.compile(r"^(\d{4})-([a-z0-9][a-z0-9-]*)\.md$")
STATUS_RE = re.compile(r"^status:\s*(.*)$", re.MULTILINE)
TITLE_RE = re.compile(r"^#\s+(.+)$", re.MULTILINE)
CONFIRMATION_RE = re.compile(r"^##\s+Confirmation\s*$", re.MULTILINE)


def die(msg: str, code: int = 1) -> None:
    print(f"new-adr: {msg}", file=sys.stderr)
    sys.exit(code)


def decisions_dir(root: Path) -> Path:
    return root / ".claude" / "decisions"


def validate_root(root: Path) -> Path:
    root = root.resolve()
    if not root.is_dir():
        die(f"--root {root} is not a directory")
    dd = decisions_dir(root)
    if dd.exists() and dd.is_symlink():
        target = dd.resolve()
        try:
            target.relative_to(root)
        except ValueError:
            die(f"refusing to write: {dd} is a symlink to {target} outside --root")
    return root


def list_adrs(root: Path) -> list[tuple[str, Path]]:
    dd = decisions_dir(root)
    if not dd.is_dir():
        return []
    entries: list[tuple[str, Path]] = []
    for p in sorted(dd.iterdir()):
        m = ADR_FILENAME_RE.match(p.name)
        if m:
            entries.append((m.group(1), p))
    return entries


def parse_adr(path: Path) -> tuple[str, str]:
    """Return (status, title)."""
    text = path.read_text()
    status_m = STATUS_RE.search(text)
    title_m = TITLE_RE.search(text)
    status = status_m.group(1).strip() if status_m else "?"
    title = title_m.group(1).strip() if title_m else path.stem
    return status, title


def next_number(root: Path) -> str:
    existing = list_adrs(root)
    if not existing:
        return "0001"
    highest = max(int(n) for n, _ in existing)
    return f"{highest + 1:04d}"


def find_by_id(root: Path, adr_id: str) -> Path:
    adr_id = adr_id.zfill(4)
    for n, p in list_adrs(root):
        if n == adr_id:
            return p
    die(f"ADR-{adr_id} not found in {decisions_dir(root)}")
    raise SystemExit(1)  # unreachable


def replace_status(text: str, new_status: str) -> str:
    return STATUS_RE.sub(f"status: {new_status}", text, count=1)


def write_index(root: Path) -> Path:
    dd = decisions_dir(root)
    dd.mkdir(parents=True, exist_ok=True)
    rows = []
    for n, p in list_adrs(root):
        status, title = parse_adr(p)
        rows.append(f"| {n} | {status} | {title} |")
    body = ["# ADR Index", "", "| ID | Status | Title |", "|---|---|---|"]
    body.extend(rows if rows else ["| _none_ | | |"])
    body.append("")
    index_path = dd / "INDEX.md"
    index_path.write_text("\n".join(body))
    return index_path


def cmd_init(args: argparse.Namespace) -> int:
    root = validate_root(Path(args.root))
    dd = decisions_dir(root)
    dd.mkdir(parents=True, exist_ok=True)

    claude_md = root / ".claude" / "CLAUDE.md"
    if not claude_md.exists():
        if not SNIPPET_PATH.exists():
            die(f"snippet template missing at {SNIPPET_PATH}")
        claude_md.write_text(SNIPPET_PATH.read_text())
        print(f"wrote {claude_md}")
    else:
        print(f"kept existing {claude_md}")

    REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    existing = set()
    if REGISTRY_PATH.exists():
        existing = {line.strip() for line in REGISTRY_PATH.read_text().splitlines() if line.strip()}
    if str(root) not in existing:
        with REGISTRY_PATH.open("a") as f:
            f.write(f"{root}\n")
        print(f"registered {root} in {REGISTRY_PATH}")
    else:
        print(f"already registered: {root}")

    write_index(root)
    print(f"refreshed {dd / 'INDEX.md'}")
    return 0


def cmd_create(args: argparse.Namespace) -> int:
    root = validate_root(Path(args.root))
    if not TEMPLATE_PATH.exists():
        die(f"template missing at {TEMPLATE_PATH}")
    dd = decisions_dir(root)
    dd.mkdir(parents=True, exist_ok=True)

    new_id = next_number(root)
    slug = args.slug
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", slug):
        die(f"invalid slug {slug!r}: lowercase, hyphenated, no leading hyphen")
    new_path = dd / f"{new_id}-{slug}.md"
    if new_path.exists():
        die(f"refusing to overwrite {new_path}")

    today = date.today().isoformat()
    text = TEMPLATE_PATH.read_text()
    text = text.replace("{YYYY-MM-DD}", today)
    text = text.replace(
        '{short title — verb-noun, e.g. "Use Koin for DI"}',
        args.title,
    )
    initial_status = "proposed"
    if args.supersedes:
        old_id = args.supersedes.zfill(4)
        old_path = find_by_id(root, old_id)
        text = text.replace(
            "{What's the situation forcing this decision? Reference the loop-plan slug + iteration if applicable.}",
            f"Supersedes [ADR-{old_id}]({old_path.name}). {{rationale for replacement}}",
        )
    text = text.replace(
        "{proposed | accepted | deprecated | superseded by [ADR-NNNN](NNNN-...)}",
        initial_status,
    )

    new_path.write_text(text)
    print(f"created ADR-{new_id} {new_path}")

    if args.supersedes:
        old_id = args.supersedes.zfill(4)
        old_path = find_by_id(root, old_id)
        old_text = old_path.read_text()
        new_status = f"superseded by [ADR-{new_id}]({new_path.name})"
        old_text = replace_status(old_text, new_status)
        old_path.write_text(old_text)
        print(f"flipped ADR-{old_id} status → {new_status}")

    write_index(root)
    return 0


def cmd_accept(args: argparse.Namespace) -> int:
    root = validate_root(Path(args.root))
    adr_id = args.id.zfill(4)
    path = find_by_id(root, adr_id)
    text = path.read_text()
    status_m = STATUS_RE.search(text)
    if not status_m:
        die(f"ADR-{adr_id} has no status: line")
    current = status_m.group(1).strip()
    if current == "accepted":
        print(f"ADR-{adr_id} already accepted (no-op)")
        return 0
    if current.startswith("superseded"):
        die(f"ADR-{adr_id} is {current}; cannot accept a superseded ADR")
    text = replace_status(text, "accepted")
    text = append_confirmation(text, f"accepted {date.today().isoformat()}")
    path.write_text(text)
    print(f"ADR-{adr_id} status: {current} → accepted")
    write_index(root)
    return 0


def append_confirmation(text: str, note: str) -> str:
    if not CONFIRMATION_RE.search(text):
        die("ADR has no '## Confirmation' section")
    lines = text.splitlines(keepends=False)
    out: list[str] = []
    inserted = False
    in_section = False
    section_end = -1
    for i, line in enumerate(lines):
        if not inserted and CONFIRMATION_RE.match(line):
            in_section = True
            out.append(line)
            section_end = i
            continue
        if in_section and line.startswith("## "):
            # Insert before next H2.
            out.append(f"- {note}")
            out.append(line)
            inserted = True
            in_section = False
            continue
        out.append(line)
        if in_section:
            section_end = i
    if not inserted:
        # End of file: drop trailing blank lines, append.
        while out and out[-1].strip() == "":
            out.pop()
        out.append(f"- {note}")
        out.append("")
    return "\n".join(out) + ("\n" if not text.endswith("\n") else "")


def cmd_confirm(args: argparse.Namespace) -> int:
    root = validate_root(Path(args.root))
    adr_id = args.id.zfill(4)
    path = find_by_id(root, adr_id)
    text = path.read_text()
    today = date.today().isoformat()
    note = f"{today} — outcome: {args.outcome} — {args.note}"
    text = append_confirmation(text, note)
    path.write_text(text)
    print(f"ADR-{adr_id} appended Confirmation: {note}")
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    root = validate_root(Path(args.root))
    rows = list_adrs(root)
    if not rows:
        print("(no ADRs)")
        return 0
    for n, p in rows:
        status, title = parse_adr(p)
        print(f"{n} | {status} | {title}")
    return 0


def cmd_index(args: argparse.Namespace) -> int:
    root = validate_root(Path(args.root))
    path = write_index(root)
    print(f"refreshed {path}")
    return 0


def cmd_grep_patterns(args: argparse.Namespace) -> int:
    if not REGISTRY_PATH.exists():
        print(f"(no registry at {REGISTRY_PATH}; run `init` in projects first)")
        return 0
    keywords = [k.strip().lower() for k in args.slug.split() if k.strip()]
    if not keywords:
        die("--slug must be non-empty")
    matches = []
    roots = [Path(line.strip()) for line in REGISTRY_PATH.read_text().splitlines() if line.strip()]
    for root in roots:
        if not root.is_dir():
            continue
        for n, p in list_adrs(root):
            text = p.read_text().lower()
            if all(k in text for k in keywords):
                _, title = parse_adr(p)
                matches.append((str(root), n, title))
    if not matches:
        print(f"(no matches for slug={args.slug!r} across {len(roots)} registered project(s))")
        return 0
    for root_str, n, title in matches:
        print(f"{root_str} | ADR-{n} | {title}")
    if len({r for r, _, _ in matches}) >= 3:
        print(f"\nCANDIDATE: {len(matches)} matches across ≥3 projects — review for ~/.claude/patterns/ promotion.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="new-adr", description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_init = sub.add_parser("init", help="bootstrap project for ADRs")
    p_init.add_argument("--root", required=True)
    p_init.set_defaults(func=cmd_init)

    p_create = sub.add_parser("create", help="create new ADR")
    p_create.add_argument("--root", required=True)
    p_create.add_argument("--slug", required=True)
    p_create.add_argument("--title", required=True)
    p_create.add_argument("--supersedes", default=None, help="NNNN of ADR to supersede")
    p_create.set_defaults(func=cmd_create)

    p_accept = sub.add_parser("accept", help="flip proposed → accepted")
    p_accept.add_argument("--root", required=True)
    p_accept.add_argument("--id", required=True)
    p_accept.set_defaults(func=cmd_accept)

    p_confirm = sub.add_parser("confirm", help="append Confirmation note")
    p_confirm.add_argument("--root", required=True)
    p_confirm.add_argument("--id", required=True)
    p_confirm.add_argument("--outcome", required=True, choices=["pass", "drift", "superseded"])
    p_confirm.add_argument("--note", required=True)
    p_confirm.set_defaults(func=cmd_confirm)

    p_list = sub.add_parser("list", help="list all ADRs")
    p_list.add_argument("--root", required=True)
    p_list.set_defaults(func=cmd_list)

    p_index = sub.add_parser("index", help="refresh INDEX.md")
    p_index.add_argument("--root", required=True)
    p_index.set_defaults(func=cmd_index)

    p_grep = sub.add_parser("grep-patterns", help="surface candidates across registered projects")
    p_grep.add_argument("--slug", required=True)
    p_grep.set_defaults(func=cmd_grep_patterns)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
