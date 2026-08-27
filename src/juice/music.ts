// The music engine — background instrumentals, synthesized note by note with
// the Web Audio API. Same bargain as juice/sound.ts: nothing to ship, nothing
// to license, nothing to download, and every instrument is tunable in code.
// The tracks themselves live in data/music.ts.
//
// HOW IT PLAYS
// A setInterval can't be trusted to place a note — it drifts and it stutters
// under load. So the loop here only ever *schedules*: every tick it looks a
// third of a second into the future and books every note that starts before
// then directly on the audio clock, which is sample-accurate. The timer being
// late by 30ms changes nothing.
//
// Two tracks can be live at once, which is the whole point: moving from Study
// to Battle crossfades rather than cutting, so the app has one continuous
// score instead of eight songs that start and stop at you.
//
// Music has its own gain chain hanging off the shared AudioContext, so its
// volume and its mute are completely independent of the SFX bus — "music off,
// sounds on" is the setting most people actually want.

import { audioContext } from './sound'
import { TRACK_BY_ID, type DrumStyle, type LeadVoice, type TrackDef } from '@/data/music'

// --- tuning knobs -----------------------------------------------------------

/** How far ahead of the audio clock notes get booked. */
const LOOKAHEAD_S = 0.35
/** How often the scheduler wakes up. Must be well under LOOKAHEAD_S. */
const TICK_MS = 60
/** Crossfade between two places. Long enough to read as a segue, not a cut. */
const FADE_S = 1.4
/** Ceiling on the music bus. Background music that competes with the SFX is
 *  the thing people mute, so it sits deliberately low under a full-volume mix. */
const BUS_CEILING = 0.5

// --- note + chord notation --------------------------------------------------

const PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
// One digit for the octave, deliberately: it's what lets "D37" parse as D3
// dominant-7 instead of D, octave 37.
const NOTE_RE = /^([A-G])([#b]?)(\d)$/
const CHORD_RE = /^([A-G][#b]?)(\d)(m7|maj7|sus|m|7)?$/

const QUALITY: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  sus: [0, 5, 7],
}

function noteMidi(tok: string): number | null {
  const m = NOTE_RE.exec(tok)
  if (!m) return null
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0
  return (Number(m[3]) + 1) * 12 + PITCH[m[1]] + acc
}

function hz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

interface NoteEv {
  midi: number | null
  beats: number
}
interface ChordEv {
  root: number
  tones: number[]
  beats: number
}

function parseMelody(seq: string): NoteEv[] {
  return seq
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const [n, d] = tok.split(':')
      return { midi: n === '-' ? null : noteMidi(n), beats: d === undefined ? 1 : Number(d) }
    })
}

function parseChords(seq: string): ChordEv[] {
  return seq
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const [c, d] = tok.split(':')
      const m = CHORD_RE.exec(c)
      const root = m ? noteMidi(m[1] + m[2]) : null
      const tones = (QUALITY[(m && m[3]) || ''] ?? QUALITY['']).map((s) => (root ?? 60) + s)
      return { root: root ?? 60, tones, beats: d === undefined ? 4 : Number(d) }
    })
}

// --- the graph --------------------------------------------------------------

let ctx: AudioContext | null = null
let bus: GainNode | null = null // user volume + mute
let dry: GainNode | null = null
let wet: GainNode | null = null
let verb: ConvolverNode | null = null
let noise: AudioBuffer | null = null

let enabled = true
let volume = 0.55

/** iOS silences the whole Web Audio API with the hardware ring/silent switch,
 *  and most phones live on silent — so the soundtrack shipped, the intro card
 *  said "Music is on", and the phone said nothing. iOS 17's Audio Session API
 *  is the sanctioned opt-out: type 'playback' plays through the switch, the
 *  way any game with a score does. Claimed only while music is enabled — a
 *  'playback' session also takes audio focus (ducks Spotify/podcasts), and an
 *  app whose music you've turned off has no business doing either; 'ambient'
 *  keeps the SFX mixing politely and muted alongside everything else. */
