import './support.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  ACHIEVEMENTS, awardXP, blank, BLANK, CEFR_LEVELS, decodeImport, decodeState, eligibleKinds, encodeState,
  evaluateAchievements, ImportError, Leitner, makeCombo, makeIndex, makePlanner, makeQuestion, makeQuizSession,
  newProgress, newState, pickDistractors, primaryTranslation, recordDailyActivity, rollOverDayIfNeeded, seededRandom,
  fixedRandom, SessionRules, QUIZ_KINDS,
} from '../js/domain.js';
import { date, makeEntry, makeTestIndex, quizPool } from './support.mjs';

const T0 = date('2026-03-10T09:00:00Z');

// MARK: Leitner engine

test('new progress starts at box zero and is new', () => {
  const p = newProgress('x', T0);
  assert.equal(p.boxLevel, 0);
  assert.equal(Leitner.masteryOf(p), 'new');
  assert.ok(Leitner.isDue(p, T0));
});

test('correct review advances box and schedules by interval', () => {
  let p = newProgress('x', T0);
  for (let box = 1; box <= 6; box++) {
    p = Leitner.applyReview(p, true, 1, T0).progress;
    assert.equal(p.boxLevel, box);
    assert.equal(p.nextReviewDate.toISOString(), new Date(T0.getTime() + Leitner.boxIntervalsDays[box] * 86_400_000).toISOString());
  }
});

test('incorrect review resets box and streak', () => {
  let p = newProgress('x', T0);
  p = Leitner.applyReview(p, true, 1, T0).progress;
  p = Leitner.applyReview(p, true, 1, T0).progress;
  p = Leitner.applyReview(p, false, 1, T0).progress;
  assert.equal(p.boxLevel, 0);
  assert.equal(p.correctStreak, 0);
  assert.equal(p.nextReviewDate.getTime(), T0.getTime());
});

test('box caps at max', () => {
  let p = { ...newProgress('x', T0), boxLevel: 6, totalReviews: 5 };
  p = Leitner.applyReview(p, true, 1, T0).progress;
  assert.equal(p.boxLevel, 6);
});

test('mastery progresses learning, familiar, mastered; dateMastered clears on regression', () => {
  assert.equal(Leitner.mastery(2, true), 'learning');
  assert.equal(Leitner.mastery(3, true), 'familiar');
  assert.equal(Leitner.mastery(4, true), 'familiar');
  assert.equal(Leitner.mastery(5, true), 'mastered');
  let p = { ...newProgress('x', T0), boxLevel: 4, totalReviews: 4 };
  p = Leitner.applyReview(p, true, 1, T0).progress;
  assert.equal(p.dateMastered.getTime(), T0.getTime());
  p = Leitner.applyReview(p, false, 1, T0).progress;
  assert.equal(p.dateMastered, null);
});

test('leech flags after many reviews with low accuracy', () => {
  let p = newProgress('x', T0);
  for (let i = 0; i < 9; i++) p = Leitner.applyReview(p, i < 4, 1, T0).progress;
  assert.equal(p.isLeech, true);
});

test('xp is base plus priority plus first-time bonus; combo rounds half up', () => {
  const p = newProgress('x', T0);
  assert.equal(Leitner.applyReview(p, true, 3, T0).xpEarned, 18);
  const again = Leitner.applyReview(p, true, 3, T0).progress;
  assert.equal(Leitner.applyReview(again, true, 3, T0).xpEarned, 8);
  assert.equal(Leitner.applyReview(p, false, 3, T0).xpEarned, 0);
  assert.equal(Leitner.comboMultiplier(4), 1);
  assert.equal(Leitner.comboMultiplier(5), 1.5);
  assert.equal(Leitner.comboMultiplier(10), 2);
  assert.equal(Leitner.xpWithCombo(7, 5), 11);
});

// MARK: Streaks

const profileAt = (lastISO, extra = {}) => ({ ...newState().profile, lastActiveDate: lastISO ? date(lastISO) : null, ...extra });

test('streaks: first day, consecutive day, same day', () => {
  assert.equal(Leitner.recordGoalMet(profileAt(null), T0).currentStreakDays, 1);
  assert.equal(Leitner.recordGoalMet(profileAt('2026-03-09T22:00:00Z', { currentStreakDays: 4 }), T0).currentStreakDays, 5);
  assert.equal(Leitner.recordGoalMet(profileAt('2026-03-10T01:00:00Z', { currentStreakDays: 4 }), T0).currentStreakDays, 4);
});

