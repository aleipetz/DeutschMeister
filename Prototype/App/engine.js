/*
 * Pure-logic engine: Leitner spaced repetition + XP/gamification.
 * No DOM, no localStorage access here — inputs/outputs only, so this file
 * can be tested standalone with plain `node Tests/engine.test.js`.
 * Exposed as `window.Engine` in the browser build; exported via
 * module.exports when run under Node for tests.
 */
(function (root) {
  "use strict";

  var BOX_INTERVALS_DAYS = [0, 1, 3, 7, 14, 30, 90];
  var MAX_BOX = BOX_INTERVALS_DAYS.length - 1;

  var MASTERY = { NEW: "new", LEARNING: "learning", FAMILIAR: "familiar", MASTERED: "mastered" };

  function masteryStateForBox(boxLevel, hasBeenReviewed) {
    if (!hasBeenReviewed) return MASTERY.NEW;
    if (boxLevel <= 2) return MASTERY.LEARNING;
    if (boxLevel <= 4) return MASTERY.FAMILIAR;
    return MASTERY.MASTERED;
  }

  function addDays(date, days) {
    var d = new Date(date.getTime());
    d.setDate(d.getDate() + days);
    return d;
  }

  /**
   * Creates a fresh progress record for a vocab entry the learner has just
   * been introduced to (not yet reviewed).
   */
  function createProgress(entryId, now) {
    now = now || new Date();
    return {
      id: entryId,
      boxLevel: 0,
      nextReviewDate: now.toISOString(),
      lastReviewedDate: null,
      correctStreak: 0,
      totalReviews: 0,
      totalCorrect: 0,
      firstSeenDate: now.toISOString(),
      dateMastered: null,
      isLeech: false,
    };
  }

  /**
   * Applies the result of one review to a progress record. Returns a NEW
   * progress object (does not mutate the input) plus the XP earned.
   *
   * @param {object} progress - existing VocabProgress record
   * @param {boolean} wasCorrect
   * @param {number} priority - 1-5, from the content entry
   * @param {Date} [now]
   */
  function applyReview(progress, wasCorrect, priority, now) {
    now = now || new Date();
    var wasFirstReview = progress.totalReviews === 0;
    var next = Object.assign({}, progress);

    next.totalReviews = progress.totalReviews + 1;
    next.lastReviewedDate = now.toISOString();

    if (wasCorrect) {
      next.totalCorrect = progress.totalCorrect + 1;
      next.correctStreak = progress.correctStreak + 1;
      next.boxLevel = Math.min(progress.boxLevel + 1, MAX_BOX);
    } else {
      next.correctStreak = 0;
      next.boxLevel = 0;
    }

    next.nextReviewDate = addDays(now, BOX_INTERVALS_DAYS[next.boxLevel]).toISOString();

    var accuracy = next.totalCorrect / next.totalReviews;
    next.isLeech = next.totalReviews > 8 && accuracy < 0.5;

    var wasMastered = masteryStateForBox(progress.boxLevel, progress.totalReviews > 0) === MASTERY.MASTERED;
    var isMasteredNow = masteryStateForBox(next.boxLevel, true) === MASTERY.MASTERED;
    next.dateMastered = progress.dateMastered;
    if (!wasMastered && isMasteredNow) {
      next.dateMastered = now.toISOString();
    } else if (!isMasteredNow) {
      next.dateMastered = null;
    }

    var xp = 0;
    if (wasCorrect) {
      xp = 5 + priority;
      if (wasFirstReview) xp += 10;
    }

    return { progress: next, xpEarned: xp };
  }

  function masteryState(progress) {
    return masteryStateForBox(progress.boxLevel, progress.totalReviews > 0);
  }

  function isDue(progress, now) {
    now = now || new Date();
    return new Date(progress.nextReviewDate).getTime() <= now.getTime();
  }

  /** Combo multiplier for a given in-session consecutive-correct streak. */
  function comboMultiplier(streak) {
    if (streak >= 10) return 2;
    if (streak >= 5) return 1.5;
    return 1;
  }

  // ---- Streaks ----
  function isSameCalendarDay(isoA, isoB) {
    var a = new Date(isoA), b = new Date(isoB);
    return a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }

  function isNextCalendarDay(isoPrev, isoNow) {
    var prev = new Date(isoPrev);
    var expected = addDays(prev, 1);
    return isSameCalendarDay(expected.toISOString(), isoNow);
  }

  /**
   * Call once when the day's goal is met (todayXP crosses dailyGoalXP).
   * Returns the updated streak fields.
   */
  function recordGoalMet(profile, now) {
    now = now || new Date();
    var nowISO = now.toISOString();
    var next = Object.assign({}, profile);

    if (!profile.lastActiveDate) {
      next.currentStreakDays = 1;
    } else if (isSameCalendarDay(profile.lastActiveDate, nowISO)) {
      // already counted today
      next.currentStreakDays = profile.currentStreakDays;
    } else if (isNextCalendarDay(profile.lastActiveDate, nowISO)) {
      next.currentStreakDays = profile.currentStreakDays + 1;
      if (next.currentStreakDays % 7 === 0) {
        next.streakFreezesAvailable = Math.min((profile.streakFreezesAvailable || 0) + 1, 3);
      }
    } else {
      // gap of 2+ days: use a freeze if available, else reset
      if ((profile.streakFreezesAvailable || 0) > 0) {
        next.streakFreezesAvailable = profile.streakFreezesAvailable - 1;
        next.currentStreakDays = profile.currentStreakDays + 1;
      } else {
        next.currentStreakDays = 1;
      }
    }

    next.longestStreakDays = Math.max(profile.longestStreakDays || 0, next.currentStreakDays);
    next.lastActiveDate = nowISO;
    return next;
  }

  var Engine = {
    BOX_INTERVALS_DAYS: BOX_INTERVAL_DAYS_SAFE(),
    MAX_BOX: MAX_BOX,
    MASTERY: MASTERY,
    createProgress: createProgress,
    applyReview: applyReview,
    masteryState: masteryState,
    isDue: isDue,
    comboMultiplier: comboMultiplier,
    recordGoalMet: recordGoalMet,
  };

  function BOX_INTERVAL_DAYS_SAFE() {
    return BOX_INTERVALS_DAYS.slice();
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Engine;
  } else {
    root.Engine = Engine;
  }
})(typeof window !== "undefined" ? window : globalThis);
