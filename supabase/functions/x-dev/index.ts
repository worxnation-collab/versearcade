// x-dev — the build-in-public account voice on X, posted through Ayrshare.
//
// Two jobs, both called by .github/workflows/x-dev.yml with the runner token
// (TIKTOK_RUNNER_TOKEN, Vault 0102) — the same credential the video runner
// uses, which can post and nothing else:
//
//   daily  { date, notes, dry_run? }
//     Two short first-person posts a day about building the app — a
//     headache, a thought, an obstacle — drafted by Grok FROM `notes`, which
//     is the last few days of commit messages on main. Real material only: the
//     model is told to invent nothing. Scheduled at TIMES (America/New_York),
//     jittered off the hour like every other schedule here.
//
//   thread { prs: [{number,title,body}], dry_run? }
//     After every third merge: a 3-6 post thread that says what the last
//     three merged PRs were about. One Ayrshare call with twitterOptions
//     .thread, posts separated by "\n\n" (Ayrshare's explicit boundary).
//
// Load-bearing rules:
//   - IDEMPOTENT by Ayrshare's idempotencyKey ("xdev-<date>-<n>",
//     "xdev-thread-<last pr>") AND by a record parked in the public `tiktok`
//     bucket under x-dev/, so a re-run of the same day or merge is a no-op.
//   - The prompt forbids any person's name, username, email or number, any
//     link, and any SECURITY detail — a commit that closes a hole must never
//     become a post describing the hole.
//   - Every post is length-checked here (<= 280) and dropped rather than
//     trimmed mid-word; a day that drafts nothing usable posts nothing.
//   - X keys ride on every X-bound request (Ayrshare's BYO-keys rule since
//     2026-03-31), from the same Vault functions tiktok-gen reads.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const XAI_MODEL = Deno.env.get('XAI_MODEL') ?? 'grok-4.20-0309-non-reasoning'
const AYRSHARE = 'https://api.ayrshare.com/api'
const BUCKET = 'tiktok'
const TZ = 'America/New_York'
// Local times for the two daily posts. Off :00/:30 on purpose.
const TIMES = ['12:41', '19:13']

type Admin = ReturnType<typeof createClient>

async function secret(admin: Admin, env: string, rpc: string): Promise<string> {
  const v = Deno.env.get(env) ?? ''
  if (v) return v
  const { data } = await admin.rpc(rpc)
  return typeof data === 'string' ? data : ''
}

async function runnerOk(admin: Admin, header: string | null): Promise<boolean> {
  if (!header || header.length < 16) return false
  const want = await secret(admin, '__never__', 'tiktok_runner_token')
  if (want.length < 16) return false
  const digest = async (t: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))
  const [a, b] = await Promise.all([digest(header), digest(want)])
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

/** UTC ISO for a wall-clock time in TZ on a date (DST-correct). */
export function zoned(date: string, hhmm: string, tz = TZ): string {
  const [h, m] = hhmm.split(':').map(Number)
  const guess = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), h, m)
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(guess)).reduce<Record<string, string>>((o, p) => (o[p.type] = p.value, o), {})
  const asLocal = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute)
  return new Date(guess - (asLocal - guess)).toISOString()
}

const SYSTEM = `You write posts for the X account of Verse Arcade, a free two-minute daily Bible game (one verse a day, five questions, every wrong answer teaches a fact; churches can run their own daily verse). The voice is its solo developer, Matthew, building in public: first person, plain, specific, a little dry, never salesy, never preachy.

Rules, all absolute:
- Use ONLY facts in the notes you are given. Invent no numbers, features, users or events.
- Never name or describe any person, player, church member, username, email or account, and give no number about any individual.
- Never mention security issues, vulnerabilities, keys, tokens, passwords, exploits or anything an attacker could use, even if fixed.
- No links, no @mentions, no emoji runs, at most one hashtag and usually none.
- Never say "AI", "Claude", "Grok", "LLM" or "model".
- Never write about the app's own social media, videos, posting schedule, TikTok, YouTube, captions or content pipeline. Write about the APP people play and the churches that use it.
- Write for a stranger who has never seen the code: no file names, function names, table names, migration numbers, cron times or jargon like "RPC", "endpoint", "schema".
- A good post is a small true story: what broke or what was hard, why it was sneaky, what the fix taught. Or a decision and the reason behind it. Concrete beats clever.
- Each post is one complete thought under 270 characters.`

