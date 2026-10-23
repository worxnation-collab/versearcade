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
}
// --- fake Gemini: a queue of answers per test ------------------------------
let gemini = []
let geminiCalls = 0
globalThis.fetch = async (url, init = {}) => {
  url = String(url)
  if (url.startsWith(SB + '/rest/v1/rpc/')) {
    const fn = url.slice((SB + '/rest/v1/rpc/').length).split('?')[0]
    const out = rpc[fn](JSON.parse(init.body || '{}'))
    return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  if (url.startsWith(SB + '/rest/v1/church_draft_runs')) {
    db.runs.push(JSON.parse(init.body)); return new Response(null, { status: 201 })
  }
  if (url.includes('generativelanguage')) {
    geminiCalls++
    const next = gemini.shift()
    if (!next) throw new Error('unexpected model call')
    if (next === 'timeout') { const e = new Error('t'); e.name = 'TimeoutError'; throw e }
    if (typeof next === 'number') return new Response('err', { status: next })
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
const reset = () => { db.used = 0; db.gate = 'ok'; db.verses = {}; db.runs = []; db.refunds = []; gemini = []; geminiCalls = 0 }
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
//     Q5 of day 1 (-1, couldn't tell from the passage).
reset(); gemini = [
  { days: [{ reference: 'John 15:1', questions: five() }, { reference: 'John 15:4', questions: five() }] },
  { items: [{ i: 0, answers: [1, 1, 2, 1, -1] }, { i: 1, answers: [1, 1, 1, 1, 1] }] },
]
r = await call(week({ days: 2, dates: [D[0], D[1]] }))
let d0 = db.verses[D[0]]?.questions ?? [], d1 = db.verses[D[1]]?.questions ?? []
check('check: disagreement flagged with the pick', d0[2]?.check === true && d0[2]?.checkPick === 2, d0[2])
check('check: "couldn\'t tell" flagged as -1', d0[4]?.check === true && d0[4]?.checkPick === -1, d0[4])
check('check: agreeing questions untouched', !d0[0].check && !d0[1].check && !d0[3].check && d1.every((q) => !q.check), { d0, d1 })
check('check: run log counts checked and flagged', db.runs.at(-1)?.questions_checked === 10 && db.runs.at(-1)?.questions_flagged === 2, db.runs.at(-1))
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

console.log(fails ? `${fails} FAILED` : 'ALL PASS')
process.exit(fails ? 1 : 0)
