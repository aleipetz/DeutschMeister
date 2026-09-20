import Foundation

struct AchievementContext: Sendable {
    var profile: Profile
    var masteredTotal: Int
    var verbMastered: Int
    var levelComplete: [CEFRLevel: Bool]
}

struct Achievement: Identifiable, Sendable {
    let id: String
    let emoji: String
    let title: String
    let detail: String
    let isUnlocked: @Sendable (AchievementContext) -> Bool
}

enum Achievements {
    static let catalog: [Achievement] = [
        Achievement(id: "streak_7", emoji: "🔥", title: "Week Warrior", detail: "7-day streak") { $0.profile.longestStreakDays >= 7 },
        Achievement(id: "streak_30", emoji: "🔥", title: "Monthly Master", detail: "30-day streak") { $0.profile.longestStreakDays >= 30 },
        Achievement(id: "streak_100", emoji: "💯", title: "Centurion", detail: "100-day streak") { $0.profile.longestStreakDays >= 100 },
        Achievement(id: "combo_10", emoji: "⚡", title: "Combo Breaker", detail: "10+ combo in one session") { $0.profile.bestCombo >= 10 },
        Achievement(id: "mastered_10", emoji: "🌱", title: "First Sprouts", detail: "10 words mastered") { $0.masteredTotal >= 10 },
        Achievement(id: "mastered_50", emoji: "🌿", title: "Growing Strong", detail: "50 words mastered") { $0.masteredTotal >= 50 },
        Achievement(id: "mastered_150", emoji: "🌳", title: "Vocabulary Tree", detail: "150 words mastered") { $0.masteredTotal >= 150 },
        Achievement(id: "mastered_300", emoji: "🏔️", title: "Word Mountain", detail: "300 words mastered") { $0.masteredTotal >= 300 },
        Achievement(id: "verb_master", emoji: "🧩", title: "Verb Master", detail: "20 phrasal/composite verbs mastered") { $0.verbMastered >= 20 },
        levelBadge("level_a1", "🥉", .a1),
        levelBadge("level_a2", "🥈", .a2),
        levelBadge("level_b1", "🥇", .b1),
        levelBadge("level_b2", "🏅", .b2),
        levelBadge("level_c1", "🎖️", .c1),
        levelBadge("level_c2", "🏆", .c2),
        Achievement(id: "quiz_25", emoji: "🧠", title: "Quiz Whiz", detail: "Answer 25 quiz questions") { $0.profile.totalQuizQuestions >= 25 },
        Achievement(id: "quiz_perfect", emoji: "🎯", title: "Perfectionist", detail: "100% on a 10+ question quiz") { $0.profile.hadPerfectQuiz10 },
    ]

    private static func levelBadge(_ id: String, _ emoji: String, _ level: CEFRLevel) -> Achievement {
        Achievement(id: id, emoji: emoji, title: "\(level.rawValue) Complete", detail: "Mastered every \(level.rawValue) word") {
            $0.levelComplete[level] == true
        }
    }

    /// Unlocks any newly satisfied achievements in `state` and returns them in catalog order.
    @discardableResult
    static func evaluate(state: inout AppState, index: ContentIndex, now: Date) -> [Achievement] {
        let planner = StudyPlanner(index: index)
        let context = planner.achievementContext(state: state)
        let unlocked = Set(state.achievements.map(\.id))
        var newly: [Achievement] = []
        for achievement in catalog where !unlocked.contains(achievement.id) && achievement.isUnlocked(context) {
            state.achievements.append(UnlockedAchievement(id: achievement.id, dateUnlocked: now))
            newly.append(achievement)
        }
        return newly
    }
}
