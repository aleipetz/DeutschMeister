import Foundation

/// Indexed, read-only view of the vocabulary content.
struct ContentIndex: Sendable {
    let entries: [VocabEntry]
    let themes: [Theme]
    let entriesByID: [String: VocabEntry]
    let themesByID: [String: Theme]
    /// Per level, ordered by priority then id (learn order).
    let entriesByLevel: [CEFRLevel: [VocabEntry]]
    let verbFamilies: [VerbFamily]

    init(bundle: VocabBundle) {
        entries = bundle.entries
        themes = bundle.themes
        entriesByID = Dictionary(bundle.entries.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        themesByID = Dictionary(bundle.themes.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })

        var byLevel: [CEFRLevel: [VocabEntry]] = [:]
        for level in CEFRLevel.allCases { byLevel[level] = [] }
        for entry in bundle.entries { byLevel[entry.cefr, default: []].append(entry) }
        for level in CEFRLevel.allCases {
            byLevel[level]?.sort { ($0.priority, $0.id) < ($1.priority, $1.id) }
        }
        entriesByLevel = byLevel

        var members: [String: [VerbFamily.Member]] = [:]
        for entry in bundle.entries {
            guard let verb = entry.verb, let base = verb.baseVerb else { continue }
            members[base, default: []].append(
                .init(id: entry.id, lemmaDE: entry.lemmaDE, particle: verb.particle, particleMeaningHint: verb.particleMeaningHint))
        }
        verbFamilies = members.keys.sorted().map { base in
            VerbFamily(baseVerbID: base, members: members[base]!.sorted { $0.id < $1.id })
        }
    }

    func entries(at level: CEFRLevel) -> [VocabEntry] { entriesByLevel[level] ?? [] }

    func theme(for entry: VocabEntry) -> Theme {
        entry.themes.first.flatMap { themesByID[$0] } ?? .general
    }
}

/// Which words to show next, and derived progress numbers. Ported from `app.js`.
struct StudyPlanner: Sendable {
    static let learnSessionSize = 10
    static let reviewSessionSize = 30

    let index: ContentIndex

    func masteredCount(at level: CEFRLevel, state: AppState) -> Int {
        index.entries(at: level).filter { entry in
            state.progress[entry.id].map { LeitnerEngine.mastery(of: $0) == .mastered } ?? false
        }.count
    }

    /// The manual override if set, otherwise the first level that isn't fully mastered.
    func currentLevel(state: AppState) -> CEFRLevel {
        if case .level(let level) = state.settings.levelOverride { return level }
        var fallback: CEFRLevel?
        for level in CEFRLevel.allCases {
            let total = index.entries(at: level).count
            guard total > 0 else { continue }
            fallback = level
            if masteredCount(at: level, state: state) < total { return level }
        }
        return fallback ?? .a1
    }

    func newWords(at level: CEFRLevel, state: AppState, limit: Int = learnSessionSize) -> [VocabEntry] {
        Array(index.entries(at: level).lazy.filter { state.progress[$0.id] == nil }.prefix(limit))
    }

    /// Progress records due for review, most overdue first.
    func dueQueue(state: AppState, now: Date, limit: Int = reviewSessionSize) -> [VocabProgress] {
        let due = state.progress.values
            .filter { index.entriesByID[$0.id] != nil && LeitnerEngine.isDue($0, now: now) }
            .sorted { ($0.nextReviewDate, $0.id) < ($1.nextReviewDate, $1.id) }
        return Array(due.prefix(limit))
    }

    func achievementContext(state: AppState) -> AchievementContext {
        var mastered = 0, verbMastered = 0
        for (id, progress) in state.progress {
            guard let entry = index.entriesByID[id], LeitnerEngine.mastery(of: progress) == .mastered else { continue }
            mastered += 1
            if entry.pos.isSeparableFamily { verbMastered += 1 }
        }
        var complete: [CEFRLevel: Bool] = [:]
        for level in CEFRLevel.allCases {
            let total = index.entries(at: level).count
            complete[level] = total > 0 && masteredCount(at: level, state: state) == total
        }
        return AchievementContext(profile: state.profile, masteredTotal: mastered, verbMastered: verbMastered, levelComplete: complete)
    }

    struct Coverage: Sendable {
        var total = 0, mastered = 0, familiar = 0, learning = 0, notStarted = 0
        var started: Int { mastered + familiar + learning }
    }

    /// Progress-screen numbers for one level, optionally limited to one part of speech.
    func coverage(at level: CEFRLevel, pos: PartOfSpeech? = nil, state: AppState) -> Coverage {
        var result = Coverage()
        for entry in index.entries(at: level) where pos == nil || entry.pos == pos {
            result.total += 1
            guard let progress = state.progress[entry.id] else { result.notStarted += 1; continue }
            switch LeitnerEngine.mastery(of: progress) {
            case .mastered: result.mastered += 1
            case .familiar: result.familiar += 1
            case .learning, .new: result.learning += 1
            }
        }
        return result
    }
}
