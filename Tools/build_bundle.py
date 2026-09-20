#!/usr/bin/env python3
"""Builds the iOS app's vocabulary bundle from Content/data.

Output: iOS/DeutschMeister/Resources/vocab-bundle.json
  { "schemaVersion": 1, "themes": [...], "entries": [...] }

The file is committed, so building the app never needs Python. Re-run this after
any change under Content/data/ (validate first: python3 Tools/validate_content.py).

Usage:
    python3 Tools/build_bundle.py
"""
import json
from pathlib import Path

from build import load_entries, load_themes

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "iOS" / "DeutschMeister" / "Resources" / "vocab-bundle.json"


def dumps(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def main():
    entries = load_entries()
    themes = load_themes()
    # One entry per line keeps git diffs reviewable without bloating the file.
    lines = ['{"schemaVersion":1,']
    lines.append('"themes":[' + ",".join(dumps(t) for t in themes) + "],")
    lines.append('"entries":[')
    lines.append(",\n".join(dumps(e) for e in entries))
    lines.append("]}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    # Round-trip so a malformed bundle can never be committed.
    parsed = json.loads(OUT.read_text(encoding="utf-8"))
    assert len(parsed["entries"]) == len(entries)
    print(f"Wrote {OUT.relative_to(ROOT)} ({len(entries)} entries, {len(themes)} themes, "
          f"{OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
