// church-digest — the Monday digest for church leadership (0154,
// docs/CHURCH-DIGEST.md).
//
// Two callers, two doors, nothing else:
//
//   • THE WEEKLY RUN — pg_cron posts here every Monday hour with
//     `x-digest-token` (Vault DIGEST_CRON_TOKEN). It asks `church_digest_due`
//     who is owed this Monday's email (opted in, still leadership of a
//     VERIFIED church, the church's clock past Monday 08:00, not yet sent),
//     builds each one through `church_digest_build` — Home's own reads, run as
//     that leader — and marks it sent only once the provider accepted it.
//
//   • A LEADER'S TEST — `{ action: 'test', church_id, dry_run? }` with their
//     own session. The same build, for their church, to their own address.
//     `dry_run` returns the email instead of sending it.
//
// The email carries ONLY rows Home carries, worded by the same builder
// (`church-digest/home.ts`): the sermon week / Autopilot line, drafts waiting,
// flagged questions, inquiries waiting (a count — no names, no notes) and the
// quiet count (no names). Every row is a link onto the dashboard tab Home's
// row opens (`?go=`). No member is ever emailed.
//
// Provider: Resend (`RESEND_API_KEY`, function secret or Vault). No key ⇒
// nothing is sent and nothing is marked sent, so the first Monday after the
// key lands still goes out. verify_jwt is OFF (config.toml) because the cron
// has no session; both doors check their own credential below.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { autoRow, currentJob, draftRows, homeGoQuery, inquiryRow, quietRow, type HomeJob, type HomeRow } from './home.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL = (Deno.env.get('APP_URL') ?? 'https://versearcade.org').replace(/\/+$/, '')
const FROM = Deno.env.get('DIGEST_FROM') ?? 'Verse Arcade <digest@versearcade.org>'
const PER_RUN = 200

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-digest-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

async function secret(name: 'RESEND_API_KEY' | 'DIGEST_CRON_TOKEN'): Promise<string | null> {
  const env = Deno.env.get(name)
  if (env) return env
  const { data } = await admin.rpc('church_digest_secret', { p_name: name })
  return typeof data === 'string' && data ? data : null
}

async function sameSecret(a: string, b: string): Promise<boolean> {
  const h = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
  const [x, y] = await Promise.all([h(a), h(b)])
  let d = 0
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i]
  return d === 0
}

const toJob = (j: Record<string, any>): HomeJob => ({
  status: String(j.status ?? ''),
  source: j.source === 'fallback' ? 'fallback' : 'memo',
  autopilot: j.autopilot === true,
  series: String(j.series ?? ''),
  references: Array.isArray(j.references) ? j.references.map(String) : [],
  startDate: String(j.start_date ?? ''),
  saved: Array.isArray(j.saved) ? j.saved.map(String) : [],
  flagged: Number(j.flagged) || 0,
  stale: j.stale === true,
  seen: j.seen === true,
  reason: j.reason ? String(j.reason) : null,
})

export interface Digest { subject: string; text: string; html: string; rows: Array<HomeRow & { url: string }> }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** Home's details end in " →" because the row is a button; the email has a link instead. */
const plain = (s: string) => s.replace(/\s*→\s*$/, '')

