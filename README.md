# Deutsch Meister

A personal, offline, gamified German vocabulary trainer for iPhone, with a focus on
phrasal and composite (separable-prefix) verbs. No backend, no account.

The app ships as an installable web app (`Web/`): open it in Safari and add it to the Home Screen.
It replaced the native SwiftUI app, which needed a Mac to reinstall every 7 days.

## Layout

```
Content/     Vocabulary as plain JSON by CEFR level + part of speech. Source of truth for both apps.
Tools/       Python scripts (no dependencies): validate_content.py, stats.py, build_web.py, build.py (prototype build).
Web/         The shipping app: a PWA ported from the native app. See Web/README.md.
iOS/         The native SwiftUI app (Xcode project + sources + tests). The spec Web/ was ported from.
Prototype/   The original single-file web app. Kept as a behavioural reference; not shipped.
Docs/        Architecture, gamification design, content progress tracker.
```

## Where to start

- Web app, install and hosting: [Web/README.md](Web/README.md)
- Native app design (the behaviour Web/ follows): [Docs/ios-architecture.md](Docs/ios-architecture.md)
- Adding vocabulary: [Docs/content-progress-tracker.md](Docs/content-progress-tracker.md) and
  [Content/schema/SCHEMA.md](Content/schema/SCHEMA.md)
- How the prototype worked: [Docs/prototype-architecture.md](Docs/prototype-architecture.md)

## Content workflow

```bash
python3 Tools/validate_content.py   # must pass before content counts as "done"
python3 Tools/stats.py              # coverage table + regenerates Content/generated/verb-families.json
python3 Tools/build_web.py          # rebuilds the web app's bundle (Web/vocab-bundle.json)
python3 Tools/build.py              # rebuilds the prototype (Prototype/App/data.js, Prototype/dist/)
```

Requires Python 3. The web app's tests need Node 22+: `node --test Web/tests/*.test.mjs`.
