import Foundation

enum QuizKind: String, CaseIterable, Sendable {
    case meaningDEToEN = "meaning_de_to_en"
    case meaningENToDE = "meaning_en_to_de"
    case gender
    case cloze
    case listening
}

struct QuizQuestion: Identifiable, Sendable {
    let id = UUID()
    var kind: QuizKind
    var entry: VocabEntry
    /// Text shown to the learner. `nil` for listening questions (audio only).
    var prompt: String?
    var promptLabel: String
    var options: [String]
    var correctAnswer: String
    /// Text to speak for listening questions.
    var audioText: String?
}

/// Multiple-choice question builder. Ported from the prototype's `quiz.js`.
enum QuizGenerator {
    static func eligibleKinds(for entry: VocabEntry) -> [QuizKind] {
        var kinds: [QuizKind] = [.meaningDEToEN, .meaningENToDE, .listening]
        if entry.pos == .noun, entry.noun != nil { kinds.append(.gender) }
        if !entry.clozeWord.isEmpty { kinds.append(.cloze) }
        return kinds
    }

    /// Up to `count` distinct wrong answers, preferring the same part of speech, never the
    /// entry itself or a value equal to the correct answer. If the pool is too small to give
    /// `count` distinct values it pads with repeats rather than returning fewer.
    static func pickDistractors(
        for entry: VocabEntry, pool: [VocabEntry], count: Int,
        value: (VocabEntry) -> String?, rng: RandomSource
    ) -> [String] {
        let correct = value(entry)
        let candidates = pool.filter { candidate in
            guard candidate.id != entry.id, let v = value(candidate), !v.isEmpty else { return false }
            return v != correct
        }
        let samePOS = candidates.filter { $0.pos == entry.pos }.shuffled(using: rng)
        let otherPOS = candidates.filter { $0.pos != entry.pos }.shuffled(using: rng)
        let ordered = samePOS + otherPOS

        var seen = Set<String>()
        var result: [String] = []
        for candidate in ordered where result.count < count {
            guard let v = value(candidate), seen.insert(v).inserted else { continue }
            result.append(v)
        }
        var j = 0
        while result.count < count, !ordered.isEmpty {
            if let v = value(ordered[j % ordered.count]) { result.append(v) }
            j += 1
        }
        return result
    }

    static func makeQuestion(
        for entry: VocabEntry, pool: [VocabEntry], kind requested: QuizKind? = nil, rng: RandomSource
    ) -> QuizQuestion {
        let kinds = eligibleKinds(for: entry)
        let kind = requested.flatMap { kinds.contains($0) ? $0 : nil } ?? kinds.randomElement(using: rng)!

        func choices(correct: String, value: (VocabEntry) -> String?) -> [String] {
            let wrong = pickDistractors(for: entry, pool: pool, count: 3, value: value, rng: rng)
            return ([correct] + wrong).shuffled(using: rng)
        }

        switch kind {
        case .gender:
            let answer = entry.noun?.gender.rawValue ?? Gender.der.rawValue
            return QuizQuestion(
                kind: kind, entry: entry, prompt: entry.lemmaDE, promptLabel: "Which article?",
                options: Gender.allCases.map(\.rawValue).shuffled(using: rng), correctAnswer: answer)

        case .meaningDEToEN:
            let answer = entry.primaryTranslation
            return QuizQuestion(
                kind: kind, entry: entry, prompt: entry.lemmaDE, promptLabel: "What does this mean?",
                options: choices(correct: answer) { $0.primaryTranslation }, correctAnswer: answer)

        case .meaningENToDE:
            return QuizQuestion(
                kind: kind, entry: entry, prompt: entry.primaryTranslation,
                promptLabel: "Which German word means this?",
                options: choices(correct: entry.lemmaDE) { $0.lemmaDE }, correctAnswer: entry.lemmaDE)

        case .cloze:
            return QuizQuestion(
                kind: kind, entry: entry, prompt: blank(entry.clozeWord, in: entry.exampleDE),
                promptLabel: "Fill in the blank",
                options: choices(correct: entry.clozeWord) { $0.clozeWord }, correctAnswer: entry.clozeWord)

        case .listening:
            return QuizQuestion(
                kind: kind, entry: entry, prompt: nil, promptLabel: "Listen and choose the word you heard",
                options: choices(correct: entry.lemmaDE) { $0.lemmaDE }, correctAnswer: entry.lemmaDE,
                audioText: entry.lemmaDE)
        }
    }

    /// One question per target entry (shuffled unless told otherwise), optionally capped by `limit`.
    static func makeSession(
        targets: [VocabEntry], pool: [VocabEntry], limit: Int? = nil, shuffleTargets: Bool = true,
        rng: RandomSource
    ) -> [QuizQuestion] {
        var list = shuffleTargets ? targets.shuffled(using: rng) : targets
        if let limit { list = Array(list.prefix(limit)) }
        return list.map { makeQuestion(for: $0, pool: pool, rng: rng) }
    }

    static let blankMarker = "_____"

    /// Replaces the cloze word in the sentence with a blank. Prefers a whole-word match, then a
    /// match at the start of a word (particles inside infinitives: `auf` in `aufgefallen`),
    /// then the first plain substring match, so an early accidental hit never wins.
    static func blank(_ word: String, in sentence: String) -> String {
        guard !word.isEmpty else { return sentence }
        let escaped = NSRegularExpression.escapedPattern(for: word)
        let patterns = [
            "(?<![\\p{L}\\p{N}])\(escaped)(?![\\p{L}\\p{N}])",
            "(?<![\\p{L}\\p{N}])\(escaped)",
            escaped,
        ]
        for pattern in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern),
                  let match = regex.firstMatch(in: sentence, range: NSRange(sentence.startIndex..., in: sentence)),
                  let range = Range(match.range, in: sentence)
            else { continue }
            return sentence.replacingCharacters(in: range, with: blankMarker)
        }
        return sentence
    }
}
