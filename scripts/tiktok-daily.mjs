#!/usr/bin/env node
// tiktok-daily — makes the day's posts with nobody at the dashboard.
//
// What it does, once a day (GitHub Actions, .github/workflows/tiktok-daily.yml)
// or from any machine with the keys:
//
//   1. Works out the operator's date in TIKTOK_TZ. Dates are the user's local
//      date everywhere in this app, and the runner has no clock of its own
//      worth trusting (CI sits in UTC), so the zone is explicit.
//   2. Bundles src/lib/tiktokDaily.ts — the SAME generators the dashboard
//      uses — opens it in headless Chromium and renders each post: the verse
//      and the story for today, the quiz replay for YESTERDAY (its answers are
//      public only once the day has rolled over).
//   3. Transcodes each file with ffmpeg to H.264/AAC MP4 (headless Chromium on
//      Linux encodes VP9/Opus WebM, and TikTok and Instagram refuse WebM).
//   4. Uploads it and schedules it through Ayrshare at that post's time of day
//      in TIKTOK_TZ: the verse in the morning, the replay at lunch, the story
//      in the evening. A time already past posts immediately.
//
// Two modes, by which keys are present:
//   function — TIKTOK_RUNNER_TOKEN: every Gemini and Ayrshare call goes
//              through the tiktok-gen Edge Function exactly as the dashboard's
//              do (the function takes the token, from Vault, as the admin —
//              it can make these posts and nothing else, which is all a CI
//              secret should be able to do). The video lands in the tiktok
//              bucket, so the dashboard shows it.
//   local    — AYRSHARE_API_KEY + GEMINI_API_KEY, no service key: a small shim
//              stands in for the function (TTS through Gemini directly; copy
//              and story read from the bucket's public cache, never rewritten)
//              and the video is uploaded to Ayrshare's own media store.
//
// Environment: SUPABASE_URL, SUPABASE_ANON_KEY (public, defaulted), TIKTOK_TZ
// (default America/New_York), DATE (override today), KINDS (default
// verse,story,quiz), POST_TIMES (default verse=07:00,quiz=12:30,story=19:30),
// PLATFORMS (default all six: TikTok, YouTube, Facebook, Instagram, X, Snapchat), DRY_RUN (render only), FFMPEG (binary path),
// PW_CHROMIUM (executable path when Playwright's own browser is not installed),
// RERENDER (make the video again even if the day's is already in the bucket),
// MODELS_DIR (serve the aligner's Whisper model, ONNX runtime and, if
// `fonts/baloo2-{700,800}.ttf` are there, the display font locally).
//
// Idempotent per (date, kind, platform) on Ayrshare's side, so a re-run of the
// same day cannot post the same video twice.

import { build } from 'esbuild'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const ROOT = process.cwd()
const OUT = path.join(ROOT, '.tiktok-daily')
const env = process.env
const SUPABASE_URL = (env.SUPABASE_URL || 'https://visuppaucpzzigwtqmdd.supabase.co').replace(/\/$/, '')
const ANON = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || ''
const RUNNER_TOKEN = env.TIKTOK_RUNNER_TOKEN || ''
const GEMINI_KEY = env.GEMINI_API_KEY || ''
const AYRSHARE_KEY = env.AYRSHARE_API_KEY || ''
const TZ = env.TIKTOK_TZ || 'America/New_York'
const KINDS = (env.KINDS || 'verse,story,quiz').split(',').map((s) => s.trim()).filter(Boolean)
const PLATFORMS = (env.PLATFORMS || 'tiktok,youtube,facebook,instagram,x,snapchat').split(',').map((s) => s.trim()).filter(Boolean)
const DRY = /^(1|true|yes)$/i.test(env.DRY_RUN || '')
const FFMPEG = env.FFMPEG || 'ffmpeg'
const TIMES = Object.fromEntries((env.POST_TIMES || 'verse=07:00,quiz=12:30,story=19:30').split(',').map((kv) => kv.split('=').map((s) => s.trim())))
const TTS_MODEL = env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts'
// A directory holding `models/onnx-community/whisper-tiny.en_timestamped/…` and
// `ort/ort-wasm-simd-threaded*.{mjs,wasm}`: served to the page so the aligner
// needs no route to huggingface.co. Optional; unset fetches them from the web.
const MODELS_DIR = env.MODELS_DIR || ''

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const fail = (m) => { console.error('tiktok-daily:', m); process.exit(2) }

