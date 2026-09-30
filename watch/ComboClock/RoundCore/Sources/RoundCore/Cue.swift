import Foundation

/// One haptic tap. The watch maps these 1:1 onto WKHapticType; keeping them
/// here means the patterns are data the tests can read.
public enum Pulse: String, Sendable, Equatable, CaseIterable {
    case start, click, directionUp, success, retry, stop
}

public struct Beat: Sendable, Equatable {
    public let pulse: Pulse
    /// Seconds after the cue fires.
    public let at: TimeInterval
    public init(_ pulse: Pulse, at: TimeInterval) { self.pulse = pulse; self.at = at }
}

/// Something the round wants the wrist to feel.
public enum Cue: Sendable, Equatable {
    case questionStart
    /// The clock crossed a tick mark (5, 3, 2, 1 seconds left).
    case tick(secondsLeft: Int)
    /// First correct answer of a streak.
    case correct
    /// Second or later correct answer in a row — the combo you can COUNT.
    case combo(level: Int)
    /// A wrong answer or a timeout. Deliberately soft: a wrong answer here
    /// teaches, it doesn't buzz at you.
    case teach
    case roundEnd

    /// Longest countable burst. Past five taps nobody is counting any more.
    public static let maxComboTaps = 5
    static let tapGap: TimeInterval = 0.11

    public var pattern: [Beat] {
        switch self {
        case .questionStart: return [Beat(.start, at: 0)]
        case .tick: return [Beat(.click, at: 0)]
        case .correct: return [Beat(.success, at: 0)]
        case .combo(let level):
            // N quick taps for combo N, then a rising cue: you can feel your
            // streak without looking at the screen.
            let taps = min(max(level, 2), Cue.maxComboTaps)
            var beats = (0..<taps).map { Beat(.click, at: Double($0) * Cue.tapGap) }
            beats.append(Beat(.directionUp, at: Double(taps) * Cue.tapGap + 0.08))
            return beats
        case .teach: return [Beat(.retry, at: 0)]
        case .roundEnd: return [Beat(.stop, at: 0)]
        }
    }
}
