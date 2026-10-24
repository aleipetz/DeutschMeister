import './support.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seededRandom } from '../js/domain.js';
import { STORAGE_KEY, makeStore, memoryStorage } from '../js/model.js';
import { finishReviewEverythingQuiz, LearnSession, makeReviewEverythingQuiz, ReviewSession } from '../js/sessions.js';
import { date, levelEntries, makeModel } from './support.mjs';

const answerAll = (runner, correct) => {
  while (!runner.isFinished) {
    const q = runner.current;
    const i = correct ? q.options.indexOf(q.correctAnswer) : q.options.findIndex((o) => o !== q.correctAnswer);
    runner.choose(i);
    runner.advance();
  }
};

test('learn session introduces ten words then quizzes them', () => {
  const { model } = makeModel(levelEntries('A1', 25));
  const session = new LearnSession(model, seededRandom(1));
  assert.equal(session.queue.length, 10);
  for (let i = 0; i < 10; i++) session.confirmCurrent();
  assert.equal(session.learned, 10);
  assert.equal(session.phase, 'quiz');
  assert.equal(session.quiz.questions.length, 10);
  assert.equal(model.state.dailyActivity['2026-03-10'].newWordsLearned, 10);

  answerAll(session.quiz, true);
  session.quizFinished();
  assert.equal(session.phase, 'done');
  assert.equal(session.quizStats.correct, 10);
  assert.ok(model.state.profile.totalXP > 0);
  assert.equal(model.state.profile.hadPerfectQuiz10, true);
  // The post-Learn quiz doesn't count as reviews.
  assert.equal(model.state.dailyActivity['2026-03-10'].reviewsCompleted, 0);
});

test('wrong quiz answers send words back to box zero and earn nothing', () => {
  const { model } = makeModel(levelEntries('A1', 12));
  const session = new LearnSession(model, seededRandom(2));
  for (let i = 0; i < 10; i++) session.confirmCurrent();
  answerAll(session.quiz, false);
  assert.equal(session.quiz.xp, 0);
  assert.ok(Object.values(model.state.progress).every((p) => p.boxLevel === 0 && p.totalReviews === 1));
});

test('next learn session offers the next ten words; none left means done', () => {
  const { model } = makeModel(levelEntries('A1', 12));
  const first = new LearnSession(model, seededRandom(3));
  for (let i = 0; i < 10; i++) first.confirmCurrent();
  const second = new LearnSession(model, seededRandom(3));
  assert.equal(second.queue.length, 2);
  assert.ok(second.queue.every((e) => !first.queue.includes(e)));
  for (let i = 0; i < 2; i++) second.confirmCurrent();
  assert.equal(new LearnSession(model).phase, 'done');
});

test('review session grades due words and records the day; nothing due is empty', () => {
  const { model, clock } = makeModel(levelEntries('A1', 5));
  assert.equal(new ReviewSession(model).isFinished, true);

  const learn = new LearnSession(model, seededRandom(4));
  for (let i = 0; i < 5; i++) learn.confirmCurrent();
  clock.now = date('2026-03-10T10:00:00Z');
  const review = new ReviewSession(model);
  assert.equal(review.queue.length, 5);
  review.reveal();
  assert.equal(review.isRevealed, true);
  for (let i = 0; i < 5; i++) review.grade(i % 2 === 0);
  assert.equal(review.isFinished, true);
  assert.equal(review.correct, 3);
  assert.equal(model.state.dailyActivity['2026-03-10'].reviewsCompleted, 5);
  assert.equal(new ReviewSession(model).queue.length, 2); // the misses are due again
});

test('reaching the daily goal during a quiz shows the celebration on next', () => {
  const { model } = makeModel(levelEntries('A1', 10));
  model.update((s) => { s.profile.dailyGoalXP = 10; });
  const session = new LearnSession(model, seededRandom(5));
  for (let i = 0; i < 10; i++) session.confirmCurrent();
  const q = session.quiz.current;
  session.quiz.choose(q.options.indexOf(q.correctAnswer));
  assert.equal(session.quiz.answer.goalJustMet, true);
  assert.equal(model.celebration, null);
  session.quiz.advance();
  assert.equal(model.celebration.title, 'Daily goal reached!');
});

test('answering twice or out of range is ignored', () => {
  const { model } = makeModel(levelEntries('A1', 10));
  const session = new LearnSession(model, seededRandom(6));
  for (let i = 0; i < 10; i++) session.confirmCurrent();
  const runner = session.quiz;
  runner.choose(99);
  assert.equal(runner.answer, null);
  runner.choose(0);
  const first = runner.answer;
  runner.choose(1);
  assert.equal(runner.answer, first);
  assert.equal(model.state.profile.totalQuizQuestions, 1);
});

test('the Quiz tab draws up to 20 questions from started words and counts them as reviews', () => {
  const { model } = makeModel(levelEntries('A1', 30));
  for (let n = 0; n < 3; n++) {
    const s = new LearnSession(model, seededRandom(n));
    for (let i = 0; i < 10; i++) s.confirmCurrent();
  }
  const runner = makeReviewEverythingQuiz(model, seededRandom(7));
  assert.equal(runner.questions.length, 20);
  answerAll(runner, true);
  const stats = finishReviewEverythingQuiz(model, runner);
  assert.equal(stats.correct, 20);
  assert.equal(model.state.dailyActivity['2026-03-10'].reviewsCompleted, 20);
  assert.ok(model.state.achievements.some((a) => a.id === 'quiz_perfect'));
});

test('a new day resets today on refresh; state persists across reloads', () => {
  const storage = memoryStorage();
  const { model, clock } = makeModel(levelEntries('A1', 3), { storage });
  model.update((s) => { s.profile.todayXP = 40; });
  clock.now = date('2026-03-11T07:00:00Z');
  model.refreshDay();
  assert.equal(model.state.profile.todayXP, 0);

  const { model: reloaded } = makeModel(levelEntries('A1', 3), { storage, now: clock.now });
  assert.equal(reloaded.state.profile.todayDate, '2026-03-11');
  reloaded.resetProgress();
  assert.equal(makeStore(storage).load().profile.totalXP, 0);
});

test('a corrupt save is moved aside, not overwritten', () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, '{not json');
  const state = makeStore(storage).load();
  assert.deepEqual(state.progress, {});
  assert.equal(storage.getItem(STORAGE_KEY), null);
  const backup = storage.keys().find((k) => k.startsWith(`${STORAGE_KEY}.corrupt-`));
  assert.equal(storage.getItem(backup), '{not json');
});
