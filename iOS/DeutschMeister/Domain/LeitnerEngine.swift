import Foundation

/// Leitner spaced repetition + XP/streak rules. Pure functions: no UI, no file I/O.
/// See `Docs/gamification-design.md`. Ported from the prototype's `engine.js`.
enum LeitnerEngine {
    /// Days until the next review, by box 0...6.
    static let boxIntervalsDays = [0, 1, 3, 7, 14, 30, 90]
    static let maxBox = boxIntervalsDays.count - 1

    enum Mastery: String, Sendable {
        case new, learning, familiar, mastered
    }

    static func mastery(boxLevel: Int, hasBeenReviewed: Bool) -> Mastery {
        guard hasBeenReviewed else { return .new }
        switch boxLevel {
        case ...2: return .learning
        case 3...4: return .familiar
        default: return .mastered
        }
    }

    static func mastery(of progress: VocabProgress) -> Mastery {
        mastery(boxLevel: progress.boxLevel, hasBeenReviewed: progress.totalReviews > 0)
    }

    static func isDue(_ progress: VocabProgress, now: Date) -> Bool {
        progress.nextReviewDate <= now
    }

    /// In-session consecutive-correct multiplier.
    static func comboMultiplier(streak: Int) -> Double {
        if streak >= 10 { return 2 }
        if streak >= 5 { return 1.5 }
        return 1
    }

    struct ReviewResult: Sendable {
        var progress: VocabProgress
        var xpEarned: Int
    }

    /// Applies one review. Returns a new record plus the base XP (before the combo multiplier).
    static func applyReview(
        _ progress: VocabProgress, wasCorrect: Bool, priority: Int, now: Date, calendar: Calendar = .current
    ) -> ReviewResult {
        var next = progress
        let wasFirstReview = progress.totalReviews == 0

        next.totalReviews += 1
        next.lastReviewedDate = now

        if wasCorrect {
            next.totalCorrect += 1
            next.correctStreak += 1
            next.boxLevel = min(progress.boxLevel + 1, maxBox)
        } else {
            next.correctStreak = 0
            next.boxLevel = 0
        }

        next.nextReviewDate = calendar.date(byAdding: .day, value: boxIntervalsDays[next.boxLevel], to: now) ?? now

        let accuracy = Double(next.totalCorrect) / Double(next.totalReviews)
        next.isLeech = next.totalReviews > 8 && accuracy < 0.5

        let wasMastered = mastery(boxLevel: progress.boxLevel, hasBeenReviewed: progress.totalReviews > 0) == .mastered
        let isMasteredNow = mastery(boxLevel: next.boxLevel, hasBeenReviewed: true) == .mastered
        if !wasMastered && isMasteredNow {
            next.dateMastered = now
        } else if !isMasteredNow {
            next.dateMastered = nil
        }

        var xp = 0
        if wasCorrect {
            xp = 5 + priority
            if wasFirstReview { xp += 10 }
        }
        return ReviewResult(progress: next, xpEarned: xp)
    }

    /// XP after the combo multiplier, rounded half up like the prototype's `Math.round`.
    static func xpWithCombo(baseXP: Int, comboStreak: Int) -> Int {
        Int((Double(baseXP) * comboMultiplier(streak: comboStreak)).rounded(.toNearestOrAwayFromZero))
    }

    // MARK: Streaks

    /// Call once per day, when today's XP first reaches the goal. Returns the updated profile.
    static func recordGoalMet(_ profile: Profile, now: Date, calendar: Calendar = .current) -> Profile {
        var next = profile

        if let last = profile.lastActiveDate {
            let days = calendar.dateComponents(
                [.day], from: calendar.startOfDay(for: last), to: calendar.startOfDay(for: now)
            ).day ?? 0
            switch days {
            case ...0:
                break  // already counted today
            case 1:
                next.currentStreakDays = profile.currentStreakDays + 1
                if next.currentStreakDays % 7 == 0 {
                    next.streakFreezesAvailable = min(profile.streakFreezesAvailable + 1, 3)
                }
            default:
                if profile.streakFreezesAvailable > 0 {
                    next.streakFreezesAvailable = profile.streakFreezesAvailable - 1
                    next.currentStreakDays = profile.currentStreakDays + 1
                } else {
                    next.currentStreakDays = 1
                }
            }
        } else {
            next.currentStreakDays = 1
        }

        next.longestStreakDays = max(profile.longestStreakDays, next.currentStreakDays)
        next.lastActiveDate = now
        return next
    }
}
