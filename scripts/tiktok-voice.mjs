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
//   node scripts/tiktok-voice.mjs note <date>
//       The day's Facebook note — the 4:5 card as a JPG and its words
//       printed. Posts nothing.
//   node scripts/tiktok-voice.mjs render <date> [--story] [--intro]
//       The post with the parked recording, as an H.264 MP4 in
//       .tiktok-voice/out/. Posts nothing.
//   node scripts/tiktok-voice.mjs unpost <date> [--story] [--platforms=a,b]
//       Take a SCHEDULED post back down, so a re-rendered video can replace
//       it. Re-post with --attempt=2: Ayrshare refuses a repeated
//       idempotency key even for a post it has deleted.
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
import { timesFrom, timeFor as sharedTimeFor } from './tiktok-times.mjs'

// The last thing between the mix and the file: a ceiling.
//
// Two voices and a music bed can sum past full scale even when every part of
// the mix was levelled politely — the soft knee bounds a SAMPLE, and what
// clips a listener is the INTER-SAMPLE peak an encoder reconstructs. After
// the recording chain was rebuilt, all eight posts of a week measured
// between +0.2 and +1.6 dBFS true peak where the last known-good post sat at
// -0.2. It is the same trap a naive +6 dB gain hit once before, at +3.1.
//
// `level=disabled` is the whole of it and is NOT optional: ffmpeg's
// alimiter AUTO-LEVELS by default, so it normalises up to the ceiling
// instead of only holding things down. With it left on, lowering the limit
// made the file LOUDER — 0.89 through 0.74 all came back at the same +0.7
// dBFS with loudness rising as the limit fell, which reads as the filter
// doing nothing rather than as it doing the opposite.
//
// And the ceiling is on the SAMPLE peak while the ear hears the INTER-SAMPLE
// peak the decoder reconstructs, about a decibel higher — 0.89 measured
// +0.1 dBFS true peak through AAC. 0.79 lands at -0.9, which is where the
// fourteen corrected stories were brought to and where the last known-good
// post sits. Measure with `ebur128=peak=true`, never `astats` — sample peak
// reads under.
const MASTER = 'alimiter=limit=0.79:level=disabled'


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
const flags = Object.fromEntries(rest.filter((a) => a.startsWith('--')).map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.length ? v.join('=') : true] }))
const args = rest.filter((a) => !a.startsWith('--'))
if (!['drafts', 'listen', 'fix', 'render', 'note', 'post', 'unpost', 'clear', 'identify', 'split', 'preview'].includes(cmd)) fail('usage: drafts | identify <files…> | listen <date> <file> | fix <date> <text file> | render <date> [--kind=K] | preview <date> --hook=<wav> --verse=<wav> --scene=<jpg> --line="…" | post <date> [--at HH:MM|--now] | unpost <date> | clear <date> | split <file> <date>')
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
//
// `--kind=<k>` names one of the week's six readings; `--story` is the
// shorthand that predates them and `verse` is the default. A bare `--kind`
// reads as TRUE, which would silently render a verse — refuse it, the
// `--days` lesson.
const READING = ['book', 'moment', 'before', 'figure', 'quiet', 'prayer']
// Every kind the engine has, not just the ones this CLI RENDERS: `unpost`,
// `clear` and `post` are addressed by kind too, and refusing `note` here
// meant twelve days of an old schedule could not be taken down from a
// terminal at all — the command answered `unknown kind note` and the run
// read as "nothing to delete".
const KINDS = ['verse', 'story', 'note', 'quiz', 'challenge', 'challenge2', 'own', ...READING]
if (flags.kind === true) fail(`use --kind=<${KINDS.join('|')}>`)
const KIND = flags.kind ? String(flags.kind) : flags.story ? 'story' : 'verse'
if (!KINDS.includes(KIND)) fail(`unknown kind ${KIND}`)
const PLACE = flags.intro ? 'open' : 'close'
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
// A phone memo, cleaned for the post: mono, 48 kHz, the room taken out of
// the low end, presence lifted where a phone mic is weakest, and the range
// closed enough that a quiet clause survives a bus.
//
// Two things are DELIBERATELY absent, and both were measured off a real memo
// rather than reasoned about:
//
//   - No DENOISER. `afftdn` was here on the assumption that a phone in a
//     room is noisy. The memo measures a -73.5 dB floor against a -18 dB
//     voice — a 55 dB gap — so there is nothing for it to remove, and what
//     it actually did was chew the breath off the front of words. Check the
//     floor (`ffmpeg -af astats`) before putting one back; a genuinely noisy
//     take is the case for it, not a phone.
//   - No LOUDNORM. Level is set per LAYOUT downstream — `trimAndLevel`
//     against `SPEECH_TARGET` ({ verse: 0.14, story: 0.26 }) — and two
//     things fighting over loudness is exactly what produced the six-decibel
//     step between his half and Tabitha's that had to be corrected in place
//     across fourteen scheduled stories. One owner, and it is the renderer.
//
// So this chain shapes TONE and DYNAMICS only, and leaves loudness alone.
// The 4.5 kHz lift is the one that does the work (+2.8 dB of presence at
// matched loudness); the limiter is a safety rail, not a level.
function toWav(file, wav) {
  const af = [
    'highpass=f=70',                                       // room rumble, handling
    'equalizer=f=250:t=q:w=1.2:g=-2.5',                     // boxiness of a small room
    'equalizer=f=4500:t=q:w=1.0:g=3',                       // presence — consonants a phone mic loses
    'acompressor=threshold=-18dB:ratio=2.5:attack=8:release=180:makeup=1',
    'alimiter=limit=0.94',
  ].join(',')
  const ff = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', file, '-ac', '1', '-ar', '48000', '-af', af, '-c:a', 'pcm_s16le', wav])
  return ff.status === 0 && fs.existsSync(wav)
}
/**
 * Where the recording is actually QUIET, measured off the samples.
 *
 * Whisper's word timings are not a clock. On a real 5m46s batch its
 * timestamps ran about 1.1 SECONDS EARLY against the audio: it placed the
 * end of "Day 1" at 2.2s where the words are genuinely spoken from 3.33 to
 * 4.44, with the take proper starting at 5.93. Cutting on those numbers is
 * wrong at BOTH ends of every take — the front keeps the spoken "Day N"
 * marker, and the tail loses real words (take one lost 1.1s: "…he has put
 * down." simply stopped). It rendered perfectly, was captioned correctly,
 * and posted to eight networks before anybody watched it.
 *
 * So the cut comes from the WAVEFORM and only the identity of a take comes
 * from Whisper. `-38dB` is well under speech and well over this room's
 * -73dB floor; 0.30s is shorter than the pause he leaves around a marker
 * and longer than the gap inside a sentence.
 */
