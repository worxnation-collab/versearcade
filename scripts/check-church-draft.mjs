// check:church-draft — drives the REAL church-draft Edge Function handler
// (supabase/functions/church-draft/index.ts) under Node, with a fake Gemini and
// a fake Supabase behind `fetch`. No network, no keys, nothing deployed.
//
// It exists because the engine's failures RENDER: a dropped day used to slide
// the series a day early, a failed draft kept the church's units, and a
// question that gives its answer away still saves. Each case below asserts one
// of the rules the function promises (saving on the planned dates, never over
// a live day, refunds, specific reasons and statuses, per-question salvage,
// the run log carrying no content). Add a case when you change a rule.

import { build } from 'esbuild'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = mkdtempSync(join(tmpdir(), 'church-draft-'))
const src = readFileSync(join(root, 'supabase/functions/church-draft/index.ts'), 'utf8')
  .replace('https://esm.sh/@supabase/supabase-js@2', '@supabase/supabase-js')
writeFileSync(join(dir, 'fn.ts'), src)
await build({
  entryPoints: [join(dir, 'fn.ts')], bundle: true, platform: 'node', format: 'esm',
  outfile: join(dir, 'fn.mjs'), logLevel: 'warning', nodePaths: [join(root, 'node_modules')],
})
const FN = pathToFileURL(join(dir, 'fn.mjs')).href
console.warn = () => {}
// The option shuffle becomes the identity, so a test knows where each answer sits.
Math.random = () => 0.999999

const SB = 'http://sb.local'
let handler
const env = { SUPABASE_URL: SB, SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', GEMINI_API_KEY: 'k' }
globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { handler = h } }

