import Foundation
import Testing
@testable import DeutschMeister

@Suite struct StateCodingTests {
    /// Shaped like the prototype's export: ISO dates with milliseconds, and no `settings.onboarded`.
    let webExport = """
    {
      "progress": {
        "gehen_verb": {
          "id": "gehen_verb", "boxLevel": 3, "nextReviewDate": "2026-01-08T09:30:00.000Z",
          "lastReviewedDate": "2026-01-01T09:30:00.000Z", "correctStreak": 3, "totalReviews": 3,
          "totalCorrect": 3, "firstSeenDate": "2025-12-30T08:00:00.000Z", "dateMastered": null, "isLeech": false
        }
      },
      "profile": { "totalXP": 120, "currentStreakDays": 4, "lastActiveDate": "2026-01-01T09:30:00.000Z", "dailyGoalXP": 60 },
      "achievements": [ { "id": "streak_7", "dateUnlocked": "2026-01-07T10:00:00.000Z" } ],
      "dailyActivity": { "2026-01-01": { "xpEarned": 50, "reviewsCompleted": 5, "newWordsLearned": 0 } },
      "settings": { "levelOverride": "B2", "speechRate": 0.8 }
    }
    """

    @Test func decodesPrototypeExportAndFillsMissingFields() throws {
        let state = try StateCoding.decodeImport(Data(webExport.utf8))
        let p = try #require(state.progress["gehen_verb"])
        #expect(p.boxLevel == 3)
        #expect(p.nextReviewDate == date("2026-01-08T09:30:00Z"))
        #expect(state.profile.totalXP == 120)
        #expect(state.profile.dailyGoalXP == 60)
        #expect(state.profile.longestStreakDays == 0)  // missing → default
        #expect(state.profile.hadPerfectQuiz10 == false)
        #expect(state.settings.levelOverride == .level(.b2))
        #expect(state.settings.onboarded == false)  // missing → default
        #expect(state.dailyActivity["2026-01-01"]?.xpEarned == 50)
        #expect(state.achievements.first?.id == "streak_7")
    }

    @Test func roundTripsThroughOurOwnEncoding() throws {
        var state = try StateCoding.decodeImport(Data(webExport.utf8))
        state.settings.levelOverride = .auto
        let data = try StateCoding.encoder().encode(state)
        #expect(try StateCoding.decoder().decode(AppState.self, from: data) == state)
    }

    @Test func encodedDatesUseMillisecondISOFormatLikeTheWebApp() throws {
        let state = try StateCoding.decodeImport(Data(webExport.utf8))
        let text = String(decoding: try StateCoding.encoder().encode(state), as: UTF8.self)
        #expect(text.contains("\"2026-01-08T09:30:00.000Z\""))
        #expect(text.contains("\"levelOverride\" : \"B2\""))
    }

    @Test(arguments: ["{}", "[]", "not json", "{\"progress\":{}}", "{\"profile\":{}}", "{\"progress\":[],\"profile\":{}}"])
    func importRejectsFilesThatAreNotProgressExports(_ text: String) {
        #expect(throws: (any Error).self) { try StateCoding.decodeImport(Data(text.utf8)) }
    }

