import SwiftUI

/// Runs a multiple-choice quiz: one question at a time, feeding each answer into the spaced-repetition
/// and XP rules. Used after a Learn session and by the Quiz tab.
@MainActor @Observable
final class QuizRunner {
    struct Answer {
        let selectedIndex: Int
        let wasCorrect: Bool
        let goalJustMet: Bool
    }

    let questions: [QuizQuestion]
    private let model: AppModel

    private(set) var index = 0
    private(set) var correct = 0
    private(set) var xp = 0
    private(set) var combo = ComboTracker()
    private(set) var answer: Answer?

    init(questions: [QuizQuestion], model: AppModel) {
        self.questions = questions
        self.model = model
    }

    var current: QuizQuestion? { index < questions.count ? questions[index] : nil }
    var isFinished: Bool { index >= questions.count }
    var stats: QuizStats { QuizStats(total: questions.count, correct: correct, xp: xp) }

    func choose(_ optionIndex: Int) {
        guard answer == nil, let question = current, question.options.indices.contains(optionIndex) else { return }
        let wasCorrect = question.options[optionIndex] == question.correctAnswer
        var combo = self.combo
        var outcome = AnswerOutcome(xp: 0, goalJustMet: false)
        let now = model.now, calendar = model.calendar
        model.update { state in
            outcome = SessionRules.recordQuizAnswer(
                for: question.entry, wasCorrect: wasCorrect, combo: &combo, state: &state, now: now, calendar: calendar)
        }
        self.combo = combo
        xp += outcome.xp
        if wasCorrect { correct += 1 }
        answer = Answer(selectedIndex: optionIndex, wasCorrect: wasCorrect, goalJustMet: outcome.goalJustMet)
    }

    /// Moves to the next question. Returns true if the quiz is now over.
    @discardableResult
    func advance() -> Bool {
        if answer?.goalJustMet == true { model.celebrateGoal() }
        answer = nil
        index += 1
        return isFinished
    }
}

/// Self-graded review of words that are due.
@MainActor @Observable
final class ReviewSession {
    let queue: [VocabEntry]
    private let model: AppModel

    private(set) var index = 0
    private(set) var correct = 0
    private(set) var xp = 0
    private(set) var combo = ComboTracker()
    private(set) var isRevealed = false

    init(model: AppModel) {
        self.model = model
        let due = model.planner.dueQueue(state: model.state, now: model.now)
        queue = due.compactMap { model.index.entriesByID[$0.id] }
    }

    var current: VocabEntry? { index < queue.count ? queue[index] : nil }
    var isFinished: Bool { index >= queue.count }

    func reveal() {
        isRevealed = true
        if let current { model.speak(current.lemmaDE) }
    }

    func grade(wasCorrect: Bool) {
        guard let entry = current else { return }
        var combo = self.combo
        var outcome = AnswerOutcome(xp: 0, goalJustMet: false)
        let now = model.now, calendar = model.calendar
        model.update { state in
            outcome = SessionRules.recordAnswer(
                for: entry, wasCorrect: wasCorrect, combo: &combo, state: &state, now: now, calendar: calendar)
        }
        self.combo = combo
        xp += outcome.xp
        if wasCorrect { correct += 1 }
        index += 1
        isRevealed = false

        if isFinished {
            model.update { SessionRules.finishReview(reviewed: queue.count, state: &$0, now: now, calendar: calendar) }
            model.evaluateAchievements(announce: !outcome.goalJustMet)
        }
        if outcome.goalJustMet { model.celebrateGoal() }
    }
}

/// Introduces new words one card at a time, then quizzes the learner on the ones just seen.
@MainActor @Observable
final class LearnSession {
    enum Phase { case cards, quiz, done }

    let level: CEFRLevel
    let queue: [VocabEntry]
    private let model: AppModel

    private(set) var index = 0
    private(set) var learned = 0
    private(set) var phase: Phase
    private(set) var quiz: QuizRunner?
    private(set) var quizStats: QuizStats?

    init(model: AppModel) {
        self.model = model
        level = model.currentLevel
        queue = model.planner.newWords(at: level, state: model.state)
        phase = queue.isEmpty ? .done : .cards
    }

    var current: VocabEntry? { phase == .cards && index < queue.count ? queue[index] : nil }

    func confirmCurrent() {
        guard let entry = current else { return }
        let now = model.now
        model.update { state in
            if SessionRules.introduce(entry, state: &state, now: now) { learned += 1 }
        }
        index += 1
        if index >= queue.count { finishCards() }
    }

    private func finishCards() {
        let now = model.now, calendar = model.calendar, learnedCount = learned
        model.update { SessionRules.finishLearnCards(learned: learnedCount, state: &$0, now: now, calendar: calendar) }

        let learnedEntries = queue.filter { model.state.progress[$0.id] != nil }
        guard !learnedEntries.isEmpty else { phase = .done; return }

        // Distractors come from the same level, unless it is too small to make good wrong answers.
        let levelPool = model.index.entries(at: level)
        let pool = levelPool.count >= 8 ? levelPool : model.index.entries
        let questions = QuizGenerator.makeSession(targets: learnedEntries, pool: pool, rng: SystemRandomSource())
        quiz = QuizRunner(questions: questions, model: model)
        phase = .quiz
    }

    func quizFinished() {
        guard let quiz else { return }
        let stats = quiz.stats, now = model.now, calendar = model.calendar
        quizStats = stats
        model.update { SessionRules.finishQuiz(stats: stats, countsAsReviews: false, state: &$0, now: now, calendar: calendar) }
        model.evaluateAchievements(announce: true)
        phase = .done
    }
}
