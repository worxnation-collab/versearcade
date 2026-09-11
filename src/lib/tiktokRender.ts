// tiktokRender — assembles the finished daily TikTok IN THE BROWSER.
//
// The Edge Function (supabase/functions/tiktok-gen) makes the pieces that need
// the Gemini key: the reading (a WAV), the reader (a 9:16 still, optionally an
// 8-second Veo loop). This file is what turns them into one 1080x1920 MP4 with
// captions and the audio baked in, using WebCodecs + mp4-muxer — so the whole
// engine runs with no server-side video stack at all. Chrome/Edge on a desktop
// are the target; if the browser can't encode H.264/AAC it falls back to a
// VP9/Opus WebM, which TikTok also accepts.
//
// Nothing here is a player-facing surface: it is dynamically imported by the
import { levelSpeech, SPEECH_TARGET } from './speechLevel'
// admin panel only, so the muxers never reach the app bundle.
//
// Timeline: [lead: reference / hook] [voice, captioned phrase by phrase] [end card]

import type { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from 'mp4-muxer'

export const WIDTH = 1080
export const HEIGHT = 1920
export const FPS = 30
const TAIL_SEC = 2.6
// The voice starts almost at once. A post used to open on 1.8 seconds of
// hook over silence while the reader stood there; on a feed that is 1.8
// seconds of a thumb deciding, and the reading is the thing worth staying
// for. The hook still leads — large, on frame one — but over the first words.
const LEAD = 0.35
// How long the hook holds the top of the frame before the picture has it.
const HOOK_HOLD = 3.2
const SAMPLE_RATE = 48000
const AAC_FRAME = 1024 // samples per AAC frame; every MP4 audio delta must be this
const OPUS_FRAME = 960 // samples per Opus packet at 48 kHz (20 ms)
const SITE = 'versearcade.org'

export type Backdrop =
  | { kind: 'builtin'; scene: HTMLImageElement; figure: HTMLImageElement }
  | { kind: 'still'; image: HTMLImageElement }
  | { kind: 'loop'; video: HTMLVideoElement }

export interface RenderInput {
  reference: string
  text: string
  /** Optional opening line shown before the voice starts. */
  hook?: string
  /** The reading, as a WAV (or anything decodeAudioData reads). */
  audio: ArrayBuffer
  backdrop: Backdrop
  /**
   * The maker's own figure, which TAKES THE READER'S PLACE as the thought
   * begins — the day's reader hands the road over to the person actually
   * talking, so the figure, the voice and the photo are one person for the
   * rest of the post. Absent on an automated post, which renders exactly as
   * it always did.
   *
   * It carries a `scene` as well as a `figure` because on the two best
   * backdrop tiers the reader is PAINTED INTO the picture and there is no
   * layer to take away. So the swap crossfades the bare road over the
   * painting rather than fading a figure, and the built-in tier — which does
   * have a separate figure — spins that one out instead. Both halves land in
   * the same place, at the same size, on the same road.
   */
  speaker?: { figure: HTMLImageElement; scene: HTMLImageElement }
  /** A time-of-day grade over the backdrop: the mood without a new painting. */
  grade?: 'dusk' | 'night'
  /** A music bed (48 kHz mono) mixed under the reading; see lib/tiktokMusic. */
  bed?: Float32Array
  /** Time the captions by listening to the reading (default); false keeps the heuristic. */
  align?: boolean
  /**
   * The operator's own recording instead of Gemini's reading: the verse's
   * words and the thought's words already timed (lib/tiktokVoice), so nothing
   * is listened to here, plus the photo the thought section draws.
   */
  voice?: VoiceInput
  /**
   * His recording as the OPENING instead — a hook and an introduction, after
   * which Gemini reads the verse.
   *
   * This is the shape that lets one sitting cover many days. `voice` above
   * replaces the reading, so a voiced day costs a take of that day's verse and
   * an unvoiced day has no human in it at all; an opener is about the verse
   * without being it, so a batch of them can be recorded ahead and the reading
   * underneath is always there. Mutually exclusive with `voice` — a post where
   * he both introduces the verse and reads it is one voice having a
   * conversation with itself, which is the same objection that keeps a story
   * from carrying his word at both ends.
   */
  opener?: OpenerInput
  onProgress?: (fraction: number, label: string) => void
}

export interface VoiceInput {
  verse: TimedWord[]
  thought: TimedWord[]
  /** The person speaking, drawn in a round frame while the thought plays and on the end card. */
  photo?: HTMLImageElement
  /** Under the photo: who this is ("Matthew · founder"). */
  label?: string
}

/** His hook, ahead of the reading: already-timed words (lib/tiktokVoice) and the photo. */
export interface OpenerInput {
  audio: ArrayBuffer
  /**
   * The words, already timed — a real recording arrives this way, because it
   * was listened to once when it was parked and the operator corrected the
   * transcript.
   *
   * EMPTY is a supported case and not a bug: a synthesised opener (a preview,
   * or a placeholder while a recording is pending) has never been through
   * Whisper, and there is nothing to correct because the words are the ones we
   * sent. Then `text` is timed against the opener's own audio instead, the
   * same way an unvoiced reading is.
   */
  words: TimedWord[]
  /** What he says, for the case above. Ignored when `words` is supplied. */
  text?: string
  photo?: HTMLImageElement
  /** Under the photo: who this is ("Matthew · founder"). */
  label?: string
}

export interface RenderOutput {
  blob: Blob
  ext: 'mp4' | 'webm'
  durationSec: number
  /** The caption timing that was used, for the panel to show/inspect. */
  phrases: TimedPhrase[]
}

export interface TimedPhrase { text: string; start: number; end: number; words?: TimedWord[] }
export interface TimedWord { text: string; start: number; end: number }

// ---- text → phrases ----------------------------------------------------------

// A caption is a phrase of at most `maxWords` words, cut preferably at
// punctuation so a card never ends mid-clause when it doesn't have to.
export function splitPhrases(text: string, maxWords = 6): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const out: string[] = []
  let cur: string[] = []
  const flush = () => { if (cur.length) { out.push(cur.join(' ')); cur = [] } }
  for (let i = 0; i < words.length; i++) {
    cur.push(words[i])
    const w = words[i]
    const endsClause = /[.,;:!?—]["'”’)]?$/.test(w)
    const remaining = words.length - i - 1
    if (endsClause && cur.length >= 2) flush()
    else if (cur.length >= maxWords) {
      // Don't strand a one-word orphan at the very end.
      if (remaining === 1) { cur.push(words[++i]); flush() } else flush()
    }
  }
  flush()
  return out
}

// How long a phrase takes to say, in arbitrary units: characters, plus a
// pause for the punctuation it ends on. Proportional timing over the real
// audio length gets within a couple hundred milliseconds of the TTS.
/**
 * Words that already carry their timing, handed to phrases: the phrase's
 * text says which words it holds, in order, and each phrase runs from its
 * first word to the next phrase's first word (the last word stays lit
 * through the gap). Used for an operator's recording, whose words were
 * timed once in the hub and parked — the renderer never listens again.
 */
export function groupWords(texts: string[], words: TimedWord[], audioDur: number): TimedPhrase[] {
  const out: TimedPhrase[] = []
  let i = 0
  for (const text of texts) {
    const n = text.split(/\s+/).filter(Boolean).length
    const ws = words.slice(i, i + n).map((w) => ({ ...w }))
    i += n
    if (!ws.length) continue
    out.push({ text, start: ws[0].start, end: ws[ws.length - 1].end, words: ws })
  }
  for (let k = 0; k < out.length; k++) {
    const next = out[k + 1]
    out[k].end = next ? next.start : Math.min(audioDur, out[k].end + 0.3)
    out[k].words![out[k].words!.length - 1].end = out[k].end
  }
  return out
}

function weight(phrase: string): number {
  const base = phrase.replace(/[^a-zA-Z0-9]/g, '').length
  const pause = /[.!?]["'”’)]?$/.test(phrase) ? 9 : /[,;:—]["'”’)]?$/.test(phrase) ? 4 : 0
  return base + pause
}

// Speech segments in the decoded audio: runs of sound between silences of at
// least `gapSec`. Used to snap phrase boundaries onto the pauses the TTS
// actually took, which is what makes captions land on the words.
const HOP = 0.01 // seconds per envelope window

function envelope(samples: Float32Array, sampleRate: number): { rms: Float32Array; peak: number } {
  const win = Math.round(sampleRate * HOP)
  const n = Math.floor(samples.length / win)
  const rms = new Float32Array(n)
  let peak = 0
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let j = i * win; j < (i + 1) * win; j++) s += samples[j] * samples[j]
    rms[i] = Math.sqrt(s / win)
    if (rms[i] > peak) peak = rms[i]
  }
  return { rms, peak }
}

export function speechSegments(samples: Float32Array, sampleRate: number, gapSec = 0.22): Array<[number, number]> {
  const { rms, peak } = envelope(samples, sampleRate)
  const n = rms.length
  const thr = Math.max(0.004, peak * 0.05)
  const segs: Array<[number, number]> = []
  let start = -1, quiet = 0
  const gapWins = Math.round(gapSec / HOP)
  for (let i = 0; i < n; i++) {
    if (rms[i] > thr) {
      if (start < 0) start = i
      quiet = 0
    } else if (start >= 0) {
      quiet++
      if (quiet >= gapWins) { segs.push([start * HOP, (i - quiet + 1) * HOP]); start = -1; quiet = 0 }
    }
  }
  if (start >= 0) segs.push([start * HOP, n * HOP])
  return segs
}

// How long a word takes to say, relative to the words beside it: syllables
// (vowel groups, less a silent 'e'), a fixed cost for the consonants around
// them, and the pause its punctuation buys.
function wordWeight(word: string): number {
  const s = word.toLowerCase().replace(/[^a-z']/g, '')
  if (!s) return 0.5
  let n = (s.match(/[aeiouy]+/g) ?? []).length
  if (/[^aeiouy]e$/.test(s) && n > 1) n--
  const pause = /[.!?]["'\u201d\u2019)]?$/.test(word) ? 1.2 : /[,;:\u2014]["'\u201d\u2019)]?$/.test(word) ? 0.6 : 0
  return Math.max(1, n) + 0.3 + pause
}

/**
 * Put a time on every WORD, so a caption can light the word being spoken.
 *
 * Gemini TTS returns no word timings, and asking a model to transcribe the
 * audio back only resolves to the second — useless at this scale. So the
 * words are laid over the audio's own ENERGY: within a phrase's span, the
 * boundary after word k falls where the cumulative speech energy reaches
 * k's share of the phrase's syllable weight. Energy rather than elapsed time
 * is what makes it land: a pause inside a phrase contributes nothing, so a
 * breath between two words moves neither of them, where proportional timing
 * would slide every word after it late. The last word holds until the phrase
 * ends, so it stays lit through the gap before the next one.
 */
export function timeWords(phrases: TimedPhrase[], samples: Float32Array, sampleRate: number): TimedPhrase[] {
  const { rms, peak } = envelope(samples, sampleRate)
  const floor = Math.max(0.004, peak * 0.05)
  const pre = new Float64Array(rms.length + 1)
  for (let i = 0; i < rms.length; i++) pre[i + 1] = pre[i] + Math.max(0, rms[i] - floor)
  const idx = (t: number) => Math.min(rms.length, Math.max(0, Math.round(t / HOP)))
  return phrases.map((p) => {
    const toks = p.text.split(/\s+/).filter(Boolean)
    if (toks.length < 2) return { ...p, words: toks.map((t) => ({ text: t, start: p.start, end: p.end })) }
    const i0 = idx(p.start), i1 = Math.max(i0, idx(p.end))
    const span = pre[i1] - pre[i0]
    const w = toks.map(wordWeight)
    const sum = w.reduce((a, b) => a + b, 0) || 1
    const words: TimedWord[] = []
    let acc = 0, from = p.start
    for (let k = 0; k < toks.length; k++) {
      acc += w[k]
      let end: number
      if (span > 0) {
        const target = pre[i0] + (acc / sum) * span
        let lo = i0, hi = i1
        while (lo < hi) { const mid = (lo + hi) >> 1; if (pre[mid] < target) lo = mid + 1; else hi = mid }
        end = lo * HOP
      } else {
        end = p.start + ((p.end - p.start) * acc) / sum
      }
      end = Math.min(p.end, Math.max(from + 0.05, end))
      words.push({ text: toks[k], start: from, end })
      from = end
    }
    words[words.length - 1].end = p.end
    return { ...p, words }
  })
}

// Lay the phrases over the audio. Clauses (phrases ending in punctuation) are
// matched to the speech segments when the counts agree; otherwise the whole
// reading is one segment and timing is proportional across it.
export function alignPhrases(phrases: string[], segments: Array<[number, number]>, audioDur: number): TimedPhrase[] {
  const clauseEnd = (p: string) => /[.,;:!?—]["'”’)]?$/.test(p)
  const clauses: string[][] = []
  let cur: string[] = []
  for (const p of phrases) { cur.push(p); if (clauseEnd(p)) { clauses.push(cur); cur = [] } }
  if (cur.length) clauses.push(cur)

  let groups: Array<{ phrases: string[]; start: number; end: number }>
  if (segments.length >= 2 && segments.length === clauses.length) {
    groups = clauses.map((c, i) => ({ phrases: c, start: segments[i][0], end: segments[i][1] }))
  } else {
    const start = segments[0]?.[0] ?? 0
    const end = segments.length ? segments[segments.length - 1][1] : audioDur
    groups = [{ phrases, start, end }]
  }
  const out: TimedPhrase[] = []
  for (const g of groups) {
    const total = g.phrases.reduce((n, p) => n + weight(p), 0) || 1
    let t = g.start
    for (const p of g.phrases) {
      const dur = ((g.end - g.start) * weight(p)) / total
      out.push({ text: p, start: t, end: t + dur })
      t += dur
    }
  }
  // Captions hold until the next one, so a pause between clauses isn't a
  // blank screen.
  for (let i = 0; i < out.length - 1; i++) out[i].end = out[i + 1].start
  if (out.length) out[out.length - 1].end = Math.max(out[out.length - 1].end, Math.min(audioDur, out[out.length - 1].end + 0.3))
  return out
}

/**
 * The captions, timed. The heuristic (`alignPhrases` + `timeWords`) is
 * computed first and is the fallback; then the reading is transcribed
 * (lib/tiktokAlign, Whisper in the browser) and every word is put where it
 * was actually heard. `align: false` keeps the heuristic — useful for a fast
 * preview, never for a post.
 */
async function timedCaptions(texts: string[], samples: Float32Array, progress: (f: number, label: string) => void, align = true): Promise<TimedPhrase[]> {
  const audioDur = samples.length / SAMPLE_RATE
  const base = timeWords(alignPhrases(texts, speechSegments(samples, SAMPLE_RATE), audioDur), samples, SAMPLE_RATE)
  if (!align) return base
  try {
    const m = await import('./tiktokAlign')
    return await m.alignWords(samples, SAMPLE_RATE, base, (label) => progress(0.03, label))
  } catch (e) {
    console.warn('caption alignment fell back to the heuristic:', e)
    return base
  }
}

// ---- assets -----------------------------------------------------------------

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`could not load ${url}`))
    img.src = url
  })
}

