# iOS architecture

Target: iPhone 17 Pro (iOS 26), personal use, installed via a free Apple ID "Personal Team".
Native SwiftUI. No third-party dependencies.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| UI framework | SwiftUI | Small app, six screens; native feel, less code than UIKit. |
| Language | Swift 6 | Default in current Xcode. |
| Persistence | One `progress.json` in Application Support | State is a single small document. Same shape as the web app's `germanVocab.v1`, so exports from the prototype import directly. SwiftData would add a schema and migration burden for no gain. |
| Content delivery | One `vocab-bundle.json` in the app bundle | Generated from `Content/` by `Tools/build_bundle.py`. Committed, so building the app never requires Python. |
| Speech | `AVSpeechSynthesizer`, `de-DE` | Reliable on-device German; replaces the Web Speech API. |
| Minimum iOS | 26 | Only one device to support. |
| Signing | Free Apple ID Personal Team | Personal use. App must be re-run from Xcode every 7 days. No iCloud / push capabilities, none needed. |

## Data flow

```
Content/data/**/*.json ──(Tools/build_bundle.py)──► iOS/DeutschMeister/Resources/vocab-bundle.json
                                                          │  (read-only, in app bundle)
                                                          ▼
                                                     ContentStore ──► Features (SwiftUI views)
                                                                          ▲
                                     ProgressStore (progress.json) ───────┘
```

`Content/` is never modified by the app. The app stores only what the learner has done, so
adding content never needs a data migration.

## Folder map

`iOS/DeutschMeister/` uses Xcode folder-synchronised groups, so these folders are the Xcode groups.

| Folder | Contents | Ported from |
|---|---|---|
| `Domain/` | Models (`VocabEntry`, `Progress`, `Profile`), `LeitnerEngine`, `QuizGenerator`, `Achievements`, streak logic. Pure Swift: no SwiftUI, no file I/O. | `engine.js`, `quiz.js` |
| `Data/` | `ContentStore` (loads bundle, indexes by id/level/theme), `ProgressStore` (load/save/import/export `progress.json`). | `data.js`, `localStorage` code in `app.js` |
| `Speech/` | `SpeechService` around `AVSpeechSynthesizer`; picks a German voice. | `speech.js` |
| `Features/` | One subfolder per screen: Home, Learn, Review, Quiz, Progress, Badges, Settings, Onboarding. View + view model each. | `app.js`, `index.html` |
| `DesignSystem/` | Theme colours (the `THEME_COLORS` table), word card, buttons, progress ring, heatmap. | `styles.css` |
| `Resources/` | `vocab-bundle.json`, `Assets.xcassets`. | generated |
| `DeutschMeisterTests/` | XCTest / Swift Testing suites for `Domain/` and `Data/`. | `Tests/*.test.js` |

Rule: `Domain/` never imports SwiftUI. Views never contain scheduling, XP or quiz logic.

## Port order

1. `Domain/`: models, `LeitnerEngine`, streaks, `QuizGenerator`, `Achievements`, with tests ported first
   (`Prototype/Tests/*.test.js` are the spec). The JS tests are the parity check.
2. `Data/`: `build_bundle.py`, `ContentStore`, `ProgressStore` (including import of prototype exports).
3. `Speech/`.
4. `DesignSystem/` and `Features/`: Home → Learn → Review → Quiz → Progress → Badges → Settings → Onboarding.
5. Run on the simulator, then on the iPhone.

## Fixes to make during the port (found in the prototype)

- **Import**: the prototype replaces state without merging defaults; a partial export could break it.
  The port must decode with defaults for every missing field and reject invalid files without touching current state.
- **Cloze questions**: `String.replace` blanks the *first* substring match, which can hit the wrong place
  (e.g. `gut` inside a longer word). Blank the whole-word match of `cloze_word`.
- **Level badges** only exist for A1 to B1; add B2, C1, C2 (the learner is B2 to C1).
- **Leech words** (`isLeech`) are tracked but never surfaced. Add a "tricky words" filter in Progress.
- Time handling: the prototype stores ISO timestamps and compares local calendar days. Use `Calendar.current`
  and inject a clock into the engine so streak and due-date logic is testable.

## Content status

163 of about 1,760 planned entries (about 9%). B1 to C2 have 35 each, A1 has 14, A2 has 9. Content depth, not code, is
the main risk to the app feeling complete. See `content-progress-tracker.md`.

## Running on the iPhone (free Apple ID)

1. Xcode → Settings → Accounts → add your Apple ID.
2. iPhone: Settings → Privacy & Security → Developer Mode → on, restart.
3. Connect the phone, select it as the run destination, set Signing Team to your Personal Team, press Run.
4. First launch: iPhone Settings → General → VPN & Device Management → trust your Apple ID.
5. The app stops opening after 7 days. Press Run again from Xcode; progress is kept.