const mode = RUNNER_TOKEN ? 'function' : AYRSHARE_KEY ? 'local' : null
if (!mode) fail('set TIKTOK_RUNNER_TOKEN (function mode) or AYRSHARE_API_KEY + GEMINI_API_KEY (local mode)')
if (mode === 'local' && !GEMINI_KEY) fail('local mode needs GEMINI_API_KEY for the reading')
if (!ANON) fail('SUPABASE_ANON_KEY is required (it is the public key the site ships)')
for (const k of KINDS) if (!['verse', 'story', 'quiz'].includes(k)) fail(`unknown kind ${k}`)

// ---- dates and times in the operator's zone ---------------------------------------
function ymdIn(tz, d = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const g = (t) => p.find((x) => x.type === t).value
  return `${g('year')}-${g('month')}-${g('day')}`
}
function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
// A wall-clock time in `tz` on `ymd`, as the UTC instant Ayrshare wants.
function zonedToUtc(ymd, hhmm, tz) {
  const [h, mi] = hhmm.split(':').map(Number)
  const [y, mo, d] = ymd.split('-').map(Number)
  const want = Date.UTC(y, mo - 1, d, h, mi)
  let t = want
  for (let i = 0; i < 2; i++) {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t))
    const g = (k) => Number(p.find((x) => x.type === k).value)
    const seen = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'))
    t += want - seen
  }
  return new Date(t)
}
const today = env.DATE || ymdIn(TZ)
const yesterday = addDays(today, -1)
log(`mode ${mode} · ${TZ} · today ${today} · kinds ${KINDS.join(',')} · platforms ${PLATFORMS.join(',')}${DRY ? ' · DRY RUN' : ''}`)

// ---- the browser bundle --------------------------------------------------------------
fs.mkdirSync(path.join(OUT, 'cache'), { recursive: true })
fs.mkdirSync(path.join(OUT, 'out'), { recursive: true })
const port = 8790 + Math.floor(Math.random() * 100)
const origin = `http://127.0.0.1:${port}`
// The page talks only to this server: the function and the bucket are proxied
// through it, so the browser never needs a route of its own to supabase.co.
const fnBase = origin
const defines = {
  'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'import.meta.env.MODE': '"production"',
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(fnBase),
  'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(ANON),
}
for (const k of ['VITE_AUTH_REDIRECT_URL', 'VITE_VAPID_PUBLIC_KEY', 'VITE_SUPPORT_URL', 'VITE_REVENUECAT_IOS_KEY', 'VITE_DEFAULT_TRANSLATION', 'VITE_BUY_CEPHAS']) defines[`import.meta.env.${k}`] = '""'
await build({
  entryPoints: [path.join(ROOT, 'src/lib/tiktokDaily.ts')], bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
  outfile: path.join(OUT, 'daily.mjs'), alias: { '@': path.join(ROOT, 'src') }, define: defines, logLevel: 'error',
  loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl', '.css': 'empty' },
})
await build({
  entryPoints: [path.join(ROOT, 'supabase/functions/tiktok-gen/social.ts')], bundle: true, format: 'esm', platform: 'node',
  outfile: path.join(OUT, 'social.mjs'), logLevel: 'error',
})
const social = await import(path.join(OUT, 'social.mjs'))
// The verse for a date, for the reference a skipped render would have reported.
await build({
  entryPoints: [path.join(ROOT, 'src/data/bible/questions.ts')], bundle: true, format: 'esm', platform: 'node', target: 'es2022',
  outfile: path.join(OUT, 'verses.mjs'), alias: { '@': path.join(ROOT, 'src') }, define: defines, logLevel: 'error',
})
const { getVerseForDate } = await import(path.join(OUT, 'verses.mjs'))
fs.writeFileSync(path.join(OUT, 'daily.html'), '<!doctype html><meta charset="utf-8"><title>tiktok daily</title><body><script type="module" src="./daily.mjs"></script>')

