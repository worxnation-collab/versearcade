// Admin → TikTok: the daily-post engine.
//
// One post a day: a painted figure (Peter/Cephas by default) standing in a
// Verse Arcade scene, reading the verse of the day, captioned. This panel is
// the whole workflow — pick a day, press one button, download the MP4 and copy
// the caption. It is an OPERATOR surface (admin-only, online-only, desktop
// Chrome) and never ships in the store build in any meaningful sense: it is
// behind the same three gates as the rest of the dashboard.
//
// The split, and why:
//  - The Gemini key lives in the `tiktok-gen` Edge Function and nowhere else.
//    It makes the reading (TTS), the reader (a Nano Banana still, optionally a
//    Veo loop) and the post copy, and parks each in the `tiktok` bucket.
//  - The VIDEO is assembled here, in the browser (src/lib/tiktokRender.ts):
//    WebCodecs + a muxer, so no server has to own ffmpeg. That module is
//    dynamically imported so nothing here weighs on the player bundle.
//  - `getVerseForDate` is deterministic, so any date can be made ahead of
//    time; "Next 7 days" queues a week.
//
// Three tiers of reader, best available wins, each generated ONCE per
// figure+scene and reused by every day after: the Veo loop (real motion), the
// Nano Banana still (Ken Burns), and — with no generation at all — the app's
// own skin PNG bobbing over a road scene. The engine works on first open with
// only the TTS secret set.

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/Button'
import { supabase } from '@/lib/supabase'
import { todayLocalDate } from '@/lib/date'
import { getVerseForDate } from '@/data/bible/questions'
import { VERSE_POOL } from '@/data/bible/pool'
import { pickVoice, pickCast, pickStoryVoice, gradeFor, secondVoiceFor, PICKER_VOICES, type VoiceSeed } from '@/data/tiktokVoice'
import type { Backdrop, TimedPhrase } from '@/lib/tiktokRender'

const BUCKET = 'tiktok'
const READERS = [
  { id: 'cephas', name: 'Peter (Cephas)' },
  { id: 'moses', name: 'Moses' },
  { id: 'esther', name: 'Esther' },
  { id: 'david', name: 'David' },
  { id: 'elijah', name: 'Elijah' },
  { id: 'mary', name: 'Mary' },
]
const SCENES = [
  { id: 'harvest', name: 'Harvest Road' },
  { id: 'lamplight', name: 'Lamplight' },
  { id: 'advent', name: 'Advent' },
]
const VOICES = Array.from(new Set([...PICKER_VOICES, 'Algenib', 'Sadaltager', 'Iapetus', 'Enceladus', 'Fenrir', 'Schedar', 'Kore', 'Aoede', 'Sulafat', 'Vindemiatrix', 'Achernar']))

// Story time: who tells it and where. Tabitha in her library by default; any
// reader figure can stand in, and the rooms are the app's own paintings.
const TELLERS = [{ id: 'tabitha', name: 'Tabitha (librarian)' }, ...READERS]
// `hasTeller` means the painting already has the storyteller in it, so no
// figure is drawn over it. The story circle is the default and the only one
// of these painted for this: Tabitha on her stool with children sitting
// cross-legged in front of her (art/tiktok-rooms.json).
const ROOMS = [
  { id: '/tiktok/rooms/story-circle.jpg', name: 'Story circle', hasTeller: true },
  { id: '/keep/study-library.jpg', name: 'The library' },
  { id: '/room/room-2.jpg', name: 'Upper Room' },
  { id: '/room/room-4.jpg', name: 'Upper Room (finer)' },
  { id: '/keep/hall.jpg', name: 'The keep' },
  { id: '/road/lamplight.jpg', name: 'Lamplight road' },
]
const skinPath = (id: string) => (id === 'tabitha' ? '/skins/librarian.png' : `/skins/${id}.png`)
interface Story { title: string; hook: string; paragraphs: string[] }

// The automatic picks for a date (data/tiktokVoice.ts): the verse's book and
// speaker choose the reader and the calendar and mood choose the scene; then
// the figure decides the voice and the verse the delivery. The panel fills the
// form with them and stops the moment the operator edits a field.
type StorySeed = VoiceSeed & { before?: string; after?: string; audience?: string; facts?: string[] }
function seedFor(date: string): StorySeed {
  const v = getVerseForDate(date)
  const seed = VERSE_POOL.find((x) => x.reference === v.reference)
  return {
    speaker: seed?.speaker ?? 'The narrator', testament: seed?.testament ?? 'NT', theme: v.theme ?? '', text: v.text, book: v.book ?? '', chapter: v.chapter,
    before: seed?.before, after: seed?.after, audience: seed?.audience, facts: seed?.facts,
  }
}
function autoPick(date: string, reader: string) { return pickVoice(seedFor(date), reader) }
function autoCast(date: string) { return pickCast(seedFor(date), date) }

