// church-draft — draft the five questions for a passage, for a church's
// verified leadership (the "✨ Draft questions" button in Leadership tools).
//
// POST { church_id, reference, text }  →  { ok: true, questions: Question[5] }
//                                       |  { ok: false, reason }
//
// Who may call it: leadership of a VERIFIED church, decided by
// `use_church_draft` (0122), which this function calls with the CALLER's own
// token so `auth.uid()` is the pastor. That call also spends one unit of the
// church's daily allowance BEFORE any model is asked, so a refused caller costs
// nothing and an allowed one is capped (30 a church a day).
//
// What it returns is a DRAFT. It saves nothing: the form shows it, the pastor
// edits it, and `set_church_verse` stays the only writer of a church's verse,
// with its own validation. Every question is still checked here, exactly as
// `church_clean_questions` (0119) and `cleanQuestions` (store/churchAdmin.ts)
// will check it, so the form is never handed something the server refuses.
//
// The key: GEMINI_API_KEY as a function secret, or Vault through
// `tiktok_gemini_key()` (0097, service_role only) — the same two homes the
// TikTok engine uses. It never reaches a device.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TEXT_MODEL = Deno.env.get('GEMINI_TEXT_MODEL') ?? 'gemini-3.6-flash'
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Question = { prompt: string; options: string[]; answerIndex: number; teach: string }

/** The server's rules (0119 `church_clean_questions`), so a draft can't be refused on save. */
function clean(raw: unknown): Question[] | null {
  if (!Array.isArray(raw) || raw.length !== 5) return null
  const out: Question[] = []
  for (const q of raw as Array<Record<string, unknown>>) {
    const prompt = String(q?.prompt ?? '').trim()
    const teach = String(q?.teach ?? '').trim()
    const options = Array.isArray(q?.options) ? (q.options as unknown[]).map((o) => String(o ?? '').trim()) : []
    const answerIndex = Number(q?.answerIndex)
    if (prompt.length < 1 || prompt.length > 300 || teach.length < 1 || teach.length > 400) return null
    if (options.length < 2 || options.length > 4) return null
    if (options.some((o) => o.length < 1 || o.length > 120)) return null
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return null
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length) return null
    out.push({ prompt, options, answerIndex, teach })
  }
  return out
}

/** Models put the right answer first far too often; deal each question's options fresh. */
function shuffleOptions(qs: Question[]): Question[] {
  return qs.map((q) => {
    const order = q.options.map((_, i) => i)
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    return { ...q, options: order.map((i) => q.options[i]), answerIndex: order.indexOf(q.answerIndex) }
  })
}

function prompt(reference: string, text: string): string {
  return (
    `You write the five quiz questions a church congregation answers about one Bible passage in the Verse Arcade app. ` +
    `Their pastor chose this passage and will read and edit every question before anyone sees it.\n\n` +
    `Passage: ${reference}\n"""${text}"""\n\n` +
    `Rules — every one of them matters:\n` +
    `1. Every question must be answerable from the passage above (and, at most, its immediate plain context in the Bible). No trivia from elsewhere.\n` +
    `2. Mix the kinds: who is speaking or addressed, what the passage says (a fill-in-the-blank of a key word), what an image or word in it means in plain terms, what comes right before or after it, and what it asks of the reader. Never two of the same kind in a row.\n` +
    `3. Exactly 4 options each, one clearly right. Wrong options must be plausible but plainly wrong to someone who read carefully. No "all of the above", no "none of the above", no trick wording, no negatives like "which is NOT".\n` +
    `4. Nothing a Catholic, an Orthodox, a Baptist or a Pentecostal would answer differently. No doctrine disputes, no denominational distinctives, no questions about how many books are in the Bible.\n` +
    `5. "teach" is one or two warm sentences shown after EVERY answer, right or wrong. It says why the right answer is right, pointing back at the passage. Never scold, never say "wrong".\n` +
    `6. Plain words a twelve-year-old can read. Prompt under 160 characters, each option under 80, teach under 280.\n` +
    `7. Do not invent names, numbers or events that are not in the Bible text.\n\n` +
    `Return JSON only: {"questions":[{"prompt":"...","options":["...","...","...","..."],"answerIndex":0,"teach":"..."}, ... exactly 5 ...]}`
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  try {
    if (req.method !== 'POST') return json({ ok: false, reason: 'method' }, 405)
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const churchId = String(body.church_id ?? '')
    const reference = String(body.reference ?? '').trim().slice(0, 60)
    const text = String(body.text ?? '').trim().slice(0, 1200)
    if (!/^[0-9a-f-]{36}$/i.test(churchId) || !reference || text.length < 3) return json({ ok: false, reason: 'bad_input' }, 400)

    // The gate AND the spend, as the caller.
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
    const { data: gate, error: gateErr } = await userClient.rpc('use_church_draft', { p_church_id: churchId })
    if (gateErr) return json({ ok: false, reason: 'unavailable' }, 200)
    if (!(gate as { ok?: boolean })?.ok) return json({ ok: false, reason: String((gate as { reason?: string })?.reason ?? 'unavailable') })

    let key = Deno.env.get('GEMINI_API_KEY') ?? ''
    if (!key) {
      const admin = createClient(SUPABASE_URL, SERVICE_KEY)
      const { data } = await admin.rpc('tiktok_gemini_key')
      key = typeof data === 'string' ? data : ''
    }
    if (!key) return json({ ok: false, reason: 'unavailable' })

    const ask = async (): Promise<Question[] | null> => {
      const res = await fetch(`${GEMINI}/models/${TEXT_MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt(reference, text) }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.6 },
        }),
        signal: AbortSignal.timeout(45_000),
      })
      if (!res.ok) { console.warn('gemini', res.status, (await res.text()).slice(0, 300)); return null }
      const data = await res.json()
      const raw = (data?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('')
      try { return clean(JSON.parse(raw)?.questions) } catch { return null }
    }

    // One retry for a malformed answer; both attempts are inside the one unit spent.
    const qs = (await ask()) ?? (await ask())
    if (!qs) return json({ ok: false, reason: 'draft_failed' })
    return json({ ok: true, questions: shuffleOptions(qs) })
  } catch (e) {
    console.error('church-draft', (e as Error).message)
    return json({ ok: false, reason: 'unavailable' })
  }
})
