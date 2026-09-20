#!/usr/bin/env python3
"""Validates Content/data/**/*.json against the rules in Content/schema/SCHEMA.md.

Pure standard library, no dependencies. Run after every content batch:

    python3 Tools/validate_content.py

Exits non-zero (and prints ERROR lines) if anything hard-fails. Prints WARNING
lines for soft issues (e.g. a base_verb pointing at an entry not authored yet)
that are expected during incremental, level-by-level content authoring.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "Content" / "data"
THEMES_FILE = DATA_DIR / "_shared" / "themes.json"

CEFR_LEVELS = {"A1", "A2", "B1", "B2", "C1", "C2"}
POS_VALUES = {"noun", "adjective", "verb", "phrasal_verb", "composite_verb", "other"}
VERB_POS = {"verb", "phrasal_verb", "composite_verb"}
NOUN_GENDERS = {"der", "die", "das"}

errors = []
warnings = []


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def load_json(path):
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError as e:
        err(f"{path}: invalid JSON ({e})")
        return None


def load_themes():
    if not THEMES_FILE.exists():
        err(f"{THEMES_FILE}: missing")
        return set()
    data = load_json(THEMES_FILE)
    if data is None:
        return set()
    return {t["id"] for t in data.get("themes", [])}


def validate_entry(entry, path, file_cefr, file_pos, seen_ids, all_ids):
    prefix = f"{path}:{entry.get('id', '?')}"

    required_common = [
        "id", "cefr", "pos", "lemma_de", "translations_en",
        "example_de", "example_en", "cloze_word", "themes", "priority",
    ]
    for field in required_common:
        if field not in entry:
            err(f"{prefix}: missing required field '{field}'")
    if any(f not in entry for f in required_common):
        return  # too broken to check further

    entry_id = entry["id"]
    if entry_id in seen_ids:
        err(f"{prefix}: duplicate id '{entry_id}' (first seen elsewhere)")
    seen_ids.add(entry_id)
    all_ids.add(entry_id)

    if entry["cefr"] != file_cefr:
        err(f"{prefix}: entry cefr '{entry['cefr']}' != file cefr '{file_cefr}'")
    if entry["pos"] != file_pos:
        err(f"{prefix}: entry pos '{entry['pos']}' != file pos '{file_pos}'")
    if entry["cefr"] not in CEFR_LEVELS:
        err(f"{prefix}: invalid cefr '{entry['cefr']}'")
    if entry["pos"] not in POS_VALUES:
        err(f"{prefix}: invalid pos '{entry['pos']}'")

    if not isinstance(entry["translations_en"], list) or not entry["translations_en"]:
        err(f"{prefix}: translations_en must be a non-empty list")
    if entry["cloze_word"] not in entry["example_de"]:
        err(f"{prefix}: cloze_word {entry['cloze_word']!r} is not a substring of example_de {entry['example_de']!r}")
    if not isinstance(entry["themes"], list) or not entry["themes"]:
        err(f"{prefix}: themes must be a non-empty list")

    priority = entry["priority"]
    if not isinstance(priority, int) or not (1 <= priority <= 5):
        err(f"{prefix}: priority must be an integer 1-5, got {priority!r}")

    pos = entry["pos"]

    if pos == "noun":
        noun = entry.get("noun")
        if not noun:
            err(f"{prefix}: pos=noun requires a 'noun' object")
        else:
            if noun.get("gender") not in NOUN_GENDERS:
                err(f"{prefix}: noun.gender must be one of {NOUN_GENDERS}")
            if "plural_de" not in noun:
                err(f"{prefix}: noun.plural_de is required (use null if none)")

    if pos in VERB_POS:
        verb = entry.get("verb")
        if not verb:
            err(f"{prefix}: pos={pos} requires a 'verb' object")
        else:
            for field in ("separable", "irregular", "present_3sg", "perfekt"):
                if field not in verb:
                    err(f"{prefix}: verb.{field} is required")
            if pos in ("phrasal_verb", "composite_verb"):
                for field in ("base_verb", "particle", "particle_meaning_hint"):
                    if not verb.get(field):
                        err(f"{prefix}: verb.{field} is required for {pos}")

    return entry


def main():
    if not DATA_DIR.exists():
        err(f"{DATA_DIR}: missing")
        print_summary()
        return 1

    theme_ids = load_themes()
    if not theme_ids:
        warn("no themes loaded from _shared/themes.json — theme references can't be checked")

    all_ids = set()
    base_verb_refs = []  # (prefix, base_verb_id)
    theme_refs = []  # (prefix, [theme_ids])

    level_dirs = sorted(
        d for d in DATA_DIR.iterdir()
        if d.is_dir() and d.name.upper() in CEFR_LEVELS
    )

    for level_dir in level_dirs:
        file_cefr = level_dir.name.upper()
        for json_file in sorted(level_dir.glob("*.json")):
            data = load_json(json_file)
            if data is None:
                continue
            for field in ("schemaVersion", "cefr", "pos", "entries"):
                if field not in data:
                    err(f"{json_file}: missing top-level field '{field}'")
            if "cefr" in data and data["cefr"] != file_cefr:
                err(f"{json_file}: file cefr '{data['cefr']}' != folder '{file_cefr}'")
            if "entries" not in data:
                continue

            seen_ids_in_file = set()
            for entry in data["entries"]:
                validated = validate_entry(
                    entry, json_file, data.get("cefr", file_cefr),
                    data.get("pos", ""), seen_ids_in_file, all_ids,
                )
                if validated is None:
                    continue
                prefix = f"{json_file}:{entry.get('id')}"
                theme_refs.append((prefix, entry.get("themes", [])))
                verb = entry.get("verb")
                if verb and verb.get("base_verb"):
                    base_verb_refs.append((prefix, verb["base_verb"]))

    for prefix, themes in theme_refs:
        for t in themes:
            if theme_ids and t not in theme_ids:
                err(f"{prefix}: unknown theme '{t}'")

    for prefix, base_verb_id in base_verb_refs:
        if base_verb_id not in all_ids:
            warn(f"{prefix}: base_verb '{base_verb_id}' not found yet (ok if it's a later batch)")

    print_summary()
    return 1 if errors else 0


def print_summary():
    total_checked = 0
    for w in warnings:
        print(f"WARNING: {w}")
    for e in errors:
        print(f"ERROR: {e}")
    print(f"\n{len(errors)} error(s), {len(warnings)} warning(s).")
    if not errors:
        print("Content is valid.")


if __name__ == "__main__":
    sys.exit(main())
