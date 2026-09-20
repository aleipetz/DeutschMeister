import Foundation
import Testing
@testable import DeutschMeister

// Ported from Prototype/Tests/engine.test.js.
@Suite struct LeitnerEngineTests {
    let now = date("2026-01-01T00:00:00Z")

    private func review(_ p: VocabProgress, _ correct: Bool, priority: Int = 1) -> LeitnerEngine.ReviewResult {
        LeitnerEngine.applyReview(p, wasCorrect: correct, priority: priority, now: now, calendar: utc)
    }

    @Test func newProgressStartsAtBoxZeroAndIsNew() {
        let p = VocabProgress(id: "word1", now: now)
        #expect(p.boxLevel == 0)
        #expect(LeitnerEngine.mastery(of: p) == .new)
    }

    @Test func correctReviewAdvancesBoxAndSchedulesByInterval() {
        let r = review(VocabProgress(id: "word1", now: now), true, priority: 3)
        #expect(r.progress.boxLevel == 1)
        #expect(r.progress.nextReviewDate == date("2026-01-02T00:00:00Z"))
    }

    @Test func incorrectReviewResetsBoxAndStreak() {
        var p = VocabProgress(id: "word1", now: now)
        p.boxLevel = 4; p.correctStreak = 5; p.totalReviews = 5
        let r = review(p, false, priority: 2)
        #expect(r.progress.boxLevel == 0)
        #expect(r.progress.correctStreak == 0)
        #expect(r.xpEarned == 0)
    }

    @Test func boxCapsAtMax() {
        var p = VocabProgress(id: "word1", now: now)
        for _ in 0..<20 { p = review(p, true).progress }
        #expect(p.boxLevel == LeitnerEngine.maxBox)
        #expect(p.nextReviewDate == date("2026-04-01T00:00:00Z"))  // +90 days
    }

    @Test func masteryProgressesLearningFamiliarMastered() {
        var p = review(VocabProgress(id: "word1", now: now), true).progress  // box 1
        #expect(LeitnerEngine.mastery(of: p) == .learning)
        for _ in 0..<2 { p = review(p, true).progress }  // box 3
        #expect(LeitnerEngine.mastery(of: p) == .familiar)
        for _ in 0..<2 { p = review(p, true).progress }  // box 5
        #expect(LeitnerEngine.mastery(of: p) == .mastered)
        #expect(p.dateMastered != nil)
    }

    @Test func dateMasteredClearsOnRegression() {
        var p = VocabProgress(id: "word1", now: now)
        for _ in 0..<5 { p = review(p, true).progress }
        #expect(p.dateMastered != nil)
        #expect(review(p, false).progress.dateMastered == nil)
    }

    @Test func leechFlagsAfterManyReviewsWithLowAccuracy() {
        var p = VocabProgress(id: "word1", now: now)
        for correct in [true, false, false, true, false, false, true, false, false] {
            p = review(p, correct).progress
        }
        #expect(p.totalReviews == 9)
        #expect(p.isLeech)
    }

    @Test func xpIsBasePlusPriorityPlusFirstTimeBonus() {
        let first = review(VocabProgress(id: "word1", now: now), true, priority: 3)
        #expect(first.xpEarned == 5 + 3 + 10)
        let second = review(first.progress, true, priority: 3)
        #expect(second.xpEarned == 5 + 3)
        #expect(review(second.progress, false, priority: 3).xpEarned == 0)
    }

    @Test func isDueComparesNextReviewDateToNow() {
        let reviewed = review(VocabProgress(id: "word1", now: now), true).progress  // due in 1 day
        #expect(!LeitnerEngine.isDue(reviewed, now: now))
        #expect(LeitnerEngine.isDue(reviewed, now: date("2026-01-02T00:00:00Z")))
    }

    @Test func comboMultiplierThresholds() {
        #expect(LeitnerEngine.comboMultiplier(streak: 0) == 1)
        #expect(LeitnerEngine.comboMultiplier(streak: 4) == 1)
        #expect(LeitnerEngine.comboMultiplier(streak: 5) == 1.5)
        #expect(LeitnerEngine.comboMultiplier(streak: 9) == 1.5)
        #expect(LeitnerEngine.comboMultiplier(streak: 10) == 2)
        #expect(LeitnerEngine.comboMultiplier(streak: 100) == 2)
    }

    @Test func comboXPRoundsHalfUp() {
        #expect(LeitnerEngine.xpWithCombo(baseXP: 13, comboStreak: 5) == 20)  // 19.5
        #expect(LeitnerEngine.xpWithCombo(baseXP: 13, comboStreak: 0) == 13)
        #expect(LeitnerEngine.xpWithCombo(baseXP: 8, comboStreak: 12) == 16)
    }
}

@Suite struct StreakTests {
    private func profile(streak: Int, longest: Int? = nil, last: String?, freezes: Int = 0) -> Profile {
        var p = Profile()
        p.currentStreakDays = streak
        p.longestStreakDays = longest ?? streak
        p.lastActiveDate = last.map(date)
        p.streakFreezesAvailable = freezes
        return p
    }

    private func goalMet(_ p: Profile, _ iso: String) -> Profile {
        LeitnerEngine.recordGoalMet(p, now: date(iso), calendar: utc)
    }

    @Test func firstDaySetsStreakToOne() {
        #expect(goalMet(profile(streak: 0, last: nil), "2026-01-01T12:00:00Z").currentStreakDays == 1)
    }

    @Test func consecutiveDayIncrements() {
        let u = goalMet(profile(streak: 1, last: "2026-01-01T12:00:00Z"), "2026-01-02T09:00:00Z")
        #expect(u.currentStreakDays == 2)
    }

    @Test func sameDayDoesNotDoubleIncrement() {
        let u = goalMet(profile(streak: 1, last: "2026-01-01T09:00:00Z"), "2026-01-01T20:00:00Z")
        #expect(u.currentStreakDays == 1)
    }

    @Test func sevenDayStreakGrantsAFreezeCappedAtThree() {
        let u = goalMet(profile(streak: 6, last: "2026-01-06T09:00:00Z"), "2026-01-07T09:00:00Z")
        #expect(u.currentStreakDays == 7)
        #expect(u.streakFreezesAvailable == 1)
        let capped = goalMet(profile(streak: 13, last: "2026-01-06T09:00:00Z", freezes: 3), "2026-01-07T09:00:00Z")
        #expect(capped.streakFreezesAvailable == 3)
    }

    @Test func gapWithFreezeConsumesItAndKeepsStreak() {
        let u = goalMet(profile(streak: 7, last: "2026-01-07T09:00:00Z", freezes: 1), "2026-01-09T09:00:00Z")
        #expect(u.streakFreezesAvailable == 0)
        #expect(u.currentStreakDays == 8)
    }

    @Test func gapWithoutFreezeResetsButKeepsLongest() {
        let u = goalMet(profile(streak: 7, last: "2026-01-07T09:00:00Z"), "2026-01-09T09:00:00Z")
        #expect(u.currentStreakDays == 1)
        #expect(u.longestStreakDays == 7)
    }

    @Test func dayBoundaryIsCalendarDayNotTwentyFourHours() {
        // 23:00 then 01:00 next day is 2 hours apart but a new calendar day.
        let u = goalMet(profile(streak: 3, last: "2026-01-01T23:00:00Z"), "2026-01-02T01:00:00Z")
        #expect(u.currentStreakDays == 4)
    }
}
