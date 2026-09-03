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

export function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.crossOrigin = 'anonymous'
    v.muted = true
    v.playsInline = true
    v.preload = 'auto'
    v.onloadeddata = () => resolve(v)
    v.onerror = () => reject(new Error(`could not load ${url}`))
    v.src = url
  })
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - t) < 1 / (FPS * 2)) return resolve()
    const done = () => { video.removeEventListener('seeked', done); resolve() }
    video.addEventListener('seeked', done)
    video.currentTime = t
  })
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
    const v = bd.video
    const d = Math.max(0.1, v.duration - 0.05)
    // Ping-pong through the clip so an 8-second loop has no seam.
    const m = t % (2 * d)
    await seek(v, m < d ? m : 2 * d - m)
    cover(ctx, v, v.videoWidth, v.videoHeight)
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

async function pickCodec(): Promise<Codec> {
  if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') {
    throw new Error('This browser has no WebCodecs — use Chrome or Edge on a desktop.')
  }
  const mp4: Codec = {
    ext: 'mp4',
    video: { codec: 'avc1.640028', width: WIDTH, height: HEIGHT, bitrate: 9_000_000, framerate: FPS, avc: { format: 'avc' } } as VideoEncoderConfig,
    audio: { codec: 'mp4a.40.2', sampleRate: SAMPLE_RATE, numberOfChannels: 1, bitrate: 128_000 },
  }
  const webm: Codec = {
    ext: 'webm',
    video: { codec: 'vp09.00.40.08', width: WIDTH, height: HEIGHT, bitrate: 9_000_000, framerate: FPS },
    audio: { codec: 'opus', sampleRate: SAMPLE_RATE, numberOfChannels: 1, bitrate: 96_000 },
  }
  for (const c of [mp4, webm]) {
    const [v, a] = await Promise.all([VideoEncoder.isConfigSupported(c.video), AudioEncoder.isConfigSupported(c.audio)])
    if (v.supported && a.supported) return c
  }
  throw new Error('This browser can encode neither H.264/AAC nor VP9/Opus.')
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

function tick() { return new Promise<void>((r) => setTimeout(r, 0)) }

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

  progress(0.02, 'Picking a codec')
  const codec = await pickCodec()
  const { muxer, buffer, mime } = await makeMuxer(codec)

  // Audio: lead-in silence, the reading, tail silence — one track, 48 kHz mono.
  const totalFrames = Math.ceil(total * SAMPLE_RATE)
  const track = new Float32Array(totalFrames)
  track.set(samples.subarray(0, Math.min(samples.length, totalFrames - Math.round(lead * SAMPLE_RATE))), Math.round(lead * SAMPLE_RATE))

  let encodeErr: Error | null = null
  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => { encodeErr = e as Error },
  })
  audioEncoder.configure(codec.audio)
  const CHUNK = 4800
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
    await drawFrame(ctx, scene, t)
    const frame = new VideoFrame(canvas, { timestamp: Math.round(t * 1e6), duration: Math.round(1e6 / FPS) })
    videoEncoder.encode(frame, { keyFrame: i % (FPS * 2) === 0 })
    frame.close()
    while (videoEncoder.encodeQueueSize > 6) await tick()
    if (encodeErr) throw encodeErr
    if (i % 15 === 0) progress(0.05 + 0.93 * (i / frames), `Rendering ${Math.round(t)}s / ${Math.round(total)}s`)
  }
  await videoEncoder.flush()
  if (encodeErr) throw encodeErr
  muxer.finalize()
  progress(1, 'Done')
  return { blob: new Blob([buffer()], { type: mime }), ext: codec.ext, durationSec: total, phrases }
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
