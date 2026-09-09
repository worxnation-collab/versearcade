// tiktok-gen — the Gemini half of the daily TikTok engine (Admin → TikTok).
//
// Admin-only (sharkbait), same gate as push-send. This function is the ONLY
// place the Gemini key is used from the app, and it never leaves here: the
// dashboard asks for pieces, this function makes them and parks them in the
// `tiktok` Storage bucket (public read, service-role write — created on first
// use, so there is no migration), and returns public URLs. Assembling the
// finished video is the BROWSER's job (src/lib/tiktokRender.ts); nothing here
// composites anything, because an Edge Function has neither ffmpeg nor the
// CPU budget for 900 frames of 1080x1920.
//
// Actions (POST { action, ... }):
//   tts         { date, text, voice?, style?, speakers? } → { url, cached }  Gemini TTS → WAV at days/<date>/<voice>-<hash>.wav (speakers: two {name, voice} for a two-voice read)
//   still       { key, prompt, refs[] }          → { url }           Nano Banana 9:16 poster at readers/<key>.png
//   loop-start  { imageUrl | imageBase64, prompt } → { op }          Veo image→video, returns the operation name
//   loop-status { key, op }                      → { done, url? }    polls Veo; on completion parks readers/<key>.mp4
//   copy        { date?, reference, text, theme, kind?, force?, question?, about? } → { hook, caption, hashtags[], platforms }  post copy per platform via Gemini Flash; kind (verse, story, quiz, challenge, challenge2, own) changes what the post is — a challenge passes its question, an own clip what it is about; cached at days/<date>/copy-<kind>.json
//   story       { date, reference, text, ... }    → { title, hook, paragraphs[] }   the story behind the verse, cached at days/<date>/story.json
//   unpost      { date, kind?, platforms? } → { results }  takes a SCHEDULED post back down by the id in the day's own record, so a re-rendered video can be posted again without leaving two
//   thought     { date, kind?, place?, reference, text, paragraphs?, ..., force?, save?, peek? } → { text, words, source }  what the OPERATOR reads in his own voice: the ~110-word reflection after the verse (kind 'verse', days/<date>/thought.json), or — written from the story's own paragraphs (kind 'story') — the ~50-word closing word after it (place 'close', days/<date>/thought-story.json) or the ~35-word introduction handing over to Tabitha before it (place 'open', days/<date>/thought-story-intro.json). `save` parks his edit; `force` redrafts
//   voice       { date, kind? }                   → the day's operator recording for that kind, if one is parked (days/<date>/voice-<verse|story>.json: the timed words the hub transcribed — a story coda carries an empty `verse`), else {}
//   voice-clear { date, kind? }                   → { ok }             removes a parked recording and its transcript, so that post falls back to Gemini's voice alone
//   upload-url  { path }                          → { path, token, publicUrl }  a signed upload URL for a finished video (days/<date>/<kind>.mp4), its cover, one of the operator's recordings (voice-verse|story.wav/.json) or the founder photo (founder/photo.jpg), so the browser can put it in the bucket
//   links       { date, kind }                     → the day's record          asks Ayrshare what became of each SCHEDULED post and fills in the postUrl a network only issues once it publishes
//   post        { date, kind, videoUrl, platforms[], scheduleDate?, attempt?, seconds? } → { results[] }  posts the video with that day's copy through Ayrshare, one call per platform (a platform not linked in Ayrshare is skipped, not failed); parked at days/<date>/posted-<kind>.json, merged over what an earlier call recorded
//   posted      { date, kind }                    → { results[] } | {}  what `post` recorded for that day, if anything
//   analytics   { date, kind, force? }            → { rows[] }          Ayrshare's per-post numbers for that day's record, normalised (views, likes, comments, shares, watched, followers); cached six hours at days/<date>/analytics-<kind>.json
//   replies     { date, kind, prompt, options[], answerIndex, teach, reference?, dryRun?, max? } → { replies[], added[], skipped[] }  reads the comments under a challenge post, has Grok draft a one-line reply to each answer-shaped one and posts it — on every network but X, where it only lists them (X's rules); the record at days/<date>/replies-<kind>.json is the memory
//   social      {}                                → { accounts[], posts, quota }  the Ayrshare profile: which networks are connected and this month's post count
//
// Secrets: GEMINI_API_KEY — as a function secret, or in Vault under the same
// name (read through `tiktok_gemini_key()`, 0097; the function secret wins if
// both exist). AYRSHARE_API_KEY the same way (`tiktok_ayrshare_key()`, 0101):
// Ayrshare is the posting service in front of TikTok, YouTube, Facebook and
// Instagram, so no platform app or token ever lives here — with ONE
// exception: X_API_KEY / X_API_SECRET (`tiktok_x_api_key()` /
// `tiktok_x_api_secret()`, 0104), the account's own X developer app, which
// Ayrshare requires as headers on every X-bound request since 2026-03-31; and
// XAI_API_KEY (`tiktok_xai_key()`, 0105), the Grok key the comment replier
// drafts with (XAI_MODEL overrides the model). Optional model
// overrides so a renamed
// preview model is a dashboard setting rather than a redeploy:
//   GEMINI_TTS_MODEL   (default gemini-2.5-flash-preview-tts)
//   GEMINI_IMAGE_MODEL (default gemini-3-pro-image — what scripts/gen-art.mjs uses)
//   GEMINI_TEXT_MODEL  (default gemini-3.6-flash — 2.5-flash is closed to new keys)
//   VEO_MODEL          (default veo-3.1-fast-generate-preview)
//
// Everything here is idempotent on its key: `tts` for a date that already has
// a voice returns the parked file rather than billing again, and a reader
// still/loop is generated once and reused by every day after it.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PLATFORMS, READING, ayrshareName, kindOf, postBody, postResult, postsOn, type DayCopy, type Platform } from './social.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// The key comes from the GEMINI_API_KEY function secret, or — when that is not
// set — from Vault through `tiktok_gemini_key()` (0097, service_role only).
// Resolved per request into this module-level slot so the helpers below stay
// simple; it is the same value every time.
let GEMINI_KEY = ''
let AYRSHARE_KEY = ''
// The X developer app's consumer key and secret (0104). Since 2026-03-31
// Ayrshare posts to X only with the account's OWN X app, and the pair rides
// as two headers on every request that targets X — Ayrshare stores neither.
// Empty when X is not set up, in which case X requests go out without the
// headers and Ayrshare refuses them as before.
let X_KEY = ''
let X_SECRET = ''
// The xAI (Grok) key (0105), used by ONE action: `replies`, which drafts the
// one-line answers to comments under a challenge post. Grok rather than
// Gemini because the operator holds xAI credits and nothing else spends them.
let XAI_KEY = ''
const XAI_MODEL = Deno.env.get('XAI_MODEL') ?? 'grok-4.20-0309-non-reasoning'
const AYRSHARE = 'https://api.ayrshare.com/api'
const TTS_MODEL = Deno.env.get('GEMINI_TTS_MODEL') ?? 'gemini-2.5-flash-preview-tts'
const IMAGE_MODEL = Deno.env.get('GEMINI_IMAGE_MODEL') ?? 'gemini-3-pro-image'
const TEXT_MODEL = Deno.env.get('GEMINI_TEXT_MODEL') ?? 'gemini-3.6-flash'
const VEO_MODEL = Deno.env.get('VEO_MODEL') ?? 'veo-3.1-fast-generate-preview'

const BUCKET = 'tiktok'
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-runner-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// The prebuilt Gemini voices the dashboard may ask for. Allowlisted so a
// typo comes back as a clear 400 rather than a 500 from the model.
const VOICES = new Set([
  'Charon', 'Orus', 'Fenrir', 'Enceladus', 'Algenib', 'Sadaltager', 'Iapetus', 'Schedar',
  'Kore', 'Aoede', 'Puck', 'Zephyr', 'Leda', 'Gacrux', 'Achird', 'Rasalgethi',
  'Sulafat', 'Vindemiatrix', 'Achernar', 'Umbriel', 'Callirrhoe', 'Despina', 'Erinome',
  'Laomedeia', 'Autonoe', 'Algieba', 'Alnilam', 'Pulcherrima', 'Zubenelgenubi', 'Sadachbia',
])

// ---- helpers ----------------------------------------------------------------
function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
function bytesToB64(b: Uint8Array): string {
  let s = ''
  const CHUNK = 0x8000
  for (let i = 0; i < b.length; i += CHUNK) s += String.fromCharCode(...b.subarray(i, i + CHUNK))
  return btoa(s)
}

// Gemini TTS returns raw 16-bit little-endian PCM (audio/L16, 24 kHz, mono).
// A WAV is that plus a 44-byte header, and a WAV is what decodeAudioData reads.
function pcmToWav(pcm: Uint8Array, sampleRate: number, channels = 1): Uint8Array {
  const header = new ArrayBuffer(44)
  const v = new DataView(header)
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  const byteRate = sampleRate * channels * 2
  str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length, true); str(8, 'WAVE')
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels, true)
  v.setUint32(24, sampleRate, true); v.setUint32(28, byteRate, true); v.setUint16(32, channels * 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, pcm.length, true)
  const out = new Uint8Array(44 + pcm.length)
  out.set(new Uint8Array(header), 0); out.set(pcm, 44)
  return out
}

function rateFromMime(mime: string | undefined): number {
  const m = /rate=(\d+)/.exec(mime ?? '')
  return m ? Number(m[1]) : 24000
}

// Bounded: a TTS call for one voice hung on 2026-09-07 until the function
// gateway answered 502 two minutes later, which the caller could not tell
// from a refusal. Ninety seconds is longer than any reply this function
// has ever waited for; past it the caller gets a clear error and its own
// retry, not a gateway timeout.
const GEMINI_TIMEOUT_MS = 90_000
async function gemini(path: string, body: unknown, method = 'POST'): Promise<Record<string, unknown>> {
  const res = await fetch(`${GEMINI}/${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
    body: method === 'GET' ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${text.slice(0, 600)}`)
  return JSON.parse(text)
}

/**
 * Every kind that can carry the operator's own recording: the morning verse,
 * the story's half, and the six weekday readings. One list, read by the voice
 * paths and by both places `voiced` is decided, so a kind cannot be voiced for
 * the caption and unvoiced for the disclosure.
 */
const VOICED_KINDS: string[] = ['verse', 'story', 'book', 'moment', 'before', 'figure', 'quiet', 'prayer']

