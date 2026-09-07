#!/usr/bin/env node
// tiktok-voice — the operator's-voice loop from a terminal.
//
// The morning post is Gemini's voice unless the operator's recording is
// parked for the date. This script is the whole of that loop without the
// dashboard: the week's drafts to read, a phone memo listened to and parked,
// the verse post rendered with it for a look, and — only when asked — the
// finished video scheduled through Ayrshare. It is what a Claude Code
// session runs when the operator sends recordings there instead of opening
// the hub, and it renders EXACTLY what the hub and the morning runner render
// (src/lib/tiktokVoiceCli.ts bundles the same generators into headless
// Chromium; see scripts/tiktok-daily.mjs for the shape).
//
//   node scripts/tiktok-voice.mjs drafts [start=today] [days=7] [--redraft]
//       The verses and drafted thoughts for the week, as Markdown, with what
//       is already recorded and listened to. Drafts are cached per date.
//   node scripts/tiktok-voice.mjs identify <audio files…>
//       Which day each memo is for: its opening is listened to and matched
//       against the coming fortnight's verses. For a batch that arrives
//       without dates on it.
//   Every command below takes `--story` to mean the operator's half of the
//   EVENING post — spoken around Tabitha's telling — instead of the morning
//   verse. Without it they mean the verse, exactly as they always did. On a
//   story, `--intro` means he speaks FIRST and hands over to her by name;
//   without it he answers her at the end.
//
//   node scripts/tiktok-voice.mjs split <audio file> <start date> [--days=N]
//                                       [--story] [--intro] [--dry] [--reuse]
//       ONE memo holding a run of takes, cut into one recording per date and
//       parked. The operator says the take's NUMBER before each one ("one",
//       a pause, then the words), and that number is what the cut is made
//       on — a silence threshold alone cannot tell the pause between takes
//       from the pause inside a sentence, and a phone memo has plenty of
//       both. Transcribed ONCE and sliced, so every take's timings are the
//       ones actually heard and Whisper runs over the five minutes once
//       rather than fourteen times. `--dry` prints the cut and parks nothing.
//   node scripts/tiktok-voice.mjs listen <date> <audio file> [--story] [--intro]
//       Decode any phone memo (m4a, mp3, wav, webm, ogg) to a WAV, park it,
//       listen to it (Whisper base in the browser), park the transcript and
//       rewrite the day's caption. Prints the transcript to check.
//   node scripts/tiktok-voice.mjs fix <date> <text file>
//       Put a corrected thought onto the timings already heard, and re-park.
//       Whisper times a phone memo well and spells it badly, and these words
//       are burned onto the screen — so this is the step between listening
//       and rendering. No model, no second listen, no timing drift.
//   node scripts/tiktok-voice.mjs render <date> [--story] [--intro]
//       The post with the parked recording, as an H.264 MP4 in
//       .tiktok-voice/out/. Posts nothing.
//   node scripts/tiktok-voice.mjs post <date> [--at HH:MM | --now] [--platforms a,b]
//       Upload the rendered MP4 (and its cover) and schedule it at HH:MM in
//       TIKTOK_TZ on that date (default: the verse's 07:00). Every network,
//       idempotent per (date, kind, platform) like the runner.
//   node scripts/tiktok-voice.mjs clear <date>
//       Take a parked recording down, so the morning falls back to Gemini.
//
// Environment: TIKTOK_RUNNER_TOKEN (required — Vault 0102, the same secret
// the GitHub runner holds), SUPABASE_URL / SUPABASE_ANON_KEY (defaulted),
// TIKTOK_TZ (America/New_York), FFMPEG, PW_CHROMIUM, MODELS_DIR (serve the
// Whisper models and ONNX runtime from a directory instead of the web),
// PW_PROXY / HTTPS_PROXY (a sandbox's egress proxy for the browser).

