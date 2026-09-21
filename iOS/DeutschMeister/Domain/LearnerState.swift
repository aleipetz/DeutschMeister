import Foundation

// Everything the learner has done. Vocabulary content itself is never stored here.
//
// The JSON shape matches the web prototype's `germanVocab.v1` state so its
// "Export progress" files import directly. Every field decodes with a default, so
// a partial or older file can never crash the app (the prototype replaced state
// wholesale and could).

struct VocabProgress: Codable, Hashable, Sendable {
    var id: String
    var boxLevel: Int = 0
    var nextReviewDate: Date
    var lastReviewedDate: Date?
    var correctStreak: Int = 0
    var totalReviews: Int = 0
    var totalCorrect: Int = 0
    var firstSeenDate: Date
    var dateMastered: Date?
    var isLeech: Bool = false

    init(id: String, now: Date) {
        self.id = id
        nextReviewDate = now
        firstSeenDate = now
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        boxLevel = try c.decodeIfPresent(Int.self, forKey: .boxLevel) ?? 0
        let first = try c.decodeIfPresent(Date.self, forKey: .firstSeenDate) ?? Date(timeIntervalSince1970: 0)
        firstSeenDate = first
        nextReviewDate = try c.decodeIfPresent(Date.self, forKey: .nextReviewDate) ?? first
        lastReviewedDate = try c.decodeIfPresent(Date.self, forKey: .lastReviewedDate)
        correctStreak = try c.decodeIfPresent(Int.self, forKey: .correctStreak) ?? 0
        totalReviews = try c.decodeIfPresent(Int.self, forKey: .totalReviews) ?? 0
        totalCorrect = try c.decodeIfPresent(Int.self, forKey: .totalCorrect) ?? 0
        dateMastered = try c.decodeIfPresent(Date.self, forKey: .dateMastered)
        isLeech = try c.decodeIfPresent(Bool.self, forKey: .isLeech) ?? false
        boxLevel = min(max(boxLevel, 0), LeitnerEngine.maxBox)
    }
}

struct Profile: Codable, Hashable, Sendable {
    var totalXP = 0
    var currentStreakDays = 0
    var longestStreakDays = 0
    var lastActiveDate: Date?
    var streakFreezesAvailable = 0
    var dailyGoalXP = 50
    var todayXP = 0
    /// Local calendar day, `yyyy-MM-dd`.
    var todayDate = ""
    var goalMetToday = false
    var bestCombo = 0
    var totalQuizQuestions = 0
    var totalQuizCorrect = 0
    var hadPerfectQuiz10 = false

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func int(_ key: CodingKeys, _ fallback: Int) throws -> Int { try c.decodeIfPresent(Int.self, forKey: key) ?? fallback }
        func bool(_ key: CodingKeys) throws -> Bool { try c.decodeIfPresent(Bool.self, forKey: key) ?? false }
        totalXP = try int(.totalXP, 0)
        currentStreakDays = try int(.currentStreakDays, 0)
        longestStreakDays = try int(.longestStreakDays, 0)
        lastActiveDate = try c.decodeIfPresent(Date.self, forKey: .lastActiveDate)
        streakFreezesAvailable = try int(.streakFreezesAvailable, 0)
        dailyGoalXP = max(1, try int(.dailyGoalXP, 50))
        todayXP = try int(.todayXP, 0)
        todayDate = try c.decodeIfPresent(String.self, forKey: .todayDate) ?? ""
        goalMetToday = try bool(.goalMetToday)
        bestCombo = try int(.bestCombo, 0)
        totalQuizQuestions = try int(.totalQuizQuestions, 0)
        totalQuizCorrect = try int(.totalQuizCorrect, 0)
        hadPerfectQuiz10 = try bool(.hadPerfectQuiz10)
    }
}

/// Which CEFR level new words come from. Encoded as `"auto"` or `"B2"` etc. (web-compatible).
enum LevelOverride: Codable, Hashable, Sendable {
    case auto
    case level(CEFRLevel)

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = CEFRLevel(rawValue: raw).map(LevelOverride.level) ?? .auto
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .auto: try c.encode("auto")
        case .level(let l): try c.encode(l.rawValue)
        }
    }
}

struct Settings: Codable, Hashable, Sendable {
    var levelOverride: LevelOverride = .auto
    var speechRate: Double = 0.95
    var onboarded = false

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        levelOverride = try c.decodeIfPresent(LevelOverride.self, forKey: .levelOverride) ?? .auto
        speechRate = try c.decodeIfPresent(Double.self, forKey: .speechRate) ?? 0.95
        onboarded = try c.decodeIfPresent(Bool.self, forKey: .onboarded) ?? false
    }
}

struct UnlockedAchievement: Codable, Hashable, Sendable {
    var id: String
    var dateUnlocked: Date
}

