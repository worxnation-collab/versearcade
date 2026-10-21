// bible-text — scripture in the translation a player chose, through API.Bible.
//
// The API.Bible key lives HERE and nowhere else, the tiktok-gen rule: the App
// Store build runs a `dist` baked into the IPA, so a key compiled into the
// client is a key anybody can unzip. The client asks for a chapter or a
// passage of an ALLOWED Bible and gets plain verses back; it never names an
// endpoint, so this is not an open proxy onto the whole API.
//
// Public on purpose — a guest reads the Bible too — so it runs with the anon
// key's JWT and touches no table. Nothing here knows who is asking.
//
// Actions (POST { action, ... }):
//   bibles   {}                                   → { bibles: [{ id, abbr, name, copyright }] }  the allowed list, narrowed to what this key actually serves
//   chapter  { bibleId, book, chapter }           → { reference, verses[], copyright, fumsToken? }
//   passage  { bibleId, book, chapter, start, end? } → { reference, verses[], copyright, fumsToken? }
//
// `book` is a USFM code (JHN, 1SA). `fumsToken` is API.Bible's fair-use token:
// the CLIENT reports it when the text is shown (lib/fums.ts), because "shown"
// is a fact only the screen knows.
//
// Secret: API_BIBLE_API_KEY — as a function secret, or in Vault under the same
// name (read through `api_bible_key()`, 0125, service_role only). The function
// secret wins if both exist.

import { createBibleClient, NotFoundError, RateLimitError } from 'npm:@americanbible/api-bible-sdk@2.0.1'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { chapterId, flattenVerses, passageId, plainCopyright } from './parse.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// The Bibles this app offers, keyed by API.Bible id. Keep in sync with
// `TRANSLATIONS_ALL` in src/lib/translations.ts — this list is the ceiling (a
// client asking for anything else is refused), that one is what the picker
// draws while offline.
const ALLOWED: Record<string, { abbr: string; name: string }> = {
  'd6e14a625393b4da-01': { abbr: 'NLT', name: 'New Living Translation' },
  '6f11a7de016f942e-01': { abbr: 'MSG', name: 'The Message' },
  'bba9f40183526463-01': { abbr: 'BSB', name: 'Berean Standard Bible' },
  'de4e12af7f28f599-02': { abbr: 'KJV', name: 'King James Version' },
  '9879dbb7cfe39e4d-04': { abbr: 'WEB', name: 'World English Bible' },
  '06125adad2d5898a-01': { abbr: 'ASV', name: 'American Standard Version' },
  '179568874c45066f-01': { abbr: 'DRA', name: 'Douay-Rheims' },
}

// Resolved once per isolate: the env secret, else Vault. A failed Vault read is
// not remembered, so a key added later is picked up without a redeploy.
let client: ReturnType<typeof createBibleClient> | null = null
async function bibleClient() {
  if (client) return client
  let key = Deno.env.get('API_BIBLE_API_KEY') ?? ''
  if (!key) {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data } = await admin.rpc('api_bible_key')
    key = typeof data === 'string' ? data : ''
  }
  if (key) client = createBibleClient({ apiKey: key, timeout: 8000 })
  return client
}

// Per-isolate memory, for the Bible LIST only. Scripture text is deliberately
// not memoised here: every response carries its own fair-use token, and
// handing one cached token to a thousand readers would report one view. The
// device caches text instead (lib/bible.ts).
const memo = new Map<string, { at: number; body: unknown }>()
const MEMO_MS = 6 * 60 * 60 * 1000
const MEMO_MAX = 8
function remember(k: string, body: unknown) {
  if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value as string)
  memo.set(k, { at: Date.now(), body })
}
function recall(k: string): unknown | undefined {
  const hit = memo.get(k)
  if (!hit) return undefined
  if (Date.now() - hit.at > MEMO_MS) { memo.delete(k); return undefined }
  return hit.body
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// What we ask for every time: verse-tagged JSON, no notes, no headings — the
// app shows scripture, not a study edition's apparatus.
const RENDER = {
  contentType: 'json' as const,
  includeNotes: false,
  includeTitles: false,
  includeChapterNumbers: false,
  includeVerseNumbers: false,
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const client = await bibleClient().catch(() => null)
  if (!client) return json({ error: 'not_configured' }, 503)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'bad_json' }, 400) }
  const action = String(body.action ?? '')

  try {
    if (action === 'bibles') {
      const cached = recall('bibles')
      if (cached) return json(cached)
      const { data } = await client.bibles.list({ ids: Object.keys(ALLOWED), includeFullDetails: true })
      const bibles = data
        .filter((b) => ALLOWED[b.id])
        .map((b) => ({
          id: b.id,
          abbr: ALLOWED[b.id].abbr,
          name: ALLOWED[b.id].name,
          copyright: plainCopyright((b as { copyright?: unknown }).copyright),
        }))
      const out = { bibles }
      remember('bibles', out)
      return json(out)
    }

    const bibleId = String(body.bibleId ?? '')
    if (!ALLOWED[bibleId]) return json({ error: 'unknown_bible' }, 400)
    const book = String(body.book ?? '')
    const chapter = Number(body.chapter)

    if (action === 'chapter') {
      const id = chapterId(book, chapter)
      if (!id) return json({ error: 'bad_reference' }, 400)
      const { data, meta } = await client.chapters.get(bibleId, id, RENDER)
      const out = {
        reference: data.reference ?? `${book} ${chapter}`,
        verses: flattenVerses(data.content),
        copyright: plainCopyright(data.copyright),
        fumsToken: meta?.fumsToken,
      }
      if (!out.verses.length) return json({ error: 'empty' }, 502)
      return json(out)
    }

    if (action === 'passage') {
      const id = passageId(book, chapter, Number(body.start), body.end == null ? undefined : Number(body.end))
      if (!id) return json({ error: 'bad_reference' }, 400)
      const { data, meta } = await client.passages.get(bibleId, id, RENDER)
      const out = {
        reference: data.reference ?? id,
        verses: flattenVerses(data.content),
        copyright: plainCopyright(data.copyright),
        fumsToken: meta?.fumsToken,
      }
      if (!out.verses.length) return json({ error: 'empty' }, 502)
      return json(out)
    }

    return json({ error: 'unknown_action' }, 400)
  } catch (e) {
    // A verse a translation doesn't carry (the MSG has no verse numbers in a
    // few places, DRA numbers the Psalms differently) is a 404, not a fault:
    // the client falls back to the bundled text either way.
    if (e instanceof NotFoundError) return json({ error: 'not_found' }, 404)
    if (e instanceof RateLimitError) return json({ error: 'rate_limited' }, 429)
    console.error('bible-text', action, e)
    return json({ error: 'upstream' }, 502)
  }
})
