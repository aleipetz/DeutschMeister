import Foundation
import Testing
@testable import DeutschMeister

/// Drives the real session controllers against a real `AppModel`, the way the screens do.
@MainActor @Suite struct SessionFlowTests {
    let now = date("2026-03-10T09:00:00Z")

    private func makeModel(entryCount: Int = 24, level: CEFRLevel = .b2, state: AppState = AppState()) -> (AppModel, ProgressStore) {
        let entries = (1...entryCount).map { i in
            makeEntry(String(format: "w%02d", i), level: level, lemma: "Wort\(i)", english: ["word \(i)"],
                      example: "Das ist Wort\(i).", gender: [.der, .die, .das][i % 3], priority: 1 + i % 3)
        }
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("DM-\(UUID().uuidString)")
        let store = ProgressStore(fileURL: dir.appendingPathComponent("progress.json"))
        let model = AppModel(
            index: makeIndex(entries), state: state, store: store, speech: SpeechService(muted: true),
            calendar: utc, clock: { [now] in now })
        return (model, store)
    }

    /// Picks the right answer for every remaining question.
    private func answerAll(_ runner: QuizRunner, correctly: Bool = true, onFinished: () -> Void) {
        while let q = runner.current {
            let right = q.options.firstIndex(of: q.correctAnswer)!
            runner.choose(correctly ? right : (right + 1) % q.options.count)
            if runner.advance() { onFinished() }
        }
    }

    @Test func learnSessionIntroducesTenWordsThenQuizzesThem() throws {
        let (model, store) = makeModel()
        model.update { $0.settings.levelOverride = .level(.b2) }
        let session = LearnSession(model: model)
        #expect(session.phase == .cards)
        #expect(session.queue.count == StudyPlanner.learnSessionSize)

        for _ in 0..<session.queue.count { session.confirmCurrent() }
        #expect(session.learned == 10)
        #expect(model.state.progress.count == 10)
        #expect(session.phase == .quiz)
        #expect(session.quiz?.questions.count == 10)
        #expect(model.state.dailyActivity["2026-03-10"]?.newWordsLearned == 10)

        let quiz = try #require(session.quiz)
        answerAll(quiz) { session.quizFinished() }
        #expect(session.phase == .done)
        #expect(session.quizStats == QuizStats(total: 10, correct: 10, xp: quiz.xp))
        #expect(quiz.xp > 0)
        #expect(model.state.profile.totalXP == quiz.xp)
        #expect(model.state.profile.hadPerfectQuiz10)  // 10 of 10
        #expect(model.state.profile.totalQuizQuestions == 10)
        // Every learned word was answered correctly once, so each moved to box 1.
        #expect(model.state.progress.values.allSatisfy { $0.boxLevel == 1 })
        #expect(model.state.achievements.map(\.id).contains("quiz_perfect"))

        // Everything is on disk.
        #expect(store.load() == model.state)
    }

    @Test func wrongQuizAnswersSendWordsBackToBoxZeroAndEarnNothing() throws {
        let (model, _) = makeModel()
        let session = LearnSession(model: model)
        for _ in 0..<session.queue.count { session.confirmCurrent() }
        let quiz = try #require(session.quiz)
        answerAll(quiz, correctly: false) { session.quizFinished() }
        #expect(quiz.xp == 0)
        #expect(model.state.profile.totalXP == 0)
        #expect(!model.state.profile.hadPerfectQuiz10)
        #expect(model.state.progress.values.allSatisfy { $0.boxLevel == 0 })
    }

    @Test func nextLearnSessionOffersTheNextTenWords() {
        let (model, _) = makeModel()
        let first = LearnSession(model: model)
        let firstIDs = first.queue.map(\.id)
        for _ in 0..<first.queue.count { first.confirmCurrent() }
        let second = LearnSession(model: model)
        #expect(Set(second.queue.map(\.id)).isDisjoint(with: firstIDs))
        #expect(second.queue.count == 10)
    }

    @Test func learnSessionWithNoNewWordsIsImmediatelyDone() {
        let (model, _) = makeModel(entryCount: 3)
        model.update { state in
            for id in ["w01", "w02", "w03"] { state.progress[id] = VocabProgress(id: id, now: now) }
        }
        #expect(LearnSession(model: model).phase == .done)
    }