// --- fake database ---------------------------------------------------------
const db = { used: 0, cap: 30, gate: 'ok', verses: {}, runs: [], refunds: [] }
const today = new Date().toISOString().slice(0, 10)
const rpc = {
  use_church_draft_units: ({ p_units }) => {
    if (db.gate !== 'ok') return { ok: false, reason: db.gate }
    const u = Math.min(Math.max(p_units, 1), 7)
    if (db.used + u > db.cap) return { ok: false, reason: 'limit' }
    db.used += u; return { ok: true, units: u, left: db.cap - db.used, day: today }
  },
  use_church_draft: (a) => rpc.use_church_draft_units({ ...a, p_units: 1 }),
  refund_church_draft_units: ({ p_units }) => { const was = db.used; db.used = Math.max(0, db.used - p_units); db.refunds.push(was - db.used); return { ok: true, refunded: was - db.used, left: db.cap - db.used } },
  save_church_verse_draft: (a) => {
    const cur = db.verses[a.p_drop_date]
    if (cur && cur.status !== 'draft' && !a.p_replace) return { ok: false, reason: 'day_is_set' }
    if (!Array.isArray(a.p_questions) || a.p_questions.length !== 5) return { ok: false, reason: 'bad_questions' }
    db.verses[a.p_drop_date] = { status: 'draft', reference: a.p_reference, text: a.p_text, series: a.p_series, questions: a.p_questions }
    return { ok: true, drop_date: a.p_drop_date, status: 'draft' }
  },
  tiktok_gemini_key: () => 'vault-key',
  // Discussion questions (0151): only on a day that exists.
  set_church_discussion: (a) => {
    if (!db.verses[a.p_drop_date]) return { ok: false, reason: 'no_day' }
    db.discussions[a.p_drop_date] = { questions: a.p_questions, generated: a.p_generated }
    return { ok: true, questions: a.p_questions }
  },
  // Voice memos (0144): their own allowance, never the draft units.
  church_memo_can: () => (db.gate !== 'ok' ? { ok: false, reason: db.gate } : db.memoUsed >= 10 ? { ok: false, reason: 'memo_limit' } : { ok: true, left: 10 - db.memoUsed }),
  use_church_memo: () => {
    if (db.gate !== 'ok') return { ok: false, reason: db.gate }
    if (db.memoUsed >= 10) return { ok: false, reason: 'memo_limit' }
    db.memoUsed++; return { ok: true, left: 10 - db.memoUsed, day: today }
  },
  church_verses_range: ({ p_from, p_days }) => {
    const days = Object.entries(db.verses).filter(([d]) => d >= p_from).map(([d, v]) => ({ drop_date: d, ...v }))
    return { ok: true, days, from: p_from, n: p_days }
  },
  release_church_memo: () => { db.memoUsed = Math.max(0, db.memoUsed - 1); db.memoReleases++; return { ok: true, left: 10 - db.memoUsed } },
}
// --- fake storage (the church-memos bucket) --------------------------------
const store = new Map()
const storage = async (url, init) => {
  const path = url.slice((SB + '/storage/v1').length).split('?')[0]
  const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
  if (path === '/bucket') return json({ name: 'church-memos' })
  if (path.startsWith('/object/list/')) return json([])
  if (path.startsWith('/object/upload/sign/')) return json({ url: path + '?token=tok' })
  if ((init.method ?? 'GET') === 'DELETE') { for (const p of JSON.parse(init.body).prefixes) store.delete(p); return json([]) }
  const key = decodeURIComponent(path.replace(/^\/object\/(authenticated\/)?church-memos\//, ''))
  return store.has(key) ? new Response(store.get(key)) : json({ error: 'not_found', message: 'Object not found' }, 400)
}
// --- fake Gemini Files API, for memo cases --------------------------------
const files = { uploaded: 0, deleted: 0, tokens: 32 * 60 * 40, uploadStatus: 200 }
// --- fake Gemini: a queue of answers per test ------------------------------
let gemini = []
let geminiCalls = 0
// --- fake church_auto_weeks table (0148), PostgREST-shaped -----------------
const jobs = new Map()
let jobN = 0
const jobsTable = (url, init) => {
  const u = new URL(url)
  const eq = [...u.searchParams.entries()].filter(([k, v]) => k !== 'select' && v.startsWith('eq.')).map(([k, v]) => [k, v.slice(3)])
  const match = (row) => eq.every(([k, v]) => String(row[k]) === v)
  const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
  const method = init.method ?? 'GET'
  const single = String(new Headers(init.headers).get('accept') ?? '').includes('vnd.pgrst.object')
  if (method === 'POST') {
    const row = { id: `00000000-0000-4000-8000-${String(++jobN).padStart(12, '0')}`, status: 'queued', saved: [], flagged: 0, transcript: null, reason: null, seen_at: null, updated_at: new Date(Date.now() + jobN).toISOString(), ...JSON.parse(init.body) }
    jobs.set(row.id, row)
    return json(single ? row : [row], 201)
  }
  if (method === 'PATCH') {
    const patch = JSON.parse(init.body)
    const hit = [...jobs.values()].filter(match)
    for (const r of hit) { Object.assign(r, patch); r.updated_at = new Date(Date.parse(r.updated_at) + 1).toISOString() }
    return json(hit)
  }
  const hit = [...jobs.values()].filter(match)
  return single ? (hit[0] ? json(hit[0]) : json({ code: 'PGRST116' }, 406)) : json(hit)
}
globalThis.fetch = async (url, init = {}) => {
  url = String(url)
  if (url.startsWith(SB + '/rest/v1/church_auto_weeks')) return jobsTable(url, init)
  if (url.startsWith(SB + '/auth/v1/user')) {
    const tok = String(new Headers(init.headers).get('authorization') ?? '').replace('Bearer ', '')
    return new Response(JSON.stringify({ id: tok === 'leader' ? 'u-leader' : 'u-' + tok, aud: 'authenticated' }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  if (url.startsWith(SB + '/functions/v1/church-draft')) {
    db.chained = (db.chained ?? 0) + 1
    return handler(new Request('http://fn', { method: 'POST', headers: { Authorization: new Headers(init.headers).get('authorization') }, body: init.body }))
  }
  if (url.startsWith(SB + '/rest/v1/rpc/')) {
    const fn = url.slice((SB + '/rest/v1/rpc/').length).split('?')[0]
    const out = rpc[fn](JSON.parse(init.body || '{}'))
    return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  if (url.startsWith(SB + '/storage/v1')) return storage(url, init)
  if (url.includes('/upload/v1beta/files') && !url.includes('upload_id')) {
    return new Response('{}', { status: files.uploadStatus, headers: files.uploadStatus === 200 ? { 'x-goog-upload-url': 'https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=1' } : {} })
  }
  if (url.includes('upload_id=')) { files.uploaded++; return new Response(JSON.stringify({ file: { name: 'files/abc', uri: 'https://g/files/abc', state: 'ACTIVE', mimeType: 'audio/mp4' } })) }
  if (url.includes(':countTokens')) return new Response(JSON.stringify({ totalTokens: files.tokens }))
  if (url.endsWith('/files/abc') && init.method === 'DELETE') { files.deleted++; return new Response('{}') }
  if (url.startsWith(SB + '/rest/v1/church_draft_runs')) {
    db.runs.push(JSON.parse(init.body)); return new Response(null, { status: 201 })
  }
  if (url.includes('generativelanguage')) {
    geminiCalls++
    const next = gemini.shift()
    if (!next) throw new Error('unexpected model call')
    if (next === 'timeout') { const e = new Error('t'); e.name = 'TimeoutError'; throw e }
    if (typeof next === 'number') return new Response('err', { status: next })
    if (next.raw !== undefined) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: next.raw }] } }] }), { status: 200 })
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(next) }] } }] }), { status: 200 })
  }
  throw new Error('unmocked ' + url)
}
await import(FN)