// Loaded from its URL, not as a blob: measured in Chromium, a seek on a
// blob-backed <video> costs 200-360 ms against about 1 ms on a URL-backed one,
// so "buffer it all first" made every frame slower. preload=auto lets the
// browser pull the whole small clip on its own.
export function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.crossOrigin = 'anonymous'
    v.muted = true
    v.playsInline = true
    v.preload = 'auto'
    // Never wait forever: a browser that quietly declines to load one more
    // video (iOS, past its decoder budget) would otherwise stall the render
    // with no error anywhere.
    const timer = setTimeout(() => reject(new Error(`timed out loading ${url}`)), 30000)
    v.onloadeddata = () => { clearTimeout(timer); resolve(v) }
    v.onerror = () => { clearTimeout(timer); reject(new Error(`could not load ${url}`)) }
    v.src = url
    v.load()
  })
}

// A seek that cannot hang the render: if `seeked` hasn't fired in a second
// and a half, the frame is drawn from wherever the element is. One late frame
// beats a post that never finishes.
function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - t) < 1 / (FPS * 2)) return resolve()
    let settled = false
    const done = () => { if (settled) return; settled = true; clearTimeout(timer); video.removeEventListener('seeked', done); resolve() }
    const timer = setTimeout(done, 1500)
    video.addEventListener('seeked', done)
    video.currentTime = t
  })
}

// A loop is drawn FORWARD ONLY, with a crossfade at the seam. It used to
// ping-pong (play the eight seconds, then play them backwards) so a Veo clip
// never seamed — and every backward step made the browser seek to the previous
// keyframe and decode forward to the target, which measured at 3x the cost of
// a forward step (184ms against 59ms in software VP9). Half of every loop
// lived in that path, and a 90-second story is 2,700 frames: the render was
// not stuck, it was walking backwards through most of them.
//
// The crossfade partner is NOT a second video element. That shipped first and
// hung an iPhone at exactly the first seam: iOS never fired `loadeddata` for
// a fifth <video> on the page, and a promise with no timeout waited forever.
// Instead the clip's first SEAM seconds are captured as half-size bitmaps as
// they are drawn — every cut through a loop passes its head before its tail —
// and faded in over the tail. One element per clip, no extra seeks, and a
// capture that fails (no createImageBitmap, out of memory) degrades to a hard
// cut at the seam rather than a stall.
const SEAM = 0.6
const heads = new WeakMap<HTMLVideoElement, Map<number, ImageBitmap | null>>()
async function drawLoop(ctx: CanvasRenderingContext2D, v: HTMLVideoElement, at: number) {
  const d = Math.max(0.1, v.duration - 0.05)
  const m = Math.max(0, at) % d
  await seek(v, m)
  cover(ctx, v, v.videoWidth, v.videoHeight)
  if (d <= SEAM * 2) return
  let head = heads.get(v)
  if (!head) { head = new Map(); heads.set(v, head) }
  const idx = Math.round(m * FPS)
  if (m < SEAM && !head.has(idx)) {
    head.set(idx, null)
    try {
      head.set(idx, await createImageBitmap(v, { resizeWidth: WIDTH / 2, resizeHeight: HEIGHT / 2, resizeQuality: 'medium' }))
    } catch { /* hard cut at the seam for this clip */ }
  }
  const into = m - (d - SEAM)
  if (into <= 0) return
  const want = Math.round(into * FPS)
  let bmp: ImageBitmap | null | undefined = head.get(want)
  if (!bmp) for (let k = want - 1; k >= 0 && !bmp; k--) bmp = head.get(k)
  if (!bmp) return
  ctx.save()
  ctx.globalAlpha = Math.min(1, into / SEAM)
  cover(ctx, bmp, bmp.width, bmp.height)
  ctx.restore()
}

async function decodeAudio(buf: ArrayBuffer): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, 1, SAMPLE_RATE)
  const decoded = await ctx.decodeAudioData(buf.slice(0))
  if (decoded.sampleRate === SAMPLE_RATE) return decoded.getChannelData(0)
  // decodeAudioData resamples to the context's rate in every modern browser,
  // but belt and braces: render through the offline graph if it didn't.
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * SAMPLE_RATE), SAMPLE_RATE)
  const src = off.createBufferSource()
  src.buffer = decoded
  src.connect(off.destination)
  src.start()
  return (await off.startRendering()).getChannelData(0)
}

// ---- drawing ----------------------------------------------------------------

const FONT_DISPLAY = '"Baloo 2", "Fredoka", system-ui, -apple-system, "Segoe UI", sans-serif'

function cover(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, zoom = 1, anchorY = 0.5) {
  const s = Math.max(WIDTH / sw, HEIGHT / sh) * zoom
  const w = sw * s, h = sh * s
  ctx.drawImage(src, (WIDTH - w) / 2, (HEIGHT - h) * anchorY, w, h)
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w } else line = test
  }
  if (line) lines.push(line)
  return lines
}

function outlined(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill = '#ffffff', stroke = 'rgba(11,7,32,0.9)', width = 10) {
  ctx.lineJoin = 'round'
  ctx.lineWidth = width
  ctx.strokeStyle = stroke
  ctx.strokeText(text, x, y)
  ctx.fillStyle = fill
  ctx.fillText(text, x, y)
}

function easeOut(t: number) { return 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3) }

/**
 * The caption to show at `at`: the one being spoken, or — through a pause —
 * the one that was spoken LAST, so a gap is a lingering line rather than a
 * blank panel. Nothing before the first phrase or after the audio.
 *
 * The "held" half used to be `phrases[phrases.length - 1]`, which is the same
 * thing only while the array is one speaker's words in order. It stopped
 * being the same thing the moment a story could OPEN in the operator's voice:
 * the array is then his half followed by hers, so the beat between them —
 * his last word to her first, about a second and a half — held HER closing
 * reference line, flashed once at the handover and gone. It rendered
 * perfectly; only pulling the frame out of the MP4 found it.
 */
function heldPhrase(phrases: TimedPhrase[], at: number, audioDur: number): TimedPhrase | null {
  const now = phrases.find((x) => at >= x.start && at < x.end)
  if (now) return now
  if (at >= audioDur || at < (phrases[0]?.start ?? 0)) return null
  for (let i = phrases.length - 1; i >= 0; i--) if (phrases[i].start <= at) return phrases[i]
  return null
}


/** The largest of `sizes` at which `text` wraps into `maxHeight`; sets ctx.font to it. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, sizes: number[], maxHeight: number) {
  let lines: string[] = [text], lh = 0
  for (const size of sizes) {
    ctx.font = `800 ${size}px ${FONT_DISPLAY}`
    lines = wrap(ctx, text, maxWidth)
    lh = Math.round(size * 1.2)
    if (lines.length * lh <= maxHeight) break
  }
  return { lines, lh }
}

// ---- captions ---------------------------------------------------------------
//
// A caption is drawn WORD BY WORD, with the word being spoken right now in
// gold and the words still to come held back. Everything else about these
// posts is deliberately still: an earlier cut had drifting motes, a breathing
// warm pulse over the whole frame, a bobbing figure and a gold glow under it,
// and together they read as generated rather than painted. The one thing
// moving on screen is now the thing the voice is saying.

interface CaptionOpts {
  x: number
  y: number
  maxWidth: number
  size: number
  /** Font size to drop to when the phrase needs more than two lines. */
  small?: number
  stroke?: number
  /** Alpha for words not yet spoken. */
  dim?: number
}

function layoutWords(ctx: CanvasRenderingContext2D, words: TimedWord[], maxWidth: number) {
  const space = ctx.measureText(' ').width
  const lines: Array<Array<TimedWord & { w: number }>> = [[]]
  let width = 0
  for (const word of words) {
    const w = ctx.measureText(word.text).width
    const add = lines[lines.length - 1].length ? space + w : w
    if (width + add > maxWidth && lines[lines.length - 1].length) { lines.push([]); width = w }
    else width += add
    lines[lines.length - 1].push({ ...word, w })
  }
  return { lines, space }
}

/**
 * Draw one caption, lighting the word being spoken. A phrase with no word
 * timings (the lead-in hook) draws plain white — nothing is "coming up" in a
 * line nobody is reading along with.
 */
function drawCaption(ctx: CanvasRenderingContext2D, phrase: TimedPhrase | null, at: number, o: CaptionOpts): void {
  if (!phrase) return
  const timed = !!phrase.words?.length
  // Untimed text still has to WRAP, so it is split into words either way and
  // simply drawn as all-spoken. (It shipped as one unbreakable token for a
  // few minutes, and the lead-in hook ran off both edges of the frame.)
  const words: TimedWord[] = timed
    ? phrase.words!
    : phrase.text.split(/\s+/).filter(Boolean).map((text) => ({ text, start: -1, end: Infinity }))
  const fit = (size: number) => { ctx.font = `800 ${size}px ${FONT_DISPLAY}`; return layoutWords(ctx, words, o.maxWidth) }
  let size = o.size
  let out = fit(size)
  if (out.lines.length > 2 && o.small) { size = o.small; out = fit(size) }
  const lh = Math.round(size * 1.18)
  const alpha = ctx.globalAlpha
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const y0 = o.y - ((out.lines.length - 1) * lh) / 2
  out.lines.forEach((line, i) => {
    const total = line.reduce((n, w) => n + w.w, 0) + out.space * Math.max(0, line.length - 1)
    let x = o.x - total / 2
    for (const w of line) {
      const current = timed && at >= w.start && at < w.end
      const spoken = !timed || at >= w.start
      ctx.globalAlpha = alpha * (spoken ? 1 : (o.dim ?? 0.5))
      outlined(ctx, w.text, x, y0 + i * lh, current ? '#ffd23f' : '#ffffff', 'rgba(11,7,32,0.92)', o.stroke ?? 12)
      x += w.w + out.space
    }
  })
  ctx.globalAlpha = alpha
  ctx.textAlign = 'center'
}

// Dusk and night over the daytime road: a multiply tint and a darker vignette,
// so a comfort verse at dusk and a warning at night keep the host's LOOP
// (which only exists for the daytime road) rather than falling back to a
// still of a different painting.
/**
 * The hook: on screen from the first frame, large, for HOOK_HOLD seconds,
 * then gone so the painting has the top of the frame. One copy for the three
 * layouts, because the first frame is the one every network uses as the
 * thumbnail and the one a thumb judges.
 */
function drawHook(ctx: CanvasRenderingContext2D, hook: string | undefined, t: number, cy: number, size: number, maxWidth: number) {
  const text = hook?.trim()
  if (!text || t >= HOOK_HOLD) return
  ctx.save()
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.globalAlpha = Math.min(1, easeOut(t / 0.25) + 0.5) * (1 - easeOut((t - (HOOK_HOLD - 0.4)) / 0.4))
  ctx.font = `800 ${size}px ${FONT_DISPLAY}`
  let lines = wrap(ctx, text, maxWidth)
  let lh = Math.round(size * 1.12)
  if (lines.length > 2) { const s2 = Math.round(size * 0.8); ctx.font = `800 ${s2}px ${FONT_DISPLAY}`; lines = wrap(ctx, text, maxWidth); lh = Math.round(s2 * 1.12) }
  const y0 = cy - ((lines.length - 1) * lh) / 2
  lines.forEach((l, i) => outlined(ctx, l, WIDTH / 2, y0 + i * lh, '#ffd23f', 'rgba(11,7,32,0.9)', Math.round(size / 7)))
  ctx.restore()
}

/** The brand line and, under it, what this post was about — the end card's header. */
function drawBrand(ctx: CanvasRenderingContext2D, brand: string, reference: string, y: number) {
  ctx.save()
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.font = `800 34px ${FONT_DISPLAY}`
  ctx.letterSpacing = '6px'
  outlined(ctx, brand, WIDTH / 2, y, '#ffd23f', 'rgba(11,7,32,0.85)', 8)
  ctx.letterSpacing = '0px'
  ctx.font = `700 62px ${FONT_DISPLAY}`
  outlined(ctx, reference, WIDTH / 2, y + 72)
  ctx.restore()
}

function drawGrade(ctx: CanvasRenderingContext2D, grade?: 'dusk' | 'night') {
  if (!grade) return
  ctx.save()
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = grade === 'dusk' ? 'rgba(255,160,90,0.55)' : 'rgba(70,90,170,0.75)'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  if (grade === 'night') { ctx.fillStyle = 'rgba(20,20,60,0.35)'; ctx.fillRect(0, 0, WIDTH, HEIGHT) }
  ctx.globalCompositeOperation = 'source-over'
  const v = ctx.createRadialGradient(WIDTH / 2, HEIGHT * 0.5, HEIGHT * 0.25, WIDTH / 2, HEIGHT * 0.5, HEIGHT * 0.8)
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, grade === 'dusk' ? 'rgba(40,10,30,0.35)' : 'rgba(0,0,20,0.55)')
  ctx.fillStyle = v; ctx.fillRect(0, 0, WIDTH, HEIGHT)
  ctx.restore()
}

interface Scene {
  input: RenderInput
  lead: number
  audioDur: number
  total: number
  phrases: TimedPhrase[]
  /** The thought section of an operator-voiced post: when it starts, and the reading's loudness over time for the ring. */
  voice?: { thoughtStart: number; rms: Float32Array; peak: number }
  /** Where his OPENING half ends, so the photo steps back out as the reading begins. */
  openEnd?: number
}

