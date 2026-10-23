// Learn, Review and Quiz session controllers. Ported from iOS Features/Sessions.swift; every rule
// is delegated to SessionRules in domain.js.

import { makeCombo, makeQuizSession, SessionRules, systemRandom } from './domain.js';

/// Runs a multiple-choice quiz one question at a time. Used after a Learn session and by the Quiz tab.
export class QuizRunner {
  constructor(questions, model) {
    this.questions = questions;
    this.model = model;
    this.index = 0;
    this.correct = 0;
    this.xp = 0;
    this.combo = makeCombo();
    this.answer = null;
  }

  get current() { return this.questions[this.index] ?? null; }
  get isFinished() { return this.index >= this.questions.length; }
  get stats() { return { total: this.questions.length, correct: this.correct, xp: this.xp }; }

  choose(optionIndex) {
    const q = this.current;
    if (this.answer || !q || optionIndex < 0 || optionIndex >= q.options.length) return;
    const wasCorrect = q.options[optionIndex] === q.correctAnswer;
    const now = this.model.now;
    const outcome = this.model.update((s) => SessionRules.recordQuizAnswer(q.entry, wasCorrect, this.combo, s, now));
    this.xp += outcome.xp;
    if (wasCorrect) this.correct += 1;
    this.answer = { selectedIndex: optionIndex, wasCorrect, goalJustMet: outcome.goalJustMet };
    this.model.emit();
  }

  /// Moves to the next question. Returns true if the quiz is now over.
  advance() {
    const goal = this.answer?.goalJustMet;
    this.answer = null;
    this.index += 1;
    if (goal) this.model.celebrateGoal();
    else this.model.emit();
    return this.isFinished;
  }
}

/// Self-graded review of words that are due.
export class ReviewSession {
  constructor(model) {
    this.model = model;
    this.queue = model.planner.dueQueue(model.state, model.now)
      .map((p) => model.index.entriesByID.get(p.id))
      .filter(Boolean);
    this.index = 0;
    this.correct = 0;
    this.xp = 0;
    this.combo = makeCombo();
    this.isRevealed = false;
  }

  get current() { return this.queue[this.index] ?? null; }
  get isFinished() { return this.index >= this.queue.length; }

  reveal() {
    this.isRevealed = true;
    if (this.current) this.model.speak(this.current.lemma_de);
    this.model.emit();
  }

  grade(wasCorrect) {
    const entry = this.current;
    if (!entry) return;
    const now = this.model.now;
    const outcome = this.model.update((s) => SessionRules.recordAnswer(entry, wasCorrect, this.combo, s, now));
    this.xp += outcome.xp;
    if (wasCorrect) this.correct += 1;
    this.index += 1;
    this.isRevealed = false;

    if (this.isFinished) {
      this.model.update((s) => SessionRules.finishReview(this.queue.length, s, now));
      this.model.evaluateAchievements(!outcome.goalJustMet);
    }
    if (outcome.goalJustMet) this.model.celebrateGoal();
    else this.model.emit();
  }
}

/// Introduces new words one card at a time, then quizzes the learner on the ones just seen.
export class LearnSession {
  constructor(model, rng = systemRandom) {
    this.model = model;
    this.rng = rng;
    this.level = model.currentLevel;
    this.queue = model.planner.newWords(this.level, model.state);
    this.index = 0;
    this.learned = 0;
    this.phase = this.queue.length ? 'cards' : 'done';
    this.quiz = null;
    this.quizStats = null;
  }

  get current() { return this.phase === 'cards' ? this.queue[this.index] ?? null : null; }

  confirmCurrent() {
    const entry = this.current;
    if (!entry) return;
    const now = this.model.now;
    this.model.update((s) => { if (SessionRules.introduce(entry, s, now)) this.learned += 1; });
    this.index += 1;
    if (this.index >= this.queue.length) this.finishCards();
    this.model.emit();
  }

  finishCards() {
    const now = this.model.now;
    this.model.update((s) => SessionRules.finishLearnCards(this.learned, s, now));

    const learnedEntries = this.queue.filter((e) => this.model.state.progress[e.id]);
    if (!learnedEntries.length) { this.phase = 'done'; return; }

    // Distractors come from the same level, unless it is too small to make good wrong answers.
    const levelPool = this.model.index.entriesAt(this.level);
    const pool = levelPool.length >= 8 ? levelPool : this.model.index.entries;
    this.quiz = new QuizRunner(makeQuizSession(learnedEntries, pool, this.rng), this.model);
    this.phase = 'quiz';
  }

  quizFinished() {
    if (!this.quiz) return;
    const stats = this.quiz.stats;
    const now = this.model.now;
    this.quizStats = stats;
    this.model.update((s) => SessionRules.finishQuiz(stats, false, s, now));
    this.phase = 'done';
    this.model.evaluateAchievements(true);
    this.model.emit();
  }
}

/// The Quiz tab: every word the learner has started, up to 20 questions.
export function makeReviewEverythingQuiz(model, rng = systemRandom) {
  const eligible = Object.keys(model.state.progress).map((id) => model.index.entriesByID.get(id)).filter(Boolean);
  const questions = makeQuizSession(eligible, model.index.entries, rng, { limit: Math.min(20, eligible.length) });
  return new QuizRunner(questions, model);
}

export function finishReviewEverythingQuiz(model, runner) {
  const stats = runner.stats;
  const now = model.now;
  model.update((s) => SessionRules.finishQuiz(stats, true, s, now));
  model.evaluateAchievements(true);
  return stats;
}