const CH = '11111111-1111-1111-1111-111111111111'
const V = { 1: 'I am the true vine, and My Father is the keeper of the vineyard.', 2: 'He cuts off every branch in Me that bears no fruit, and every branch that does bear fruit, He prunes to make it even more fruitful.', 3: 'You are already clean because of the word I have spoken to you.', 4: 'Remain in Me, and I will remain in you. Just as no branch can bear fruit by itself unless it remains in the vine, neither can you bear fruit unless you remain in Me.', 5: 'I am the vine and you are the branches. The one who remains in Me, and I in him, will bear much fruit. For apart from Me you can do nothing.' }
const passages = [{ reference: 'John 15:1-5', verses: Object.entries(V).map(([n, text]) => ({ n: Number(n), text })) }]
let qn = 0
const q = (o = {}) => ({ prompt: `Question number ${++qn} about this passage?`, options: ['Alpha', 'Bravo', 'Charlie', 'Delta'], answerIndex: 1, teach: 'Because the passage says so.', ...o })
const five = () => [q(), q(), q(), q(), q()]
const call = async (body) => {
  const res = await handler(new Request('http://fn', { method: 'POST', headers: { Authorization: 'Bearer leader' }, body: JSON.stringify(body) }))
  return { status: res.status, body: await res.json() }
}
const reset = () => { db.memoUsed = 0; db.memoReleases = 0; store.clear(); files.uploaded = 0; files.deleted = 0; files.tokens = 32 * 60 * 40; files.uploadStatus = 200; db.used = 0; db.gate = 'ok'; db.verses = {}; db.discussions = {}; db.runs = []; db.refunds = []; gemini = []; geminiCalls = 0 }
let fails = 0
const check = (name, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(extra))); if (!cond) fails++ }
const week = (o = {}) => ({ mode: 'week', church_id: CH, series: 'Abiding', days: 3, passages, transcript: 'notes', api: 2, ...o })
const D = ['2030-01-06', '2030-01-07', '2030-01-08']

// 1. Saves on its own dates; an unusable middle day leaves ITS date empty; salvage + refill.
reset()
const dupPrompt = 'Who is the true vine in this passage?'
gemini = [
  { days: [
    { reference: 'John 15:1', note: 'n1', questions: [q({ prompt: dupPrompt }), q(), q(), q(), q()] },
    { reference: 'John 16:1', note: 'off-passage', questions: five() },
    { reference: 'John 15:5', note: 'n3', questions: [
      q({ prompt: 'Fill in: "I am the vine and you are the ____."', options: ['leaves', 'branches', 'roots', 'fruit'], answerIndex: 1 }), // valid blank
      q({ prompt: 'Fill in: "Apart from Me you can do ____."', options: ['much', 'everything', 'little', 'nothing more'], answerIndex: 2 }), // answer "little" not in verse → dropped
      q({ prompt: 'In "you are the branches", what are you called?', options: ['vines', 'branches', 'roots', 'leaves'], answerIndex: 1 }), // gives answer away → dropped
      q({ prompt: dupPrompt }),                                     // duplicate across week → dropped
      q({ prompt: 'Which of these is NOT in the verse?' }),          // NOT → dropped
      q({ options: ['A', 'B', 'C', 'D', 'E', 'F'], answerIndex: 5, prompt: 'Six options here?' }), // trimmed to 4, answer kept
    ] },
  ] },
  { items: [{ i: 2, questions: [q(), q(), q()] }] },
]
let r = await call(week({ dates: D }))
check('week saves on own dates', r.status === 200 && r.body.ok && JSON.stringify(r.body.saved) === JSON.stringify([D[0], D[2]]), r)
check('unusable day 2 left empty (no slide)', JSON.stringify(r.body.missing) === JSON.stringify([D[1]]) && !db.verses[D[1]], r.body)
check('day 3 kept its own verse', db.verses[D[2]]?.reference === 'John 15:5', db.verses[D[2]])
const d3 = db.verses[D[2]].questions
check('blank answer in verse kept; bad blank, giveaway, dup, NOT dropped', d3.length === 5 && d3.some((x) => x.prompt.includes('you are the ____')) && !d3.some((x) => /little|what are you called|NOT/.test(x.prompt + x.options.join())) && d3.filter((x) => x.prompt === dupPrompt).length === 0, d3.map((x) => x.prompt))
const six = d3.find((x) => x.prompt === 'Six options here?')
check('>4 options trimmed, answer kept', six && six.options.length === 4 && six.options[six.answerIndex] === 'F', six)
check('refund 1 unsaved day, left reported', db.refunds.join() === '1' && r.body.left === 28, { refunds: db.refunds, left: r.body.left })
check('run logged without content', db.runs.length === 1 && db.runs[0].days_saved === 2 && db.runs[0].units_used === 2 && db.runs[0].outcome === 'short' && !JSON.stringify(db.runs[0]).includes('notes'), db.runs)
check('three model calls (draft + refill + check)', geminiCalls === 3, geminiCalls)