// ---- the server: the page, the app's art, and (local mode) a shim for the function --
const MIME = { '.ttf': 'font/ttf', '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.wav': 'audio/wav', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' }
function serveFile(res, file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'content-length': fs.statSync(file).size })
  fs.createReadStream(file).pipe(res)
}
async function readJson(req) { const chunks = []; for await (const c of req) chunks.push(c); return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') }
function fnv(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h.toString(16).padStart(8, '0') }
function pcmToWav(pcm, sampleRate) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8)
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34)
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}
const bucketJson = async (rel) => {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/public/tiktok/${rel}`)
  return r.ok ? r.json() : null
}
// The shim: only what a render needs, and nothing that writes to the bucket.
async function shim(input) {
  const a = String(input.action ?? '')
  if (a === 'tts') {
    const speakers = Array.isArray(input.speakers) ? input.speakers.slice(0, 2) : []
    const multi = speakers.length === 2
    const style = String(input.style ?? '').slice(0, 400), text = String(input.text ?? '').slice(0, 2400)
    const key = `${multi ? speakers.map((s) => s.voice).join('+') : input.voice}-${fnv(style + '\n' + text)}`
    const file = path.join(OUT, 'cache', `${key}.wav`)
    if (!fs.existsSync(file)) {
      const speechConfig = multi
        ? { multiSpeakerVoiceConfig: { speakerVoiceConfigs: speakers.map((x) => ({ speaker: x.name, voiceConfig: { prebuiltVoiceConfig: { voiceName: x.voice } } })) } }
        : { voiceConfig: { prebuiltVoiceConfig: { voiceName: String(input.voice ?? 'Charon') } } }
      const lead = multi ? `${style}\n\nTTS the following, with the named speakers:\n\n` : `${style}\n\n`
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
        body: JSON.stringify({ contents: [{ parts: [{ text: `${lead}${text}` }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig } }),
      })
      const data = await r.json()
      const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)
      if (!part) return { error: `no audio: ${JSON.stringify(data).slice(0, 300)}` }
      const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType ?? '')?.[1] ?? 24000)
      fs.writeFileSync(file, pcmToWav(Buffer.from(part.inlineData.data, 'base64'), rate))
    }
    return { url: `${origin}/cache/${key}.wav`, cached: true }
  }
  if (a === 'copy') {
    const j = await bucketJson(`days/${input.date}/copy-${input.kind ?? 'verse'}.json`)
    return j ?? { error: `no copy cached for ${input.date} ${input.kind}: open Today's words in the dashboard first` }
  }
  if (a === 'story') {
    const j = await bucketJson(`days/${input.date}/story.json`)
    return j ?? { error: `no story cached for ${input.date}: open Story time in the dashboard first` }
  }
  return { error: `the runner's shim has no ${a}` }
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin)
    if (url.pathname === '/functions/v1/tiktok-gen') {
      if (mode === 'local') {
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return }
        const out = await shim(await readJson(req))
        res.writeHead(out.error ? 400 : 200, { 'content-type': 'application/json' }); res.end(JSON.stringify(out)); return
      }
      // Function mode: straight through to the real function, with the
      // runner token on every call whatever the page sent.
      const chunks = []; for await (const c of req) chunks.push(c)
      const r = await fetch(SUPABASE_URL + url.pathname, {
        method: req.method, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
        headers: { 'content-type': req.headers['content-type'] || 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}`, 'x-runner-token': RUNNER_TOKEN },
      })
      // Public URLs the function returns (the parked reading, a still) are
      // rewritten onto this origin so the page fetches them through here too.
      const text = (await r.text()).split(SUPABASE_URL).join(origin)
      res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/json' })
      res.end(text); return
    }
    if (url.pathname.startsWith('/storage/v1/')) {
      // The app's art in the bucket (painted stills, loops): straight through.
      // (Reads only: the upload goes from Node with the signed URL below.)
      const r = await fetch(SUPABASE_URL + url.pathname + url.search, { method: req.method === 'HEAD' ? 'HEAD' : 'GET' })
      res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/octet-stream' })
      res.end(req.method === 'HEAD' ? undefined : Buffer.from(await r.arrayBuffer())); return
    }
    if (url.pathname === '/daily.html' || url.pathname === '/daily.mjs' || url.pathname.startsWith('/cache/')) return serveFile(res, path.join(OUT, url.pathname))
    if (MODELS_DIR && (url.pathname.startsWith('/models/') || url.pathname.startsWith('/ort/') || url.pathname.startsWith('/fonts/'))) return serveFile(res, path.join(MODELS_DIR, decodeURIComponent(url.pathname)))
    return serveFile(res, path.join(ROOT, 'public', decodeURIComponent(url.pathname)))
  } catch (e) { res.writeHead(500); res.end(String(e)) }
})
await new Promise((r) => server.listen(port, '127.0.0.1', r))

// ---- Ayrshare and the function ----------------------------------------------------------
async function ayrshare(p, body, method = 'POST') {
  const r = await fetch(`https://api.ayrshare.com/api/${p}`, { method, headers: { 'content-type': 'application/json', Authorization: `Bearer ${AYRSHARE_KEY}` }, body: method === 'GET' ? undefined : JSON.stringify(body) })
  const t = await r.text(); try { return JSON.parse(t) } catch { return { status: 'error', raw: t.slice(0, 300) } }
}
// One function call PER PLATFORM. Ayrshare fetches the video and hands it to
// the network inside the call, which takes a while for a 17MB story, and six
// of those in one request ran past the function gateway's limit — the
// function finished the job while the runner was already looking at a
// timeout. The function merges each call's rows over the day's record, so
// this is the same result in six short requests. A call that still fails is
// recorded as an error row rather than ending the run.
async function postEach(platforms, body) {
  const results = []
  for (const platform of platforms) {
    try {
      const r = await fn('post', { ...body, platforms: [platform] })
      results.push(...(Array.isArray(r.results) ? r.results : [{ platform, status: 'error', error: `no result: ${JSON.stringify(r).slice(0, 160)}` }]))
    } catch (e) {
      results.push({ platform, status: 'error', error: String(e?.message || e).slice(0, 200) })
    }
  }
  return { results }
}
async function fn(action, body) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/tiktok-gen`, { method: 'POST', headers: { 'content-type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}`, 'x-runner-token': RUNNER_TOKEN }, body: JSON.stringify({ action, ...body }) })
  const j = await r.json().catch(() => ({ error: `function ${r.status}` }))
  if (j.error) throw new Error(`${action}: ${j.error}`)
  return j
}