import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, '.tiktok-voice')
const env = process.env
const SUPABASE_URL = (env.SUPABASE_URL || 'https://visuppaucpzzigwtqmdd.supabase.co').replace(/\/$/, '')
const ANON = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpc3VwcGF1Y3B6emlnd3RxbWRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5MTY1MjEsImV4cCI6MjEwMTQ5MjUyMX0.YP_lJkV8ZD7J-oAqwkhh-6gQ0z1Q7pFR4Nql1NdhSa0'
const TOKEN = env.TIKTOK_RUNNER_TOKEN || ''
const TZ = env.TIKTOK_TZ || 'America/New_York'
const FFMPEG = env.FFMPEG || 'ffmpeg'
const MODELS_DIR = env.MODELS_DIR || ''
const log = (...a) => console.error(new Date().toISOString().slice(11, 19), ...a)
const fail = (m) => { console.error('tiktok-voice:', m); process.exit(2) }
if (!TOKEN) fail('set TIKTOK_RUNNER_TOKEN')

const [cmd, ...rest] = process.argv.slice(2)
const flags = Object.fromEntries(rest.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true] }))
const args = rest.filter((a) => !a.startsWith('--'))
if (!['drafts', 'listen', 'fix', 'render', 'post', 'clear', 'identify', 'split'].includes(cmd)) fail('usage: drafts | identify <files…> | listen <date> <file> [--story] | fix <date> <text file> [--story] | render <date> [--story] | post <date> [--story] [--at HH:MM|--now] | clear <date> [--story]')
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d)
// Two posts a day can carry the operator's voice: the morning VERSE (his
// reading and his thought, in place of Gemini's) and his half of the evening
// STORY. `--story` picks the second; everything defaults to the verse, so
// every command that worked before works unchanged.
//
// A story half sits at one END of Tabitha's telling: `--intro` hands it over
// to her before she starts, and without it he answers her afterwards. A day
// carries one or the other, so both use the same parked recording and the
// same path — `--intro` is what a recording is LISTENED to as, and it is
// written into the transcript so a later render cannot move it.
const KIND = flags.story ? 'story' : 'verse'
const PLACE = flags.intro ? 'open' : 'close'
const HOUR = { verse: '07:00', story: '19:30' }
const mp4For = (date, kind) => path.join(OUT, 'out', `${kind}-${date}.mp4`)

function ymdIn(tz, d = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const g = (t) => p.find((x) => x.type === t).value
  return `${g('year')}-${g('month')}-${g('day')}`
}
function addDays(ymd, n) { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10) }
function zonedToUtc(ymd, hhmm, tz) {
  const [h, mi] = hhmm.split(':').map(Number)
  const [y, mo, d] = ymd.split('-').map(Number)
  const want = Date.UTC(y, mo - 1, d, h, mi)
  let t = want
  for (let i = 0; i < 2; i++) {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t))
    const g = (k) => Number(p.find((x) => x.type === k).value)
    t += want - Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'))
  }
  return new Date(t)
}
async function fn(action, body) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/tiktok-gen`, { method: 'POST', headers: { 'content-type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}`, 'x-runner-token': TOKEN }, body: JSON.stringify({ action, ...body }) })
  const j = await r.json().catch(() => ({ error: `function ${r.status}` }))
  if (j.error) throw new Error(`${action}: ${j.error}`)
  return j
}
async function upload(bucketPath, file, contentType) {
  const up = await fn('upload-url', { path: bucketPath })
  const sb = createClient(SUPABASE_URL, ANON)
  const { error } = await sb.storage.from('tiktok').uploadToSignedUrl(up.path, up.token, fs.readFileSync(file), { contentType, upsert: true })
  if (error) throw new Error(`upload ${bucketPath}: ${error.message}`)
  return up.publicUrl
}
// A phone memo, cleaned for the post: mono, 48 kHz, the room's rumble and
// hiss taken down, and the loudness brought to where Gemini's readings sit
// (EBU R128 to -16 LUFS). The browser levels again on its own terms, which
// is idempotent on a file already at that level.
function toWav(file, wav) {
  const ff = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', file, '-ac', '1', '-ar', '48000', '-af', 'highpass=f=70,afftdn=nf=-28,loudnorm=I=-16:TP=-1.5:LRA=9', '-c:a', 'pcm_s16le', wav])
  return ff.status === 0 && fs.existsSync(wav)
}
function durationOf(src) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-i', src], { encoding: 'utf8' })
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec((r.stderr || '') + (r.stdout || ''))
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : undefined
}

