// Synthesized arcade sound engine — every SFX is generated with the Web Audio
// API, so there are zero audio files to ship or license and every sound is
// tunable in code. Lazily initialized on the first user gesture (browser/iOS
// autoplay policy). All output passes through a master gain that respects the
// user's volume + mute settings.

type Wave = OscillatorType

let ctx: AudioContext | null = null
let master: GainNode | null = null
let enabled = true
let volume = 0.6

function ensure() {
  if (ctx) return
  const AC = window.AudioContext || (window as any).webkitAudioContext
  if (!AC) return
  ctx = new AC()
  master = ctx.createGain()
  master.gain.value = volume
  master.connect(ctx.destination)
}

export const Sound = {
  /** Call once on first tap so iOS/Safari unlock the audio context. */
  unlock() {
    ensure()
    if (ctx && ctx.state === 'suspended') ctx.resume()
  },
  configure(opts: { enabled?: boolean; volume?: number }) {
    if (opts.enabled !== undefined) enabled = opts.enabled
    if (opts.volume !== undefined) {
      volume = opts.volume
      if (master) master.gain.value = volume
    }
  },

  // Low-level tone with an ADSR-ish envelope.
  tone(freq: number, dur: number, opts: { type?: Wave; gain?: number; slideTo?: number; delay?: number } = {}) {
    if (!enabled) return
    ensure()
    if (!ctx || !master) return
    const t0 = ctx.currentTime + (opts.delay ?? 0)
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = opts.type ?? 'square'
    osc.frequency.setValueAtTime(freq, t0)
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur)
    const peak = opts.gain ?? 0.25
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g)
    g.connect(master)
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
  },

  // --- named SFX ------------------------------------------------------------
  tap() {
    this.tone(220, 0.06, { type: 'triangle', gain: 0.12, slideTo: 180 })
  },
  select() {
    this.tone(440, 0.05, { type: 'square', gain: 0.14 })
  },
  correct() {
    // bright rising arpeggio
    this.tone(523, 0.09, { type: 'square', gain: 0.2 })
    this.tone(659, 0.09, { type: 'square', gain: 0.2, delay: 0.08 })
    this.tone(784, 0.14, { type: 'square', gain: 0.22, delay: 0.16 })
  },
  wrong() {
    // soft, non-punishing "womp" — a gentle downward blip, never harsh
    this.tone(300, 0.16, { type: 'sine', gain: 0.18, slideTo: 180 })
  },
  combo(level: number) {
    const base = 500 + Math.min(level, 8) * 70
    this.tone(base, 0.07, { type: 'square', gain: 0.2 })
    this.tone(base * 1.5, 0.09, { type: 'square', gain: 0.16, delay: 0.05 })
  },
  coin() {
    this.tone(988, 0.05, { type: 'square', gain: 0.18 })
    this.tone(1319, 0.12, { type: 'square', gain: 0.18, delay: 0.05 })
  },
  levelUp() {
    const notes = [523, 659, 784, 1047]
    notes.forEach((n, i) => this.tone(n, 0.16, { type: 'square', gain: 0.24, delay: i * 0.1 }))
  },
  streak() {
    this.tone(392, 0.1, { type: 'sawtooth', gain: 0.16 })
    this.tone(587, 0.14, { type: 'sawtooth', gain: 0.18, delay: 0.08 })
  },
  whoosh() {
    this.tone(600, 0.22, { type: 'sine', gain: 0.12, slideTo: 120 })
  },
}
