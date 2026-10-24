# Web app (PWA)

The shipping app. A port of the native SwiftUI app (`../iOS/`) to a plain-JavaScript progressive
web app, so it installs on the iPhone from Safari without Xcode, a Mac or the free-signing 7-day limit.
No dependencies and no build step beyond `Tools/build_web.py`.

## Install on the iPhone

1. Open the site in **Safari** (see "Hosting" below for the address).
2. Tap **Share → Add to Home Screen**.
3. Open it from the Home Screen icon. It runs full-screen and works offline.

Progress lives on the phone, in the installed app's storage. Safari keeps that separate from a normal
Safari tab, and Home Screen apps are exempt from Safari's 7-day storage cleanup. Still, use
**Settings → Export progress** now and then: it saves a JSON backup to Files or iCloud Drive.
**Import progress** reads those backups, and also reads exports from the iOS app and the old prototype.

## Layout

| File | Contents | Ported from |
|---|---|---|
| `js/domain.js` | Leitner engine, streaks, XP, study planner, quiz generator, achievements, session rules, JSON import/export. Pure: no DOM, no storage. | `iOS/DeutschMeister/Domain/` |
| `js/model.js` | `AppModel` (state + save after every change) and the `localStorage` store. | `Features/AppModel.swift`, `Data/ProgressStore.swift` |
| `js/sessions.js` | Learn, Review and Quiz session controllers. | `Features/Sessions.swift` |
| `js/speech.js` | German voice on the Web Speech API (same system voices on iPhone). | `Speech/SpeechService.swift` |
| `js/app.js` | Screens: Home, Quiz, Progress, Badges, Settings sheet, onboarding, celebration popup. | `Features/`, `DesignSystem/` |
| `sw.js` | Offline cache. `VERSION` is stamped by `Tools/build_web.py`. | none |
| `vocab-bundle.json` | Generated from `Content/` by `Tools/build_web.py`. Committed. | `Resources/vocab-bundle.json` |
| `tests/` | `node:test` suites mirroring `iOS/DeutschMeisterTests/`. | |

Progress is saved under the `localStorage` key `deutschMeister.v1`, in the same JSON shape as the iOS
app's `progress.json`.

## Workflow

```bash
python3 Tools/validate_content.py      # after editing Content/
python3 Tools/build_web.py             # after editing Content/ or Web/ (bundle + offline cache version)
node --test Web/tests/*.test.mjs       # unit tests
python3 -m http.server -d Web 8000     # try it at http://localhost:8000
```

CI (`.github/workflows/web.yml`) runs all three checks and fails if `build_web.py` output wasn't
committed. Installed copies pick up a new version the next time they're opened online.

## Hosting

Pushing to `master` deploys `Web/` to GitHub Pages. One-time setup: repository **Settings → Pages →
Source: GitHub Actions**. GitHub Pages on a private repository needs a paid GitHub plan; on the free
plan the repository must be public.