// The one thing that moves in the thought section: a thin gold ring around
// the photo that widens with the voice — the picture of a person speaking,
// not an equaliser. Loudness is the RMS envelope the caption timing already
// measures, smoothed over ~120ms so the ring breathes rather than flickers.
function voiceLevel(v: { rms: Float32Array; peak: number }, at: number): number {
  const i = Math.round(at / HOP)
  let sum = 0, n = 0
  for (let k = i - 8; k <= i + 4; k++) if (k >= 0 && k < v.rms.length) { sum += v.rms[k]; n++ }
  if (!n || !v.peak) return 0
  return Math.min(1, Math.sqrt((sum / n) / v.peak) * 1.15)
}

function circleImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, cy: number, r: number) {
  ctx.save()
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip()
  // Cover the circle with the photo's centre — a portrait's face sits high,
  // so the crop is anchored a little above the middle.
  const s = Math.max((2 * r) / img.naturalWidth, (2 * r) / img.naturalHeight)
  const w = img.naturalWidth * s, h = img.naturalHeight * s
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, cx - w / 2, cy - r - (h - 2 * r) * 0.38, w, h)
  ctx.restore()
}

/** The person speaking: the photo in a round frame with the ring that breathes with the voice, and a small line saying who. */
function drawSpeaker(ctx: CanvasRenderingContext2D, photo: HTMLImageElement, label: string | undefined, cx: number, cy: number, r: number, level: number, alpha: number) {
  ctx.save()
  ctx.globalAlpha = alpha
  // A soft shadow so the frame sits on the painting rather than floating.
  ctx.shadowColor = 'rgba(11,7,32,0.6)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 12
  ctx.fillStyle = '#1a0f36'
  ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2); ctx.fill()
  ctx.shadowColor = 'transparent'
  circleImage(ctx, photo, cx, cy, r)
  // The ring: a hairline at rest, wider and brighter as the voice rises.
  ctx.strokeStyle = '#ffd23f'
  ctx.lineWidth = 5 + 5 * level
  ctx.globalAlpha = alpha * (0.55 + 0.45 * level)
  ctx.beginPath(); ctx.arc(cx, cy, r + 12 + 22 * level, 0, Math.PI * 2); ctx.stroke()
  ctx.globalAlpha = alpha
  if (label) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = `800 34px ${FONT_DISPLAY}`
    outlined(ctx, label, cx, cy + r + 58, '#ffd23f', 'rgba(11,7,32,0.9)', 8)
  }
  ctx.restore()
}

/**
 * The swap: it STARTS this long before the first word of the thought and
 * takes this long in total, so the maker is standing there as he begins to
 * speak rather than arriving late over his own sentence. Half a second, on
 * purpose — the rule on this layout is that the only thing moving is the
 * caption, and a slow dissolve between two figures would be a second moving
 * thing for as long as it lasted. A flip is over before it reads as motion.
 */
const SWAP_LEAD = 0.3
const SWAP_SEC = 0.5

/**
 * How much of a figure's PNG is EMPTY below its feet, as a fraction of the
 * file's height — and the reason this function exists rather than a constant.
 *
 * A skin render is a full-length figure on a transparent field, and every one
 * of them carries space under the sandals: david and esther are 400px tall
 * with content ending at 367, sharkey at 370. Drawing the image so its BOX
 * sits on the ground line therefore leaves the figure hovering by that much —
 * 8% of its drawn height, which is ~65px on a 1920 frame, with its own
 * contact shadow sitting in the gap underneath it. That is the one thing this
 * account cannot afford: it reads as pasted-on rather than painted, which is
 * the whole argument for holding the paintings still in the first place.
 *
 * Measured rather than assumed, because the padding is not the same on every
 * skin and a new one lands whenever a render does. It is one scan of the
 * alpha channel, cached by `src`, so the cost is paid once per image per
 * session and never per frame. A canvas that refuses to be read (a tainted
 * one — these are same-origin, but the guard is free) falls back to 0, which
 * is exactly the behaviour this replaced.
 */
const footPad = new Map<string, number>()
function bottomPad(img: HTMLImageElement): number {
  const key = img.src
  const seen = footPad.get(key)
  if (seen !== undefined) return seen
  let pad = 0
  try {
    const w = img.naturalWidth, h = img.naturalHeight
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const cx = c.getContext('2d', { willReadFrequently: true })
    if (cx && w && h) {
      cx.drawImage(img, 0, 0)
      const data = cx.getImageData(0, 0, w, h).data
      let bot = h - 1
      for (; bot >= 0; bot--) {
        let any = false
        for (let x = 3; x < w * 4; x += 4) if (data[bot * w * 4 + x] > 8) { any = true; break }
        if (any) break
      }
      pad = bot >= 0 ? (h - 1 - bot) / h : 0
    }
  } catch { pad = 0 }
  footPad.set(key, pad)
  return pad
}

/**
 * A figure STANDING on the road: feet on the ground, one soft contact
 * shadow, at the size the skins are drawn for. `turn` is a card flip about
 * the figure's own vertical axis — 0 is edge-on and invisible, 1 is facing
 * the viewer — which is how one figure replaces another in the same spot
 * without either of them sliding anywhere.
 *
 * The drawn box is pushed DOWN by the file's empty bottom (`bottomPad`) so
 * that the feet, not the file, land on the ground line.
 */
function standFigure(ctx: CanvasRenderingContext2D, img: HTMLImageElement, alpha: number, turn = 1, place = { feet: 0.68, height: 0.42 }) {
  if (alpha <= 0 || turn <= 0) return
  const fh = HEIGHT * place.height
  const fw = (img.naturalWidth / img.naturalHeight) * fh
  const cx = WIDTH / 2, feet = HEIGHT * place.feet
  const top = feet - fh + bottomPad(img) * fh
  ctx.save()
  ctx.globalAlpha = 0.32 * alpha * turn
  ctx.fillStyle = '#1a0f36'
  ctx.beginPath(); ctx.ellipse(cx, feet - 6, fw * 0.3, 22, 0, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.imageSmoothingQuality = 'high'
  ctx.translate(cx, 0)
  ctx.scale(turn, 1)
  ctx.drawImage(img, -fw / 2, top, fw, fh)
  ctx.restore()
}

async function drawFrame(ctx: CanvasRenderingContext2D, scene: Scene, t: number, chrome = true) {
  const { input, lead, audioDur, total, phrases } = scene
  const bd = input.backdrop
  const at = t - lead

  // 1. Backdrop.
  //
  // `swap` is the handover from the day's reader to the maker's own figure,
  // 0 before it starts and 1 once he is standing there. It runs as a card
  // flip in two halves: the reader turns edge-on and goes (or, on a painted
  // tier, dissolves under the bare road), then he turns in. Nothing slides
  // and nothing else on the frame moves.
  const swapAt = scene.voice && input.speaker ? scene.voice.thoughtStart - SWAP_LEAD : Infinity
  const swap = Math.min(1, Math.max(0, (at - swapAt) / SWAP_SEC))
  const out = Math.max(0, 1 - swap * 2)
  const inn = Math.max(0, swap * 2 - 1)
  ctx.save()
  if (bd.kind === 'loop') {
    await drawLoop(ctx, bd.video, t)
  } else if (bd.kind === 'still') {
    // A push of one and a half percent across the whole post: enough that the
    // frame is not a photograph, far short of a Ken Burns pan.
    cover(ctx, bd.image, bd.image.naturalWidth, bd.image.naturalHeight, 1 + 0.015 * (t / total))
  } else {
    cover(ctx, bd.scene, bd.scene.naturalWidth, bd.scene.naturalHeight, 1 + 0.012 * (t / total))
    // The reader STANDS on the road. This used to float — bobbing on a sine
    // and lit by a pulsing gold halo — which was the single most generated-
    // looking thing in the post. A figure with its feet on the ground and one
    // soft contact shadow reads as a painting instead.
    standFigure(ctx, bd.figure, 1, out)
  }
  // The painted tiers have the reader IN the painting, so what covers him is
  // the road he is standing on, brought up over the picture. It is the same
  // road: `speaker.scene` is the scene the still was painted from.
  if (swap > 0 && input.speaker && bd.kind !== 'builtin') {
    ctx.save()
    ctx.globalAlpha = 1 - out
    const sc = input.speaker.scene
    cover(ctx, sc, sc.naturalWidth, sc.naturalHeight, 1 + 0.012 * (t / total))
    ctx.restore()
  }
  if (input.speaker) standFigure(ctx, input.speaker.figure, 1, inn)
  ctx.restore()
  if (!chrome) return
  drawGrade(ctx, input.grade)

  // 2. Legibility washes, top and bottom.
  const top = ctx.createLinearGradient(0, 0, 0, 520)
  top.addColorStop(0, 'rgba(11,7,32,0.82)'); top.addColorStop(1, 'rgba(11,7,32,0)')
  ctx.fillStyle = top; ctx.fillRect(0, 0, WIDTH, 520)
  const bot = ctx.createLinearGradient(0, HEIGHT - 820, 0, HEIGHT)
  bot.addColorStop(0, 'rgba(11,7,32,0)'); bot.addColorStop(1, 'rgba(11,7,32,0.9)')
  ctx.fillStyle = bot; ctx.fillRect(0, HEIGHT - 820, WIDTH, 820)

  // 3. The hook, first and large. The brand and the reference used to head
  // every frame and the hook sat in the caption slot over silence; now the
  // one line written to stop a thumb is the first thing on screen, at 0.0s,
  // and both of the others wait for the end card (the reference is also the
  // last thing the reader says, so nobody leaves without it).
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  drawHook(ctx, input.hook, t, 250, 96, 920)

  // 4. Captions, from the first word.
  const endFade = easeOut((t - (lead + audioDur)) / 0.45)
  let phrase: TimedPhrase | null = null
  let age = 1
  if (at >= 0) {
    // Between two phrases the last one holds; before the FIRST there is
    // nothing to hold, and holding the final phrase there put the reference
    // on screen under the hook before a word had been said.
    const p = heldPhrase(phrases, at, audioDur)
    if (p && at < audioDur + 0.2) { phrase = p; age = (at - p.start) / 0.22 }
  }
  // 4b. The person speaking. An operator-voiced post carries a thought after
  // the verse, and for that stretch the photo appears in a round frame above
  // the captions — the painting stays, the reader figure stays, and the one
  // thing added is the face of whoever is talking, its ring breathing with
  // the voice. It fades in over the beat of silence before the first word.
  const vo = scene.voice
  if (vo && input.voice?.photo && at >= vo.thoughtStart - 0.5 && endFade < 1) {
    const rise = easeOut((at - (vo.thoughtStart - 0.5)) / 0.5)
    drawSpeaker(ctx, input.voice.photo, input.voice.label, WIDTH / 2, 1060, 135, voiceLevel(vo, at), rise * (1 - endFade))
  }
  // An OPENER may not push the hook off frame 0 — the one rule this layout
  // has. His voice still starts at LEAD under the hook, exactly as a reading
  // does; it is his WORDS that open, never a title card and never a face. So
  // the photo waits for the hook to fade and steps back out as the reading
  // begins, leaving the verse the frame it is read over.
  if (vo && input.opener?.photo && endFade < 1) {
    const show = HOOK_HOLD + 0.2
    const alpha = easeOut((at - show) / 0.5) * (1 - easeOut((at - (scene.openEnd ?? 0)) / 0.4))
    // HIGH in the frame, not at 1060 where the thought's photo sits.
    //
    // That position was measured for a post where the figure on screen WAS
    // him — the reader had already handed the road over — so a face over the
    // middle was a face over himself. Here the verse's own speaker stands
    // there for the whole post and never leaves, so the same coordinates put
    // his photo flat on Paul's chest: two subjects and one centre. The hook
    // has finished by the time this fades in, so the top of the frame is
    // empty and clears the figure's head.
    if (alpha > 0.01) drawSpeaker(ctx, input.opener.photo, input.opener.label, WIDTH / 2, 380, 130, voiceLevel(vo, at), alpha * (1 - endFade))
  }
  if (phrase && endFade < 1) {
    ctx.save()
    ctx.globalAlpha = Math.min(1, easeOut(age) + 0.35) * (1 - endFade)
    drawCaption(ctx, phrase, at, { x: WIDTH / 2, y: 1400, maxWidth: 880, size: 88, small: 70, stroke: 14 })
    ctx.restore()
  }

  // 5. End card.
  if (endFade > 0) {
    ctx.save()
    ctx.globalAlpha = endFade
    ctx.fillStyle = 'rgba(11,7,32,0.55)'
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
    drawBrand(ctx, 'VERSE ARCADE', input.reference, 190)
    // The maker, small, under the ask: the one place a face belongs on a
    // post that opens on the verse — a person standing behind the link.
    const face = input.voice?.photo ?? input.opener?.photo
    const faceLabel = input.voice?.label ?? input.opener?.label
    if (face) drawSpeaker(ctx, face, faceLabel ? `Made by ${faceLabel.split(' · ')[0]}` : undefined, WIDTH / 2, HEIGHT / 2 + 250, 90, 0, endFade)
    ctx.font = `800 76px ${FONT_DISPLAY}`
    outlined(ctx, 'Play today’s verse', WIDTH / 2, HEIGHT / 2 + 470)
    ctx.font = `800 58px ${FONT_DISPLAY}`
    outlined(ctx, SITE, WIDTH / 2, HEIGHT / 2 + 570, '#ffd23f')
    ctx.restore()
  }
}

// ---- encoding ---------------------------------------------------------------

interface Codec { ext: 'mp4' | 'webm'; video: VideoEncoderConfig; audio: AudioEncoderConfig }

const MP4: Codec = {
  ext: 'mp4',
  video: { codec: 'avc1.640028', width: WIDTH, height: HEIGHT, bitrate: 9_000_000, framerate: FPS, avc: { format: 'avc' } } as VideoEncoderConfig,
  audio: { codec: 'mp4a.40.2', sampleRate: SAMPLE_RATE, numberOfChannels: 1, bitrate: 128_000, aac: { format: 'aac' } } as AudioEncoderConfig,
}
const WEBM: Codec = {
  ext: 'webm',
  video: { codec: 'vp09.00.40.08', width: WIDTH, height: HEIGHT, bitrate: 9_000_000, framerate: FPS },
  audio: { codec: 'opus', sampleRate: SAMPLE_RATE, numberOfChannels: 1, bitrate: 96_000 },
}

async function pickCodec(): Promise<Codec> {
  if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') {
    throw new Error('This browser has no WebCodecs — use Chrome or Edge on a desktop.')
  }
  for (const c of [MP4, WEBM]) {
    const [v, a] = await Promise.all([VideoEncoder.isConfigSupported(c.video), AudioEncoder.isConfigSupported(c.audio)])
    if (v.supported && a.supported) return c
  }
  throw new Error('This browser can encode neither H.264/AAC nor VP9/Opus.')
}

