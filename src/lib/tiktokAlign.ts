// tiktokAlign — word timings for the captions, from the audio itself.
//
// Gemini TTS returns no word timings, and the energy heuristic in
// tiktokRender (`timeWords`) gets close but not exact — a caption that lights
// a word a beat before or after it is said reads as wrong, and the whole
// point of the highlight is that it lands. So the reading is transcribed
// with Whisper (tiny.en, exported with cross-attentions, so it yields
// word-level timestamps) IN THE BROWSER through transformers.js, and the
// recognised words are matched back onto the caption's own words.
//
// The text is known in advance, which is what makes a tiny model enough: the
// transcript only has to be close enough to line up, never to be read. Words
// Whisper drops or mangles are interpolated between their matched
// neighbours; anything that fails (no model, no network, an unsupported
// browser) falls back to the heuristic, so a post is never blocked on this.
//
// Admin-only, dynamically imported by the renderer; the model (~40MB
// quantised) downloads on first use and is cached by the browser.

import type { TimedPhrase, TimedWord } from './tiktokRender'

const MODEL = 'onnx-community/whisper-tiny.en_timestamped'
const RATE = 16000

interface Chunk { text: string; timestamp: [number, number | null] }

type Asr = (audio: Float32Array, opts: Record<string, unknown>) => Promise<{ text: string; chunks?: Chunk[] }>
let asrPromise: Promise<Asr> | null = null

async function loadAsr(onProgress?: (label: string) => void): Promise<Asr> {
  if (!asrPromise) {
    asrPromise = (async () => {
      const tf = await import('@huggingface/transformers')
      // WebGPU where it exists (Chrome on a desktop), WASM otherwise. The
      // quantised decoder is a quarter the size of fp32 and the timestamps
      // are the same to the frame on the readings tried.
      // `navigator.gpu` existing is not WebGPU working: headless and older
      // Chromes have the object and no adapter, so ask for one first.
      let device: 'webgpu' | 'wasm' = 'wasm'
      try {
        const gpu = typeof navigator !== 'undefined' ? (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu : undefined
        if (gpu && (await gpu.requestAdapter())) device = 'webgpu'
      } catch { /* wasm */ }
      let lastPct = -1
      const make = (dev: 'webgpu' | 'wasm') => tf.pipeline('automatic-speech-recognition', MODEL, {
        device: dev,
        dtype: { encoder_model: 'fp32', decoder_model_merged: 'q8' },
        // Only the two model files are worth a progress line; the tokenizer
        // and configs are kilobytes and fire the callback dozens of times.
        progress_callback: (p: { status?: string; file?: string; progress?: number }) => {
          if (p.status !== 'progress' || !p.file?.endsWith('.onnx') || !onProgress) return
          const pct = Math.round(p.progress ?? 0)
          if (pct === lastPct) return
          lastPct = pct
          onProgress(`Fetching the listener (once) · ${p.file.split('/').pop()} ${pct}%`)
        },
      })
      try { return (await make(device)) as unknown as Asr } catch (e) {
        if (device === 'wasm') throw e
        return (await make('wasm')) as unknown as Asr
      }
    })()
    asrPromise.catch(() => { asrPromise = null })
  }
  return asrPromise
}

function resample(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return samples
  const n = Math.floor((samples.length * to) / from)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i * from) / to, j = Math.floor(x), f = x - j
    out[i] = samples[j] * (1 - f) + (samples[Math.min(samples.length - 1, j + 1)] ?? 0) * f
  }
  return out
}

