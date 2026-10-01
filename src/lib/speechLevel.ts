/**
 * How loud a voice plays — the ONE place it is decided.
 *
 * A post here can carry two speakers: the operator's own recording and
 * Tabitha's synthesised telling. Levelling one and not the other is the bug
 * this file exists to close, and it has now shipped in BOTH directions. His
 * half once rendered six decibels UNDER hers across fourteen scheduled
 * stories; after the recording chain was rebuilt it rendered 3.7 decibels
 * OVER her, because her level is whatever Gemini's text-to-speech happened
 * to return that run — measured 4.2 LU apart between two runs of the same
 * kind of telling, with nothing in the code touching it.
 *
 * Both failures land in the same place: `place: 'open'` puts the handover in
 * the first twenty seconds, the window that decides whether a short video is
 * distributed at all. So every speech track is brought to the layout's target
 * before it is mixed, and neither speaker's loudness depends on where it came
 * from.
 *
 * `SPEECH_TARGET` lives here rather than beside the listener for the same
 * reason: the renderer is what mixes, so the renderer's module is what owns
 * the number. Measure any change off the RENDER, never off the WAV — the
 * music bed sits under both voices and only the finished mix says what a
 * viewer hears.
 */
export const SPEECH_TARGET = { verse: 0.14, story: 0.26 } as const

/**
 * The gain that brings this track's SPEECH to `target`.
 *
 * Levelling to the peak (the first version of this) left a real voice well
 * under the music bed: a phone memo averages about -25 dB with peaks near 0,
 * where a synthesised reading averages -17. So the measure is the RMS of the
 * 10ms windows that sit above the recording's own noise floor — how loud the
 * talking is, not how loud the loudest consonant is.
 */
export function speechGain(samples: Float32Array, rate: number, target: number): { gain: number; floor: number; peak: number } {
  let peak = 0
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]))
  if (peak < 1e-4) return { gain: 1, floor: 0, peak }
  const hop = Math.round(rate * 0.01)
  const n = Math.floor(samples.length / hop)
  const rms = new Float32Array(n)
  for (let i = 0; i < n; i++) { let e = 0; for (let j = i * hop; j < (i + 1) * hop; j++) e += samples[j] * samples[j]; rms[i] = Math.sqrt(e / hop) }
  const sorted = Float32Array.from(rms).sort()
  const floor = sorted[Math.floor(n * 0.1)] ?? 0
  const speechThr = Math.max(floor * 3, peak * 0.02)
  let sum = 0, count = 0
  for (let i = 0; i < n; i++) if (rms[i] > speechThr) { sum += rms[i] * rms[i]; count++ }
  const speechRms = count ? Math.sqrt(sum / count) : peak / 3
  return { gain: Math.min(20, target / Math.max(speechRms, 1e-4)), floor, peak }
}

/** Soft knee from 0.7: a peak of 1.0 lands at 0.79, one of 2.0 at 0.91. */
export const knee = (x: number): number => {
  const a = Math.abs(x)
  const y = a <= 0.7 ? a : 0.7 + 0.3 * Math.tanh((a - 0.7) / 0.3)
  return x < 0 ? -y : y
}

/**
 * Level a track and do NOTHING else.
 *
 * Deliberately no trimming, which is what separates this from the listener's
 * own `trimAndLevel`: Tabitha's captions are timed against her samples, so
 * shortening them by a beat of leading silence would slide every word she
 * says off its own caption.
 */
export function levelSpeech(samples: Float32Array, rate: number, target: number): Float32Array {
  const { gain, peak } = speechGain(samples, rate, target)
  if (peak < 1e-4 || Math.abs(gain - 1) < 0.02) return samples
  const out = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i++) out[i] = knee(samples[i] * gain)
  return out
}
