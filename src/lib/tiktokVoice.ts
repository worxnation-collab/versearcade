// tiktokVoice — the operator's own recording of the verse, prepared for the
// verse post.
//
// The morning post is Gemini's voice unless a person's is parked for the
// date. The person records a voice memo on a phone — the verse, a beat of
// silence, then thirty seconds or so of their own thought about it — and the
// hub turns that into what the renderer needs, HERE, in the operator's tab:
//
//   1. Decode whatever the phone produced (m4a, mp3, wav, webm, ogg) and
//      re-encode it as a mono WAV, so the bucket holds one known format and
//      the renderer's decoder never meets a codec it can't read.
//   2. Transcribe it with the same Whisper the captions already use
//      (lib/tiktokAlign), then find the VERSE inside the transcript by
//      matching the verse's own words onto it — the verse is known text, so
//      it is captioned from the text and only timed from the audio, exactly
//      as Gemini's reading is.
//   3. Everything heard after the verse is the THOUGHT: words nobody had in
//      advance, so the transcript itself is the caption. Whisper tiny gets a
//      word wrong now and then, which is why the hub shows the transcript
//      for the operator to correct before the post is made; `refit` puts the
//      corrected words back onto the timings Whisper heard.
//
// The result is parked as days/<date>/voice-verse.json next to the WAV, and
// the renderer reads the timings from it rather than listening again — so
// the morning runner needs no Whisper at all on a voiced day, and the video
// it makes at 07:00 is captioned by the words the operator approved.

import type { TimedWord } from './tiktokRender'
// tiktokAlign loads the Whisper runtime lazily, inside `transcribe`, so this
// import costs nothing until a recording is actually listened to.
import { transcribe, fitWords, onsetOf } from './tiktokAlign'

/** What the hub parks beside the WAV, and what the renderer reads. */
export interface VoiceTrack {
  /** The recording's length. */
  seconds: number
  /** The verse's own words, timed to where the operator said them. */
  verse: TimedWord[]
  /** The thought's words as approved (or as heard), timed. */
  thought: TimedWord[]
  /** The thought as Whisper heard it — the timings `refit` puts corrected words onto. */
  heard: TimedWord[]
  /** The thought's text, one line. */
  text: string
  /** How many of the verse's words were actually heard, for the hub's confidence line. */
  verseMatched: number
  /**
   * For a story recording, which end of the telling it belongs at — 'open'
   * introduces Tabitha and hands over, 'close' answers her. Absent on every
   * recording parked before introductions existed, and on every VERSE
   * recording, where it means nothing; both read as 'close', so nothing
   * already on disk moves.
   */
  place?: 'open' | 'close'
  at: string
}

// A recording keeps 48 kHz: it is a real voice with a top octave, where
// Gemini's reading is born at 24 kHz. Downsampling the first real memo to
// 24 kHz was one of the three things that made it sound dull under the bed.
const OUT_RATE = 48000

/**
 * How loud a levelled recording ends up, as the RMS of its speech.
 *
 * There are TWO of these because there are two layouts and only one of them
 * ever has a second voice in it. On the VERSE post the maker's reading IS the
 * audio — nothing else speaks, so any sane level reads as correct. On the
 * STORY his half plays directly against Tabitha's telling, and that telling
 * is not where this constant said it was: measured off the shipped MP4s, her
 * half renders at -13.2 LUFS against his -19.4, a step of six decibels at the
 * exact moment a viewer decides whether to keep watching (every scheduled
 * story is `place: 'open'`, so he is the first fourteen seconds).
 *
 * The original 0.14 was calibrated against Gemini's VERSE readings and is
 * right for that layout. It was then applied to the story half by inheritance
 * rather than by measurement, which is the whole bug: one number describing
 * two different neighbourhoods.
 *
 * Measured, not guessed — and measured off the RENDER rather than the WAV,
 * because the music bed sits under both voices and only the finished mix says
 * what a viewer hears.
 */
export const SPEECH_TARGET = { verse: 0.14, story: 0.26 } as const

/**
 * Decode an uploaded recording to mono samples at 48 kHz, and a WAV of the
 * same. `target` is the speech loudness to land on — pass the story's when
 * the recording is going to play beside Tabitha, or his half arrives six
 * decibels under her.
 */