function applyAudioSession(): void {
  try {
    const session = (navigator as { audioSession?: { type: string } }).audioSession
    if (session) session.type = enabled ? 'playback' : 'ambient'
  } catch {
    /* pre-17 iOS or a browser without the API — the switch wins there */
  }
}
/** A track asked for before audio was allowed to start, or while muted. */
let pending: string | null = null
let timer: ReturnType<typeof setInterval> | null = null
/** Set while the tab is hidden and we were the ones who suspended the context. */
let suspendedByUs = false

/** A reverb tail built from decaying noise. A real chapel impulse would be a
 *  file, which is the one thing this module is here to avoid; two seconds of
 *  shaped noise gets most of the way and costs nothing to ship. */
function impulse(c: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.max(1, Math.floor(c.sampleRate * seconds))
  const buf = c.createBuffer(2, len, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
    }
  }
  return buf
}

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noise) return noise
  const len = Math.floor(c.sampleRate * 0.5)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  noise = buf
  return buf
}

/** Set once Web Audio has proved unusable, so we stop retrying on every tick. */
let broken = false

function ensure(): boolean {
  if (bus) return true
  if (broken) return false
  try {
    return build()
  } catch (err) {
    // A browser with Web Audio blocked, stubbed or half-implemented should cost
    // the player their music and nothing else. This runs at mount and on every
    // route change, so an exception escaping here white-screens the whole app —
    // which is exactly what it did the first time the test harness handed the
    // app a broken AudioContext.
    broken = true
    console.warn('[music] disabled — the audio graph is unavailable', err)
    return false
  }
}

function build(): boolean {
  const c = audioContext()
  if (!c) return false
  ctx = c
  bus = c.createGain()
  bus.gain.value = enabled ? volume * BUS_CEILING : 0
  bus.connect(c.destination)

  dry = c.createGain()
  dry.gain.value = 1
  dry.connect(bus)

  verb = c.createConvolver()
  verb.buffer = impulse(c, 2.4, 2.8)
  wet = c.createGain()
  wet.gain.value = 0.9
  verb.connect(wet)
  wet.connect(bus)
  return true
}

// --- instruments ------------------------------------------------------------

interface Deck {
  def: TrackDef
  gain: GainNode
  send: GainNode
  /** Audio-clock time of beat 0 of the loop. */
  t0: number
  spb: number // seconds per beat
  melody: { events: NoteEv[]; idx: number; beat: number }
  chords: { events: ChordEv[]; idx: number; beat: number }
  /** Next half-beat position the drum grid is scheduled to. */
  drumBeat: number
  /** Set when this deck is fading out; it stops taking new notes. */
  deadAt: number | null
}

let decks: Deck[] = []
let currentId: string | null = null
let listeners: Array<(id: string | null) => void> = []

function tone(
  deck: Deck,
  type: OscillatorType,
  frequency: number,
  t: number,
  dur: number,
  peak: number,
  opts: { detune?: number; cutoff?: number; vibrato?: number } = {},
): void {
  if (!ctx) return
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(frequency, t)
  if (opts.detune) osc.detune.setValueAtTime(opts.detune, t)

  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + 0.015)
  g.gain.setValueAtTime(Math.max(peak, 0.0002), t + Math.max(0.02, dur * 0.6))
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)

  let node: AudioNode = osc
  if (opts.cutoff) {
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = opts.cutoff
    osc.connect(lp)
    node = lp
  }
  node.connect(g)
  g.connect(deck.gain)
  g.connect(deck.send)

  if (opts.vibrato) {
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 5.2
    const depth = ctx.createGain()
    depth.gain.value = opts.vibrato
    lfo.connect(depth)
    depth.connect(osc.detune)
    lfo.start(t)
    lfo.stop(t + dur + 0.05)
  }

  osc.start(t)
  osc.stop(t + dur + 0.05)
}

/** A struck note that rings and fades — sine stack, no sustain. Used for the
 *  bell and pluck leads and for the arpeggio. */