// AAC-LC AudioSpecificConfig (ISO 14496-3): the two bytes an MP4's `esds`
// box needs before any player will decode the track. Chrome's encoder is
// supposed to hand this over in the first chunk's decoderConfig.description;
// when it doesn't, mp4-muxer writes an esds with no decoder info and every
// player treats the track as silence. That shipped: the video was perfect and
// mute. So the header is built here and used whenever the encoder's is absent.
//   5 bits audioObjectType (2 = LC) | 4 bits samplingFrequencyIndex | 4 bits channelConfiguration | 3 bits 0
function aacSpecificConfig(sampleRate: number, channels: number): Uint8Array {
  const rates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350]
  const idx = Math.max(0, rates.indexOf(sampleRate))
  const bits = (2 << 11) | (idx << 7) | (channels << 3)
  return new Uint8Array([(bits >> 8) & 0xff, bits & 0xff])
}

// AAC frames are always 1024 samples, so a finished MP4's audio timing table
// (`stts`) must say 1024 for every frame. It didn't, once: the encoder was fed
// 4800-sample chunks, which is not a multiple of 1024, and Chrome stamped the
// frame straddling each chunk boundary with the NEXT chunk's time — deltas of
// 704 and 1728 appeared, Chrome's own decoder shrugged, and QuickTime and
// TikTok played the video mute. This walks the box tree and refuses any
// audio track whose deltas are not all 1024. Pure over bytes so it can be run
// against a file in Node as well as in the browser.
export function mp4AudioDeltas(bytes: Uint8Array): number[] | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tag = (o: number) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3])
  let sttsOffset = -1
  const walk = (off: number, end: number, inSound: boolean) => {
    while (off + 8 <= end) {
      let size = dv.getUint32(off)
      const type = tag(off + 4)
      let hdr = 8
      if (size === 1) { size = Number(dv.getBigUint64(off + 8)); hdr = 16 } else if (size === 0) size = end - off
      if (size < hdr) return
      if (type === 'hdlr' && tag(off + hdr + 8) === 'soun') inSound = true
      if (type === 'stts' && inSound && sttsOffset < 0) sttsOffset = off + hdr
      if (['moov', 'trak', 'mdia', 'minf', 'stbl'].includes(type)) walk(off + hdr, off + size, type === 'trak' ? false : inSound)
      off += size
    }
  }
  walk(0, bytes.byteLength, false)
  if (sttsOffset < 0) return null
  const n = dv.getUint32(sttsOffset + 4)
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(dv.getUint32(sttsOffset + 12 + i * 8))
  return out
}

// Does the finished file carry an audible track? Decoded with the browser's
// own demuxer, so it answers the question a player would.
async function hasAudibleTrack(blob: Blob, ext: 'mp4' | 'webm'): Promise<boolean> {
  try {
    const buf = await blob.arrayBuffer()
    if (ext === 'mp4') {
      const deltas = mp4AudioDeltas(new Uint8Array(buf))
      if (!deltas || deltas.some((d) => d !== AAC_FRAME)) return false
    }
    const ctx = new OfflineAudioContext(1, 1, SAMPLE_RATE)
    const dec = await ctx.decodeAudioData(buf)
    const ch = dec.getChannelData(0)
    let peak = 0
    for (let i = 0; i < ch.length; i += 16) { const a = Math.abs(ch[i]); if (a > peak) peak = a }
    return peak > 0.01
  } catch {
    return false
  }
}

async function makeMuxer(codec: Codec) {
  if (codec.ext === 'mp4') {
    const { Muxer, ArrayBufferTarget } = await import('mp4-muxer')
    const target = new ArrayBufferTarget()
    const muxer = new Muxer({
      target,
      video: { codec: 'avc', width: WIDTH, height: HEIGHT, frameRate: FPS },
      audio: { codec: 'aac', sampleRate: SAMPLE_RATE, numberOfChannels: 1 },
      fastStart: 'in-memory',
    })
    return { muxer: muxer as Mp4Muxer<Mp4Target>, buffer: () => target.buffer, mime: 'video/mp4' }
  }
  const { Muxer, ArrayBufferTarget } = await import('webm-muxer')
  const target = new ArrayBufferTarget()
  const muxer = new Muxer({
    target,
    video: { codec: 'V_VP9', width: WIDTH, height: HEIGHT, frameRate: FPS },
    audio: { codec: 'A_OPUS', sampleRate: SAMPLE_RATE, numberOfChannels: 1 },
  })
  return { muxer, buffer: () => target.buffer, mime: 'video/webm' }
}

// Yield to the event loop WITHOUT a timer. setTimeout is throttled to once a
// second in a background tab (and once a minute after five), which turned a
// timer-paced 90-second render into something that looked stuck the moment
// the operator switched tabs. A MessageChannel task is not throttled that
// way. (Waiting on the encoder's `dequeue` event instead was measured at
// nearly three times slower per frame here — polling keeps the queue fed.)
const yieldChannel = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null
function tick(): Promise<void> {
  if (!yieldChannel) return new Promise((r) => setTimeout(r, 0))
  return new Promise((r) => { yieldChannel.port1.onmessage = () => r(); yieldChannel.port2.postMessage(null) })
}

const BED_LEVEL = 0.2 // the music under the voice, as a fraction of the bed's normalised 0.6 peak (about -20 dB under speech)

async function produce(
  draw: (ctx: CanvasRenderingContext2D, t: number) => Promise<void>,
  total: number, lead: number, samples: Float32Array,
  progress: (f: number, label: string) => void,
  bed?: Float32Array,
  cues?: Float32Array,
): Promise<{ blob: Blob; ext: 'mp4' | 'webm' }> {
  progress(0.02, 'Picking a codec')
  const codec = await pickCodec()

  // Audio: lead-in silence, the reading, tail silence — one track, 48 kHz mono.
  const totalFrames = Math.ceil(total * SAMPLE_RATE)
  const track = new Float32Array(totalFrames)
  track.set(samples.subarray(0, Math.min(samples.length, totalFrames - Math.round(lead * SAMPLE_RATE))), Math.round(lead * SAMPLE_RATE))
  if (bed) {
    // Fade the bed in over the lead and out over the end card, and keep it
    // low: the reading is the point, the music is the room it happens in.
    const fadeIn = Math.max(1, lead) * SAMPLE_RATE, fadeOut = 2.5 * SAMPLE_RATE
    for (let i = 0; i < totalFrames; i++) {
      const b = bed[i] ?? 0
      const env = Math.min(1, i / fadeIn, (totalFrames - i) / fadeOut)
      track[i] += b * BED_LEVEL * Math.max(0, env)
    }
  }
  // Game sounds (the quiz's ticks and chimes) are already at level.
  if (cues) for (let i = 0; i < Math.min(totalFrames, cues.length); i++) track[i] += cues[i]

  const encode = async (codec: Codec): Promise<Blob> => {
    const { muxer, buffer, mime } = await makeMuxer(codec)
    let encodeErr: Error | null = null

    const asc = aacSpecificConfig(SAMPLE_RATE, 1)
    let aacIndex = 0
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        let m = meta
        if (codec.ext === 'mp4' && !m?.decoderConfig?.description) {
          m = { ...m, decoderConfig: { ...(m?.decoderConfig ?? {}), codec: 'mp4a.40.2', sampleRate: SAMPLE_RATE, numberOfChannels: 1, description: asc } }
        }
        if (codec.ext === 'mp4') {
          // Stamp every AAC frame onto the 1024-sample grid ourselves rather
          // than trusting the encoder's timestamps — see mp4AudioDeltas.
          muxer.addAudioChunk(chunk, m, Math.round((aacIndex++ * AAC_FRAME * 1e6) / SAMPLE_RATE))
        } else {
          muxer.addAudioChunk(chunk, m)
        }
      },
      error: (e) => { encodeErr = e as Error },
    })
    audioEncoder.configure(codec.audio)
    // Feed the encoder in whole codec frames, so no frame straddles an input
    // boundary: 4 AAC frames, or 5 Opus packets.
    const CHUNK = codec.ext === 'mp4' ? AAC_FRAME * 4 : OPUS_FRAME * 5
    for (let i = 0; i < totalFrames; i += CHUNK) {
      const n = Math.min(CHUNK, totalFrames - i)
      const data = new AudioData({
        format: 'f32-planar', sampleRate: SAMPLE_RATE, numberOfFrames: n, numberOfChannels: 1,
        timestamp: Math.round((i / SAMPLE_RATE) * 1e6), data: track.subarray(i, i + n),
      })
      audioEncoder.encode(data)
      data.close()
    }
    await audioEncoder.flush()
    audioEncoder.close()
    if (encodeErr) throw encodeErr

    // Video.
    const canvas = document.createElement('canvas')
    canvas.width = WIDTH; canvas.height = HEIGHT
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('no 2d context')
    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => { encodeErr = e as Error },
    })
    videoEncoder.configure(codec.video)
    const frames = Math.ceil(total * FPS)
    for (let i = 0; i < frames; i++) {
      const t = i / FPS
      await draw(ctx, t)
      const frame = new VideoFrame(canvas, { timestamp: Math.round(t * 1e6), duration: Math.round(1e6 / FPS) })
      videoEncoder.encode(frame, { keyFrame: i % (FPS * 2) === 0 })
      frame.close()
      while (videoEncoder.encodeQueueSize > 6) await tick()
      if (encodeErr) throw encodeErr
      if (i % 10 === 0) progress(0.05 + 0.9 * (i / frames), `Rendering ${Math.round(t)}s / ${Math.round(total)}s (${codec.ext}) · frame ${i}/${frames}`)
    }
    await videoEncoder.flush()
    videoEncoder.close()
    if (encodeErr) throw encodeErr
    muxer.finalize()
    return new Blob([buffer()], { type: mime })
  }

  let used = codec
  let blob = await encode(codec)
  // The one check that matters: can a player hear it? An MP4 whose AAC track
  // decodes to nothing is re-rendered as WebM rather than handed over mute.
  progress(0.96, 'Checking the audio track')
  if (!(await hasAudibleTrack(blob, codec.ext))) {
    if (codec.ext === 'mp4') {
      used = WEBM
      const [v, a] = await Promise.all([VideoEncoder.isConfigSupported(WEBM.video), AudioEncoder.isConfigSupported(WEBM.audio)])
      if (!v.supported || !a.supported) throw new Error('The MP4 came out silent and this browser cannot encode WebM.')
      blob = await encode(WEBM)
      if (!(await hasAudibleTrack(blob, 'webm'))) throw new Error('The audio track came out silent on both codecs.')
    } else {
      throw new Error('The audio track came out silent.')
    }
  }
  return { blob, ext: used.ext }
}