test('seven-day streak grants a freeze, capped at three', () => {
  assert.equal(Leitner.recordGoalMet(profileAt('2026-03-09T09:00:00Z', { currentStreakDays: 6 }), T0).streakFreezesAvailable, 1);
  assert.equal(Leitner.recordGoalMet(profileAt('2026-03-09T09:00:00Z', { currentStreakDays: 13, streakFreezesAvailable: 3 }), T0).streakFreezesAvailable, 3);
});

test('gap with a freeze keeps the streak; without one it resets but keeps the longest', () => {
  const kept = Leitner.recordGoalMet(profileAt('2026-03-07T09:00:00Z', { currentStreakDays: 5, streakFreezesAvailable: 1 }), T0);
  assert.equal(kept.currentStreakDays, 6);
  assert.equal(kept.streakFreezesAvailable, 0);
  const reset = Leitner.recordGoalMet(profileAt('2026-03-07T09:00:00Z', { currentStreakDays: 5, longestStreakDays: 9 }), T0);
  assert.equal(reset.currentStreakDays, 1);
  assert.equal(reset.longestStreakDays, 9);
});

test('day boundary is the calendar day, not 24 hours', () => {
  const p = Leitner.recordGoalMet(profileAt('2026-03-09T23:59:00Z', { currentStreakDays: 2 }), date('2026-03-10T00:01:00Z'));
  assert.equal(p.currentStreakDays, 3);
});

// MARK: Daily bookkeeping

test('goal is met once per day and starts a streak; a new day resets today', () => {
  const s = newState();
  s.profile.dailyGoalXP = 20;
  assert.equal(awardXP(s, 15, T0), false);
  assert.equal(awardXP(s, 10, T0), true);
  assert.equal(awardXP(s, 10, T0), false);
  assert.equal(s.profile.currentStreakDays, 1);
  assert.equal(s.dailyActivity['2026-03-10'].xpEarned, 35);
  rollOverDayIfNeeded(s, date('2026-03-11T08:00:00Z'));
  assert.equal(s.profile.todayXP, 0);
  assert.equal(s.profile.goalMetToday, false);
  assert.equal(s.profile.totalXP, 35);
});

test('daily activity accumulates per day', () => {
  const s = newState();
  recordDailyActivity(s, { reviews: 3 }, T0);
  recordDailyActivity(s, { reviews: 2, newWords: 4 }, T0);
  assert.deepEqual(s.dailyActivity['2026-03-10'], { xpEarned: 0, reviewsCompleted: 5, newWordsLearned: 4 });
});

// MARK: Coding

test('decodes a prototype export and fills missing fields', () => {
  const s = decodeImport(JSON.stringify({
    progress: { haus_noun: { id: 'haus_noun', boxLevel: 3, nextReviewDate: '2026-01-02T03:04:05.678Z', totalReviews: 4 } },
    profile: { totalXP: 120 },
  }));
  const p = s.progress.haus_noun;
  assert.equal(p.boxLevel, 3);
  assert.equal(p.nextReviewDate.toISOString(), '2026-01-02T03:04:05.678Z');
  assert.equal(p.firstSeenDate.getTime(), 0);
  assert.equal(s.profile.totalXP, 120);
  assert.equal(s.profile.dailyGoalXP, 50);
  assert.equal(s.settings.levelOverride, 'auto');
});

test('decodes the iOS export format (dates without milliseconds too)', () => {
  const s = decodeImport(JSON.stringify({
    progress: { a: { id: 'a', boxLevel: 2, firstSeenDate: '2026-01-01T10:00:00Z', nextReviewDate: '2026-01-04T10:00:00Z', totalReviews: 2, totalCorrect: 2 } },
    profile: { totalXP: 5, lastActiveDate: '2026-01-01T10:00:00.000Z', todayDate: '2026-01-01' },
    achievements: [{ id: 'combo_10', dateUnlocked: '2026-01-01T10:00:00.000Z' }],
    dailyActivity: { '2026-01-01': { xpEarned: 5, reviewsCompleted: 1, newWordsLearned: 2 } },
    settings: { levelOverride: 'B2', speechRate: 0.8, onboarded: true },
  }));
  assert.equal(s.progress.a.nextReviewDate.toISOString(), '2026-01-04T10:00:00.000Z');
  assert.equal(s.settings.levelOverride, 'B2');
  assert.equal(s.settings.onboarded, true);
  assert.equal(s.achievements[0].id, 'combo_10');
});

