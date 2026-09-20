# Architecture

See the original design plan for full context/rationale. This doc is the quick
reference for how the pieces fit together.

## Data flow

```
Content/data/**/*.json  --(Tools/build.py)-->  App/data.js  --(<script>)-->  window
                                              \-->  inlined into dist/german-vocab.html
```

- `Content/` is the source of truth for vocabulary. Never edited by the app or by
  `build.py` — only read.
- `App/data.js` is generated (gitignored) so `App/index.html` can be opened directly
  during development and always reflects current content, no server needed.
- `dist/german-vocab.html` is the single-file distributable: `Tools/build.py`
  inlines `App/styles.css`, `App/data.js`, `App/engine.js`, `App/speech.js`, and
  `App/app.js` into `App/index.html`'s `<style>`/`<script>` blocks (marked by
  `<!--BUILD:...-->` comments) and writes the result to `dist/`.

## Runtime layers (inside the browser)

- **`engine.js`** — pure functions only (no DOM, no localStorage). Leitner box
  transitions, mastery state, XP math, combo multiplier, streak/freeze logic.
  Testable standalone via `node Tests/engine.test.js`.
- **`speech.js`** — thin wrapper around `window.speechSynthesis`. Picks a German
  voice (handles the async `voiceschanged` event), exposes `speak()`/`cancel()`.
- **`quiz.js`** — pure functions only, like `engine.js`. Builds multiple-choice
  question objects from vocab entries (5 types: DE→EN meaning, EN→DE meaning,
  gender, cloze fill-in-the-blank, listening) with distractors pulled from a
  pool, preferring same-part-of-speech options and de-duping by value.
  Testable standalone via `node Tests/quiz.test.js`. `app.js`'s shared
  `startQuizFlow()`/`renderQuizStep()`/`handleQuizAnswer()` drive both the
  automatic quiz appended after a Learn session and the standalone Quiz tab
  ("review everything you've learned") — quiz answers are graded objectively
  and fed straight into `Engine.applyReview()`, so quizzing doubles as a more
  rigorous alternative to self-graded Review.
- **`app.js`** — everything else: loads/saves `localStorage` state, indexes
  `VOCAB_ENTRIES`/`THEMES`/`VERB_FAMILIES` from `data.js`, computes the learner's
  current CEFR level and due/new-word queues, renders all six screens (Home, Learn,
  Review, Dashboard, Achievements, Settings), and wires up navigation/events.

## State (localStorage key `germanVocab.v1`)

```
{
  progress: { [entryId]: { boxLevel, nextReviewDate, lastReviewedDate,
                            correctStreak, totalReviews, totalCorrect,
                            firstSeenDate, dateMastered, isLeech } },
  profile:  { totalXP, currentStreakDays, longestStreakDays, lastActiveDate,
              streakFreezesAvailable, dailyGoalXP, todayXP, todayDate,
              goalMetToday, bestCombo },
  achievements: [{ id, dateUnlocked }],
  dailyActivity: { "YYYY-MM-DD": { xpEarned, reviewsCompleted, newWordsLearned } },
  settings: { levelOverride, speechRate },
}
```

Vocabulary content itself is never stored here — only what the learner has done
with it. This means growing `Content/` never requires a data migration.

## Content schema addition: `cloze_word` (required)

Every entry must carry a `cloze_word` — the exact literal substring of
`example_de` to blank out for cloze quiz questions. For phrasal/composite
verbs this is almost always the separable particle (blanking `auf` in
`aufstehen`'s example is far more pedagogically useful than blanking the verb
stem). `validate_content.py` checks it's an actual substring of `example_de`.

## Known gotcha (fixed once, worth remembering)

Elements toggled via the `hidden` attribute (`#celebration-overlay`, `#combo-display`,
`#onboarding-overlay`, `#learn-combo-display`, `#quiz-combo-display`)
must have a `.selector[hidden] { display: none; }` rule in CSS if the base selector
also sets `display: flex/block/etc`. Author CSS overrides the browser's default
`[hidden] { display: none }` UA rule, so a plain `.foo { display: flex }` makes an
element permanently visible regardless of the `hidden` attribute. Any new
`hidden`-toggled element needs the same guard.
