#!/opt/homebrew/bin/python3
"""Parse one YAML frontmatter block to a JSON object using PyYAML.

Runs under an isolated venv at ~/.claude/bin/.venv so PyYAML never touches
the system Python. Safe against shell injection (json.dumps) and YAML-tag
injection (yaml.safe_load rejects constructors).

Usage: scan-tooling-parse.py <file>
"""
import json
import re
import sys
from pathlib import Path

import yaml


# Fields that conventionally carry a CSV list when written as a bare scalar.
# PyYAML parses these as strings; we auto-split them for downstream jq queries.
CSV_LIST_FIELDS = frozenset({"tools", "disallowedTools", "allowed-tools"})


def parse_frontmatter(path: Path) -> dict:
    """Extract the first --- ... --- block and parse via PyYAML's safe_load."""
    text = path.read_text(encoding="utf-8", errors="replace")
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.DOTALL)
    if not m:
        return {}
    try:
        data = yaml.safe_load(m.group(1)) or {}
    except yaml.YAMLError as e:
        return {"_parse_error": str(e)}
    if not isinstance(data, dict):
        return {"_parse_error": "frontmatter is not a mapping"}
    # Auto-split CSV shorthand for known list fields
    for key in CSV_LIST_FIELDS:
        val = data.get(key)
        if isinstance(val, str) and "," in val:
            data[key] = [s.strip() for s in val.split(",") if s.strip()]
    return data


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: scan-tooling-parse.py <file>", file=sys.stderr)
        sys.exit(2)
    path = Path(sys.argv[1]).expanduser().resolve()
    if not path.is_file():
        print(json.dumps({"error": "not a file", "path": str(path)}))
        sys.exit(1)
    data = parse_frontmatter(path)
    data["_path"] = str(path)
    print(json.dumps(data, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