function struck(deck: Deck, frequency: number, t: number, ring: number, peak: number, partials: number[]): void {
  if (!ctx) return
  partials.forEach((mix, i) => {
    const osc = ctx!.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(frequency * (i + 1), t)
    const g = ctx!.createGain()
    const decay = ring / (i + 1.4) // upper partials die first, like a real bar
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(Math.max(peak * mix, 0.0002), t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay)
    osc.connect(g)
    g.connect(deck.gain)
    g.connect(deck.send)
    osc.start(t)
    osc.stop(t + decay + 0.05)
  })
}

function playLead(deck: Deck, midi: number, t: number, dur: number, kind: LeadVoice): void {
  const f = hz(midi)
  if (kind === 'square') {
    tone(deck, 'square', f, t, dur, 0.085, { cutoff: 2400, vibrato: 5 })
    tone(deck, 'triangle', f, t, dur, 0.05, { detune: 7 })
  } else if (kind === 'pluck') {
    struck(deck, f, t, Math.min(dur + 0.5, 1.6), 0.12, [1, 0.28, 0.1])
    tone(deck, 'triangle', f, t, Math.min(dur, 0.9), 0.035)
  } else {
    struck(deck, f, t, Math.min(dur + 1.4, 3.2), 0.115, [1, 0.3, 0.14, 0.06])
  }
}

function playBass(deck: Deck, root: number, t: number, dur: number): void {
  // Root two octaves under the chord voicing, so it sits below the pad rather
  // than inside it.
  tone(deck, 'triangle', hz(root - 12), t, dur, 0.16, { cutoff: 420 })
}

function playPad(deck: Deck, tones: number[], t: number, dur: number, mix: number): void {
  if (!ctx || mix <= 0) return
  const attack = Math.min(0.9, dur * 0.35)
  for (const midi of tones) {
    for (const cents of [-7, 7]) {
      const osc = ctx.createOscillator()
      osc.type = 'sawtooth'
      // Voiced an octave above the written chord — down at octave 3 a saw pad
      // turns to mud under the bass.
      osc.frequency.setValueAtTime(hz(midi + 12), t)
      osc.detune.setValueAtTime(cents, t)
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 1100
      const g = ctx.createGain()
      const peak = 0.035 * mix
      g.gain.setValueAtTime(0.0001, t)
      g.gain.linearRampToValueAtTime(peak, t + attack)
      g.gain.setValueAtTime(peak, t + Math.max(attack, dur - 0.5))
      g.gain.linearRampToValueAtTime(0.0001, t + dur)
      osc.connect(lp)
      lp.connect(g)
      g.connect(deck.gain)
      g.connect(deck.send)
      osc.start(t)
      osc.stop(t + dur + 0.05)
    }
  }
}

function playArp(deck: Deck, tones: number[], t: number, dur: number, spb: number): void {
  // Eighth notes climbing the chord — the harp under everything else.
  const step = spb / 2
  const n = Math.max(1, Math.floor(dur / step))
  for (let i = 0; i < n; i++) {
    const midi = tones[i % tones.length] + 12 + (Math.floor(i / tones.length) % 2) * 12
    struck(deck, hz(midi), t + i * step, step * 1.8, 0.032, [1, 0.2])
  }
}

