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

**2026-09-02 update**: user is actually B2–C1 level already, so a full B1→C2
batch (35 entries/level) was authored in one pass instead of following strict
level-first sequencing, so the app is immediately useful at their real level.
A1 remains only the original 14-entry proof-of-pipeline sample; A2 got 9
high-frequency base verbs (geben, nehmen, kommen, setzen, finden, lassen,
stellen, machen, halten) added specifically to complete verb-family
cross-references for phrasal/composite verbs at B1+ (not a real A2 push).
**Next batches should prioritize A1/A2 only if/when needed** — otherwise keep
deepening B1→C2 (they're each only ~35/300-350 entries in, i.e. ~10% done) or
extend into fuller B1-C2 coverage before circling back to fill out A1/A2.

## A1

| Category | Target | Done | Status | Last Updated | Notes |
|---|---|---|---|---|---|
| Nouns | 123 | 2 | in-progress | 2026-09-02 | Phase 0 sample: Haus, Frau |
| Adjectives | 53 | 2 | in-progress | 2026-09-02 | Phase 0 sample: gut, schön |
| Verbs (non-phrasal) | 70 | 4 | in-progress | 2026-09-02 | gehen, sein, stehen, kaufen |
| Phrasal verbs | 53 | 2 | in-progress | 2026-09-02 | aufstehen, einkaufen |
| Composite verbs | 35 | 2 | in-progress | 2026-09-02 | fernsehen, kennenlernen |
| Other (glue words) | 18 | 2 | in-progress | 2026-09-02 | und, aber |

## A2

| Category | Target | Done | Status | Last Updated | Notes |
|---|---|---|---|---|---|
| Nouns | 123 | 0 | pending | | |
| Adjectives | 53 | 0 | pending | | |
| Verbs (non-phrasal) | 70 | 9 | in-progress | 2026-09-02 | geben, nehmen, kommen, setzen, finden, lassen, stellen, machen, halten — added as base-verb cross-refs for B1+ phrasal/composite verbs, not a real A2 content push |
| Phrasal verbs | 53 | 0 | pending | | |
| Composite verbs | 35 | 0 | pending | | |
| Other (glue words) | 18 | 0 | pending | | |

## B1

| Category | Target | Done | Status | Last Updated | Notes |
|---|---|---|---|---|---|
| Nouns | 105 | 10 | in-progress | 2026-09-02 | Erfahrung, Entscheidung, Eindruck, Verantwortung, Umwelt, Vorschlag, Beziehung, Unterschied, Ereignis, Möglichkeit |
| Adjectives | 45 | 6 | in-progress | 2026-09-02 | notwendig, erstaunlich, zuverlässig, unabhängig, ausführlich, freiwillig |
| Verbs (non-phrasal) | 60 | 6 | in-progress | 2026-09-02 | sich entscheiden, bedeuten, erreichen, vermeiden, sich beschweren, empfehlen |
| Phrasal verbs | 45 | 6 | in-progress | 2026-09-02 | vorschlagen, teilnehmen, stattfinden, zurückkommen, aufgeben, umziehen |
| Composite verbs | 30 | 4 | in-progress | 2026-09-02 | spazierengehen, radfahren, wehtun, achtgeben |
| Other (glue words) | 15 | 3 | in-progress | 2026-09-02 | obwohl, außerdem, trotzdem |

## B2

| Category | Target | Done | Status | Last Updated | Notes |
|---|---|---|---|---|---|
| Nouns | 105 | 10 | in-progress | 2026-09-02 | Voraussetzung, Zusammenhang, Auswirkung, Wettbewerb, Herausforderung, Wahrnehmung, Widerspruch, Übereinstimmung, Anspruch, Bedrohung |
| Adjectives | 45 | 6 | in-progress | 2026-09-02 | widersprüchlich, nachhaltig, überzeugend, angemessen, umstritten, erheblich |
| Verbs (non-phrasal) | 60 | 6 | in-progress | 2026-09-02 | berücksichtigen, gewährleisten, sich beziehen auf, betreffen, verfügen über, erfordern |
| Phrasal verbs | 45 | 6 | in-progress | 2026-09-02 | sich auseinandersetzen, zurückführen, hervorheben, durchsetzen, auffallen, vorkommen |
| Composite verbs | 30 | 4 | in-progress | 2026-09-02 | wahrnehmen, teilhaben, freilassen, festlegen |
| Other (glue words) | 15 | 3 | in-progress | 2026-09-02 | dennoch, sodass, sofern |

## C1

| Category | Target | Done | Status | Last Updated | Notes |
|---|---|---|---|---|---|
| Nouns | 88 | 10 | in-progress | 2026-09-02 | Erkenntnis, Anlass, Tendenz, Vorurteil, Instanz, Beitrag, Konsequenz, Gewissheit, Umbruch, Kompetenz |
| Adjectives | 38 | 6 | in-progress | 2026-09-02 | gravierend, plausibel, prägnant, kontrovers, unabdingbar, vielschichtig |
| Verbs (non-phrasal) | 50 | 6 | in-progress | 2026-09-02 | gewichten, veranschaulichen, resultieren, beeinträchtigen, unterliegen, vernachlässigen |
| Phrasal verbs | 38 | 6 | in-progress | 2026-09-02 | sich abzeichnen, hervorgehen, einhergehen, vorausgehen, auseinanderhalten, zugrundeliegen |
| Composite verbs | 25 | 4 | in-progress | 2026-09-02 | wiedergeben, gleichsetzen, vorwegnehmen, infragestellen |
| Other (glue words) | 13 | 3 | in-progress | 2026-09-02 | dahingehend, zumal, insofern |

## C2

| Category | Target | Done | Status | Last Updated | Notes |
|---|---|---|---|---|---|
| Nouns | 70 | 10 | in-progress | 2026-09-02 | Trägheit, Ambivalenz, Vorbehalt, Nuance, Beharrlichkeit, Missstand, Tragweite, Dilemma, Unzulänglichkeit, Doppeldeutigkeit |
| Adjectives | 30 | 6 | in-progress | 2026-09-02 | unumgänglich, fragwürdig, unerlässlich, vielsagend, schwerwiegend, unantastbar |
| Verbs (non-phrasal) | 40 | 6 | in-progress | 2026-09-02 | relativieren, suggerieren, instrumentalisieren, nivellieren, kaschieren, verharmlosen |
| Phrasal verbs | 30 | 6 | in-progress | 2026-09-02 | sich hinwegsetzen, aufrechterhalten, zutagetreten, sich abfinden, hinausgehen, sich niederschlagen |
| Composite verbs | 20 | 4 | in-progress | 2026-09-02 | gleichkommen, vorherbestimmen, auseinanderklaffen, wettmachen |
| Other (glue words) | 10 | 3 | in-progress | 2026-09-02 | mitnichten, gleichwohl, infolgedessen |

## Summary

| Level | Target | Done | % |
|---|---|---|---|
| A1 | 354 | 14 | 4% |
| A2 | 354 | 9 | 3% |
| B1 | 300 | 35 | 12% |
| B2 | 300 | 35 | 12% |
| C1 | 252 | 35 | 14% |
| C2 | 200 | 35 | 18% |
| **Total** | **~1,760** | **163** | **~9%** |

Known base-verb cross-reference gaps (validator prints these as warnings, not
errors — fine to leave until a convenient batch touches them): `sehen`,
`lernen`, `fahren`, `tun`, `schlagen`, `ziehen`, `haben`, `legen`, `führen`,
`heben`, `fallen`, `zeichnen`, `halten` (exists as A2 entry — wait, already
added), `liegen`, `bestimmen`, `klaffen`, `erhalten`, `treten` are referenced
as `base_verb` by at least one phrasal/composite verb but don't have their own
entry yet. Adding these (mostly A1/A2-level simple verbs) would clean up the
Verb Families dashboard further.

## Next up

Given the user's real level (B2–C1), prioritize **deepening B1→C2** over
filling A1/A2 gaps: pick any B1-C2 level/category above and add another batch
(aim for the category's target column). Phrasal/composite verbs should keep
getting proportionally more attention (25% combined) per the user's stated
priority. Cross-reference new `base_verb` ids against the gap list above —
resolving one of those gap verbs while authoring a new phrasal/composite verb
batch is a nice two-for-one.