// ---- commands that need no browser ----------------------------------------------
if (cmd === 'clear') {
  const date = args[0]; if (!isDate(date)) fail('clear <date>')
  await fn('voice-clear', { date, kind: KIND }); log(`cleared ${KIND} ${date}`); process.exit(0)
}
if (cmd === 'post') {
  const date = args[0]; if (!isDate(date)) fail('post <date> [--at HH:MM|--now]')
  const mp4 = mp4For(date, KIND)
  if (!fs.existsSync(mp4)) fail(`no ${mp4} — run render first`)
  await build({ entryPoints: [path.join(ROOT, 'supabase/functions/tiktok-gen/social.ts')], bundle: true, format: 'esm', platform: 'node', outfile: path.join(OUT, 'social.mjs'), logLevel: 'error' })
  const social = await import(path.join(OUT, 'social.mjs'))
  const platforms = String(flags.platforms || 'tiktok,youtube,facebook,instagram,x,snapchat,threads,pinterest').split(',').map((s) => s.trim()).filter((p) => social.postsOn(p, KIND))
  const at = String(flags.at || HOUR[KIND])
  const scheduleDate = flags.now ? undefined : zonedToUtc(date, at, TZ).toISOString().replace(/\.\d{3}Z$/, 'Z')
  log(`post ${KIND} ${date} → ${scheduleDate ? `scheduled ${at} ${TZ} (${scheduleDate})` : 'now'} · ${platforms.join(',')}`)
  const videoUrl = await upload(`days/${date}/${KIND}.mp4`, mp4, 'video/mp4')
  const jpg = path.join(OUT, 'out', `${KIND}-${date}-cover.jpg`)
  const ff = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-ss', '0.3', '-i', mp4, '-frames:v', '1', '-q:v', '3', jpg])
  if (ff.status === 0 && fs.existsSync(jpg)) await upload(`days/${date}/${KIND}-cover.jpg`, jpg, 'image/jpeg'); else log('  no cover (Pinterest will be skipped)')
  const seconds = durationOf(mp4)
  const bundle = await build({ entryPoints: [path.join(ROOT, 'src/data/bible/questions.ts')], bundle: true, format: 'esm', platform: 'node', target: 'es2022', outfile: path.join(OUT, 'verses.mjs'), alias: { '@': path.join(ROOT, 'src') }, define: defines(), logLevel: 'error' })
  void bundle
  const { getVerseForDate } = await import(path.join(OUT, 'verses.mjs'))
  for (const platform of platforms) {
    try {
      const r = await fn('post', { date, kind: KIND, videoUrl, platforms: [platform], scheduleDate, reference: getVerseForDate(date).reference, seconds })
      for (const row of r.results ?? []) log(`  ${row.platform.padEnd(10)} ${row.status}${row.error ? ` — ${row.error}` : ''}${row.postUrl ? ` ${row.postUrl}` : ''}`)
    } catch (e) { log(`  ${platform.padEnd(10)} error — ${String(e?.message || e).slice(0, 200)}`) }
  }
  process.exit(0)
}