// ---- render, transcode, upload, schedule ----------------------------------------------------
// Behind an egress proxy (a sandbox, a locked-down runner) the browser has to be
// told about it: Playwright ignores HTTPS_PROXY, and the aligner's model and the
// display font both come from the open web. The proxy's own CA is not in
// Chromium's store, so certificate checks are relaxed ONLY when one is set.
const proxy = env.PW_PROXY || env.HTTPS_PROXY || env.https_proxy || ''
const browser = await chromium.launch({ headless: true, executablePath: env.PW_CHROMIUM || undefined, proxy: proxy ? { server: proxy, bypass: '127.0.0.1,localhost' } : undefined })
const context = await browser.newContext({ acceptDownloads: true, ignoreHTTPSErrors: !!proxy })
const page = await context.newPage()
if (MODELS_DIR) await page.addInitScript((o) => { window.__vaModelBase = o.base; window.__vaLocalFonts = o.fonts }, { base: origin, fonts: fs.existsSync(path.join(MODELS_DIR, 'fonts', 'baloo2-700.ttf')) })
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log('  [page]', m.text().slice(0, 240), m.location()?.url ? `(${m.location().url.slice(0, 160)})` : '') })
page.on('requestfailed', (r) => log('  [net]', r.failure()?.errorText, r.url().slice(0, 160)))
await page.goto(`${origin}/daily.html`, { waitUntil: 'load' })
await page.waitForFunction(() => !!window.versearcadeDaily, null, { timeout: 60_000 })