export async function decodeRecording(file: Blob, target: number = SPEECH_TARGET.verse): Promise<{ samples: Float32Array; sampleRate: number; wav: Blob; seconds: number }> {
  const buf = await file.arrayBuffer()
  // Decode at whatever rate the file has, then resample through an offline
  // graph to the one rate the bucket holds.
  const probe = new OfflineAudioContext(1, 1, 48000)
  const decoded = await probe.decodeAudioData(buf.slice(0))
  const frames = Math.ceil(decoded.duration * OUT_RATE)
  const off = new OfflineAudioContext(1, frames, OUT_RATE)
  const src = off.createBufferSource()
  src.buffer = decoded
  src.connect(off.destination)
  src.start()
  const rendered = await off.startRendering()
  const samples = trimAndLevel(rendered.getChannelData(0), OUT_RATE, target)
  return { samples, sampleRate: OUT_RATE, wav: wavBlob(samples, OUT_RATE), seconds: samples.length / OUT_RATE }
}

/**
 * A phone memo starts with a second of fumbling and comes in at whatever
 * level the room was — and a real voice is DYNAMIC: the first five memos
 * averaged -25 dB with peaks near 0, where Gemini's readings average -17.
 * Levelling to the peak (the first version) left the voice well under the
 * music bed. So the level is set by the LOUDNESS of the speech — the RMS of
 * the samples above the recording's noise floor — brought to Gemini's,
 * with a soft knee over the peaks so the loud words don't clip. Then the
 * silence at both ends is trimmed to a short beat.
 */
function trimAndLevel(samples: Float32Array, rate: number, target: number): Float32Array {
  let peak = 0
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]))
  if (peak < 1e-4) return samples
  // Speech loudness: RMS over 10ms windows that sit above the noise floor.
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
  const gain = Math.min(20, target / Math.max(speechRms, 1e-4))
  // Soft knee from 0.7: a peak of 1.0 lands at 0.79, one of 2.0 at 0.91.
  const knee = (x: number) => { const a = Math.abs(x); const y = a <= 0.7 ? a : 0.7 + 0.3 * Math.tanh((a - 0.7) / 0.3); return x < 0 ? -y : y }
  const thr = Math.max(0.02 / gain, floor * 2)
  let a = 0; while (a < samples.length && Math.abs(samples[a]) < thr) a++
  let b = samples.length; while (b > a && Math.abs(samples[b - 1]) < thr) b--
  const pad = Math.round(0.25 * rate)
  a = Math.max(0, a - pad); b = Math.min(samples.length, b + Math.round(0.6 * rate))
  const out = new Float32Array(b - a)
  for (let i = a; i < b; i++) out[i - a] = knee(samples[i] * gain)
  return out
}

function wavBlob(samples: Float32Array, rate: number): Blob {
  const data = new DataView(new ArrayBuffer(44 + samples.length * 2))
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); data.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE')
  str(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true)
  data.setUint32(24, rate, true); data.setUint32(28, rate * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true)
  str(36, 'data'); data.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) data.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true)
  return new Blob([data.buffer], { type: 'audio/wav' })
}

// "17" as Whisper may write it when it is said aloud.
const NUMBER_WORDS: Record<string, string[]> = {
  '1': ['one', 'first'], '2': ['two', 'second'], '3': ['three', 'third'], '4': ['four', 'fourth'], '5': ['five', 'fifth'], '6': ['six', 'sixth'], '7': ['seven', 'seventh'], '8': ['eight', 'eighth'], '9': ['nine', 'ninth'], '10': ['ten', 'tenth'],
  '11': ['eleven'], '12': ['twelve'], '13': ['thirteen'], '14': ['fourteen'], '15': ['fifteen'], '16': ['sixteen'], '17': ['seventeen'], '18': ['eighteen'], '19': ['nineteen'], '20': ['twenty'], '21': ['twentyone'], '22': ['twentytwo'], '23': ['twentythree'], '24': ['twentyfour'], '25': ['twentyfive'], '30': ['thirty'], '31': ['thirtyone'], '40': ['forty'], '50': ['fifty'],
}