function silences(wav, floorDb = -38, minLen = 0.3) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostats', '-i', wav, '-af', `silencedetect=n=${floorDb}dB:d=${minLen}`, '-f', 'null', '-'], { encoding: 'utf8' })
  const out = [], text = (r.stderr || '') + (r.stdout || '')
  let start = null
  for (const m of text.matchAll(/silence_(start|end):\s*(-?[0-9.]+)/g)) {
    if (m[1] === 'start') start = Number(m[2])
    else if (start !== null) { out.push([start, Number(m[2])]); start = null }
  }
  return out
}
/** The speech between the silences: [start, end] per island. */
function islands(sil, total) {
  const out = []
  let at = 0
  for (const [a, b] of sil) { if (a > at + 0.05) out.push([at, a]); at = b }
  if (total > at + 0.05) out.push([at, total])
  return out
}

/**
 * Islands merged into SPOKEN BLOCKS — the unit a take is actually made of.
 *
 * An island is a run of sound between two detected silences, and a person
 * breathing mid-sentence makes several of them per clause; a block is what a
 * listener would call one stretch of talking. Merging at `BLOCK_JOIN` is what
 * turns a 45-line structure out of a six-minute sitting into something that
 * reads directly: fourteen short blocks (the spoken markers) with the takes
 * between them.
 *
 * The join has to be LONGER than a breath and SHORTER than the pause a person
 * leaves around a take number. 0.75s sits between those on this recording:
 * the largest gap inside a take's own sentence is 0.67s, the smallest gap
 * around a marker is 0.78s. It also does the work that killed the old island
 * scan outright — "Day Day 3", said with a quarter-second between the two
 * words, is ONE block of 1.21s here and was two islands each failing a
 * neighbour test there.
 */
const BLOCK_JOIN = 0.75
function blocks(sil, total) {
  const out = []
  for (const [a, b] of islands(sil, total)) {
    const last = out[out.length - 1]
    if (last && a - last[1] < BLOCK_JOIN) last[1] = b
    else out.push([a, b])
  }
  return out
}

function durationOf(src) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-i', src], { encoding: 'utf8' })
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec((r.stderr || '') + (r.stdout || ''))
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : undefined
}

// The local origin the browser bundle is served from. Declared HERE, above
// the commands that need no browser, because `post` bundles the verse data
// through `defines()` — which reads it — and a `const` further down the file
// is in its temporal dead zone at that point. It threw `Cannot access
// 'origin' before initialization` AFTER printing the line that says what it
// is about to schedule, so a run that scheduled nothing at all read as seven
// scheduled posts in a filtered log. Nothing here may be declared below its
// first use.
fs.mkdirSync(path.join(OUT, 'out'), { recursive: true })
const port = 8890 + Math.floor(Math.random() * 100)
const origin = `http://127.0.0.1:${port}`