// 2. A live day is never overwritten.
reset(); db.verses[D[1]] = { status: 'approved' }
gemini = [{ days: [1, 3, 5].map((v) => ({ reference: `John 15:${v}`, questions: five() })) }]
r = await call(week({ dates: D }))
check('live day refused, others saved', r.body.ok && r.body.saved.length === 2 && r.body.refused[0]?.reason === 'day_is_set' && db.verses[D[1]].status === 'approved', r.body)

// 3. Overloaded model → model_busy 503, everything refunded; old client gets 200.
reset(); gemini = [503, 503]
r = await call(week({ dates: D }))
check('model_busy 503 + full refund', r.status === 503 && r.body.reason === 'model_busy' && db.used === 0 && r.body.left === 30, r)
reset(); gemini = [503, 503]
r = await call(week({ dates: D, api: undefined }))
check('legacy client still gets 200', r.status === 200 && r.body.reason === 'model_busy', r)

// 4. Timeout.
reset(); gemini = ['timeout', 'timeout']
r = await call(week({ dates: D }))
check('timeout 504', r.status === 504 && r.body.reason === 'timeout' && db.used === 0, r)

// 5. Legacy week (no dates): days returned, client saves, short refunded.
reset(); gemini = [{ days: [{ reference: 'John 15:1', questions: five() }, { reference: 'Mark 1:1', questions: five() }, { reference: 'John 15:4', questions: five() }] }, { items: [] }]
r = await call(week({ api: undefined }))
check('legacy returns compacted days, refunds 1', r.body.ok && r.body.days.length === 2 && !r.body.saved && db.used === 2 && Object.keys(db.verses).length === 0, r.body)

// 6. One passage: salvage + refill to five.
reset()
gemini = [
  { questions: [q(), q(), q({ prompt: 'x'.repeat(400) }), q({ prompt: 'Which is NOT true?' }), q({ options: ['Same', 'same', 'C', 'D'] })], note: 'A note' },
  { items: [{ i: 0, questions: [q(), q()] }] },
]
r = await call({ church_id: CH, reference: 'John 15:5', text: V[5], api: 2 })
check('one: five after salvage + refill', r.body.ok && r.body.questions.length === 5 && r.body.questions.every((x) => x.prompt.length <= 300) && r.body.left === 29, r.body)

// 7. Limit.
reset(); db.used = 29
r = await call(week({ dates: D }))
check('limit 429, no false left, no model call', r.status === 429 && r.body.reason === 'limit' && r.body.left === undefined && geminiCalls === 0, r)

// 8. Gate refusal costs nothing and isn't logged.
reset(); db.gate = 'no_addon'
r = await call(week({ dates: D }))
check('no_addon 403, nothing spent or logged', r.status === 403 && db.used === 0 && db.runs.length === 0, r)

// 9. No key → refunded.
reset(); delete env.GEMINI_API_KEY; rpc.tiktok_gemini_key = () => ''
r = await call({ church_id: CH, reference: 'John 15:5', text: V[5], api: 2 })
check('no_key 500 + refund', r.status === 500 && r.body.reason === 'no_key' && db.used === 0, r)
env.GEMINI_API_KEY = 'k'