async function grok(key: string, user: string): Promise<Record<string, unknown>> {
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: XAI_MODEL, temperature: 0.7, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }] }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`xAI ${res.status}: ${text.slice(0, 300)}`)
  const j = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> }
  try { return JSON.parse(j.choices?.[0]?.message?.content ?? '{}') } catch { return {} }
}

const BANNED = /(https?:\/\/|www\.|@\w|\b(ai|claude|grok|llm|password|token|exploit|vulnerab|api key|secret)\b)/i
/** Keep a drafted post only if it is a clean, in-bounds string. */
export function clean(s: unknown): string | null {
  if (typeof s !== 'string') return null
  const t = s.replace(/\s+\n/g, '\n').replace(/\n{2,}/g, '\n').trim()
  if (t.length < 20 || t.length > 280 || BANNED.test(t)) return null
  return t
}

async function ayrshare(key: string, xKey: string, xSecret: string, body: Record<string, unknown>) {
  const res = await fetch(`${AYRSHARE}/post`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${key}`, 'X-Twitter-OAuth1-Api-Key': xKey, 'X-Twitter-OAuth1-Api-Secret': xSecret },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  try { return JSON.parse(text) as Record<string, unknown> } catch { return { status: 'error', raw: text.slice(0, 300) } }
}

Deno.serve(async (req) => {
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
  try {
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
    const admin = createClient(SUPABASE_URL, SERVICE_KEY)
    if (!(await runnerOk(admin, req.headers.get('x-runner-token')))) return json({ error: 'unauthorized' }, 401)

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const action = String(body.action ?? '')
    const dry = body.dry_run === true
    const xai = await secret(admin, 'XAI_API_KEY', 'tiktok_xai_key')
    if (!xai) return json({ error: 'XAI_API_KEY is not configured' }, 500)

    const store = admin.storage.from(BUCKET)
    const read = async (p: string) => {
      const { data } = await store.download(p)
      if (!data) return null
      try { return JSON.parse(await data.text()) } catch { return null }
    }
    const park = (p: string, v: unknown) =>
      store.upload(p, new Blob([JSON.stringify(v, null, 2)], { type: 'application/json' }), { upsert: true, contentType: 'application/json' })

    // Take down what one of OUR records says was posted. Ids come only from the
    // record in the bucket, never from the caller, so nothing outside this
    // account's own posts can be reached.
    if (action === 'unpost') {
      const path = String(body.record ?? '')
      if (!/^x-dev\/[A-Za-z0-9_-]{1,40}\.json$/.test(path)) return json({ error: 'bad record' }, 400)
      const rec = await read(path)
      const ids = (rec?.results ?? []).map((r: { id?: string }) => r.id).filter((x: unknown): x is string => typeof x === 'string' && x.length > 0)
      if (!ids.length) return json({ ok: true, removed: 0 })
      if (dry) return json({ ok: true, dry: true, ids })
      const key = await secret(admin, 'AYRSHARE_API_KEY', 'tiktok_ayrshare_key')
      const xKey = await secret(admin, 'X_API_KEY', 'tiktok_x_api_key')
      const xSecret = await secret(admin, 'X_API_SECRET', 'tiktok_x_api_secret')
      const out = []
      for (const id of ids) {
        const res = await fetch(`${AYRSHARE}/delete`, {
          method: 'DELETE',
          headers: { 'content-type': 'application/json', Authorization: `Bearer ${key}`, 'X-Twitter-OAuth1-Api-Key': xKey, 'X-Twitter-OAuth1-Api-Secret': xSecret },
          body: JSON.stringify({ id }),
        })
        const t = await res.text()
        out.push({ id, http: res.status, body: t.slice(0, 200) })
      }
      await park(path, { ...rec, posted: false, removed: out, removedAt: new Date().toISOString() })
      return json({ ok: out.every((o) => o.http < 300), removed: out })
    }

    let record: string
    let drafts: string[]
    let posts: Array<{ post: string; scheduleDate?: string; idempotencyKey: string; thread?: boolean }>

    if (action === 'daily') {
      const date = String(body.date ?? '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'bad date' }, 400)
      const notes = String(body.notes ?? '').slice(0, 12000)
      if (notes.trim().length < 40) return json({ ok: true, skipped: 'no notes' })
      record = `x-dev/${date}.json`
      const prior = await read(record)
      if (prior?.posted) return json({ ok: true, already: prior })
      const out = await grok(xai, `Notes from building the app (recent commit messages, then older lessons learned):\n\n${notes}\n\nWrite exactly two different posts. Use the older lessons whenever the recent notes are mostly internal tooling. One about a headache or obstacle hit while building (what went wrong, why it was sneaky, what fixed it). One that is a thought or decision about how the app should work and why. Return JSON {"posts":["...","..."]}.`)
      drafts = (Array.isArray(out.posts) ? out.posts : []).map(clean).filter((s): s is string => !!s).slice(0, 2)
      posts = drafts.map((post, i) => ({ post, scheduleDate: zoned(date, TIMES[i]), idempotencyKey: `xdev-${date}-${i + 1}` }))
    } else if (action === 'once') {
      // One post, written by a person, sent now. Same filter as the drafts.
      const text = clean(body.text)
      if (!text) return json({ error: 'text must be 20-280 characters, with no links, @mentions or banned words' }, 400)
      const key = `xdev-once-${Date.now()}`
      record = `x-dev/once-${Date.now()}.json`
      drafts = [text]
      posts = [{ post: text, idempotencyKey: key }]
    } else if (action === 'thread') {
      const prs = (Array.isArray(body.prs) ? body.prs : []).slice(0, 3) as Array<{ number?: number; title?: string; body?: string }>
      const last = Math.max(0, ...prs.map((p) => Number(p.number) || 0))
      if (!prs.length || !last) return json({ error: 'need prs' }, 400)
      record = `x-dev/thread-${last}.json`
      const prior = await read(record)
      if (prior?.posted) return json({ ok: true, already: prior })
      const src = prs.map((p) => `PR: ${String(p.title ?? '').slice(0, 200)}\n${String(p.body ?? '').slice(0, 3000)}`).join('\n\n---\n\n')
      const out = await grok(xai, `The last three changes merged into the app:\n\n${src}\n\nWrite a short thread (3 to 6 posts) giving a brief overview of what is being worked on right now and why it matters to the people who play or the churches that use it. The first post should make someone want to read on; the last can say what is next only if the notes say so. Return JSON {"posts":["...", ...]}.`)
      drafts = (Array.isArray(out.posts) ? out.posts : []).map(clean).filter((s): s is string => !!s).slice(0, 6)
      if (drafts.length < 2) drafts = []
      posts = drafts.length ? [{ post: drafts.map((d) => d.replace(/\n/g, ' ')).join('\n\n'), idempotencyKey: `xdev-thread-${last}`, thread: true }] : []
    } else {
      return json({ error: 'unknown action' }, 400)
    }

    if (!posts.length) return json({ ok: true, skipped: 'nothing usable drafted' })
    if (dry) return json({ ok: true, dry: true, drafts, posts })

    const key = await secret(admin, 'AYRSHARE_API_KEY', 'tiktok_ayrshare_key')
    const xKey = await secret(admin, 'X_API_KEY', 'tiktok_x_api_key')
    const xSecret = await secret(admin, 'X_API_SECRET', 'tiktok_x_api_secret')
    if (!key || !xKey || !xSecret) return json({ error: 'Ayrshare or X keys are not configured' }, 500)

    const results = []
    for (const p of posts) {
      const r = await ayrshare(key, xKey, xSecret, {
        post: p.post,
        platforms: ['twitter'],
        idempotencyKey: p.idempotencyKey,
        ...(p.scheduleDate ? { scheduleDate: p.scheduleDate } : {}),
        ...(p.thread ? { twitterOptions: { thread: true, threadNumber: true } } : {}),
      })
      results.push({ key: p.idempotencyKey, at: p.scheduleDate ?? 'now', status: r.status ?? 'unknown', id: r.id ?? null, errors: r.errors ?? null })
    }
    const posted = results.some((r) => r.status === 'success' || r.status === 'scheduled')
    await park(record, { posted, drafts, results, at: new Date().toISOString() })
    return json({ ok: posted, results })
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500)
  }
})
