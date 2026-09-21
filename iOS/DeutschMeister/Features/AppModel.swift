import SwiftUI

enum AppTab: Hashable { case home, quiz, progress, badges }

enum SessionKind: String, Identifiable {
    case learn, review
    var id: String { rawValue }
}

/// The single source of truth the screens read from. Owns the learner's `AppState`, saves it after
/// every change and hands out the content index. Scheduling, XP and quiz rules live in `Domain/`.
@MainActor @Observable
final class AppModel {
    let index: ContentIndex
    let planner: StudyPlanner
    let speech: SpeechService

    private(set) var state: AppState
    private let store: ProgressStore
    private let clock: () -> Date
    let calendar: Calendar

    var selectedTab: AppTab = .home
    var presentedSession: SessionKind?
    var showSettings = false
    var celebration: Celebration?
    private(set) var saveError: String?

    init(
        index: ContentIndex, state: AppState, store: ProgressStore,
        speech: SpeechService = SpeechService(), calendar: Calendar = .current, clock: @escaping () -> Date = { Date() }
    ) {
        self.index = index
        self.planner = StudyPlanner(index: index)
        self.state = state
        self.store = store
        self.speech = speech
        self.calendar = calendar
        self.clock = clock
        self.state.rollOverDayIfNeeded(now: clock(), calendar: calendar)
    }

    var now: Date { clock() }

    // MARK: Derived numbers

    var currentLevel: CEFRLevel { planner.currentLevel(state: state) }
    var dueCount: Int { planner.dueQueue(state: state, now: now).count }
    var newWordCount: Int { planner.newWords(at: currentLevel, state: state).count }
    var masteredTotal: Int { planner.achievementContext(state: state).masteredTotal }
    var startedCount: Int { state.progress.keys.filter { index.entriesByID[$0] != nil }.count }

    // MARK: Changing state

    /// Applies a change and saves.
    func update(_ change: (inout AppState) -> Void) {
        change(&state)
        save()
    }

    func save() {
        do {
            try store.save(state)
            saveError = nil
        } catch {
            saveError = error.localizedDescription
        }
    }

    /// Call when the app comes to the foreground so a new calendar day resets today's counters.
    func refreshDay() {
        var next = state
        next.rollOverDayIfNeeded(now: now, calendar: calendar)
        if next.profile.todayDate != state.profile.todayDate { state = next; save() }
    }

    /// Unlocks any newly earned badges. With `announce`, shows a popup for the first one.
    func evaluateAchievements(announce: Bool) {
        var next = state
        let unlocked = Achievements.evaluate(state: &next, index: index, now: now)
        guard !unlocked.isEmpty else { return }
        state = next
        save()
        if announce, let first = unlocked.first {
            celebrate("🏆", "\(first.title) unlocked!", first.detail)
        }
    }

    func celebrate(_ emoji: String, _ title: String, _ subtitle: String) {
        celebration = Celebration(emoji: emoji, title: title, subtitle: subtitle)
    }

    func celebrateGoal() {
        celebrate("🎯", "Daily goal reached!", "\(state.profile.currentStreakDays)-day streak")
    }

    func replaceState(with newState: AppState) {
        state = newState
        state.rollOverDayIfNeeded(now: now, calendar: calendar)
        save()
    }

    func resetProgress() {
        state = AppState()
        state.rollOverDayIfNeeded(now: now, calendar: calendar)
        save()
    }

    // MARK: Speech

    func speak(_ text: String) {
        speech.speak(text, rate: state.settings.speechRate)
    }

    // MARK: Lookups used by views

    func theme(for entry: VocabEntry) -> Theme { index.theme(for: entry) }
    func palette(for entry: VocabEntry) -> ThemePalette { .forTheme(entry.themes.first) }
}
