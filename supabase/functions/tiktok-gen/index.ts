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
//   copy        { date?, reference, text, theme, kind?, force? } → { hook, caption, hashtags[], platforms }  post copy per platform (TikTok, YouTube, Facebook, Instagram) via Gemini Flash; kind 'story' or 'quiz' changes what the post is; cached at days/<date>/copy-<kind>.json
//   story       { date, reference, text, ... }    → { title, hook, paragraphs[] }   the story behind the verse, cached at days/<date>/story.json
//   upload-url  { path }                          → { path, token, publicUrl }  a signed upload URL for a finished video (days/<date>/<kind>.mp4), so the browser can put it in the bucket
//   post        { date, kind, videoUrl, platforms[], scheduleDate? } → { results[] }  posts the video with that day's copy through Ayrshare, one call per platform (a platform not linked in Ayrshare is skipped, not failed); parked at days/<date>/posted-<kind>.json, merged over what an earlier call recorded
//   links       { date, kind }                     → the day's record          asks Ayrshare what became of each SCHEDULED post and fills in the postUrl a network only issues once it publishes
//   posted      { date, kind }                    → { results[] } | {}  what `post` recorded for that day, if anything
//   social      {}                                → { accounts[], posts, quota }  the Ayrshare profile: which networks are connected and this month's post count
//
// Secrets: GEMINI_API_KEY — as a function secret, or in Vault under the same
// name (read through `tiktok_gemini_key()`, 0097; the function secret wins if
// both exist). AYRSHARE_API_KEY the same way (`tiktok_ayrshare_key()`, 0101):
// Ayrshare is the posting service in front of TikTok, YouTube, Facebook and
// Instagram, so no platform app or token ever lives here. Optional model
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
import { PLATFORMS, ayrshareName, postBody, postResult, type DayCopy, type Platform } from './social.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// The key comes from the GEMINI_API_KEY function secret, or — when that is not
// set — from Vault through `tiktok_gemini_key()` (0097, service_role only).
// Resolved per request into this module-level slot so the helpers below stay
// simple; it is the same value every time.
let GEMINI_KEY = ''
let AYRSHARE_KEY = ''
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

async function gemini(path: string, body: unknown, method = 'POST'): Promise<Record<string, unknown>> {
  const res = await fetch(`${GEMINI}/${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${text.slice(0, 600)}`)
  return JSON.parse(text)
}