test('round-trips through our own encoding with millisecond ISO dates', () => {
  const s = newState();
  s.progress.x = newProgress('x', date('2026-03-10T09:00:00.123Z'));
  const text = encodeState(s);
  assert.match(text, /"2026-03-10T09:00:00.123Z"/);
  assert.deepEqual(decodeState(JSON.parse(text)), s);
});

for (const bad of ['{}', '[]', 'not json', '{"progress":{}}', '{"profile":{}}', '{"progress":[],"profile":{}}']) {
  test(`import rejects ${bad}`, () => assert.throws(() => decodeImport(bad), ImportError));
}

test('import accepts a minimal file; unknown level falls back to auto; box level is clamped', () => {
  assert.deepEqual(decodeImport('{"progress":{},"profile":{}}').progress, {});
  assert.equal(decodeImport('{"progress":{},"profile":{},"settings":{"levelOverride":"Z9"}}').settings.levelOverride, 'auto');
  assert.equal(decodeImport('{"progress":{"a":{"id":"a","boxLevel":42}},"profile":{}}').progress.a.boxLevel, 6);
});

// MARK: Quiz generation

test('gender kind only for nouns with a gender; cloze only with a cloze word', () => {
  const [haus, , , , gross] = quizPool();
  assert.ok(eligibleKinds(haus).includes('gender'));
  assert.ok(!eligibleKinds(gross).includes('gender'));
  assert.ok(!eligibleKinds({ ...gross, cloze_word: '' }).includes('cloze'));
});

test('each question kind is built correctly', () => {
  const pool = quizPool();
  const [haus] = pool;
  const aufstehen = pool[5];
  const rng = seededRandom(7);

  const g = makeQuestion(haus, pool, rng, 'gender');
  assert.deepEqual([...g.options].sort(), ['das', 'der', 'die']);
  assert.equal(g.correctAnswer, 'das');

  const de = makeQuestion(haus, pool, rng, 'meaning_de_to_en');
  assert.equal(de.correctAnswer, 'house');
  assert.equal(de.prompt, 'Haus');
  assert.ok(de.options.includes('house'));
  assert.equal(new Set(de.options).size, 4);

  const en = makeQuestion(haus, pool, rng, 'meaning_en_to_de');
  assert.equal(en.prompt, 'house');
  assert.equal(en.correctAnswer, 'Haus');

  const cloze = makeQuestion(aufstehen, pool, rng, 'cloze');
  assert.equal(cloze.prompt, `Ich stehe um sieben ${BLANK}.`);
  assert.equal(cloze.correctAnswer, 'auf');

  const listen = makeQuestion(haus, pool, rng, 'listening');
  assert.equal(listen.prompt, null);
  assert.equal(listen.audioText, 'Haus');
});

test('distractors exclude the answer, prefer the same part of speech, and pad when the pool is tiny', () => {
  const pool = quizPool();
  const [haus] = pool;
  const d = pickDistractors(haus, pool, 3, primaryTranslation, seededRandom(1));
  assert.equal(d.length, 3);
  assert.ok(!d.includes('house'));
  assert.deepEqual([...d].sort(), ['child', 'man', 'woman']);

  const tiny = [haus, pool[1]];
  assert.deepEqual(pickDistractors(haus, tiny, 3, primaryTranslation, seededRandom(1)), ['woman', 'woman', 'woman']);
});

test('session has one question per target capped by limit, deterministic for a seed', () => {
  const pool = quizPool();
  assert.equal(makeQuizSession(pool, pool, seededRandom(3)).length, 6);
  assert.equal(makeQuizSession(pool, pool, seededRandom(3), { limit: 4 }).length, 4);
  const strip = (qs) => qs.map(({ id, ...rest }) => ({ ...rest, entry: rest.entry.id }));
  assert.deepEqual(strip(makeQuizSession(pool, pool, seededRandom(9))), strip(makeQuizSession(pool, pool, seededRandom(9))));
});