// ---- commands that need no browser ----------------------------------------------
if (cmd === 'clear') {
  const date = args[0]; if (!isDate(date)) fail('clear <date>')
  await fn('voice-clear', { date, kind: KIND }); log(`cleared ${KIND} ${date}`); process.exit(0)
}
if (cmd === 'unpost') {
  const date = args[0]; if (!isDate(date)) fail('unpost <date> [--story] [--platforms=a,b]')
  const platforms = flags.platforms ? String(flags.platforms).split(',').map((x) => x.trim()) : undefined
  const r = await fn('unpost', { date, kind: KIND, platforms })
  for (const row of r.results ?? []) log(`  ${String(row.platform).padEnd(10)} ${row.status}${row.error ? ` — ${row.error}` : ''}`)
  process.exit(0)
}
if (cmd === 'post') {
  const date = args[0]; if (!isDate(date)) fail('post <date> [--at HH:MM|--now] [--attempt=N] [--opened] [--voiced=false]')
  const mp4 = mp4For(date, KIND)
  if (!fs.existsSync(mp4)) fail(`no ${mp4} — run render first`)
  await build({ entryPoints: [path.join(ROOT, 'supabase/functions/tiktok-gen/social.ts')], bundle: true, format: 'esm', platform: 'node', outfile: path.join(OUT, 'social.mjs'), logLevel: 'error' })
  const social = await import(path.join(OUT, 'social.mjs'))
  const platforms = String(flags.platforms || 'tiktok,youtube,facebook,instagram,x,snapchat,threads,pinterest').split(',').map((s) => s.trim()).filter((p) => social.postsOn(p, KIND))
  // Each network gets its own hour by default, from the SAME table the
  // morning runner schedules from (`tiktok-times.mjs`) — a post rendered by
  // hand and a post rendered by the cron are the same post on the same
  // feeds, so two tables of hours would drift the first time either was
  // tuned. `--at=HH:MM` overrides every platform at once, and `--now`
  // still means now.
  const times = timesFrom(process.env)
  const hourFor = (p) => String(flags.at || sharedTimeFor(times, KIND, p))
  // Ayrshare refuses a repeated idempotency key even when the post it named
  // was DELETED, so re-posting a date after `unpost` needs a new attempt
  // number — without it the replacement is rejected as a duplicate and the
  // day ends up with nothing scheduled at all.
  const attempt = flags.attempt ? Number(flags.attempt) : undefined
  const whenFor = (p) => (flags.now ? undefined : zonedToUtc(date, hourFor(p), TZ).toISOString().replace(/\.\d{3}Z$/, 'Z'))
  log(`post ${KIND} ${date} → ${flags.now ? 'now' : `scheduled ${TZ}`} · ${platforms.map((p) => (flags.now ? p : `${p} ${hourFor(p)}`)).join(', ')}`)
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
      // `--opened` says the post carries his introduction over a reading done
      // by a synthetic voice, which is a different disclosure from either of
      // the two that existed: `voiced` alone would claim "the voice you hear
      // is mine, not synthetic" of a verse that is not.
      // `--opened` says the post carries his introduction over a reading done
      // by a synthetic voice. `--voiced=false` is the fallback for a server
      // that has no branch for that yet: it under-claims him rather than
      // over-claiming him, which is the only safe direction when the two
      // available lines are "the voice you hear is mine" (false of the verse)
      // and "AI-generated art and voice" (false only of his introduction).
      const r = await fn('post', { date, kind: KIND, videoUrl, platforms: [platform], scheduleDate: whenFor(platform), reference: getVerseForDate(date).reference, seconds, attempt, ...(flags.opened ? { opened: true } : {}), ...(flags.voiced === 'false' ? { voiced: false } : {}) })
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
// The four files a preview render serves off disk rather than out of the
// bucket: his stand-in hook, the reading, the verse's own painting and the
// cast figure. Local because a preview should not need a deploy to exist.
let previewFiles = null
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
    if (previewFiles && url.pathname.startsWith('/prev-')) {
      const k = url.pathname.slice(6).replace(/\.(wav|jpg|png)$/, '')
      if (previewFiles[k]) return serveFile(res, previewFiles[k])
    }
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
    if (!file || !fs.existsSync(file) || !isDate(start)) fail('split <audio file> <start date> [--days=N] [--story] [--intro] [--week] [--pairs] [--dry] [--reuse]')
    // `--week` is the ROLLOUT shape: one sitting, one take per day, and the
    // kind is whatever that DATE's second post is rather than one kind for
    // the whole batch. It comes from `kindForDate` — the same rotation the
    // runner schedules from — so a take can never be parked under a kind the
    // day will not render. Without it the eight takes of a week would all
    // park as `voice-story`, six of them under a day that never asks for one,
    // and every one of those days would fall back to Gemini with nothing
    // saying so.
    let kindFor = () => KIND
    // `--pairs` is the shape of the NEW format, and it is the only one where
    // the date does not advance with the take. Two recordings belong to one
    // day — the morning opener and the evening introduction — so take 1 and
    // take 2 are both day 0, takes 3 and 4 are day 1, and the kind alternates
    // instead of the date. Without it a fourteen-take sitting lands on
    // fourteen consecutive days, every one of them under one kind, and seven
    // days that were recorded for silently get nothing: the split still
    // reports a clean cut, because nothing it can see is wrong.
    let dateFor = (n) => addDays(start, n - 1)
    if (flags.pairs) {
      dateFor = (n) => addDays(start, Math.floor((n - 1) / 2))
      kindFor = (_d, n) => (n % 2 === 1 ? 'verse' : 'story')
    }
    if (flags.week) {
      await build({ entryPoints: [path.join(ROOT, 'src/data/tiktokWeek.ts')], bundle: true, format: 'esm', platform: 'node', outfile: path.join(OUT, 'week.mjs'), logLevel: 'error' })
      const week = await import(path.join(OUT, 'week.mjs'))
      kindFor = (d) => week.kindForDate(d)
    }
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
    // are read, and the operator may say "day four" or just "four" — the
    // marker is the number with an optional lead word in front of it.
    //
    // A number only STARTS a take when a real pause sits before the MARKER,
    // not before the number: "Day 4" has no gap between the two words, so
    // testing the number alone found nothing at all in the first real batch.
    // And a marker must follow the last one in order, so a "one" inside a
    // sentence cannot cut a take in half.
    const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
      // Homophones, because a marker is heard in isolation with no sentence
      // around it to disambiguate — the one place Whisper has nothing to go
      // on. A real batch lost five takes to "Day FOUR" coming back as "Day
      // or": the number simply was not in the transcript, the run stopped at
      // three, and takes four to eight were lumped into one 342-second take
      // that still looked like a successful split. `for`, `to`/`too` and
      // `ate` are the same failure waiting on other numbers.
      or: 4, for: 4, fore: 4, to: 2, too: 2, tu: 2, ate: 8, won: 1, free: 3, tree: 3, sicks: 6, sex: 6, nyne: 9 }
    const LEAD = new Set(['day', 'take', 'number', 'no'])
    const GAP = 0.9
    const word = (i) => (heard.words[i] ? heard.words[i].text.toLowerCase().replace(/[^a-z0-9]/g, '') : '')
    const marks = []
    heard.words.forEach((w, i) => {
      const k = word(i)
      const n = NUM[k] ?? (/^\d{1,2}$/.test(k) ? Number(k) : 0)
      if (!n || n > days) return
      // A homophone is only ever a marker behind a lead word ("day or"):
      // taken bare it would cut a take in half on the word "to".
      const led = LEAD.has(word(i - 1))
      if (!led && !(k in NUM ? /^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)$/.test(k) : true)) return
      const head = led ? i - 1 : i
      // The SEQUENCE is the strong guard, so it is tested first: a marker
      // must be the next number in order, and the first must be 1.
      if (marks.length && n !== marks[marks.length - 1].n + 1) return
      if (!marks.length && n !== 1) return
      // …which is why a LEAD word plus the next number needs no pause in
      // front of it. Requiring one cost take 8 of a real batch: he ran
      // "…my own emptiness. Day 8." together and Whisper timed the gap at
      // MINUS 0.03s, so takes 8 through the end were swallowed by take 7 —
      // and the split still reported a clean cut. A bare number keeps the
      // pause test, because there the sequence alone is not enough ("he is
      // ONE of our kinsmen" sits mid-sentence in this very recording).
      const prev = heard.words[head - 1]
      if (!led && prev && heard.words[head].start - prev.end < GAP) return
      marks.push({ n, i, head, at: heard.words[head].start, end: w.end })
    })
    log(`found ${marks.length} of ${days} takes`)
    if (marks.length !== days) log('  (the run stops at the last number found in order — check the cut below)')
    const takes = marks.map((m, k) => {
      // Up to the next marker's HEAD, not its number: slicing to the number
      // leaves the lead word behind, and "day" then rode the end of all
      // fourteen takes' captions — burned into the video, and invisible in
      // the audio, which the clamp above had already trimmed correctly.
      const words = heard.words.slice(m.i + 1, marks[k + 1] ? marks[k + 1].head : heard.words.length)
      const from = words[0] ? Math.max(m.end, words[0].start - 0.35) : m.end
      // The tail is clamped to before the NEXT marker, not just to the last
      // word plus a beat: the words are sliced correctly either way, so a
      // take that ran long would carry "day nine" as audio with no caption
      // under it — a stray spoken number in the finished video, and the one
      // failure here that a transcript check cannot see.
      const next = marks[k + 1] ? marks[k + 1].at - 0.15 : heard.seconds
      const to = words.length ? Math.min(next, words[words.length - 1].end + 0.5) : from
      const date = dateFor(m.n)
      return { date, kind: kindFor(date, m.n), n: m.n, from, to, words, text: words.map((w) => w.text).join(' ') }
    })
    // ---- place every take on the waveform ------------------------------------
    //
    // Everything above this point is Whisper's, and Whisper's clock is wrong:
    // it drifts from about 1s early at the top of a six-minute sitting to
    // nearly 4s by the end of it. What it is RIGHT about is which take is
    // which and what order they come in, so it NAMES them and the waveform
    // PLACES them.
    //
    // The placing is structural rather than acoustic, and that is the whole
    // change. A sitting is [marker, body] fourteen times over, and in merged
    // spoken blocks (`blocks`) that reads straight off the waveform: a marker
    // is a short block, a body is a long one. So for each take, walk forward
    // from roughly where Whisper heard its number to the first block long
    // enough to BE a body — the marker is the block in front of it, and the
    // take runs to the last block before the NEXT take's marker.
    //
    // What this replaces is a scan that found candidate islands by shape and
    // then transcribed a window around each one to ask which held the number.
    // It failed silently and expensively on a real fourteen-take batch:
    //
    //   - "Day Day 3" — he said the word twice, a quarter-second apart —
    //     split into two islands, each failing the pause test on one side, so
    //     take 3 was never placed at all and kept bounds that were 5s out.
    //   - Take 2's marker was matched to the WRONG island, because the probe's
    //     own timings drift too and the fallback took the nearest by midpoint.
    //     The island it chose was the last sentence of take 1 — so take 1 lost
    //     its closing line, and take 2 opened with him saying "Day two". Both
    //     of those reached a rendered video before anybody noticed, and the
    //     log said "snapped 12 of 14".
    //
    // It is also about 90 seconds a batch faster, because it transcribes
    // nothing.
    const sil = silences(inputWav)
    // The FILE's length, not Whisper's idea of it. `heard.seconds` is what the
    // listener reports and it came back 5.3s short of a real six-minute memo —
    // which silently truncates the last take, the one place there is no next
    // marker to bound it.
    const total = durationOf(inputWav) ?? heard.seconds
    const blk = blocks(sil, total)
    // A body is a block long enough that it cannot be a spoken take number.
    // 3s is chosen against the real extremes: the shortest body block in a
    // recorded week is 4.12s (Numbers 6:25, a fifteen-word verse) and the
    // longest marker block is 1.46s. The gap between those is wide, which is
    // what makes a fixed number safe here.
    const BODY = 3
    let snapped = 0
    let after = 0
    for (const t of takes) {
      // Whisper runs EARLY, never late, so the seed is its marker time minus
      // a tolerance and the walk only ever goes forward — and never back past
      // the take already placed, which is what keeps the sequence honest when
      // a number is fumbled and said twice (one real batch has "Day 11 but
      // let's day 11", three short blocks in a row before the body).
      const seed = Math.max(after, t.from - 2)
      const bi = blk.findIndex(([x], i) => i > 0 && x >= seed && blk[i][1] - blk[i][0] >= BODY)
      if (bi <= 0) { log(`  ${t.date} ${t.kind}: no body block found — keeping the heard bounds`); continue }
      t.body = bi
      after = blk[bi][0]
    }
    const shortAt = (i) => blk[i][1] - blk[i][0] < BODY
    // The trailing run of short blocks between a take's last long block and
    // the next take's body. One of them is the spoken take number; the rest,
    // if any, belong to one side or the other.
    const runOf = (t, next) => {
      const out = []
      for (let i = (next ? next.body : blk.length) - 1; i > t.body && shortAt(i); i--) out.unshift(i)
      return out
    }
    const nextOf = (k) => takes.slice(k + 1).find((x) => x.body != null)
    // A take's own SPEAKING RATE is what settles an ambiguous run, and it is
    // the only signal here that survived contact with a real recording.
    //
    // Three others did not. Block LENGTH cannot separate "Day five" (1.01s)
    // from "Tabitha tells you why." (1.42s). The PAUSE in front cannot
    // either, and it is worse than useless because it inverts: 0.97s before a
    // genuine marker at one boundary, 0.78s before a genuine closing phrase
    // at another. Whisper's own measured gap is no better — it reported 2.28s
    // where the waveform says 0.97s, and 0.04s across a four-second silence
    // it simply did not hear. And HEARING the block is hopeless, which was
    // the surprise: a listener handed one second of speech, padded with
    // silence, answered "Boston.", "8 -5" and "[BLANK_AUDIO]" for three
    // stretches that plainly say a take number.
    //
    // What is left is arithmetic. Whisper is reliable about WHICH WORDS are
    // in a take even when it is wrong about when; a person talks at roughly
    // one pace across one sitting; so the right boundary is the one that
    // makes the take read at that pace. Including a marker and its silences
    // makes a take read far too slow (1.8 words a second against a sitting's
    // 2.85), and clipping the take's last clause makes it read far too fast
    // (4.5). Both are off by more than half again, which is a wide enough
    // margin to decide on.
    const rateOf = (t, end) => t.words.length / Math.max(0.5, blk[end][1] - blk[t.body][0])
    const clean = takes.filter((t, k) => t.body != null && runOf(t, nextOf(k)).length <= 1)
    const rates = clean.map((t, i) => rateOf(t, (runOf(t, nextOf(takes.indexOf(t))) [0] ?? (nextOf(takes.indexOf(t))?.body ?? blk.length)) - 1)).filter((r) => r > 0.5 && r < 6).sort((x, y) => x - y)
    // 2.85 is this recording's own median; it is only ever the fallback for a
    // sitting too short to have a clean boundary to measure.
    const PACE = rates.length ? rates[Math.floor(rates.length / 2)] : 2.85
    log(`pace ${PACE.toFixed(2)} words/second, from ${rates.length} unambiguous take${rates.length === 1 ? '' : 's'}`)
    for (let k = 0; k < takes.length; k++) {
      const t = takes[k]
      if (t.body == null) continue
      const next = takes.slice(k + 1).find((x) => x.body != null)
      // The take ends where the NEXT take's marker run begins, and "run" is
      // the word that matters: a marker is usually one short block and
      // sometimes three. One recorded batch has "Day 11 · but · let's day 11"
      // — a fumble, restated — and taking the single block before the body
      // left the two false starts on the end of the take before, which is
      // seven seconds of him saying the wrong number into somebody's post.
      //
      // A short block on its own says nothing, because a take may legitimately
      // END on a short one: "Tabitha tells you why." is 1.42s and is the last
      // thing said in its take. What separates the two is the PAUSE in front
      // of it — 0.78s there against 3.71s before the real marker that follows
      // it. So the run is the longest sequence of short blocks, ending at the
      // next body's own marker, whose FIRST block is preceded by a real pause.
      const run = runOf(t, next)
      // Every place the take could end: before the run, or after any block in
      // it. With no run at all there is nothing to choose.
      const ends = run.length ? [run[0] - 1, ...run] : [(next ? next.body : blk.length) - 1]
      let endBlock = ends[0]
      if (ends.length > 1) {
        let best = Infinity
        for (const e of ends) {
          if (e < t.body) continue
          const off = Math.abs(rateOf(t, e) - PACE)
          if (off < best) { best = off; endBlock = e }
        }
      }
      if (endBlock < t.body) { log(`  ${t.date} ${t.kind}: blocks out of order — keeping the heard bounds`); continue }
      t.from = Math.max(0, blk[t.body][0] - 0.15)
      t.to = Math.min(total, blk[endBlock][1] + 0.3)
      snapped++
    }
    log(`snapped ${snapped} of ${takes.length} takes onto the waveform`)
    for (const t of takes) log(`  ${String(t.n).padStart(2)} ${t.date} ${t.kind.padEnd(7)} ${t.from.toFixed(1)}–${t.to.toFixed(1)}s (${(t.to - t.from).toFixed(1)}s ${t.words.length}w)  ${t.text.slice(0, 66)}`)
    if (flags.dry) { await done() }
    // Cutting reads the batch; parking re-points `inputWav` at each take, so
    // hold on to the batch rather than reading a moving variable.
    const batchWav = inputWav
    for (const t of takes) {
      // Keyed on the KIND as well as the date: `--pairs` parks two takes on
      // one day, and a name that carried only the date would cut the second
      // over the first and park the same audio twice.
      const wav = path.join(OUT, `take-${t.date}-${t.kind}.wav`)
      const ff = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', batchWav, '-ss', String(t.from), '-to', String(t.to), '-c:a', 'pcm_s16le', wav])
      if (ff.status !== 0) { log(`  ${t.date} could not be cut`); continue }
      // EVERY take is parked through the same `listen` a single recording
      // uses, and it costs a re-hearing per take on purpose. `split` used to
      // park the cut WAV itself and rebase the batch's own timings onto it,
      // which was faster and wrong twice over:
      //
      //   - It skipped `decodeRecording`, so nothing applied `trimAndLevel`
      //     and the parked recording sat at whatever level the phone left
      //     it. That was invisible while `toWav` ended in `loudnorm`, which
      //     was quietly the only thing setting speech level on this path;
      //     the first render after the denoiser and loudnorm came out at
      //     -26.8 LUFS against a story's -13.2. One owner of loudness, and
      //     it is the renderer.
      //   - It parked the transcript of a VERSE take from the batch pass,
      //     which is the story listener and has no verse to look for, so the
      //     reading was captioned from what Whisper heard rather than from
      //     its known words.
      //
      // Both are the same bug: a second way of doing what `listen` does.
      // There is now one.
      inputWav = wav
      try {
        const r = await page.evaluate(([d, w, tk, k, pl]) => window.vaVoice.listen(d, w, tk, k, pl), [t.date, `${origin}/input.wav`, TOKEN, t.kind, PLACE])
        // …and then the BATCH's words are put back onto those timings.
        //
        // The re-hearing is for the LEVEL and the timings; it is not a better
        // transcript. Hearing forty seconds on its own loses both ends: the
        // marker that was cut ("Day 8." survived the cut in every take of the
        // first real batch, because Whisper's word-end timing sits a beat
        // early) and the last few words (its windows drop a short tail). The
        // batch pass heard the whole sitting with the sentences either side
        // for context and already sliced the take's words correctly, so it is
        // the better text — and `fix` is the step that exists for exactly
        // this: corrected words, refitted onto the timings actually heard.
        let words = r.thoughtWords
        if (t.text) {
          const f = await page.evaluate(([d, tx, tk, k]) => window.vaVoice.fix(d, tx, tk, k), [t.date, t.text, TOKEN, t.kind])
          words = f.words
        }
        // What was PARKED, measured against what was CUT.
        //
        // This is the check that was missing when it mattered. The placement
        // was fixed and verified against the waveform, correctly — and every
        // recording already in the bucket had been parked from the OLD
        // boundaries and stayed that way, because fixing a pipeline does not
        // fix what the pipeline has already written. One of them opened with
        // him saying "Day 2" and stopped mid-sentence, and it was scheduled
        // to go out that evening. Nothing anywhere said so: the transcript
        // had been corrected by hand, so the TEXT was perfect and only the
        // audio was short.
        //
        // `decodeRecording` trims the ends, so a parked take is always a
        // little shorter than its cut; a whole second is more than trimming
        // and means the two disagree about where the take is.
        const want = t.to - t.from
        const drift = want - r.seconds
        const off = drift > 1.2 || drift < -0.2 ? `  ** parked ${r.seconds.toFixed(1)}s against a ${want.toFixed(1)}s cut — re-run this take **` : ''
        log(`  parked ${t.date} ${t.kind}${t.kind === 'story' ? ` (${PLACE})` : ''} · ${r.seconds.toFixed(0)}s${t.kind === 'verse' ? ` (${r.verseMatched}/${r.verseWords} of the verse heard)` : ''} ${words}w${off}`)
      } catch (e) {
        log(`  ${t.date} could not be heard: ${String(e?.message || e).split('\n')[0].slice(0, 160)}`)
      }
      inputWav = batchWav
    }
    await done()
  }
  if (cmd === 'preview') {
    // The new morning post, rendered with a SYNTHESISED stand-in for his
    // opener, so the shape can be judged before anything is recorded.
    const date = args[0]; if (!isDate(date)) fail('preview <date> --hook=<wav> --verse=<wav> --scene=<jpg> --line="on-screen hook" [--text=<txt>]')
    const need = ['hook', 'verse', 'scene', 'line']
    for (const k of need) if (!flags[k] || flags[k] === true) fail(`--${k} is required`)
    for (const k of ['hook', 'verse', 'scene']) if (!fs.existsSync(String(flags[k]))) fail(`${flags[k]} not found`)
    // The figure is not a choice here: it is whoever `castFor` says stands in
    // this verse's frame, read from the same table the runner will use.
    await build({ entryPoints: [path.join(ROOT, 'src/data/tiktokCast.ts')], bundle: true, format: 'esm', platform: 'node', outfile: path.join(OUT, 'cast.mjs'), alias: { '@': path.join(ROOT, 'src') }, logLevel: 'error', define: defines(), banner: { js: 'const VA_ENV = {};' } })
    await build({ entryPoints: [path.join(ROOT, 'src/data/bible/questions.ts')], bundle: true, format: 'esm', platform: 'node', outfile: path.join(OUT, 'qp.mjs'), alias: { '@': path.join(ROOT, 'src') }, logLevel: 'error', define: defines(), banner: { js: 'const VA_ENV = {};' } })
    const { castFor } = await import(path.join(OUT, 'cast.mjs'))
    const { getVerseForDate } = await import(path.join(OUT, 'qp.mjs'))
    const v = getVerseForDate(date)
    const cast = castFor(v)
    const figure = path.join(ROOT, 'public/skins', `${cast.figure}.png`)
    if (!fs.existsSync(figure)) fail(`no render for ${cast.figure}`)
    const photo = flags.photo ? String(flags.photo) : ''
    previewFiles = { hook: String(flags.hook), verse: String(flags.verse), scene: String(flags.scene), figure, ...(photo && fs.existsSync(photo) ? { photo } : {}) }
    const hookText = flags.text && fs.existsSync(String(flags.text)) ? fs.readFileSync(String(flags.text), 'utf8').replace(/\s+/g, ' ').trim() : String(flags.text || '')
    log(`preview ${date} · ${v.reference} · ${cast.figure} (${cast.why})`)
    const [dl, r] = await Promise.all([
      page.waitForEvent('download', { timeout: 900_000 }),
      page.evaluate(([d, t, a]) => window.vaVoice.preview(d, t, a), [date, TOKEN, {
        hookUrl: `${origin}/prev-hook.wav`, verseUrl: `${origin}/prev-verse.wav`,
        sceneUrl: `${origin}/prev-scene.jpg`, figureUrl: `${origin}/prev-figure.png`,
        hookText, hookLine: String(flags.line), ...(previewFiles.photo ? { photoUrl: `${origin}/prev-photo.jpg` } : {}),
      }]),
    ])
    const raw = path.join(OUT, 'out', `preview-${date}.${r.ext}`)
    await dl.saveAs(raw)
    log(`rendered ${r.ext} ${(r.size / 1e6).toFixed(1)}MB · ${r.reference} · ${r.figure} · ${r.seconds.toFixed(0)}s · ${r.phrases} captions`)
    const mp4 = path.join(OUT, 'out', `preview-${date}.mp4`)
    const ff = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', raw, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-af', MASTER, '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart', mp4], { stdio: 'inherit' })
    if (ff.status !== 0) fail(`ffmpeg failed (${ff.error?.message || `exit ${ff.status}`})`)
    if (raw !== mp4) fs.unlinkSync(raw)
    log(`mp4 ${(fs.statSync(mp4).size / 1e6).toFixed(1)}MB → ${mp4}`)
    console.log(mp4)
    await done()
  }
  if (cmd === 'note') {
    const date = args[0]; if (!isDate(date)) fail('note <date>')
    const [dl, r] = await Promise.all([
      page.waitForEvent('download', { timeout: 300_000 }),
      page.evaluate(([d, t]) => window.vaVoice.note(d, t), [date, TOKEN]),
    ])
    const jpg = path.join(OUT, 'out', `note-${date}.jpg`)
    await dl.saveAs(jpg)
    log(`note ${date} · ${r.reference} · ${r.tier} · ${(r.size / 1024).toFixed(0)}KB · ${r.words} words`)
    log('')
    for (const line of r.text.split('\n')) log(`  ${line}`)
    log('')
    log(`  → ${jpg}`)
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
    // A reading is about ONE thing and the recording already named it, so
    // `--pick` (a moment id, a stage) and `--ref` say which rather than
    // leaving a hash to choose a painting his own voice contradicts.
    if (flags.pick === true || flags.ref === true) fail('use --pick=<id> --ref="Book c:v"')
    const pick = flags.pick ? String(flags.pick) : undefined
    const ref = flags.ref ? String(flags.ref) : undefined
    const [dl, r] = await Promise.all([page.waitForEvent('download', { timeout: 900_000 }), page.evaluate(([d, t, k, pl, pk, rf]) => window.vaVoice.render(d, t, k, pl, pk, rf), [date, TOKEN, KIND, PLACE, pick, ref])])
    const raw = path.join(OUT, 'out', `${KIND}-${date}.${r.ext}`)
    await dl.saveAs(raw)
    log(`rendered ${r.ext} ${(r.size / 1e6).toFixed(1)}MB · ${r.reference} · ${r.tier} · ${r.seconds.toFixed(0)}s · ${r.phrases} captions`)
    const mp4 = mp4For(date, KIND)
    const ff = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', raw, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-af', MASTER, '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart', mp4], { stdio: 'inherit' })
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