export async function renderTikTok(input: RenderInput): Promise<RenderOutput> {
  const progress = input.onProgress ?? (() => {})
  progress(0, 'Decoding the reading')
  // Both voices are levelled the same way, for the reason speechLevel.ts
  // exists: his half and a synthesised half have landed six decibels apart in
  // both directions on this engine, and with an opener the handover is the
  // first ten seconds of the post.
  const read = levelSpeech(await decodeAudio(input.audio), SAMPLE_RATE, SPEECH_TARGET.verse)
  // His hook, then a beat, then the reading — the story layout's join
  // (`OWN_GAP`), reused rather than re-derived.
  let samples = read
  let readAt = 0
  let openEnd = 0
  let openerVoice: { rms: Float32Array; peak: number } | undefined
  if (input.opener) {
    const his = levelSpeech(await decodeAudio(input.opener.audio), SAMPLE_RATE, SPEECH_TARGET.verse)
    const gap = Math.round(OWN_GAP * SAMPLE_RATE)
    const joined = new Float32Array(his.length + gap + read.length)
    joined.set(his, 0)
    joined.set(read, his.length + gap)
    samples = joined
    openEnd = his.length / SAMPLE_RATE
    readAt = (his.length + gap) / SAMPLE_RATE
    openerVoice = envelope(his, SAMPLE_RATE)
  }
  const audioDur = samples.length / SAMPLE_RATE
  // The reading ends by saying the reference, so it is the last caption too —
  // and a clause of its own, which keeps the clause count matching the pauses.
  const verse = /[.!?]["'”’)]?$/.test(input.text.trim()) ? input.text.trim() : input.text.trim() + '.'
  let phrases: TimedPhrase[]
  let voice: Scene['voice']
  if (input.voice) {
    // The operator's recording: the verse's words as written, timed to where
    // they were said; the reference shown plain through the beat of silence
    // after them (the operator does not say it — the end card does); then
    // the thought, captioned from its own approved words.
    const v = input.voice
    const verseWords = verse.split(/\s+/).filter(Boolean)
    const versePhrases = groupWords(splitPhrases(verse), verseWords.map((text, i) => ({ text, start: v.verse[i]?.start ?? 0, end: v.verse[i]?.end ?? 0 })), audioDur)
    const thoughtText = v.thought.map((w) => w.text).join(' ')
    const thoughtPhrases = groupWords(splitPhrases(thoughtText, 6), v.thought, audioDur)
    const verseEnd = versePhrases.length ? Math.max(versePhrases[versePhrases.length - 1].start + 0.4, v.verse[v.verse.length - 1]?.end ?? 0) : 0
    const thoughtStart = thoughtPhrases[0]?.start ?? audioDur
    if (versePhrases.length) versePhrases[versePhrases.length - 1].end = Math.min(verseEnd, thoughtStart)
    const between: TimedPhrase[] = thoughtStart - verseEnd > 0.3 ? [{ text: input.reference, start: verseEnd, end: thoughtStart }] : []
    phrases = [...versePhrases, ...between, ...thoughtPhrases]
    const env = envelope(samples, SAMPLE_RATE)
    voice = { thoughtStart, rms: env.rms, peak: env.peak }
  } else if (input.opener) {
    // His words from their own approved transcript, then the verse's own
    // KNOWN text timed against the reading alone.
    //
    // Timing the reading needs the reading BY ITSELF: `timedCaptions` matches a
    // transcript to audio, and handing it the verse over a buffer that opens in
    // somebody else's voice makes it chase the wrong half — the same mistake
    // that made Tabitha's captions chase the tail of his.
    const openText = input.opener.words.length ? input.opener.words.map((w) => w.text).join(' ') : (input.opener.text ?? '')
    // Timed against HIS audio alone, for the reason the reading is: matching a
    // transcript to a buffer that also contains another voice makes it chase
    // the wrong half.
    const openPhrases = input.opener.words.length
      ? groupWords(splitPhrases(openText, 6), input.opener.words, openEnd)
      : await timedCaptions(splitPhrases(openText, 6), await decodeAudio(input.opener.audio), progress, input.align)
    const openPhrases2 = openPhrases
    const readPhrases = (await timedCaptions([...splitPhrases(verse), input.reference + '.'], read, progress, input.align))
      .map((ph) => ({ ...ph, start: ph.start + readAt, end: ph.end + readAt }))
    // Every phrase of his is CLOSED at the handover. A caption holds until the
    // next one so a pause is not a blank panel, and the last one of a half has
    // nothing after it to stop it — which once left his closing words on screen
    // fourteen seconds into Tabitha's telling. Concatenated in SPEAKING order
    // for the same reason, so the frame lookup finds the right one first.
    for (const ph of openPhrases2) ph.end = Math.min(ph.end, readAt)
    phrases = [...openPhrases2, ...readPhrases]
    voice = openerVoice ? { thoughtStart: 0, rms: openerVoice.rms, peak: openerVoice.peak } : undefined
  } else {
    phrases = await timedCaptions([...splitPhrases(verse), input.reference + '.'], samples, progress, input.align)
  }
  const lead = LEAD
  const total = lead + audioDur + TAIL_SEC
  const scene: Scene = { input, lead, audioDur, total, phrases, voice, openEnd }

  try { await document.fonts.load(`800 88px "Baloo 2"`) } catch { /* fall back to the stack */ }

  // The music sits a little lower under a person than under Gemini's
  // reading: a real voice has quiet words a synthetic one does not.
  const bed = (input.voice || input.opener) && input.bed ? input.bed.map((x) => x * 0.65) : input.bed
  const { blob, ext } = await produce((ctx, t) => drawFrame(ctx, scene, t), total, lead, samples, progress, bed)
  progress(1, 'Done')
  return { blob, ext, durationSec: total, phrases }
}

// A single frame as a PNG data URL — the preview poster in the panel, and the
// still the Veo step animates when no Nano Banana render exists yet.
export async function renderPoster(input: Omit<RenderInput, 'audio' | 'onProgress'>, t = 0.6, chrome = true): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH; canvas.height = HEIGHT
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('no 2d context')
  try { await document.fonts.load(`800 88px "Baloo 2"`) } catch { /* fine */ }
  // Real captions in the preview, timed proportionally over a nominal half
  // minute — the same reason the story poster carries them.
  const verse = /[.!?]["'\u201d\u2019)]?$/.test(input.text.trim()) ? input.text.trim() : input.text.trim() + '.'
  const phrases = alignPhrases([...splitPhrases(verse), input.reference + '.'], [[0, 30]], 30)
  await drawFrame(ctx, { input: { ...input, audio: new ArrayBuffer(0) }, lead: LEAD, audioDur: 30, total: 34, phrases }, t, chrome)
  return canvas.toDataURL('image/png')
}

/**
 * The day's NOTE card — a still, for the one post that is not a video.
 *
 * Facebook distributes a photo-and-text post through different machinery
 * than a Reel, so it is reach the video is not already buying; and it is the
 * one format where the story behind a verse can be READ rather than watched.
 * The card is what sits above the words.
 *
 * It is **4:5 (1080x1350), not the video's 9:16**, which is the whole reason
 * it is a second renderer rather than `renderPoster`. A feed photo is shown
 * at 4:5 at most; handing the feed a 9:16 frame gets it cropped or pillared,
 * and the video poster carries a caption panel and an end-card besides — both
 * of them chrome for a thing that is playing, on a card that never plays.
 *
 * So it draws the day's own painting, the reader standing on it, and the
 * verse set as large as it will go. No caption panel, no hook, no ask: the
 * words are in the post, and a graphic repeating them is a graphic nobody
 * reads twice.
 */
export const CARD_W = 1080
export const CARD_H = 1350

export async function renderNoteCard(input: { reference: string; text: string; backdrop: Backdrop; grade?: 'dusk' | 'night' }): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_W; canvas.height = CARD_H
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('no 2d context')
  try { await document.fonts.load(`800 88px "Baloo 2"`) } catch { /* fine */ }

  // The card's own cover: the module's `cover` is sized to the video frame.
  const fill = (src: CanvasImageSource, sw: number, sh: number, anchorY = 0.5) => {
    const sc = Math.max(CARD_W / sw, CARD_H / sh)
    const w = sw * sc, h = sh * sc
    ctx.drawImage(src, (CARD_W - w) / 2, (CARD_H - h) * anchorY, w, h)
  }

  const bd = input.backdrop
  if (bd.kind === 'still') fill(bd.image, bd.image.naturalWidth, bd.image.naturalHeight, 0.35)
  else if (bd.kind === 'loop') fill(bd.video, bd.video.videoWidth || 1080, bd.video.videoHeight || 1920, 0.35)
  else {
    fill(bd.scene, bd.scene.naturalWidth, bd.scene.naturalHeight, 0.35)
    // The reader stands on the road, feet on the ground, exactly as in the
    // video — a floating figure is the thing this account cannot afford.
    const fh = CARD_H * 0.42
    const fw = (bd.figure.naturalWidth / bd.figure.naturalHeight) * fh
    const cx = CARD_W / 2, feet = CARD_H * 0.56
    ctx.save()
    ctx.globalAlpha = 0.32
    ctx.fillStyle = '#1a0f36'
    ctx.beginPath(); ctx.ellipse(cx, feet - 6, fw * 0.3, 18, 0, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
    ctx.imageSmoothingQuality = 'high'
    // Same offset as the video's `standFigure`: the FEET go on the ground
    // line, not the file's empty bottom edge.
    ctx.drawImage(bd.figure, cx - fw / 2, feet - fh + bottomPad(bd.figure) * fh, fw, fh)
  }

  if (input.grade) {
    ctx.save()
    ctx.globalCompositeOperation = 'multiply'
    ctx.fillStyle = input.grade === 'dusk' ? 'rgba(255,160,90,0.55)' : 'rgba(70,90,170,0.75)'
    ctx.fillRect(0, 0, CARD_W, CARD_H)
    ctx.restore()
  }

  // Legibility washes: a band under the brand and a deeper one under the verse.
  const top = ctx.createLinearGradient(0, 0, 0, 300)
  top.addColorStop(0, 'rgba(11,7,32,0.78)'); top.addColorStop(1, 'rgba(11,7,32,0)')
  ctx.fillStyle = top; ctx.fillRect(0, 0, CARD_W, 300)
  const bot = ctx.createLinearGradient(0, CARD_H - 700, 0, CARD_H)
  bot.addColorStop(0, 'rgba(11,7,32,0)'); bot.addColorStop(0.45, 'rgba(11,7,32,0.82)'); bot.addColorStop(1, 'rgba(11,7,32,0.96)')
  ctx.fillStyle = bot; ctx.fillRect(0, CARD_H - 700, CARD_W, 700)

  ctx.save()
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.font = `800 30px ${FONT_DISPLAY}`
  ctx.letterSpacing = '6px'
  ctx.fillStyle = '#ffd23f'
  ctx.fillText('VERSE ARCADE', CARD_W / 2, 74)
  ctx.letterSpacing = '0px'

  const verse = input.text.trim()
  const { lines, lh } = fitText(ctx, `\u201c${verse}\u201d`, CARD_W - 130, [76, 68, 60, 54, 48, 42, 38], 560)
  let y = CARD_H - 190 - (lines.length - 1) * lh
  ctx.fillStyle = '#ffffff'
  for (const line of lines) { ctx.fillText(line, CARD_W / 2, y); y += lh }

  ctx.font = `700 46px ${FONT_DISPLAY}`
  ctx.fillStyle = '#ffd23f'
  ctx.fillText(input.reference, CARD_W / 2, CARD_H - 96)
  ctx.restore()

  return await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('no blob'))), 'image/jpeg', 0.9))
}

// ---- story time -----------------------------------------------------------------
//
// The evening post: Tabitha telling the story behind the day's verse to a
// circle of children in her library, with the words she is saying on a panel
// above her, lit a word at a time. Same engine, same checks as the verse post.

export interface StoryInput {
  title: string
  reference: string
  verseText: string
  /** Spoken paragraphs, in order. The LAST one is the verse and its reference. */
  paragraphs: string[]
  hook?: string
  /**
   * Tabitha's telling. OPTIONAL, and its absence is what makes the weekday
   * readings possible: with no telling, `own` is not a half joined to hers —
   * it is the whole post, his voice over held paintings. Everything else on
   * this layout (the cuts, the settle, the caption clamp, the end card) is
   * the same code either way. See docs/TIKTOK-WEEK.md.
   */
  audio?: ArrayBuffer
  /** The room — a painting of the story circle, or a Veo loop of one. */
  room: HTMLImageElement | HTMLVideoElement
  /** The teller's render, for a room that does not already have her in it. */
  teller?: HTMLImageElement
  /** The small-caps line over the title. Defaults to the story's own. */
  eyebrow?: string
  /**
   * Where each paragraph is SET: one held painting per paragraph, cut to on
   * that paragraph's first word. A null entry (and a missing array) is the
   * room, so a story with no stages renders exactly as it always did — and
   * the LAST paragraph is the verse, which is read in the library by
   * construction, because coming back is what makes the middle feel like
   * somewhere she took you.
   *
   * A cut is the whole of the motion this adds. The rule on this layout is
   * that the only thing moving is the caption; a hard cut between two held
   * paintings is not movement, which is exactly why it is affordable here
   * where a Veo loop or a drifting mote is not.
   */
  scenes?: Array<HTMLImageElement | null>
  /**
   * The dark stage the operator's own half stands on, with his figure on it.
   *
   * His half used to play over Tabitha's library with his photo growing into
   * the middle of it, and the objection that kept the day's READER swap off
   * this layout applies to that too: a second person in her room is a
   * stranger in somebody else's library. A stage of his own dissolves it —
   * it is not her room, so he is not standing in it. The figure REPLACES the
   * photo ring while it is up (he is already on screen; two of him is one
   * too many) and the photo still closes the post on the end card. No
   * figure, or no stage, falls back to the ring over the library exactly as
   * before.
   */
  stage?: { backdrop: HTMLImageElement; figure?: HTMLImageElement }
  bed?: Float32Array
  align?: boolean
  /**
   * The operator's own half of the story, in his own voice. His recording is
   * joined onto Tabitha's with a beat between them, his words are captioned
   * from their own timings, and his photo grows into the middle of the frame
   * while he speaks. Absent on an automated story, which then renders
   * exactly as it always did.
   */
  own?: {
    audio: ArrayBuffer
    /** His words, timed against his OWN recording — 0 is the start of it, not of the video. */
    words: TimedWord[]
    text: string
    /**
     * Which end he speaks at. 'close' answers the telling; 'open' introduces
     * it and hands over to Tabitha by name. A day carries one or the other,
     * never both — two turns from the same voice around one story is a
     * conversation, and there is only one person in it.
     */
    place: 'open' | 'close'
    photo?: HTMLImageElement
    label?: string
  }
  onProgress?: (fraction: number, label: string) => void
}

/** The beat between the two voices, whichever order they speak in. */
const OWN_GAP = 0.9

interface StoryScene {
  input: StoryInput
  lead: number
  audioDur: number
  total: number
  phrases: TimedPhrase[]
  /** Index of the paragraph each phrase belongs to. */
  para: number[]
  /** When each paragraph starts, seconds into the audio. */
  paraStart: number[]
  /** When the operator speaks, seconds into the joined audio; Infinity when he doesn't. */
  ownAt: number
  /** When he stops. */
  ownEnd: number
  /**
   * When his photo starts growing in, and when it starts going back out —
   * both in audio time. Introducing, he waits for the HOOK to have had the
   * opening frames to itself (the one rule this layout may not break) and
   * steps back out as Tabitha begins; closing, he arrives just before his
   * first word and stays, because there is nothing after him.
   */
  ownShow: number
  ownHide: number
  /** His voice's envelope, so the ring breathes with him rather than with her. */
  ownVoice?: { rms: Float32Array; peak: number }
  /**
   * The cuts, in order, in AUDIO time: what is behind the words from this
   * moment until the next entry. Built once in `renderStory` rather than
   * decided per frame, so the settle below can be measured from the cut and
   * the poster can be told to draw any moment of it.
   */
  shots: Shot[]
}

interface Shot {
  at: number
  /** Null draws the room — the library, and the fallback for everything. */
  img: HTMLImageElement | null
  /** His stage, which also carries his figure instead of the photo ring. */
  own?: boolean
}

/**
 * How long a fresh shot takes to settle, and how much wider it starts.
 *
 * The paintings on this layout are held nearly still — a 2% push over the
 * whole minute — and that is the rule rather than a taste. What a cut adds is
 * one camera being PLACED: the new picture arrives fractionally wide and
 * settles, which reads as a shot rather than as a slide. It is the same
 * grammar on every cut, including the handover into the library, so it is not
 * an effect applied to one moment.
 */