// Reference images for Nano Banana have to be https for the function to
// fetch them, so a dev build points at production for the app's own art.
const ART_ORIGIN = typeof location !== 'undefined' && location.protocol === 'https:' ? location.origin : 'https://versearcade.org'

const STILL_PROMPT = (reader: string) =>
  `Vertical 9:16 poster. The FIRST reference image is the figure — ${reader}, exactly as painted there: same face, robe, colours, props and proportions, full length head to feet. The SECOND reference image is the background scene. Paint the figure floating a hand's height above the ground in the centre of that scene, calm, looking toward the viewer, lit softly from below by a warm gold glow. Keep the top quarter and the bottom third of the picture free of detail (soft sky above, plain ground below) — words are drawn over them later. Same painterly style as the references. NO text, NO letters, NO logos, NO borders, NO frame.`
const LOOP_PROMPT =
  'The figure floats gently up and down in place, robe and hair moving softly in a slow breeze, the warm glow beneath him slowly breathing. The camera is locked off: no cuts, no zoom, no pan. He stays centred and keeps exactly the face, colours and clothing of the image. Slow, seamless, loopable motion. No text, no captions.'

// "Matthew 16:18" → "Matthew 16, verse 18", so the voice doesn't read a colon.
function spokenReference(ref: string): string {
  const m = /^(.+?)\s+(\d+):(\d+)(?:[-–](\d+))?$/.exec(ref.trim())
  if (!m) return ref
  return m[4] ? `${m[1]} ${m[2]}, verses ${m[3]} to ${m[4]}` : `${m[1]} ${m[2]}, verse ${m[3]}`
}

async function call<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase!.functions.invoke('tiktok-gen', { body: { action, ...body } })
  if (error) throw new Error((error as { message?: string }).message || String(error))
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
  return data as T
}

function publicUrl(path: string): string {
  return supabase!.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}
// A 200 is NOT proof a file is there. The site serves index.html for any
// unknown path (the SPA fallback), so a HEAD on a bundled asset that does not
// exist comes back ok — which told the panel that every reader had a Veo loop
// and then failed to load it. Anything under the app's own origin has to be
// checked by CONTENT TYPE.
async function existsAt(url: string, type?: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: 'HEAD', cache: 'no-store' })
    if (!r.ok) return false
    return !type || (r.headers.get('content-type') ?? '').startsWith(type)
  } catch { return false }
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return t.toISOString().slice(0, 10)
}

interface Copy { hook: string; caption: string; hashtags: string[] }
interface Made { date: string; kind: 'verse' | 'story'; reference: string; url: string; ext: string; size: number; copy: Copy | null; phrases: TimedPhrase[]; tier: string }

