// x-dev — feeds the x-dev Edge Function from git (.github/workflows/x-dev.yml).
//
//   MODE=daily  → the last three days of commit messages on main become the
//                 notes for two build-in-public posts, scheduled for today.
//   MODE=merge  → on a push to main: if the number of merge commits on main is
//                 a multiple of three, the last three merged PRs become a thread.
//
// Environment: TIKTOK_RUNNER_TOKEN (required), SUPABASE_URL, SUPABASE_ANON_KEY,
// GITHUB_TOKEN + GITHUB_REPOSITORY (merge mode, to read PR bodies), DRY_RUN.

import { execFileSync } from 'node:child_process'

const env = process.env
const SUPABASE_URL = (env.SUPABASE_URL || 'https://visuppaucpzzigwtqmdd.supabase.co').replace(/\/$/, '')
const ANON = env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpc3VwcGF1Y3B6emlnd3RxbWRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5MTY1MjEsImV4cCI6MjEwMTQ5MjUyMX0.YP_lJkV8ZD7J-oAqwkhh-6gQ0z1Q7pFR4Nql1NdhSa0'
const TOKEN = env.TIKTOK_RUNNER_TOKEN
const DRY = /^(1|true|yes)$/i.test(env.DRY_RUN || '')
const MODE = env.MODE || 'daily'
if (!TOKEN) { console.error('TIKTOK_RUNNER_TOKEN is required'); process.exit(2) }

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' })
// Attribution trailers and session links say nothing about the work.
const scrub = (s) => s.split('\n').filter((l) => !/^(Co-Authored-By|Claude-Session|Signed-off-by):/i.test(l.trim()) && !/https?:\/\//.test(l)).join('\n')

async function fn(body) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/x-dev`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}`, 'x-runner-token': TOKEN },
    body: JSON.stringify({ ...body, dry_run: DRY }),
  })
  const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }))
  console.log(JSON.stringify(j, null, 2))
  if (!r.ok || j.error) process.exit(1)
}

if (MODE === 'daily') {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const notes = scrub(git('log', '--since=3 days ago', '--no-merges', '--format=%s%n%b%n---', 'HEAD')).slice(0, 12000)
  await fn({ action: 'daily', date, notes })
} else if (MODE === 'merge') {
  const count = Number(git('rev-list', '--merges', '--count', 'HEAD').trim())
  if (count % 3 !== 0) { console.log(`merge #${count} — thread posts on every third`); process.exit(0) }
  const subjects = git('log', '--merges', '-3', '--format=%s', 'HEAD').trim().split('\n')
  const nums = subjects.map((s) => (s.match(/\(#(\d+)\)\s*$/) || s.match(/#(\d+)/) || [])[1]).filter(Boolean)
  const prs = []
  for (const n of nums) {
    const r = await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/pulls/${n}`, { headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' } })
    const p = await r.json().catch(() => ({}))
    prs.push({ number: Number(n), title: p.title || subjects[nums.indexOf(n)], body: scrub(p.body || '') })
  }
  if (!prs.length) { console.log('no PR numbers in the last three merges'); process.exit(0) }
  await fn({ action: 'thread', prs })
} else {
  console.error(`unknown MODE ${MODE}`); process.exit(2)
}