const SHOT_SETTLE = 0.9
const SHOT_PUSH = 0.035
/**
 * Where he stands on his own stage.
 *
 * Measured against two fixed things rather than chosen: the pool of light in
 * `own.jpg` is centred at 0.77 of the frame once `cover` has anchored the
 * painting to its bottom edge, and this layout's caption panel ends at y=668.
 * Feet at 0.79 put him IN the light; 0.41 high puts his head at ~730, clear
 * of the panel with room to spare, and at the same size the morning post's
 * figure is drawn. Re-render the stage and both numbers have to be checked
 * again — the light moves.
 */
const STORY_STAND = { feet: 0.79, height: 0.41 }

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function contain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.min(w / img.naturalWidth, h / img.naturalHeight)
  const dw = img.naturalWidth * s, dh = img.naturalHeight * s
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}

/** The shot covering a moment, and when it was cut to. */
function shotAt(shots: Shot[], at: number): Shot {
  let hit = shots[0]
  for (const s of shots) { if (s.at <= at) hit = s; else break }
  return hit
}

async function drawStoryFrame(ctx: CanvasRenderingContext2D, sc: StoryScene, t: number, chrome = true) {
  const { input, lead, audioDur, total, phrases, para, paraStart, ownAt, ownShow, ownHide, ownVoice, shots } = sc
  const at = t - lead
  void para; void paraStart

  // 1. Where we are. A painting held almost still — anchored to its BOTTOM
  // edge, so the ground sits low in the frame and the quiet upper half is
  // where the caption panel goes — with a fresh shot arriving fractionally
  // wide and settling. A loop is still played forward, and is only ever the
  // library.
  const shot = shotAt(shots, at)
  const settle = SHOT_PUSH * (1 - easeOut((at - shot.at) / SHOT_SETTLE))
  const zoom = 1.08 + 0.02 * (t / total) + Math.max(0, settle)
  const roomIsLoop = !shot.img && input.room instanceof HTMLVideoElement
  if (roomIsLoop) {
    await drawLoop(ctx, input.room as HTMLVideoElement, t)
  } else {
    const bg = shot.img ?? (input.room as HTMLImageElement)
    cover(ctx, bg, bg.naturalWidth, bg.naturalHeight, zoom, 1)
  }
  const top = ctx.createLinearGradient(0, 0, 0, 820)
  top.addColorStop(0, 'rgba(11,7,32,0.9)'); top.addColorStop(1, 'rgba(11,7,32,0)')
  ctx.fillStyle = top; ctx.fillRect(0, 0, WIDTH, 820)
  const bot = ctx.createLinearGradient(0, HEIGHT - 420, 0, HEIGHT)
  bot.addColorStop(0, 'rgba(11,7,32,0)'); bot.addColorStop(1, 'rgba(11,7,32,0.55)')
  ctx.fillStyle = bot; ctx.fillRect(0, HEIGHT - 420, WIDTH, 420)

  // 2. The teller, for a room that does not already have her — and only
  // where she IS. On a stage she is narrating what happened there, not
  // standing in it, and on his stage she is not in the post at all.
  if (input.teller && !roomIsLoop && !shot.img) {
    const th = 640, tw = (input.teller.naturalWidth / input.teller.naturalHeight) * th
    ctx.save()
    ctx.imageSmoothingQuality = 'high'
    ctx.globalAlpha = 0.32
    ctx.fillStyle = '#1a0f36'
    ctx.beginPath(); ctx.ellipse(60 + tw / 2, HEIGHT - 36, tw * 0.3, 20, 0, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1
    ctx.drawImage(input.teller, 60, HEIGHT - 30 - th, tw, th)
    ctx.restore()
  }

  if (!chrome) return

  // 3. The hook first, where the header will be: the story's own most
  // dramatic sentence, large, at 0.0s. The brand and the title take the
  // top of the frame over from it once it has done its work.
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  const hasHook = !!input.hook?.trim()
  drawHook(ctx, input.hook, t, 200, 72, 900)
  const headIn = hasHook ? easeOut((t - (HOOK_HOLD - 0.3)) / 0.4) : 1
  if (headIn > 0) {
    ctx.save()
    ctx.globalAlpha = headIn
    ctx.font = `800 32px ${FONT_DISPLAY}`
    ctx.letterSpacing = '6px'
    outlined(ctx, input.eyebrow ?? 'VERSE ARCADE · STORY TIME', WIDTH / 2, 150, '#ffd23f', 'rgba(11,7,32,0.85)', 8)
    ctx.letterSpacing = '0px'
    ctx.font = `700 54px ${FONT_DISPLAY}`
    wrap(ctx, input.title, 900).forEach((l, i) => outlined(ctx, l, WIDTH / 2, 218 + i * 60))
    ctx.restore()
  }

  // 4. The panel: the story's own words, lit a word at a time.
  //
  // This is where the picture cards used to be — a deck of app art that
  // changed per paragraph. Two things were wrong with it: the pictures were
  // only ever loosely about the sentence being spoken, and at that size they
  // left the room itself as a strip behind them. A smaller panel gives the
  // scene back the frame, and what it holds is the one thing that is exactly
  // about the words: the words.
  const endFade = easeOut((t - (lead + audioDur)) / 0.5)
  const px = 90, pw = WIDTH - 180, py = 296, ph = 372
  let phrase: TimedPhrase | null = null
  let age = 1
  if (at >= 0) {
    const p = heldPhrase(phrases, at, audioDur)
    if (p && at < audioDur + 0.2) { phrase = p; age = (at - p.start) / 0.22 }
  }
  // The panel arrives WITH the first word, not before it.
  //
  // A caption holds through a pause on purpose — a blank panel mid-sentence
  // reads as a dropout — but that argument says nothing about the seconds
  // BEFORE anybody has spoken, and there an empty bordered box under the hook
  // reads as a layout that failed to load. It never showed on the story
  // layout because Tabitha's telling starts under the hook; a reading whose
  // recording opens with a breath put it on screen. Found by pulling the
  // frame, not from the log.
  const first = phrases[0]?.start ?? 0
  const panelIn = easeOut((at - (first - 0.25)) / 0.3)
  if (endFade < 1 && panelIn > 0) {
    ctx.save()
    ctx.globalAlpha = (1 - endFade) * panelIn
    roundRect(ctx, px, py, pw, ph, 40)
    ctx.fillStyle = 'rgba(21,10,52,0.82)'
    ctx.fill()
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,210,63,0.7)'; ctx.stroke()
    ctx.font = `800 26px ${FONT_DISPLAY}`
    ctx.letterSpacing = '5px'
    ctx.fillStyle = 'rgba(255,210,63,0.8)'
    ctx.fillText(input.reference.toUpperCase(), WIDTH / 2, py + 44)
    ctx.letterSpacing = '0px'
    if (phrase) {
      ctx.globalAlpha = (1 - endFade) * panelIn * Math.min(1, easeOut(age) + 0.4)
      drawCaption(ctx, phrase, at, { x: WIDTH / 2, y: py + ph / 2 + 22, maxWidth: pw - 96, size: 64, small: 54, stroke: 8, dim: 0.42 })
    }
    ctx.restore()
  }

  // 5b. The maker, speaking.
  //
  // The ONE thing his half adds to the frame, and it is on screen only while
  // he is talking: his photo grows into the middle of the picture as he
  // begins, its ring breathing with HIS voice rather than hers. It is
  // deliberately not a small corner circle carried through the whole video —
  // a permanent overlay is what made these posts read as generated in the
  // first place, and on the verse layout a photo held over the reader was
  // taken for a badge pinned to their chest.
  //
  // On his own stage the FIGURE carries it instead — he is already on
  // screen, and a photograph of the same person floating over him is him
  // twice. The photo still closes the post on the end card.
  const onStage = shot.own && !!input.stage?.figure
  if (input.own && onStage && endFade < 1) {
    const grow = easeOut((at - ownShow) / 0.55)
    const out = 1 - easeOut((at - ownHide) / 0.55)
    // Lower and larger than the road's figure, because this layout's caption
    // panel occupies the band the road leaves empty: his head has to clear
    // 668, which is the bottom of it.
    if (out > 0) standFigure(ctx, input.stage!.figure!, grow * out * (1 - endFade), 1, STORY_STAND)
  } else if (input.own?.photo && at >= ownShow && endFade < 1) {
    const grow = easeOut((at - ownShow) / 0.55)
    // Introducing, he goes back out as she starts, so the last thing before
    // her first word is her room and not his face.
    const out = 1 - easeOut((at - ownHide) / 0.55)
    if (out > 0) drawSpeaker(ctx, input.own.photo, input.own.label, WIDTH / 2, 1080, 44 + 126 * grow * out,
      ownVoice ? voiceLevel(ownVoice, at - ownAt) : 0, grow * out * (1 - endFade))
  }

  // 6. End card.
  if (endFade > 0) {
    ctx.save()
    ctx.globalAlpha = endFade
    ctx.fillStyle = 'rgba(11,7,32,0.6)'; ctx.fillRect(0, 0, WIDTH, HEIGHT)
    // The header (brand and title) is still drawn above; no second brand line.
    ctx.font = `700 56px ${FONT_DISPLAY}`
    const lines = wrap(ctx, input.verseText, 880)
    const lh = 68
    const y0 = HEIGHT / 2 - 200 - ((lines.length - 1) * lh) / 2
    lines.forEach((l, i) => outlined(ctx, l, WIDTH / 2, y0 + i * lh))
    ctx.font = `800 44px ${FONT_DISPLAY}`
    outlined(ctx, input.reference, WIDTH / 2, y0 + lines.length * lh + 20, '#ffd23f')
    // A person standing behind the link, exactly as the verse post's end card
    // does it — only on a day he actually spoke.
    if (input.own?.photo) drawSpeaker(ctx, input.own.photo, input.own.label ? `Made by ${input.own.label.split(' · ')[0]}` : undefined, WIDTH / 2, HEIGHT / 2 + 150, 78, 0, endFade)
    ctx.font = `800 64px ${FONT_DISPLAY}`
    outlined(ctx, 'Play today’s verse', WIDTH / 2, HEIGHT / 2 + 380)
    ctx.font = `800 52px ${FONT_DISPLAY}`
    outlined(ctx, SITE, WIDTH / 2, HEIGHT / 2 + 470, '#ffd23f')
    ctx.restore()
  }
}

