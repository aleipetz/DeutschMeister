# Deutsch Meister

A personal, offline, gamified German vocabulary trainer for iPhone, with a focus on
phrasal and composite (separable-prefix) verbs. Native SwiftUI app, no backend, no account.

## Layout

```
Content/     Vocabulary as plain JSON by CEFR level + part of speech. Source of truth for both apps.
Tools/       Python scripts (no dependencies): validate_content.py, stats.py, build.py (prototype build).
iOS/         The native SwiftUI app (Xcode project + sources + tests). See Docs/ios-architecture.md.
Prototype/   The original single-file web app. Kept as a behavioural reference; not shipped.
Docs/        Architecture, gamification design, content progress tracker.
```

## Where to start

- Native app design and port plan: [Docs/ios-architecture.md](Docs/ios-architecture.md)
- Adding vocabulary: [Docs/content-progress-tracker.md](Docs/content-progress-tracker.md) and
  [Content/schema/SCHEMA.md](Content/schema/SCHEMA.md)
- How the prototype worked: [Docs/prototype-architecture.md](Docs/prototype-architecture.md)

## Content workflow

```bash
python3 Tools/validate_content.py   # must pass before content counts as "done"
python3 Tools/stats.py              # coverage table + regenerates Content/generated/verb-families.json
python3 Tools/build.py              # rebuilds the prototype (Prototype/App/data.js, Prototype/dist/)
```

Requires Python 3, which comes with Xcode's command-line tools.