    @Test func importAcceptsMinimalFile() throws {
        let state = try StateCoding.decodeImport(Data(#"{"progress":{},"profile":{}}"#.utf8))
        #expect(state == AppState())
    }

    @Test func unknownLevelOverrideFallsBackToAuto() throws {
        let state = try StateCoding.decoder().decode(AppState.self, from: Data(#"{"settings":{"levelOverride":"Z9"}}"#.utf8))
        #expect(state.settings.levelOverride == .auto)
    }

    @Test func outOfRangeBoxLevelIsClamped() throws {
        let json = #"{"progress":{"a":{"id":"a","boxLevel":99}},"profile":{}}"#
        let state = try StateCoding.decodeImport(Data(json.utf8))
        #expect(state.progress["a"]?.boxLevel == LeitnerEngine.maxBox)
    }
}

@Suite struct ProgressStoreTests {
    private func tempStore() -> ProgressStore {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("DM-\(UUID().uuidString)")
        return ProgressStore(fileURL: dir.appendingPathComponent("progress.json"))
    }

    @Test func missingFileLoadsFreshState() {
        #expect(tempStore().load() == AppState())
    }

    @Test func saveThenLoadRoundTrips() throws {
        let store = tempStore()
        var state = AppState()
        state.progress["a"] = VocabProgress(id: "a", now: date("2026-01-01T00:00:00Z"))
        state.profile.totalXP = 42
        try store.save(state)
        #expect(store.load() == state)
    }

    @Test func corruptFileIsMovedAsideNotOverwritten() throws {
        let store = tempStore()
        try FileManager.default.createDirectory(at: store.fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("{ this is not json".utf8).write(to: store.fileURL)
        #expect(store.load() == AppState())
        let files = try FileManager.default.contentsOfDirectory(atPath: store.fileURL.deletingLastPathComponent().path)
        #expect(files.contains { $0.hasPrefix("progress.corrupt-") })
        #expect(!files.contains("progress.json"))
    }
}

@Suite struct DailyBookkeepingTests {
    @Test func goalIsMetOncePerDayAndStartsAStreak() {
        var state = AppState()
        state.profile.dailyGoalXP = 50
        let now = date("2026-01-01T10:00:00Z")
        #expect(state.awardXP(30, now: now, calendar: utc) == false)
        #expect(state.awardXP(25, now: now, calendar: utc) == true)
        #expect(state.awardXP(10, now: now, calendar: utc) == false)
        #expect(state.profile.totalXP == 65)
        #expect(state.profile.todayXP == 65)
        #expect(state.profile.currentStreakDays == 1)
    }

    @Test func newDayResetsTodayCounters() {
        var state = AppState()
        state.profile.dailyGoalXP = 10
        state.awardXP(20, now: date("2026-01-01T10:00:00Z"), calendar: utc)
        #expect(state.awardXP(5, now: date("2026-01-02T10:00:00Z"), calendar: utc) == false)
        #expect(state.profile.todayXP == 5)
        #expect(state.profile.totalXP == 25)
        #expect(state.awardXP(5, now: date("2026-01-02T11:00:00Z"), calendar: utc) == true)
        #expect(state.profile.currentStreakDays == 2)
    }

    @Test func dailyActivityAccumulatesPerDay() {
        var state = AppState()
        let now = date("2026-01-01T10:00:00Z")
        state.recordDailyActivity(xp: 10, reviews: 2, now: now, calendar: utc)
        state.recordDailyActivity(xp: 5, newWords: 3, now: now, calendar: utc)
        #expect(state.dailyActivity["2026-01-01"] == { var d = DailyActivity(); d.xpEarned = 15; d.reviewsCompleted = 2; d.newWordsLearned = 3; return d }())
    }
}

@Suite struct StudyPlannerTests {
    let now = date("2026-01-10T00:00:00Z")

    private func masteredProgress(_ id: String) -> VocabProgress {
        var p = VocabProgress(id: id, now: now)
        p.boxLevel = 5; p.totalReviews = 6; p.totalCorrect = 6
        return p
    }

    @Test func newWordsAreOrderedByPriorityThenIDAndSkipStartedWords() {
        let index = makeIndex([
            makeEntry("c", priority: 2), makeEntry("b", priority: 1), makeEntry("a", priority: 2), makeEntry("d", priority: 1),
        ])
        var state = AppState()
        #expect(StudyPlanner(index: index).newWords(at: .a1, state: state).map(\.id) == ["b", "d", "a", "c"])
        state.progress["b"] = VocabProgress(id: "b", now: now)
        #expect(StudyPlanner(index: index).newWords(at: .a1, state: state, limit: 2).map(\.id) == ["d", "a"])
    }

    @Test func autoLevelIsFirstLevelNotFullyMastered() {
        let index = makeIndex([makeEntry("a1", level: .a1), makeEntry("b1", level: .b1)])
        let planner = StudyPlanner(index: index)
        var state = AppState()
        #expect(planner.currentLevel(state: state) == .a1)
        state.progress["a1"] = masteredProgress("a1")
        #expect(planner.currentLevel(state: state) == .b1)
        state.progress["b1"] = masteredProgress("b1")
        #expect(planner.currentLevel(state: state) == .b1)  // all done: stays on the last level with content
    }

    @Test func overrideWinsOverAutoLevel() {
        let planner = StudyPlanner(index: makeIndex([makeEntry("a1", level: .a1), makeEntry("c1", level: .c1)]))
        var state = AppState()
        state.settings.levelOverride = .level(.c1)
        #expect(planner.currentLevel(state: state) == .c1)
    }

    @Test func dueQueueIsMostOverdueFirstAndIgnoresUnknownAndFutureWords() {
        let planner = StudyPlanner(index: makeIndex([makeEntry("a"), makeEntry("b"), makeEntry("c")]))
        var state = AppState()
        func progress(_ id: String, due: String) -> VocabProgress {
            var p = VocabProgress(id: id, now: now); p.nextReviewDate = date(due); return p
        }
        state.progress["a"] = progress("a", due: "2026-01-09T00:00:00Z")
        state.progress["b"] = progress("b", due: "2026-01-05T00:00:00Z")
        state.progress["c"] = progress("c", due: "2026-02-01T00:00:00Z")  // not due
        state.progress["gone"] = progress("gone", due: "2026-01-01T00:00:00Z")  // removed from content
        #expect(planner.dueQueue(state: state, now: now).map(\.id) == ["b", "a"])
    }

    @Test func coverageCountsByMasteryState() {
        let planner = StudyPlanner(index: makeIndex((1...5).map { makeEntry("w\($0)") }))
        var state = AppState()
        state.progress["w1"] = masteredProgress("w1")
        var familiar = VocabProgress(id: "w2", now: now); familiar.boxLevel = 3; familiar.totalReviews = 3
        state.progress["w2"] = familiar
        state.progress["w3"] = VocabProgress(id: "w3", now: now)  // introduced, never reviewed
        let c = planner.coverage(at: .a1, state: state)
        #expect((c.total, c.mastered, c.familiar, c.learning, c.notStarted) == (5, 1, 1, 1, 2))
    }

    @Test func achievementsUnlockOnceAndOnlyWhenEarned() {
        let entries = (1...10).map { makeEntry("w\($0)") }
        let index = makeIndex(entries)
        var state = AppState()
        #expect(Achievements.evaluate(state: &state, index: index, now: now).isEmpty)
        for e in entries { state.progress[e.id] = masteredProgress(e.id) }
        let first = Achievements.evaluate(state: &state, index: index, now: now).map(\.id)
        #expect(first.contains("mastered_10"))
        #expect(first.contains("level_a1"))
        #expect(Achievements.evaluate(state: &state, index: index, now: now).isEmpty)
        #expect(Set(state.achievements.map(\.id)) == Set(first))
    }

    @Test func higherLevelBadgesExist() {
        let ids = Set(Achievements.catalog.map(\.id))
        #expect(["level_b2", "level_c1", "level_c2"].allSatisfy(ids.contains))
    }

    @Test func verbFamiliesGroupByBaseVerb() {
        var machen = makeEntry("machen_verb", pos: .verb)
        machen.verb = VerbInfo(separable: false, irregular: false, present3sg: "macht", perfekt: "hat gemacht")
        var aus = makeEntry("ausmachen_verb", pos: .phrasalVerb)
        aus.verb = VerbInfo(separable: true, irregular: false, present3sg: "macht … aus", perfekt: "hat ausgemacht",
                            baseVerb: "machen_verb", particle: "aus", particleMeaningHint: "aus = out")
        var auf = makeEntry("aufmachen_verb", pos: .phrasalVerb)
        auf.verb = VerbInfo(separable: true, irregular: false, present3sg: "macht … auf", perfekt: "hat aufgemacht",
                            baseVerb: "machen_verb", particle: "auf", particleMeaningHint: "auf = open")
        let index = makeIndex([machen, aus, auf])
        #expect(index.verbFamilies.count == 1)
        #expect(index.verbFamilies[0].baseVerbID == "machen_verb")
        #expect(index.verbFamilies[0].members.map(\.id) == ["aufmachen_verb", "ausmachen_verb"])
    }
}

@Suite struct SessionRulesTests {
    let now = date("2026-01-01T10:00:00Z")

    private func stateWith(_ entry: VocabEntry, box: Int = 0, reviews: Int = 0) -> AppState {
        var state = AppState()
        var p = VocabProgress(id: entry.id, now: now)
        p.boxLevel = box; p.totalReviews = reviews
        state.progress[entry.id] = p
        return state
    }

    @Test func introduceCreatesProgressOnce() {
        var state = AppState()
        let entry = makeEntry("a")
        #expect(SessionRules.introduce(entry, state: &state, now: now))
        #expect(!SessionRules.introduce(entry, state: &state, now: now))
        #expect(state.progress.count == 1)
    }

    @Test func correctAnswerEarnsXPAndRecordsItForTheDay() {
        let entry = makeEntry("a", priority: 2)
        var state = stateWith(entry)
        var combo = ComboTracker()
        let out = SessionRules.recordAnswer(for: entry, wasCorrect: true, combo: &combo, state: &state, now: now, calendar: utc)
        #expect(out.xp == 5 + 2 + 10)  // first correct answer bonus
        #expect(state.profile.totalXP == 17)
        #expect(state.dailyActivity["2026-01-01"]?.xpEarned == 17)  // feeds the heatmap
    }

    @Test func wrongAnswerResetsComboAndEarnsNothing() {
        let entry = makeEntry("a")
        var state = stateWith(entry, box: 3, reviews: 3)
        var combo = ComboTracker()
        _ = SessionRules.recordAnswer(for: entry, wasCorrect: true, combo: &combo, state: &state, now: now, calendar: utc)
        let out = SessionRules.recordAnswer(for: entry, wasCorrect: false, combo: &combo, state: &state, now: now, calendar: utc)
        #expect(out.xp == 0)
        #expect(combo.current == 0)
        #expect(state.progress["a"]?.boxLevel == 0)
    }

    @Test func bestComboSurvivesAMissAtTheEnd() {
        let entry = makeEntry("a")
        var state = stateWith(entry, box: 2, reviews: 5)
        var combo = ComboTracker()
        for _ in 0..<10 { _ = SessionRules.recordAnswer(for: entry, wasCorrect: true, combo: &combo, state: &state, now: now, calendar: utc) }
        _ = SessionRules.recordAnswer(for: entry, wasCorrect: false, combo: &combo, state: &state, now: now, calendar: utc)
        #expect(state.profile.bestCombo == 10)
        #expect(Achievements.catalog.first { $0.id == "combo_10" }!.isUnlocked(
            AchievementContext(profile: state.profile, masteredTotal: 0, verbMastered: 0, levelComplete: [:])))
    }

    @Test func comboMultipliesXPFromTheFifthCorrectAnswer() {
        let entry = makeEntry("a", priority: 3)
        var state = stateWith(entry, box: 0, reviews: 1)  // not a first review, so no +10
        var combo = ComboTracker()
        var xp: [Int] = []
        for _ in 0..<5 { xp.append(SessionRules.recordAnswer(for: entry, wasCorrect: true, combo: &combo, state: &state, now: now, calendar: utc).xp) }
        #expect(xp == [8, 8, 8, 8, 12])  // 8 × 1.5 on the fifth
    }

    @Test func unknownWordEarnsNothingButStillCountsTowardsTheCombo() {
        var state = AppState()
        var combo = ComboTracker()
        let out = SessionRules.recordAnswer(for: makeEntry("x"), wasCorrect: true, combo: &combo, state: &state, now: now, calendar: utc)
        #expect(out == AnswerOutcome(xp: 0, goalJustMet: false))
        #expect(combo.current == 1)
        #expect(state.progress.isEmpty)
    }

    @Test func quizAnswersUpdateLifetimeCounters() {
        let entry = makeEntry("a")
        var state = stateWith(entry)
        var combo = ComboTracker()
        _ = SessionRules.recordQuizAnswer(for: entry, wasCorrect: true, combo: &combo, state: &state, now: now, calendar: utc)
        _ = SessionRules.recordQuizAnswer(for: entry, wasCorrect: false, combo: &combo, state: &state, now: now, calendar: utc)
        #expect(state.profile.totalQuizQuestions == 2)
        #expect(state.profile.totalQuizCorrect == 1)
    }

    @Test func crossingTheDailyGoalReportsItOnceAndStartsTheStreak() {
        let entry = makeEntry("a", priority: 5)
        var state = stateWith(entry, box: 0, reviews: 1)
        state.profile.dailyGoalXP = 20
        var combo = ComboTracker()
        let outcomes = (0..<3).map { _ in
            SessionRules.recordAnswer(for: entry, wasCorrect: true, combo: &combo, state: &state, now: now, calendar: utc)
        }
        #expect(outcomes.map(\.goalJustMet) == [false, true, false])  // 10, 20 (goal), 30
        #expect(state.profile.currentStreakDays == 1)
    }

    @Test func perfectQuizOfTenSetsTheFlagButShortOnesDoNot() {
        var state = AppState()
        SessionRules.finishQuiz(stats: QuizStats(total: 9, correct: 9, xp: 0), countsAsReviews: true, state: &state, now: now, calendar: utc)
        #expect(!state.profile.hadPerfectQuiz10)
        SessionRules.finishQuiz(stats: QuizStats(total: 10, correct: 10, xp: 0), countsAsReviews: true, state: &state, now: now, calendar: utc)
        #expect(state.profile.hadPerfectQuiz10)
        #expect(state.dailyActivity["2026-01-01"]?.reviewsCompleted == 19)
    }

    @Test func postLearnQuizDoesNotCountAsReviews() {
        var state = AppState()
        SessionRules.finishQuiz(stats: QuizStats(total: 5, correct: 3, xp: 0), countsAsReviews: false, state: &state, now: now, calendar: utc)
        #expect(state.dailyActivity.isEmpty)
    }
}