// 10. Topic the model can't anchor → refunded.
reset(); gemini = [{ series: 'x', passages: [] }]
r = await call({ mode: 'topic', church_id: CH, topic: 'tax law', api: 2 })
check('topic_unclear 422 + refund', r.status === 422 && r.body.reason === 'topic_unclear' && db.used === 0, r)

// 11. Bad dates refused before any spend.
reset()
r = await call(week({ dates: ['2030-01-06', '2030-01-06'] }))
check('duplicate dates refused, nothing spent', r.status === 422 && r.body.reason === 'bad_dates' && db.used === 0, r)

// 12. One open day (StudyTopicWeek drafts 2, saves 1).
reset(); gemini = [{ days: [{ reference: 'John 15:1', questions: five() }, { reference: 'John 15:2', questions: five() }] }]
r = await call(week({ days: 2, dates: [D[0]] }))
check('2 drafted, 1 date: saves 1, refunds 1', r.body.ok && r.body.saved.length === 1 && db.used === 1, r.body)

// 13. The blind check flags a disagreement on the saved draft, and the run log counts it.
//     q() marks option 1 right; the checker answers 1 everywhere but Q3 of day 1 (2) and
//     Q5 of day 1 (-1, couldn't tell — not a flag).
reset(); gemini = [
  { days: [{ reference: 'John 15:1', questions: five() }, { reference: 'John 15:4', questions: five() }] },
  { items: [{ i: 0, answers: [1, 1, 2, 1, -1] }, { i: 1, answers: [1, 1, 1, 1, 1] }] },
]
r = await call(week({ days: 2, dates: [D[0], D[1]] }))
let d0 = db.verses[D[0]]?.questions ?? [], d1 = db.verses[D[1]]?.questions ?? []
check('check: disagreement flagged with the pick', d0[2]?.check === true && d0[2]?.checkPick === 2, d0[2])
check('check: "couldn\'t tell" is not flagged', !d0[4]?.check && d0[4]?.checkPick === undefined, d0[4])
check('check: agreeing questions untouched', !d0[0].check && !d0[1].check && !d0[3].check && d1.every((q) => !q.check), { d0, d1 })
check('check: run log counts checked and flagged', db.runs.at(-1)?.questions_checked === 10 && db.runs.at(-1)?.questions_flagged === 1, db.runs.at(-1))
check('check: units unchanged by the check', db.used === 2, db.used)

// 14. A checker that fails leaves the draft exactly as it was, unflagged, and still saves.
reset(); gemini = [{ days: [{ reference: 'John 15:1', questions: five() }, { reference: 'John 15:4', questions: five() }] }, 503]
r = await call(week({ days: 2, dates: [D[0], D[1]] }))
check('check fails: still saved, no flags, nothing counted', r.body.ok && r.body.saved.length === 2 && Object.values(db.verses).every((v) => v.questions.every((q) => !q.check)) && db.runs.at(-1)?.questions_checked === 0, { body: r.body, run: db.runs.at(-1) })

// 15. A checker answer that is out of range for a set is ignored for that set only.
reset(); gemini = [
  { days: [{ reference: 'John 15:1', questions: five() }, { reference: 'John 15:4', questions: five() }] },
  { items: [{ i: 0, answers: [1, 1, 9, 1, 1] }, { i: 1, answers: [0, 1, 1, 1, 1] }] },
]
r = await call(week({ days: 2, dates: [D[0], D[1]] }))
d0 = db.verses[D[0]].questions; d1 = db.verses[D[1]].questions
check('check: unreadable set skipped whole, readable one flagged', d0.every((q) => !q.check) && d1[0].check === true && d1[0].checkPick === 0 && db.runs.at(-1)?.questions_checked === 5, { d0, d1 })

// 16. One-day mode carries the flags back to the form.
reset(); gemini = [{ questions: five(), note: 'n' }, { items: [{ i: 0, answers: [1, 3, 1, 1, 1] }] }]
r = await call({ church_id: CH, reference: 'John 15:5', text: V[5], api: 2 })
check('one-day: flag returned on the question', r.body.ok && r.body.questions[1].check === true && r.body.questions[1].checkPick === 3 && !r.body.questions[0].check, r.body.questions)

// 17. The model cannot flag or unflag itself: a `check` it writes is not carried.
reset(); gemini = [{ questions: five().map((q) => ({ ...q, check: true, checkPick: 0 })), note: 'n' }, 503]
r = await call({ church_id: CH, reference: 'John 15:5', text: V[5], api: 2 })
check('a self-written check is ignored', r.body.ok && r.body.questions.every((q) => !q.check), r.body.questions)

