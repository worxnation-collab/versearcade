import Foundation

/// Mirrors `SCORING` + `scoreQuestion()` in the web app (src/lib/config.ts,
/// src/lib/progress.ts) so a round on the wrist scores exactly like a round on
/// the phone. Keep in sync with the TypeScript.
public struct Scoring: Sendable, Equatable {
    public var basePerCorrect = 100
    public var maxSpeedBonus = 100
    /// 16.5s — the web app's answer window.
    public var answerWindow: TimeInterval = 16.5
    public var comboStep = 0.25
    public var comboMax = 2.5

    public init() {}

    public func multiplier(combo: Int) -> Double {
        min(comboMax, 1 + Double(combo) * comboStep)
    }

    /// `combo` is the streak BEFORE this answer, as on the web.
    public func points(correct: Bool, elapsed: TimeInterval, combo: Int) -> Int {
        guard correct else { return 0 }
        let speedFrac = max(0, 1 - elapsed / answerWindow)
        let speedBonus = (Double(maxSpeedBonus) * speedFrac).rounded()
        return Int(((Double(basePerCorrect) + speedBonus) * multiplier(combo: combo)).rounded())
    }
}
