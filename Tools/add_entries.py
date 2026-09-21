#!/usr/bin/env python3
"""Adds vocabulary entries to Content/data from a compact authoring file.

Writing full JSON by hand is slow and error-prone, so batches are authored as one line per
word and expanded into the schema in Content/schema/SCHEMA.md. The JSON under Content/data
stays the source of truth; batch files are throwaway input.

Usage:
    python3 Tools/add_entries.py batch.txt            # add entries
    python3 Tools/add_entries.py batch.txt --dry-run  # check only, write nothing

Batch format. `## <LEVEL> <kind>` starts a section (kind = noun, adjective, verb, phrasal,
composite, other). Then one entry per line, fields separated by " | ". Blank fields use the
default; "-" means none. Lines starting with # are comments.

  noun       lemma | art | plural | en1; en2 | example_de | example_en | theme[,theme] | priority | cloze | note
  adjective  lemma | en | example_de | example_en | theme | priority | cloze | comparative | superlative | note
  verb       lemma | en | example_de | example_en | theme | priority | cloze | irregular(0/1) | present_3sg | perfekt | praeteritum | note
  phrasal    lemma | en | example_de | example_en | theme | priority | cloze | irregular | present_3sg | perfekt | base_verb | particle | hint | note
  composite  (same fields as phrasal)
  other      lemma | en | example_de | example_en | theme | priority | cloze | note

`cloze` defaults to the lemma (nouns, adjectives, other). Verbs must give the form used in the
example (for phrasal/composite verbs that is usually the particle). `base_verb` is the base
verb's lemma (e.g. "machen"); the id is derived. Ids are derived from the lemma:
"Häuser" style umlauts become ae/oe/ue, "sich " is dropped, e.g. "sich entscheiden" -> entscheiden_verb.
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "Content" / "data"
THEMES_FILE = DATA_DIR / "_shared" / "themes.json"

KINDS = {
    "noun": ("noun", "nouns.json", "noun"),
    "adjective": ("adjective", "adjectives.json", "adjective"),
    "verb": ("verb", "verbs.json", "verb"),
    "phrasal": ("phrasal_verb", "phrasal-verbs.json", "verb"),
    "composite": ("composite_verb", "composite-verbs.json", "verb"),
    "other": ("other", "other.json", "other"),
}
GENDERS = {"der", "die", "das"}

# Endings whose gender is reliable enough to flag a likely typo.
DIE_ENDINGS = ("ung", "heit", "keit", "schaft", "tion", "sion", "tät", "ik")
DAS_ENDINGS = ("chen", "lein")
DER_ENDINGS = ("ling", "ismus")


def slug(text):
    text = text.strip().lower()
    if text.startswith("sich "):
        text = text[5:]
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        text = text.replace(a, b)
    return re.sub(r"[^a-z0-9]+", "_", text).strip("_")


def entry_id(lemma, suffix):
    return f"{slug(lemma)}_{suffix}"


def blank(value):
    return value is None or value.strip() in ("", "-")


def clean(value):
    return None if blank(value) else value.strip()


def fields(parts, minimum, maximum, kind, line_no, problems):
    if len(parts) < minimum:
        problems.append(f"line {line_no}: {kind} needs at least {minimum} fields, got {len(parts)}: {' | '.join(parts)[:80]}")
        return None
    return parts + [""] * (maximum - len(parts))


def parse_batch(path, themes, existing_ids, existing_lemmas):
    entries = []  # (level, filename, pos, entry)
    problems, warnings = [], []
    section = None
    seen_in_batch = set()

    for line_no, raw in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#") and not line.startswith("##"):
            continue
        if line.startswith("##"):
            bits = line[2:].split()
            if len(bits) != 2 or bits[0].upper() not in {"A1", "A2", "B1", "B2", "C1", "C2"} or bits[1] not in KINDS:
                problems.append(f"line {line_no}: bad section header {line!r}")
                section = None
            else:
                section = (bits[0].upper(), bits[1])
            continue
        if section is None:
            problems.append(f"line {line_no}: entry before any valid section header")
            continue

        level, kind = section
        pos, filename, shape = KINDS[kind]
        parts = [p.strip() for p in line.split(" | ")]
        where = f"line {line_no} ({parts[0]})"

        if kind == "noun":
            f = fields(parts, 8, 10, kind, line_no, problems)
            if f is None:
                continue
            lemma, art, plural, en, de, en_ex, theme, pri, cloze, note = f
            if art not in GENDERS:
                problems.append(f"{where}: gender must be der/die/das, got {art!r}")
                continue
            for endings, expected in ((DIE_ENDINGS, "die"), (DAS_ENDINGS, "das"), (DER_ENDINGS, "der")):
                if lemma.lower().endswith(endings) and art != expected:
                    warnings.append(f"{where}: ends like a '{expected}' noun but is '{art}' (check)")
            entry = {"lemma_de": lemma, "translations_en": [t.strip() for t in en.split(";") if t.strip()],
                     "example_de": de, "example_en": en_ex, "cloze_word": clean(cloze) or lemma,
                     "themes": [t.strip() for t in theme.split(",")], "priority": None,
                     "noun": {"gender": art, "plural_de": clean(plural)}}
            note_val = clean(note)

        elif kind == "adjective":
            f = fields(parts, 6, 10, kind, line_no, problems)
            if f is None:
                continue
            lemma, en, de, en_ex, theme, pri, cloze, comp, sup, note = f
            entry = {"lemma_de": lemma, "translations_en": [t.strip() for t in en.split(";") if t.strip()],
                     "example_de": de, "example_en": en_ex, "cloze_word": clean(cloze) or lemma,
                     "themes": [t.strip() for t in theme.split(",")], "priority": None}
            if clean(comp) or clean(sup):
                entry["adjective"] = {"comparative_irregular": clean(comp), "superlative_irregular": clean(sup)}
            note_val = clean(note)

        elif kind == "verb":
            f = fields(parts, 10, 12, kind, line_no, problems)
            if f is None:
                continue
            lemma, en, de, en_ex, theme, pri, cloze, irr, present, perfekt, praet, note = f
            if blank(cloze):
                problems.append(f"{where}: verbs need a cloze form")
                continue
            entry = {"lemma_de": lemma, "translations_en": [t.strip() for t in en.split(";") if t.strip()],
                     "example_de": de, "example_en": en_ex, "cloze_word": cloze,
                     "themes": [t.strip() for t in theme.split(",")], "priority": None,
                     "verb": {"separable": False, "irregular": irr == "1", "present_3sg": present, "perfekt": perfekt,
                              "praeteritum_3sg": clean(praet), "base_verb": None, "particle": None,
                              "particle_meaning_hint": None}}
            note_val = clean(note)
            if not re.match(r"^(hat|ist)\b|^hat sich\b|^ist\b", perfekt):
                warnings.append(f"{where}: perfekt {perfekt!r} should start with hat/ist")

        elif kind in ("phrasal", "composite"):
            f = fields(parts, 13, 14, kind, line_no, problems)
            if f is None:
                continue
            lemma, en, de, en_ex, theme, pri, cloze, irr, present, perfekt, base, particle, hint, note = f
            if blank(cloze) or blank(base) or blank(particle) or blank(hint):
                problems.append(f"{where}: {kind} needs cloze, base_verb, particle and hint")
                continue
            entry = {"lemma_de": lemma, "translations_en": [t.strip() for t in en.split(";") if t.strip()],
                     "example_de": de, "example_en": en_ex, "cloze_word": cloze,
                     "themes": [t.strip() for t in theme.split(",")], "priority": None,
                     "verb": {"separable": True, "irregular": irr == "1", "present_3sg": present, "perfekt": perfekt,
                              "praeteritum_3sg": None, "base_verb": entry_id(base, "verb"), "particle": particle,
                              "particle_meaning_hint": hint}}
            note_val = clean(note)
            if not present.rstrip(".").lower().endswith(particle.lower()) or "..." not in present:
                warnings.append(f"{where}: present {present!r} should look like 'xxx ... {particle}'")
            if not re.match(r"^(hat|ist)\b|^hat sich\b|^ist\b", perfekt):
                warnings.append(f"{where}: perfekt {perfekt!r} should start with hat/ist")

        else:  # other
            f = fields(parts, 6, 8, kind, line_no, problems)
            if f is None:
                continue
            lemma, en, de, en_ex, theme, pri, cloze, note = f
            entry = {"lemma_de": lemma, "translations_en": [t.strip() for t in en.split(";") if t.strip()],
                     "example_de": de, "example_en": en_ex, "cloze_word": clean(cloze) or lemma,
                     "themes": [t.strip() for t in theme.split(",")], "priority": None}
            note_val = clean(note)

        if not pri.isdigit() or not 1 <= int(pri) <= 5:
            problems.append(f"{where}: priority must be 1-5, got {pri!r}")
            continue
        entry["priority"] = int(pri)
        if not entry["translations_en"]:
            problems.append(f"{where}: no translations")
            continue
        for t in entry["themes"]:
            if t not in themes:
                problems.append(f"{where}: unknown theme {t!r}")
        if entry["cloze_word"] not in entry["example_de"]:
            problems.append(f"{where}: cloze {entry['cloze_word']!r} not in example {entry['example_de']!r}")
            continue
        if kind == "noun" and not lemma[0].isupper():
            warnings.append(f"{where}: noun lemma should be capitalised")

        eid = entry_id(lemma, shape)
        key = (lemma.lower(), pos)
        if eid in existing_ids or eid in seen_in_batch:
            warnings.append(f"{where}: skipped, id {eid} already exists")
            continue
        if key in existing_lemmas and existing_lemmas[key] != level:
            warnings.append(f"{where}: {pos} '{lemma}' already exists at {existing_lemmas[key]}")
        seen_in_batch.add(eid)

        ordered = {"id": eid, "cefr": level, "pos": pos, "lemma_de": entry.pop("lemma_de"),
                   "translations_en": entry.pop("translations_en"), "example_de": entry.pop("example_de"),
                   "example_en": entry.pop("example_en"), "cloze_word": entry.pop("cloze_word"),
                   "themes": entry.pop("themes"), "priority": entry.pop("priority")}
        for extra in ("noun", "verb", "adjective"):
            if extra in entry:
                ordered[extra] = entry[extra]
        if note_val:
            ordered["notes"] = note_val
        entries.append((level, filename, pos, ordered))

    return entries, problems, warnings


def load_existing():
    ids, lemmas = set(), {}
    for f in DATA_DIR.glob("*/*.json"):
        if f.parent.name == "_shared":
            continue
        for e in json.loads(f.read_text(encoding="utf-8"))["entries"]:
            ids.add(e["id"])
            lemmas[(e["lemma_de"].lower(), e["pos"])] = e["cefr"]
    return ids, lemmas


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("batch")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    themes = {t["id"] for t in json.loads(THEMES_FILE.read_text(encoding="utf-8"))["themes"]}
    existing_ids, existing_lemmas = load_existing()
    entries, problems, warnings = parse_batch(args.batch, themes, existing_ids, existing_lemmas)

    for w in warnings:
        print(f"WARNING: {w}")
    for p in problems:
        print(f"ERROR: {p}")
    if problems:
        print(f"\n{len(problems)} error(s); nothing written.")
        return 1

    counts = {}
    grouped = {}
    for level, filename, pos, entry in entries:
        grouped.setdefault((level, filename, pos), []).append(entry)
        counts[(level, pos)] = counts.get((level, pos), 0) + 1

    if not args.dry_run:
        for (level, filename, pos), new_entries in grouped.items():
            path = DATA_DIR / level.lower() / filename
            if path.exists():
                data = json.loads(path.read_text(encoding="utf-8"))
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                data = {"schemaVersion": 1, "cefr": level, "pos": pos, "entries": []}
            data["entries"].extend(new_entries)
            path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    verb = "Would add" if args.dry_run else "Added"
    print(f"{verb} {len(entries)} entries ({len(warnings)} warning(s)):")
    for (level, pos), n in sorted(counts.items()):
        print(f"  {level} {pos}: {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
