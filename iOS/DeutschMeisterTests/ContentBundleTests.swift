import Foundation
import Testing
@testable import DeutschMeister

/// Guards the shipped `vocab-bundle.json` (the same rules `Tools/validate_content.py` enforces).
@Suite struct ContentBundleTests {
    let index: ContentIndex

    init() throws {
        index = try ContentStore.loadBundled()
    }

    @Test func bundleLoadsAndHasContent() {
        #expect(index.entries.count > 0)
        #expect(index.themes.count > 0)
    }

    @Test func idsAreUnique() {
        #expect(Set(index.entries.map(\.id)).count == index.entries.count)
    }

    @Test func everyEntryIsWellFormed() {
        for e in index.entries {
            #expect(!e.translationsEN.isEmpty, "\(e.id) has no translations")
            #expect(e.exampleDE.contains(e.clozeWord), "\(e.id): cloze word not in example")
            #expect((1...5).contains(e.priority), "\(e.id) priority out of range")
            #expect(!e.themes.isEmpty && e.themes.allSatisfy { index.themesByID[$0] != nil }, "\(e.id) has an unknown theme")
            #expect((e.pos == .noun) == (e.noun != nil), "\(e.id) noun info mismatch")
            #expect(e.pos.isSeparableFamily == (e.verb?.baseVerb != nil && e.verb?.particle != nil), "\(e.id) verb info mismatch")
        }
    }

    @Test func everyEntryProducesEveryEligibleQuestionKind() {
        let rng = SeededRandomSource(seed: 7)
        for e in index.entries {
            for kind in QuizGenerator.eligibleKinds(for: e) {
                let q = QuizGenerator.makeQuestion(for: e, pool: index.entries, kind: kind, rng: rng)
                #expect(q.options.contains(q.correctAnswer), "\(e.id) \(kind): answer missing from options")
                #expect(Set(q.options).count == q.options.count, "\(e.id) \(kind): duplicate options")
                if kind == .cloze { #expect(q.prompt?.contains(QuizGenerator.blankMarker) == true, "\(e.id): nothing blanked") }
            }
        }
    }

    @Test func themesResolveForEveryEntry() {
        #expect(index.entries.allSatisfy { index.theme(for: $0).id != Theme.general.id })
    }
}
