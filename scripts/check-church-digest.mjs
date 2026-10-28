// check:church-digest — drives the REAL church-digest Edge Function handler
// (supabase/functions/church-digest/index.ts) under Node, with a fake
// Supabase and a fake Resend behind `fetch`. No network, no keys.
//
// The digest's failures all look like success: an email that went to the
// wrong person, a row Home doesn't have, a link that opens the wrong tab, a
// week marked sent when the provider refused it. Each case asserts one rule
// from docs/CHURCH-DIGEST.md.

import { build } from 'esbuild'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = mkdtempSync(join(tmpdir(), 'church-digest-'))
const fnDir = join(dir, 'church-digest')
const { mkdirSync } = await import('node:fs')
mkdirSync(fnDir)
writeFileSync(join(fnDir, 'index.ts'), readFileSync(join(root, 'supabase/functions/church-digest/index.ts'), 'utf8')
  .replace('https://esm.sh/@supabase/supabase-js@2', '@supabase/supabase-js'))
writeFileSync(join(dir, 'church-digest/home.ts'), readFileSync(join(root, 'supabase/functions/church-digest/home.ts'), 'utf8'))
await build({
  entryPoints: [join(fnDir, 'index.ts')], bundle: true, platform: 'node', format: 'esm',
  outfile: join(dir, 'fn.mjs'), logLevel: 'warning', nodePaths: [join(root, 'node_modules')],
})

const SB = 'http://sb.local'
const CH = '11111111-2222-4333-8444-555555555555'
let handler
const env = { SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: 'svc', APP_URL: 'https://app.test' }
globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { handler = h } }