// 18. A long transcript is condensed first, and the answer says so.
reset(); gemini = [{ outline: '- ' + 'the vine and the branches, point by point. '.repeat(12) }, { questions: five(), note: 'n' }, { items: [] }]
r = await call({ church_id: CH, reference: 'John 15:5', text: V[5], transcript: 'word '.repeat(5000), api: 2 })
check('long transcript: condensed, then drafted, one unit', r.body.ok && r.body.transcript_use === 'condensed' && r.body.transcript_read === 24999 && db.used === 1 && geminiCalls === 3, r.body)

// 19. A failed condense falls back to the first 12,000 and still drafts.
reset(); gemini = [503, { questions: five(), note: 'n' }, { items: [] }]
r = await call({ church_id: CH, reference: 'John 15:5', text: V[5], transcript: 'word '.repeat(5000), api: 2 })
check('condense fails: clipped, still drafted', r.body.ok && r.body.transcript_use === 'clipped' && r.body.transcript_read === 12000, r.body)

// 20. Memo: an upload URL for this church's own folder, spending nothing.
const MEMO = `${CH}/22222222-2222-2222-2222-222222222222.m4a`
reset()
r = await call({ mode: 'memo_url', church_id: CH, ext: 'm4a', bytes: 1e6, api: 2 })
check('memo_url: signed path in own folder, no unit, no memo spent', r.body.ok && r.body.path.startsWith(CH + '/') && r.body.token === 'tok' && r.body.left === undefined && r.body.memo_left === 10 && db.used === 0 && db.memoUsed === 0, r.body)
r = await call({ mode: 'memo_url', church_id: CH, ext: 'exe', bytes: 1e6, api: 2 })
check('memo_url: unknown format 415', r.status === 415 && r.body.reason === 'memo_format', r)
r = await call({ mode: 'memo_url', church_id: CH, ext: 'mp3', bytes: 60 * 1024 * 1024, api: 2 })
check('memo_url: over 50 MB 413', r.status === 413 && r.body.reason === 'memo_too_big', r)
db.gate = 'no_addon'
r = await call({ mode: 'memo_url', church_id: CH, ext: 'm4a', bytes: 1e6, api: 2 })
check('memo_url: gate refuses before any upload', r.status === 403 && r.body.reason === 'no_addon', r)

// 21. Transcribe: the transcript comes back, a memo is spent, no draft unit, upload and Gemini copy removed.
reset(); store.set(MEMO, new Uint8Array(5000)); gemini = [{ raw: 'Good morning, church.\n\n\n\nToday we are in John fifteen, the vine and the branches.' }]
r = await call({ mode: 'transcribe', church_id: CH, path: MEMO, api: 2 })
check('transcribe: transcript, seconds, memo_left, no draft unit', r.body.ok && r.body.transcript.startsWith('Good morning') && !r.body.transcript.includes('\n\n\n') && r.body.seconds === 2400 && r.body.memo_left === 9 && r.body.left === undefined && db.used === 0, r.body)
check('transcribe: upload and Gemini file removed, nothing logged as a draft', !store.has(MEMO) && files.deleted === 1 && db.runs.length === 0, { store: [...store.keys()], files, runs: db.runs })

// 22. Another church's folder, or an invented name, is refused before any spend.
reset()
r = await call({ mode: 'transcribe', church_id: CH, path: `33333333-3333-3333-3333-333333333333/22222222-2222-2222-2222-222222222222.m4a`, api: 2 })
check('transcribe: other church\'s path refused, nothing spent', r.status === 422 && r.body.reason === 'bad_memo' && db.memoUsed === 0, r)
r = await call({ mode: 'transcribe', church_id: CH, path: `${CH}/../../secret.m4a`, api: 2 })
check('transcribe: traversal refused', r.body.reason === 'bad_memo', r)

// 23. Over an hour by Gemini's own count → refused, released, upload removed.
reset(); store.set(MEMO, new Uint8Array(5000)); files.tokens = 32 * 60 * 75
r = await call({ mode: 'transcribe', church_id: CH, path: MEMO, api: 2 })
check('transcribe: 75 min refused, memo released, upload gone', r.status === 413 && r.body.reason === 'memo_too_long' && db.memoUsed === 0 && !store.has(MEMO) && files.deleted === 1, { body: r.body, used: db.memoUsed })