/** Whisper writes lowercase runs after a pause; the caption reads better with sentences. */
function sentenceCase(words: string[]): string[] {
  let cap = true
  return words.map((w) => {
    const out = cap ? w.charAt(0).toUpperCase() + w.slice(1) : w
    cap = /[.!?]["'”’)]?$/.test(w)
    return out
  })
}

/**
 * Split a decoded recording into the verse and the thought. The verse's
 * words are placed by matching them onto the transcript; the thought is
 * every heard word after the verse's last one, with a small guard so a
 * trailing "amen" or a re-take of the last clause is not swept into it.
 */
/**
 * Transcribe a recording one stretch of speech at a time. Whisper is run in
 * 30-second windows, and a long silence inside a window — exactly the beat
 * this recording is asked to leave between the verse and the thought — made
 * the tiny model stop early and swallow the eleven seconds of speech after
 * it (found on the first synthetic recording: "James writes to..." simply
 * never appeared). So the audio is cut on its own pauses first, neighbouring
 * runs are grouped into pieces of about twenty seconds, and each piece is
 * listened to on its own with its timestamps offset back. No window ever
 * contains a pause long enough to end it.
 */
const PIECE_MAX_SEC = 22

/** The recording's loudness every 10ms, its noise floor and its peak. */
function envelopeOf(samples: Float32Array, sampleRate: number) {
  const hop = Math.round(sampleRate * 0.01)
  const n = Math.floor(samples.length / hop)
  const rms = new Float32Array(n)
  for (let i = 0; i < n; i++) { let s = 0; for (let j = i * hop; j < (i + 1) * hop; j++) s += samples[j] * samples[j]; rms[i] = Math.sqrt(s / hop) }
  const sorted = Float32Array.from(rms).sort()
  const floor = sorted[Math.floor(sorted.length * 0.1)] ?? 0
  const peak = sorted[sorted.length - 1] ?? 0
  return { rms, floor, peak, speech: Math.max(floor * 3, peak * 0.02, 0.003) }
}

/**
 * Tile the WHOLE recording into pieces no longer than a Whisper window,
 * each cut at the quietest quarter-second between eight and twenty-two
 * seconds after the last cut. Nothing is ever skipped: an earlier version
 * kept only the stretches a silence detector called speech, and on a phone
 * memo the detector called a trailing "…faith when life gets uncomfortable"
 * silence and threw it away. A long pause inside that range is the
 * quietest thing in it, so the cut lands in the pause — which is also what
 * keeps a pause from ending a window early (see transcribePieces).
 */
export function tilePieces(samples: Float32Array, sampleRate: number): Array<[number, number]> {
  const { rms } = envelopeOf(samples, sampleRate)
  const total = rms.length * 0.01
  const out: Array<[number, number]> = []
  let a = 0
  while (total - a > PIECE_MAX_SEC) {
    let best = a + 12, bestE = Infinity
    for (let t = a + 8; t < a + PIECE_MAX_SEC; t += 0.05) {
      const i = Math.round(t / 0.01)
      let e = 0; for (let k = i; k < i + 25 && k < rms.length; k++) e += rms[k]
      if (e < bestE) { bestE = e; best = t }
    }
    out.push([a, best]); a = best
  }
  out.push([a, total])
  return out
}

/**
 * Transcribe a recording one piece at a time (`tilePieces`). Whisper is run
 * in 30-second windows, and a long silence inside a window — exactly the
 * beat this recording is asked to leave between the verse and the thought
 * — made the model stop early and swallow the speech after it (eleven
 * seconds of it on the first synthetic recording, half the thought on the
 * operator's first real one). Short pieces cut at the pauses keep a pause
 * out of the middle of a window; and when a piece still comes back with
 * speech left unheard at its end, that remainder is listened to again on
 * its own. Each piece is heard with a margin either side so a word that
 * straddles a cut is heard whole by one neighbour, and kept by the piece
 * its midpoint falls in.
 */
/** Every word at (nearly) the same instant: the timestamps failed, not the words. */
function collapsed(words: TimedWord[]): boolean {
  if (words.length < 3) return false
  const starts = new Set(words.map((w) => Math.round(w.start * 10)))
  return starts.size < Math.max(2, words.length / 2)
}
/** Words laid evenly over a span, weighted by their length — the fallback when no clock is sound. */
function spread(words: TimedWord[], seconds: number): TimedWord[] {
  const weights = words.map((w) => Math.max(1, w.text.replace(/[^a-z]/gi, '').length) + 1)
  const total = weights.reduce((a, b) => a + b, 0) || 1
  let t = 0.2
  return words.map((w, i) => { const d = ((seconds - 0.4) * weights[i]) / total; const out = { text: w.text, start: t, end: t + d }; t += d; return out })
}

async function transcribePieces(samples: Float32Array, sampleRate: number, onProgress?: (label: string) => void): Promise<TimedWord[]> {
  const env = envelopeOf(samples, sampleRate)
  const pieces = tilePieces(samples, sampleRate)
  const PAD = 0.7
  const out: TimedWord[] = []
  const hear = async (a: number, b: number, lo: number, hi: number, label: string) => {
    const from = Math.max(0, Math.round((a - PAD) * sampleRate)), to = Math.min(samples.length, Math.round((b + PAD) * sampleRate))
    if (to - from < sampleRate * 0.3) return
    const piece = samples.subarray(from, to)
    let words = await transcribe(piece, sampleRate, (l) => onProgress?.(`${l} (${label})`), 'base')
    // The base model's word timestamps sometimes COLLAPSE on a short piece
    // — every word stamped at one instant near the end (seen on a
    // nine-second piece of the operator's first recording, where the whole
    // piece was then thrown away by the midpoint rule). The words are still
    // right; only the clock is broken. So the same piece is heard by the
    // tiny model, whose clock is sound, and base's words are laid onto
    // tiny's timings — the aligner's own fit, in the other direction.
    if (collapsed(words)) {
      const clock = await transcribe(piece, sampleRate, (l) => onProgress?.(`${l} (${label}, timing)`), 'tiny')
      words = collapsed(clock) || clock.length < 2
        ? spread(words, piece.length / sampleRate)
        : fitWords(words.map((w) => w.text), clock, piece.length / sampleRate).words
    }
    const off = from / sampleRate
    // Whisper stamps a piece's first word at 0.00 whatever the lead-in
    // silence, and with the margin above that put "Paul" (heard 0.7s into
    // the piece) at the piece's edge, where the midpoint rule handed it to
    // the piece before — which had already ended. It starts at the first
    // sound in the piece instead.
    if (words.length && words[0].start < 0.05) {
      const first = Math.max(0, onsetOf(piece, sampleRate) - 0.05)
      words[0] = { ...words[0], start: first, end: Math.max(words[0].end, first + 0.08) }
    }
    // Whisper names what it cannot read — "[BLANK_AUDIO]", "[ Pause ]",
    // "(music)" — and a breath comes back as one of those. Not words.
    for (const w of words) {
      if (/[[\]()]/.test(w.text)) continue
      const mid = off + (w.start + w.end) / 2
      if (mid >= lo && mid < hi) out.push({ text: w.text, start: w.start + off, end: w.end + off })
    }
  }
  // Is there speech (a second of it, above the noise floor) between two times?
  const speechIn = (t0: number, t1: number) => {
    let n = 0
    for (let i = Math.round(t0 / 0.01); i < Math.min(env.rms.length, Math.round(t1 / 0.01)); i++) if (env.rms[i] > env.speech) n++
    return n >= 100
  }
  for (let i = 0; i < pieces.length; i++) {
    const [a, b] = pieces[i]
    const lo = i === 0 ? -Infinity : a, hi = i === pieces.length - 1 ? Infinity : b
    const before = out.length
    await hear(a, b, lo, hi, `${i + 1}/${pieces.length}`)
    // The window stopped early: speech left unheard at the end of the piece.
    let lastEnd = a
    for (let k = before; k < out.length; k++) lastEnd = Math.max(lastEnd, out[k].end)
    if (b - lastEnd > 2.5 && speechIn(lastEnd + 0.3, b)) await hear(lastEnd + 0.3, b, lastEnd + 0.3, hi, `${i + 1}/${pieces.length} again`)
  }
  out.sort((x, y) => x.start - y.start)
  return out
}

/**
 * How far past the last matched verse word a later match may sit and still
 * count as the same reading continuing rather than a re-quote inside the
 * thought. A dozen heard words is a breath; a re-quote is thirty or more.
 */
const CONTINUES_WITHIN = 12

export async function splitRecording(samples: Float32Array, sampleRate: number, verseText: string, reference: string, onProgress?: (label: string) => void): Promise<VoiceTrack> {
  const heard = await transcribePieces(samples, sampleRate, onProgress)
  if (heard.length < 8) throw new Error('Heard almost nothing — is the recording silent, or in another language?')
  const seconds = samples.length / sampleRate
  const verseWords = verseText.trim().split(/\s+/).filter(Boolean)
  const onset = onsetOf(samples, sampleRate)
  // The verse is matched in the OPENING stretch only, never against the
  // whole transcript. The operator's first real recording re-quoted "to the
  // saints" inside the thought, and a match over everything heard took that
  // later copy as the verse's ending — swallowing the first half of the
  // thought as "verse". So the transcript is walked one pause at a time
  // (gaps of 0.6s or more between heard words) and the verse's window ends
  // at the first pause by which most of its words have been heard; only
  // when no pause ever gets there does the whole transcript stand in.
  const breaks: number[] = []
  for (let i = 1; i < heard.length; i++) if (heard[i].start - heard[i - 1].end >= 0.6) breaks.push(i)
  breaks.push(heard.length)
  const want = Math.max(4, Math.ceil(verseWords.length * 0.7))
  let fit = fitWords(verseWords, heard, seconds, onset)
  let windowEnd = heard.length
  for (let i = 0; i < breaks.length; i++) {
    const f = fitWords(verseWords, heard.slice(0, breaks[i]), seconds, onset)
    if (f.matched < want) continue
    // The first pause past 70% is not necessarily the END of the verse: a
    // long verse is read with pauses IN it, and 2 Kings 2:11 ("…separated
    // the two of them, / and Elijah went up into heaven in a whirlwind")
    // reached 24 of its 33 words at a pause two thirds of the way through.
    // Cutting there crammed its last nine words onto one frame and opened
    // the THOUGHT's caption over the tail he was still reading. So the
    // window keeps extending while the next one adds matches — but only
    // while those matches CONTINUE this one (`lastHeard` moving on by a
    // few words) rather than appearing far later, which is the re-quote
    // this walk exists to refuse: the first real recording said "to the
    // saints" again inside its thought, and a match over everything heard
    // took that copy as the verse's ending.
    let cur = { f, b: breaks[i] }
    for (let j = i + 1; j < breaks.length; j++) {
      const nf = fitWords(verseWords, heard.slice(0, breaks[j]), seconds, onset)
      if (nf.matched <= cur.f.matched || nf.lastHeard > cur.f.lastHeard + CONTINUES_WITHIN) break
      cur = { f: nf, b: breaks[j] }
    }
    fit = cur.f; windowEnd = cur.b
    break
  }
  if (fit.matched < Math.max(4, verseWords.length * 0.4)) throw new Error(`Only ${fit.matched} of the verse's ${verseWords.length} words were heard — read the verse first, then pause, then your thought.`)
  // The verse ends at the last of its words that was actually heard, not at
  // the pause: "Paul writes these words…" begins the thought half a second
  // after "…the life to come", and cutting at the pause swallowed "Paul".
  // Words the recording never reached are timed at that point rather than
  // stretched toward the end of the file.
  if (fit.lastHeard >= 0) windowEnd = Math.min(windowEnd, fit.lastHeard + 1)
  const windowClose = heard[windowEnd - 1]?.end ?? seconds
  for (const w of fit.words) { if (w.start > windowClose) w.start = windowClose; if (w.end > windowClose) w.end = windowClose }
  const verseEnd = Math.min(fit.words[fit.words.length - 1].end, windowClose)
  // The thought begins at the first heard word that starts after the verse
  // ended (a small tolerance, since the last verse word's end is itself an
  // estimate when Whisper dropped it).
  let rest = heard.slice(windowEnd)
  // The operator was asked not to say the reference (the end card has it),
  // but a habit is a habit: if the first words after the verse are the
  // reference — "James two, verse seventeen" — they are dropped rather than
  // captioned as the opening of the thought.
  const refTokens = new Set(reference.toLowerCase().replace(/[:\-–]/g, ' ').split(/\s+/).filter(Boolean).flatMap((t) => [t, ...(NUMBER_WORDS[t] ?? [])]))
  refTokens.add('verse'); refTokens.add('verses'); refTokens.add('chapter')
  // Only a BOOK NAME followed by a NUMBER within a few words is a spoken
  // reference: "Jude writes to those who are called" opens with the book's
  // name and is the thought, not the reference.
  const tok = (w: TimedWord) => w.text.toLowerCase().replace(/[^a-z0-9]/g, '')
  const numeric = (t: string) => /^\d+$/.test(t) || Object.values(NUMBER_WORDS).some((ws) => ws.includes(t))
  const head = rest.slice(0, 7)
  if (head.length && refTokens.has(tok(head[0])) && head.some((w) => numeric(tok(w)))) {
    let cut = -1
    for (let i = 0; i < head.length; i++) if (refTokens.has(tok(head[i]))) cut = i
    rest = rest.slice(cut + 1)
  }
  const thoughtHeard = rest.map((w) => ({ ...w }))
  const text = sentenceCase(thoughtHeard.map((w) => w.text)).join(' ')
  return { seconds, verse: fit.words, thought: thoughtHeard.map((w, i) => ({ ...w, text: text.split(' ')[i] ?? w.text })), heard: thoughtHeard, text, verseMatched: fit.matched, at: new Date().toISOString() }
}

/**
 * A recording that is ALL thought: the operator's own half of a story —
 * either the closing word after a telling he did not read himself, or the
 * introduction that hands over to Tabitha. There is no verse in it to find
 * and nothing to split, and `place` is only carried through to the parked
 * JSON so the renderer knows which end it belongs at. It returns the SAME
 * shape `splitRecording` does with an empty `verse` — which is what lets
 * `refit`, the parked JSON, the CLI's correction step and the renderer's
 * caption path all be the ones that already exist rather than a second set
 * of each.
 */
export async function transcribeOwn(samples: Float32Array, sampleRate: number, place: 'open' | 'close' = 'close', onProgress?: (label: string) => void): Promise<VoiceTrack> {
  const heard = await transcribePieces(samples, sampleRate, onProgress)
  if (heard.length < 5) throw new Error('Heard almost nothing — is the recording silent, or in another language?')
  const thought = heard.map((w) => ({ ...w }))
  const text = sentenceCase(thought.map((w) => w.text)).join(' ')
  const words = text.split(' ')
  return {
    seconds: samples.length / sampleRate,
    verse: [],
    thought: thought.map((w, i) => ({ ...w, text: words[i] ?? w.text })),
    heard: thought,
    text,
    place,
    verseMatched: 0,
    at: new Date().toISOString(),
  }
}

/** Put the operator's corrected thought onto the timings Whisper heard. */
export function refit(track: VoiceTrack, text: string): VoiceTrack {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  if (!words.length || !track.heard.length) return { ...track, text: words.join(' '), thought: [] }
  // The fit needs no model, only the words already heard — but it has to be
  // told where the thought BEGINS. `fitWords` times a word it could not
  // match by interpolating between its matched neighbours, and a word with
  // no matched neighbour BEFORE it falls back to the onset, which defaults
  // to zero. The first word of a thought is exactly the word a correction
  // changes ("All wrote this letter" → "Paul wrote this letter"), so it
  // matches nothing, lands at 0.00, and drags the whole thought's start to
  // the top of the video: the renderer gates the founder's photo on
  // `thoughtStart`, so the face appeared over the hook and over the verse
  // for the whole minute. Three of one week's seven came out that way, and
  // it is invisible in the transcript — only a rendered frame shows it.
  // The thought cannot begin before its own first heard word, so that is
  // the onset.
  const { words: timed } = fitWords(words, track.heard, track.seconds, track.heard[0].start)
  return { ...track, text: words.join(' '), thought: timed }
}

/**
 * Whether this is a phone. The listener (Whisper base, ~140MB of model in
 * WASM) is more than a phone's tab can hold — the operator's first two
 * uploads from an iPhone crashed the page to a blank screen after the WAV
 * had landed — so a phone only UPLOADS, and the listening is done from a
 * desktop or by the morning runner (`ensureVoice` in admin/tiktok/make.ts).
 */
export const isPhone = (): boolean => typeof navigator !== 'undefined' && (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || ((navigator as unknown as { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile ?? false))

/** Roughly how long a thought of this many words takes to say, at a spoken pace. */
export const thoughtSeconds = (words: number) => Math.round(words / 2.4)