const results = []
for (const kind of KINDS) {
  const date = kind === 'quiz' ? yesterday : today
  const at = zonedToUtc(today, TIMES[kind] || '12:00', TZ)
  const scheduleDate = at.getTime() > Date.now() + 90_000 ? at.toISOString().replace(/\.\d{3}Z$/, 'Z') : undefined
  log(`${kind} ${date} → ${scheduleDate ? `scheduled ${TIMES[kind]} ${TZ} (${scheduleDate})` : 'posts now'}`)

  // Make what is missing. A second run on the same day (a retry after the
  // posting service refused, a manual dispatch after the cron) must not
  // re-render five minutes of video or post a second time: a post already
  // accepted for every platform is skipped, and a video already parked in
  // the bucket is posted as it is unless RERENDER is set.
  let videoUrl, posted
  if (mode === 'function' && !DRY) {
    const prior = await fn('posted', { date, kind }).catch(() => ({}))
    const rows = Array.isArray(prior.results) ? prior.results : []
    // Only the platforms that have not been accepted yet: a platform that
    // failed, or was not linked last time, is tried again; one Ayrshare took
    // is left alone (its idempotency key would refuse a repeat anyway).
    const done = new Set(rows.filter((r) => r.status !== 'error' && r.status !== 'skipped').map((r) => r.platform))
    const todo = PLATFORMS.filter((p) => !done.has(p))
    if (!todo.length) {
      log(`  already posted (${rows.map((r) => `${r.platform} ${r.status}`).join(', ')})`)
      results.push({ kind, date, videoUrl: prior.videoUrl, results: rows, skipped: 'posted' }); continue
    }
    if (done.size) log(`  already on ${[...done].join(', ')} — posting to ${todo.join(', ')}`)
    const parked = `${SUPABASE_URL}/storage/v1/object/public/tiktok/days/${date}/${kind}.mp4`
    const head = await fetch(parked, { method: 'HEAD' }).catch(() => null)
    if (!/^(1|true|yes)$/i.test(env.RERENDER || '') && head?.ok && /^video\//.test(head.headers.get('content-type') || '')) {
      log(`  already rendered (${(Number(head.headers.get('content-length') || 0) / 1e6).toFixed(1)}MB in the bucket) — posting that`)
      videoUrl = parked
      posted = await postEach(todo, { date, kind, videoUrl, scheduleDate, reference: getVerseForDate(date).reference })
      for (const r of posted.results) log(`  ${r.platform.padEnd(10)} ${r.status}${r.error ? ` — ${r.error}` : ''}${r.postUrl ? ` ${r.postUrl}` : ''}`)
      results.push({ kind, date, videoUrl, scheduleDate, results: posted.results, skipped: 'render' }); continue
    }
  }
  const ticker = setInterval(async () => { try { log('  ', await page.evaluate(() => window.__progress)) } catch { /* between pages */ } }, 20_000)
  let rendered, dl
  try {
    ;[dl, rendered] = await Promise.all([
      page.waitForEvent('download', { timeout: 45 * 60_000 }),
      page.evaluate(([k, d, t]) => window.versearcadeDaily.renderPost(k, d, t), [kind, date, mode === 'function' ? RUNNER_TOKEN : undefined]),
    ])
  } catch (e) {
    // One post failing to render must not cost the other two their slot.
    const msg = String(e?.message || e).split('\n')[0].slice(0, 300)
    log(`  render failed: ${msg}`)
    results.push({ kind, date, error: `render: ${msg}` })
    continue
  } finally { clearInterval(ticker) }
  const raw = path.join(OUT, 'out', `${kind}-${date}.${rendered.ext}`)
  await dl.saveAs(raw)
  log(`  rendered ${rendered.ext} ${(rendered.size / 1e6).toFixed(1)}MB · ${rendered.reference} · ${rendered.tier}`)

  // Always through ffmpeg: one known-good H.264/AAC/yuv420p/faststart MP4.
  const mp4 = path.join(OUT, 'out', `${kind}-${date}.mp4`)
  const ff = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', raw, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart', mp4], { stdio: 'inherit' })
  if (ff.status !== 0) { results.push({ kind, date, error: 'ffmpeg failed' }); continue }
  log(`  mp4 ${(fs.statSync(mp4).size / 1e6).toFixed(1)}MB`)
  if (DRY) { results.push({ kind, date, mp4, dryRun: true }); continue }

  if (mode === 'function') {
    const up = await fn('upload-url', { path: `days/${date}/${kind}.mp4` })
    const sb = createClient(SUPABASE_URL, ANON)
    const { error } = await sb.storage.from('tiktok').uploadToSignedUrl(up.path, up.token, fs.readFileSync(mp4), { contentType: 'video/mp4', upsert: true })
    if (error) { results.push({ kind, date, error: `upload: ${error.message}` }); continue }
    videoUrl = up.publicUrl
    posted = await postEach(PLATFORMS, { date, kind, videoUrl, scheduleDate, reference: rendered.reference })
  } else {
    const u = await ayrshare(`media/uploadUrl?fileName=${encodeURIComponent(`va-${kind}-${date}.mp4`)}&contentType=mp4`, null, 'GET')
    if (!u.uploadUrl) { results.push({ kind, date, error: `ayrshare upload url: ${JSON.stringify(u).slice(0, 200)}` }); continue }
    const put = await fetch(u.uploadUrl, { method: 'PUT', headers: { 'content-type': u.contentType || 'video/mp4' }, body: fs.readFileSync(mp4) })
    if (!put.ok) { results.push({ kind, date, error: `ayrshare put ${put.status}` }); continue }
    videoUrl = u.accessUrl
    const copy = (await bucketJson(`days/${date}/copy-${kind}.json`)) ?? {}
    const rows = []
    for (const platform of PLATFORMS) {
      const r = await ayrshare('post', social.postBody(platform, copy, { date, kind, reference: rendered.reference, videoUrl, scheduleDate }))
      rows.push(social.postResult(platform, r, scheduleDate))
    }
    posted = { date, kind, videoUrl, at: new Date().toISOString(), results: rows }
  }
  for (const r of posted.results) log(`  ${r.platform.padEnd(10)} ${r.status}${r.error ? ` — ${r.error}` : ''}${r.postUrl ? ` ${r.postUrl}` : ''}`)
  results.push({ kind, date, mp4, videoUrl, scheduleDate, results: posted.results })
}

await browser.close()
server.close()
fs.writeFileSync(path.join(OUT, 'out', 'results.json'), JSON.stringify(results, null, 2))
const bad = results.filter((r) => r.error || r.results?.some((x) => x.status === 'error'))
log(bad.length ? `done with ${bad.length} problem(s)` : 'done')
process.exit(bad.length ? 1 : 0)