const db = {
  secrets: { DIGEST_CRON_TOKEN: 'cron-tok', RESEND_API_KEY: 're_key' },
  due: [], sent: [], marked: [], providerOk: true, built: [],
  gate: { 'u-leader': 'ok', 'u-member': 'not_leadership', 'u-free': 'not_verified' },
}
const facts = {
  church_name: 'Grace <Fellowship>', today: '2026-11-02',
  jobs: [{ status: 'done', source: 'memo', autopilot: true, series: 'Abide', references: ['John 15:1-11'], start_date: '2026-11-03', saved: ['2026-11-03', '2026-11-04', '2026-11-05'], flagged: 1, seen: false, stale: false }],
  autopilot_skipped: false,
  drafts: [{ date: '2026-11-03', flagged: 0 }, { date: '2026-11-04', flagged: 1 }, { date: '2026-11-05', flagged: 0 }],
  inquiries: 2, quiet: 3,
}
const rpc = {
  church_digest_secret: ({ p_name }) => db.secrets[p_name] ?? null,
  church_digest_due: () => db.due,
  church_digest_build: ({ p_user_id, p_church_id }) => {
    db.built.push(p_user_id)
    const g = db.gate[p_user_id] ?? 'not_leadership'
    return g === 'ok' && p_church_id === CH ? { ok: true, ...facts } : { ok: false, reason: g }
  },
  church_digest_mark_sent: (a) => { db.marked.push(a); return null },
}
globalThis.fetch = async (url, init = {}) => {
  url = String(url)
  if (url.startsWith(SB + '/auth/v1/user')) {
    const tok = String(new Headers(init.headers).get('authorization') ?? '').replace('Bearer ', '')
    if (tok === 'bad') return new Response('{}', { status: 401 })
    return new Response(JSON.stringify({ id: 'u-' + tok, email: tok + '@church.test', aud: 'authenticated' }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  if (url.startsWith(SB + '/rest/v1/rpc/')) {
    const fn = url.slice((SB + '/rest/v1/rpc/').length).split('?')[0]
    return new Response(JSON.stringify(rpc[fn](JSON.parse(init.body || '{}'))), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  if (url === 'https://api.resend.com/emails') {
    const b = JSON.parse(init.body); db.sent.push(b)
    return new Response('{}', { status: db.providerOk ? 200 : 500 })
  }
  throw new Error('unexpected fetch ' + url)
}
await import(pathToFileURL(join(dir, 'fn.mjs')).href)

const call = async (body, headers = {}) => {
  const r = await handler(new Request('http://fn', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }))
  return { status: r.status, ...(await r.json()) }
}
let failed = 0
const check = (name, ok, extra = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`) }

// 1. A leader's dry run: Home's rows, in Home's words, each a link to the right tab.
let r = await call({ action: 'test', church_id: CH, dry_run: true }, { Authorization: 'Bearer leader' })
check('dry run ok, nothing sent', r.ok && r.sent === false && db.sent.length === 0, JSON.stringify(r).slice(0, 200))
const keys = r.rows?.map((x) => x.key).join(',')
check('rows are the digest subset, in Home order', keys === 'auto,drafts,flags,inquiries,quiet', keys)
check('auto row is "Week drafted — review" with the range', r.rows?.[0].title === 'Week drafted — review' && /Tue, Nov 3 – Thu, Nov 5/.test(r.rows[0].detail), r.rows?.[0].detail)
const url = Object.fromEntries((r.rows ?? []).map((x) => [x.key, x.url]))
const base = `https://app.test/church/${CH}/admin?`
check('auto → Plan on the first saved day', url.auto === base + 'go=plan&date=2026-11-03', url.auto)
check('drafts → Plan on the first draft', url.drafts === base + 'go=plan&date=2026-11-03', url.drafts)
check('flags → Plan on the flagged day', url.flags === base + 'go=plan&date=2026-11-04', url.flags)
check('inquiries → People, inquiries', url.inquiries === base + 'go=people&focus=inquiries', url.inquiries)
check('quiet → People, quiet fold', url.quiet === base + 'go=people&focus=quiet', url.quiet)
check('inquiries carry a count, no name', r.rows?.[3].title === '2 players asked about your church')
check('quiet carries a count, no name', r.rows?.[4].title === '3 members could use a check-in')
check('church name is escaped in HTML', r.html.includes('Grace &lt;Fellowship&gt;') && !r.html.includes('<Fellowship>'))
check('no arrow-button tails in the email', !/→\s*<\/div>/.test(r.html) && !r.text.includes('→\n'))

// 2. A real test send goes to the caller's own address only.
r = await call({ action: 'test', church_id: CH }, { Authorization: 'Bearer leader' })
check('test send to the leader themselves', r.ok && db.sent.length === 1 && db.sent[0].to[0] === 'leader@church.test', JSON.stringify(db.sent[0]?.to))

// 3. Gates: a member, a free claim, no session, a bad token.
r = await call({ action: 'test', church_id: CH, dry_run: true }, { Authorization: 'Bearer member' })
check('member refused', r.status === 403 && r.reason === 'not_leadership')
r = await call({ action: 'test', church_id: CH, dry_run: true }, { Authorization: 'Bearer free' })
check('free claim refused', r.status === 403 && r.reason === 'not_verified')
r = await call({ action: 'test', church_id: CH, dry_run: true })
check('no session refused', r.status === 401)
r = await call({}, { 'x-digest-token': 'nope' })
check('wrong cron token refused', r.status === 403)

// 4. The weekly run: sends, marks, skips a removed leader, never marks a refused send.
db.sent = []; db.marked = []
db.due = [
  { church_id: CH, user_id: 'u-leader', email: 'leader@church.test', week: '2026-11-02', today: '2026-11-02' },
  { church_id: CH, user_id: 'u-member', email: 'gone@church.test', week: '2026-11-02', today: '2026-11-02' },
]
r = await call({}, { 'x-digest-token': 'cron-tok' })
check('run sends to the leader only', r.sent === 1 && db.sent.length === 1 && db.sent[0].to[0] === 'leader@church.test', JSON.stringify(r))
check('run marks the week sent', db.marked.length === 1 && db.marked[0].p_week === '2026-11-02')
db.sent = []; db.marked = []; db.providerOk = false
r = await call({}, { 'x-digest-token': 'cron-tok' })
check('a refused send is not marked sent', r.sent === 0 && db.marked.length === 0)
db.providerOk = true; delete db.secrets.RESEND_API_KEY; db.sent = []
r = await call({}, { 'x-digest-token': 'cron-tok' })
check('no provider key: nothing sent, nothing marked', r.reason === 'no_provider' && db.sent.length === 0 && db.marked.length === 0)

// 5. An empty week still says so, in one line.
Object.assign(facts, { jobs: [], drafts: [], inquiries: 0, quiet: 0 })
db.secrets.RESEND_API_KEY = 're_key'
r = await call({ action: 'test', church_id: CH, dry_run: true }, { Authorization: 'Bearer leader' })
check('empty week: no rows, "you’re all set"', r.rows.length === 0 && /all set/.test(r.subject))
// 6. Autopilot skipped.
facts.autopilot_skipped = true
r = await call({ action: 'test', church_id: CH, dry_run: true }, { Authorization: 'Bearer leader' })
check('Autopilot skipped line → Plan today', r.rows[0]?.title === 'Nothing drafted this week' && r.rows[0].url === base + 'go=plan&date=2026-11-02')

if (failed) { console.error(`check:church-digest — ${failed} failed`); process.exit(1) }
console.log('check:church-digest — all passed')
