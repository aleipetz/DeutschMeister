// Pure rules: spaced repetition, XP/streaks, study planning, quiz generation, achievements.
// No DOM, no storage. Ported from iOS/DeutschMeister/Domain/*.swift, which is the spec;
// the tests in Web/tests/ mirror iOS/DeutschMeisterTests/.
//
// Dates in state are JS Date objects; they serialise to the same millisecond ISO-8601
// strings the iOS app and the old web prototype wrote, so exports move freely between them.

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
export const GENDERS = ['der', 'die', 'das'];

export const POS_LABELS = {
  noun: 'Noun',
  adjective: 'Adjective',
  verb: 'Verb',
  phrasal_verb: 'Phrasal Verb',
  composite_verb: 'Composite Verb',
  other: 'Word',
};

export const isSeparableFamily = (pos) => pos === 'phrasal_verb' || pos === 'composite_verb';
export const primaryTranslation = (entry) => entry.translations_en[0] ?? '';

// MARK: - Calendar (device-local days)

const DAY_MS = 86_400_000;

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/// Same wall-clock time `days` calendar days later (DST-safe, like Calendar.date(byAdding: .day)).
export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/// Calendar days from `a` to `b` (not 24-hour periods).
export function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);
}

/// `yyyy-MM-dd` in local time.
export function dayKey(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// MARK: - Random sources

export const systemRandom = { next: () => Math.random() };

/// Deterministic SplitMix64, for tests.
export function seededRandom(seed) {
  let state = BigInt.asUintN(64, BigInt(seed));
  const M = (1n << 64n) - 1n;
  return {
    next() {
      state = (state + 0x9e3779b97f4a7c15n) & M;
      let z = state;
      z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & M;
      z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & M;
      z ^= z >> 31n;
      return Number(z >> 11n) / 2 ** 53;
    },
  };
}

export const fixedRandom = (value) => ({ next: () => value });

/// Fisher-Yates, matching the prototype and the iOS port.
export function shuffled(array, rng) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const randomElement = (array, rng) => (array.length ? array[Math.floor(rng.next() * array.length)] : undefined);

// MARK: - State

export function newProgress(id, now) {
  return {
    id, boxLevel: 0, nextReviewDate: new Date(now), lastReviewedDate: null,
    correctStreak: 0, totalReviews: 0, totalCorrect: 0,
    firstSeenDate: new Date(now), dateMastered: null, isLeech: false,
  };
}

export function newProfile() {
  return {
    totalXP: 0, currentStreakDays: 0, longestStreakDays: 0, lastActiveDate: null,
    streakFreezesAvailable: 0, dailyGoalXP: 50, todayXP: 0, todayDate: '', goalMetToday: false,
    bestCombo: 0, totalQuizQuestions: 0, totalQuizCorrect: 0, hadPerfectQuiz10: false,
  };
}

export function newSettings() {
  return { levelOverride: 'auto', speechRate: 0.95, onboarded: false };
}

export function newState() {
  return { progress: {}, profile: newProfile(), achievements: [], dailyActivity: {}, settings: newSettings() };
}

/// Resets today's counters when the calendar day has changed.
export function rollOverDayIfNeeded(state, now) {
  const key = dayKey(now);
  if (state.profile.todayDate === key) return;
  state.profile.todayDate = key;
  state.profile.todayXP = 0;
  state.profile.goalMetToday = false;
}

export function recordDailyActivity(state, { xp = 0, reviews = 0, newWords = 0 }, now) {
  const key = dayKey(now);
  const day = state.dailyActivity[key] ?? { xpEarned: 0, reviewsCompleted: 0, newWordsLearned: 0 };
  day.xpEarned += xp;
  day.reviewsCompleted += reviews;
  day.newWordsLearned += newWords;
  state.dailyActivity[key] = day;
}

/// Adds XP to today, the lifetime total and today's activity (the heatmap). When today's goal is
/// crossed for the first time, updates the streak. Returns true exactly once per day, when that happens.
export function awardXP(state, amount, now) {
  rollOverDayIfNeeded(state, now);
  state.profile.totalXP += amount;
  state.profile.todayXP += amount;
  recordDailyActivity(state, { xp: amount }, now);
  if (state.profile.goalMetToday || state.profile.todayXP < state.profile.dailyGoalXP) return false;
  state.profile.goalMetToday = true;
  state.profile = Leitner.recordGoalMet(state.profile, now);
  return true;
}

// MARK: - JSON coding (iOS / prototype compatible)

function parseDate(raw) {
  if (raw == null) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : fallback);
const bool = (v) => v === true;

/// Builds a full state from parsed JSON, filling a default for anything missing or malformed.
export function decodeState(raw) {
  const state = newState();
  if (!isObject(raw)) return state;

  if (isObject(raw.progress)) {
    for (const [key, p] of Object.entries(raw.progress)) {
      if (!isObject(p) || typeof (p.id ?? key) !== 'string') continue;
      const first = parseDate(p.firstSeenDate) ?? new Date(0);
      const rec = newProgress(p.id ?? key, first);
      rec.boxLevel = Math.min(Math.max(num(p.boxLevel, 0), 0), Leitner.maxBox);
      rec.nextReviewDate = parseDate(p.nextReviewDate) ?? first;
      rec.lastReviewedDate = parseDate(p.lastReviewedDate);
      rec.correctStreak = num(p.correctStreak, 0);
      rec.totalReviews = num(p.totalReviews, 0);
      rec.totalCorrect = num(p.totalCorrect, 0);
      rec.dateMastered = parseDate(p.dateMastered);
      rec.isLeech = bool(p.isLeech);
      state.progress[rec.id] = rec;
    }
  }

  if (isObject(raw.profile)) {
    const p = raw.profile;
    const f = state.profile;
    for (const k of ['totalXP', 'currentStreakDays', 'longestStreakDays', 'streakFreezesAvailable', 'todayXP',
      'bestCombo', 'totalQuizQuestions', 'totalQuizCorrect']) f[k] = num(p[k], 0);
    f.dailyGoalXP = Math.max(1, num(p.dailyGoalXP, 50));
    f.lastActiveDate = parseDate(p.lastActiveDate);
    f.todayDate = typeof p.todayDate === 'string' ? p.todayDate : '';
    f.goalMetToday = bool(p.goalMetToday);
    f.hadPerfectQuiz10 = bool(p.hadPerfectQuiz10);
  }

  if (Array.isArray(raw.achievements)) {
    state.achievements = raw.achievements
      .filter((a) => isObject(a) && typeof a.id === 'string')
      .map((a) => ({ id: a.id, dateUnlocked: parseDate(a.dateUnlocked) ?? new Date(0) }));
  }

  if (isObject(raw.dailyActivity)) {
    for (const [key, d] of Object.entries(raw.dailyActivity)) {
      if (!isObject(d)) continue;
      state.dailyActivity[key] = {
        xpEarned: num(d.xpEarned, 0), reviewsCompleted: num(d.reviewsCompleted, 0), newWordsLearned: num(d.newWordsLearned, 0),
      };
    }
  }

  if (isObject(raw.settings)) {
    const s = raw.settings;
    state.settings.levelOverride = CEFR_LEVELS.includes(s.levelOverride) ? s.levelOverride : 'auto';
    state.settings.speechRate = typeof s.speechRate === 'number' && Number.isFinite(s.speechRate) ? s.speechRate : 0.95;
    state.settings.onboarded = bool(s.onboarded);
  }
  return state;
}

export function encodeState(state) {
  return JSON.stringify(state, null, 2);
}

export class ImportError extends Error {
  constructor() {
    super("That file doesn't look like a Deutsch Meister progress export.");
  }
}

/// Parses an export from this app, the iOS app or the prototype. Rejects files without top-level
/// `progress` and `profile` objects; fills defaults for anything else missing.
export function decodeImport(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { throw new ImportError(); }
  if (!isObject(raw) || !isObject(raw.progress) || !isObject(raw.profile)) throw new ImportError();
  return decodeState(raw);
}

// MARK: - Leitner engine

export const Leitner = {
  /// Days until the next review, by box 0...6.
  boxIntervalsDays: [0, 1, 3, 7, 14, 30, 90],
  get maxBox() { return this.boxIntervalsDays.length - 1; },

  mastery(boxLevel, hasBeenReviewed) {
    if (!hasBeenReviewed) return 'new';
    if (boxLevel <= 2) return 'learning';
    if (boxLevel <= 4) return 'familiar';
    return 'mastered';
  },

  masteryOf(progress) {
    return this.mastery(progress.boxLevel, progress.totalReviews > 0);
  },

  isDue(progress, now) {
    return progress.nextReviewDate <= now;
  },

  comboMultiplier(streak) {
    if (streak >= 10) return 2;
    if (streak >= 5) return 1.5;
    return 1;
  },

  /// Applies one review. Returns a new record plus the base XP (before the combo multiplier).
  applyReview(progress, wasCorrect, priority, now) {
    const next = { ...progress };
    const wasFirstReview = progress.totalReviews === 0;
    next.totalReviews += 1;
    next.lastReviewedDate = new Date(now);

    if (wasCorrect) {
      next.totalCorrect += 1;
      next.correctStreak += 1;
      next.boxLevel = Math.min(progress.boxLevel + 1, this.maxBox);
    } else {
      next.correctStreak = 0;
      next.boxLevel = 0;
    }
    next.nextReviewDate = addDays(now, this.boxIntervalsDays[next.boxLevel]);

    next.isLeech = next.totalReviews > 8 && next.totalCorrect / next.totalReviews < 0.5;

    const wasMastered = this.mastery(progress.boxLevel, progress.totalReviews > 0) === 'mastered';
    const isMasteredNow = this.mastery(next.boxLevel, true) === 'mastered';
    if (!wasMastered && isMasteredNow) next.dateMastered = new Date(now);
    else if (!isMasteredNow) next.dateMastered = null;

    let xp = 0;
    if (wasCorrect) xp = 5 + priority + (wasFirstReview ? 10 : 0);
    return { progress: next, xpEarned: xp };
  },

  /// XP after the combo multiplier, rounded half up.
  xpWithCombo(baseXP, comboStreak) {
    return Math.round(baseXP * this.comboMultiplier(comboStreak));
  },

  /// Call once per day, when today's XP first reaches the goal. Returns the updated profile.
  recordGoalMet(profile, now) {
    const next = { ...profile };
    if (profile.lastActiveDate) {
      const days = daysBetween(profile.lastActiveDate, now);
      if (days <= 0) {
        // already counted today
      } else if (days === 1) {
        next.currentStreakDays = profile.currentStreakDays + 1;
        if (next.currentStreakDays % 7 === 0) {
          next.streakFreezesAvailable = Math.min(profile.streakFreezesAvailable + 1, 3);
        }
      } else if (profile.streakFreezesAvailable > 0) {
        next.streakFreezesAvailable = profile.streakFreezesAvailable - 1;
        next.currentStreakDays = profile.currentStreakDays + 1;
      } else {
        next.currentStreakDays = 1;
      }
    } else {
      next.currentStreakDays = 1;
    }
    next.longestStreakDays = Math.max(profile.longestStreakDays, next.currentStreakDays);
    next.lastActiveDate = new Date(now);
    return next;
  },
};

// MARK: - Content index

export const GENERAL_THEME = { id: 'general', label_en: 'General', icon: '📘' };

const byPriorityThenID = (a, b) => a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function makeIndex(bundle) {
  const entries = bundle.entries;
  const themes = bundle.themes ?? [];
  const entriesByID = new Map();
  for (const e of entries) if (!entriesByID.has(e.id)) entriesByID.set(e.id, e);
  const themesByID = new Map(themes.map((t) => [t.id, t]));

  const entriesByLevel = Object.fromEntries(CEFR_LEVELS.map((l) => [l, []]));
  for (const e of entries) (entriesByLevel[e.cefr] ??= []).push(e);
  for (const l of CEFR_LEVELS) entriesByLevel[l].sort(byPriorityThenID);

  const members = new Map();
  for (const e of entries) {
    const base = e.verb?.base_verb;
    if (!base) continue;
    if (!members.has(base)) members.set(base, []);
    members.get(base).push({
      id: e.id, lemma_de: e.lemma_de, particle: e.verb.particle ?? null, particle_meaning_hint: e.verb.particle_meaning_hint ?? null,
    });
  }
  const verbFamilies = [...members.keys()].sort().map((base) => ({
    baseVerbID: base, members: members.get(base).sort((a, b) => (a.id < b.id ? -1 : 1)),
  }));

  return {
    entries, themes, entriesByID, themesByID, entriesByLevel, verbFamilies,
    entriesAt: (level) => entriesByLevel[level] ?? [],
    themeFor: (entry) => (entry.themes?.[0] && themesByID.get(entry.themes[0])) || GENERAL_THEME,
  };
}

// MARK: - Study planner

export const LEARN_SESSION_SIZE = 10;
export const REVIEW_SESSION_SIZE = 30;

export function makePlanner(index) {
  const isMastered = (p) => p && Leitner.masteryOf(p) === 'mastered';

  const planner = {
    index,

    masteredCount(level, state) {
      return index.entriesAt(level).filter((e) => isMastered(state.progress[e.id])).length;
    },

    /// The manual override if set, otherwise the first level that isn't fully mastered.
    currentLevel(state) {
      if (CEFR_LEVELS.includes(state.settings.levelOverride)) return state.settings.levelOverride;
      let fallback = null;
      for (const level of CEFR_LEVELS) {
        const total = index.entriesAt(level).length;
        if (!total) continue;
        fallback = level;
        if (planner.masteredCount(level, state) < total) return level;
      }
      return fallback ?? 'A1';
    },

    newWords(level, state, limit = LEARN_SESSION_SIZE) {
      const out = [];
      for (const e of index.entriesAt(level)) {
        if (out.length >= limit) break;
        if (!state.progress[e.id]) out.push(e);
      }
      return out;
    },

    /// Progress records due for review, most overdue first.
    dueQueue(state, now, limit = REVIEW_SESSION_SIZE) {
      return Object.values(state.progress)
        .filter((p) => index.entriesByID.has(p.id) && Leitner.isDue(p, now))
        .sort((a, b) => a.nextReviewDate - b.nextReviewDate || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .slice(0, limit);
    },

    achievementContext(state) {
      let masteredTotal = 0;
      let verbMastered = 0;
      for (const [id, p] of Object.entries(state.progress)) {
        const entry = index.entriesByID.get(id);
        if (!entry || !isMastered(p)) continue;
        masteredTotal += 1;
        if (isSeparableFamily(entry.pos)) verbMastered += 1;
      }
      const levelComplete = {};
      for (const level of CEFR_LEVELS) {
        const total = index.entriesAt(level).length;
        levelComplete[level] = total > 0 && planner.masteredCount(level, state) === total;
      }
      return { profile: state.profile, masteredTotal, verbMastered, levelComplete };
    },

    /// Progress-screen numbers for one level, optionally limited to one part of speech.
    coverage(level, pos, state) {
      const c = { total: 0, mastered: 0, familiar: 0, learning: 0, notStarted: 0 };
      for (const e of index.entriesAt(level)) {
        if (pos && e.pos !== pos) continue;
        c.total += 1;
        const p = state.progress[e.id];
        if (!p) { c.notStarted += 1; continue; }
        const m = Leitner.masteryOf(p);
        if (m === 'mastered') c.mastered += 1;
        else if (m === 'familiar') c.familiar += 1;
        else c.learning += 1;
      }
      c.started = c.mastered + c.familiar + c.learning;
      return c;
    },
  };
  return planner;
}

// MARK: - Achievements

const levelBadge = (id, emoji, level) => ({
  id, emoji, title: `${level} Complete`, detail: `Mastered every ${level} word`,
  isUnlocked: (c) => c.levelComplete[level] === true,
});

export const ACHIEVEMENTS = [
  { id: 'streak_7', emoji: '🔥', title: 'Week Warrior', detail: '7-day streak', isUnlocked: (c) => c.profile.longestStreakDays >= 7 },
  { id: 'streak_30', emoji: '🔥', title: 'Monthly Master', detail: '30-day streak', isUnlocked: (c) => c.profile.longestStreakDays >= 30 },
  { id: 'streak_100', emoji: '💯', title: 'Centurion', detail: '100-day streak', isUnlocked: (c) => c.profile.longestStreakDays >= 100 },
  { id: 'combo_10', emoji: '⚡', title: 'Combo Breaker', detail: '10+ combo in one session', isUnlocked: (c) => c.profile.bestCombo >= 10 },
  { id: 'mastered_10', emoji: '🌱', title: 'First Sprouts', detail: '10 words mastered', isUnlocked: (c) => c.masteredTotal >= 10 },
  { id: 'mastered_50', emoji: '🌿', title: 'Growing Strong', detail: '50 words mastered', isUnlocked: (c) => c.masteredTotal >= 50 },
  { id: 'mastered_150', emoji: '🌳', title: 'Vocabulary Tree', detail: '150 words mastered', isUnlocked: (c) => c.masteredTotal >= 150 },
  { id: 'mastered_300', emoji: '🏔️', title: 'Word Mountain', detail: '300 words mastered', isUnlocked: (c) => c.masteredTotal >= 300 },
  { id: 'verb_master', emoji: '🧩', title: 'Verb Master', detail: '20 phrasal/composite verbs mastered', isUnlocked: (c) => c.verbMastered >= 20 },
  levelBadge('level_a1', '🥉', 'A1'),
  levelBadge('level_a2', '🥈', 'A2'),
  levelBadge('level_b1', '🥇', 'B1'),
  levelBadge('level_b2', '🏅', 'B2'),
  levelBadge('level_c1', '🎖️', 'C1'),
  levelBadge('level_c2', '🏆', 'C2'),
  { id: 'quiz_25', emoji: '🧠', title: 'Quiz Whiz', detail: 'Answer 25 quiz questions', isUnlocked: (c) => c.profile.totalQuizQuestions >= 25 },
  { id: 'quiz_perfect', emoji: '🎯', title: 'Perfectionist', detail: '100% on a 10+ question quiz', isUnlocked: (c) => c.profile.hadPerfectQuiz10 },
];

/// Unlocks any newly satisfied achievements in `state` and returns them in catalog order.
export function evaluateAchievements(state, planner, now) {
  const context = planner.achievementContext(state);
  const unlocked = new Set(state.achievements.map((a) => a.id));
  const newly = [];
  for (const a of ACHIEVEMENTS) {
    if (unlocked.has(a.id) || !a.isUnlocked(context)) continue;
    state.achievements.push({ id: a.id, dateUnlocked: new Date(now) });
    newly.push(a);
  }
  return newly;
}

// MARK: - Session rules

export function makeCombo() {
  return { current: 0, best: 0 };
}

export function recordCombo(combo, correct) {
  combo.current = correct ? combo.current + 1 : 0;
  combo.best = Math.max(combo.best, combo.current);
}

export const SessionRules = {
  /// Starts tracking a word the learner has just been shown. Returns false if already tracked.
  introduce(entry, state, now) {
    if (state.progress[entry.id]) return false;
    state.progress[entry.id] = newProgress(entry.id, now);
    return true;
  },

  /// One graded answer, self-graded (Review) or objective (Quiz). A word with no progress record
  /// earns nothing but still counts towards the combo.
  recordAnswer(entry, wasCorrect, combo, state, now) {
    rollOverDayIfNeeded(state, now);
    recordCombo(combo, wasCorrect);
    state.profile.bestCombo = Math.max(state.profile.bestCombo, combo.best);

    const record = state.progress[entry.id];
    if (!record) return { xp: 0, goalJustMet: false };
    const result = Leitner.applyReview(record, wasCorrect, entry.priority, now);
    state.progress[entry.id] = result.progress;

    const xp = Leitner.xpWithCombo(result.xpEarned, combo.current);
    const goalJustMet = xp > 0 ? awardXP(state, xp, now) : false;
    return { xp, goalJustMet };
  },

  recordQuizAnswer(entry, wasCorrect, combo, state, now) {
    state.profile.totalQuizQuestions += 1;
    if (wasCorrect) state.profile.totalQuizCorrect += 1;
    return SessionRules.recordAnswer(entry, wasCorrect, combo, state, now);
  },

  finishLearnCards(learned, state, now) {
    if (learned > 0) recordDailyActivity(state, { newWords: learned }, now);
  },

  finishReview(reviewed, state, now) {
    recordDailyActivity(state, { reviews: reviewed }, now);
  },

  /// `countsAsReviews` is true for the standalone Quiz tab, false for the quiz after a Learn session.
  finishQuiz(stats, countsAsReviews, state, now) {
    if (stats.total >= 10 && stats.correct === stats.total) state.profile.hadPerfectQuiz10 = true;
    if (countsAsReviews) recordDailyActivity(state, { reviews: stats.total }, now);
  },
};

// MARK: - Quiz generation

export const QUIZ_KINDS = ['meaning_de_to_en', 'meaning_en_to_de', 'gender', 'cloze', 'listening'];

export function eligibleKinds(entry) {
  const kinds = ['meaning_de_to_en', 'meaning_en_to_de', 'listening'];
  if (entry.pos === 'noun' && entry.noun) kinds.push('gender');
  if (entry.cloze_word) kinds.push('cloze');
  return kinds;
}

/// Up to `count` distinct wrong answers, preferring the same part of speech, never the entry
/// itself or a value equal to the correct answer. Pads with repeats if the pool is too small.
export function pickDistractors(entry, pool, count, value, rng) {
  const correct = value(entry);
  const candidates = pool.filter((c) => {
    if (c.id === entry.id) return false;
    const v = value(c);
    return v && v !== correct;
  });
  const samePOS = shuffled(candidates.filter((c) => c.pos === entry.pos), rng);
  const otherPOS = shuffled(candidates.filter((c) => c.pos !== entry.pos), rng);
  const ordered = samePOS.concat(otherPOS);

  const seen = new Set();
  const result = [];
  for (const c of ordered) {
    if (result.length >= count) break;
    const v = value(c);
    if (seen.has(v)) continue;
    seen.add(v);
    result.push(v);
  }
  for (let j = 0; result.length < count && ordered.length; j++) {
    const v = value(ordered[j % ordered.length]);
    if (v) result.push(v);
  }
  return result;
}

export const BLANK = '_____';

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/// Replaces the cloze word with a blank. Prefers a whole-word match, then a match at the start of
/// a word (`auf` in `aufgefallen`), then the first plain substring match.
export function blank(word, sentence) {
  if (!word) return sentence;
  const w = escapeRegExp(word);
  const patterns = [`(?<![\\p{L}\\p{N}])${w}(?![\\p{L}\\p{N}])`, `(?<![\\p{L}\\p{N}])${w}`, w];
  for (const p of patterns) {
    const m = new RegExp(p, 'u').exec(sentence);
    if (m) return sentence.slice(0, m.index) + BLANK + sentence.slice(m.index + m[0].length);
  }
  return sentence;
}

let questionSeq = 0;

export function makeQuestion(entry, pool, rng, requested) {
  const kinds = eligibleKinds(entry);
  const kind = requested && kinds.includes(requested) ? requested : randomElement(kinds, rng);
  const choices = (correct, value) => shuffled([correct, ...pickDistractors(entry, pool, 3, value, rng)], rng);
  const base = { id: ++questionSeq, kind, entry, prompt: null, audioText: null };

  switch (kind) {
    case 'gender':
      return { ...base, prompt: entry.lemma_de, promptLabel: 'Which article?',
        options: shuffled(GENDERS, rng), correctAnswer: entry.noun?.gender ?? 'der' };
    case 'meaning_de_to_en': {
      const answer = primaryTranslation(entry);
      return { ...base, prompt: entry.lemma_de, promptLabel: 'What does this mean?',
        options: choices(answer, primaryTranslation), correctAnswer: answer };
    }
    case 'meaning_en_to_de':
      return { ...base, prompt: primaryTranslation(entry), promptLabel: 'Which German word means this?',
        options: choices(entry.lemma_de, (e) => e.lemma_de), correctAnswer: entry.lemma_de };
    case 'cloze':
      return { ...base, prompt: blank(entry.cloze_word, entry.example_de), promptLabel: 'Fill in the blank',
        options: choices(entry.cloze_word, (e) => e.cloze_word), correctAnswer: entry.cloze_word };
    default:
      return { ...base, promptLabel: 'Listen and choose the word you heard',
        options: choices(entry.lemma_de, (e) => e.lemma_de), correctAnswer: entry.lemma_de, audioText: entry.lemma_de };
  }
}

/// One question per target (shuffled unless told otherwise), optionally capped by `limit`.
export function makeQuizSession(targets, pool, rng, { limit, shuffleTargets = true } = {}) {
  let list = shuffleTargets ? shuffled(targets, rng) : targets.slice();
  if (limit != null) list = list.slice(0, limit);
  return list.map((t) => makeQuestion(t, pool, rng));
}