// ---- the browser bundle and its server ------------------------------------------------
function defines() {
  const d = { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'import.meta.env.MODE': '"production"', 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(origin), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(ANON) }
  for (const k of ['VITE_AUTH_REDIRECT_URL', 'VITE_VAPID_PUBLIC_KEY', 'VITE_SUPPORT_URL', 'VITE_REVENUECAT_IOS_KEY', 'VITE_DEFAULT_TRANSLATION', 'VITE_BUY_CEPHAS']) d[`import.meta.env.${k}`] = '""'
  return d
}
fs.mkdirSync(path.join(OUT, 'out'), { recursive: true })
const port = 8890 + Math.floor(Math.random() * 100)
const origin = `http://127.0.0.1:${port}`
await build({
  entryPoints: [path.join(ROOT, 'src/lib/tiktokVoiceCli.ts')], bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
  outfile: path.join(OUT, 'voice.mjs'), alias: { '@': path.join(ROOT, 'src') }, define: defines(), logLevel: 'error',
  loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl', '.css': 'empty' },
})
fs.writeFileSync(path.join(OUT, 'voice.html'), '<!doctype html><meta charset="utf-8"><title>tiktok voice</title><body><script type="module" src="./voice.mjs"></script>')
const MIME = { '.ttf': 'font/ttf', '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.wav': 'audio/wav', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream' }
function serveFile(res, file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'content-length': fs.statSync(file).size })
  fs.createReadStream(file).pipe(res)
}
let inputWav = ''
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin)
    const chunks = []; for await (const c of req) chunks.push(c); const body = Buffer.concat(chunks)
    if (url.pathname === '/functions/v1/tiktok-gen') {
      const r = await fetch(SUPABASE_URL + url.pathname, { method: 'POST', body, headers: { 'content-type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}`, 'x-runner-token': TOKEN } })
      const text = (await r.text()).split(SUPABASE_URL).join(origin)
      res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(text); return
    }
    if (url.pathname.startsWith('/storage/v1/')) {
      // Reads pass through; the signed-URL uploads the page makes (the WAV, the transcript) pass through too.
      const h = {}; for (const k of ['content-type', 'authorization', 'apikey', 'x-upsert', 'cache-control']) if (req.headers[k]) h[k] = req.headers[k]
      const r = await fetch(SUPABASE_URL + url.pathname + url.search, { method: req.method, headers: h, body: ['POST', 'PUT'].includes(req.method) ? body : undefined })
      res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/octet-stream' })
      res.end(req.method === 'HEAD' ? undefined : Buffer.from(await r.arrayBuffer())); return
    }
    if (url.pathname === '/voice.html' || url.pathname === '/voice.mjs') return serveFile(res, path.join(OUT, url.pathname))
    if (url.pathname === '/input.wav') return serveFile(res, inputWav)
    if (MODELS_DIR && (url.pathname.startsWith('/models/') || url.pathname.startsWith('/ort/') || url.pathname.startsWith('/fonts/'))) return serveFile(res, path.join(MODELS_DIR, decodeURIComponent(url.pathname)))
    return serveFile(res, path.join(ROOT, 'public', decodeURIComponent(url.pathname)))
  } catch (e) { res.writeHead(500); res.end(String(e)) }
})
await new Promise((r) => server.listen(port, '127.0.0.1', r))

const proxy = env.PW_PROXY || env.HTTPS_PROXY || env.https_proxy || ''
const browser = await chromium.launch({ headless: true, executablePath: env.PW_CHROMIUM || undefined, proxy: proxy ? { server: proxy, bypass: '127.0.0.1,localhost' } : undefined })
const context = await browser.newContext({ acceptDownloads: true, ignoreHTTPSErrors: !!proxy })
const page = await context.newPage()
if (MODELS_DIR) await page.addInitScript((o) => { window.__vaModelBase = o.base; window.__vaLocalFonts = o.fonts }, { base: origin, fonts: fs.existsSync(path.join(MODELS_DIR, 'fonts', 'baloo2-700.ttf')) })
page.on('console', (m) => { if (m.type() === 'error' && !/WebGPU|adapters|content-length/i.test(m.text())) log('  [page]', m.text().slice(0, 240)) })
await page.goto(`${origin}/voice.html`, { waitUntil: 'load' })
await page.waitForFunction(() => !!window.vaVoice, null, { timeout: 60_000 })
const ticker = setInterval(async () => { try { const p = await page.evaluate(() => window.__progress); if (p) log('  …', p) } catch { /* gone */ } }, 10_000)
const done = async (code = 0) => { clearInterval(ticker); await browser.close().catch(() => {}); server.close(); process.exit(code) }

