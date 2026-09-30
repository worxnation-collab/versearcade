import Foundation

public enum Outcome: Sendable, Equatable { case correct, wrong, timedOut }

public struct QuestionResult: Sendable, Equatable {
    public let card: Card
    public let outcome: Outcome
    public let points: Int
    public let elapsed: TimeInterval
}

public enum Phase: Sendable, Equatable {
    case ready
    case asking(index: Int)
    /// Self-paced: the teach line stays up until the player taps on.
    case feedback(index: Int, QuestionResult)
    case finished
}

/// The round as a pure state machine over an injected clock. Every mutating
/// call returns the cues it produced; the caller plays them. No timers live in
/// here, which is what makes it testable to the millisecond.
///
/// Like the web QuizRunner, the clock is WALL time: if the watch sleeps with
/// the wrist down, the window keeps running and the next `tick` settles it.
public struct RoundEngine: Sendable {
    public let scoring: Scoring
    public let cards: [Card]
    public let tickMarks: [Int]

    public private(set) var phase: Phase = .ready
    public private(set) var score = 0
    public private(set) var combo = 0
    public private(set) var comboMax = 0
    public private(set) var results: [QuestionResult] = []

    private var askedAt: TimeInterval = 0
    private var firedMarks: Set<Int> = []

    public init(cards: [Card], scoring: Scoring = Scoring(), tickMarks: [Int] = [5, 3, 2, 1]) {
        precondition(!cards.isEmpty, "a round needs at least one card")
        self.cards = cards
        self.scoring = scoring
        self.tickMarks = tickMarks.sorted(by: >)
    }

    public var multiplier: Double { scoring.multiplier(combo: combo) }

    public func remaining(at now: TimeInterval) -> TimeInterval {
        guard case .asking = phase else { return 0 }
        return max(0, scoring.answerWindow - (now - askedAt))
    }

    public mutating func start(at now: TimeInterval) -> [Cue] {
        guard phase == .ready else { return [] }
        return ask(0, at: now)
    }

    /// Call often (10Hz is plenty). Fires at most ONE tick per call: after a
    /// sleep that skipped several marks, a burst of clicks means nothing, so
    /// only the latest one crossed plays.
    public mutating func tick(at now: TimeInterval) -> [Cue] {
        guard case .asking(let i) = phase else { return [] }
        let left = remaining(at: now)
        if left <= 0 { return settle(i, outcome: .timedOut, elapsed: scoring.answerWindow) }
        let crossed = tickMarks.filter { Double($0) >= left && !firedMarks.contains($0) }
        guard let latest = crossed.min() else { return [] }
        firedMarks.formUnion(crossed)
        return [.tick(secondsLeft: latest)]
    }

    public mutating func answer(_ guess: Bool, at now: TimeInterval) -> [Cue] {
        guard case .asking(let i) = phase else { return [] }
        // Settle a window that ran out before the tap was seen.
        if remaining(at: now) <= 0 { return settle(i, outcome: .timedOut, elapsed: scoring.answerWindow) }
        let elapsed = min(scoring.answerWindow, now - askedAt)
        return settle(i, outcome: guess == cards[i].answer ? .correct : .wrong, elapsed: elapsed)
    }

    /// Leave the teach card: next question, or the end of the round.
    public mutating func next(at now: TimeInterval) -> [Cue] {
        guard case .feedback(let i, _) = phase else { return [] }
        if i + 1 < cards.count { return ask(i + 1, at: now) }
        phase = .finished
        return [.roundEnd]
    }

    private mutating func ask(_ i: Int, at now: TimeInterval) -> [Cue] {
        phase = .asking(index: i)
        askedAt = now
        firedMarks = []
        return [.questionStart]
    }

    private mutating func settle(_ i: Int, outcome: Outcome, elapsed: TimeInterval) -> [Cue] {
        let correct = outcome == .correct
        let points = scoring.points(correct: correct, elapsed: elapsed, combo: combo)
        let result = QuestionResult(card: cards[i], outcome: outcome, points: points, elapsed: elapsed)
        score += points
        results.append(result)
        phase = .feedback(index: i, result)
        guard correct else {
            combo = 0
            return [.teach]
        }
        combo += 1
        comboMax = max(comboMax, combo)
        return [combo >= 2 ? .combo(level: combo) : .correct]
    }
}
