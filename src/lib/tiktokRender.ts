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
// admin panel only, so the muxers never reach the app bundle.
//
// Timeline: [lead: reference / hook] [voice, captioned phrase by phrase] [end card]

import type { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from 'mp4-muxer'

export const WIDTH = 1080
export const HEIGHT = 1920
export const FPS = 30
const TAIL_SEC = 2.6
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
  /** A time-of-day grade over the backdrop: the mood without a new painting. */
  grade?: 'dusk' | 'night'
  /** A music bed (48 kHz mono) mixed under the reading; see lib/tiktokMusic. */
  bed?: Float32Array
  onProgress?: (fraction: number, label: string) => void
}

export interface RenderOutput {
  blob: Blob
  ext: 'mp4' | 'webm'
  durationSec: number
  /** The caption timing that was used, for the panel to show/inspect. */
  phrases: TimedPhrase[]
}

export interface TimedPhrase { text: string; start: number; end: number }

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
function weight(phrase: string): number {
  const base = phrase.replace(/[^a-zA-Z0-9]/g, '').length
  const pause = /[.!?]["'”’)]?$/.test(phrase) ? 9 : /[,;:—]["'”’)]?$/.test(phrase) ? 4 : 0
  return base + pause
}

// Speech segments in the decoded audio: runs of sound between silences of at
// least `gapSec`. Used to snap phrase boundaries onto the pauses the TTS
// actually took, which is what makes captions land on the words.
export function speechSegments(samples: Float32Array, sampleRate: number, gapSec = 0.22): Array<[number, number]> {
  const win = Math.round(sampleRate * 0.01)
  const n = Math.floor(samples.length / win)
  const rms = new Float32Array(n)
  let peak = 0
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let j = i * win; j < (i + 1) * win; j++) s += samples[j] * samples[j]
    rms[i] = Math.sqrt(s / win)
    if (rms[i] > peak) peak = rms[i]
  }
  const thr = Math.max(0.004, peak * 0.05)
  const segs: Array<[number, number]> = []
  let start = -1, quiet = 0
  const gapWins = Math.round(gapSec / 0.01)
  for (let i = 0; i < n; i++) {
    if (rms[i] > thr) {
      if (start < 0) start = i
      quiet = 0
    } else if (start >= 0) {
      quiet++
      if (quiet >= gapWins) { segs.push([start * 0.01, (i - quiet + 1) * 0.01]); start = -1; quiet = 0 }
    }
  }
  if (start >= 0) segs.push([start * 0.01, n * 0.01])
  return segs
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

function cover(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, zoom = 1) {
  const s = Math.max(WIDTH / sw, HEIGHT / sh) * zoom
  const w = sw * s, h = sh * s
  ctx.drawImage(src, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h)
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

// Free polish drawn over every frame: slow gold motes drifting up through
// the light, and a breathing warmth that reads as lamp flicker. Seeded per
// mote so the drift is smooth frame to frame; nothing here is random at draw
// time, or the encoder would see noise.
const MOTES = Array.from({ length: 28 }, (_, i) => {
  const r = (n: number) => { const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x) }
  return { x: r(1), y: r(2), size: 2 + r(3) * 4, speed: 0.012 + r(4) * 0.02, sway: r(5) * 6.28, alpha: 0.25 + r(6) * 0.45 }
})
function drawMotes(ctx: CanvasRenderingContext2D, t: number, strength = 1) {
  ctx.save()
  for (const m of MOTES) {
    const y = ((m.y - t * m.speed) % 1 + 1) % 1
    const x = m.x + Math.sin(t * 0.6 + m.sway) * 0.012
    const twinkle = 0.7 + 0.3 * Math.sin(t * 2.1 + m.sway * 3)
    ctx.globalAlpha = m.alpha * twinkle * strength
    ctx.fillStyle = '#ffe8a3'
    ctx.beginPath(); ctx.arc(x * WIDTH, y * HEIGHT, m.size, 0, Math.PI * 2); ctx.fill()
  }
  // Lamp breath: a very slow warm pulse over the whole frame.
  ctx.globalAlpha = 0.05 + 0.035 * Math.sin(t * 1.7) + 0.02 * Math.sin(t * 5.3)
  ctx.fillStyle = '#ffb648'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  ctx.restore()
}