async function ayrshare(path: string, body: unknown, method = 'POST'): Promise<Record<string, unknown>> {
  const res = await fetch(`${AYRSHARE}/${path}`, {
    method,
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${AYRSHARE_KEY}` },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data: Record<string, unknown> = {}
  try { data = JSON.parse(text) } catch { data = { status: 'error', raw: text.slice(0, 400) } }
  if (!res.ok && !data.status) data.status = 'error'
  return data
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
    const peek = await req.clone().json().catch(() => ({}))
    if (['post', 'links', 'social'].includes(String(peek.action ?? ''))) {
      AYRSHARE_KEY = Deno.env.get('AYRSHARE_API_KEY') ?? ''
      if (!AYRSHARE_KEY) {
        const { data } = await admin.rpc('tiktok_ayrshare_key')
        AYRSHARE_KEY = typeof data === 'string' ? data : ''
      }
      if (!AYRSHARE_KEY) return json({ error: 'AYRSHARE_API_KEY is not configured (function secret or Vault)' }, 500)
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
      const data = await gemini(`models/${TTS_MODEL}:generateContent`, {
        contents: [{ parts: [{ text: `${lead}${text}` }] }],
        generationConfig: { responseModalities: ['AUDIO'], speechConfig },
      })
      const cands = data.candidates as Array<{ content?: { parts?: Array<{ inlineData?: { data: string; mimeType?: string } }> } }> | undefined
      const part = cands?.[0]?.content?.parts?.find((p) => p.inlineData?.data)
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
      const data = await gemini(`models/${TEXT_MODEL}:generateContent`, {
        contents: [{ parts: [{ text:
          `You write short spoken scripts for Tabitha, the librarian in the Verse Arcade Bible app. Each evening she tells the story BEHIND that day's verse to a small audience — warm, plain, unhurried, like a bedtime story for grown-ups. Never preachy, never shaming, no jokes about the listener.\n\n` +
          `Today's verse: ${reference} — "${text}"\nSpoken by: ${f('speaker', 80)}\nTo: ${f('audience', 120)}\nWhat came before: ${f('before')}\nWhat came after: ${f('after')}\nTheme: ${f('theme', 80)}\nFacts you may use: ${facts.join(' | ') || '(none)'}\n\n` +
          `Use ONLY the situation described above and the plain narrative of that Bible passage. Do not invent names, numbers, dialogue or events that are not in the passage. Do not quote the verse itself in the paragraphs — it is read aloud separately at the end.\n\n` +
          `Return JSON with: "title" (at most 6 words, no punctuation), "hook" (one on-screen opening line, at most 8 words, not a question, no emoji), and "paragraphs": exactly three strings. ` +
          `Paragraph 1: where we are and who is there (the situation before). Paragraph 2: what happens or what is said, and why the words land the way they do. Paragraph 3: what came after, then one plain sentence about why it still matters, ending with a short lead-in such as "Here's the verse." ` +
          `About 120 to 150 words in total. Simple sentences that read well aloud. No emoji, no hashtags.` }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.7 },
      })
      const cands = data.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined
      const raw = cands?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '{}'
      let parsed: { title?: unknown; hook?: unknown; paragraphs?: unknown } = {}
      try { parsed = JSON.parse(raw) } catch { return json({ error: 'story was not JSON', raw: raw.slice(0, 300) }, 502) }
      const paragraphs = Array.isArray(parsed.paragraphs) ? (parsed.paragraphs as unknown[]).map((x) => String(x).trim()).filter(Boolean).slice(0, 4) : []
      if (paragraphs.length < 2) return json({ error: 'story came back too short', raw: raw.slice(0, 300) }, 502)
      const out = { title: String(parsed.title ?? '').slice(0, 60), hook: String(parsed.hook ?? '').slice(0, 80), paragraphs }
      await park(path, new TextEncoder().encode(JSON.stringify(out)), 'application/json')
      return json({ ...out, cached: false })
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
      const kind = input.kind === 'story' ? 'story' : input.kind === 'quiz' ? 'quiz' : 'verse'
      const date = String(input.date ?? '')
      const path = /^\d{4}-\d{2}-\d{2}$/.test(date) ? `days/${date}/copy-${kind}.json` : null
      if (path && !input.force && (await exists(path))) {
        const { data: file } = await admin.storage.from(BUCKET).download(path)
        if (file) return json({ ...JSON.parse(await file.text()), cached: true })
      }
      const who = input.kind === 'story'
        ? `Tabitha, the app's librarian, tells the short story behind the verse of the day each evening (the morning post was the verse itself, read aloud). `
        : input.kind === 'quiz'
          ? `a painted character plays YESTERDAY's five-question quiz about the verse against a countdown clock, and viewers play along and see the answers (the post is a replay of yesterday's verse; today's is waiting in the app). `
          : `a painted figure of Peter (Cephas) reads the verse of the day. `
      const data = await gemini(`models/${TEXT_MODEL}:generateContent`, {
        contents: [{ parts: [{ text:
          `You write post copy for a faceless short-video account called Verse Arcade, a Bible app where ${who}` +
          `Today's verse is ${reference}: "${text}" (theme: ${theme || 'unspecified'}). The same vertical video is posted to TikTok, YouTube Shorts, Facebook and Instagram Reels, and each wants its own words.\n\n` +
          `Return JSON with:\n` +
          `"hook": one on-screen opening line, max 8 words, no emoji, not a question.\n` +
          `"tiktok": { "text": 1-2 short sentences, casual and warm, under 150 characters, no hashtags in it, ends by inviting people to play today's verse at versearcade.org; "tags": 5 lowercase hashtags without the # sign }.\n` +
          `"youtube": { "title": a Shorts title under 70 characters that names the verse reference and what the video is; "text": 2-4 sentences for the description, plain, with the line "Play today's verse: https://versearcade.org" on its own line at the end; "tags": 5 lowercase hashtags without the # sign, the first one "shorts" }.\n` +
          `"facebook": { "text": 2-4 conversational sentences, a little longer and more personal than the others, no hashtags in it, ending with the link https://versearcade.org on its own line; "tags": 2 lowercase hashtags without the # sign }.\n` +
          `"instagram": { "text": 2-3 short sentences with a line break between them, no hashtags in it, ending with "Play today's verse — link in bio."; "tags": 10 lowercase hashtags without the # sign, mixing broad #bible-style tags with the verse's own theme }.\n` +
          `"x": { "text": one line under 200 characters, plain and direct, no hashtags in it, ending with versearcade.org; "tags": 2 lowercase hashtags without the # sign }.\n\n` +
          `Never rank, compare or shame anyone. Never claim a fact that isn't in the verse. No emoji anywhere.` }] }],
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
      const platforms = { tiktok: block('tiktok', 6), youtube: block('youtube', 6), facebook: block('facebook', 3), instagram: block('instagram', 12), x: block('x', 3) }
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
      if (!/^days\/\d{4}-\d{2}-\d{2}\/(verse|story|quiz)\.(mp4|webm)$/.test(path)) return json({ error: 'bad path' }, 400)
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
      const kind = input.kind === 'story' ? 'story' : input.kind === 'quiz' ? 'quiz' : 'verse'
      const videoUrl = String(input.videoUrl ?? '')
      if (!/^https:\/\/.+\.(mp4|mov)(\?.*)?$/i.test(videoUrl)) return json({ error: 'videoUrl must be an https .mp4 (TikTok and Instagram refuse WebM — render in Chrome)' }, 400)
      const platforms = (Array.isArray(input.platforms) ? (input.platforms as unknown[]).map(String) : [...PLATFORMS]).filter((p): p is Platform => (PLATFORMS as string[]).includes(p))
      if (!platforms.length) return json({ error: 'no platforms' }, 400)
      const scheduleDate = typeof input.scheduleDate === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(input.scheduleDate) ? input.scheduleDate : undefined
      // A deliberate second try (a network rejected the first) joins the idempotency key.
      const attempt = Number.isInteger(input.attempt) && input.attempt > 1 && input.attempt < 10 ? Number(input.attempt) : undefined

      const { data: file } = await admin.storage.from(BUCKET).download(`days/${date}/copy-${kind}.json`)
      if (!file) return json({ error: `no copy for ${date} ${kind} yet — open Today's words first` }, 400)
      const copy = JSON.parse(await file.text()) as DayCopy
      const reference = String(input.reference ?? '').slice(0, 80)

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
        const r = await ayrshare('post', postBody(platform, copy, { date, kind, reference, videoUrl, scheduleDate, attempt }))
        results.push(postResult(platform, r, scheduleDate))
      }
      // Merged over the earlier record, so a call for the platforms that
      // failed or were skipped last time keeps the rows that succeeded.
      const { data: priorFile } = await admin.storage.from(BUCKET).download(`days/${date}/posted-${kind}.json`)
      const prior = priorFile ? (JSON.parse(await priorFile.text()) as { results?: Array<Record<string, unknown>> }).results ?? [] : []
      const asked = new Set(platforms as string[])
      const merged = [...prior.filter((r) => !asked.has(String(r.platform))), ...results]
      const record = { date, kind, videoUrl, at: new Date().toISOString(), results: merged }
      await park(`days/${date}/posted-${kind}.json`, new TextEncoder().encode(JSON.stringify(record)), 'application/json')
      return json({ ...record, results })
    }

    if (action === 'posted') {
      const date = String(input.date ?? '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'date must be YYYY-MM-DD' }, 400)
      const kind = input.kind === 'story' ? 'story' : input.kind === 'quiz' ? 'quiz' : 'verse'
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
      const kind = input.kind === 'story' ? 'story' : input.kind === 'quiz' ? 'quiz' : 'verse'
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
        const r = await ayrshare(`post/${encodeURIComponent(id)}`, null, 'GET')
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