struct DailyActivity: Codable, Hashable, Sendable {
    var xpEarned = 0
    var reviewsCompleted = 0
    var newWordsLearned = 0

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        xpEarned = try c.decodeIfPresent(Int.self, forKey: .xpEarned) ?? 0
        reviewsCompleted = try c.decodeIfPresent(Int.self, forKey: .reviewsCompleted) ?? 0
        newWordsLearned = try c.decodeIfPresent(Int.self, forKey: .newWordsLearned) ?? 0
    }
}

struct AppState: Codable, Hashable, Sendable {
    var progress: [String: VocabProgress] = [:]
    var profile = Profile()
    var achievements: [UnlockedAchievement] = []
    /// Keyed by local calendar day, `yyyy-MM-dd`.
    var dailyActivity: [String: DailyActivity] = [:]
    var settings = Settings()

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        progress = try c.decodeIfPresent([String: VocabProgress].self, forKey: .progress) ?? [:]
        profile = try c.decodeIfPresent(Profile.self, forKey: .profile) ?? Profile()
        achievements = try c.decodeIfPresent([UnlockedAchievement].self, forKey: .achievements) ?? []
        dailyActivity = try c.decodeIfPresent([String: DailyActivity].self, forKey: .dailyActivity) ?? [:]
        settings = try c.decodeIfPresent(Settings.self, forKey: .settings) ?? Settings()
    }
}

// MARK: - Day keys and daily bookkeeping

enum DayKey {
    /// `yyyy-MM-dd` in the given calendar's time zone.
    static func string(for date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }
}

extension AppState {
    /// Resets today's counters when the calendar day has changed.
    mutating func rollOverDayIfNeeded(now: Date, calendar: Calendar = .current) {
        let key = DayKey.string(for: now, calendar: calendar)
        guard profile.todayDate != key else { return }
        profile.todayDate = key
        profile.todayXP = 0
        profile.goalMetToday = false
    }

    mutating func recordDailyActivity(
        xp: Int = 0, reviews: Int = 0, newWords: Int = 0, now: Date, calendar: Calendar = .current
    ) {
        let key = DayKey.string(for: now, calendar: calendar)
        var day = dailyActivity[key] ?? DailyActivity()
        day.xpEarned += xp
        day.reviewsCompleted += reviews
        day.newWordsLearned += newWords
        dailyActivity[key] = day
    }

    /// Adds XP to today's and the lifetime total and to today's activity record (which feeds the
    /// heatmap; the prototype never recorded XP there, so its heatmap stayed empty). When today's
    /// goal is crossed for the first time, updates the streak. Returns true exactly once per day,
    /// when that happens.
    @discardableResult
    mutating func awardXP(_ amount: Int, now: Date, calendar: Calendar = .current) -> Bool {
        rollOverDayIfNeeded(now: now, calendar: calendar)
        profile.totalXP += amount
        profile.todayXP += amount
        recordDailyActivity(xp: amount, now: now, calendar: calendar)
        guard !profile.goalMetToday, profile.todayXP >= profile.dailyGoalXP else { return false }
        profile.goalMetToday = true
        profile = LeitnerEngine.recordGoalMet(profile, now: now, calendar: calendar)
        return true
    }
}

// MARK: - JSON (web-compatible: ISO-8601 dates with milliseconds)

enum StateCoding {
    private static func makeFormatter(fractional: Bool) -> ISO8601DateFormatter {
        let f = ISO8601DateFormatter()
        f.formatOptions = fractional ? [.withInternetDateTime, .withFractionalSeconds] : [.withInternetDateTime]
        return f
    }

    static func decoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let raw = try decoder.singleValueContainer().decode(String.self)
            if let date = makeFormatter(fractional: true).date(from: raw) ?? makeFormatter(fractional: false).date(from: raw) {
                return date
            }
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Bad date: \(raw)"))
        }
        return d
    }

    static func encoder() -> JSONEncoder {
        let e = JSONEncoder()
        e.outputFormatting = [.prettyPrinted, .sortedKeys]
        e.dateEncodingStrategy = .custom { date, encoder in
            var c = encoder.singleValueContainer()
            try c.encode(makeFormatter(fractional: true).string(from: date))
        }
        return e
    }

    enum ImportError: LocalizedError {
        case notAProgressFile

        var errorDescription: String? { "That file doesn't look like a Deutsch Meister progress export." }
    }

    /// Decodes a saved or exported state. Rejects files that lack the web export's
    /// top-level `progress` and `profile` objects; fills defaults for anything else missing.
    static func decodeImport(_ data: Data) throws -> AppState {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              object["progress"] is [String: Any], object["profile"] is [String: Any]
        else { throw ImportError.notAProgressFile }
        return try decoder().decode(AppState.self, from: data)
    }
}