// A story's paragraphs as caption phrases, with the paragraph each belongs
// to. One copy, because the poster has to split them exactly as the render
// does or the preview is of a different post.
function storyTexts(paragraphs: string[]): { texts: string[]; para: number[] } {
  const texts: string[] = []
  const para: number[] = []
  paragraphs.forEach((p, i) => {
    const trimmed = p.trim()
    const ended = /[.!?]["'\u201d\u2019)]?$/.test(trimmed) ? trimmed : trimmed + '.'
    // A story is read at a talking pace, so a caption can hold a word more.
    for (const ph of splitPhrases(ended, 7)) { texts.push(ph); para.push(i) }
  })
  return { texts, para }
}

/**
 * The cuts, in speaking order.
 *
 * His half owns the frame for as long as he is talking — his own dark stage,
 * introducing or answering — and the telling cuts once per paragraph to
 * wherever that paragraph is set. Two guarantees are worth stating because
 * they are what stop this becoming a slideshow:
 *
 *   - **A shot never starts before the words it belongs to.** Cuts are the
 *     paragraph starts `renderStory` already measured off the recording, so
 *     one lands on a sentence boundary or not at all.
 *   - **Consecutive identical shots are collapsed.** Two paragraphs on the
 *     same stage, or a stage that fell back to the library beside the
 *     library, is ONE held painting rather than a cut to itself — which
 *     would settle for 0.9s in the middle of a sentence and read as a
 *     glitch.
 */
function storyShots(input: StoryInput, paraStart: number[], ownAt: number, ownEnd: number, toldAt: number, open: boolean, reading = false): Shot[] {
  const staged = (i: number): HTMLImageElement | null => input.scenes?.[i] ?? null
  // A READING has no paragraph timings to cut on — there is no telling to
  // measure — so its pictures are spread evenly across his recording. Even
  // rather than clever: a shot that lands mid-clause reads as a glitch, and
  // without a transcript-to-audio match there is nothing better than equal
  // shares to land it on.
  if (reading) {
    const n = input.scenes?.length ?? 0
    if (!n) return [{ at: -Infinity, img: null }]
    const span = Math.max(ownEnd - ownAt, 1) / n
    const shots = input.scenes!.map((img, i) => ({ at: ownAt + i * span, img }))
      .filter((s, i, a) => i === 0 || s.img !== a[i - 1].img)
    return [{ ...shots[0], at: -Infinity }, ...shots.slice(1)]
  }
  const told: Shot[] = paraStart.map((at, i) => ({ at, img: staged(i) }))
  const his: Shot[] | null = input.own && input.stage
    ? [{ at: open ? 0 : ownAt, img: input.stage.backdrop, own: true }]
    : null
  let shots: Shot[] = his
    ? open
      // He opens on his stage; the telling cuts in as Tabitha begins, so the
      // first thing after his last word is where the story happens.
      //
      // At `toldAt` — where her AUDIO starts — and deliberately not at her
      // first captioned WORD. Measured off a real render, her reading carries
      // 2.8s of lead-in before it, and holding his stage across it left three
      // and a half seconds of an empty pool of light after he had already
      // faded out. What is left is the 0.9s `OWN_GAP`, which is the beat
      // between the two voices and is meant to be there.
      ? [...his, ...told.map((s, i) => (i === 0 ? { ...s, at: toldAt } : s))]
      // He answers it, so his stage is the last shot before the end card.
      : [...told, ...his]
    : told
  shots = shots.filter((s, i) => i === 0 || s.img !== shots[i - 1].img || !!s.own !== !!shots[i - 1].own)
  // The lead-in belongs to whatever is first.
  if (shots.length) shots[0] = { ...shots[0], at: -Infinity }
  return shots.length ? shots : [{ at: -Infinity, img: null }]
}

export async function renderStory(input: StoryInput): Promise<RenderOutput> {
  const progress = input.onProgress ?? (() => {})
  progress(0, 'Decoding the story')
  // No telling ⇒ a READING: his recording is the whole track. Nothing below
  // special-cases it beyond this — an empty `told` makes the joins no-ops.
  // Tabitha is levelled the same way his half is. Her loudness is whatever
  // the text-to-speech returned that run — two runs of the same kind of
  // telling measured 4.2 LU apart — so leaving it raw makes the balance
  // between the two speakers a matter of luck, and the handover sits in the
  // first twenty seconds of the post. See speechLevel.ts.
  const told = input.audio ? levelSpeech(await decodeAudio(input.audio), SAMPLE_RATE, SPEECH_TARGET.story) : new Float32Array(0)
  const reading = !input.audio
  const open = input.own?.place === 'open'
  let samples = told
  let ownAt = Infinity
  let ownEnd = Infinity
  // Where Tabitha's own timeline sits inside the joined audio. Zero unless
  // he speaks first, and every caption of hers is shifted by it.
  let toldAt = 0
  let ownVoice: { rms: Float32Array; peak: number } | undefined
  if (input.own) {
    const his = await decodeAudio(input.own.audio)
    // A reading has nothing to leave a beat between.
    const gap = reading ? 0 : Math.round(OWN_GAP * SAMPLE_RATE)
    const joined = new Float32Array(told.length + gap + his.length)
    if (open) {
      joined.set(his, 0)
      joined.set(told, his.length + gap)
      ownAt = 0
      toldAt = (his.length + gap) / SAMPLE_RATE
    } else {
      joined.set(told, 0)
      joined.set(his, told.length + gap)
      ownAt = (told.length + gap) / SAMPLE_RATE
    }
    samples = joined
    ownEnd = ownAt + his.length / SAMPLE_RATE
    ownVoice = envelope(his, SAMPLE_RATE)
  }
  const audioDur = samples.length / SAMPLE_RATE
  const { texts, para } = storyTexts(input.paragraphs)
  // Tabitha's captions are timed against HER samples alone. `timedCaptions`
  // matches a transcript to a recording, so handing it her minute of words
  // over audio that ends in somebody else's voice makes it chase the tail
  // and stretch her last phrases across his.
  const hers = reading ? [] : await timedCaptions(texts, told, progress, input.align)
  if (toldAt) for (const p of hers) { p.start += toldAt; p.end += toldAt }
  const paraStart = input.paragraphs.map((_, i) => hers[para.indexOf(i)]?.start ?? 0)
  let phrases = hers
  if (input.own) {
    // A caption HOLDS until the next one begins, so that it is not a blank
    // panel through a pause — and the last caption of a half has nothing
    // after it to stop it running into the other speaker's. The frame lookup
    // takes the FIRST phrase whose span covers the moment, so the one that
    // over-ran simply shadowed the one that should be showing: fourteen
    // seconds of his voice under her words, and it rendered perfectly the
    // whole time. Every phrase is therefore closed at the moment the other
    // voice starts, and the two halves are concatenated in SPEAKING order so
    // the lookup finds the right one first. The verse layout has carried the
    // same line since it gained a thought
    // (`versePhrases[last].end = min(verseEnd, thoughtStart)`); this is that
    // rule on the layout that grew a second speaker later.
    const handover = open ? toldAt : ownAt
    const shifted = input.own.words.map((w) => ({ ...w, start: w.start + ownAt, end: w.end + ownAt }))
    const his = groupWords(splitPhrases(input.own.text, 6), shifted, open ? toldAt : audioDur)
    for (const p of open ? his : hers) {
      if (p.end > handover) p.end = handover
      if (p.start > handover) p.start = handover
    }
    phrases = open ? [...his, ...hers] : [...hers, ...his]
  }
  const lead = LEAD
  const total = lead + audioDur + TAIL_SEC + 1.2
  try { await document.fonts.load(`800 70px "Baloo 2"`) } catch { /* fine */ }
  // The hook owns the opening frames and nothing may be put in front of it,
  // so an INTRODUCTION's photo waits for the hook to fade rather than
  // arriving with his first word. A closing word has no such contest.
  //
  // A READING draws no photo ring at all. On the story layout the ring is on
  // screen only while he speaks, and in a reading he speaks throughout — a
  // photograph held over the whole post is the permanent overlay that made
  // these read as generated in the first place, and on the verse layout one
  // held over the reader was taken for a badge pinned to their chest. The
  // painting carries the post; he closes it on the end card, as he already
  // does.
  const ownShow = !input.own || reading
    ? Infinity
    : (open ? Math.max(ownAt - 0.35, (input.hook ? HOOK_HOLD - 0.4 : 0) - lead) : ownAt - 0.35)
  const ownHide = open ? ownEnd : Infinity
  const sc: StoryScene = { input, lead, audioDur, total, phrases, para, paraStart, ownAt, ownEnd, ownShow, ownHide, ownVoice, shots: storyShots(input, paraStart, ownAt, ownEnd, toldAt, open, reading) }
  const { blob, ext } = await produce((ctx, t) => drawStoryFrame(ctx, sc, t), total, lead, samples, progress, input.bed)
  progress(1, 'Done')
  return { blob, ext, durationSec: total, phrases }
}

/** The length of a reading, for callers sizing a timeline around it. */
export async function audioSeconds(audio: ArrayBuffer): Promise<number> {
  const samples = await decodeAudio(audio)
  return samples.length / SAMPLE_RATE
}

/** How long a story or verse post will run, so a music bed can be rendered to fit. */
export async function plannedDuration(audio: ArrayBuffer | undefined, hook: string | undefined, story: boolean, own?: ArrayBuffer): Promise<number> {
  void hook // the hook no longer holds the voice back; it plays over the first words
  // A reading has no telling; `own` is the whole track and there is no beat
  // to leave between two voices.
  const samples = audio ? await decodeAudio(audio) : new Float32Array(0)
  if (!audio) return LEAD + (own ? (await decodeAudio(own)).length / SAMPLE_RATE : 0) + TAIL_SEC + (story ? 1.2 : 0)
  // His half lengthens the post, and a bed rendered for the telling alone would
  // run out under the operator's own voice — silence under the one part of
  // the post a person actually spoke.
  const extra = own ? OWN_GAP + (await decodeAudio(own)).length / SAMPLE_RATE : 0
  return LEAD + samples.length / SAMPLE_RATE + extra + TAIL_SEC + (story ? 1.2 : 0)
}

export async function renderStoryPoster(input: Omit<StoryInput, 'audio' | 'onProgress'> & { phrases?: TimedPhrase[] }, t = 2.5, chrome = true): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH; canvas.height = HEIGHT
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('no 2d context')
  try { await document.fonts.load(`800 70px "Baloo 2"`) } catch { /* fine */ }
  const n = input.paragraphs.length
  // The preview carries real captions, timed proportionally over a nominal
  // minute: a poster of this layout with an empty panel would be a poster of
  // the wrong layout.
  const { texts, para } = storyTexts(input.paragraphs)
  const phrases = input.phrases ?? alignPhrases(texts, [[0, 60]], 60)
  await drawStoryFrame(ctx, { input: { ...input, audio: new ArrayBuffer(0) }, lead: LEAD, audioDur: 60, total: 65, phrases, para, paraStart: Array.from({ length: n }, (_, i) => i * (60 / n)), ownAt: Infinity, ownEnd: Infinity, ownShow: Infinity, ownHide: Infinity, shots: storyShots({ ...input, audio: new ArrayBuffer(0), own: undefined }, Array.from({ length: n }, (_, i) => i * (60 / n)), Infinity, Infinity, 0, false) }, t, chrome)
  return canvas.toDataURL('image/png')
}

// ---- yesterday's quiz ------------------------------------------------------------
//
// The third post: a CPU player plays YESTERDAY's five questions against the
// clock, and the viewer plays along. The clock runs all the way down on every
// question — the reveal waits for zero even when the CPU has locked in — so
// there is always time to read four options and pick one before the answer
// shows. It is a shade faster than the game's 16.5s window; the game itself
// is the payoff at the end. Yesterday's verse, deliberately: today's answers
// on a public feed would spoil today's drop.

export interface QuizQuestionIn { prompt: string; options: string[]; answerIndex: number; teach: string }
/** One question of the CPU's play: which option, how far into the window, and what it scored. */
export interface QuizStep { pick: number; atSec: number; points: number }
export interface QuizInput {
  reference: string
  text: string
  questions: QuizQuestionIn[]
  plan: QuizStep[]
  /** Seconds each question's clock runs. */
  windowSec: number
  playerName: string
  /** The CPU player's full-length render; the head is cropped for its chip. */
  figure: HTMLImageElement
  backdrop: HTMLImageElement
  /** The verse read aloud while its card is up. Without it the card holds for a fixed beat. */
  audio?: ArrayBuffer
  hook?: string
  bed?: Float32Array
  /** Ticks and chimes, from `quizCues`. */
  cues?: Float32Array
  align?: boolean
  /**
   * ONE question, no verse card: the question is the first frame, the clock
   * starts at once, and `audio` (if any) is the question read aloud under it
   * rather than the verse. The reveal holds longer, because the teach line is
   * the whole second half of a 20-second post.
   */
  solo?: boolean
  onProgress?: (fraction: number, label: string) => void
}

const QUIZ_REVEAL = 3.8
const QUIZ_REVEAL_SOLO = 5.5
const QUIZ_LEAD_SOLO = 0.3
const QUIZ_END = 3.4
const QUIZ_LEAD_NO_AUDIO = 7

export interface QuizTimeline {
  lead: number
  /** When each question's clock starts, seconds into the video. */
  qStart: number[]
  reveal: number
  total: number
  /** Sound cue events, for `quizCues`. */
  events: Array<{ t: number; kind: 'tick' | 'lock' | 'right' | 'wrong' }>
}

/** The quiz's timing, so the caller can size a music bed and the cue track to it. */
export function quizTimeline(audioSec: number | null, input: Pick<QuizInput, 'questions' | 'plan' | 'windowSec' | 'solo'>): QuizTimeline {
  // A solo post's clock runs from the first frame; its reading (the
  // question, aloud) starts QUIZ_LEAD_SOLO in, under it.
  const lead = input.solo ? 0 : audioSec != null ? audioSec + 1.6 : QUIZ_LEAD_NO_AUDIO
  const reveal = input.solo ? QUIZ_REVEAL_SOLO : QUIZ_REVEAL
  const qStart: number[] = []
  const events: QuizTimeline['events'] = []
  let t = lead
  input.questions.forEach((q, i) => {
    qStart.push(t)
    const step = input.plan[i]
    for (let k = 5; k >= 1; k--) events.push({ t: t + input.windowSec - k, kind: 'tick' })
    if (step) events.push({ t: t + Math.min(step.atSec, input.windowSec - 0.3), kind: 'lock' })
    events.push({ t: t + input.windowSec, kind: step && step.pick === q.answerIndex ? 'right' : 'wrong' })
    t += input.windowSec + reveal
  })
  return { lead, qStart, reveal, total: t + QUIZ_END, events }
}

/**
 * The quiz's sounds, synthesised — the same bargain juice/sound.ts makes: no
 * files. A soft tick for the last five seconds, a two-note click when the
 * player locks in, a rising chime for a right answer, a low pair for a miss.
 */
export async function quizCues(events: QuizTimeline['events'], seconds: number): Promise<Float32Array> {
  const c = new OfflineAudioContext(1, Math.ceil(seconds * SAMPLE_RATE), SAMPLE_RATE)
  const note = (t: number, hz: number, dur: number, peak: number, type: OscillatorType = 'sine') => {
    const o = c.createOscillator(); o.type = type; o.frequency.value = hz
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g); g.connect(c.destination)
    o.start(t); o.stop(t + dur + 0.02)
  }
  for (const e of events) {
    if (e.t < 0 || e.t > seconds - 0.5) continue
    if (e.kind === 'tick') note(e.t, 1320, 0.06, 0.09, 'triangle')
    else if (e.kind === 'lock') { note(e.t, 660, 0.09, 0.16); note(e.t + 0.07, 880, 0.1, 0.14) }
    else if (e.kind === 'right') { note(e.t, 660, 0.3, 0.2); note(e.t + 0.1, 880, 0.3, 0.2); note(e.t + 0.2, 1320, 0.45, 0.22) }
    else { note(e.t, 240, 0.28, 0.18, 'triangle'); note(e.t + 0.16, 190, 0.4, 0.18, 'triangle') }
  }
  const out = await c.startRendering()
  return new Float32Array(out.getChannelData(0))
}

interface QuizScene {
  input: QuizInput
  tl: QuizTimeline
  /** The verse's caption phrases with word timings, when it is read aloud. */
  phrases: TimedPhrase[]
}

const GOLD = '#ffd23f', CORAL = '#ff6b6b', GRAPE = '#a06bff', INK_DIM = '#b8a9e0'

function headChip(ctx: CanvasRenderingContext2D, figure: HTMLImageElement, cx: number, cy: number, r: number) {
  // The top square of a full-length render is the head; the skins are drawn
  // head-to-feet at roughly 1:2, so this crops the face for a chip.
  const side = figure.naturalWidth
  ctx.save()
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath()
  ctx.fillStyle = 'rgba(21,10,52,0.9)'; ctx.fill()
  ctx.clip()
  ctx.drawImage(figure, 0, side * 0.02, side, side, cx - r, cy - r, r * 2, r * 2)
  ctx.restore()
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.lineWidth = 4; ctx.strokeStyle = GOLD; ctx.stroke()
}

