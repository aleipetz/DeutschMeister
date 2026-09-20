import Foundation
import Testing
@testable import DeutschMeister

// Ported from Prototype/Tests/quiz.test.js, plus cloze-blanking cases.
@Suite struct QuizGeneratorTests {
    let pool = quizPool()
    let rng = FixedRandomSource(0)

    @Test func genderKindOnlyForNounsWithGender() {
        #expect(QuizGenerator.eligibleKinds(for: pool[0]).contains(.gender))
        #expect(!QuizGenerator.eligibleKinds(for: pool[4]).contains(.gender))
    }

    @Test func clozeKindOnlyWhenClozeWordPresent() {
        let with = makeEntry("a", gender: .der)
        var without = makeEntry("b", gender: .der)
        without.clozeWord = ""
        #expect(QuizGenerator.eligibleKinds(for: with).contains(.cloze))
        #expect(!QuizGenerator.eligibleKinds(for: without).contains(.cloze))
    }

    @Test func genderQuestionOffersExactlyDerDieDas() {
        let q = QuizGenerator.makeQuestion(for: pool[0], pool: pool, kind: .gender, rng: rng)
        #expect(q.kind == .gender)
        #expect(q.correctAnswer == "das")
        #expect(q.options.sorted() == ["das", "der", "die"])
    }

    @Test func germanToEnglishUsesFirstTranslation() {
        let q = QuizGenerator.makeQuestion(for: pool[0], pool: pool, kind: .meaningDEToEN, rng: SystemRandomSource())
        #expect(q.prompt == "Haus")
        #expect(q.correctAnswer == "house")
        #expect(q.options.count == 4)
        #expect(q.options.contains("house"))
    }

    @Test func englishToGermanPromptsInEnglish() {
        let q = QuizGenerator.makeQuestion(for: pool[1], pool: pool, kind: .meaningENToDE, rng: SystemRandomSource())
        #expect(q.prompt == "woman")
        #expect(q.correctAnswer == "Frau")
        #expect(q.options.contains("Frau"))
    }

    @Test func clozeBlanksTheClozeWord() {
        let q = QuizGenerator.makeQuestion(for: pool[5], pool: pool, kind: .cloze, rng: SystemRandomSource())
        #expect(q.prompt == "Ich stehe _____.")
        #expect(q.correctAnswer == "auf")
        #expect(q.options.contains("auf"))
    }

    @Test func listeningHasNoPromptButCarriesAudio() {
        let q = QuizGenerator.makeQuestion(for: pool[0], pool: pool, kind: .listening, rng: SystemRandomSource())
        #expect(q.prompt == nil)
        #expect(q.audioText == "Haus")
        #expect(q.correctAnswer == "Haus")
    }

    @Test func distractorsExcludeTheAnswerAndReturnRequestedCount() {
        let d = QuizGenerator.pickDistractors(for: pool[0], pool: pool, count: 3, value: { $0.lemmaDE }, rng: SystemRandomSource())
        #expect(!d.contains("Haus"))
        #expect(d.count == 3)
    }

    @Test func distractorsPreferSamePartOfSpeech() {
        let d = QuizGenerator.pickDistractors(for: pool[0], pool: pool, count: 3, value: { $0.lemmaDE }, rng: SystemRandomSource())
        #expect(Set(d) == ["Frau", "Mann", "Kind"])
    }

    @Test func distractorsPadWithRepeatsWhenPoolIsTiny() {
        let tiny = [makeEntry("a", lemma: "A"), makeEntry("b", lemma: "B")]
        let d = QuizGenerator.pickDistractors(for: makeEntry("t", lemma: "T"), pool: tiny, count: 3, value: { $0.lemmaDE }, rng: SystemRandomSource())
        #expect(d.count == 3)
    }

    @Test func sessionHasOneQuestionPerTargetCappedByLimit() {
        let session = QuizGenerator.makeSession(targets: pool, pool: pool, limit: 3, rng: FixedRandomSource(0.1))
        #expect(session.count == 3)
        #expect(session.allSatisfy { $0.options.count >= 2 })
    }

    @Test func sessionIsDeterministicForTheSameSeed() {
        func summary() -> [String] {
            QuizGenerator.makeSession(targets: pool, pool: pool, rng: SeededRandomSource(seed: 42))
                .map { "\($0.entry.id):\($0.kind.rawValue):\($0.options.joined(separator: "|"))" }
        }
        #expect(summary() == summary())
    }

    // MARK: cloze blanking

    @Test func blankPrefersWholeWordOverAnEarlierSubstring() {
        #expect(QuizGenerator.blank("lang", in: "Das Verlangen ist lang.") == "Das Verlangen ist _____.")
    }

    @Test func blankHandlesParticleInsideAnInfinitive() {
        #expect(QuizGenerator.blank("auf", in: "Ihr Talent ist sofort aufgefallen.") == "Ihr Talent ist sofort _____gefallen.")
    }

    @Test func blankPrefersWordStartOverMidWord() {
        #expect(QuizGenerator.blank("ab", in: "Sie haben es abgesagt.") == "Sie haben es _____gesagt.")
    }

    @Test func blankLeavesSentenceAloneWhenWordIsMissing() {
        #expect(QuizGenerator.blank("xyz", in: "Ich stehe auf.") == "Ich stehe auf.")
    }

    @Test func blankHandlesUmlautsAndPunctuation() {
        #expect(QuizGenerator.blank("schön", in: "Das Wetter ist heute schön!") == "Das Wetter ist heute _____!")
    }
}
