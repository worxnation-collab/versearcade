import XCTest
@testable import RoundCore

final class ScoringTests: XCTestCase {
    // Same numbers the web's scoreQuestion() produces.
    func testMirrorsWebScoring() {
        let s = Scoring()
        XCTAssertEqual(s.points(correct: true, elapsed: 0, combo: 0), 200)
        XCTAssertEqual(s.points(correct: true, elapsed: 16.5, combo: 0), 100)
        XCTAssertEqual(s.points(correct: true, elapsed: 8.25, combo: 2), 225)  // 150 * 1.5
        XCTAssertEqual(s.points(correct: false, elapsed: 0, combo: 4), 0)
        XCTAssertEqual(s.multiplier(combo: 99), 2.5)
    }
}

final class CueTests: XCTestCase {
    func testComboTapCountMatchesLevel() {
        for level in 2...Cue.maxComboTaps {
            let clicks = Cue.combo(level: level).pattern.filter { $0.pulse == .click }
            XCTAssertEqual(clicks.count, level, "combo \(level) should be countable")
            XCTAssertEqual(Cue.combo(level: level).pattern.last?.pulse, .directionUp)
        }
        XCTAssertEqual(Cue.combo(level: 12).pattern.filter { $0.pulse == .click }.count, Cue.maxComboTaps)
    }

    func testBeatsAreOrderedAndSpaced() {
        let beats = Cue.combo(level: 4).pattern
        for (a, b) in zip(beats, beats.dropFirst()) { XCTAssertGreaterThan(b.at - a.at, 0.05) }
    }

    func testWrongIsSoft() {
        XCTAssertEqual(Cue.teach.pattern, [Beat(.retry, at: 0)])
    }
}

final class RoundEngineTests: XCTestCase {
    private func cards(_ n: Int) -> [Card] { Array(Deck.cards.prefix(n)) }

    func testComboCuesEscalateAndResetOnMiss() {
        let deck = cards(5)
        var e = RoundEngine(cards: deck)
        var t = 0.0
        XCTAssertEqual(e.start(at: t), [.questionStart])
        var got: [Cue] = []
        for (i, card) in deck.enumerated() {
            t += 1
            let guess = i == 3 ? !card.answer : card.answer  // miss the 4th
            got += e.answer(guess, at: t)
            got += e.next(at: t)
        }
        XCTAssertEqual(got, [
            .correct, .questionStart,
            .combo(level: 2), .questionStart,
            .combo(level: 3), .questionStart,
            .teach, .questionStart,
            .correct, .roundEnd,
        ])
        XCTAssertEqual(e.phase, .finished)
        XCTAssertEqual(e.comboMax, 3)
        XCTAssertEqual(e.combo, 1)
    }

    func testTicksFireOnceEachInOrder() {
        var e = RoundEngine(cards: cards(1))
        _ = e.start(at: 0)
        var ticks: [Int] = []
        var t = 0.0
        while t < 16.4 {
            t += 0.1
            for case .tick(let s) in e.tick(at: t) { ticks.append(s) }
        }
        XCTAssertEqual(ticks, [5, 3, 2, 1])
    }

    func testSleepSkipsToLatestTickOnly() {
        var e = RoundEngine(cards: cards(1))
        _ = e.start(at: 0)
        XCTAssertEqual(e.tick(at: 14.6), [.tick(secondsLeft: 2)])  // 1.9s left: 5 and 3 are swallowed
        XCTAssertEqual(e.tick(at: 14.7), [])
        XCTAssertEqual(e.tick(at: 15.6), [.tick(secondsLeft: 1)])
    }

    func testTimeoutTeachesAndBreaksCombo() {
        var e = RoundEngine(cards: cards(2))
        _ = e.start(at: 0)
        _ = e.answer(Deck.cards[0].answer, at: 1)
        _ = e.next(at: 2)
        XCTAssertEqual(e.combo, 1)
        XCTAssertEqual(e.tick(at: 2 + 16.5), [.teach])
        guard case .feedback(_, let r) = e.phase else { return XCTFail("expected feedback") }
        XCTAssertEqual(r.outcome, .timedOut)
        XCTAssertEqual(r.points, 0)
        XCTAssertEqual(e.combo, 0)
    }

    func testLateTapAfterSleepIsATimeoutNotAnAnswer() {
        var e = RoundEngine(cards: cards(1))
        _ = e.start(at: 0)
        XCTAssertEqual(e.answer(Deck.cards[0].answer, at: 40), [.teach])
        XCTAssertEqual(e.score, 0)
    }

    func testScoreUsesComboBeforeTheAnswer() {
        var e = RoundEngine(cards: cards(2))
        _ = e.start(at: 0)
        _ = e.answer(Deck.cards[0].answer, at: 0)  // 200 x1.0
        _ = e.next(at: 0)
        _ = e.answer(Deck.cards[1].answer, at: 0)  // 200 x1.25
        XCTAssertEqual(e.score, 450)
    }

    func testCallsOutOfPhaseAreIgnored() {
        var e = RoundEngine(cards: cards(1))
        XCTAssertEqual(e.answer(true, at: 0), [])
        XCTAssertEqual(e.next(at: 0), [])
        _ = e.start(at: 0)
        XCTAssertEqual(e.start(at: 1), [])
    }
}

final class DeckTests: XCTestCase {
    func testDeckIsWellFormed() {
        XCTAssertEqual(Set(Deck.cards.map(\.id)).count, Deck.cards.count)
        XCTAssertGreaterThanOrEqual(Deck.cards.count, 10)
        XCTAssertTrue(Deck.cards.contains { $0.answer } && Deck.cards.contains { !$0.answer })
        for c in Deck.cards { XCTAssertFalse(c.teach.isEmpty) }
    }

    func testDrawIsDistinct() {
        var rng = SystemRandomNumberGenerator()
        let hand = Deck.draw(5, using: &rng)
        XCTAssertEqual(Set(hand.map(\.id)).count, 5)
    }
}
