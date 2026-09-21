# Content Progress Tracker

**Read this first when starting a content-authoring session.** It's the single
source of truth for what's done vs. pending. After adding a batch:

1. Run `python3 Tools/validate_content.py` — must pass (0 errors) before
   marking anything "done".
2. Run `python3 Tools/stats.py` — prints an authoritative level×POS count
   table and regenerates `Content/generated/verb-families.json`. Cross-check
   the "Done" column below against its output and correct any drift.
3. Update the row's **Done**/**Status**/**Last Updated** here.
4. Run `python3 Tools/build.py` to refresh `App/data.js` and `dist/german-vocab.html`.

Targets are curated-core estimates (~1,750 entries total across A1→C2), not
exhaustive frequency lists — see the project plan for the scale rationale.
Category split per level: Nouns 35%, Verbs (non-phrasal) 20%, Phrasal verbs 15%,
Composite verbs 10%, Adjectives 15%, Other/glue words 5%. Phrasal + composite
verbs (25% combined) are deliberately overweighted — the user's top priority.

Status values: `pending` (not started) · `in-progress` · `done` (validated + built).

**2026-09-20 update**: the full plan was authored in one pass (1,950 entries, up from 163),
reaching or passing the target in all but five cells: A1 adjectives (49/53), A1 composite verbs
(31/35), A2 phrasal verbs (52/53), A2 composite verbs (17/35) and B1 composite verbs (29/30).
A2 composite verbs is the real gap: German has few genuine adjective/noun/adverb+verb compounds at
that level, so filling it would mean padding with rarer words.
Every entry was cross-checked against its base verb (present stem, participle, particle prefix), but
the German has had only automated and spot-check review, so expect the occasional word to need a fix.

**Next up**: read the content in the app and fix what looks off; then deepen composite verbs and any
level the learner actually studies. After any content change, run
`python3 Tools/validate_content.py && python3 Tools/build_bundle.py` so the iOS app picks it up.

## A1

| Category | Target | Done | Status |
|---|---|---|---|
| Nouns | 123 | 147 | done |
| Adjectives | 53 | 49 | in-progress |
| Verbs (non-phrasal) | 70 | 76 | done |
| Phrasal verbs | 53 | 56 | done |
| Composite verbs | 35 | 31 | in-progress |
| Other (glue words) | 18 | 22 | done |

## A2

| Category | Target | Done | Status |
|---|---|---|---|
| Nouns | 123 | 177 | done |
| Adjectives | 53 | 66 | done |
| Verbs (non-phrasal) | 70 | 81 | done |
| Phrasal verbs | 53 | 52 | in-progress |
| Composite verbs | 35 | 17 | in-progress |
| Other (glue words) | 18 | 24 | done |

## B1

| Category | Target | Done | Status |
|---|---|---|---|
| Nouns | 105 | 121 | done |
| Adjectives | 45 | 47 | done |
| Verbs (non-phrasal) | 60 | 62 | done |
| Phrasal verbs | 45 | 53 | done |
| Composite verbs | 30 | 29 | in-progress |
| Other (glue words) | 15 | 15 | done |

## B2

| Category | Target | Done | Status |
|---|---|---|---|
| Nouns | 105 | 106 | done |
| Adjectives | 45 | 57 | done |
| Verbs (non-phrasal) | 60 | 75 | done |
| Phrasal verbs | 45 | 48 | done |
| Composite verbs | 30 | 31 | done |
| Other (glue words) | 15 | 15 | done |

## C1

| Category | Target | Done | Status |
|---|---|---|---|
| Nouns | 88 | 89 | done |
| Adjectives | 38 | 41 | done |
| Verbs (non-phrasal) | 50 | 59 | done |
| Phrasal verbs | 38 | 41 | done |
| Composite verbs | 25 | 28 | done |
| Other (glue words) | 13 | 15 | done |

## C2

| Category | Target | Done | Status |
|---|---|---|---|
| Nouns | 70 | 72 | done |
| Adjectives | 30 | 37 | done |
| Verbs (non-phrasal) | 40 | 50 | done |
| Phrasal verbs | 30 | 30 | done |
| Composite verbs | 20 | 22 | done |
| Other (glue words) | 10 | 10 | done |

## Summary

| Level | Target | Done | % |
|---|---|---|---|
| A1 | 352 | 381 | 108% |
| A2 | 352 | 417 | 118% |
| B1 | 300 | 327 | 109% |
| B2 | 300 | 332 | 111% |
| C1 | 252 | 273 | 108% |
| C2 | 200 | 221 | 110% |
| **Total** | **~1,756** | **1,951** | **111%** |