// Dusk and night over the daytime road: a multiply tint and a darker vignette,
// so a comfort verse at dusk and a warning at night keep the host's LOOP
// (which only exists for the daytime road) rather than falling back to a
// still of a different painting.
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
}

async function drawFrame(ctx: CanvasRenderingContext2D, scene: Scene, t: number, chrome = true) {
  const { input, lead, audioDur, total, phrases } = scene
  const bd = input.backdrop

  // 1. Backdrop.
  ctx.save()
  if (bd.kind === 'loop') {
    await drawLoop(ctx, bd.video, t)
  } else if (bd.kind === 'still') {
    cover(ctx, bd.image, bd.image.naturalWidth, bd.image.naturalHeight, 1 + 0.06 * (t / total))
  } else {
    cover(ctx, bd.scene, bd.scene.naturalWidth, bd.scene.naturalHeight, 1 + 0.05 * (t / total))
    // A soft gold glow under the figure, breathing with it.
    const bob = Math.sin((t / 3.2) * Math.PI * 2)
    const cx = WIDTH / 2, cy = HEIGHT * 0.5 + bob * 14
    const g = ctx.createRadialGradient(cx, cy + 60, 40, cx, cy + 60, 520)
    g.addColorStop(0, `rgba(255,210,63,${0.28 + 0.06 * bob})`)
    g.addColorStop(1, 'rgba(255,210,63,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
    const fh = HEIGHT * 0.46
    const fw = (bd.figure.naturalWidth / bd.figure.naturalHeight) * fh
    ctx.imageSmoothingQuality = 'high'
    ctx.shadowColor = 'rgba(0,0,0,0.45)'
    ctx.shadowBlur = 40
    ctx.shadowOffsetY = 24
    ctx.drawImage(bd.figure, cx - fw / 2, cy - fh / 2, fw, fh)
  }
  ctx.restore()
  if (!chrome) return
  drawGrade(ctx, input.grade)
  drawMotes(ctx, t)

  // 2. Legibility washes, top and bottom.
  const top = ctx.createLinearGradient(0, 0, 0, 520)
  top.addColorStop(0, 'rgba(11,7,32,0.82)'); top.addColorStop(1, 'rgba(11,7,32,0)')
  ctx.fillStyle = top; ctx.fillRect(0, 0, WIDTH, 520)
  const bot = ctx.createLinearGradient(0, HEIGHT - 820, 0, HEIGHT)
  bot.addColorStop(0, 'rgba(11,7,32,0)'); bot.addColorStop(1, 'rgba(11,7,32,0.9)')
  ctx.fillStyle = bot; ctx.fillRect(0, HEIGHT - 820, WIDTH, 820)

  // 3. Header: the brand, then the reference.
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `800 34px ${FONT_DISPLAY}`
  ctx.letterSpacing = '6px'
  outlined(ctx, 'VERSE ARCADE', WIDTH / 2, 190, '#ffd23f', 'rgba(11,7,32,0.85)', 8)
  ctx.letterSpacing = '0px'
  ctx.font = `700 62px ${FONT_DISPLAY}`
  outlined(ctx, input.reference, WIDTH / 2, 262)

  // 4. Captions.
  const endFade = easeOut((t - (lead + audioDur)) / 0.45)
  const captionY = 1400
  const maxW = 880
  let caption: string | null = null
  let age = 1
  if (t < lead) {
    caption = input.hook?.trim() || null
    age = t / 0.35
  } else {
    const at = t - lead
    const p = phrases.find((x) => at >= x.start && at < x.end) ?? (at >= audioDur ? null : phrases[phrases.length - 1])
    if (p && at < audioDur + 0.2) { caption = p.text.replace(/\.$/, ''); age = (at - p.start) / 0.22 }
  }
  if (caption && endFade < 1) {
    const pop = 0.92 + 0.08 * easeOut(age)
    ctx.save()
    ctx.globalAlpha = Math.min(1, easeOut(age) + 0.35) * (1 - endFade)
    ctx.translate(WIDTH / 2, captionY)
    ctx.scale(pop, pop)
    // Two lines at full size; a longer card steps down rather than stacking
    // three lines with an orphan word on the last.
    ctx.font = `800 88px ${FONT_DISPLAY}`
    let lines = wrap(ctx, caption, maxW)
    let lh = 104
    if (lines.length > 2) { ctx.font = `800 70px ${FONT_DISPLAY}`; lines = wrap(ctx, caption, maxW); lh = 84 }
    const y0 = -((lines.length - 1) * lh) / 2
    lines.forEach((line, i) => outlined(ctx, line, 0, y0 + i * lh, '#ffffff', 'rgba(11,7,32,0.92)', 14))
    ctx.restore()
  }

  // 5. End card.
  if (endFade > 0) {
    ctx.save()
    ctx.globalAlpha = endFade
    ctx.fillStyle = 'rgba(11,7,32,0.55)'
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
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
  const samples = await decodeAudio(input.audio)
  const audioDur = samples.length / SAMPLE_RATE
  const segments = speechSegments(samples, SAMPLE_RATE)
  // The reading ends by saying the reference, so it is the last caption too —
  // and a clause of its own, which keeps the clause count matching the pauses.
  const verse = /[.!?]["'”’)]?$/.test(input.text.trim()) ? input.text.trim() : input.text.trim() + '.'
  const phrases = alignPhrases([...splitPhrases(verse), input.reference + '.'], segments, audioDur)
  const lead = input.hook?.trim() ? 1.8 : 1.0
  const total = lead + audioDur + TAIL_SEC
  const scene: Scene = { input, lead, audioDur, total, phrases }

  try { await document.fonts.load(`800 88px "Baloo 2"`) } catch { /* fall back to the stack */ }

  const { blob, ext } = await produce((ctx, t) => drawFrame(ctx, scene, t), total, lead, samples, progress, input.bed)
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
  await drawFrame(ctx, { input: { ...input, audio: new ArrayBuffer(0) }, lead: 1, audioDur: 30, total: 34, phrases: [] }, t, chrome)
  return canvas.toDataURL('image/png')
}

// ---- story time -----------------------------------------------------------------
//
// The evening post: a teller (Tabitha) at the bottom-left of her room, a
// picture card above her that changes with each paragraph, captions between
// the two, and the verse itself as the last card. Same engine, same checks.

export interface StoryCard {
  image?: HTMLImageElement
  figure?: HTMLImageElement
  label?: string
}

export interface StoryInput {
  title: string
  reference: string
  verseText: string
  /** Spoken paragraphs, in order. The LAST one is the verse and its reference. */
  paragraphs: string[]
  /** One per paragraph; an entry with no image is drawn as the verse card. */
  cards: StoryCard[]
  hook?: string
  audio: ArrayBuffer
  /** The room — a painting, or a Veo loop of the room WITH the teller in it. */
  room: HTMLImageElement | HTMLVideoElement
  /** The teller's render; not drawn when the room is a loop that already has her. */
  teller: HTMLImageElement
  /** Reaction loops of the same room+teller, cut in per paragraph when present. */
  reactions?: { listen?: HTMLVideoElement; laugh?: HTMLVideoElement; leanin?: HTMLVideoElement }
  /** Which reaction each paragraph gets; 'talk' is the main room loop. */
  beats?: Array<'talk' | 'listen' | 'laugh' | 'leanin'>
  bed?: Float32Array
  onProgress?: (fraction: number, label: string) => void
}

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
}

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

async function drawStoryFrame(ctx: CanvasRenderingContext2D, sc: StoryScene, t: number, chrome = true) {
  const { input, lead, audioDur, total, phrases, para, paraStart } = sc
  const at = t - lead

  // 1. The room: a Veo loop played forward with a crossfaded seam, or the painting with a slow push.
  // With reaction loops, the paragraph decides which loop is on screen and
  // the cut lands on the paragraph boundary, timed from that boundary so a
  // new loop starts at its first frame.
  const roomIsLoop = input.room instanceof HTMLVideoElement
  let piNow = 0
  for (let i = 0; i < paraStart.length; i++) if (at >= paraStart[i] - 0.15) piNow = i
  if (input.room instanceof HTMLVideoElement) {
    const beat = input.beats?.[piNow] ?? 'talk'
    const alt = beat !== 'talk' ? input.reactions?.[beat] : undefined
    const v = alt ?? input.room
    const since = alt ? Math.max(0, at - (paraStart[piNow] ?? 0) + 0.15) : t
    await drawLoop(ctx, v, since)
  } else {
    cover(ctx, input.room, input.room.naturalWidth, input.room.naturalHeight, 1 + 0.05 * (t / total))
  }
  drawMotes(ctx, t, 0.8)
  const top = ctx.createLinearGradient(0, 0, 0, 480)
  top.addColorStop(0, 'rgba(11,7,32,0.85)'); top.addColorStop(1, 'rgba(11,7,32,0)')
  ctx.fillStyle = top; ctx.fillRect(0, 0, WIDTH, 480)
  const bot = ctx.createLinearGradient(0, HEIGHT - 900, 0, HEIGHT)
  bot.addColorStop(0, 'rgba(11,7,32,0)'); bot.addColorStop(1, 'rgba(11,7,32,0.92)')
  ctx.fillStyle = bot; ctx.fillRect(0, HEIGHT - 900, WIDTH, 900)

  if (!chrome) {
    // The base still handed to Veo: the room and the teller, nothing drawn over.
    const th0 = 640, tw0 = (input.teller.naturalWidth / input.teller.naturalHeight) * th0
    if (!roomIsLoop) ctx.drawImage(input.teller, 60, HEIGHT - 30 - th0, tw0, th0)
    return
  }

  // 2. Header.
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.font = `800 32px ${FONT_DISPLAY}`
  ctx.letterSpacing = '6px'
  outlined(ctx, 'VERSE ARCADE · STORY TIME', WIDTH / 2, 170, '#ffd23f', 'rgba(11,7,32,0.85)', 8)
  ctx.letterSpacing = '0px'
  ctx.font = `700 54px ${FONT_DISPLAY}`
  const titleLines = wrap(ctx, input.title, 900)
  titleLines.forEach((l, i) => outlined(ctx, l, WIDTH / 2, 240 + i * 60))

  // 3. The picture card for the current paragraph.
  const endFade = easeOut((t - (lead + audioDur)) / 0.5)
  let pi = 0
  for (let i = 0; i < paraStart.length; i++) if (at >= paraStart[i] - 0.15) pi = i
  const card = input.cards[Math.min(pi, input.cards.length - 1)]
  const cardAge = easeOut((at - (paraStart[pi] ?? 0) + 0.15) / 0.4)
  const leaning = (input.beats?.[pi] ?? 'talk') === 'leanin' && input.reactions?.leanin
  if (t >= lead - 0.6 && endFade < 1) {
    // The lean-in walks her up to the camera, so the card shrinks and rises
    // to leave her the lower half of the frame.
    const cw = leaning ? 600 : 760, ch = cw
    const cx = (WIDTH - cw) / 2, cy = leaning ? 300 : 330
    ctx.save()
    ctx.globalAlpha = (1 - endFade) * Math.min(1, cardAge + 0.2)
    const pop = 0.95 + 0.05 * cardAge
    ctx.translate(cx + cw / 2, cy + ch / 2); ctx.scale(pop, pop); ctx.translate(-(cx + cw / 2), -(cy + ch / 2))
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18
    roundRect(ctx, cx, cy, cw, ch, 44)
    ctx.fillStyle = 'rgba(21,10,52,0.78)'
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,210,63,0.85)'; ctx.stroke()
    ctx.save(); roundRect(ctx, cx + 4, cy + 4, cw - 8, ch - 8, 40); ctx.clip()
    // A page turn: the new picture wipes in from the left edge with a soft
    // bright edge, so a card change reads as a page, not a cut.
    if (cardAge < 1) {
      const px = cx + 4 + (cw - 8) * cardAge
      ctx.beginPath(); ctx.rect(cx, cy, px - cx, ch); ctx.clip()
      const edge = ctx.createLinearGradient(px - 60, 0, px, 0)
      edge.addColorStop(0, 'rgba(255,232,163,0)'); edge.addColorStop(1, 'rgba(255,232,163,0.8)')
      ctx.fillStyle = 'rgba(21,10,52,1)'; ctx.fillRect(cx, cy, cw, ch)
      ctx.fillStyle = edge; ctx.fillRect(px - 60, cy, 60, ch)
    }
    if (card?.image) {
      if (card.image.naturalWidth > card.image.naturalHeight * 1.2 || card.figure) {
        // A scene: fill the card, and stand the figure in it.
        const s = Math.max(cw / card.image.naturalWidth, ch / card.image.naturalHeight)
        ctx.drawImage(card.image, cx + (cw - card.image.naturalWidth * s) / 2, cy + (ch - card.image.naturalHeight * s) / 2, card.image.naturalWidth * s, card.image.naturalHeight * s)
        if (card.figure) {
          const fh = ch * 0.62
          const fw = (card.figure.naturalWidth / card.figure.naturalHeight) * fh
          ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 12
          ctx.drawImage(card.figure, cx + cw / 2 - fw / 2, cy + ch - fh - 40, fw, fh)
          ctx.shadowColor = 'transparent'
        }
      } else {
        contain(ctx, card.image, cx + 40, cy + 40, cw - 80, ch - 80)
      }
    } else {
      // The verse card.
      ctx.font = `700 54px ${FONT_DISPLAY}`
      const lines = wrap(ctx, input.verseText, cw - 120)
      const lh = 66
      const y0 = cy + ch / 2 - ((lines.length - 1) * lh) / 2 - 30
      lines.forEach((l, i) => outlined(ctx, l, cx + cw / 2, y0 + i * lh, '#ffffff', 'rgba(11,7,32,0.6)', 6))
      ctx.font = `800 40px ${FONT_DISPLAY}`
      outlined(ctx, input.reference, cx + cw / 2, y0 + lines.length * lh + 16, '#ffd23f', 'rgba(11,7,32,0.6)', 6)
    }
    ctx.restore()
    if (card?.label && card.image) {
      ctx.font = `700 30px ${FONT_DISPLAY}`
      ctx.fillStyle = 'rgba(11,7,32,0.75)'
      const lw = ctx.measureText(card.label).width + 44
      roundRect(ctx, cx + cw / 2 - lw / 2, cy + ch - 62, lw, 46, 23); ctx.fill()
      ctx.fillStyle = '#ffd23f'; ctx.fillText(card.label, cx + cw / 2, cy + ch - 39)
    }
    ctx.restore()
  }

  // 4. The teller, bottom-left, with a warm glow — unless the room is a loop
  // that already has her in it.
  if (!roomIsLoop) {
    const bob = Math.sin((t / 3.4) * Math.PI * 2)
    const th = 640, tw = (input.teller.naturalWidth / input.teller.naturalHeight) * th
    const tx = 60, ty = HEIGHT - 30 - th + bob * 8
    const g = ctx.createRadialGradient(tx + tw / 2, ty + th * 0.6, 30, tx + tw / 2, ty + th * 0.6, 420)
    g.addColorStop(0, 'rgba(255,210,63,0.22)'); g.addColorStop(1, 'rgba(255,210,63,0)')
    ctx.fillStyle = g; ctx.fillRect(0, HEIGHT - 1000, WIDTH, 1000)
    ctx.save()
    ctx.imageSmoothingQuality = 'high'
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 36; ctx.shadowOffsetY = 20
    ctx.drawImage(input.teller, tx, ty, tw, th)
    ctx.restore()
  }

  // 5. Captions, between the card and the teller.
  let caption: string | null = null
  let age = 1
  if (t < lead) { caption = input.hook?.trim() || null; age = t / 0.35 }
  else {
    const idx = phrases.findIndex((x) => at >= x.start && at < x.end)
    const p = idx >= 0 ? phrases[idx] : (at < audioDur ? phrases[phrases.length - 1] : null)
    if (p && at < audioDur + 0.2) { caption = p.text.replace(/\.$/, ''); age = (at - p.start) / 0.22 }
    void para
  }
  if (caption && endFade < 1) {
    ctx.save()
    ctx.globalAlpha = Math.min(1, easeOut(age) + 0.35) * (1 - endFade)
    const pop = 0.94 + 0.06 * easeOut(age)
    // Captions sit between the card and the teller; when she has walked up
    // to the camera they tuck under the smaller card instead.
    ctx.translate(leaning ? WIDTH / 2 : WIDTH / 2 + 120, leaning ? 1000 : 1215); ctx.scale(pop, pop)
    ctx.font = `800 ${leaning ? 60 : 70}px ${FONT_DISPLAY}`
    let lines = wrap(ctx, caption, leaning ? 900 : 700)
    let lh = leaning ? 70 : 82
    if (lines.length > 2) { ctx.font = `800 58px ${FONT_DISPLAY}`; lines = wrap(ctx, caption, leaning ? 900 : 700); lh = 68 }
    const y0 = -((lines.length - 1) * lh) / 2
    lines.forEach((l, i) => outlined(ctx, l, 0, y0 + i * lh, '#ffffff', 'rgba(11,7,32,0.92)', 12))
    ctx.restore()
  }

  // 6. End card.
  if (endFade > 0) {
    ctx.save()
    ctx.globalAlpha = endFade
    ctx.fillStyle = 'rgba(11,7,32,0.6)'; ctx.fillRect(0, 0, WIDTH, HEIGHT)
    ctx.font = `700 56px ${FONT_DISPLAY}`
    const lines = wrap(ctx, input.verseText, 880)
    const lh = 68
    const y0 = HEIGHT / 2 - 200 - ((lines.length - 1) * lh) / 2
    lines.forEach((l, i) => outlined(ctx, l, WIDTH / 2, y0 + i * lh))
    ctx.font = `800 44px ${FONT_DISPLAY}`
    outlined(ctx, input.reference, WIDTH / 2, y0 + lines.length * lh + 20, '#ffd23f')
    ctx.font = `800 64px ${FONT_DISPLAY}`
    outlined(ctx, 'Play today’s verse', WIDTH / 2, HEIGHT / 2 + 380)
    ctx.font = `800 52px ${FONT_DISPLAY}`
    outlined(ctx, SITE, WIDTH / 2, HEIGHT / 2 + 470, '#ffd23f')
    ctx.restore()
  }
}

export async function renderStory(input: StoryInput): Promise<RenderOutput> {
  const progress = input.onProgress ?? (() => {})
  progress(0, 'Decoding the story')
  const samples = await decodeAudio(input.audio)
  const audioDur = samples.length / SAMPLE_RATE
  const segments = speechSegments(samples, SAMPLE_RATE)
  // Phrases per paragraph, so each paragraph's first phrase marks its card.
  const texts: string[] = []
  const para: number[] = []
  input.paragraphs.forEach((p, i) => {
    const t = p.trim()
    const ended = /[.!?]["'”’)]?$/.test(t) ? t : t + '.'
    // A story is read at a talking pace, so a card can hold a word more.
    for (const ph of splitPhrases(ended, 7)) { texts.push(ph); para.push(i) }
  })
  const phrases = alignPhrases(texts, segments, audioDur)
  const paraStart = input.paragraphs.map((_, i) => phrases[para.indexOf(i)]?.start ?? 0)
  const lead = input.hook?.trim() ? 1.8 : 1.0
  const total = lead + audioDur + TAIL_SEC + 1.2
  try { await document.fonts.load(`800 70px "Baloo 2"`) } catch { /* fine */ }
  const sc: StoryScene = { input, lead, audioDur, total, phrases, para, paraStart }
  const { blob, ext } = await produce((ctx, t) => drawStoryFrame(ctx, sc, t), total, lead, samples, progress, input.bed)
  progress(1, 'Done')
  return { blob, ext, durationSec: total, phrases }
}

/** How long a story or verse post will run, so a music bed can be rendered to fit. */
export async function plannedDuration(audio: ArrayBuffer, hook: string | undefined, story: boolean): Promise<number> {
  const samples = await decodeAudio(audio)
  const lead = hook?.trim() ? 1.8 : 1.0
  return lead + samples.length / SAMPLE_RATE + TAIL_SEC + (story ? 1.2 : 0)
}

export async function renderStoryPoster(input: Omit<StoryInput, 'audio' | 'onProgress'>, t = 2.5, chrome = true): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH; canvas.height = HEIGHT
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('no 2d context')
  try { await document.fonts.load(`800 70px "Baloo 2"`) } catch { /* fine */ }
  const n = input.paragraphs.length
  await drawStoryFrame(ctx, { input: { ...input, audio: new ArrayBuffer(0) }, lead: 1, audioDur: 60, total: 65, phrases: [], para: [], paraStart: Array.from({ length: n }, (_, i) => i * (60 / n)) }, t, chrome)
  return canvas.toDataURL('image/png')
}