async function drawQuizFrame(ctx: CanvasRenderingContext2D, sc: QuizScene, t: number, chrome = true) {
  const { input, tl, phrases } = sc
  const { lead, qStart, reveal, total } = tl
  const W = input.windowSec

  // 1. The road, held still, under a heavy wash: this frame is a game screen.
  cover(ctx, input.backdrop, input.backdrop.naturalWidth, input.backdrop.naturalHeight, 1 + 0.015 * (t / total))
  ctx.fillStyle = 'rgba(11,7,32,0.74)'; ctx.fillRect(0, 0, WIDTH, HEIGHT)
  if (!chrome) return

  const solo = !!input.solo
  const NAME = input.playerName.toUpperCase()
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.font = `800 32px ${FONT_DISPLAY}`
  ctx.letterSpacing = '6px'
  outlined(ctx, solo ? `CAN YOU BEAT ${NAME}?` : "VERSE ARCADE · YESTERDAY'S VERSE", WIDTH / 2, 150, GOLD, 'rgba(11,7,32,0.85)', 8)
  ctx.letterSpacing = '0px'
  ctx.font = `700 52px ${FONT_DISPLAY}`
  outlined(ctx, input.reference, WIDTH / 2, 218)

  const n = input.questions.length
  const endAt = qStart.length ? qStart[n - 1] + W + reveal : lead
  const endFade = easeOut((t - endAt) / 0.5)

  // 2. The verse card, while it is read. A solo post has none: its first
  // frame is the question.
  if (t < lead && !solo) {
    const age = easeOut(t / 0.4)
    const px = 90, pw = WIDTH - 180, py = 330, ph = 640
    ctx.save()
    ctx.globalAlpha = age
    roundRect(ctx, px, py, pw, ph, 40)
    ctx.fillStyle = 'rgba(21,10,52,0.82)'; ctx.fill()
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,210,63,0.7)'; ctx.stroke()
    ctx.font = `800 26px ${FONT_DISPLAY}`; ctx.letterSpacing = '5px'
    ctx.fillStyle = 'rgba(255,210,63,0.8)'; ctx.fillText('READ IT FIRST', WIDTH / 2, py + 46); ctx.letterSpacing = '0px'
    const at = t - 0.6
    const phrase = phrases.find((x) => at >= x.start && at < x.end) ?? null
    if (phrase) {
      // The verse is read aloud: one phrase at a time, lit by the word.
      drawCaption(ctx, phrase, at, { x: WIDTH / 2, y: py + ph / 2, maxWidth: pw - 100, size: 64, small: 52, stroke: 8, dim: 0.42 })
    } else {
      ctx.font = `700 50px ${FONT_DISPLAY}`
      const lines = wrap(ctx, input.text, pw - 100)
      const lh = 62
      const y0 = py + ph / 2 - ((lines.length - 1) * lh) / 2
      lines.forEach((l, i) => outlined(ctx, l, WIDTH / 2, y0 + i * lh, '#ffffff', 'rgba(11,7,32,0.6)', 6))
    }
    ctx.restore()
    // Who is playing, and the invitation.
    ctx.save(); ctx.globalAlpha = age
    headChip(ctx, input.figure, WIDTH / 2, 1130, 70)
    ctx.font = `800 44px ${FONT_DISPLAY}`
    outlined(ctx, `${input.playerName} plays it next.`, WIDTH / 2, 1250)
    ctx.font = `700 40px ${FONT_DISPLAY}`
    outlined(ctx, input.hook?.trim() || 'Five questions. Can you beat the clock?', WIDTH / 2, 1310, GOLD)
    ctx.restore()
    return
  }

  // 3. A question.
  let qi = -1
  for (let i = 0; i < n; i++) if (t >= qStart[i]) qi = i
  const banked = (upto: number) => input.plan.slice(0, upto).reduce((a, s) => a + (s?.points ?? 0), 0)
  if (qi >= 0 && endFade < 1) {
    const q = input.questions[qi], step = input.plan[qi]
    const elapsed = t - qStart[qi]
    const inWindow = elapsed < W
    const remaining = Math.max(0, W - elapsed)
    const locked = step && elapsed >= Math.min(step.atSec, W - 0.3)
    const revealed = !inWindow
    // A solo post's first frame is its thumbnail, so it does not fade in.
    const age = solo && qi === 0 ? 1 : easeOut(elapsed / 0.35)
    ctx.save()
    ctx.globalAlpha = Math.min(1, age + 0.2) * (1 - endFade)

    // Question number and the running score.
    ctx.font = `800 28px ${FONT_DISPLAY}`; ctx.letterSpacing = '5px'
    ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,210,63,0.85)'
    // A solo post has no score to run: the label is the ask instead.
    ctx.fillText(solo ? (revealed ? 'COMMENT YOUR ANSWER' : 'ONE QUESTION') : `QUESTION ${qi + 1} OF ${n}`, 90, 318)
    ctx.textAlign = 'right'; ctx.fillStyle = INK_DIM
    if (!solo) ctx.fillText(`${NAME} · ${banked(qi + (revealed ? 1 : 0))}`, WIDTH - 90, 318)
    ctx.letterSpacing = '0px'; ctx.textAlign = 'center'

    // The prompt, sized to the room above the clock: a fill-in-the-blank
    // quotes most of a verse and ran five lines into the clock bar at a
    // fixed size. On a solo post it IS the hook, so it starts larger.
    const fit = fitText(ctx, q.prompt, 900, solo ? [64, 56, 50, 44, 38, 32] : [56, 50, 46, 40, 36, 32], 236)
    const py = 512 - ((fit.lines.length - 1) * fit.lh) / 2
    fit.lines.forEach((l, i) => outlined(ctx, l, WIDTH / 2, py + i * fit.lh, '#ffffff', 'rgba(11,7,32,0.9)', 10))

    // The clock: a bar that empties, gold until the last three seconds.
    const by = 640, bh = 22, bx = 90, bw = WIDTH - 180
    roundRect(ctx, bx, by, bw, bh, bh / 2); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill()
    const frac = remaining / W
    if (frac > 0) {
      roundRect(ctx, bx, by, Math.max(bh, bw * frac), bh, bh / 2)
      ctx.fillStyle = remaining <= 3 ? CORAL : GOLD; ctx.fill()
    }
    ctx.font = `800 44px ${FONT_DISPLAY}`
    outlined(ctx, revealed ? 'Time!' : `${Math.ceil(remaining)}`, WIDTH / 2, by + 68, remaining <= 3 && !revealed ? CORAL : '#ffffff', 'rgba(11,7,32,0.9)', 8)

    // Four options.
    const oy0 = 770, oh = 150, gap = 22
    q.options.forEach((opt, i) => {
      const y = oy0 + i * (oh + gap)
      const isAnswer = i === q.answerIndex
      const isPick = !!step && i === step.pick
      let fill = 'rgba(21,10,52,0.82)', stroke = 'rgba(255,255,255,0.18)', ink = '#ffffff'
      if (revealed && isAnswer) { fill = GOLD; stroke = GOLD; ink = '#1a0f36' }
      else if (revealed && isPick) { fill = 'rgba(255,107,107,0.85)'; stroke = CORAL }
      else if (locked && isPick) { stroke = GRAPE }
      roundRect(ctx, 90, y, WIDTH - 180, oh, 30)
      ctx.fillStyle = fill; ctx.fill()
      ctx.lineWidth = locked && isPick && !revealed ? 6 : 3; ctx.strokeStyle = stroke; ctx.stroke()
      // The letter.
      ctx.beginPath(); ctx.arc(160, y + oh / 2, 34, 0, Math.PI * 2)
      ctx.fillStyle = revealed && isAnswer ? '#1a0f36' : 'rgba(255,255,255,0.14)'; ctx.fill()
      ctx.font = `800 34px ${FONT_DISPLAY}`; ctx.fillStyle = revealed && isAnswer ? GOLD : '#ffffff'
      ctx.fillText('ABCD'[i], 160, y + oh / 2 + 1)
      // The text, left-aligned beside it.
      ctx.textAlign = 'left'
      ctx.font = `700 40px ${FONT_DISPLAY}`
      const maxW = WIDTH - 180 - 150 - (isPick && locked ? 110 : 40)
      let ol = wrap(ctx, opt, maxW)
      let olh = 46
      if (ol.length > 2) { ctx.font = `700 32px ${FONT_DISPLAY}`; ol = wrap(ctx, opt, maxW); olh = 38 }
      ctx.fillStyle = ink
      const ty = y + oh / 2 - ((ol.length - 1) * olh) / 2
      ol.forEach((l, k) => ctx.fillText(l, 220, ty + k * olh))
      ctx.textAlign = 'center'
      // The player's chip lands on the option it picked.
      if (isPick && locked) {
        const pop = 0.8 + 0.2 * easeOut((elapsed - Math.min(step.atSec, W - 0.3)) / 0.25)
        ctx.save(); ctx.translate(WIDTH - 90 - 62, y + oh / 2); ctx.scale(pop, pop); ctx.translate(-(WIDTH - 90 - 62), -(y + oh / 2))
        headChip(ctx, input.figure, WIDTH - 90 - 62, y + oh / 2, 40)
        ctx.restore()
      }
      if (revealed && isAnswer) { ctx.font = `800 44px ${FONT_DISPLAY}`; ctx.fillStyle = '#1a0f36'; ctx.fillText('✓', WIDTH - 90 - 62 - (isPick ? 100 : 0), y + oh / 2 + 2) }
    })

    // The reveal: what it scored, and the line that teaches.
    if (revealed) {
      const ra = easeOut((elapsed - W) / 0.35)
      ctx.save(); ctx.globalAlpha *= ra
      const right = !!step && step.pick === q.answerIndex
      ctx.font = `800 40px ${FONT_DISPLAY}`
      outlined(ctx, right ? (solo ? `${input.playerName} got it` : `${input.playerName} +${step.points}`) : `${input.playerName} missed it`, WIDTH - 90 - 180, 318 + 52 - 8, right ? GOLD : CORAL, 'rgba(11,7,32,0.9)', 8)
      const ty = 1470, th = 290
      roundRect(ctx, 90, ty, WIDTH - 180, th, 30)
      ctx.fillStyle = 'rgba(255,210,63,0.12)'; ctx.fill()
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,210,63,0.6)'; ctx.stroke()
      ctx.font = `700 36px ${FONT_DISPLAY}`
      let tl2 = wrap(ctx, q.teach, WIDTH - 180 - 100)
      let tlh = 46
      if (tl2.length > 4) { ctx.font = `700 30px ${FONT_DISPLAY}`; tl2 = wrap(ctx, q.teach, WIDTH - 180 - 100); tlh = 38 }
      const y0 = ty + th / 2 - ((tl2.length - 1) * tlh) / 2
      tl2.forEach((l, k) => outlined(ctx, l, WIDTH / 2, y0 + k * tlh, '#ffffff', 'rgba(11,7,32,0.7)', 6))
      ctx.restore()
    } else if (solo) {
      ctx.font = `700 34px ${FONT_DISPLAY}`
      outlined(ctx, locked ? `${input.playerName} locked in. Comment A, B, C or D.` : `Comment A, B, C or D before the clock runs out.`, WIDTH / 2, 1500, INK_DIM, 'rgba(11,7,32,0.8)', 6)
    } else if (!locked) {
      ctx.font = `700 34px ${FONT_DISPLAY}`
      outlined(ctx, `${input.playerName} is thinking… pick yours.`, WIDTH / 2, 1500, INK_DIM, 'rgba(11,7,32,0.8)', 6)
    }
    ctx.restore()
  }

  // 4. The end card: the CPU's game, and the invitation.
  if (endFade > 0) {
    const right = input.plan.filter((s, i) => s && s.pick === input.questions[i]?.answerIndex).length
    ctx.save()
    ctx.globalAlpha = endFade
    ctx.fillStyle = 'rgba(11,7,32,0.7)'; ctx.fillRect(0, 0, WIDTH, HEIGHT)
    headChip(ctx, input.figure, WIDTH / 2, HEIGHT / 2 - 330, 90)
    if (solo) {
      // No score on a one-question post: the ask is the comment.
      ctx.font = `800 72px ${FONT_DISPLAY}`
      outlined(ctx, `Did you beat ${input.playerName}?`, WIDTH / 2, HEIGHT / 2 - 150)
      ctx.font = `800 56px ${FONT_DISPLAY}`
      outlined(ctx, 'Comment your answer', WIDTH / 2, HEIGHT / 2 - 40, GOLD)
    } else {
      ctx.font = `800 64px ${FONT_DISPLAY}`
      outlined(ctx, `${input.playerName}: ${right} of ${n}`, WIDTH / 2, HEIGHT / 2 - 170)
      ctx.font = `800 96px ${FONT_DISPLAY}`
      outlined(ctx, `${banked(n)} points`, WIDTH / 2, HEIGHT / 2 - 60, GOLD)
      ctx.font = `700 46px ${FONT_DISPLAY}`
      outlined(ctx, 'How did you do?', WIDTH / 2, HEIGHT / 2 + 60)
    }
    ctx.font = `800 64px ${FONT_DISPLAY}`
    outlined(ctx, 'Today’s verse is waiting', WIDTH / 2, HEIGHT / 2 + 380)
    ctx.font = `800 52px ${FONT_DISPLAY}`
    outlined(ctx, SITE, WIDTH / 2, HEIGHT / 2 + 470, GOLD)
    ctx.restore()
  }
}

export async function renderQuiz(input: QuizInput): Promise<RenderOutput> {
  const progress = input.onProgress ?? (() => {})
  progress(0, 'Setting up the board')
  const samples = input.audio ? await decodeAudio(input.audio) : new Float32Array(0)
  const audioDur = samples.length / SAMPLE_RATE
  const tl = quizTimeline(input.audio ? audioDur : null, input)
  let phrases: TimedPhrase[] = []
  if (input.audio && !input.solo) {
    const verse = /[.!?]["'”’)]?$/.test(input.text.trim()) ? input.text.trim() : input.text.trim() + '.'
    phrases = await timedCaptions([...splitPhrases(verse), input.reference + '.'], samples, progress, input.align)
  }
  try { await document.fonts.load(`800 56px "Baloo 2"`) } catch { /* fine */ }
  const sc: QuizScene = { input, tl, phrases }
  // The reading starts 0.6s in, so the card is up before the voice; a solo
  // post's question is read the moment its clock starts.
  const { blob, ext } = await produce((ctx, t) => drawQuizFrame(ctx, sc, t), tl.total, input.solo ? QUIZ_LEAD_SOLO : 0.6, samples, progress, input.bed, input.cues)
  progress(1, 'Done')
  return { blob, ext, durationSec: tl.total, phrases }
}

export async function renderQuizPoster(input: Omit<QuizInput, 'audio' | 'onProgress' | 'bed' | 'cues'>, t?: number): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH; canvas.height = HEIGHT
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('no 2d context')
  try { await document.fonts.load(`800 56px "Baloo 2"`) } catch { /* fine */ }
  const tl = quizTimeline(null, input)
  // Mid-clock on the first question, with the CPU locked in, unless told otherwise.
  const at = t ?? tl.qStart[0] + Math.min(input.windowSec - 1, (input.plan[0]?.atSec ?? 0) + 0.5)
  await drawQuizFrame(ctx, { input, tl, phrases: [] }, at)
  return canvas.toDataURL('image/png')
}