const NUMBERS: Record<string, string> = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', first: '1', second: '2', third: '3' }
function norm(w: string): string {
  const s = w.toLowerCase().replace(/[^a-z0-9']/g, '').replace(/'/g, '')
  return NUMBERS[s] ?? s
}

/**
 * Match the caption's words onto Whisper's, longest-common-subsequence over
 * normalised tokens. Returns, per caption word, the index of the recognised
 * word it matched, or -1.
 */
function match(ours: string[], theirs: string[]): number[] {
  const a = ours.map(norm), b = theirs.map(norm)
  const m = a.length, n = b.length
  const dp: Int32Array[] = Array.from({ length: m + 1 }, () => new Int32Array(n + 1))
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) {
    dp[i][j] = a[i] && a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  }
  const out = new Array<number>(m).fill(-1)
  let i = 0, j = 0
  while (i < m && j < n) {
    if (a[i] && a[i] === b[j]) { out[i] = j; i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }
  return out
}

/**
 * Re-time every phrase's words from the audio. `phrases` carry the caption
 * text (their existing timings are the fallback); the result has each word
 * where Whisper heard it, phrase boundaries derived from the words, and each
 * phrase held until the next begins. Throws when the transcript cannot be
 * lined up at all, so the caller keeps the heuristic.
 */
export async function alignWords(samples: Float32Array, sampleRate: number, phrases: TimedPhrase[], onProgress?: (label: string) => void): Promise<TimedPhrase[]> {
  const asr = await loadAsr(onProgress)
  onProgress?.('Listening to the reading')
  const audio = resample(samples, sampleRate, RATE)
  const res = await asr(audio, { return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5 })
  const heard = (res.chunks ?? []).filter((c) => c.text.trim() && c.timestamp[0] != null)
  if (heard.length < 3) throw new Error('heard too little')
  const audioDur = samples.length / sampleRate

  // Flatten the caption into words, remembering which phrase each is in.
  const words: Array<{ text: string; phrase: number }> = []
  phrases.forEach((p, pi) => { for (const t of p.text.split(/\s+/).filter(Boolean)) words.push({ text: t, phrase: pi }) })
  const hit = match(words.map((w) => w.text), heard.map((c) => c.text.trim()))
  const matched = hit.filter((h) => h >= 0).length
  if (matched < Math.max(3, words.length * 0.5)) throw new Error(`only ${matched} of ${words.length} words lined up`)

  // Anchor matched words; interpolate the rest between their neighbours.
  const start = new Float64Array(words.length).fill(-1)
  const end = new Float64Array(words.length).fill(-1)
  hit.forEach((h, i) => { if (h >= 0) { start[i] = heard[h].timestamp[0]; end[i] = heard[h].timestamp[1] ?? heard[h].timestamp[0] + 0.25 } })
  for (let i = 0; i < words.length; i++) {
    if (start[i] >= 0) continue
    let lo = i - 1; while (lo >= 0 && start[lo] < 0) lo--
    let hi = i + 1; while (hi < words.length && start[hi] < 0) hi++
    const from = lo >= 0 ? end[lo] : 0
    const to = hi < words.length ? start[hi] : Math.min(audioDur, from + 0.6 * (hi - lo))
    const gap = hi - lo, k = i - lo
    start[i] = from + ((to - from) * (k - 1)) / gap
    end[i] = from + ((to - from) * k) / gap
  }
  // Whisper stamps the first word at 0.00 whatever the lead-in silence, so
  // the first word starts no earlier than the first sound.
  let onset = 0
  while (onset < samples.length && Math.abs(samples[onset]) < 0.02) onset++
  if (words.length) start[0] = Math.max(start[0], onset / sampleRate - 0.05)
  // Monotonic, and a word is never shorter than a frame.
  for (let i = 0; i < words.length; i++) {
    if (i > 0 && start[i] < end[i - 1]) start[i] = end[i - 1]
    if (end[i] < start[i] + 0.04) end[i] = start[i] + 0.04
  }

  const out: TimedPhrase[] = phrases.map((p) => ({ ...p, words: [] as TimedWord[] }))
  words.forEach((w, i) => out[w.phrase].words!.push({ text: w.text, start: start[i], end: end[i] }))
  out.forEach((p, pi) => {
    const ws = p.words!
    if (!ws.length) return
    p.start = ws[0].start
    const next = out.slice(pi + 1).find((q) => q.words!.length)
    p.end = next ? next.words![0].start : Math.min(audioDur, ws[ws.length - 1].end + 0.3)
    // The last word holds until the phrase ends, so it stays lit through the gap.
    ws[ws.length - 1].end = p.end
  })
  return out
}