test('blank prefers a whole word, then a word start, and handles umlauts and punctuation', () => {
  assert.equal(blank('lang', 'Das Verlangen ist lang.'), `Das Verlangen ist ${BLANK}.`);
  assert.equal(blank('auf', 'Mir ist etwas aufgefallen.'), `Mir ist etwas ${BLANK}gefallen.`);
  assert.equal(blank('an', 'Er kann anrufen.'), `Er kann ${BLANK}rufen.`);
  assert.equal(blank('zu', 'Das ist nichts.'), 'Das ist nichts.');
  assert.equal(blank('über', 'Er denkt darüber, über alles.'), `Er denkt darüber, ${BLANK} alles.`);
});

// MARK: Planner and achievements

test('new words are ordered by priority then id, skipping started words', () => {
  const entries = [
    makeEntry('c', { priority: 1 }), makeEntry('a', { priority: 2 }), makeEntry('b', { priority: 1 }),
  ];
  const planner = makePlanner(makeTestIndex(entries));
  const s = newState();
  assert.deepEqual(planner.newWords('A1', s).map((e) => e.id), ['b', 'c', 'a']);
  s.progress.b = newProgress('b', T0);
  assert.deepEqual(planner.newWords('A1', s).map((e) => e.id), ['c', 'a']);
});

test('auto level is the first level not fully mastered; an override wins', () => {
  const entries = [makeEntry('a1', { level: 'A1' }), makeEntry('a2', { level: 'A2' })];
  const planner = makePlanner(makeTestIndex(entries));
  const s = newState();
  assert.equal(planner.currentLevel(s), 'A1');
  s.progress.a1 = { ...newProgress('a1', T0), boxLevel: 5, totalReviews: 5 };
  assert.equal(planner.currentLevel(s), 'A2');
  s.settings.levelOverride = 'C1';
  assert.equal(planner.currentLevel(s), 'C1');
});

test('due queue is most overdue first and ignores unknown and future words', () => {
  const planner = makePlanner(makeTestIndex([makeEntry('a'), makeEntry('b'), makeEntry('c')]));
  const s = newState();
  s.progress.a = { ...newProgress('a', T0), nextReviewDate: date('2026-03-09T00:00:00Z') };
  s.progress.b = { ...newProgress('b', T0), nextReviewDate: date('2026-03-01T00:00:00Z') };
  s.progress.c = { ...newProgress('c', T0), nextReviewDate: date('2026-03-12T00:00:00Z') };
  s.progress.ghost = newProgress('ghost', date('2026-01-01T00:00:00Z'));
  assert.deepEqual(planner.dueQueue(s, T0).map((p) => p.id), ['b', 'a']);
});

test('coverage counts by mastery state', () => {
  const planner = makePlanner(makeTestIndex(['a', 'b', 'c', 'd'].map((id) => makeEntry(id))));
  const s = newState();
  s.progress.a = { ...newProgress('a', T0), boxLevel: 5, totalReviews: 5 };
  s.progress.b = { ...newProgress('b', T0), boxLevel: 3, totalReviews: 3 };
  s.progress.c = newProgress('c', T0);
  const c = planner.coverage('A1', null, s);
  assert.deepEqual({ ...c }, { total: 4, mastered: 1, familiar: 1, learning: 1, notStarted: 1, started: 3 });
});

test('achievements unlock once and only when earned; higher-level badges exist', () => {
  const planner = makePlanner(makeTestIndex([makeEntry('a')]));
  const s = newState();
  assert.deepEqual(evaluateAchievements(s, planner, T0).map((a) => a.id), []);
  s.profile.bestCombo = 10;
  s.progress.a = { ...newProgress('a', T0), boxLevel: 5, totalReviews: 5 };
  assert.deepEqual(evaluateAchievements(s, planner, T0).map((a) => a.id), ['combo_10', 'level_a1']);
  assert.deepEqual(evaluateAchievements(s, planner, T0), []);
  for (const l of ['b2', 'c1', 'c2']) assert.ok(ACHIEVEMENTS.some((a) => a.id === `level_${l}`));
});

