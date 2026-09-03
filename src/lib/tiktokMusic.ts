// tiktokMusic — the app's own soundtrack, rendered offline as a bed under the
// narration of a TikTok post.
//
// The live engine (juice/music.ts) schedules onto the app's single
// AudioContext with a lookahead timer, which is the right shape for a room
// you walk into and the wrong one for a file: a render wants every note of
// N seconds scheduled at once into an OfflineAudioContext. Rather than teach
// the live engine to swap contexts under a running scheduler, this is a BED
// ARRANGEMENT of the same tunes — the same note data from data/music.ts,
// played as pad + arpeggio + a soft bell lead, with no drums and no bass,
// because a bed under a voice wants harmony and air, not a kick. It is
// deliberately the app's own music: a viewer who plays the game later walks
// into the room and hears the tune again.
//
// Admin-only, dynamically imported by the renderer's caller; never in the
// player bundle.

import { TRACKS, type TrackDef } from '@/data/music'

const NOTE_RE = /^([A-G])([#b]?)(\d)$/
const CHORD_RE = /^([A-G][#b]?)(\d)(m7|maj7|sus|m|7)?$/
const PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const QUALITY: Record<string, number[]> = {
  '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], sus: [0, 5, 7],
}

function noteMidi(tok: string): number | null {
  const m = NOTE_RE.exec(tok)
  if (!m) return null
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0
  return (Number(m[3]) + 1) * 12 + PITCH[m[1]] + acc
}
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)

function parseMelody(seq: string) {
  return seq.trim().split(/\s+/).map((tok) => {
    const [n, d] = tok.split(':')
    return { midi: n === '-' ? null : noteMidi(n), beats: d === undefined ? 1 : Number(d) }
  })
}
function parseChords(seq: string) {
  return seq.trim().split(/\s+/).map((tok) => {
    const [c, d] = tok.split(':')
    const m = CHORD_RE.exec(c)
    const root = m ? noteMidi(m[1] + m[2]) : null
    const tones = (QUALITY[(m && m[3]) || ''] ?? QUALITY['']).map((s) => (root ?? 60) + s)
    return { root: root ?? 60, tones, beats: d === undefined ? 4 : Number(d) }
  })
}

function impulse(c: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds)
  const buf = c.createBuffer(2, len, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    // Deterministic noise so two renders of the same bed are identical.
    let seed = 1234 + ch * 77
    for (let i = 0; i < len; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0
      const r = (seed / 4294967296) * 2 - 1
      d[i] = r * Math.pow(1 - i / len, decay)
    }
  }
  return buf
}

interface Graph { c: OfflineAudioContext; dry: GainNode; send: GainNode }

function struck(g: Graph, frequency: number, t: number, ring: number, peak: number, partials: number[]) {
  partials.forEach((mix, i) => {
    const osc = g.c.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(frequency * (i + 1), t)
    const gain = g.c.createGain()
    const decay = ring / (i + 1.4)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(Math.max(peak * mix, 0.0002), t + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + decay)
    osc.connect(gain); gain.connect(g.dry); gain.connect(g.send)
    osc.start(t); osc.stop(t + decay + 0.05)
  })
}

function pad(g: Graph, tones: number[], t: number, dur: number, mix: number) {
  const attack = Math.min(0.9, dur * 0.35)
  for (const midi of tones) {
    for (const cents of [-7, 7]) {
      const osc = g.c.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(hz(midi + 12), t)
      osc.detune.setValueAtTime(cents, t)
      const lp = g.c.createBiquadFilter()
      lp.type = 'lowpass'; lp.frequency.value = 900
      const gain = g.c.createGain()
      const peak = 0.035 * mix
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.linearRampToValueAtTime(peak, t + attack)
      gain.gain.setValueAtTime(peak, t + Math.max(attack, dur - 0.5))
      gain.gain.linearRampToValueAtTime(0.0001, t + dur)
      osc.connect(lp); lp.connect(gain); gain.connect(g.dry); gain.connect(g.send)
      osc.start(t); osc.stop(t + dur + 0.05)
    }
  }
}

function arp(g: Graph, tones: number[], t: number, dur: number, spb: number) {
  const step = spb / 2
  const n = Math.max(1, Math.floor(dur / step))
  for (let i = 0; i < n; i++) {
    const midi = tones[i % tones.length] + 12 + (Math.floor(i / tones.length) % 2) * 12
    struck(g, hz(midi), t + i * step, step * 1.8, 0.028, [1, 0.2])
  }
}

/**
 * Render `seconds` of a track as a mono Float32Array at `sampleRate`, as a
 * bed: pad, arpeggio and a soft bell lead, reverb, no drums, no bass.
 * Unknown ids fall back to the first track rather than throwing — a post
 * without music is a worse failure than a post with the wrong tune.
 */
export async function renderBed(trackId: string, seconds: number, sampleRate = 48000): Promise<Float32Array> {
  const def: TrackDef = TRACKS.find((t) => t.id === trackId) ?? TRACKS[0]
  const c = new OfflineAudioContext(1, Math.ceil(seconds * sampleRate), sampleRate)
  const bus = c.createGain(); bus.gain.value = 1; bus.connect(c.destination)
  const dry = c.createGain(); dry.gain.value = 1; dry.connect(bus)
  const verb = c.createConvolver(); verb.buffer = impulse(c, 2.4, 2.8)
  const wet = c.createGain(); wet.gain.value = 0.9; verb.connect(wet); wet.connect(bus)
  const send = c.createGain(); send.gain.value = Math.max(def.reverb, 0.35); send.connect(verb)
  const g: Graph = { c, dry, send }

  const spb = 60 / def.bpm
  const melody = parseMelody(def.melody)
  const chords = parseChords(def.chords)
  const padMix = Math.max(def.pad, 0.6)

  let beat = 0, idx = 0
  while (beat * spb < seconds && melody.length) {
    const ev = melody[idx]
    if (ev.midi != null) struck(g, hz(ev.midi), beat * spb, Math.min(ev.beats * spb + 1.4, 3.2), 0.07, [1, 0.3, 0.14, 0.06])
    beat += ev.beats; idx = (idx + 1) % melody.length
  }
  beat = 0; idx = 0
  while (beat * spb < seconds && chords.length) {
    const ev = chords[idx]
    const t = beat * spb, dur = ev.beats * spb
    pad(g, ev.tones, t, dur, padMix)
    if (def.arp) arp(g, ev.tones, t, dur, spb)
    beat += ev.beats; idx = (idx + 1) % chords.length
  }

  const out = await c.startRendering()
  const data = out.getChannelData(0)
  // Normalise to a known ceiling so the mix level in the renderer means the
  // same thing for every track.
  let peak = 0
  for (let i = 0; i < data.length; i += 8) peak = Math.max(peak, Math.abs(data[i]))
  const scale = peak > 0 ? 0.6 / peak : 1
  const copy = new Float32Array(data.length)
  for (let i = 0; i < data.length; i++) copy[i] = data[i] * scale
  return copy
}
