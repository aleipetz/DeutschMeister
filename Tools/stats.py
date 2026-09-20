#!/usr/bin/env python3
"""Recomputes content coverage stats and derived verb-family groupings.

Run after content batches (validate_content.py should pass first):

    python3 Tools/stats.py

Writes:
  - Content/generated/verb-families.json  (derived, regenerable — groups verbs
    by shared base_verb / particle so the app's "verb family explorer" has
    something to show without hand-authored cross-references)
  - Prints a coverage table (level x pos counts) to stdout, in the same shape
    used by Docs/content-progress-tracker.md's summary section.
"""
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "Content" / "data"
GENERATED_DIR = ROOT / "Content" / "generated"
CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
POS_VALUES = ["noun", "adjective", "verb", "phrasal_verb", "composite_verb", "other"]


def load_all_entries():
    entries = []
    for level in CEFR_LEVELS:
        level_dir = DATA_DIR / level.lower()
        if not level_dir.exists():
            continue
        for json_file in sorted(level_dir.glob("*.json")):
            try:
                data = json.loads(json_file.read_text())
            except json.JSONDecodeError:
                continue
            entries.extend(data.get("entries", []))
    return entries


def build_verb_families(entries):
    by_base = defaultdict(list)
    for e in entries:
        verb = e.get("verb")
        if verb and verb.get("base_verb"):
            by_base[verb["base_verb"]].append({
                "id": e["id"],
                "lemma_de": e["lemma_de"],
                "particle": verb.get("particle"),
                "particle_meaning_hint": verb.get("particle_meaning_hint"),
            })
    families = [
        {"base_verb": base, "members": sorted(members, key=lambda m: m["id"])}
        for base, members in sorted(by_base.items())
    ]
    return {"schemaVersion": 1, "families": families}


def print_coverage_table(entries):
    counts = defaultdict(int)
    for e in entries:
        counts[(e.get("cefr"), e.get("pos"))] += 1

    header = ["Level"] + POS_VALUES + ["Total"]
    print("\t".join(header))
    grand_total = 0
    for level in CEFR_LEVELS:
        row = [level]
        level_total = 0
        for pos in POS_VALUES:
            c = counts.get((level, pos), 0)
            row.append(str(c))
            level_total += c
        row.append(str(level_total))
        grand_total += level_total
        print("\t".join(row))
    print(f"\nTotal entries across all levels: {grand_total}")


def main():
    entries = load_all_entries()
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)

    families = build_verb_families(entries)
    out_path = GENERATED_DIR / "verb-families.json"
    out_path.write_text(json.dumps(families, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {out_path} ({len(families['families'])} verb families)\n")

    print_coverage_table(entries)


if __name__ == "__main__":
    main()