function playDrum(deck: Deck, kind: 'kick' | 'hat' | 'snare', t: number): void {
  if (!ctx) return
  if (kind === 'kick') {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(125, t)
    osc.frequency.exponentialRampToValueAtTime(44, t + 0.12)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
    osc.connect(g)
    g.connect(deck.gain)
    osc.start(t)
    osc.stop(t + 0.2)
    return
  }
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(ctx)
  const f = ctx.createBiquadFilter()
  const g = ctx.createGain()
  if (kind === 'hat') {
    f.type = 'highpass'
    f.frequency.value = 7000
    g.gain.setValueAtTime(0.035, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
  } else {
    f.type = 'bandpass'
    f.frequency.value = 1900
    g.gain.setValueAtTime(0.09, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14)
  }
  src.connect(f)
  f.connect(g)
  g.connect(deck.gain)
  g.connect(deck.send)
  // start before stop — stop() on a source that hasn't started is an
  // InvalidStateError, and one bad hi-hat took the whole tick down with it.
  src.start(t)
  src.stop(t + (kind === 'hat' ? 0.06 : 0.16))
}

/** Which drum hits land on a given half-beat of the bar. */
function drumHits(style: DrumStyle, posInBar: number, beatsPerBar: number): Array<'kick' | 'hat' | 'snare'> {
  if (style === 'none') return []
  const onBeat = Math.abs(posInBar % 1) < 1e-6
  const hits: Array<'kick' | 'hat' | 'snare'> = []
  if (style === 'soft') {
    if (posInBar === 0 || posInBar === Math.floor(beatsPerBar / 2)) hits.push('kick')
    if (onBeat) hits.push('hat')
  } else {
    if (posInBar === 0 || posInBar === Math.floor(beatsPerBar / 2)) hits.push('kick')
    if (posInBar === 1 || posInBar === beatsPerBar - 1) hits.push('snare')
    hits.push('hat') // every half beat
  }
  return hits
}

// --- decks + scheduling -----------------------------------------------------

function makeDeck(def: TrackDef, startAt: number): Deck | null {
  if (!ctx || !dry || !verb) return null
  const gain = ctx.createGain()
  gain.gain.value = 0
  gain.connect(dry)
  const send = ctx.createGain()
  send.gain.value = def.reverb
  send.connect(verb)
  return {
    def,
    gain,
    send,
    t0: startAt,
    spb: 60 / def.bpm,
    melody: { events: parseMelody(def.melody), idx: 0, beat: 0 },
    chords: { events: parseChords(def.chords), idx: 0, beat: 0 },
    drumBeat: 0,
    deadAt: null,
  }
}

function scheduleDeck(deck: Deck, until: number): void {
  const { def, spb } = deck
  const at = (beat: number) => deck.t0 + beat * spb

  // Melody.
  while (at(deck.melody.beat) < until) {
    const ev = deck.melody.events[deck.melody.idx]
    if (!ev) break
    if (ev.midi != null) {
      playLead(deck, ev.midi, at(deck.melody.beat), ev.beats * spb * 0.92, def.lead)
    }
    deck.melody.beat += ev.beats
    deck.melody.idx = (deck.melody.idx + 1) % deck.melody.events.length
  }

  // Chords carry the pad, the bass and the arpeggio — one stream, three parts,
  // because they all change exactly when the harmony does.
  while (at(deck.chords.beat) < until) {
    const ev = deck.chords.events[deck.chords.idx]
    if (!ev) break
    const t = at(deck.chords.beat)
    const dur = ev.beats * spb
    if (def.pad > 0) playPad(deck, ev.tones, t, dur, def.pad)
    if (def.bass) playBass(deck, ev.root, t, dur * 0.9)
    if (def.arp) playArp(deck, ev.tones, t, dur, spb)
    deck.chords.beat += ev.beats
    deck.chords.idx = (deck.chords.idx + 1) % deck.chords.events.length
  }

  // Drums on a half-beat grid.
  if (def.drums !== 'none') {
    while (at(deck.drumBeat) < until) {
      const posInBar = deck.drumBeat % def.beatsPerBar
      for (const hit of drumHits(def.drums, posInBar, def.beatsPerBar)) {
        playDrum(deck, hit, at(deck.drumBeat))
      }
      deck.drumBeat += 0.5
    }
  }
}

function tick(): void {
  if (!ctx) return
  const now = ctx.currentTime
  const until = now + LOOKAHEAD_S
  for (const deck of decks) {
    // A fading deck takes no new notes — what's already booked rides the fade out.
    if (deck.deadAt == null) scheduleDeck(deck, until)
  }
  const before = decks.length
  decks = decks.filter((d) => {
    if (d.deadAt == null || now < d.deadAt) return true
    try {
      d.gain.disconnect()
      d.send.disconnect()
    } catch {
      /* already gone */
    }
    return false
  })
  if (decks.length !== before && decks.length === 0) stopTimer()
}

function startTimer(): void {
  if (timer) return
  timer = setInterval(tick, TICK_MS)
  tick()
}

function stopTimer(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}

function retire(deck: Deck, now: number, fade: number): void {
  deck.deadAt = now + fade + 0.4
  const g = deck.gain.gain
  g.cancelScheduledValues(now)
  g.setValueAtTime(g.value, now)
  g.linearRampToValueAtTime(0, now + fade)
}

function announce(): void {
  for (const cb of listeners) cb(currentId)
}

// --- public API -------------------------------------------------------------

export const Music = {
  /** The track that is (or should be) sounding right now. */
  current(): string | null {
    return currentId
  },

  /** Fires whenever the playing track changes. Returns an unsubscribe. */
  onTrack(cb: (id: string | null) => void): () => void {
    listeners.push(cb)
    return () => {
      listeners = listeners.filter((l) => l !== cb)
    }
  },

  configure(opts: { enabled?: boolean; volume?: number }): void {
    if (opts.enabled !== undefined) enabled = opts.enabled
    if (opts.volume !== undefined) volume = opts.volume
    applyAudioSession()
    // Nothing built yet? The values above get picked up by ensure().
    if (!bus || !ctx) return
    const target = enabled ? volume * BUS_CEILING : 0
    const now = ctx.currentTime
    bus.gain.cancelScheduledValues(now)
    bus.gain.setValueAtTime(bus.gain.value, now)
    // Ramp rather than jump: a gain step on a sustaining pad is an audible click.
    bus.gain.linearRampToValueAtTime(target, now + 0.25)
    if (!enabled) {
      // Muting tears the decks down rather than playing silently forever —
      // a muted app should not be scheduling oscillators every 60ms.
      for (const d of decks) if (d.deadAt == null) retire(d, now, 0.25)
      currentId = null
      announce()
    }
  },

  /** Start (or crossfade to) a track. Safe to call with the same id repeatedly. */
  play(id: string): void {
    if (!enabled) {
      // Remember the intent so unmuting starts in the right place.
      currentId = null
      pending = id
      return
    }
    if (currentId === id) return
    if (!ensure() || !ctx) {
      pending = id
      return
    }
    const def = TRACK_BY_ID[id]
    if (!def) return
    if (ctx.state === 'suspended') {
      // No gesture yet. Hold it; unlock() will pick it up.
      pending = id
      return
    }
    const now = ctx.currentTime
    for (const d of decks) if (d.deadAt == null) retire(d, now, FADE_S)
    const deck = makeDeck(def, now + 0.06)
    if (!deck) return
    deck.gain.gain.setValueAtTime(0, now)
    deck.gain.gain.linearRampToValueAtTime(1, now + FADE_S)
    decks.push(deck)
    currentId = id
    pending = null
    startTimer()
    announce()
  },

  /** Fade everything out and stop scheduling. */
  stop(): void {
    if (!ctx) return
    const now = ctx.currentTime
    for (const d of decks) if (d.deadAt == null) retire(d, now, 0.6)
    currentId = null
    announce()
  },

  /** Called on the first real user gesture — browsers refuse to start audio
   *  before one. Picks up whatever track was asked for in the meantime. */
  unlock(): void {
    if (!ensure() || !ctx) return
    const kick = () => {
      const want = pending
      if (want && enabled) {
        pending = null
        // currentId is stale (we never actually started), so force it through.
        currentId = null
        this.play(want)
      }
    }
    if (ctx.state === 'suspended') {
      // resume() is async — play() before it settles sees 'suspended' and just
      // re-parks the track as pending, which dropped the first room's music.
      ctx.resume().then(kick, () => {})
    } else {
      kick()
    }
  },

  /** Tab hidden / app backgrounded. Freezes the audio clock, which is what
   *  keeps the loop from lurching forward while nobody is listening. */
  pause(): void {
    if (!ctx || decks.length === 0) return
    if (ctx.state === 'running') {
      void ctx.suspend()
      suspendedByUs = true
    }
  },

  resume(): void {
    if (!ctx) return
    if (suspendedByUs && ctx.state === 'suspended') void ctx.resume()
    suspendedByUs = false
  },

  /** Test seam: what the scheduler thinks is live. */
  debug(): { decks: number; current: string | null; state: string | null } {
    return { decks: decks.length, current: currentId, state: ctx?.state ?? null }
  },
}
