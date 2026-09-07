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

import { speechSegments, type TimedWord } from './tiktokRender'
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
  at: string
}

const OUT_RATE = 24000

/** Decode an uploaded recording to mono samples at 24 kHz, and a WAV of the same. */
export async function decodeRecording(file: Blob): Promise<{ samples: Float32Array; sampleRate: number; wav: Blob; seconds: number }> {
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
  const samples = trimAndLevel(rendered.getChannelData(0), OUT_RATE)
  return { samples, sampleRate: OUT_RATE, wav: wavBlob(samples, OUT_RATE), seconds: samples.length / OUT_RATE }
}

/**
 * A phone memo starts with a second of fumbling and comes in at whatever
 * level the room was: trim the silence at both ends to a short beat and
 * bring the peak up to where Gemini's readings sit, so a voiced day and a
 * synthetic one play at the same loudness under the same music bed.
 */
function trimAndLevel(samples: Float32Array, rate: number): Float32Array {
  let peak = 0
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]))
  if (peak < 1e-4) return samples
  const gain = Math.min(8, 0.6 / peak)
  const thr = 0.02 / gain
  let a = 0; while (a < samples.length && Math.abs(samples[a]) < thr) a++
  let b = samples.length; while (b > a && Math.abs(samples[b - 1]) < thr) b--
  const pad = Math.round(0.25 * rate)
  a = Math.max(0, a - pad); b = Math.min(samples.length, b + Math.round(0.6 * rate))
  const out = new Float32Array(b - a)
  for (let i = a; i < b; i++) out[i - a] = Math.max(-1, Math.min(1, samples[i] * gain))
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
async function transcribePieces(samples: Float32Array, sampleRate: number, onProgress?: (label: string) => void): Promise<TimedWord[]> {
  const segs = speechSegments(samples, sampleRate, 0.45).filter(([a, b]) => b - a >= 0.25)
  const pieces: Array<[number, number]> = []
  let cur: [number, number] | null = null
  for (const [a, b] of segs) {
    if (cur && b - cur[0] <= 22) cur[1] = b
    else { if (cur) pieces.push(cur); cur = [a, b] }
  }
  if (cur) pieces.push(cur)
  const out: TimedWord[] = []
  for (let i = 0; i < pieces.length; i++) {
    const [a, b] = pieces[i]
    const from = Math.max(0, Math.round((a - 0.15) * sampleRate)), to = Math.min(samples.length, Math.round((b + 0.3) * sampleRate))
    const words = await transcribe(samples.subarray(from, to), sampleRate, (label) => onProgress?.(`${label} (${i + 1}/${pieces.length})`))
    const off = from / sampleRate
    // Whisper names what it cannot read — "[BLANK_AUDIO]", "[ Pause ]",
    // "(music)" — and a breath that tripped the speech detector comes back
    // as one of those. They are not words and never go on screen.
    for (const w of words) if (!/[[\]()]/.test(w.text)) out.push({ text: w.text, start: w.start + off, end: w.end + off })
  }
  return out
}

export async function splitRecording(samples: Float32Array, sampleRate: number, verseText: string, reference: string, onProgress?: (label: string) => void): Promise<VoiceTrack> {
  const heard = await transcribePieces(samples, sampleRate, onProgress)
  if (heard.length < 8) throw new Error('Heard almost nothing — is the recording silent, or in another language?')
  const seconds = samples.length / sampleRate
  const verseWords = verseText.trim().split(/\s+/).filter(Boolean)
  const fit = fitWords(verseWords, heard, seconds, onsetOf(samples, sampleRate))
  if (fit.matched < Math.max(4, verseWords.length * 0.4)) throw new Error(`Only ${fit.matched} of the verse's ${verseWords.length} words were heard — read the verse first, then pause, then your thought.`)
  const verseEnd = fit.words[fit.words.length - 1].end
  // The thought begins at the first heard word that starts after the verse
  // ended (a small tolerance, since the last verse word's end is itself an
  // estimate when Whisper dropped it).
  let rest = heard.filter((w) => w.start >= verseEnd - 0.15)
  // The operator was asked not to say the reference (the end card has it),
  // but a habit is a habit: if the first words after the verse are the
  // reference — "James two, verse seventeen" — they are dropped rather than
  // captioned as the opening of the thought.
  const refTokens = new Set(reference.toLowerCase().replace(/[:\-–]/g, ' ').split(/\s+/).filter(Boolean).flatMap((t) => [t, ...(NUMBER_WORDS[t] ?? [])]))
  refTokens.add('verse'); refTokens.add('verses'); refTokens.add('chapter')
  let cut = -1
  for (let i = 0; i < Math.min(7, rest.length); i++) if (refTokens.has(rest[i].text.toLowerCase().replace(/[^a-z0-9]/g, ''))) cut = i
  if (cut >= 0 && refTokens.has(rest[0].text.toLowerCase().replace(/[^a-z0-9]/g, ''))) rest = rest.slice(cut + 1)
  const thoughtHeard = rest.map((w) => ({ ...w }))
  const text = sentenceCase(thoughtHeard.map((w) => w.text)).join(' ')
  return { seconds, verse: fit.words, thought: thoughtHeard.map((w, i) => ({ ...w, text: text.split(' ')[i] ?? w.text })), heard: thoughtHeard, text, verseMatched: fit.matched, at: new Date().toISOString() }
}

/** Put the operator's corrected thought onto the timings Whisper heard. */
export function refit(track: VoiceTrack, text: string): VoiceTrack {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  if (!words.length || !track.heard.length) return { ...track, text: words.join(' '), thought: [] }
  // The fit needs no model, only the words already heard.
  const { words: timed } = fitWords(words, track.heard, track.seconds)
  return { ...track, text: words.join(' '), thought: timed }
}

/** Roughly how long a thought of this many words takes to say, at a spoken pace. */
export const thoughtSeconds = (words: number) => Math.round(words / 2.4)
