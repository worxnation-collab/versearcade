import Foundation
import RoundCore

/// Owns the engine and the 10Hz clock that drives it. Monotonic time
/// (systemUptime) so a clock change mid-round can't stretch a window.
@MainActor
final class RoundModel: ObservableObject {
    static let questionsPerRound = 5

    @Published private(set) var engine: RoundEngine
    @Published private(set) var remaining: TimeInterval = 0
    private var timer: Timer?

    init() { engine = RoundModel.freshEngine() }

    private static func freshEngine() -> RoundEngine {
        var rng = SystemRandomNumberGenerator()
        return RoundEngine(cards: Deck.draw(questionsPerRound, using: &rng))
    }

    private var now: TimeInterval { ProcessInfo.processInfo.systemUptime }

    func start() { run { $0.start(at: now) } }
    func answer(_ guess: Bool) { run { $0.answer(guess, at: now) } }
    func next() { run { $0.next(at: now) } }

    func playAgain() {
        stopClock()
        engine = RoundModel.freshEngine()
        start()
    }

    /// Called when the app comes back to the foreground: a window that ran out
    /// while the wrist was down is settled now, not left frozen.
    func resync() { tick() }

    private func run(_ step: (inout RoundEngine) -> [Cue]) {
        let cues = step(&engine)
        Haptics.play(cues)
        syncClock()
    }

    private func tick() {
        let cues = engine.tick(at: now)
        if !cues.isEmpty { Haptics.play(cues) }
        syncClock()
    }

    private func syncClock() {
        remaining = engine.remaining(at: now)
        if case .asking = engine.phase {
            guard timer == nil else { return }
            let t = Timer(timeInterval: 0.1, repeats: true) { [weak self] _ in
                Task { @MainActor in self?.tick() }
            }
            RunLoop.main.add(t, forMode: .common)
            timer = t
        } else {
            stopClock()
        }
    }

    private func stopClock() {
        timer?.invalidate()
        timer = nil
    }
}