async function ayrshare(path: string, body: unknown, method = 'POST', forX = false): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = { 'content-type': 'application/json', Authorization: `Bearer ${AYRSHARE_KEY}` }
  if (forX && X_KEY && X_SECRET) { headers['X-Twitter-OAuth1-Api-Key'] = X_KEY; headers['X-Twitter-OAuth1-Api-Secret'] = X_SECRET }
  const res = await fetch(`${AYRSHARE}/${path}`, {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data: Record<string, unknown> = {}
  try { data = JSON.parse(text) } catch { data = { status: 'error', raw: text.slice(0, 400) } }
  if (!res.ok && !data.status) data.status = 'error'
  return data
}

// One JSON answer from Grok. OpenAI-shaped endpoint; `response_format`
// makes the model return an object, and a reply that is not JSON is an
// empty object rather than a throw, so one odd answer never stops the run.
async function grok(system: string, user: string): Promise<Record<string, unknown>> {
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${XAI_KEY}` },
    body: JSON.stringify({ model: XAI_MODEL, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.6, response_format: { type: 'json_object' } }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`xAI ${res.status}: ${text.slice(0, 400)}`)
  const j = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> }
  try { return JSON.parse(j.choices?.[0]?.message?.content ?? '{}') } catch { return {} }
}

// FNV-1a over a string, as 8 hex characters — enough to tell two delivery
// notes apart in a filename, which is all it is for.
function fnv(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16).padStart(8, '0')
}

// The runner's token, compared as SHA-256 digests so a mismatch costs the
// same time wherever the strings diverge. No header, no token in Vault, or
// an empty one all read as "not the runner", never as a match.
async function runnerOk(admin: ReturnType<typeof createClient>, header: string | null): Promise<boolean> {
  if (!header || header.length < 16) return false
  const { data } = await admin.rpc('tiktok_runner_token')
  const want = typeof data === 'string' ? data : ''
  if (want.length < 16) return false
  const digest = async (t: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))
  const [a, b] = await Promise.all([digest(header), digest(want)])
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

// A key is one path segment of safe characters; it names a file in the bucket.
function safeKey(s: unknown, fallback: string): string {
  const k = String(s ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
  return k || fallback
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  try {
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

    // Verify the caller is the admin (sharkbait) — byte-for-byte the push-send
    // gate — or the headless runner (scripts/tiktok-daily.mjs), which has no
    // session and carries a token of its own instead: TIKTOK_RUNNER_TOKEN in
    // Vault (0102), sent as `x-runner-token` beside the anon key that gets it
    // past the gateway's JWT check. A token that can only make these posts is
    // the most a CI secret should be able to do; the service-role key was the
    // obvious credential and is deliberately NOT accepted here.
    const authHeader = req.headers.get('Authorization') ?? ''
    const admin = createClient(SUPABASE_URL, SERVICE_KEY)
    if (!(await runnerOk(admin, req.headers.get('x-runner-token')))) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
      const { data: { user } } = await userClient.auth.getUser()
      if (!user) return json({ error: 'unauthorized' }, 401)
      const { data: prof } = await admin.from('profiles').select('username').eq('id', user.id).single()
      if (!prof || prof.username !== 'sharkbait') return json({ error: 'forbidden' }, 403)
    }

    GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
    if (!GEMINI_KEY) {
      const { data } = await admin.rpc('tiktok_gemini_key')
      GEMINI_KEY = typeof data === 'string' ? data : ''
    }
    if (!GEMINI_KEY) return json({ error: 'GEMINI_API_KEY is not configured (function secret or Vault)' }, 500)

    // The posting actions need Ayrshare's key too — same two homes as Gemini's.
    //
    // `unpost` belongs on this list and was missing from it, which is the
    // nastiest shape of bug this file collects: AYRSHARE_KEY is module-level,
    // so a warm isolate that had already served a `post` still had the key in
    // hand and every unpost worked. Only a COLD one — the first call after a
    // deploy — sent `Bearer ` and got "API Key not valid" back, per row, as a
    // per-platform `error` rather than a thrown failure. The record then
    // keeps the rows it could not delete, so the day still looks scheduled,
    // and the re-post that follows lands a SECOND scheduled post on the same
    // day. Found by running it against a freshly deployed function.
    const peek = await req.clone().json().catch(() => ({}))
    if (['post', 'unpost', 'links', 'social', 'analytics', 'replies'].includes(String(peek.action ?? ''))) {
      AYRSHARE_KEY = Deno.env.get('AYRSHARE_API_KEY') ?? ''
      if (!AYRSHARE_KEY) {
        const { data } = await admin.rpc('tiktok_ayrshare_key')
        AYRSHARE_KEY = typeof data === 'string' ? data : ''
      }
      if (!AYRSHARE_KEY) return json({ error: 'AYRSHARE_API_KEY is not configured (function secret or Vault)' }, 500)
      X_KEY = Deno.env.get('X_API_KEY') ?? ''
      X_SECRET = Deno.env.get('X_API_SECRET') ?? ''
      if (!X_KEY || !X_SECRET) {
        const [{ data: k }, { data: sec }] = await Promise.all([admin.rpc('tiktok_x_api_key'), admin.rpc('tiktok_x_api_secret')])
        X_KEY = typeof k === 'string' ? k : ''
        X_SECRET = typeof sec === 'string' ? sec : ''
      }
    }
    if (String(peek.action ?? '') === 'replies') {
      XAI_KEY = Deno.env.get('XAI_API_KEY') ?? ''
      if (!XAI_KEY) {
        const { data } = await admin.rpc('tiktok_xai_key')
        XAI_KEY = typeof data === 'string' ? data : ''
      }
      if (!XAI_KEY) return json({ error: 'XAI_API_KEY is not configured (function secret or Vault)' }, 500)
    }

    // The bucket is created on first use. Public read is fine: everything in
    // it is a piece of a public video. Writes go through the service key only.
    const { error: bucketErr } = await admin.storage.createBucket(BUCKET, { public: true })
    if (bucketErr && !/already exists|duplicate/i.test(bucketErr.message)) return json({ error: bucketErr.message }, 500)
    const publicUrl = (path: string) => admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
    const exists = async (path: string) => {
      const dir = path.slice(0, path.lastIndexOf('/'))
      const name = path.slice(path.lastIndexOf('/') + 1)
      const { data } = await admin.storage.from(BUCKET).list(dir, { search: name })
      return !!data?.some((f) => f.name === name)
    }
    const park = async (path: string, bytes: Uint8Array, contentType: string) => {
      const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true })
      if (error) throw new Error(`storage: ${error.message}`)
      return publicUrl(path)
    }

    const input = await req.json().catch(() => ({}))
    const action = String(input.action ?? '')

    // ---- tts: the day's reading ---------------------------------------------
    if (action === 'tts') {
      const date = String(input.date ?? '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'date must be YYYY-MM-DD' }, 400)
      // 2,400 characters: a three-paragraph story plus the verse, with room.
      const text = String(input.text ?? '').slice(0, 2400)
      if (!text.trim()) return json({ error: 'text is required' }, 400)
      const voice = String(input.voice ?? 'Charon')
      if (!VOICES.has(voice)) return json({ error: `unknown voice ${voice}` }, 400)
      const style = String(input.style ?? 'Read this slowly and warmly, like a fisherman reading scripture aloud to a small room. Pause at the punctuation.').slice(0, 400)
      // Two voices, optionally: the text then carries "Name: line" turns and
      // `speakers` names which prebuilt voice each name gets (Gemini TTS
      // allows exactly two). Used for the words of God — the teller tells,
      // a second voice speaks the verse.
      const speakers = Array.isArray(input.speakers)
        ? (input.speakers as Array<{ name?: unknown; voice?: unknown }>).slice(0, 2)
          .map((x) => ({ name: String(x.name ?? '').replace(/[^A-Za-z]/g, '').slice(0, 20), voice: String(x.voice ?? '') }))
          .filter((x) => x.name && VOICES.has(x.voice))
        : []
      const multi = speakers.length === 2
      // Keyed on the voice(s) and the delivery note, so changing either makes
      // a new reading instead of quietly returning yesterday's file.
      const voiceKey = multi ? speakers.map((x) => x.voice).join('+') : voice
      const path = `days/${date}/${voiceKey}-${fnv(style + '\n' + text)}.wav`
      if (!input.force && (await exists(path))) return json({ url: publicUrl(path), cached: true })

      const speechConfig = multi
        ? { multiSpeakerVoiceConfig: { speakerVoiceConfigs: speakers.map((x) => ({ speaker: x.name, voiceConfig: { prebuiltVoiceConfig: { voiceName: x.voice } } })) } }
        : { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }
      const lead = multi ? `${style}\n\nTTS the following, with the named speakers:\n\n` : `${style}\n\n`
      // Asked twice before giving up: the model answers a short text with
      // no audio now and then (finishReason OTHER), and one more ask has
      // always been enough.
      const speak = () => gemini(`models/${TTS_MODEL}:generateContent`, {
        contents: [{ parts: [{ text: `${lead}${text}` }] }],
        generationConfig: { responseModalities: ['AUDIO'], speechConfig },
      })
      type Part = { inlineData?: { data: string; mimeType?: string } }
      const audioPart = (d: Record<string, unknown>) => (d.candidates as Array<{ content?: { parts?: Part[] } }> | undefined)?.[0]?.content?.parts?.find((p) => p.inlineData?.data)
      let data: Record<string, unknown>
      let part: Part | undefined
      try { data = await speak(); part = audioPart(data) } catch (e) { console.warn('tts: first ask failed, asking again:', (e as Error).message); data = await speak(); part = audioPart(data) }
      if (!part) { data = await speak(); part = audioPart(data) }
      if (!part?.inlineData) return json({ error: 'no audio in response', raw: JSON.stringify(data).slice(0, 400) }, 502)
      const pcm = b64ToBytes(part.inlineData.data)
      const wav = pcmToWav(pcm, rateFromMime(part.inlineData.mimeType))
      const url = await park(path, wav, 'audio/wav')
      return json({ url, cached: false })
    }

    // ---- still: a 9:16 poster of the reader over a scene --------------------
    if (action === 'still') {
      const key = safeKey(input.key, 'cephas-harvest')
      const prompt = String(input.prompt ?? '').slice(0, 2000)
      if (!prompt) return json({ error: 'prompt is required' }, 400)
      const path = `readers/${key}.png`
      if (!input.force && (await exists(path))) return json({ url: publicUrl(path), cached: true })

      // Reference images come as URLs (the app's own skin PNG and road scene),
      // fetched here so the browser never has to ship megabytes of base64.
      const refs = Array.isArray(input.refs) ? (input.refs as unknown[]).slice(0, 4).map(String) : []
      const parts: unknown[] = [{ text: prompt }]
      for (const r of refs) {
        if (!/^https:\/\//.test(r)) continue
        const res = await fetch(r)
        if (!res.ok) continue
        const bytes = new Uint8Array(await res.arrayBuffer())
        const mime = res.headers.get('content-type')?.split(';')[0] || (r.endsWith('.jpg') ? 'image/jpeg' : 'image/png')
        parts.push({ inline_data: { mime_type: mime, data: bytesToB64(bytes) } })
      }
      const data = await gemini(`models/${IMAGE_MODEL}:generateContent`, {
        contents: [{ parts }],
        // 2K comes back 1536x2752, so the still is never upscaled to 1080x1920.
        generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '9:16', imageSize: '2K' } },
      })
      const cands = data.candidates as Array<{ content?: { parts?: Array<{ inlineData?: { data: string; mimeType?: string } }> } }> | undefined
      const img = cands?.[0]?.content?.parts?.find((p) => p.inlineData?.data)
      if (!img?.inlineData) return json({ error: 'no image in response', raw: JSON.stringify(data).slice(0, 400) }, 502)
      const bytes = b64ToBytes(img.inlineData.data)
      const url = await park(path, bytes, img.inlineData.mimeType || 'image/png')
      return json({ url, cached: false })
    }

    // ---- loop-start: animate the still with Veo ------------------------------
    // Veo is asynchronous and takes a minute or three, longer than this
    // function may run, so it is two calls: start returns the operation name,
    // and the dashboard polls loop-status until it is done.
    if (action === 'loop-start') {
      const prompt = String(input.prompt ?? '').slice(0, 2000)
      // The frame to animate: a parked still by URL, or a PNG the dashboard
      // composed itself (the built-in tier), sent inline since the bucket
      // takes uploads from this function only.
      let b64 = '', mime = 'image/png'
      if (typeof input.imageBase64 === 'string' && input.imageBase64.length > 0) {
        b64 = input.imageBase64.replace(/^data:[^,]*,/, '')
      } else {
        const imageUrl = String(input.imageUrl ?? '')
        if (!/^https:\/\//.test(imageUrl)) return json({ error: 'imageUrl must be https' }, 400)
        const res = await fetch(imageUrl)
        if (!res.ok) return json({ error: `could not fetch still (${res.status})` }, 400)
        b64 = bytesToB64(new Uint8Array(await res.arrayBuffer()))
        mime = res.headers.get('content-type')?.split(';')[0] || 'image/png'
      }
      const data = await gemini(`models/${VEO_MODEL}:predictLongRunning`, {
        instances: [{ prompt, image: { bytesBase64Encoded: b64, mimeType: mime } }],
        parameters: { aspectRatio: '9:16', durationSeconds: 8, resolution: '720p', personGeneration: 'allow_adult' },
      })
      const op = String(data.name ?? '')
      if (!op) return json({ error: 'no operation in response', raw: JSON.stringify(data).slice(0, 400) }, 502)
      return json({ op })
    }

    if (action === 'loop-status') {
      const key = safeKey(input.key, 'cephas-harvest')
      const op = String(input.op ?? '')
      if (!/^[a-zA-Z0-9_\-./]+$/.test(op)) return json({ error: 'bad op' }, 400)
      const data = await gemini(op, null, 'GET')
      if (!data.done) return json({ done: false })
      if (data.error) return json({ done: true, error: JSON.stringify(data.error).slice(0, 400) })
      const resp = data.response as Record<string, unknown> | undefined
      const gv = (resp?.generateVideoResponse ?? resp) as { generatedSamples?: Array<{ video?: { uri?: string } }> } | undefined
      const uri = gv?.generatedSamples?.[0]?.video?.uri
      if (!uri) return json({ done: true, error: 'no video in response', raw: JSON.stringify(data).slice(0, 400) })
      // The download URI needs the key too, which is why the browser can't
      // fetch it and the file has to come through here into the bucket.
      const vid = await fetch(uri, { headers: { 'x-goog-api-key': GEMINI_KEY } })
      if (!vid.ok) return json({ done: true, error: `video download ${vid.status}` })
      const bytes = new Uint8Array(await vid.arrayBuffer())
      const url = await park(`readers/${key}.mp4`, bytes, 'video/mp4')
      return json({ done: true, url })
    }

    // ---- story: the story behind the verse, for Tabitha to tell ---------------
    // Written ONLY from the pool entry's own narrative fields (before, after,
    // facts, speaker, audience), so the script can't wander off into invented
    // scripture. Cached per date; `force` rewrites.
    if (action === 'story') {
      const date = String(input.date ?? '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'date must be YYYY-MM-DD' }, 400)
      const reference = String(input.reference ?? '').slice(0, 80)
      const text = String(input.text ?? '').slice(0, 1200)
      if (!reference || !text) return json({ error: 'reference and text are required' }, 400)
      const path = `days/${date}/story.json`
      if (!input.force && (await exists(path))) {
        const { data: file } = await admin.storage.from(BUCKET).download(path)
        if (file) return json({ ...JSON.parse(await file.text()), cached: true })
      }
      const f = (k: string, n = 300) => String(input[k] ?? '').slice(0, n)
      const facts = Array.isArray(input.facts) ? (input.facts as unknown[]).slice(0, 6).map((x) => String(x).slice(0, 200)) : []
      // WHERE each paragraph is set, chosen from the stages the CALLER says
      // it has. The function keeps no list of its own on purpose: the
      // paintings ship in the app bundle, so the build is the only thing
      // that knows which exist, and a story naming one this build lacks
      // would be a backdrop that never loads. Same prepack shape as a
      // season's quest verbs — the client declares the vocabulary, the model
      // picks inside it, and anything else is dropped here as well as there.
      // No stages sent (an older caller) ⇒ no `scenes` key, and the post is
      // the one steady painting it always was.
      const stages = (Array.isArray(input.stages) ? (input.stages as unknown[]) : [])
        .slice(0, 24)
        .map((x) => ({ id: String((x as { id?: unknown })?.id ?? '').slice(0, 24), when: String((x as { when?: unknown })?.when ?? '').slice(0, 160) }))
        .filter((x) => /^[a-z0-9_-]+$/.test(x.id))
      const stageIds = new Set(stages.map((x) => x.id))
      const data = await gemini(`models/${TEXT_MODEL}:generateContent`, {
        contents: [{ parts: [{ text:
          `You write short spoken scripts for Tabitha, the librarian in the Verse Arcade Bible app. Each evening she tells the story BEHIND that day's verse to a small audience — warm, plain, unhurried, like a bedtime story for grown-ups. Never preachy, never shaming, no jokes about the listener.\n\n` +
          `Today's verse: ${reference} — "${text}"\nSpoken by: ${f('speaker', 80)}\nTo: ${f('audience', 120)}\nWhat came before: ${f('before')}\nWhat came after: ${f('after')}\nTheme: ${f('theme', 80)}\nFacts you may use: ${facts.join(' | ') || '(none)'}\n\n` +
          `Use ONLY the situation described above and the plain narrative of that Bible passage. Do not invent names, numbers, dialogue or events that are not in the passage. Do not quote the verse itself in the paragraphs — it is read aloud separately at the end.\n\n` +
          `Return JSON with: "title" (at most 6 words, no punctuation), "hook" (the single most dramatic sentence of the story, at most 10 words, no emoji — it is the first thing on screen and it has to stop a thumb), and "paragraphs": exactly two strings. ` +
          `Paragraph 1 OPENS ON THE DRAMATIC MOMENT — the hook's sentence or its twin, the thing that was at stake, in the first line — and only then says where we are and who is there. Paragraph 2: what happened next, what came after, and one plain sentence about why it still matters, ending with a short lead-in such as "Here's the verse." ` +
          `About 80 to 100 words in total: the whole telling has to fit in a minute. Simple sentences that read well aloud. No emoji, no hashtags.` +
          (stages.length
            ? `\n\nAlso return "scenes": exactly two strings, one per paragraph, each the id of the painted backdrop that paragraph is SET IN. Choose ONLY from this list, using the id exactly as written:\n${stages.map((x) => `${x.id} — ${x.when}`).join('\n')}\nPick where the events of that paragraph HAPPEN, not what they are about. If a paragraph is not clearly set anywhere on the list, repeat the previous id rather than reaching for a loose one.`
            : '') }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.7 },
      })
      const cands = data.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined
      const raw = cands?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '{}'
      let parsed: { title?: unknown; hook?: unknown; paragraphs?: unknown; scenes?: unknown } = {}
      try { parsed = JSON.parse(raw) } catch { return json({ error: 'story was not JSON', raw: raw.slice(0, 300) }, 502) }
      const paragraphs = Array.isArray(parsed.paragraphs) ? (parsed.paragraphs as unknown[]).map((x) => String(x).trim()).filter(Boolean).slice(0, 3) : []
      if (paragraphs.length < 1) return json({ error: 'story came back too short', raw: raw.slice(0, 300) }, 502)
      // Dropped per entry, like every sanitiser here: an id this build does
      // not carry becomes null and that paragraph is told in the library.
      const scenes = stages.length
        ? paragraphs.map((_, i) => {
            const id = String((Array.isArray(parsed.scenes) ? (parsed.scenes as unknown[])[i] : '') ?? '').trim().toLowerCase()
            return stageIds.has(id) ? id : null
          })
        : undefined
      const out = { title: String(parsed.title ?? '').slice(0, 60), hook: String(parsed.hook ?? '').slice(0, 80), paragraphs, ...(scenes ? { scenes } : {}) }
      await park(path, new TextEncoder().encode(JSON.stringify(out)), 'application/json')
      return json({ ...out, cached: false })
    }

    // ---- thought: what the operator says after the verse ----------------------
    // The one piece of these posts a PERSON reads: a ~110-word reflection in
    // the first person, drafted from the verse's own data (speaker, audience,
    // before, after, theme, facts — never invented doctrine, nothing one
    // tradition would say differently) so the operator has a runway to read
    // or depart from. Written once per date; `force` redrafts and `save`
    // parks the operator's own edit so a reopened card shows the words they
    // rehearsed rather than a fresh draft.
    if (action === 'thought') {
      const date = String(input.date ?? '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'date must be YYYY-MM-DD' }, 400)
      // Two things a person reads on a day: the ~110-word THOUGHT after the
      // morning verse, and the ~50-word closing word after the evening
      // story. They are cached apart because they are written from different
      // material — the verse's own data, and the story Tabitha just told.
      const forStory = input.kind === 'story'
      // The six weekday READINGS each draft their own script, cached under
      // their own kind. They are the whole post rather than a coda, so they
      // are longer than the story's word and shorter than the morning
      // thought — the length is per kind, in `READING_BRIEF`.
      const READING_BRIEF: Record<string, { words: number; brief: string }> = {
        book: { words: 75, brief: 'Talk about the BOOK this verse comes from, in about thirty seconds. How long it is, what actually happens in it, and how it ends — the part people do not remember. Do not summarise the verse itself; the morning post already did.' },
        moment: { words: 90, brief: 'Tell the story the PAINTING is holding — a single scene, in plain words, as if describing a picture to somebody standing next to you. Open on the detail that is strange or easy to miss. Do not explain the moral; let the scene do it.' },
        before: { words: 90, brief: 'Say what happens immediately BEFORE this verse, then the verse, then what comes immediately AFTER — and let the third part complicate the second rather than tidy it. Use only what is in the passage.' },
        figure: { words: 70, brief: 'Three clues about one person in the Bible, general to specific, spoken as three short beats. NEVER say the name until the very end. The third clue should almost give it away. Then a pause, then the name alone.' },
        quiet: { words: 45, brief: 'Almost nothing. Read the verse, leave a silence, say one plain sentence about it, leave another silence, read it again. No point to prove, no application, no call to action. This post is mostly quiet and the words must not fill it.' },
        prayer: { words: 90, brief: 'A prayer, spoken aloud, drawn from this verse. Four movements in order: who you are talking to, what you are thankful for, what you are asking, and how you finish. First person, plain, unhurried. Never preachy and never about the listener in the third person. End with "In Jesus\u2019 name. Amen."' },
      }
      const reading = READING_BRIEF[String(input.kind ?? '')] ? String(input.kind) : ''
      // A story is spoken over EITHER an introduction or a closing word,
      // never both — but the two are drafted from opposite ends of the same
      // material and are cached apart, so an operator can read both and
      // choose. `place` is 'close' unless asked for.
      const place = input.place === 'open' ? 'open' : 'close'
      const path = `days/${date}/thought${reading ? `-${reading}` : forStory ? (place === 'open' ? '-story-intro' : '-story') : ''}.json`
      const count = (t: string) => t.split(/\s+/).filter(Boolean).length
      if (typeof input.save === 'string') {
        const text = input.save.replace(/\s+/g, ' ').trim().slice(0, 1600)
        if (!text) return json({ error: 'nothing to save' }, 400)
        const out = { text, words: count(text), source: 'operator', at: new Date().toISOString() }
        await park(path, new TextEncoder().encode(JSON.stringify(out)), 'application/json')
        return json({ ...out, cached: false })
      }
      if (!input.force && (await exists(path))) {
        const { data: file } = await admin.storage.from(BUCKET).download(path)
        if (file) return json({ ...JSON.parse(await file.text()), cached: true })
      }
      // `peek` reads what is parked and never drafts, so opening the card for
      // a week of dates costs nothing until a Draft button is pressed.
      if (input.peek) return json({})
      const reference = String(input.reference ?? '').slice(0, 80)
      const text = String(input.text ?? '').slice(0, 1200)
      if (!reference || !text) return json({ error: 'reference and text are required' }, 400)
      const f = (k: string, n = 300) => String(input[k] ?? '').slice(0, n)
      const facts = Array.isArray(input.facts) ? (input.facts as unknown[]).slice(0, 6).map((x) => String(x).slice(0, 200)) : []
      const samples = Array.isArray(input.samples) ? (input.samples as unknown[]).slice(0, 4).map((x) => String(x).slice(0, 1200)).filter(Boolean) : []
      const voiceNote = samples.length ? `Here is how he actually talks, from things he has recorded before — match this voice, its rhythm and its plainness, not its content:\n${samples.map((x) => `"${x}"`).join('\n')}\n\n` : ''
      // The story's closing word: he speaks LAST, after Tabitha has told the
      // story and read the verse, with his face growing into the middle of
      // the frame. Deliberately about a third the length of the morning
      // thought — it is a coda, not a second sermon, and the post is already
      // a minute long before he opens his mouth.
      if (reading) {
        const b = READING_BRIEF[reading]
        const extra = String(input.subject ?? '').slice(0, 400)
        const data = await gemini(`models/${TEXT_MODEL}:generateContent`, {
          contents: [{ parts: [{ text:
            `You write what one man says to camera for a short daily Bible video. He is the maker of a Bible app called Verse Arcade. First person, plain, warm, unhurried — a person talking, not a broadcaster. Never preachy, never shaming, no jokes at the listener's expense, no hashtags, no emoji, no stage directions.\n\n` +
            voiceNote +
            `Today's verse: ${reference} — "${text}"\nSpoken by: ${f('speaker', 80)}\nTo: ${f('audience', 120)}\nWhat came before: ${f('before')}\nWhat came after: ${f('after')}\nTheme: ${f('theme', 80)}\nFacts you may use: ${facts.join(' | ') || '(none)'}\n` +
            (extra ? `The subject of THIS post: ${extra}\n` : '') +
            `\nWhat to write: ${b.brief}\n\n` +
            `Use ONLY the material above and the plain narrative of the passage. Do not invent names, numbers, dialogue or events. About ${b.words} words. Return JSON: { "text": "..." }` }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.85 },
        })
        const cands = data.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined
        const raw = cands?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '{}'
        let parsed: { text?: unknown } = {}
        try { parsed = JSON.parse(raw) } catch { return json({ error: 'draft was not JSON', raw: raw.slice(0, 300) }, 502) }
        const out = { text: String(parsed.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 1600), words: 0, source: 'gemini', at: new Date().toISOString() }
        if (!out.text) return json({ error: 'draft came back empty' }, 502)
        out.words = count(out.text)
        await park(path, new TextEncoder().encode(JSON.stringify(out)), 'application/json')
        return json({ ...out, cached: false })
      }
      if (forStory) {
        const paragraphs = Array.isArray(input.paragraphs) ? (input.paragraphs as unknown[]).slice(0, 4).map((x) => String(x).slice(0, 900)).filter(Boolean) : []
        if (!paragraphs.length) return json({ error: 'paragraphs are required for a story summary' }, 400)
        // The INTRODUCTION: he speaks FIRST, hands the telling to Tabitha and
        // steps out. It is shorter than the coda because it is spending the
        // opening seconds of the video — the ones the hook owns — so it has
        // to be over before a viewer wonders what they are watching. It must
        // not spoil the turn: the hook line is already on screen saying the
        // dramatic thing, and an intro that repeats it wastes both.
        const sd = place === 'open'
          ? await gemini(`models/${TEXT_MODEL}:generateContent`, {
              contents: [{ parts: [{ text:
                `The maker of Verse Arcade, a Bible app, opens a short video in his own voice and hands it over to Tabitha, the app's librarian, who tells the story behind today's verse. He speaks first, to camera, for about fifteen seconds. He is one person talking plainly to a phone, not a preacher and not a brand.\n\n` +
                `The story Tabitha is about to tell: ${paragraphs.join(' ')}\n\nThe verse it is about: ${String(input.reference ?? '').slice(0, 80)} — "${String(input.text ?? '').slice(0, 600)}"\n\n` +
                voiceNote +
                `Rules. First person, present tense, short sentences that read well aloud — no sentence over about 15 words. Open by naming the QUESTION or the situation the story is about to answer, in one breath, so a stranger knows why to stay. Do NOT tell the story, do NOT give away how it turns out, and do NOT quote the verse — Tabitha does all three in a moment. Say ONE true sentence about why this one stopped you. Do not say "today's verse", name the app, thank anyone for watching, or ask for a follow, a comment or a share.\n` +
                `End by handing over to Tabitha BY NAME, in a plain spoken sentence — something in the shape of "In this round-up, Tabitha…" or "Tabitha has the rest". Vary it; do not use the same hand-off twice.\n\n` +
                `Return JSON with: "text" — the introduction, 30 to 45 words, plain punctuation, no emoji, no headings, no line breaks.` }] }],
              generationConfig: { responseMimeType: 'application/json', temperature: 0.8 },
            })
          : await gemini(`models/${TEXT_MODEL}:generateContent`, {
              contents: [{ parts: [{ text:
                `The maker of Verse Arcade, a Bible app, closes a short video in his own voice. The video has just told the story behind today's verse and read the verse aloud; he now speaks last, to camera, for about twenty seconds. He is one person talking plainly to a phone, not a preacher and not a brand.\n\n` +
                `The story that was just told: ${paragraphs.join(' ')}\n\nThe verse that was just read: ${String(input.reference ?? '').slice(0, 80)} — "${String(input.text ?? '').slice(0, 600)}"\n\n` +
                voiceNote +
                `Rules. First person, present tense, short sentences that read well aloud — no sentence over about 15 words. Open by naming in ONE breath the thing the story turned on, so somebody who half-watched still has it. Then ONE plain thing he carries from it today. Do not retell the story beat by beat — the viewer just watched it. Do not quote the verse (it was just read). Do not say "today's verse", name the app, or thank anyone for watching. Nothing that one Christian tradition would say differently from another. Never shame the listener, no "we all" sermons, no call to action, no link.\n` +
                `End on a closing STATEMENT: one plain sentence, first person, naming something specific from THIS story that he is choosing or carrying today. It must settle the thought and let the video end — not a question, not an instruction, not a stock closer.\n\n` +
                `Return JSON with: "text" — the closing word, 45 to 60 words, plain punctuation, no emoji, no headings, no line breaks.` }] }],
              generationConfig: { responseMimeType: 'application/json', temperature: 0.8 },
            })
        const sc = sd.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined
        const sraw = sc?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '{}'
        let sp: { text?: unknown } = {}
        try { sp = JSON.parse(sraw) } catch { return json({ error: 'summary was not JSON', raw: sraw.slice(0, 300) }, 502) }
        const sdraft = String(sp.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 800)
        if (count(sdraft) < 20) return json({ error: 'summary came back too short', raw: sraw.slice(0, 300) }, 502)
        const sout = { text: sdraft, words: count(sdraft), source: 'gemini', at: new Date().toISOString() }
        await park(path, new TextEncoder().encode(JSON.stringify(sout)), 'application/json')
        return json({ ...sout, cached: false })
      }
      const data = await gemini(`models/${TEXT_MODEL}:generateContent`, {
        contents: [{ parts: [{ text:
          `You write a short SPOKEN reflection for the maker of Verse Arcade, a Bible app, to read aloud in his own voice on a short video right after he has read the day's verse. He is one person talking plainly to a phone, not a preacher and not a brand.\n\n` +
          `Today's verse: ${reference} — "${text}"\nSpoken by: ${f('speaker', 80)}\nTo: ${f('audience', 120)}\nWhat came before: ${f('before')}\nWhat came after: ${f('after')}\nTheme: ${f('theme', 80)}\nFacts you may use: ${facts.join(' | ') || '(none)'}\n\n` +
          voiceNote +
          `Rules. First person, present tense, short sentences that read well aloud — no sentence over about 15 words. ONE idea: who was speaking and why it was hard to say or hear, then one plain thing it asks of a person today. Use only the situation described above and the plain narrative of that passage; invent no names, numbers, events or dialogue. Nothing that one Christian tradition would say differently from another — no doctrine, no denominational language. Never shame the listener, never scold, no "we all" sermons, no rhetorical questions in a row. Do not quote the verse itself (he has just read it). Do not say "today's verse" or name the app. ` +
          `End on a closing STATEMENT: one plain sentence, first person, saying what he is choosing or carrying TODAY because of this passage. It must settle the thought and let the video end — not a question, not an instruction to the listener, not a call to action, not a link, and never a dangling hand-off like "here is what I keep asking myself" (which is what the first week of real recordings ended on, and it reads as a sentence cut in half). Do NOT begin it with "I am left". Do NOT describe the scene again. Do NOT reuse a stock closer. It should name something specific from this passage and be a sentence only this reflection could end on.\n\n` +
          `Return JSON with: "text" — the reflection, 100 to 120 words, plain punctuation, no emoji, no headings, no line breaks.` }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.8 },
      })
      const cands = data.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined
      const raw = cands?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '{}'
      let parsed: { text?: unknown } = {}
      try { parsed = JSON.parse(raw) } catch { return json({ error: 'thought was not JSON', raw: raw.slice(0, 300) }, 502) }
      const draft = String(parsed.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 1600)
      if (count(draft) < 40) return json({ error: 'thought came back too short', raw: raw.slice(0, 300) }, 502)
      const out = { text: draft, words: count(draft), source: 'gemini', at: new Date().toISOString() }
      await park(path, new TextEncoder().encode(JSON.stringify(out)), 'application/json')
      return json({ ...out, cached: false })
    }

    // ---- voice: the operator's parked recordings for a date ------------------
    // The hub decodes the upload to a WAV, transcribes it in the browser and
    // parks both; this reads the transcript back (the WAV is a public URL the
    // renderer fetches itself) and `voice-clear` takes both down. There is
    // no server-side transcription here on purpose: Whisper already runs in
    // the operator's tab for the captions, and the Gemini key never has to
    // hear a person's voice to make the post.
    //
    // TWO posts a day can carry his voice: the VERSE (his reading plus his
    // thought, which replaces Gemini's outright) and the STORY's closing word
    // (a coda appended after Tabitha's telling, which replaces nothing). Same
    // shape and same transcript format — a coda is simply one whose `verse`
    // is empty — so one pair of actions serves both, keyed on kind. A day may
    // carry either, both or neither.
    // Every kind that can carry his voice has its own parked pair. The six
    // weekday readings joined the verse and the story here rather than
    // getting a path of their own — `refit`, the correction step, the caption
    // path and voice/voice-clear/upload-url are all keyed on kind already.
    const voiceKind = (k: unknown): string => (VOICED_KINDS.includes(String(k)) ? String(k) : 'verse')
    if (action === 'voice') {
      const date = String(input.date ?? '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'date must be YYYY-MM-DD' }, 400)
      const vk = voiceKind(input.kind)
      const { data: file } = await admin.storage.from(BUCKET).download(`days/${date}/voice-${vk}.json`)
      if (!file) return json({})
      return json({ ...JSON.parse(await file.text()), wavUrl: publicUrl(`days/${date}/voice-${vk}.wav`) })
    }
    if (action === 'voice-clear') {
      const date = String(input.date ?? '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'date must be YYYY-MM-DD' }, 400)
      const vk = voiceKind(input.kind)
      const { error } = await admin.storage.from(BUCKET).remove([`days/${date}/voice-${vk}.json`, `days/${date}/voice-${vk}.wav`])
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    // ---- copy: the words that go in the post ---------------------------------
    // Cached per date and kind (days/<date>/copy-<kind>.json) so the words
    // are written once and the dashboard can show today's without rendering
    // anything; `force` rewrites. A call with no date is not cached.
    if (action === 'copy') {
      const reference = String(input.reference ?? '').slice(0, 80)
      const text = String(input.text ?? '').slice(0, 1200)
      const theme = String(input.theme ?? '').slice(0, 80)
      if (!reference || !text) return json({ error: 'reference and text are required' }, 400)
      const kind = kindOf(input.kind)
      const date = String(input.date ?? '')
      const path = /^\d{4}-\d{2}-\d{2}$/.test(date) ? `days/${date}/copy-${kind}.json` : null
      if (path && !input.force && (await exists(path))) {
        const { data: file } = await admin.storage.from(BUCKET).download(path)
        if (file) return json({ ...JSON.parse(await file.text()), cached: true })
      }
      // ---- the NOTE: Facebook's one post that is not a video --------------
      //
      // Everything else here writes a CAPTION — words that sit under a video
      // and are read after it, or not at all. A note has no video under it,
      // so the words ARE the post and the shape is different in kind: longer,
      // paragraphed, and finished on its own. It gets its own prompt rather
      // than a longer `facebook` block for that reason, and it returns the
      // same block shape so `postBody` needs no special case for the words.
      //
      // The story behind the verse is what it tells, because that is the one
      // thing the video says out loud and a reader cannot skim — and it is
      // written from the SAME `paragraphs` Tabitha tells in the evening, so
      // the two never contradict each other about what happened.
      if (kind === 'note') {
        const paragraphs = Array.isArray(input.paragraphs) ? (input.paragraphs as unknown[]).slice(0, 4).map((x) => String(x).slice(0, 900)).filter(Boolean) : []
        const nd = await gemini(`models/${TEXT_MODEL}:generateContent`, {
          contents: [{ parts: [{ text:
            `You write ONE Facebook post for Verse Arcade, a Bible app. It is a photo and words — there is no video — so the words have to be worth reading on their own and worth passing on with nothing to click.\n\n` +
            `Today's verse is ${reference}: "${text}" (theme: ${theme || 'unspecified'}).\n` +
            (paragraphs.length ? `The story behind it, which you are retelling in your own words: ${paragraphs.join(' ')}\n` : '') +
            `\nShape it in three short paragraphs, blank line between each:\n` +
            `1. The situation the verse comes out of — who is speaking, to whom, and what was happening. Two or three sentences. Concrete and specific; this is the part a reader stays for.\n` +
            `2. What the verse actually says, quoted once in full with the reference after it, and one plain sentence about why it lands differently once you know where it came from.\n` +
            `3. One short closing paragraph, two sentences at most, saying plainly what this passage asks of a person now. Name something specific from THIS verse or story, so it is an ending only this post could have. Do NOT write a call to action, and do NOT ask anyone to share, follow or comment — the share line is added afterwards, and one written here replaces it with a worse one. No "we hope", no "may this", no "feel free to", and do not address the reader as an audience.\n\n` +
            `Rules. 110 to 180 words in total (the share line is appended after, and is not yours to write). Plain, warm, specific — a person telling a friend something they found, never a brand. No slogans, no urgency, no "don't miss". Invent nothing that is not in the verse or the story above. Nothing one Christian tradition would say differently from another. Never rank, compare or shame anyone. No emoji.\n` +
            `NO LINKS: no URL, no versearcade.org, no domain, no "link in bio", no "in the app", and never name the app.\n\n` +
            `Return JSON with "hook" (a 6-word line for the card, no emoji, not a question) and "facebook": { "text": the post, "tags": 2 lowercase hashtags without the # sign }.` }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.8 },
        })
        const ncands = nd.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined
        const nraw = ncands?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '{}'
        let np: Record<string, unknown> = {}
        try { np = JSON.parse(nraw) } catch { return json({ error: 'note copy was not JSON', raw: nraw.slice(0, 300) }, 502) }
        const nb = (np.facebook ?? {}) as Record<string, unknown>
        const ntext = String(nb.text ?? '').slice(0, 3000).trim()
        if (ntext.split(/\s+/).filter(Boolean).length < 60) return json({ error: 'note copy came back too short', raw: nraw.slice(0, 300) }, 502)
        const ntags = Array.isArray(nb.tags)
          ? (nb.tags as unknown[]).map((t) => String(t).replace(/^#/, '').replace(/[^a-z0-9]/gi, '').toLowerCase()).filter(Boolean).slice(0, 3)
          : []
        const fb = { title: '', text: ntext, tags: ntags }
        const nout = { hook: String(np.hook ?? '').slice(0, 80), caption: ntext, hashtags: ntags, platforms: { facebook: fb } }
        if (path) await park(path, new TextEncoder().encode(JSON.stringify(nout)), 'application/json')
        return json({ ...nout, cached: false })
      }

      const challenge = kind === 'challenge' || kind === 'challenge2'
      const question = String(input.question ?? '').slice(0, 200)
      const about = String(input.about ?? '').slice(0, 400)
      // A verse the operator recorded is described as what it is — a person
      // reading and saying one thing about it — so the caption stops
      // crediting a painted Peter with a voice that is somebody's own.
      // Same rule as `post` below: a parked recording is the ceiling, and a
      // caller that rendered the video gets the last word on whether its
      // voice is actually in there. Otherwise the words are drafted for a
      // closing that the video does not contain.
      const claimedVoice = typeof input.voiced === 'boolean' ? (input.voiced as boolean) : undefined
      const voiced = path && VOICED_KINDS.includes(kind)
        ? (await exists(`days/${date}/voice-${kind}.json`)) && claimedVoice !== false
        : false
      // What he actually SAID, for the six weekday readings.
      //
      // A reading is not about the day's verse — the moment for one date is
      // the bow in the cloud while the verse of the day is Hebrews 13:8 —
      // and a prompt handed only the verse writes a caption about a passage
      // that is not in the video. It shipped once that way: a post about
      // Genesis 9 captioned "Jesus stays the same yesterday, today and
      // forever" on all eight networks, with hashtags for the wrong
      // reference. The transcript is the only thing that knows what the post
      // is about, and it is parked before anything is rendered.
      let said = ''
      if ((READING as string[]).includes(kind)) {
        const { data: heard } = await admin.storage.from(BUCKET).download(`days/${date}/voice-${kind}.json`)
        if (heard) {
          try { said = String((JSON.parse(await heard.text()) as { text?: unknown }).text ?? '').slice(0, 2000).trim() } catch { said = '' }
        }
      }
      // The six weekday READINGS: every one is him talking to camera over a
      // painting, so the caption is written in his voice like the verse's is.
      const READING_WHO: Record<string, string> = {
        book: `the app's maker talks for thirty seconds about the BOOK today's verse comes from — how long it is, what happens in it, how it ends. `,
        moment: `the app's maker tells the story behind one painted biblical scene. `,
        before: `the app's maker says what happens immediately BEFORE today's verse and immediately after it. `,
        figure: `the app's maker gives three clues about one person in the Bible and then names them. Tease the guess, and DO NOT say who it is. `,
        quiet: `the app's maker reads today's verse slowly over one held painting, with almost no words around it. Keep the caption short and still. `,
        prayer: `the app's maker prays a short prayer aloud, drawn from today's verse. `,
      }
      const who = READING_WHO[kind] ? `${READING_WHO[kind]}Write in his voice, first person, plain. `
        : kind === 'story'
        ? `Tabitha, the app's librarian, tells the short story behind the verse of the day each evening (the morning post was the verse itself, read aloud). ${voiced ? `At the end the app's maker speaks last, in his own voice, with one plain closing word about it. ` : ''}`
        : kind === 'quiz'
          ? `a painted character plays YESTERDAY's five-question quiz about the verse against a countdown clock, and viewers play along and see the answers (the post is a replay of yesterday's verse; today's is waiting in the app). `
          : challenge
            ? `a painted character answers ONE question about YESTERDAY's verse against a twelve-second clock, and viewers are asked to comment their answer (A, B, C or D) before the reveal. The question is: "${question}". Tease it, never answer it. `
            : kind === 'own'
              ? `the app's maker speaks to camera. This clip: ${about || 'a personal word about this week\'s verses'}. Write in their voice, first person, plain. `
              : voiced
                ? `the app's maker reads the verse of the day in his own voice over a painted road, then says one plain thing about it (about a minute). Write in his voice, first person, plain. `
                : `a painted figure of Peter (Cephas) reads the verse of the day. `
      // NO CAPTION CARRIES A LINK, on any network, and the ask is the same
      // everywhere: share it with somebody. See dropLinkSentence and
      // callToAction in social.ts for why, and for where the tracked link
      // goes instead (a first comment on three networks, the bio link on the
      // other five). social.ts strips a link and appends the ask if the words
      // come back with one or without the other, so this prompt is the tone
      // rather than the guarantee.
      const shareAsk = challenge
        ? 'ends by asking people to comment their answer and then share it with someone who needs to hear it'
        : 'ends by inviting people to share it with someone who needs to hear it'
      // Pinterest is a search engine, so its words are the ones somebody would
      // type: the reference, the book, "Bible verse", the theme — in the
      // title first, because the title is what Pinterest matches on.
      const pinAsk = kind === 'story' ? 'the story behind the verse, told aloud' : 'the verse read aloud over a painting'
      const data = await gemini(`models/${TEXT_MODEL}:generateContent`, {
        contents: [{ parts: [{ text:
          `You write post copy for a faceless short-video account called Verse Arcade, a Bible app where ${who}` +
          (said
            ? `THIS post is his own recording, word for word: "${said}"\nWrite every caption about THAT — the passage and the thing he talks about in it. Today's verse of the day is ${reference}, and it is only the app's daily verse: do not write about it, do not name it, and do not tag it unless he names it himself above.\n`
            : `Today's verse is ${reference}: "${text}" (theme: ${theme || 'unspecified'}). `) +
          `The same vertical video is posted to TikTok, YouTube Shorts, Facebook and Instagram Reels, X, Snapchat, Threads and Pinterest, and each wants its own words.\n\n` +
          `Return JSON with:\n` +
          `"hook": one on-screen opening line, max 8 words, no emoji, not a question.\n` +
          `"tiktok": { "text": 1-2 short sentences, casual and warm, under 150 characters, no hashtags in it, ${shareAsk}; "tags": 5 lowercase hashtags without the # sign }.\n` +
          `"youtube": { "title": a Shorts title under 70 characters that names the verse reference and what the video is; "text": 2-4 sentences for the description, plain, ${shareAsk}; "tags": 5 lowercase hashtags without the # sign, the first one "shorts" }.\n` +
          `"facebook": { "text": 2-4 conversational sentences, a little longer and more personal than the others, no hashtags in it, ${shareAsk}; "tags": 2 lowercase hashtags without the # sign }.\n` +
          `"instagram": { "text": 2-3 short sentences with a line break between them, no hashtags in it, ${shareAsk}; "tags": 10 lowercase hashtags without the # sign, mixing broad #bible-style tags with the verse's own theme }.\n` +
          `"x": { "text": one line under 180 characters, plain and direct, no hashtags in it, ${shareAsk}; "tags": 2 lowercase hashtags without the # sign }.\n` +
          `"threads": { "text": 1-3 short conversational sentences under 300 characters, the kind of thing a person would say rather than a brand, no hashtags in it, ${shareAsk}; "tags": 2 lowercase hashtags without the # sign }.\n` +
          `"pinterest": { "title": a pin title under 90 characters that starts with the verse reference, then a few plain words of what it says, then "| Daily Bible Verse" (it is ${pinAsk}); "text": 2-3 sentences under 400 characters written for SEARCH — name the book, the reference, the words "Bible verse" and the theme naturally, say what the pin is, no hashtags in it, ${shareAsk}; "tags": 3 lowercase hashtags without the # sign, the first "bibleverse" }.\n\n` +
          `Write like a person who was struck by this verse and is telling a friend — plain, warm, specific. Not a brand, not an ad, no slogans, no "don't miss", no urgency. Each post has to make sense and be worth passing on ON ITS OWN, with nothing to click.\n` +
          `NO LINKS ANYWHERE: no URL, no versearcade.org, no domain, no "link in bio", no "in the app", and never name the app. The video says who made it.\n` +
          `Never rank, compare or shame anyone. Never claim a fact that isn't in the verse. Never give away a quiz answer. No emoji anywhere.` }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.8 },
      })
      const cands = data.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined
      const raw = cands?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '{}'
      let parsed: Record<string, unknown> = {}
      try { parsed = JSON.parse(raw) } catch { return json({ error: 'copy was not JSON', raw: raw.slice(0, 300) }, 502) }
      // Each platform's block is sanitised on its own and fails closed to an
      // empty block, so one bad key never costs the other three.
      const tagsOf = (v: unknown, n: number) => Array.isArray(v)
        ? (v as unknown[]).map((t) => String(t).replace(/^#/, '').replace(/[^a-z0-9]/gi, '').toLowerCase()).filter(Boolean).slice(0, n)
        : []
      const block = (k: string, n: number) => {
        const b = (parsed[k] ?? {}) as Record<string, unknown>
        return { title: String(b.title ?? '').slice(0, 100), text: String(b.text ?? '').slice(0, 2000), tags: tagsOf(b.tags, n) }
      }
      const platforms = { tiktok: block('tiktok', 6), youtube: block('youtube', 6), facebook: block('facebook', 3), instagram: block('instagram', 12), x: block('x', 3), threads: block('threads', 3), pinterest: block('pinterest', 4) }
      // `caption` and `hashtags` are the TikTok block under the names older
      // clients read, so a dashboard that predates the per-platform copy
      // still gets a caption.
      const out = { hook: String(parsed.hook ?? '').slice(0, 80), caption: platforms.tiktok.text, hashtags: platforms.tiktok.tags, platforms }
      if (path) await park(path, new TextEncoder().encode(JSON.stringify(out)), 'application/json')
      return json({ ...out, cached: false })
    }

    // ---- upload-url: let the browser park a finished video ------------------
    // The bucket takes writes from this function only, and a 20MB MP4 is too
    // big to route through it, so the browser gets a signed upload URL for a
    // path shaped exactly like the videos this engine makes.
    if (action === 'upload-url') {
      const path = String(input.path ?? '')
      // A video, or its cover — the first frame as a JPG, which Pinterest
      // requires beside a video pin — or one of the operator's own recordings
      // (the WAV the hub decoded it to, and its transcript), or the founder
      // photo the thought section draws.
      // The six READING kinds join both halves: they park an MP4 like any
      // other post and a recording like the verse and the story do.
      if (!/^(days\/\d{4}-\d{2}-\d{2}\/((verse|story|quiz|challenge|challenge2|own|book|moment|before|figure|quiet|prayer)(\.(mp4|webm)|-cover\.jpg)|note-card\.jpg|voice-(verse|story|book|moment|before|figure|quiet|prayer)\.(wav|json))|founder\/photo\.jpg)$/.test(path)) return json({ error: 'bad path' }, 400)
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true })
      if (error || !data) return json({ error: error?.message ?? 'no upload url' }, 500)
      return json({ path, token: data.token, publicUrl: publicUrl(path) })
    }

    // ---- post: hand a finished video to Ayrshare, one call per platform ------
    // Each platform gets ITS OWN words (the per-platform copy cached for that
    // day and kind), because one caption pasted four times reads as one caption
    // pasted four times. One request per platform is what makes that possible;
    // an idempotency key per (date, kind, platform) means a retry after a
    // network blip can't post the same video twice. Results are parked so the
    // dashboard can show what went out after a reload.
    if (action === 'post') {
      const date = String(input.date ?? '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'date must be YYYY-MM-DD' }, 400)
      const kind = kindOf(input.kind)
      const videoUrl = String(input.videoUrl ?? '')
      // A NOTE carries a still instead: it is Facebook's photo-and-text post,
      // the one thing here that is not a video. Every other kind keeps the
      // MP4-only rule, which is what stops a WebM reaching TikTok or
      // Instagram and being refused after the quota is spent.
      const wantsImage = kind === 'note'
      const okMedia = wantsImage
        ? /^https:\/\/.+\.(jpg|jpeg|png)(\?.*)?$/i.test(videoUrl)
        : /^https:\/\/.+\.(mp4|mov)(\?.*)?$/i.test(videoUrl)
      if (!okMedia) return json({ error: wantsImage ? 'a note takes an https .jpg card' : 'videoUrl must be an https .mp4 (TikTok and Instagram refuse WebM — render in Chrome)' }, 400)
      const platforms = (Array.isArray(input.platforms) ? (input.platforms as unknown[]).map(String) : [...PLATFORMS]).filter((p): p is Platform => (PLATFORMS as string[]).includes(p))
      if (!platforms.length) return json({ error: 'no platforms' }, 400)
      const scheduleDate = typeof input.scheduleDate === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(input.scheduleDate) ? input.scheduleDate : undefined
      // A deliberate second try (a network rejected the first) joins the idempotency key.
      const attempt = Number.isInteger(input.attempt) && input.attempt > 1 && input.attempt < 10 ? Number(input.attempt) : undefined
      // The video's length, when the caller knows it: Facebook Reels stop at 90s.
      const seconds = typeof input.seconds === 'number' && Number.isFinite(input.seconds) && input.seconds > 0 ? input.seconds : undefined

      const { data: file } = await admin.storage.from(BUCKET).download(`days/${date}/copy-${kind}.json`)
      if (!file) return json({ error: `no copy for ${date} ${kind} yet — open Today's words first` }, 400)
      const copy = JSON.parse(await file.text()) as DayCopy
      const reference = String(input.reference ?? '').slice(0, 80)
      // The AI note claims only the art when a voice on the post is the
      // operator's — his reading on the verse, or his closing word on the
      // story. A PARKED recording is not proof one was USED: the renderer is
      // the only thing that knows whether it reached the file. Inferring from
      // the file alone shipped "the voice you hear is mine, not synthetic."
      // on a story told entirely by Gemini, because the build that rendered
      // it had no own-voice half for the story and the wav sat in the bucket
      // regardless. A disclosure describing something that is not in the post
      // is the one thing it must never do. So the caller's answer WINS when
      // it sends one, the parked file remains the ceiling (nothing can claim
      // a voice with no recording behind it), and a caller too old to send
      // one keeps the old behaviour.
      const claimed = typeof input.voiced === 'boolean' ? (input.voiced as boolean) : undefined
      const parkedVoice = VOICED_KINDS.includes(kind) && (await exists(`days/${date}/voice-${kind}.json`))
      const voiced = parkedVoice && claimed !== false

      // A platform the account has not linked yet is skipped with a row that
      // says so, never sent: X can be in every list before the account
      // exists, and the day it is linked the next run simply reaches it.
      const u = await ayrshare('user', null, 'GET')
      const active = new Set(Array.isArray(u.activeSocialAccounts) ? (u.activeSocialAccounts as unknown[]).map(String) : [])
      // Ayrshare's name for X is still "twitter" on this endpoint.
      const linked = (p: Platform) => active.size === 0 || active.has(p) || (p === 'x' && active.has('twitter'))

      // The words per network live in social.ts, shared with the runner.
      const results: Array<Record<string, unknown>> = []
      for (const platform of platforms) {
        if (!linked(platform)) { results.push({ platform, status: 'skipped', id: null, postUrl: null, postId: null, error: 'not linked in Ayrshare', scheduleDate: null }); continue }
        if (!postsOn(platform, kind)) { results.push({ platform, status: 'skipped', id: null, postUrl: null, postId: null, error: `${kind} is not posted on ${platform} (quota)`, scheduleDate: null }); continue }
        // Pinterest refuses a VIDEO pin without a cover image; a day whose
        // cover never landed is skipped with the path it wanted, not failed.
        // A note is a photo pin and has no frame to show before play, so it
        // is exempt — requiring one would skip the pin this kind exists for.
        let cover: string | undefined
        if (platform === 'pinterest' && !wantsImage) {
          const coverPath = `days/${date}/${kind}-cover.jpg`
          if (!(await exists(coverPath))) { results.push({ platform, status: 'skipped', id: null, postUrl: null, postId: null, error: `no cover image yet (${coverPath})`, scheduleDate: null }); continue }
          cover = publicUrl(coverPath)
        }
        const r = await ayrshare('post', postBody(platform, copy, { date, kind, reference, videoUrl, scheduleDate, attempt, seconds, cover, voiced }), 'POST', platform === 'x')
        results.push(postResult(platform, r, scheduleDate))
      }
      // Merged over the earlier record, so a call for the platforms that
      // failed or were skipped last time keeps the rows that succeeded.
      const { data: priorFile } = await admin.storage.from(BUCKET).download(`days/${date}/posted-${kind}.json`)
      const prior = priorFile ? (JSON.parse(await priorFile.text()) as { results?: Array<Record<string, unknown>> }).results ?? [] : []
      const asked = new Set(platforms as string[])
      const merged = [...prior.filter((r) => !asked.has(String(r.platform))), ...results]
      // `voiced` rides in the record so a later call for the platforms that
      // failed — a different process, which rendered nothing — says the same
      // thing about the same video rather than inferring it again.
      const record = { date, kind, videoUrl, at: new Date().toISOString(), voiced, results: merged }
      await park(`days/${date}/posted-${kind}.json`, new TextEncoder().encode(JSON.stringify(record)), 'application/json')
      return json({ ...record, results })
    }

    // ---- unpost: take a SCHEDULED post back down --------------------------
    //
    // A scheduled post is not a draft — Ayrshare has already taken the video
    // and holds it against an id. So a re-render cannot reach it by replacing
    // the file in the bucket, and `post` would not replace the row either: it
    // merges by platform and would leave the day with TWO scheduled posts.
    // Taking the old one down first is the only honest way to change a post
    // that has not gone out yet.
    //
    // It deletes by the id in the day's own record, never by anything a
    // caller sends, so nothing outside this account's own posts can be
    // reached. A row Ayrshare no longer knows about is a success, not a
    // failure — the point is that it is gone. The record is re-parked with
    // the deleted rows dropped, which is what lets `post` run again cleanly.
    if (action === 'unpost') {
      const date = String(input.date ?? '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'date must be YYYY-MM-DD' }, 400)
      const kind = kindOf(input.kind)
      const only = Array.isArray(input.platforms) ? new Set((input.platforms as unknown[]).map(String)) : null
      const { data: file } = await admin.storage.from(BUCKET).download(`days/${date}/posted-${kind}.json`)
      if (!file) return json({ error: `nothing posted for ${date} ${kind}` }, 400)
      const record = JSON.parse(await file.text()) as Record<string, unknown>
      const rows = Array.isArray(record.results) ? (record.results as Array<Record<string, unknown>>) : []
      const out: Array<Record<string, unknown>> = []
      const kept: Array<Record<string, unknown>> = []
      for (const row of rows) {
        const id = typeof row.id === 'string' ? row.id : ''
        const platform = String(row.platform ?? '')
        if (!id || (only && !only.has(platform))) { kept.push(row); if (!id) out.push({ platform, status: 'skipped', error: 'no id to delete' }); continue }
        // X needs the account's own developer keys as HEADERS on a DELETE
        // exactly as it does on a POST — Ayrshare answers 419
        // `x_credentials_required` without them. `post` has sent them since
        // v18 and this did not, which is the same shape as `unpost` never
        // loading the Ayrshare key at all: the failure is PER ROW, so six
        // platforms report `deleted`, X reports `error`, and the day's record
        // keeps that one row while the summary looks like a clean sweep.
        // Found by reading the rows after a real unpost, not from a throw.
        const r = await ayrshare('post', { id }, 'DELETE', platform === 'x')
        const gone = r.status === 'success' || /not found|does not exist/i.test(String(r.message ?? r.raw ?? ''))
        const why = (r as { twitter?: { message?: unknown } }).twitter?.message ?? r.message ?? r.raw ?? r.status ?? 'unknown'
        out.push({ platform, id, status: gone ? 'deleted' : 'error', error: gone ? null : String(why) })
        if (!gone) kept.push(row)
      }
      const next = { ...record, at: new Date().toISOString(), results: kept }
      await park(`days/${date}/posted-${kind}.json`, new TextEncoder().encode(JSON.stringify(next)), 'application/json')
      return json({ date, kind, results: out })
    }

    if (action === 'posted') {
      const date = String(input.date ?? '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'date must be YYYY-MM-DD' }, 400)
      const kind = kindOf(input.kind)
      const { data: file } = await admin.storage.from(BUCKET).download(`days/${date}/posted-${kind}.json`)
      if (!file) return json({})
      return json(JSON.parse(await file.text()))
    }

    // ---- links: what became of the posts that were SCHEDULED ---------------
    //
    // Ayrshare answers a scheduled post with a status and an id and NO postUrl:
    // a network only issues one when it actually publishes. That is the normal
    // case here — the morning cron schedules all three of the day's posts at
    // their own hour — so a day's record is written hours before there is
    // anything to link to, and nothing would ever fill it in.
    //
    // This asks about each row that has an id and no URL yet, records what
    // Ayrshare says, and re-parks the record. It posts nothing, drops no row,
    // and leaves a post still pending exactly as it was for the next run to
    // ask about again. The runner calls it for yesterday every morning, which
    // is what puts a live link behind the app's "watch yesterday's verse" row —
    // src/lib/socialPosts.ts reads this same file straight out of the bucket.
    if (action === 'links') {
      const date = String(input.date ?? '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'date must be YYYY-MM-DD' }, 400)
      const kind = kindOf(input.kind)
      const { data: file } = await admin.storage.from(BUCKET).download(`days/${date}/posted-${kind}.json`)
      if (!file) return json({})
      const record = JSON.parse(await file.text()) as Record<string, unknown>
      const rows = Array.isArray(record.results) ? (record.results as Array<Record<string, unknown>>) : []
      let changed = false
      for (const row of rows) {
        const id = String(row.id ?? '')
        // An id goes into a URL path, so it has to look like one; a row that
        // already has its link, or never got an id (skipped, refused), is done.
        if (row.postUrl || !/^[A-Za-z0-9_-]{6,64}$/.test(id)) continue
        const r = await ayrshare(`post/${encodeURIComponent(id)}`, null, 'GET', String(row.platform ?? '') === 'x')
        const ids = Array.isArray(r.postIds) ? (r.postIds as Array<Record<string, unknown>>) : []
        const want = ayrshareName(String(row.platform ?? '') as Platform)
        const hit = ids.find((x) => String(x.platform ?? '') === want) ?? ids[0]
        const url = hit?.postUrl
        if (typeof url !== 'string' || !url) continue
        row.postUrl = url
        row.postId = hit?.id ?? row.postId ?? null
        if (typeof r.status === 'string' && r.status && r.status !== 'error') row.status = r.status
        changed = true
      }
      if (changed) {
        record.results = rows
        await park(`days/${date}/posted-${kind}.json`, new TextEncoder().encode(JSON.stringify(record)), 'application/json')
      }
      return json({ ...record, changed })
    }

    // ---- analytics: what a day's posts of one kind did, per network ------
    //
    // Ayrshare's per-post analytics, read for each row of a day's record
    // that has an id, normalised to the numbers every network has some name
    // for (views, likes, comments, shares, seconds watched, new followers),
    // and cached in the bucket for six hours so a dashboard reload is not a
    // round of API calls. One (date, kind) per call: a week of five kinds is
    // 35 calls from the dashboard, each well inside the gateway's limit,
    // where one call for the whole week would not be.
    //
    // These are numbers about POSTS on other people's networks, read by the
    // operator alone; nothing here reaches a player or names one.
    if (action === 'analytics') {
      const date = String(input.date ?? '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'date must be YYYY-MM-DD' }, 400)
      const kind = kindOf(input.kind)
      const cachePath = `days/${date}/analytics-${kind}.json`
      if (!input.force && (await exists(cachePath))) {
        const { data: c } = await admin.storage.from(BUCKET).download(cachePath)
        if (c) {
          const cached = JSON.parse(await c.text()) as { at?: string }
          if (cached.at && Date.now() - Date.parse(cached.at) < 6 * 3600_000) return json({ ...cached, cached: true })
        }
      }
      const { data: file } = await admin.storage.from(BUCKET).download(`days/${date}/posted-${kind}.json`)
      if (!file) return json({ date, kind, rows: [] })
      const record = JSON.parse(await file.text()) as { results?: Array<Record<string, unknown>> }
      const num = (o: Record<string, unknown>, keys: string[]): number | null => {
        for (const k of keys) { const v = o[k]; if (typeof v === 'number' && Number.isFinite(v)) return v }
        return null
      }
      const rows: Array<Record<string, unknown>> = []
      for (const r of record.results ?? []) {
        const platform = String(r.platform ?? '') as Platform
        if (!r.id || !(PLATFORMS as string[]).includes(platform)) continue
        const a = await ayrshare('analytics/post', { id: r.id, platforms: [ayrshareName(platform)] }, 'POST', platform === 'x')
        const block = (a[ayrshareName(platform)] ?? {}) as Record<string, unknown>
        const an = ((block.analytics ?? block) as Record<string, unknown>) ?? {}
        rows.push({
          platform, postUrl: r.postUrl ?? block.postUrl ?? null, status: String(r.status ?? ''),
          views: num(an, ['videoViews', 'views', 'viewsCount', 'viewCount', 'playCount', 'plays', 'impressions', 'totalVideoViews', 'video_views', 'reach', 'reachCount']),
          likes: num(an, ['likeCount', 'likes', 'likesCount', 'reactions', 'totalReactions', 'favorites']),
          comments: num(an, ['commentsCount', 'comments', 'commentCount']),
          shares: num(an, ['shareCount', 'shares', 'sharesCount']),
          watched: num(an, ['averageTimeWatched', 'averageViewDuration', 'avgTimeWatched']),
          followers: num(an, ['newFollowers', 'subscribersGained', 'followers']),
          error: a.status === 'error' ? String(a.message ?? a.raw ?? 'no analytics') : null,
        })
      }
      const out = { date, kind, at: new Date().toISOString(), rows }
      await park(cachePath, new TextEncoder().encode(JSON.stringify(out)), 'application/json')
      return json({ ...out, cached: false })
    }

    // ---- replies: answer the comments under a challenge post ----------------
    //
    // The challenges ask people to comment A, B, C or D. This reads the
    // comments on each network's copy of the post through Ayrshare, has Grok
    // draft a one-line reply to each ANSWER-shaped comment — whether they got
    // it, the right answer, the teach line — and posts it as a reply to that
    // comment. Four rules keep it a reply rather than a bot:
    //   - Only answers. A comment is screened by a cheap rule first (a lone
    //     letter, an option's words, a number), then Grok decides; anything
    //     else is left alone. It never argues, never corrects a person's
    //     opinion, never replies to a reply.
    //   - Once per person per post, once per comment ever: the record at
    //     days/<date>/replies-<kind>.json is the memory, so a re-run two hours
    //     later reaches only new comments.
    //   - Warm, plain, one sentence, no emoji, no link, and a wrong answer
    //     gets the fact rather than a verdict — the app's own teach line, in
    //     the app's own voice.
    //   - Capped per run, and everything said is parked so the operator can
    //     read every word the account has ever replied.
    // The function has no verse data, so the caller (scripts/tiktok-replies.mjs
    // or the dashboard) hands it the question, the options, the answer and
    // the teach line — from lib/tiktokChallenge.ts, the same function the
    // renderer used to pick the question.
    if (action === 'replies') {
      const date = String(input.date ?? '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'date must be YYYY-MM-DD' }, 400)
      const kind = kindOf(input.kind)
      if (kind !== 'challenge' && kind !== 'challenge2') return json({ error: 'replies are for the challenge posts' }, 400)
      const prompt = String(input.prompt ?? '').slice(0, 300)
      const options = Array.isArray(input.options) ? (input.options as unknown[]).map((o) => String(o).slice(0, 200)).slice(0, 6) : []
      const answerIndex = Number(input.answerIndex)
      const teach = String(input.teach ?? '').slice(0, 400)
      const reference = String(input.reference ?? '').slice(0, 80)
      if (!prompt || options.length < 2 || !Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length) return json({ error: 'prompt, options and answerIndex are required' }, 400)
      const dryRun = !!input.dryRun
      const max = Number.isInteger(input.max) ? Math.max(1, Math.min(40, Number(input.max))) : 20

      const { data: postedFile } = await admin.storage.from(BUCKET).download(`days/${date}/posted-${kind}.json`)
      if (!postedFile) return json({ date, kind, replies: [], added: [] })
      const posted = JSON.parse(await postedFile.text()) as { results?: Array<Record<string, unknown>> }
      const recordPath = `days/${date}/replies-${kind}.json`
      const { data: recFile } = await admin.storage.from(BUCKET).download(recordPath)
      const record = (recFile ? JSON.parse(await recFile.text()) : { date, kind, replies: [] }) as { date: string; kind: string; replies: Array<Record<string, unknown>> }
      const done = new Set(record.replies.map((r) => `${r.platform}:${r.commentId}`))
      const people = new Set(record.replies.filter((r) => r.status === 'success' || r.status === 'dry').map((r) => `${r.platform}:${String(r.username ?? '').toLowerCase()}`))

      // Does the comment look like an answer at all? Cheap, before a token
      // is spent: a lone letter A-D, a number 1-4, or a word from an option.
      const optionWords = new Set(options.flatMap((o) => o.toLowerCase().match(/[a-z]{4,}/g) ?? []))
      const looksLikeAnswer = (t: string) => {
        const s = t.toLowerCase()
        if (/(^|[^a-z])[abcd]([^a-z]|$)/i.test(t.trim()) && t.trim().length <= 40) return true
        if (/(^|\D)[1-4](\D|$)/.test(s) && s.length <= 40) return true
        return (s.match(/[a-z]{4,}/g) ?? []).some((w) => optionWords.has(w))
      }
      const letters = 'ABCD'
      const system = `You reply, as the Verse Arcade account, to comments under a short Bible quiz video. The viewer was asked ONE multiple-choice question and told to comment their answer. You will be given the question, the options lettered A-D, the right answer, and a teach line (the fact behind the answer), then one comment. Decide whether the comment is an ANSWER to the question (a letter, a number, an option's words, or a clear guess). If it is, write ONE reply of at most 180 characters: warm and plain, say whether they got it, give the right answer, and work in the teach line's fact. Never scold, never rank, never compare them to anyone, never use emoji, hashtags or links, never mention being an AI. If the comment is not an answer (a question, praise, an opinion, spam, an argument), do not reply. Return JSON: {"answer": true|false, "reply": string|null}.`
      const context = `Reference: ${reference}\nQuestion: ${prompt}\nOptions: ${options.map((o, i) => `${letters[i] ?? i + 1}) ${o}`).join(' | ')}\nRight answer: ${letters[answerIndex] ?? answerIndex + 1}) ${options[answerIndex]}\nTeach line: ${teach}`

      const added: Array<Record<string, unknown>> = []
      const skipped: Array<Record<string, unknown>> = []
      outer: for (const row of posted.results ?? []) {
        const platform = String(row.platform ?? '') as Platform
        const status = String(row.status ?? '')
        if (!row.id || status === 'error' || status === 'skipped' || !(PLATFORMS as string[]).includes(platform)) continue
        // X is deliberately NOT replied to by this action, in any mode. X's
        // automation rules say an AI reply bot needs X's prior written
        // approval, and since February 2026 its API refuses a programmatic
        // reply unless the author @mentioned or quoted the account. The
        // comments there are read and listed so the operator can answer by
        // hand; nothing is posted. Lift this only with that approval in hand.
        if (platform === 'x') {
          const c = await ayrshare(`comments/${encodeURIComponent(String(row.id))}`, null, 'GET', true)
          const list = (c.twitter ?? c.x ?? []) as Array<Record<string, unknown>>
          if (Array.isArray(list)) for (const cm of list) {
            const commentId = String(cm.commentId ?? cm.id ?? '')
            const text = String(cm.comment ?? '').trim()
            if (commentId && text && !done.has(`x:${commentId}`)) skipped.push({ platform, commentId, username: String(cm.username ?? cm.userName ?? '').trim(), comment: text.slice(0, 120), why: 'X: answered by hand (automated replies need X approval)' })
          }
          continue
        }
        const isX = platform === 'x'
        const c = await ayrshare(`comments/${encodeURIComponent(String(row.id))}`, null, 'GET', isX)
        const list = (c[ayrshareName(platform)] ?? c[platform] ?? []) as Array<Record<string, unknown>>
        if (!Array.isArray(list)) continue
        for (const cm of list) {
          const commentId = String(cm.commentId ?? cm.id ?? '')
          const text = String(cm.comment ?? '').trim()
          const from = (cm.from ?? {}) as Record<string, unknown>
          const username = String(cm.username ?? cm.userName ?? from.username ?? from.name ?? cm.name ?? cm.displayName ?? '').trim()
          if (!commentId || !text) continue
          // Never our own comments (or replies to them), never a reply thread.
          if (cm.owner === true || /verse\s?arcade/i.test(username)) continue
          if (Array.isArray((cm.referencedTweets as unknown[]) ?? null) && (cm.referencedTweets as Array<Record<string, unknown>>).some((t) => t.type === 'replied_to' && String(t.id ?? '') !== String(row.postId ?? ''))) continue
          const key = `${platform}:${commentId}`
          if (done.has(key)) continue
          if (username && people.has(`${platform}:${username.toLowerCase()}`)) continue
          if (text.length > 240 || !looksLikeAnswer(text)) { skipped.push({ platform, commentId, username, comment: text.slice(0, 120), why: 'not an answer' }); continue }
          let draft: Record<string, unknown> = {}
          try { draft = await grok(system, `${context}\n\nComment from @${username || 'someone'}: ${text}`) } catch (e) { draft = { error: String((e as Error).message ?? e) } }
          const reply = typeof draft.reply === 'string' ? draft.reply.trim().slice(0, 200) : ''
          if (draft.error) { skipped.push({ platform, commentId, username, comment: text.slice(0, 120), why: String(draft.error).slice(0, 200) }); continue }
          if (draft.answer !== true || !reply) { skipped.push({ platform, commentId, username, comment: text.slice(0, 120), why: 'grok: not an answer' }); continue }
          let out: Record<string, unknown> = { platform, commentId, username, comment: text.slice(0, 200), reply, at: new Date().toISOString(), status: 'dry', error: null }
          if (!dryRun) {
            const body: Record<string, unknown> = { platforms: [ayrshareName(platform)], comment: reply, commentId, searchPlatformId: true }
            if (platform === 'tiktok' && cm.videoId) body.videoId = String(cm.videoId)
            const r = await ayrshare(`comments/reply/${encodeURIComponent(commentId)}`, body, 'POST', isX)
            const block = (r[ayrshareName(platform)] ?? {}) as Record<string, unknown>
            const ok = r.status === 'success' && block.status !== 'error'
            out = { ...out, status: ok ? 'success' : 'error', error: ok ? null : String(block.message ?? r.message ?? r.raw ?? JSON.stringify(r).slice(0, 200)), replyId: r.commentId ?? null }
          }
          record.replies.push(out)
          added.push(out)
          done.add(key)
          if (username && (out.status === 'success' || out.status === 'dry')) people.add(`${platform}:${username.toLowerCase()}`)
          if (added.length >= max) break outer
        }
      }
      // A dry run records nothing, so the real run after it starts fresh.
      if (!dryRun && added.length) await park(recordPath, new TextEncoder().encode(JSON.stringify(record)), 'application/json')
      return json({ ...record, added, skipped, dryRun })
    }

    // ---- social: what Ayrshare has connected, and the month's count ---------
    if (action === 'social') {
      const u = await ayrshare('user', null, 'GET')
      if (u.status === 'error') return json({ error: String(u.message ?? u.raw ?? 'Ayrshare refused') }, 502)
      const names = Array.isArray(u.displayNames) ? (u.displayNames as Array<Record<string, unknown>>) : []
      return json({
        accounts: names.map((n) => ({ platform: String(n.platform ?? ''), name: String(n.displayName ?? n.username ?? '') })),
        posts: Number(u.monthlyPostCount ?? 0), quota: Number(u.monthlyPostQuota ?? 0),
      })
    }

    return json({ error: `unknown action ${action}` }, 400)
  } catch (e) {
    const msg = (e as { message?: string })?.message || String(e)
    console.error('tiktok-gen', msg)
    return json({ error: msg }, 500)
  }
})
