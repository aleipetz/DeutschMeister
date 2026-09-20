import Foundation

/// A source of numbers in [0, 1). Injected into quiz generation so tests are deterministic.
protocol RandomSource: AnyObject {
    func nextUnit() -> Double
}

final class SystemRandomSource: RandomSource {
    func nextUnit() -> Double { Double.random(in: 0..<1) }
}

/// Always returns the same value. For tests.
final class FixedRandomSource: RandomSource {
    private let value: Double
    init(_ value: Double) { self.value = value }
    func nextUnit() -> Double { value }
}

/// Small deterministic generator (SplitMix64). For tests.
final class SeededRandomSource: RandomSource {
    private var state: UInt64
    init(seed: UInt64) { state = seed }

    func nextUnit() -> Double {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        z ^= z >> 31
        return Double(z >> 11) / Double(1 << 53)
    }
}

extension Array {
    /// Fisher-Yates shuffle, matching the prototype's algorithm.
    func shuffled(using rng: RandomSource) -> [Element] {
        var a = self
        guard a.count > 1 else { return a }
        for i in stride(from: a.count - 1, to: 0, by: -1) {
            let j = Int(rng.nextUnit() * Double(i + 1))
            a.swapAt(i, j)
        }
        return a
    }

    func randomElement(using rng: RandomSource) -> Element? {
        isEmpty ? nil : self[Int(rng.nextUnit() * Double(count))]
    }
}
