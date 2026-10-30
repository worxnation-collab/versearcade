// resend-webhook — Resend tells us an email bounced or was marked as spam.
//
// A permanent bounce (the address does not exist) or a complaint ("this is
// spam") SUPPRESSES that address for every email this app sends — the
// come-back email and the leaders' Tuesday digest both skip it (0171). A
// transient bounce is counted and nothing more. The address is hashed by the
// database and never stored; Admin -> Email shows counts only.
//
// Runs with verify_jwt OFF (supabase/config.toml): Resend has no Supabase
// session. Every request is checked against the Svix signature first
// (svix.ts); anything unsigned, mis-signed or more than five minutes old is a
// 401 and touches nothing. Set up in Resend → Webhooks: this function's URL,
// events email.bounced and email.complained, and its signing secret as
// RESEND_WEBHOOK_SECRET (function secret, else Vault — church_digest_secret).
// No secret ⇒ 503, and Resend retries later.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { classify, svixVerify } from './svix.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET')
    || ((await admin.rpc('church_digest_secret', { p_name: 'RESEND_WEBHOOK_SECRET' })).data as string | null)
    || ''
  if (!secret) return json({ error: 'not configured' }, 503)

  const body = await req.text()
  const ok = await svixVerify(secret, {
    id: req.headers.get('svix-id'),
    timestamp: req.headers.get('svix-timestamp'),
    signature: req.headers.get('svix-signature'),
  }, body)
  if (!ok) return json({ error: 'unauthorized' }, 401)

  let event: unknown
  try { event = JSON.parse(body) } catch { return json({ ok: true, ignored: 'bad_json' }) }
  const said = classify(event)
  if (!said) return json({ ok: true, ignored: 'type' })

  const id = req.headers.get('svix-id')!
  // One recipient per Resend email here, but the payload is a list: note each
  // under its own id so a retry of the whole delivery stays a no-op.
  const targets = said.to.length ? said.to : ['']
  for (let i = 0; i < targets.length; i++) {
    const { error } = await admin.rpc('email_event_note', {
      p_event_id: targets.length > 1 ? `${id}:${i}` : id,
      p_kind: said.kind,
      p_email: targets[i],
    })
    // 500 makes Resend retry, which the event id makes safe.
    if (error) { console.error('resend-webhook', error.message); return json({ error: 'note_failed' }, 500) }
  }
  return json({ ok: true, kind: said.kind })
})
