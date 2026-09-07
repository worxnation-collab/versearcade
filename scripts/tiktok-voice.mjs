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
//   node scripts/tiktok-voice.mjs listen <date> <audio file>
//       Decode any phone memo (m4a, mp3, wav, webm, ogg) to a WAV, park it,
//       listen to it (Whisper base in the browser), park the transcript and
//       rewrite the day's caption. Prints the transcript to check.
//   node scripts/tiktok-voice.mjs render <date>
//       The verse post with the parked recording, as an H.264 MP4 in
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
if (!['drafts', 'listen', 'render', 'post', 'clear'].includes(cmd)) fail('usage: drafts | listen <date> <file> | render <date> | post <date> [--at HH:MM|--now] | clear <date>')
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d)

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
function durationOf(src) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-i', src], { encoding: 'utf8' })
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec((r.stderr || '') + (r.stdout || ''))
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : undefined
}

// ---- commands that need no browser ----------------------------------------------
if (cmd === 'clear') {
  const date = args[0]; if (!isDate(date)) fail('clear <date>')
  await fn('voice-clear', { date }); log(`cleared ${date}`); process.exit(0)
}
if (cmd === 'post') {
  const date = args[0]; if (!isDate(date)) fail('post <date> [--at HH:MM|--now]')
  const mp4 = path.join(OUT, 'out', `voice-${date}.mp4`)
  if (!fs.existsSync(mp4)) fail(`no ${mp4} — run render first`)
  await build({ entryPoints: [path.join(ROOT, 'supabase/functions/tiktok-gen/social.ts')], bundle: true, format: 'esm', platform: 'node', outfile: path.join(OUT, 'social.mjs'), logLevel: 'error' })
  const social = await import(path.join(OUT, 'social.mjs'))
  const platforms = String(flags.platforms || 'tiktok,youtube,facebook,instagram,x,snapchat,threads,pinterest').split(',').map((s) => s.trim()).filter((p) => social.postsOn(p, 'verse'))
  const scheduleDate = flags.now ? undefined : zonedToUtc(date, String(flags.at || '07:00'), TZ).toISOString().replace(/\.\d{3}Z$/, 'Z')
  log(`post verse ${date} → ${scheduleDate ? `scheduled ${flags.at || '07:00'} ${TZ} (${scheduleDate})` : 'now'} · ${platforms.join(',')}`)
  const videoUrl = await upload(`days/${date}/verse.mp4`, mp4, 'video/mp4')
  const jpg = path.join(OUT, 'out', `voice-${date}-cover.jpg`)
  const ff = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-ss', '0.3', '-i', mp4, '-frames:v', '1', '-q:v', '3', jpg])
  if (ff.status === 0 && fs.existsSync(jpg)) await upload(`days/${date}/verse-cover.jpg`, jpg, 'image/jpeg'); else log('  no cover (Pinterest will be skipped)')
  const seconds = durationOf(mp4)
  const bundle = await build({ entryPoints: [path.join(ROOT, 'src/data/bible/questions.ts')], bundle: true, format: 'esm', platform: 'node', target: 'es2022', outfile: path.join(OUT, 'verses.mjs'), alias: { '@': path.join(ROOT, 'src') }, define: defines(), logLevel: 'error' })
  void bundle
  const { getVerseForDate } = await import(path.join(OUT, 'verses.mjs'))
  for (const platform of platforms) {
    try {
      const r = await fn('post', { date, kind: 'verse', videoUrl, platforms: [platform], scheduleDate, reference: getVerseForDate(date).reference, seconds })
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
    const rows = await page.evaluate(([d, t, f]) => window.vaVoice.drafts(d, t, f), [dates, TOKEN, !!flags.redraft])
    const md = rows.map((r) => `## ${r.date} · ${r.reference}${r.listened ? ' · 🎙 recorded and listened' : r.recorded ? ' · ⏳ recorded, not listened' : ''}\n\n> ${r.verse}\n\n${r.text}\n\n*${r.words} words · ~${Math.round(r.words / 2.4)}s · ${r.source === 'operator' ? 'your edit' : 'drafted'}*\n`).join('\n')
    console.log(md)
    await done()
  }
  if (cmd === 'listen') {
    const [date, file] = args
    if (!isDate(date) || !file || !fs.existsSync(file)) fail('listen <date> <audio file>')
    inputWav = path.join(OUT, `input-${date}.wav`)
    const ff = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', file, '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', inputWav])
    if (ff.status !== 0) fail(`ffmpeg could not read ${file}`)
    log(`listening to ${file} (${(durationOf(inputWav) ?? 0).toFixed(0)}s) for ${date}`)
    const r = await page.evaluate(([d, w, t]) => window.vaVoice.listen(d, w, t), [date, `${origin}/input.wav`, TOKEN])
    console.log(JSON.stringify({ date, ...r }, null, 1))
    await done()
  }
  if (cmd === 'render') {
    const date = args[0]; if (!isDate(date)) fail('render <date>')
    const [dl, r] = await Promise.all([page.waitForEvent('download', { timeout: 900_000 }), page.evaluate(([d, t]) => window.vaVoice.render(d, t), [date, TOKEN])])
    const raw = path.join(OUT, 'out', `voice-${date}.${r.ext}`)
    await dl.saveAs(raw)
    log(`rendered ${r.ext} ${(r.size / 1e6).toFixed(1)}MB · ${r.reference} · ${r.tier} · ${r.seconds.toFixed(0)}s`)
    const mp4 = path.join(OUT, 'out', `voice-${date}.mp4`)
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