try {
  if (cmd === 'drafts') {
    const start = isDate(args[0]) ? args[0] : ymdIn(TZ)
    const n = Math.max(1, Math.min(14, Number(args[1] || 7)))
    const dates = Array.from({ length: n }, (_, i) => addDays(start, i))
    const rows = await page.evaluate(([d, t, f, pl]) => window.vaVoice.drafts(d, t, f, pl), [dates, TOKEN, !!flags.redraft, PLACE])
    const mark = (p) => (p.listened ? ' · 🎙 recorded and listened' : p.recorded ? ' · ⏳ recorded, not listened' : '')
    const body = (p) => `${p.text}\n\n*${p.words} words · ~${Math.round(p.words / 2.4)}s · ${p.source === 'operator' ? 'your edit' : 'drafted'}*`
    const md = rows.map((r) => [
      `## ${r.date} · ${r.reference}`,
      `> ${r.verse}`,
      `### Morning — after the verse${mark(r.verseWord)}`,
      body(r.verseWord),
      ...(r.storyWord ? [`### Evening — ${r.storyPlace === 'open' ? 'introducing the story' : 'after the story'}${mark(r.storyWord)}`, body(r.storyWord)] : []),
    ].join('\n\n') + '\n').join('\n')
    console.log(md)
    await done()
  }
  if (cmd === 'identify') {
    if (!args.length) fail('identify <audio files…>')
    const start = ymdIn(TZ)
    const dates = Array.from({ length: 14 }, (_, i) => addDays(start, i))
    for (const file of args) {
      inputWav = path.join(OUT, `identify.wav`)
      if (!toWav(file, inputWav)) { console.log(`${file}\tunreadable`); continue }
      const r = await page.evaluate(([w, d, t]) => window.vaVoice.identify(w, d, t), [`${origin}/input.wav`, dates, TOKEN])
      console.log(`${path.basename(file)}\t${r.best ? `${r.best.date}\t${r.best.reference}\t${r.best.matched}/${r.best.words}` : 'no match'}\t${(durationOf(inputWav) ?? 0).toFixed(0)}s\t${r.opening}`)
    }
    await done()
  }
  if (cmd === 'split') {
    const file = args[0], start = args[1]
    if (!file || !fs.existsSync(file) || !isDate(start)) fail('split <audio file> <start date> [--days=N] [--story] [--intro] [--dry] [--reuse]')
    // `--days=14`, not `--days 14`: the flags here are all `--key=value`, and
    // a bare `--days` reads as TRUE, which Number() turns into 1 — a silent
    // one-take split rather than an error. Refuse it instead.
    if (flags.days === true) fail('use --days=N')
    const days = Math.max(1, Math.min(31, Number(flags.days) || 14))
    inputWav = path.join(OUT, 'batch.wav')
    if (!toWav(file, inputWav)) fail(`could not decode ${file}`)
    // Listening to five minutes takes about three, and the cut usually wants
    // a second look — so the pass is cached against the decoded WAV and
    // `--reuse` reads it back rather than hearing it again.
    const heardPath = path.join(OUT, 'batch.json')
    let heard
    if (flags.reuse && fs.existsSync(heardPath)) { heard = JSON.parse(fs.readFileSync(heardPath, 'utf8')); log('reusing the last transcript') }
    else { heard = await page.evaluate(([w, t]) => window.vaVoice.hear(w, t), [`${origin}/input.wav`, TOKEN]); fs.writeFileSync(heardPath, JSON.stringify(heard)) }
    log(`heard ${heard.seconds.toFixed(0)}s · ${heard.words.length} words`)
    if (flags.dry) log(`  transcript: ${heard.text.slice(0, 600)}`)
    // The take numbers. Whisper writes them as words or as digits, so both
    // are read, and a number only STARTS a take when a real pause sits in
    // front of it — otherwise "one" inside a sentence would cut the take in
    // half. The first word of the recording needs no pause before it.
    const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 }
    const GAP = 0.9
    const marks = []
    heard.words.forEach((w, i) => {
      const k = w.text.toLowerCase().replace(/[^a-z0-9]/g, '')
      const n = NUM[k] ?? (/^\d{1,2}$/.test(k) ? Number(k) : 0)
      if (!n || n > days) return
      const prev = heard.words[i - 1]
      if (prev && w.start - prev.end < GAP) return
      if (marks.length && n !== marks[marks.length - 1].n + 1) return
      if (!marks.length && n !== 1) return
      marks.push({ n, i, at: w.start, end: w.end })
    })
    log(`found ${marks.length} of ${days} takes`)
    if (marks.length !== days) log('  (the run stops at the last number found in order — check the cut below)')
    const takes = marks.map((m, k) => {
      const words = heard.words.slice(m.i + 1, marks[k + 1] ? marks[k + 1].i : heard.words.length)
      const from = words[0] ? Math.max(m.end, words[0].start - 0.35) : m.end
      const to = words.length ? Math.min(heard.seconds, words[words.length - 1].end + 0.5) : from
      return { date: addDays(start, m.n - 1), n: m.n, from, to, words, text: words.map((w) => w.text).join(' ') }
    })
    for (const t of takes) log(`  ${String(t.n).padStart(2)} ${t.date}  ${t.from.toFixed(1)}–${t.to.toFixed(1)}s (${(t.to - t.from).toFixed(1)}s ${t.words.length}w)  ${t.text.slice(0, 74)}`)
    if (flags.dry) { await done() }
    for (const t of takes) {
      const wav = path.join(OUT, `take-${t.date}.wav`)
      const ff = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', inputWav, '-ss', String(t.from), '-to', String(t.to), '-c:a', 'pcm_s16le', wav])
      if (ff.status !== 0) { log(`  ${t.date} could not be cut`); continue }
      // Timings are rebased onto the take's own clock, and the track is the
      // shape `refit`, the correction step and the renderer already read.
      const words = t.words.map((w) => ({ text: w.text, start: Math.max(0, w.start - t.from), end: Math.max(0, w.end - t.from) }))
      const track = { seconds: t.to - t.from, verse: [], thought: words, heard: words, text: t.text, verseMatched: 0, place: PLACE, at: new Date().toISOString() }
      await upload(`days/${t.date}/voice-${KIND}.wav`, wav, 'audio/wav')
      const json = path.join(OUT, `take-${t.date}.json`)
      fs.writeFileSync(json, JSON.stringify(track))
      await upload(`days/${t.date}/voice-${KIND}.json`, json, 'application/json')
      try { await fn('copy', { date: t.date, kind: KIND, force: true }) } catch { /* written at render time otherwise */ }
      log(`  parked ${t.date} ${KIND}${KIND === 'story' ? ` (${PLACE})` : ''}`)
    }
    await done()
  }
  if (cmd === 'listen') {
    const [date, file] = args
    if (!isDate(date) || !file || !fs.existsSync(file)) fail('listen <date> <audio file>')
    inputWav = path.join(OUT, `input-${date}-${KIND}.wav`)
    if (!toWav(file, inputWav)) fail(`ffmpeg could not read ${file}`)
    log(`listening to ${file} (${(durationOf(inputWav) ?? 0).toFixed(0)}s) for ${date} ${KIND}`)
    const r = await page.evaluate(([d, w, t, k, pl]) => window.vaVoice.listen(d, w, t, k, pl), [date, `${origin}/input.wav`, TOKEN, KIND, PLACE])
    console.log(JSON.stringify({ date, kind: KIND, ...r }, null, 1))
    await done()
  }
  if (cmd === 'fix') {
    const [date, file] = args
    if (!isDate(date) || !file || !fs.existsSync(file)) fail('fix <date> <text file>')
    const text = fs.readFileSync(file, 'utf8').replace(/\s+/g, ' ').trim()
    if (!text) fail(`${file} is empty`)
    const r = await page.evaluate(([d, t, tok, k]) => window.vaVoice.fix(d, t, tok, k), [date, text, TOKEN, KIND])
    log(`refit ${r.words} words onto ${r.heard} heard for ${date} ${KIND}`)
    console.log(JSON.stringify({ date, kind: KIND, ...r }, null, 1))
    await done()
  }
  if (cmd === 'render') {
    const date = args[0]; if (!isDate(date)) fail('render <date>')
    const [dl, r] = await Promise.all([page.waitForEvent('download', { timeout: 900_000 }), page.evaluate(([d, t, k, pl]) => window.vaVoice.render(d, t, k, pl), [date, TOKEN, KIND, PLACE])])
    const raw = path.join(OUT, 'out', `${KIND}-${date}.${r.ext}`)
    await dl.saveAs(raw)
    log(`rendered ${r.ext} ${(r.size / 1e6).toFixed(1)}MB · ${r.reference} · ${r.tier} · ${r.seconds.toFixed(0)}s · ${r.phrases} captions`)
    const mp4 = mp4For(date, KIND)
    const ff = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', raw, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart', mp4], { stdio: 'inherit' })
    if (ff.status !== 0) fail(`ffmpeg failed (${ff.error?.message || `exit ${ff.status}`})`)
    if (raw !== mp4) fs.unlinkSync(raw)
    log(`mp4 ${(fs.statSync(mp4).size / 1e6).toFixed(1)}MB → ${mp4}`)
    console.log(mp4)
    await done()
  }
} catch (e) {
  log(`failed: ${String(e?.message || e).slice(0, 400)}`)
  await done(1)
}