test('verb families group by base verb', () => {
  const verb = (base, particle) => ({ separable: true, irregular: false, present_3sg: 'x', perfekt: 'y', base_verb: base, particle });
  const index = makeTestIndex([
    makeEntry('aufstehen', { pos: 'composite_verb', verb: verb('stehen_verb', 'auf') }),
    makeEntry('verstehen', { pos: 'verb', verb: verb('stehen_verb', 'ver') }),
    makeEntry('anrufen', { pos: 'composite_verb', verb: verb('rufen_verb', 'an') }),
  ]);
  assert.deepEqual(index.verbFamilies.map((f) => [f.baseVerbID, f.members.map((m) => m.id)]),
    [['rufen_verb', ['anrufen']], ['stehen_verb', ['aufstehen', 'verstehen']]]);
});

// MARK: Session rules

test('introduce creates progress once', () => {
  const s = newState();
  const e = makeEntry('a');
  assert.equal(SessionRules.introduce(e, s, T0), true);
  assert.equal(SessionRules.introduce(e, s, T0), false);
});

test('correct answer earns xp and records it; wrong resets combo and earns nothing', () => {
  const s = newState();
  const e = makeEntry('a', { priority: 2 });
  SessionRules.introduce(e, s, T0);
  const combo = makeCombo();
  assert.equal(SessionRules.recordAnswer(e, true, combo, s, T0).xp, 17);
  assert.equal(s.dailyActivity['2026-03-10'].xpEarned, 17);
  assert.equal(SessionRules.recordAnswer(e, false, combo, s, T0).xp, 0);
  assert.equal(combo.current, 0);
});

test('best combo survives a miss at the end; combo multiplies xp from the fifth answer', () => {
  const s = newState();
  const entries = Array.from({ length: 6 }, (_, i) => makeEntry(`w${i}`));
  entries.forEach((e) => SessionRules.introduce(e, s, T0));
  const combo = makeCombo();
  const xps = entries.slice(0, 5).map((e) => SessionRules.recordAnswer(e, true, combo, s, T0).xp);
  assert.deepEqual(xps, [16, 16, 16, 16, 24]);
  SessionRules.recordAnswer(entries[5], false, combo, s, T0);
  assert.equal(s.profile.bestCombo, 5);
});

test('unknown word earns nothing but counts towards the combo; quiz counters update', () => {
  const s = newState();
  const combo = makeCombo();
  assert.equal(SessionRules.recordQuizAnswer(makeEntry('ghost'), true, combo, s, T0).xp, 0);
  assert.equal(combo.current, 1);
  assert.equal(s.profile.totalQuizQuestions, 1);
  assert.equal(s.profile.totalQuizCorrect, 1);
});

test('perfect quiz of ten sets the flag but short ones do not', () => {
  const s = newState();
  SessionRules.finishQuiz({ total: 9, correct: 9, xp: 0 }, true, s, T0);
  assert.equal(s.profile.hadPerfectQuiz10, false);
  SessionRules.finishQuiz({ total: 10, correct: 10, xp: 0 }, true, s, T0);
  assert.equal(s.profile.hadPerfectQuiz10, true);
  assert.equal(s.dailyActivity['2026-03-10'].reviewsCompleted, 19);
});

// MARK: Shipped bundle

test('shipped bundle loads, ids are unique, every entry is well formed and quizzable', () => {
  const bundle = JSON.parse(readFileSync(new URL('../vocab-bundle.json', import.meta.url), 'utf8'));
  const index = makeIndex(bundle);
  assert.ok(index.entries.length > 1000);
  assert.equal(index.entriesByID.size, index.entries.length);
  const rng = fixedRandom(0.42);
  for (const e of index.entries) {
    assert.ok(CEFR_LEVELS.includes(e.cefr), e.id);
    assert.ok(e.lemma_de && e.translations_en.length && e.example_de, e.id);
    assert.notEqual(index.themeFor(e).id, undefined, e.id);
    for (const kind of eligibleKinds(e)) {
      const q = makeQuestion(e, index.entriesAt(e.cefr), rng, kind);
      assert.equal(q.kind, kind);
      assert.ok(q.options.includes(q.correctAnswer), `${e.id} ${kind}`);
      if (kind === 'cloze') assert.ok(q.prompt.includes(BLANK), `${e.id} cloze`);
    }
  }
  assert.equal(QUIZ_KINDS.length, 5);
});
