# iOS architecture

Target: iPhone 17 Pro, personal use, installed via a free Apple ID "Personal Team".
Native SwiftUI. No third-party dependencies. Built with Xcode 27 (iOS 27 SDK).

## Decisions

| Decision | Choice | Why |
|---|---|---|
| UI framework | SwiftUI | Small app, six screens; native feel, less code than UIKit. |
| Language | Swift 6 | Default in current Xcode. |
| Persistence | One `progress.json` in Application Support | State is a single small document. Same shape as the web app's `germanVocab.v1`, so exports from the prototype import directly. SwiftData would add a schema and migration burden for no gain. |
| Content delivery | One `vocab-bundle.json` in the app bundle | Generated from `Content/` by `Tools/build_bundle.py`. Committed, so building the app never requires Python. |
| Speech | `AVSpeechSynthesizer`, `de-DE` | Reliable on-device German; replaces the Web Speech API. |
| Minimum iOS | 18.0 | Below the phone's OS on purpose, so an OS update never blocks a build. Needs 17+ for `@Observable`. |
| Testing | Swift Testing, hosted in the app | `Domain/` and `Data/` are covered; run with the command below. |
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
| `Domain/` | Models (`VocabEntry`, `Progress`, `Profile`), `LeitnerEngine`, `QuizGenerator`, `Achievements`, `StudyPlanner`, `SessionRules`. Pure Swift: no SwiftUI, no file I/O. | `engine.js`, `quiz.js` |
| `Data/` | `ContentStore` (loads bundle, indexes by id/level/theme), `ProgressStore` (load/save/import/export `progress.json`). | `data.js`, `localStorage` code in `app.js` |
| `Speech/` | `SpeechService` around `AVSpeechSynthesizer`; picks a German voice. | `speech.js` |
| `Features/` | One subfolder per screen: Home, Learn, Review, Quiz, Progress, Badges, Settings, Onboarding. View + view model each. | `app.js`, `index.html` |
| `DesignSystem/` | Theme colours (the `THEME_COLORS` table), word card, buttons, progress ring, heatmap. | `styles.css` |
| `Debug/` | Debug-only launch options and demo data. Compiled out of release builds. | none |
| `Resources/` | `vocab-bundle.json`, `Assets.xcassets`. | generated |
| `DeutschMeisterTests/` | XCTest / Swift Testing suites for `Domain/` and `Data/`. | `Tests/*.test.js` |

Rule: `Domain/` never imports SwiftUI. Views never contain scheduling, XP or quiz logic.

## Port order

1. **Done.** `Domain/`: models, `LeitnerEngine`, streaks, `QuizGenerator`, `Achievements`, `StudyPlanner`, `SessionRules`,
   with the prototype's JS tests ported (`Prototype/Tests/*.test.js` were the spec).
2. **Done.** `Data/`: `Tools/build_bundle.py`, `ContentStore`, `ProgressStore`, import of prototype exports.
3. **Done.** `Speech/`: `SpeechService` (German `AVSpeechSynthesizer`).
4. **Done.** `DesignSystem/` and `Features/`: Home, Learn, Review, Quiz, Progress, Badges, Settings, Onboarding.
5. App icon, then run on the iPhone (needs your Apple ID in Xcode; see below).

## Navigation

Four tabs: **Home**, **Quiz**, **Progress**, **Badges**. Learn and Review are full-screen sessions started from the
Home buttons (the prototype had them as tabs). Settings is a sheet opened from the gear on Home. First launch shows
a level picker. `AppModel` (in `Features/`) owns the state and saves it after every change; `Sessions.swift` holds the
Learn, Review and Quiz controllers, which delegate every rule to `Domain/SessionRules`.

## Debug launch options

Debug builds only (`Debug/LaunchOptions.swift`), so a screen can be opened and screenshotted without tapping:

```bash
xcrun simctl launch booted com.apetzhold.DeutschMeister -dmDemo -dmScreen progress
```

`-dmDemo` uses an in-memory demo learner (real progress is never touched), `-dmFresh` an empty one (shows onboarding),
`-dmScreen home|learn|review|quiz|progress|badges|settings` opens that screen.

## Running the tests

```bash
xcodebuild test -project iOS/DeutschMeister.xcodeproj -scheme DeutschMeister \
  -destination 'platform=iOS Simulator,name=iPhone 17' CODE_SIGNING_ALLOWED=NO
```

`iOS/DeutschMeisterTests/ContentBundleTests.swift` also checks the shipped `vocab-bundle.json`, so a bad content
edit fails the build even if you forget `Tools/validate_content.py`.

After changing anything in `Content/data/`, run `python3 Tools/validate_content.py && python3 Tools/build_bundle.py`.

## Fixes made during the port (found in the prototype)

- **Import** (done): the prototype replaced state wholesale; a partial export could break it. Every field now decodes
  with a default, out-of-range box levels are clamped, and files without `progress` and `profile` objects are rejected
  before any state changes.
- **Cloze blanking** (done, hardened rather than fixed): the prototype blanked the first substring match. No current
  entry is affected, but a future one could be (`lang` in `Verlangen`). The port prefers a whole-word match, then a
  word-start match, then any match. The word-start tier matters: 10 entries deliberately blank a particle inside the
  infinitive (`auf` in `aufgefallen`).
- **Level badges** (done): B2, C1 and C2 added.
- **Corrupt save file** (done): moved aside to `progress.corrupt-<time>.json` instead of being overwritten.
- **Clock and calendar** (done): the engine takes `now` and a `Calendar`, so streak and due-date logic is tested with a
  fixed UTC calendar.
- **Activity heatmap** (done): the prototype never recorded XP into the daily activity it draws from, so the heatmap
  was always empty. `AppState.awardXP` now records it.
- **Best combo** (done): the prototype only saved the streak at the moment a Review ended, so a long streak followed by
  one miss was lost. The best is now tracked answer by answer.
- **Tricky words** (done): words flagged as leeches are listed on the Progress tab.

## Content status

163 of about 1,760 planned entries (about 9%). B1 to C2 have 35 each, A1 has 14, A2 has 9. Content depth, not code, is
the main risk to the app feeling complete. See `content-progress-tracker.md`.

## Running on the iPhone (free Apple ID)

1. Xcode → Settings → Accounts → add your Apple ID.
2. iPhone: Settings → Privacy & Security → Developer Mode → on, restart.
3. Connect the phone, select it as the run destination, set Signing Team to your Personal Team, press Run.
4. First launch: iPhone Settings → General → VPN & Device Management → trust your Apple ID.
5. The app stops opening after 7 days. Press Run again from Xcode; progress is kept.
