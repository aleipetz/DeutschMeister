# Spaced Repetition + Gamification Design

Implemented in `App/engine.js`, covered by `Tests/engine.test.js`.

## Spaced repetition — Leitner boxes

7 boxes, 0-indexed. Interval before next review, by box:

| Box | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| Days | same session | 1 | 3 | 7 | 14 | 30 | 90 |

- Correct answer → box + 1 (capped at 6).
- Incorrect answer → box resets to 0.
- Mastery state derived from box (never stored separately):
  - unreviewed → **new**
  - box 0-2 → **learning**
  - box 3-4 → **familiar**
  - box 5-6 → **mastered**
- Leech: `totalReviews > 8 && accuracy < 50%` → `isLeech = true` (surfaced as a
  "tricky words" filter, not implemented as a dashboard filter yet — see backlog
  in the progress tracker).

## XP

- +5 base per correct review.
- +1 per `priority` point on the content entry (1-5) — harder/rarer words are
  worth slightly more.
- +10 bonus the first time a word is ever answered correctly.
- 0 for an incorrect answer (never negative).
- Multiplied by the in-session **combo multiplier**: ×1 (streak 0-4), ×1.5
  (streak 5-9), ×2 (streak 10+). Combo resets to 0 on any miss.

## Streaks

- `recordGoalMet()` is called once per day, the moment `todayXP` first crosses
  `dailyGoalXP` (guarded by `profile.goalMetToday`, reset at day rollover).
- Consecutive calendar day after the last active date → streak + 1.
- Same calendar day → no-op (already counted).
- Gap of 2+ days: consumes one `streakFreezesAvailable` if available (streak
  continues), otherwise streak resets to 1.
- Every 7th consecutive day earns a freeze, capped at 3 stored.

## Achievements

Static catalog in `app.js` (`ACHIEVEMENTS`), each with a `check(ctx)` predicate
evaluated against `{ profile, masteredTotal, verbMastered, levelComplete }`.
Evaluated after every Learn/Review session (`announce = true`, triggers the
celebration overlay for the first newly-unlocked one) and passively whenever the
Achievements screen renders (`announce = false`, just backfills state). Current
catalog: streak milestones (7/30/100 days), a combo milestone (10+ in one
session), mastery-count milestones (10/50/150/300 words), a phrasal/composite
verb-specific milestone ("Verb Master," 20 mastered), per-level 100%-mastery
badges (A1/A2/B1 — extend as higher levels get content), and two quiz-specific
badges: "Quiz Whiz" (25+ quiz questions answered, `profile.totalQuizQuestions`)
and "Perfectionist" (100% on a single quiz of 10+ questions,
`profile.hadPerfectQuiz10`, set by the quiz-completion handler in `app.js`).

## Quiz (multiple-choice, feeds the same SRS/XP pipeline)

`quiz.js` builds 5 question types from vocab entries — DE→EN meaning, EN→DE
meaning, noun gender (der/die/das), cloze fill-in-the-blank (using the
required `cloze_word` field), and listening (TTS-only prompt). Unlike Review's
self-graded "did I know it," a quiz answer is objectively verifiable, so
correctness is fed straight into `Engine.applyReview()` exactly like a Review
session — same box transitions, same XP formula, same combo multiplier. Two
entry points share the same `startQuizFlow()`/`renderQuizStep()`/
`handleQuizAnswer()` code in `app.js`: an automatic quiz appended after every
Learn session (testing only the words just learned, distractors drawn from
the same CEFR level) and the standalone Quiz tab (testing up to 20 words
sampled from everything the learner has ever seen, `state.progress`,
distractors drawn from the full corpus).

## Deliberately deferred (not in this build)

- SM-2-style ease-factor scheduling (Leitner was chosen instead — see the
  original plan's rationale: deterministic and easier to get right solo).
- Per-event review history log (would grow unbounded; add with pruning if
  detailed analytics are ever wanted).
- A dedicated "tricky words" leech-review filter UI (the `isLeech` flag exists
  in progress data now; surfacing it in the Dashboard is a good Phase 3 addition).
