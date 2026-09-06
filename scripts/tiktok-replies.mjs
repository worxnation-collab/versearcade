// tiktok-replies — answer the comments under the challenge posts.
//
// The two daily "Can you beat Peter?" posts ask people to comment A, B, C or
// D. This runs every couple of hours (.github/workflows/tiktok-replies.yml)
// and, for the challenge posts of today and yesterday, asks the tiktok-gen
// function's `replies` action to read the comments through Ayrshare, have
// Grok draft a one-line reply to each ANSWER-shaped comment (whether they got
// it, the right answer, the teach line), and post it. Everything that was
// said is parked at days/<date>/replies-<kind>.json, which the dashboard
// shows.
//
// This script is small on purpose: no Chromium, no rendering. It bundles
// src/lib/tiktokChallenge.ts with esbuild to know which of the day's five
// each post asked (the same function the renderer used), and hands the
// question, options, answer and teach line to the function, which has no
// verse data of its own.
//
// Environment: TIKTOK_RUNNER_TOKEN (required — Vault 0102, sent as
// x-runner-token), SUPABASE_URL and SUPABASE_ANON_KEY (defaulted),
// TIKTOK_TZ (default America/New_York), DATE (override today), DRY_RUN
// (draft, post nothing), MAX (replies per post per run, default 20).

import { build } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = process.env
const SUPABASE_URL = (env.SUPABASE_URL || 'https://visuppaucpzzigwtqmdd.supabase.co').replace(/\/$/, '')
const ANON = env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpc3VwcGF1Y3B6emlnd3RxbWRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5MTY1MjEsImV4cCI6MjEwMTQ5MjUyMX0.YP_lJkV8ZD7J-oAqwkhh-6gQ0z1Q7pFR4Nql1NdhSa0'
const TOKEN = env.TIKTOK_RUNNER_TOKEN
const TZ = env.TIKTOK_TZ || 'America/New_York'
const DRY = /^(1|true|yes)$/i.test(env.DRY_RUN || '')
const MAX = Math.max(1, Math.min(40, Number(env.MAX) || 20))
if (!TOKEN) { console.error('TIKTOK_RUNNER_TOKEN is required'); process.exit(2) }

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const localDate = (d, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const today = /^\d{4}-\d{2}-\d{2}$/.test(env.DATE || '') ? env.DATE : localDate(new Date(), TZ)

const OUT = path.join(ROOT, '.tiktok-daily')
fs.mkdirSync(OUT, { recursive: true })
const defines = { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'import.meta.env.MODE': '"production"' }
await build({
  entryPoints: [path.join(ROOT, 'src/lib/tiktokChallenge.ts')], bundle: true, format: 'esm', platform: 'node', target: 'es2022',
  outfile: path.join(OUT, 'challenge.mjs'), alias: { '@': path.join(ROOT, 'src') }, define: defines, logLevel: 'error',
})
const { challengeQuestion } = await import(path.join(OUT, 'challenge.mjs'))

async function fn(body) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/tiktok-gen`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}`, 'x-runner-token': TOKEN },
    body: JSON.stringify(body),
  })
  const text = await r.text()
  let data = {}
  try { data = JSON.parse(text) } catch { data = { error: text.slice(0, 300) } }
  if (!r.ok && !data.error) data.error = `HTTP ${r.status}`
  return data
}

// A challenge posted on day D is about the verse of D-1, and its record is
// keyed on that verse's date. Today's posts and yesterday's are the ones
// still collecting comments.
const results = []
for (const date of [addDays(today, -1), addDays(today, -2)]) {
  for (const [kind, slot] of [['challenge', 1], ['challenge2', 2]]) {
    const q = challengeQuestion(date, slot)
    const r = await fn({ action: 'replies', date, kind, dryRun: DRY, max: MAX, ...q })
    if (r.error) { log(`${kind} ${date}: ${String(r.error).slice(0, 200)}`); results.push({ date, kind, error: r.error }); continue }
    const added = r.added ?? []
    log(`${kind} ${date} · ${q.reference} · ${added.length} new repl${added.length === 1 ? 'y' : 'ies'}${DRY ? ' (dry run)' : ''} · ${(r.replies ?? []).length} on record`)
    for (const x of added) log(`  ${x.platform} @${x.username}: "${x.comment}" → "${x.reply}"${x.status && x.status !== 'success' ? ` [${x.status}${x.error ? ': ' + x.error : ''}]` : ''}`)
    results.push({ date, kind, added: added.length, error: null })
  }
}
fs.writeFileSync(path.join(OUT, 'replies.json'), JSON.stringify(results, null, 2))
log('done')