export function composeDigest(churchId: string, b: Record<string, any>): Digest {
  const today = String(b.today)
  const rows: HomeRow[] = []
  const auto = autoRow(currentJob((b.jobs ?? []).map(toJob)), b.autopilot_skipped === true, today)
  if (auto) rows.push(auto)
  rows.push(...draftRows((b.drafts ?? []).map((d: any) => ({ date: String(d.date), flagged: Number(d.flagged) || 0 }))))
  const inq = inquiryRow(Number(b.inquiries) || 0, null)
  if (inq) rows.push(inq)
  const q = quietRow(Number(b.quiet) || 0)
  if (q) rows.push(q)

  const base = `${APP_URL}/church/${churchId}/admin`
  const linked = rows.map((r) => ({ ...r, url: `${base}?${homeGoQuery(r.go)}` }))
  const name = String(b.church_name ?? 'your church')
  const subject = linked.length ? `This week at ${name}: ${linked.length} thing${linked.length === 1 ? '' : 's'} for you` : `This week at ${name}: you’re all set`
  const intro = linked.length ? 'Here’s what’s waiting on your leadership Home this week.' : 'Nothing is waiting on you this week.'
  const footer = 'You get this because you switched on the Tuesday digest on your leadership Home. Turn it off there any time.'

  const text = [
    `This week at ${name}`, '', intro, '',
    ...linked.flatMap((r) => [`${r.icon} ${r.title}`, `   ${plain(r.detail)}`, `   ${r.url}`, '']),
    `Open your dashboard: ${base}`, '', footer,
  ].join('\n')

  const html = `<!doctype html><html><body style="margin:0;background:#f6f3ee;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1d1a24">
<div style="max-width:560px;margin:0 auto;padding:24px 18px">
<h1 style="font-size:20px;margin:0 0 6px">This week at ${esc(name)}</h1>
<p style="margin:0 0 16px;color:#5a5466;font-size:14px">${esc(intro)}</p>
${linked.map((r) => `<a href="${esc(r.url)}" data-row="${esc(r.key)}" style="display:block;text-decoration:none;color:inherit;background:#fff;border:1px solid #e4ddd2;border-radius:12px;padding:12px 14px;margin:0 0 10px">
<div style="font-size:15px;font-weight:700">${esc(r.icon)} ${esc(r.title)}</div>
<div style="font-size:13px;color:#5a5466;margin-top:3px">${esc(plain(r.detail))} <span style="color:#8a6a1e;font-weight:700;white-space:nowrap">Open →</span></div></a>`).join('\n')}
<p style="margin:18px 0 0;font-size:13px"><a href="${esc(base)}" style="color:#8a6a1e;font-weight:700">Open your dashboard</a></p>
<p style="margin:18px 0 0;font-size:12px;color:#8a8494">${esc(footer)}</p>
</div></body></html>`
  return { subject, text, html, rows: linked }
}

async function send(key: string, to: string, d: Digest): Promise<boolean> {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject: d.subject, html: d.html, text: d.text }),
  })
  return r.ok
}

async function build(churchId: string, userId: string, today?: string) {
  const { data, error } = await admin.rpc('church_digest_build', { p_church_id: churchId, p_user_id: userId, p_local_date: today ?? null })
  if (error || !data) return { ok: false as const, reason: 'unavailable' }
  if (data.ok === false) return { ok: false as const, reason: String(data.reason ?? 'unavailable') }
  return { ok: true as const, data: data as Record<string, any> }
}

async function runWeekly() {
  const key = await secret('RESEND_API_KEY')
  const { data: due, error } = await admin.rpc('church_digest_due')
  if (error) return json({ ok: false, reason: 'unavailable' }, 500)
  const list = (Array.isArray(due) ? due : []).slice(0, PER_RUN)
  if (!key) return json({ ok: true, due: list.length, sent: 0, reason: list.length ? 'no_provider' : undefined })
  let sent = 0
  const skipped: string[] = []
  for (const d of list) {
    const b = await build(d.church_id, d.user_id, d.today)
    if (!b.ok) { skipped.push(b.reason); continue }
    if (await send(key, d.email, composeDigest(d.church_id, b.data))) {
      await admin.rpc('church_digest_mark_sent', { p_church_id: d.church_id, p_user_id: d.user_id, p_week: d.week })
      sent++
    } else skipped.push('send_failed')
  }
  return json({ ok: true, due: list.length, sent, skipped })
}

async function runTest(req: Request, body: Record<string, any>) {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: who } = jwt ? await admin.auth.getUser(jwt) : { data: null }
  const user = who?.user
  if (!user) return json({ ok: false, reason: 'not_authenticated' }, 401)
  const churchId = String(body.church_id ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(churchId)) return json({ ok: false, reason: 'bad_input' }, 400)
  const today = typeof body.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : undefined
  const b = await build(churchId, user.id, today)
  if (!b.ok) return json({ ok: false, reason: b.reason }, 403)
  const digest = composeDigest(churchId, b.data)
  if (body.dry_run === true) return json({ ok: true, sent: false, to: user.email ?? null, ...digest })
  if (!user.email) return json({ ok: false, reason: 'no_email' }, 400)
  const key = await secret('RESEND_API_KEY')
  if (!key) return json({ ok: false, reason: 'no_provider' }, 503)
  if (!(await send(key, user.email, digest))) return json({ ok: false, reason: 'send_failed' }, 502)
  return json({ ok: true, sent: true, to: user.email, subject: digest.subject })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, reason: 'method' }, 405)
  let body: Record<string, any> = {}
  try { body = await req.json() } catch { /* an empty body is the cron's */ }

  const token = req.headers.get('x-digest-token')
  if (token) {
    const want = await secret('DIGEST_CRON_TOKEN')
    if (!want || !(await sameSecret(token, want))) return json({ ok: false, reason: 'forbidden' }, 403)
    return runWeekly()
  }
  if (body.action === 'test') return runTest(req, body)
  return json({ ok: false, reason: 'bad_action' }, 400)
})
