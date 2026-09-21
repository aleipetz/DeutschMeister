#if DEBUG
import Foundation

/// Debug-only launch arguments, so a screen can be opened directly and screenshotted without tapping:
///   -dmDemo           use an in-memory demo learner instead of the real saved progress
///   -dmFresh          use an empty in-memory learner (shows onboarding)
///   -dmScreen <name>  home | learn | review | quiz | progress | badges | settings
enum LaunchOptions {
    static let arguments = ProcessInfo.processInfo.arguments

    static var demo: Bool { arguments.contains("-dmDemo") }
    static var fresh: Bool { arguments.contains("-dmFresh") }
    static var screen: String? {
        guard let i = arguments.firstIndex(of: "-dmScreen"), arguments.indices.contains(i + 1) else { return nil }
        return arguments[i + 1]
    }
}

/// A believable mid-way learner for screenshots.
enum DemoData {
    static func makeState(index: ContentIndex, now: Date, calendar: Calendar) -> AppState {
        var state = AppState()
        state.settings.onboarded = true
        state.settings.levelOverride = .level(.b2)
        state.profile.totalXP = 640
        state.profile.currentStreakDays = 5
        state.profile.longestStreakDays = 12
        state.profile.streakFreezesAvailable = 1
        state.profile.dailyGoalXP = 50
        state.profile.todayXP = 35
        state.profile.todayDate = DayKey.string(for: now, calendar: calendar)
        state.profile.lastActiveDate = calendar.date(byAdding: .day, value: -1, to: now)
        state.profile.bestCombo = 8
        state.profile.totalQuizQuestions = 30

        // Roughly 60% of the words started, spread across boxes; every third one is due now.
        for (i, entry) in index.entries.enumerated() where i % 5 != 0 && i % 5 != 3 {
            var p = VocabProgress(id: entry.id, now: now)
            p.boxLevel = i % 7
            p.totalReviews = p.boxLevel + 1
            p.totalCorrect = p.boxLevel
            p.correctStreak = p.boxLevel
            let days = i % 3 == 0 ? -1 : (i % 9) + 1
            p.nextReviewDate = calendar.date(byAdding: .day, value: days, to: now) ?? now
            state.progress[entry.id] = p
        }
        if let tricky = state.progress.keys.sorted().first {
            state.progress[tricky]?.totalReviews = 12
            state.progress[tricky]?.totalCorrect = 4
            state.progress[tricky]?.isLeech = true
        }
        for offset in 0..<70 where offset % 4 != 3 {
            guard let day = calendar.date(byAdding: .day, value: -offset, to: now) else { continue }
            var activity = DailyActivity()
            activity.xpEarned = [15, 35, 60, 120, 45, 90][offset % 6]
            activity.reviewsCompleted = 10
            state.dailyActivity[DayKey.string(for: day, calendar: calendar)] = activity
        }
        state.achievements = [
            UnlockedAchievement(id: "streak_7", dateUnlocked: now), UnlockedAchievement(id: "mastered_10", dateUnlocked: now),
        ]
        return state
    }
}
#endif
