# Vocabulary Content Schema

Canonical description of the JSON files under `Content/data/<level>/*.json`. See
`vocab-entry.schema.json` for the machine-readable version (JSON Schema draft-07,
used as documentation/reference — `Tools/validate_content.py` implements the
same rules directly in plain Python, no external dependency).

## File shape

Each file is one CEFR level + one part-of-speech:

```json
{
  "schemaVersion": 1,
  "cefr": "A1",
  "pos": "verb",
  "entries": [ /* VocabEntry, see below */ ]
}
```

`cefr`/`pos` at the file level must match every entry's own `cefr`/`pos` — the
validator checks this so entries can never silently drift from their folder.

## Common entry fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Stable, human-readable slug, e.g. `"aufstehen_verb"`. Must be globally unique across all files. Never a random UUID — needs to be greppable/diffable across authoring sessions. |
| `cefr` | `A1`\|`A2`\|`B1`\|`B2`\|`C1`\|`C2` | yes | |
| `pos` | `noun`\|`adjective`\|`verb`\|`phrasal_verb`\|`composite_verb`\|`other` | yes | `other` = adverbs/pronouns/conjunctions/numbers/interjections. |
| `lemma_de` | string | yes | Dictionary form. For nouns, no article prefix (article lives in `noun.gender`). |
| `translations_en` | string[] | yes, ≥1 | Ordered, primary sense first. Short glosses, not dictionary entries. |
| `example_de` | string | yes | One representative sentence. |
| `example_en` | string | yes | Its translation. |
| `cloze_word` | string | yes | The exact literal substring within `example_de` to blank out for fill-in-the-blank quiz questions (e.g. the conjugated verb form, or the separable particle for phrasal/composite verbs — blanking the particle is usually the most pedagogically useful choice for those). Must be an exact substring match, checked by the validator. |
| `themes` | string[] | yes, ≥1 | Must reference ids in `_shared/themes.json`. |
| `priority` | integer 1–5 | yes | Single difficulty/frequency signal. 1 = essential/common (learn first, slightly less XP), 5 = rare/nice-to-have (more XP when learned). Drives review-queue ordering. |
| `notes` | string | no | Short only — a cultural note or false-friend warning. Never grammar prose. |

## `noun` object — required when `pos == "noun"`

| Field | Type | Required | Notes |
|---|---|---|---|
| `gender` | `der`\|`die`\|`das` | yes | |
| `plural_de` | string \| null | yes | `null` for pluralia tantum / uncountables. |

## `verb` object — required when `pos` is `verb`, `phrasal_verb`, or `composite_verb`

| Field | Type | Required | Notes |
|---|---|---|---|
| `separable` | boolean | yes | True for separable-prefix verbs (aufstehen, ausmachen). |
| `irregular` | boolean | yes | Strong/stem-changing verb. |
| `present_3sg` | string | yes | Minimal present-tense form, e.g. `"steht ... auf"`, `"macht ... aus"`, `"geht"`. |
| `perfekt` | string | yes | Full Perfekt incl. auxiliary, e.g. `"ist aufgestanden"` — prioritized over Präteritum since it's what's actually used in spoken German. |
| `praeteritum_3sg` | string \| null | no (default null) | Only populate for very high-frequency/irregular verbs (sein, haben, werden, modals) where simple past matters colloquially. |
| `base_verb` | string \| null | required for `phrasal_verb`/`composite_verb`, else null | `id` of the underlying simple-verb entry (e.g. `ausmachen_verb` → `machen_verb`). |
| `particle` | string \| null | required for `phrasal_verb`/`composite_verb`, else null | The separable prefix/particle, e.g. `"aus"`, `"auf"`. |
| `particle_meaning_hint` | string \| null | required for `phrasal_verb`/`composite_verb`, else null | Plain-English gloss of what the particle contributes, e.g. `"aus = out/off"`. This is the single highest-value field for the phrasal/composite-verb feature — it lets the pattern generalize instead of being memorized word-by-word. |

`related_verbs` / verb-family groupings are **derived**, not authored — see
`Content/generated/verb-families.json`, produced by `Tools/stats.py`.

## `adjective` object — optional, only for irregular comparison

| Field | Type | Required | Notes |
|---|---|---|---|
| `comparative_irregular` | string \| null | no | Only for the ~10–15 truly irregular adjectives (gut→besser). Regular ±er/(e)sten forms are not authored. |
| `superlative_irregular` | string \| null | no | Same rule. |

## `_shared/themes.json`

```json
{ "id": "food", "label_en": "Food & Drink", "icon": "🍽️" }
```

`icon` is an emoji (not an SF Symbol, since this is now a web app) used consistently
across the UI wherever the theme appears — every theme gets a visual identity for free.
