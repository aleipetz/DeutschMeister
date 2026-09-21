import Foundation

/// Consecutive-correct streak inside one session, plus the best it reached.
struct ComboTracker: Hashable, Sendable {
    private(set) var current = 0
    private(set) var best = 0

    mutating func record(correct: Bool) {
        current = correct ? current + 1 : 0
        best = max(best, current)
    }
}

struct AnswerOutcome: Hashable, Sendable {
    var xp: Int
    var goalJustMet: Bool
}

struct QuizStats: Hashable, Sendable {
    var total: Int
    var correct: Int
    var xp: Int

    var isPerfectOfTenOrMore: Bool { total >= 10 && correct == total }
}

/// How a Learn, Review or Quiz session changes the learner's state. Pure: takes and returns
/// `AppState`, never touches disk or UI. Ported from the session code in the prototype's `app.js`.
enum SessionRules {
    /// Starts tracking a word the learner has just been shown. Returns false if already tracked.
    @discardableResult
    static func introduce(_ entry: VocabEntry, state: inout AppState, now: Date) -> Bool {
        guard state.progress[entry.id] == nil else { return false }
        state.progress[entry.id] = VocabProgress(id: entry.id, now: now)
        return true
    }

    /// One graded answer, self-graded (Review) or objective (Quiz). Updates the word's box and
    /// schedule, awards combo-multiplied XP and updates the best combo. A word with no progress
    /// record earns nothing.
    static func recordAnswer(
        for entry: VocabEntry, wasCorrect: Bool, combo: inout ComboTracker,
        state: inout AppState, now: Date, calendar: Calendar = .current
    ) -> AnswerOutcome {
        state.rollOverDayIfNeeded(now: now, calendar: calendar)
        combo.record(correct: wasCorrect)
        // The prototype only updated this when a Review ended (using the streak at that moment,
        // not the best), so a long streak followed by one miss was lost.
        state.profile.bestCombo = max(state.profile.bestCombo, combo.best)

        guard let record = state.progress[entry.id] else { return AnswerOutcome(xp: 0, goalJustMet: false) }
        let result = LeitnerEngine.applyReview(record, wasCorrect: wasCorrect, priority: entry.priority, now: now, calendar: calendar)
        state.progress[entry.id] = result.progress

        let xp = LeitnerEngine.xpWithCombo(baseXP: result.xpEarned, comboStreak: combo.current)
        let goalJustMet = xp > 0 ? state.awardXP(xp, now: now, calendar: calendar) : false
        return AnswerOutcome(xp: xp, goalJustMet: goalJustMet)
    }

    /// A quiz answer: same as `recordAnswer`, plus the lifetime quiz counters.
    static func recordQuizAnswer(
        for entry: VocabEntry, wasCorrect: Bool, combo: inout ComboTracker,
        state: inout AppState, now: Date, calendar: Calendar = .current
    ) -> AnswerOutcome {
        state.profile.totalQuizQuestions += 1
        if wasCorrect { state.profile.totalQuizCorrect += 1 }
        return recordAnswer(for: entry, wasCorrect: wasCorrect, combo: &combo, state: &state, now: now, calendar: calendar)
    }

    static func finishLearnCards(learned: Int, state: inout AppState, now: Date, calendar: Calendar = .current) {
        guard learned > 0 else { return }
        state.recordDailyActivity(newWords: learned, now: now, calendar: calendar)
    }

    static func finishReview(reviewed: Int, state: inout AppState, now: Date, calendar: Calendar = .current) {
        state.recordDailyActivity(reviews: reviewed, now: now, calendar: calendar)
    }

    /// `countsAsReviews` is true for the standalone Quiz tab; the quiz that follows a Learn
    /// session isn't counted as reviews (matches the prototype).
    static func finishQuiz(stats: QuizStats, countsAsReviews: Bool, state: inout AppState, now: Date, calendar: Calendar = .current) {
        if stats.isPerfectOfTenOrMore { state.profile.hadPerfectQuiz10 = true }
        if countsAsReviews { state.recordDailyActivity(reviews: stats.total, now: now, calendar: calendar) }
    }
}