    @Test func reviewSessionGradesDueWordsAndRecordsTheDay() {
        var state = AppState()
        for id in ["w01", "w02", "w03"] {
            var p = VocabProgress(id: id, now: now)
            p.boxLevel = 2; p.totalReviews = 3; p.totalCorrect = 3
            p.nextReviewDate = date("2026-03-09T09:00:00Z")  // due yesterday
            state.progress[id] = p
        }
        let (model, store) = makeModel(state: state)
        #expect(model.dueCount == 3)

        let session = ReviewSession(model: model)
        #expect(session.queue.count == 3)
        #expect(!session.isRevealed)
        session.reveal()
        #expect(session.isRevealed)
        session.grade(wasCorrect: true)
        #expect(!session.isRevealed)  // next card starts hidden again
        session.reveal(); session.grade(wasCorrect: true)
        session.reveal(); session.grade(wasCorrect: false)

        #expect(session.isFinished)
        #expect(session.correct == 2)
        #expect(session.xp > 0)
        #expect(model.state.dailyActivity["2026-03-10"]?.reviewsCompleted == 3)
        #expect(model.state.dailyActivity["2026-03-10"]?.xpEarned == session.xp)
        #expect(model.state.progress["w03"]?.boxLevel == 0)  // the miss
        #expect(model.state.progress["w01"]?.boxLevel == 3)
        #expect(model.dueCount == 1)  // only the missed word is due again today (box 0)
        #expect(store.load() == model.state)
    }

    @Test func reviewWithNothingDueIsEmptyAndFinished() {
        let (model, _) = makeModel()
        let session = ReviewSession(model: model)
        #expect(session.queue.isEmpty)
        #expect(session.isFinished)
    }

    @Test func reachingTheDailyGoalDuringAQuizShowsTheCelebrationOnNext() throws {
        var state = AppState()
        state.profile.dailyGoalXP = 10
        state.progress["w01"] = VocabProgress(id: "w01", now: now)
        let (model, _) = makeModel(state: state)
        let question = QuizGenerator.makeQuestion(for: model.index.entriesByID["w01"]!, pool: model.index.entries, kind: .meaningDEToEN, rng: FixedRandomSource(0))
        let runner = QuizRunner(questions: [question], model: model)
        runner.choose(question.options.firstIndex(of: question.correctAnswer)!)
        #expect(runner.answer?.goalJustMet == true)
        #expect(model.celebration == nil)  // shown when the learner taps Next, like the prototype
        #expect(runner.advance())
        #expect(model.celebration?.title == "Daily goal reached!")
        #expect(model.state.profile.currentStreakDays == 1)
    }

    @Test func answeringTwiceOrOutOfRangeIsIgnored() {
        var state = AppState()
        state.progress["w01"] = VocabProgress(id: "w01", now: now)
        let (model, _) = makeModel(state: state)
        let q = QuizGenerator.makeQuestion(for: model.index.entriesByID["w01"]!, pool: model.index.entries, kind: .gender, rng: FixedRandomSource(0))
        let runner = QuizRunner(questions: [q], model: model)
        runner.choose(99)
        #expect(runner.answer == nil)
        runner.choose(0)
        let xpAfterFirst = runner.xp
        runner.choose(1)
        #expect(runner.xp == xpAfterFirst)
        #expect(model.state.profile.totalQuizQuestions == 1)
    }

    @Test func newDayResetsTodayOnRefresh() {
        var state = AppState()
        state.profile.todayDate = "2026-03-09"
        state.profile.todayXP = 40
        state.profile.goalMetToday = true
        let (model, _) = makeModel(state: state)  // init rolls the day over
        #expect(model.state.profile.todayDate == "2026-03-10")
        #expect(model.state.profile.todayXP == 0)
        #expect(!model.state.profile.goalMetToday)
    }

    @Test func resetAndReplaceStatePersist() {
        var state = AppState()
        state.profile.totalXP = 99
        let (model, store) = makeModel(state: state)
        var imported = AppState()
        imported.profile.totalXP = 500
        model.replaceState(with: imported)
        #expect(store.load().profile.totalXP == 500)
        model.resetProgress()
        #expect(store.load().profile.totalXP == 0)
    }
}