export default function TikTokPanel() {
  const [date, setDate] = useState(todayLocalDate())
  const [mode, setMode] = useState<'verse' | 'story'>('verse')
  const [teller, setTeller] = useState('tabitha')
  const [room, setRoom] = useState(ROOMS[0].id)
  const [storyCastAuto, setStoryCastAuto] = useState(true)
  const [story, setStory] = useState<Story | null>(null)
  const [storyPoster, setStoryPoster] = useState<string | null>(null)
  const [reader, setReader] = useState(() => autoCast(todayLocalDate()).reader)
  const [scene, setScene] = useState(() => autoCast(todayLocalDate()).scene)
  const [castAuto, setCastAuto] = useState(true)
  const [voice, setVoice] = useState(() => autoPick(todayLocalDate(), autoCast(todayLocalDate()).reader).voice)
  const [style, setStyle] = useState(() => autoPick(todayLocalDate(), autoCast(todayLocalDate()).reader).style)
  const [voiceAuto, setVoiceAuto] = useState(true)
  const [withCopy, setWithCopy] = useState(true)
  const [withMusic, setWithMusic] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [made, setMade] = useState<Made[]>([])
  const [assets, setAssets] = useState<{ still: boolean; loop: boolean }>({ still: false, loop: false })
  const [poster, setPoster] = useState<string | null>(null)
  const [loopOp, setLoopOp] = useState<string | null>(null)
  const cancel = useRef(false)

  const verse = getVerseForDate(date)
  const cast = autoCast(date)
  useEffect(() => {
    if (!castAuto) return
    setReader(cast.reader)
    setScene(cast.scene)
  }, [castAuto, cast.reader, cast.scene])
  const key = `${reader}-${scene}`
  const pick = mode === 'story' ? pickStoryVoice(seedFor(date), teller) : autoPick(date, reader)
  useEffect(() => {
    if (!voiceAuto) return
    setVoice(pick.voice)
    setStyle(pick.style)
  }, [voiceAuto, pick.voice, pick.style])
  useEffect(() => {
    if (!storyCastAuto) return
    setTeller('tabitha')
    setRoom(ROOMS[0].id)
  }, [storyCastAuto, date])

  // Story mode: fetch (or reuse) the day's story and draw a poster of it.
  useEffect(() => {
    if (mode !== 'story') return
    let live = true
    setStory(null); setStoryPoster(null)
    ;(async () => {
      try {
        const st = await fetchStory(date, false)
        if (!live) return
        setStory(st)
        setStoryPoster(await storyPosterFor(date, st))
      } catch (e) { if (live) setErr(String((e as Error).message || e)) }
    })()
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, date, teller, room])
  const stillUrl = publicUrl(`readers/${key}.png`)
  const loopUrl = publicUrl(`readers/${key}.mp4`)

  // The display font, loaded only here: the app itself never fetches it, and
  // the canvas needs the real face or the captions render in system-ui.
  useEffect(() => {
    if (document.getElementById('va-tiktok-font')) return
    const link = document.createElement('link')
    link.id = 'va-tiktok-font'
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@700;800&display=swap'
    document.head.appendChild(link)
  }, [])

  // Which reader tier exists for this figure+scene, and a poster preview.
  useEffect(() => {
    let live = true
    setAssets({ still: false, loop: false })
    setPoster(null)
    ;(async () => {
      const [still, loop] = await Promise.all([existsAt(stillUrl, 'image/'), loopUrlFor(key).then((u) => !!u)])
      if (!live) return
      setAssets({ still, loop })
      try {
        const r = await import('@/lib/tiktokRender')
        const bd = await backdropFor(r, loop ? 'loop' : still ? 'still' : 'builtin')
        const url = await r.renderPoster({ reference: verse.reference, text: verse.text, backdrop: bd })
        if (live) setPoster(url)
      } catch (e) { if (live) setErr(String((e as Error).message || e)) }
    })()
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, verse.reference])

  // A loop lives in the bucket (made from the panel) or ships with the site
  // (public/tiktok/loops, made once for the two hosts). Bucket wins.
  async function loopUrlFor(k: string): Promise<string | null> {
    if (await existsAt(publicUrl(`readers/${k}.mp4`), 'video/')) return publicUrl(`readers/${k}.mp4`) + '?v=' + Date.now()
    if (await existsAt(`/tiktok/loops/${k}.mp4`, 'video/')) return `/tiktok/loops/${k}.mp4`
    return null
  }
  // A tier that will not load FALLS THROUGH rather than failing the post: the
  // built-in tier needs nothing generated and is always there, so there is no
  // state where a missing file means no video.
  async function backdropFor(r: typeof import('@/lib/tiktokRender'), tier: 'loop' | 'still' | 'builtin', rd = reader, sc = scene): Promise<Backdrop> {
    const k = `${rd}-${sc}`
    if (tier === 'loop') {
      const url = await loopUrlFor(k)
      if (url) { try { return { kind: 'loop', video: await r.loadVideo(url) } } catch { /* try the still */ } }
      tier = 'still'
    }
    if (tier === 'still') {
      try { return { kind: 'still', image: await r.loadImage(publicUrl(`readers/${k}.png`) + '?v=' + Date.now()) } } catch { /* the built-in tier always works */ }
    }
    const [sceneImg, figure] = await Promise.all([r.loadImage(`/road/${sc}.jpg`), r.loadImage(`/skins/${rd}.png`)])
    return { kind: 'builtin', scene: sceneImg, figure }
  }
  // Best tier that exists for a figure+scene — probed per day, since a batch
  // with an automatic cast changes reader from one day to the next.
  // A PAINTED STILL now wins over the Veo loop, which is a reversal: the loop
  // was the top tier because it had real motion, and real motion is exactly
  // what made the post look generated — the reader hovered. A still painting
  // with a barely-there push reads as art. The loop stays above the built-in
  // tier, since a loop that exists was made from the layout's own base frame.
  async function tierFor(rd: string, sc: string): Promise<'loop' | 'still' | 'builtin'> {
    const k = `${rd}-${sc}`
    if (await existsAt(publicUrl(`readers/${k}.png`), 'image/')) return 'still'
    if (await loopUrlFor(k)) return 'loop'
    return 'builtin'
  }

  // The room's own music under the reading, rendered to fit the post.
  async function bedFor(r: typeof import('@/lib/tiktokRender'), audio: ArrayBuffer, hook: string | undefined, story: boolean, trackId: string): Promise<Float32Array | undefined> {
    if (!withMusic) return undefined
    try {
      const m = await import('@/lib/tiktokMusic')
      return await m.renderBed(trackId, await r.plannedDuration(audio, hook, story))
    } catch { return undefined }
  }
  async function fetchStory(d: string, force: boolean): Promise<Story> {
    const v = getVerseForDate(d)
    const sd = seedFor(d)
    return call<Story>('story', { date: d, force, reference: v.reference, text: v.text, theme: v.theme, speaker: sd.speaker, audience: sd.audience, before: sd.before, after: sd.after, facts: sd.facts })
  }
  async function storyAssets(tellerId = teller, roomPath = room) {
    const r = await import('@/lib/tiktokRender')
    // The story circle already has Tabitha in it; any other room draws the
    // teller's own render over the painting.
    const hasTeller = !!ROOMS.find((x) => x.id === roomPath)?.hasTeller
    const tellerImg = hasTeller ? undefined : await r.loadImage(skinPath(tellerId))
    const roomImg = await r.loadImage(roomPath).catch(() => r.loadImage('/keep/study-library.jpg'))
    return { r, roomImg, tellerImg }
  }
  async function storyPosterFor(d: string, st: Story): Promise<string> {
    const { r, roomImg, tellerImg } = await storyAssets()
    const v = getVerseForDate(d)
    return r.renderStoryPoster({ title: st.title, reference: v.reference, verseText: v.text, paragraphs: [...st.paragraphs, v.text], hook: st.hook, room: roomImg, teller: tellerImg })
  }

  // The evening job for one date: story → voice → copy → render.
  async function makeStory(d: string): Promise<Made> {
    const v = getVerseForDate(d)
    const sd = seedFor(d)
    setBusy(`${d}: writing the story`)
    setProgress(0)
    const st = d === date && story ? story : await fetchStory(d, false)
    const tellerId = storyCastAuto ? 'tabitha' : teller
    const roomPath = storyCastAuto ? ROOMS[0].id : room
    const p = voiceAuto ? pickStoryVoice(sd, tellerId) : { voice, style }
    const second = voiceAuto ? secondVoiceFor(sd) : null
    const tellerName = TELLERS.find((x) => x.id === tellerId)?.name.split(' ')[0] ?? 'Teller'
    const spoken = second
      ? [...st.paragraphs.map((pg) => `${tellerName}: ${pg}`), `${second.name}: ${v.text.trim()}`, `${tellerName}: ${spokenReference(v.reference)}.`].join('\n\n')
      : [...st.paragraphs, `${v.text.trim()} ${spokenReference(v.reference)}.`].join('\n\n')
    setBusy(`${d}: asking for the telling`)
    const tts = await call<{ url: string; cached: boolean }>('tts', {
      date: d, text: spoken, voice: p.voice, style: p.style,
      speakers: second ? [{ name: tellerName, voice: p.voice }, { name: second.name, voice: second.voice }] : undefined,
    })
    const audio = await (await fetch(tts.url + '?v=' + Date.now())).arrayBuffer()
    let copy: Copy | null = null
    if (withCopy) {
      setBusy(`${d}: writing the caption`)
      try { copy = await call<Copy>('copy', { reference: v.reference, text: v.text, theme: v.theme, kind: 'story' }) } catch { copy = null }
    }
    setBusy(`${d}: rendering`)
    const { r, roomImg, tellerImg } = await storyAssets(tellerId, roomPath)
    const paragraphs = [...st.paragraphs, `${v.text.trim()} ${v.reference}.`]
    const bed = await bedFor(r, audio, st.hook || copy?.hook, true, 'cloister')
    const out = await r.renderStory({
      title: st.title, reference: v.reference, verseText: v.text,
      paragraphs, hook: st.hook || copy?.hook, audio, room: roomImg, teller: tellerImg, bed,
      onProgress: (f, label) => { setProgress(f); setBusy(`${d}: ${label}`) },
    })
    return { date: d, kind: 'story', reference: v.reference, url: URL.createObjectURL(out.blob), ext: out.ext, size: out.blob.size, copy, phrases: out.phrases, tier: `${TELLERS.find((x) => x.id === tellerId)?.name ?? tellerId} · story` }
  }

  // The whole daily job for one date: voice → copy → render.
  async function makeOne(d: string, tierOverride?: 'loop' | 'still' | 'builtin'): Promise<Made> {
    const v = getVerseForDate(d)
    setBusy(`${d}: asking for the reading`)
    setProgress(0)
    // A batch reads each day in its own voice when the pick is automatic;
    // an operator's override applies to every day in the batch.
    const c = castAuto ? autoCast(d) : { reader, scene }
    const p = voiceAuto ? autoPick(d, c.reader) : { voice, style }
    const sd = seedFor(d)
    // The words of God or Jesus are read by a second voice; the reader
    // says the reference. Anyone else's verse is one voice as before.
    const second = voiceAuto ? secondVoiceFor(sd) : null
    const readerName = READERS.find((x) => x.id === c.reader)?.name.split(' ')[0] ?? 'Reader'
    const spoken = second
      ? `${second.name}: ${v.text.trim()}\n${readerName}: ${spokenReference(v.reference)}.`
      : `${v.text.trim()} ${spokenReference(v.reference)}.`
    const tts = await call<{ url: string; cached: boolean }>('tts', {
      date: d, text: spoken, voice: p.voice, style: p.style,
      speakers: second ? [{ name: second.name, voice: second.voice }, { name: readerName, voice: p.voice }] : undefined,
    })
    const audio = await (await fetch(tts.url + '?v=' + Date.now())).arrayBuffer()

    let copy: Copy | null = null
    if (withCopy) {
      setBusy(`${d}: writing the caption`)
      try { copy = await call<Copy>('copy', { reference: v.reference, text: v.text, theme: v.theme }) } catch { copy = null }
    }

    setBusy(`${d}: rendering`)
    const r = await import('@/lib/tiktokRender')
    const tier = tierOverride ?? (await tierFor(c.reader, c.scene))
    const backdrop = await backdropFor(r, tier, c.reader, c.scene)
    const bed = await bedFor(r, audio, copy?.hook, false, 'morning')
    const out = await r.renderTikTok({
      reference: v.reference, text: v.text, hook: copy?.hook, audio, backdrop, bed,
      grade: castAuto ? gradeFor(sd) : undefined,
      onProgress: (f, label) => { setProgress(f); setBusy(`${d}: ${label}`) },
    })
    return { date: d, kind: 'verse', reference: v.reference, url: URL.createObjectURL(out.blob), ext: out.ext, size: out.blob.size, copy, phrases: out.phrases, tier: `${c.reader} · ${c.scene} · ${tier}` }
  }

  const run = async (dates: string[]) => {
    if (busy) return
    cancel.current = false
    setErr(null)
    try {
      for (const d of dates) {
        if (cancel.current) break
        const m = mode === 'story' ? await makeStory(d) : await makeOne(d)
        setMade((xs) => [m, ...xs.filter((x) => !(x.date === d && x.kind === m.kind))])
      }
    } catch (e) {
      setErr(String((e as Error).message || e))
    } finally {
      setBusy(null)
    }
  }

  const paintStill = async () => {
    if (busy) return
    setErr(null); setBusy('painting the still (Nano Banana)')
    try {
      const name = READERS.find((x) => x.id === reader)?.name ?? reader
      await call('still', {
        key, prompt: STILL_PROMPT(name), force: true,
        refs: [`${ART_ORIGIN}/skins/${reader}.png`, `${ART_ORIGIN}/road/${scene}.jpg`],
      })
      setAssets((a) => ({ ...a, still: true }))
      const r = await import('@/lib/tiktokRender')
      setPoster(await r.renderPoster({ reference: verse.reference, text: verse.text, backdrop: await backdropFor(r, 'still') }))
    } catch (e) { setErr(String((e as Error).message || e)) } finally { setBusy(null) }
  }

  const animate = async () => {
    if (busy) return
    setErr(null); setBusy('starting Veo')
    try {
      // Veo animates the still if there is one; otherwise the app's own
      // composed poster (no text on it) so the step never needs Nano Banana first.
      const body: Record<string, unknown> = { prompt: LOOP_PROMPT }
      if (assets.still) body.imageUrl = stillUrl
      else {
        const r = await import('@/lib/tiktokRender')
        body.imageBase64 = await r.renderPoster({ reference: verse.reference, text: verse.text, backdrop: await backdropFor(r, 'builtin') }, 0.6, false)
      }
      const { op } = await call<{ op: string }>('loop-start', body)
      setLoopOp(op)
      setBusy('Veo is rendering (1–3 min)')
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 8000))
        const s = await call<{ done: boolean; url?: string; error?: string }>('loop-status', { key, op })
        if (!s.done) continue
        if (s.error) throw new Error(s.error)
        setAssets((a) => ({ ...a, loop: true }))
        setLoopOp(null)
        return
      }
      throw new Error('Veo did not finish in time — press Animate again to keep polling.')
    } catch (e) { setErr(String((e as Error).message || e)) } finally { setBusy(null) }
  }

  const tierLabel = assets.loop ? 'Veo loop' : assets.still ? 'painted still' : 'built-in (skin over road)'

  return (
    <div>
      <p className="faint" style={{ fontSize: 12, marginBottom: 10, lineHeight: 1.4 }}>
        One post a day: {READERS.find((x) => x.id === reader)?.name} reads the verse over a Verse Arcade scene, captioned, 1080×1920.
        Needs <code>GEMINI_API_KEY</code> set in Supabase and the <code>tiktok-gen</code> function deployed. Use desktop Chrome — the video is encoded in this tab.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {(['verse', 'story'] as const).map((m) => (
          <button key={m} className="pill" onClick={() => setMode(m)}
            style={{ background: mode === m ? 'var(--grape)' : 'var(--card)', fontWeight: 800 }}>
            {m === 'verse' ? '☀️ Verse reading' : '🌙 Story time'}
          </button>
        ))}
      </div>

      {/* ---- story time ---- */}
      {mode === 'story' && (
        <div className="card" style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value || todayLocalDate())} style={{ width: 170 }} />
            <button className="pill" style={{ fontSize: 12 }} onClick={() => setDate(todayLocalDate())}>Today</button>
            <button className="pill" style={{ fontSize: 12 }} onClick={() => setDate(addDays(date, 1))}>+1 day</button>
          </div>
          <div>
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>{verse.reference}</b>
            <p className="faint" style={{ fontSize: 13, lineHeight: 1.45, marginTop: 4 }}>{verse.text}</p>
          </div>
          {story ? (
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <b style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>{story.title}</b>
                <span className="faint" style={{ fontSize: 11 }}>· {story.hook}</span>
                <button className="pill" style={{ fontSize: 11, marginLeft: 'auto' }} disabled={!!busy}
                  onClick={async () => { setErr(null); setBusy('rewriting the story'); try { const st = await fetchStory(date, true); setStory(st); setStoryPoster(await storyPosterFor(date, st)) } catch (e) { setErr(String((e as Error).message || e)) } finally { setBusy(null) } }}>
                  ↻ Rewrite
                </button>
              </div>
              {story.paragraphs.map((pg, i) => <p key={i} style={{ marginTop: 6 }}>{pg}</p>)}
            </div>
          ) : <p className="faint" style={{ fontSize: 12 }}>Writing tonight’s story…</p>}
          {storyPoster && <img src={storyPoster} alt="" style={{ width: 180, borderRadius: 12, justifySelf: 'center' }} />}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <select value={teller} onChange={(e) => { setStoryCastAuto(false); setTeller(e.target.value) }}>{TELLERS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <select value={room} onChange={(e) => { setStoryCastAuto(false); setRoom(e.target.value) }}>{ROOMS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          </div>
          <div className="faint" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{storyCastAuto ? 'Picked: Tabitha · Story circle — the words light up as she says them' : `Yours: ${TELLERS.find((x) => x.id === teller)?.name} · ${ROOMS.find((x) => x.id === room)?.name}`}</span>
            {!storyCastAuto && <button className="pill" style={{ fontSize: 11, marginLeft: 'auto' }} onClick={() => setStoryCastAuto(true)}>↺ Auto</button>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label className="faint" style={{ fontSize: 11 }}>Voice {voiceAuto ? '· auto' : '· yours'}
              <select value={voice} onChange={(e) => { setVoiceAuto(false); setVoice(e.target.value) }} style={{ width: '100%', marginTop: 4 }}>
                {VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label className="faint" style={{ fontSize: 11, display: 'flex', alignItems: 'end', gap: 6, paddingBottom: 6 }}>
              <input type="checkbox" checked={withCopy} onChange={(e) => setWithCopy(e.target.checked)} /> caption too
            </label>
            <label className="faint" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={withMusic} onChange={(e) => setWithMusic(e.target.checked)} /> the library’s music underneath
            </label>
          </div>
          <div className="faint" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Picked: {pick.why}</span>
            {!voiceAuto && <button className="pill" style={{ fontSize: 11, marginLeft: 'auto' }} onClick={() => setVoiceAuto(true)}>↺ Auto</button>}
          </div>
          <textarea value={style} onChange={(e) => { setVoiceAuto(false); setStyle(e.target.value.slice(0, 400)) }} rows={3}
            style={{ padding: '8px', borderRadius: 10, background: 'var(--card-solid)', color: 'var(--ink)', border: '1px solid var(--stroke)', resize: 'vertical', font: 'inherit', fontSize: 12 }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="gold" disabled={!!busy || !story} onClick={() => run([date])}>{busy ? 'Working…' : '🌙 Make tonight’s story'}</Button>
            <button className="pill" disabled={!!busy} onClick={() => run(Array.from({ length: 7 }, (_, i) => addDays(date, i)))}>Next 7 nights</button>
            {busy && <button className="pill" onClick={() => { cancel.current = true }}>Stop after this one</button>}
          </div>
          {busy && (
            <div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--card)', overflow: 'hidden' }}>
                <div style={{ width: `${Math.round(progress * 100)}%`, height: '100%', background: 'var(--gold)', transition: 'width .2s' }} />
              </div>
              <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>{busy}</div>
            </div>
          )}
          {err && <p style={{ color: 'var(--coral)', fontSize: 13 }}>{err}</p>}
        </div>
      )}

      {/* ---- the day ---- */}
      {mode === 'verse' && (
      <div className="card" style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value || todayLocalDate())} style={{ width: 170 }} />
          <button className="pill" style={{ fontSize: 12 }} onClick={() => setDate(todayLocalDate())}>Today</button>
          <button className="pill" style={{ fontSize: 12 }} onClick={() => setDate(addDays(date, 1))}>+1 day</button>
          <span className="faint" style={{ fontSize: 11, marginLeft: 'auto' }}>reader: {tierLabel}</span>
        </div>
        <div>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>{verse.reference}</b>
          <p style={{ fontSize: 14, lineHeight: 1.45, marginTop: 4 }}>{verse.text}</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label className="faint" style={{ fontSize: 11 }}>Voice {voiceAuto ? '· auto' : '· yours'}
            <select value={voice} onChange={(e) => { setVoiceAuto(false); setVoice(e.target.value) }} style={{ width: '100%', marginTop: 4 }}>
              {VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="faint" style={{ fontSize: 11, display: 'flex', alignItems: 'end', gap: 6, paddingBottom: 6 }}>
            <input type="checkbox" checked={withCopy} onChange={(e) => setWithCopy(e.target.checked)} /> write the caption + hook too
          </label>
          <label className="faint" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={withMusic} onChange={(e) => setWithMusic(e.target.checked)} /> the road’s music underneath
          </label>
        </div>
        <div className="faint" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Picked: {pick.why}</span>
          {!voiceAuto && <button className="pill" style={{ fontSize: 11, marginLeft: 'auto' }} onClick={() => setVoiceAuto(true)}>↺ Auto</button>}
        </div>
        <textarea value={style} onChange={(e) => { setVoiceAuto(false); setStyle(e.target.value.slice(0, 400)) }} rows={3}
          style={{ padding: '8px', borderRadius: 10, background: 'var(--card-solid)', color: 'var(--ink)', border: '1px solid var(--stroke)', resize: 'vertical', font: 'inherit', fontSize: 12 }} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="gold" disabled={!!busy} onClick={() => run([date])}>{busy ? 'Working…' : '🎬 Make this day’s post'}</Button>
          <button className="pill" disabled={!!busy} onClick={() => run(Array.from({ length: 7 }, (_, i) => addDays(date, i)))}>Next 7 days</button>
          {busy && <button className="pill" onClick={() => { cancel.current = true }}>Stop after this one</button>}
        </div>
        {busy && (
          <div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--card)', overflow: 'hidden' }}>
              <div style={{ width: `${Math.round(progress * 100)}%`, height: '100%', background: 'var(--gold)', transition: 'width .2s' }} />
            </div>
            <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>{busy}</div>
          </div>
        )}
        {err && <p style={{ color: 'var(--coral)', fontSize: 13 }}>{err}</p>}
      </div>
      )}

      {/* ---- what got made ---- */}
      {made.map((m) => (
        <div key={`${m.kind}-${m.date}`} className="card" style={{ marginBottom: 12, display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <b style={{ fontFamily: 'var(--font-display)' }}>{m.kind === 'story' ? '🌙' : '☀️'} {m.date} · {m.reference}</b>
            <span className="faint" style={{ fontSize: 11, marginLeft: 'auto' }}>{(m.size / 1e6).toFixed(1)} MB · {m.ext} · {m.tier}</span>
          </div>
          <video src={m.url} controls playsInline style={{ width: 200, borderRadius: 12, justifySelf: 'center', background: '#000' }} />
          <a href={m.url} download={`verse-arcade-${m.kind === 'story' ? 'story-' : ''}${m.date}.${m.ext}`} className="pill" style={{ textAlign: 'center', fontWeight: 800 }}>⬇️ Download verse-arcade-{m.kind === 'story' ? 'story-' : ''}{m.date}.{m.ext}</a>
          {m.copy && (
            <div style={{ fontSize: 13, lineHeight: 1.45 }}>
              <div><span className="faint">Hook:</span> {m.copy.hook}</div>
              <div style={{ marginTop: 4 }}>{m.copy.caption}</div>
              <div className="faint" style={{ marginTop: 4 }}>{m.copy.hashtags.map((t) => '#' + t).join(' ')}</div>
              <button className="pill" style={{ marginTop: 6, fontSize: 12 }}
                onClick={() => navigator.clipboard.writeText(`${m.copy!.caption}\n\n${m.copy!.hashtags.map((t) => '#' + t).join(' ')}`)}>
                📋 Copy caption + tags
              </button>
            </div>
          )}
        </div>
      ))}

      {mode === 'verse' && (<>
      {/* ---- the reader ---- */}
      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <b style={{ fontFamily: 'var(--font-display)' }}>The reader</b>
        <p className="faint" style={{ fontSize: 12, lineHeight: 1.4 }}>
          Generated once per figure and scene, then reused every day. The still is Nano Banana; the loop is Veo and takes a few minutes.
          Without either, the app’s own skin bobs over the road — the post still works.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <select value={reader} onChange={(e) => { setCastAuto(false); setReader(e.target.value) }}>{READERS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
          <select value={scene} onChange={(e) => { setCastAuto(false); setScene(e.target.value) }}>{SCENES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </div>
        <div className="faint" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{castAuto ? 'Picked' : 'Yours'}: {castAuto ? cast.why : `${READERS.find((x) => x.id === reader)?.name} · ${SCENES.find((x) => x.id === scene)?.name}`}</span>
          {!castAuto && <button className="pill" style={{ fontSize: 11, marginLeft: 'auto' }} onClick={() => setCastAuto(true)}>↺ Auto</button>}
        </div>
        {poster && <img src={poster} alt="" style={{ width: 180, borderRadius: 12, justifySelf: 'center' }} />}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="pill" disabled={!!busy} onClick={paintStill}>{assets.still ? '🎨 Repaint the still' : '🎨 Paint the still'}</button>
          <button className="pill" disabled={!!busy} onClick={animate}>{assets.loop ? '🎞️ Re-animate (Veo)' : '🎞️ Animate (Veo)'}</button>
          {loopOp && <span className="faint" style={{ fontSize: 11 }}>polling…</span>}
          <span className="faint" style={{ fontSize: 11, marginLeft: 'auto' }}>
            still {assets.still ? '✓' : '—'} · loop {assets.loop ? '✓' : '—'}
          </span>
        </div>
        {assets.still && <a className="faint" style={{ fontSize: 11 }} href={stillUrl} target="_blank" rel="noreferrer">open still ↗</a>}
        {assets.loop && <a className="faint" style={{ fontSize: 11 }} href={loopUrl} target="_blank" rel="noreferrer">open loop ↗</a>}
      </div>
      </>)}
    </div>
  )
}
