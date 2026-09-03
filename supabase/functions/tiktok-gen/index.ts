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
//   tts         { date, text, voice?, style? }   → { url, cached }   Gemini TTS → WAV at days/<date>/voice.wav
//   still       { key, prompt, refs[] }          → { url }           Nano Banana 9:16 poster at readers/<key>.png
//   loop-start  { imageUrl | imageBase64, prompt } → { op }          Veo image→video, returns the operation name
//   loop-status { key, op }                      → { done, url? }    polls Veo; on completion parks readers/<key>.mp4
//   copy        { reference, text, theme }       → { hook, caption, hashtags[] }   post copy via Gemini Flash
//
// Secrets: GEMINI_API_KEY — as a function secret, or in Vault under the same
// name (read through `tiktok_gemini_key()`, 0097; the function secret wins if
// both exist). Optional model overrides so a renamed
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

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// The key comes from the GEMINI_API_KEY function secret, or — when that is not
// set — from Vault through `tiktok_gemini_key()` (0097, service_role only).
// Resolved per request into this module-level slot so the helpers below stay
// simple; it is the same value every time.
let GEMINI_KEY = ''
const TTS_MODEL = Deno.env.get('GEMINI_TTS_MODEL') ?? 'gemini-2.5-flash-preview-tts'
const IMAGE_MODEL = Deno.env.get('GEMINI_IMAGE_MODEL') ?? 'gemini-3-pro-image'
const TEXT_MODEL = Deno.env.get('GEMINI_TEXT_MODEL') ?? 'gemini-3.6-flash'
const VEO_MODEL = Deno.env.get('VEO_MODEL') ?? 'veo-3.1-fast-generate-preview'

const BUCKET = 'tiktok'
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// The prebuilt Gemini voices the dashboard may ask for. Allowlisted so a
// typo comes back as a clear 400 rather than a 500 from the model.
const VOICES = new Set([
  'Charon', 'Orus', 'Fenrir', 'Enceladus', 'Algenib', 'Sadaltager', 'Iapetus', 'Schedar',
  'Kore', 'Aoede', 'Puck', 'Zephyr', 'Leda', 'Gacrux', 'Achird', 'Rasalgethi',
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

    // Verify the caller is the admin (sharkbait) — byte-for-byte the push-send gate.
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'unauthorized' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)
    const { data: prof } = await admin.from('profiles').select('username').eq('id', user.id).single()
    if (!prof || prof.username !== 'sharkbait') return json({ error: 'forbidden' }, 403)

    GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
    if (!GEMINI_KEY) {
      const { data } = await admin.rpc('tiktok_gemini_key')
      GEMINI_KEY = typeof data === 'string' ? data : ''
    }
    if (!GEMINI_KEY) return json({ error: 'GEMINI_API_KEY is not configured (function secret or Vault)' }, 500)

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
      const text = String(input.text ?? '').slice(0, 1200)
      if (!text.trim()) return json({ error: 'text is required' }, 400)
      const voice = String(input.voice ?? 'Charon')
      if (!VOICES.has(voice)) return json({ error: `unknown voice ${voice}` }, 400)
      const style = String(input.style ?? 'Read this slowly and warmly, like a fisherman reading scripture aloud to a small room. Pause at the punctuation.').slice(0, 400)
      const path = `days/${date}/voice.wav`
      if (!input.force && (await exists(path))) return json({ url: publicUrl(path), cached: true })

      const data = await gemini(`models/${TTS_MODEL}:generateContent`, {
        contents: [{ parts: [{ text: `${style}\n\n${text}` }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
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

    // ---- copy: the words that go in the post ---------------------------------
    if (action === 'copy') {
      const reference = String(input.reference ?? '').slice(0, 80)
      const text = String(input.text ?? '').slice(0, 1200)
      const theme = String(input.theme ?? '').slice(0, 80)
      if (!reference || !text) return json({ error: 'reference and text are required' }, 400)
      const data = await gemini(`models/${TEXT_MODEL}:generateContent`, {
        contents: [{ parts: [{ text:
          `You write captions for a faceless TikTok account called Verse Arcade, a Bible app where a painted figure of Peter (Cephas) reads the verse of the day. ` +
          `Today's verse is ${reference}: "${text}" (theme: ${theme || 'unspecified'}).\n\n` +
          `Return JSON with: "hook" (one on-screen opening line, max 8 words, no emoji, not a question), ` +
          `"caption" (2-3 short sentences for the post body, warm and plain, no hashtags, no emoji, ends by inviting people to play today's verse at versearcade.org), ` +
          `and "hashtags" (an array of 6 lowercase hashtags without the # sign, mixing #bible-style broad tags with the verse's own theme). ` +
          `Never rank, compare or shame anyone. Never claim a fact that isn't in the verse.` }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.8 },
      })
      const cands = data.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined
      const raw = cands?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '{}'
      let parsed: { hook?: unknown; caption?: unknown; hashtags?: unknown } = {}
      try { parsed = JSON.parse(raw) } catch { return json({ error: 'copy was not JSON', raw: raw.slice(0, 300) }, 502) }
      const tags = Array.isArray(parsed.hashtags)
        ? (parsed.hashtags as unknown[]).map((t) => String(t).replace(/^#/, '').replace(/[^a-z0-9]/gi, '').toLowerCase()).filter(Boolean).slice(0, 8)
        : []
      return json({ hook: String(parsed.hook ?? '').slice(0, 80), caption: String(parsed.caption ?? '').slice(0, 600), hashtags: tags })
    }

    return json({ error: `unknown action ${action}` }, 400)
  } catch (e) {
    const msg = (e as { message?: string })?.message || String(e)
    console.error('tiktok-gen', msg)
    return json({ error: msg }, 500)
  }
})
