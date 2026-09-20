import Foundation
@testable import DeutschMeister

/// Gregorian calendar fixed to UTC so date maths never depends on the machine's time zone.
let utc: Calendar = {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone(identifier: "UTC")!
    return c
}()

func date(_ iso: String) -> Date {
    ISO8601DateFormatter().date(from: iso)!
}

func makeEntry(
    _ id: String, pos: PartOfSpeech = .noun, level: CEFRLevel = .a1, lemma: String? = nil,
    english: [String] = ["thing"], example: String? = nil, cloze: String? = nil,
    gender: Gender? = nil, priority: Int = 1
) -> VocabEntry {
    let lemma = lemma ?? id
    return VocabEntry(
        id: id, cefr: level, pos: pos, lemmaDE: lemma, translationsEN: english,
        exampleDE: example ?? "Das ist \(lemma).", exampleEN: "That is a thing.",
        clozeWord: cloze ?? lemma, themes: ["home"], priority: priority, notes: nil,
        noun: gender.map { NounInfo(gender: $0, pluralDE: nil) },
        verb: nil, adjective: nil)
}

func makeIndex(_ entries: [VocabEntry]) -> ContentIndex {
    ContentIndex(bundle: VocabBundle(
        schemaVersion: 1, themes: [Theme(id: "home", labelEN: "Home", icon: "🏠")], entries: entries))
}

/// The six-entry pool the prototype's quiz tests used.
func quizPool() -> [VocabEntry] {
    [
        makeEntry("haus_noun", lemma: "Haus", english: ["house", "home"], example: "Das Haus ist groß.", gender: .das),
        makeEntry("frau_noun", lemma: "Frau", english: ["woman"], example: "Die Frau lacht.", gender: .die),
        makeEntry("mann_noun", lemma: "Mann", english: ["man"], example: "Der Mann geht.", gender: .der),
        makeEntry("kind_noun", lemma: "Kind", english: ["child"], example: "Das Kind spielt.", gender: .das),
        makeEntry("gut_adjective", pos: .adjective, lemma: "gut", english: ["good"], example: "Das ist gut."),
        makeEntry("aufstehen_verb", pos: .phrasalVerb, lemma: "aufstehen", english: ["to get up"],
                  example: "Ich stehe auf.", cloze: "auf"),
    ]
}