// 24. Busy model → released, upload KEPT so the retry needn't upload again; the retry works.
reset(); store.set(MEMO, new Uint8Array(5000)); gemini = [503]
r = await call({ mode: 'transcribe', church_id: CH, path: MEMO, api: 2 })
check('transcribe busy: 503, released, upload kept', r.status === 503 && r.body.reason === 'model_busy' && db.memoUsed === 0 && store.has(MEMO), r.body)
gemini = [{ raw: 'And so we remain in him, every day of this week.' }]
r = await call({ mode: 'transcribe', church_id: CH, path: MEMO, api: 2 })
check('transcribe retry on the same upload succeeds', r.body.ok && db.memoUsed === 1, r.body)

// 25. A format Gemini won't take → 415, released, upload removed.
reset(); store.set(MEMO, new Uint8Array(5000)); files.uploadStatus = 400
r = await call({ mode: 'transcribe', church_id: CH, path: MEMO, api: 2 })
check('transcribe: refused format 415, released', r.status === 415 && r.body.reason === 'memo_format' && db.memoUsed === 0 && !store.has(MEMO), r.body)

// 26. Silence, a missing upload, and the daily memo cap.
reset(); store.set(MEMO, new Uint8Array(5000)); gemini = [{ raw: '' }]
r = await call({ mode: 'transcribe', church_id: CH, path: MEMO, api: 2 })
check('transcribe: no speech → memo_silent, released', r.body.reason === 'memo_silent' && db.memoUsed === 0, r.body)
reset()
r = await call({ mode: 'transcribe', church_id: CH, path: MEMO, api: 2 })
check('transcribe: missing upload → memo_missing 404, released', r.status === 404 && r.body.reason === 'memo_missing' && db.memoUsed === 0, r)
reset(); db.memoUsed = 10
r = await call({ mode: 'transcribe', church_id: CH, path: MEMO, api: 2 })
check('transcribe: memo cap 429, no model call', r.status === 429 && r.body.reason === 'memo_limit' && geminiCalls === 0, r)

// 27. Auto week (0148): upload → transcript → week, with nobody pressing a button.
//     Dates are the first EMPTY days from the start: a live day and a waiting
//     draft are both left alone. The stage after transcription is a fresh call.
const S = '2030-02-03'
const day = (n) => new Date(Date.parse(S + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)
const auto = (o = {}) => ({ mode: 'auto_week', church_id: CH, path: MEMO, series: 'Abiding', passages, start: S, days: 3, api: 2, ...o })
reset(); jobs.clear(); db.chained = 0; store.set(MEMO, new Uint8Array(5000))
db.verses[day(0)] = { status: 'approved' }; db.verses[day(1)] = { status: 'draft' }
gemini = [
  { raw: 'Good morning church. Today we read John fifteen: remain in Me. '.repeat(3) },
  { days: [1, 4, 5].map((v) => ({ reference: `John 15:${v}`, note: 'n', questions: five() })) },
  { items: [{ i: 0, answers: [1, 1, 1, 1, 1] }, { i: 1, answers: [2, 1, 1, 1, 1] }, { i: 2, answers: [1, 1, 1, 1, 1] }] },
]
r = await call(auto())
let job = jobs.get(r.body.job)
check('auto: answers with a job', r.body.ok && !!job, r.body)
check('auto: week drafted on the first EMPTY days (live and draft skipped)', job.status === 'done' && JSON.stringify(job.saved) === JSON.stringify([day(2), day(3), day(4)]) && db.verses[day(1)].status === 'draft' && db.verses[day(0)].status === 'approved', job)
check('auto: drafts only, never approved', [2, 3, 4].every((n) => db.verses[day(n)]?.status === 'draft'), db.verses)
check('auto: one memo use, three draft units, memo and transcript gone', db.memoUsed === 1 && db.used === 3 && !store.has(MEMO) && job.transcript === null && job.memo_path === null, { memo: db.memoUsed, used: db.used, job })
check('auto: answer check carried — one flag counted, on the draft', job.flagged === 1 && db.verses[day(3)].questions.some((x) => x.check), { flagged: job.flagged })
check('auto: the week ran in a second invocation', db.chained === 1, db.chained)

// 28. Week stage fails (model busy) → every unit refunded, transcript KEPT, retry skips transcription.
reset(); jobs.clear(); store.set(MEMO, new Uint8Array(5000))
gemini = [{ raw: 'We read the vine and the branches together this morning, friends.' }, 503, 503]
r = await call(auto())
job = jobs.get(r.body.job)
check('auto: week failure → failed with its reason, units refunded, transcript kept', job.status === 'failed' && job.reason === 'model_busy' && db.used === 0 && !!job.transcript && db.memoUsed === 1, job)
const uploadsBefore = files.uploaded
gemini = [{ days: [1, 4, 5].map((v) => ({ reference: `John 15:${v}`, questions: five() })) }]
r = await call({ mode: 'auto_week_retry', church_id: CH, job: job.id, api: 2 })
job = jobs.get(job.id)
check('auto retry: no second transcription, week lands', r.body.ok && job.status === 'done' && job.saved.length === 3 && files.uploaded === uploadsBefore && db.memoUsed === 1 && db.used === 3, { body: r.body, job })
r = await call({ mode: 'auto_week_retry', church_id: CH, job: job.id, api: 2 })
check('auto retry: a finished job is not run again', r.status === 409 && r.body.reason === 'not_failed', r)

// 29. Transcription fails (busy) → memo released and KEPT for the retry, nothing drafted.
reset(); jobs.clear(); store.set(MEMO, new Uint8Array(5000)); gemini = [503]
r = await call(auto())
job = jobs.get(r.body.job)
check('auto: transcription failure → failed, memo released, upload kept, no units', job.status === 'failed' && job.reason === 'model_busy' && db.memoUsed === 0 && store.has(MEMO) && job.memo_path === MEMO && db.used === 0, job)

// 30. Gates: no add-on → no job; bad passages and someone else's step are refused.
reset(); jobs.clear(); db.gate = 'no_addon'; store.set(MEMO, new Uint8Array(5000))
r = await call(auto())
check('auto: gate refuses, no job made', r.status === 403 && jobs.size === 0, r)
reset(); jobs.clear()
r = await call(auto({ passages: [{ reference: 'John 15:1', verses: [] }] }))
check('auto: bad passages refused up front', r.body.reason === 'bad_passages' && jobs.size === 0, r)
jobs.set('00000000-0000-4000-8000-0000000000aa', { id: '00000000-0000-4000-8000-0000000000aa', church_id: CH, created_by: 'u-leader', status: 'drafting', transcript: 't', updated_at: new Date().toISOString() })
const res = await handler(new Request('http://fn', { method: 'POST', headers: { Authorization: 'Bearer stranger' }, body: JSON.stringify({ mode: 'auto_week_step', job: '00000000-0000-4000-8000-0000000000aa', api: 2 }) }))
check('auto: a step from another account is refused', res.status === 404, res.status)

// D1. Discussion questions (0151) ride beside a week's days only when asked for.
reset(); gemini = [{ days: [
  { reference: 'John 15:1', questions: five(), discussion: ['What does it mean to you that God tends the vine?', 'Where do you need pruning this week?', 'x', 'Another open question for the group?'] },
  { reference: 'John 15:4', questions: five(), discussion: ['Only one usable question here?'] },
] }, { items: [] }]
r = await call(week({ days: 2, dates: [D[0], D[1]], discussion: true }))
check('discussion: saved beside day 1, cleaned to three, generated', r.body.ok && db.discussions[D[0]]?.questions.length === 3 && db.discussions[D[0]].generated === true && !db.discussions[D[0]].questions.includes('x'), db.discussions)
check('discussion: fewer than two usable = none, day still saved', !db.discussions[D[1]] && db.verses[D[1]] && JSON.stringify(r.body.discussed) === JSON.stringify([D[0]]), { d: db.discussions, body: r.body })
check('discussion: no extra unit spent', db.used === 2, db.used)
reset(); gemini = [{ days: [{ reference: 'John 15:1', questions: five(), discussion: ['Should never be saved without asking?', 'Not asked for this run at all?'] }, { reference: 'John 15:4', questions: five() }] }, { items: [] }]
r = await call(week({ days: 2, dates: [D[0], D[1]] }))
check('discussion: not asked = not saved, no discussed key', r.body.ok && Object.keys(db.discussions).length === 0 && r.body.discussed === undefined, r.body)
// D2. One-day mode hands them back to the form; the prompt asked for them.
reset(); gemini = [{ questions: five(), note: 'n', discussion: ['What is Jesus asking of His friends here?', 'How could you remain in Him tomorrow?'] }, { items: [] }]
r = await call({ church_id: CH, reference: 'John 15:5', text: V[5], api: 2, discussion: true })
check('one-day: discussion returned', r.body.ok && r.body.discussion?.length === 2, r.body)

console.log(fails ? `${fails} FAILED` : 'ALL PASS')
process.exit(fails ? 1 : 0)
