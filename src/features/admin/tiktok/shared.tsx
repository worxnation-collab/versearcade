// Admin → TikTok: what the three post generators share.
//
// One post a day, three shapes: the verse read over a road (VersePost), the
// story behind it told in the library (StoryPost), and yesterday's five
// questions played by a CPU against the clock (QuizPost). Each is its own
// screen behind a pill on the hub (TikTokPanel.tsx), because three forms on
// one page was a page nobody could find anything on.
//
// Everything here is OPERATOR-only, online-only, desktop Chrome: the Gemini
// key lives in the `tiktok-gen` Edge Function and nowhere else, and the video
// is assembled in the browser by src/lib/tiktokRender.ts, which every
// generator imports dynamically so the muxers never reach the player bundle.

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getVerseForDate } from '@/data/bible/questions'
import { VERSE_POOL } from '@/data/bible/pool'
import { pickVoice, pickCast, PICKER_VOICES, type VoiceSeed } from '@/data/tiktokVoice'
import type { Backdrop, TimedPhrase } from '@/lib/tiktokRender'

export const BUCKET = 'tiktok'
export const READERS = [
  { id: 'cephas', name: 'Peter (Cephas)' },
  { id: 'moses', name: 'Moses' },
  { id: 'esther', name: 'Esther' },
  { id: 'david', name: 'David' },
  { id: 'elijah', name: 'Elijah' },
  { id: 'mary', name: 'Mary' },
]
export const SCENES = [
  { id: 'harvest', name: 'Harvest Road' },
  { id: 'lamplight', name: 'Lamplight' },
  { id: 'advent', name: 'Advent' },
]
export const VOICES = Array.from(new Set([...PICKER_VOICES, 'Algenib', 'Sadaltager', 'Iapetus', 'Enceladus', 'Fenrir', 'Schedar', 'Kore', 'Aoede', 'Sulafat', 'Vindemiatrix', 'Achernar']))

// Story time: who tells it and where. Tabitha in her story circle by default;
// any reader figure can stand in, and the rooms are the app's own paintings.
// `hasTeller` means the painting already has the storyteller in it, so no
// figure is drawn over it. The story circle is the only one painted for this:
// Tabitha on her stool with children sitting cross-legged in front of her
// (art/tiktok-rooms.json).
export const TELLERS = [{ id: 'tabitha', name: 'Tabitha (librarian)' }, ...READERS]
export const ROOMS = [
  { id: '/tiktok/rooms/story-circle.jpg', name: 'Story circle', hasTeller: true },
  { id: '/keep/study-library.jpg', name: 'The library' },
  { id: '/room/room-2.jpg', name: 'Upper Room' },
  { id: '/room/room-4.jpg', name: 'Upper Room (finer)' },
  { id: '/keep/hall.jpg', name: 'The keep' },
  { id: '/road/lamplight.jpg', name: 'Lamplight road' },
]
export const skinPath = (id: string) => (id === 'tabitha' ? '/skins/librarian.png' : `/skins/${id}.png`)
export interface Story { title: string; hook: string; paragraphs: string[] }

// The automatic picks for a date (data/tiktokVoice.ts): the verse's book and
// speaker choose the reader and the calendar and mood choose the scene; then
// the figure decides the voice and the verse the delivery. A generator fills
// its form with them and stops the moment the operator edits a field.
export type StorySeed = VoiceSeed & { before?: string; after?: string; audience?: string; facts?: string[] }
export function seedFor(date: string): StorySeed {
  const v = getVerseForDate(date)
  const seed = VERSE_POOL.find((x) => x.reference === v.reference)
  return {
    speaker: seed?.speaker ?? 'The narrator', testament: seed?.testament ?? 'NT', theme: v.theme ?? '', text: v.text, book: v.book ?? '', chapter: v.chapter,
    before: seed?.before, after: seed?.after, audience: seed?.audience, facts: seed?.facts,
  }
}
export function autoPick(date: string, reader: string) { return pickVoice(seedFor(date), reader) }
export function autoCast(date: string) { return pickCast(seedFor(date), date) }

// Reference images for Nano Banana have to be https for the function to
// fetch them, so a dev build points at production for the app's own art.
export const ART_ORIGIN = typeof location !== 'undefined' && location.protocol === 'https:' ? location.origin : 'https://versearcade.org'

export const STILL_PROMPT = (reader: string) =>
  `Vertical 9:16 poster. The FIRST reference image is the figure — ${reader}, exactly as painted there: same face, robe, colours, props and proportions, full length head to feet. The SECOND reference image is the background scene. Paint the figure STANDING on the ground in the centre of that scene, feet planted on the road, calm, looking toward the viewer, lit by the scene's own light. Keep the top quarter and the bottom third of the picture free of detail (soft sky above, plain ground below) — words are drawn over them later. Same painterly style as the references. NO text, NO letters, NO logos, NO borders, NO frame.`
export const LOOP_PROMPT =
  'The figure stands still on the road; only the robe and hair move very softly in a slow breeze, and the light shifts slightly. The camera is locked off: no cuts, no zoom, no pan. He stays centred and keeps exactly the face, colours and clothing of the image. Slow, seamless, loopable, minimal motion. No text, no captions.'

// "Matthew 16:18" → "Matthew 16, verse 18", so the voice doesn't read a colon.
export function spokenReference(ref: string): string {
  const m = /^(.+?)\s+(\d+):(\d+)(?:[-–](\d+))?$/.exec(ref.trim())
  if (!m) return ref
  return m[4] ? `${m[1]} ${m[2]}, verses ${m[3]} to ${m[4]}` : `${m[1]} ${m[2]}, verse ${m[3]}`
}

export async function call<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase!.functions.invoke('tiktok-gen', { body: { action, ...body } })
  if (error) throw new Error((error as { message?: string }).message || String(error))
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
  return data as T
}

export function publicUrl(path: string): string {
  return supabase!.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}
// A 200 is NOT proof a file is there. The site serves index.html for any
// unknown path (the SPA fallback), so a HEAD on a bundled asset that does not
// exist comes back ok — which told the panel that every reader had a Veo loop
// and then failed to load it. Anything under the app's own origin has to be
// checked by CONTENT TYPE.
export async function existsAt(url: string, type?: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: 'HEAD', cache: 'no-store' })
    if (!r.ok) return false
    return !type || (r.headers.get('content-type') ?? '').startsWith(type)
  } catch { return false }
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return t.toISOString().slice(0, 10)
}

export type Platform = 'tiktok' | 'youtube' | 'facebook' | 'instagram'
export interface PlatformCopy { title: string; text: string; tags: string[] }
export interface Copy { hook: string; caption: string; hashtags: string[]; platforms?: Record<Platform, PlatformCopy> }
export interface Made { date: string; kind: 'verse' | 'story' | 'quiz'; reference: string; url: string; ext: string; size: number; copy: Copy | null; phrases: TimedPhrase[]; tier: string }

export type Renderer = typeof import('@/lib/tiktokRender')

// The display font, loaded only here: the app itself never fetches it, and
// the canvas needs the real face or the captions render in system-ui.
export function useDisplayFont() {
  useEffect(() => {
    if (document.getElementById('va-tiktok-font')) return
    const link = document.createElement('link')
    link.id = 'va-tiktok-font'
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@700;800&display=swap'
    document.head.appendChild(link)
  }, [])
}

// A loop lives in the bucket (made from the panel) or ships with the site
// (public/tiktok/loops, made once for the two hosts). Bucket wins.
export async function loopUrlFor(k: string): Promise<string | null> {
  if (await existsAt(publicUrl(`readers/${k}.mp4`), 'video/')) return publicUrl(`readers/${k}.mp4`) + '?v=' + Date.now()
  if (await existsAt(`/tiktok/loops/${k}.mp4`, 'video/')) return `/tiktok/loops/${k}.mp4`
  return null
}
// A tier that will not load FALLS THROUGH rather than failing the post: the
// built-in tier needs nothing generated and is always there, so there is no
// state where a missing file means no video.
export async function backdropFor(r: Renderer, tier: 'loop' | 'still' | 'builtin', rd: string, sc: string): Promise<Backdrop> {
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
// A PAINTED STILL wins over the Veo loop, which is a reversal: the loop was
// the top tier because it had real motion, and real motion is exactly what
// made the post look generated — the reader hovered. A still painting with a
// barely-there push reads as art. The loop stays above the built-in tier,
// since a loop that exists was made from the layout's own base frame.
export async function tierFor(rd: string, sc: string): Promise<'loop' | 'still' | 'builtin'> {
  const k = `${rd}-${sc}`
  if (await existsAt(publicUrl(`readers/${k}.png`), 'image/')) return 'still'
  if (await loopUrlFor(k)) return 'loop'
  return 'builtin'
}

// The room's own music under the post, rendered to fit it. A bed that fails
// to render is a post without music, never a post that failed.
export async function bedFor(seconds: number, trackId: string): Promise<Float32Array | undefined> {
  try {
    const m = await import('@/lib/tiktokMusic')
    return await m.renderBed(trackId, seconds)
  } catch { return undefined }
}

export async function fetchStory(d: string, force: boolean): Promise<Story> {
  const v = getVerseForDate(d)
  const sd = seedFor(d)
  return call<Story>('story', { date: d, force, reference: v.reference, text: v.text, theme: v.theme, speaker: sd.speaker, audience: sd.audience, before: sd.before, after: sd.after, facts: sd.facts })
}

// The words for a date's post of one kind, written once (cached in the
// bucket by date and kind) so the hub can show today's without rendering a
// video, and a render on the same day gets the same words.
export async function fetchCopy(d: string, kind: Made['kind'], force = false): Promise<Copy> {
  const v = getVerseForDate(d)
  return call<Copy>('copy', { date: d, kind, force, reference: v.reference, text: v.text, theme: v.theme })
}

// ---- the bits of form every generator draws -----------------------------------

export const TEXTAREA_STYLE = { padding: '8px', borderRadius: 10, background: 'var(--card-solid)', color: 'var(--ink)', border: '1px solid var(--stroke)', resize: 'vertical' as const, font: 'inherit', fontSize: 12 }

export function DateRow({ date, setDate, home = 'Today', homeDate, right }: { date: string; setDate: (d: string) => void; home?: string; homeDate: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value || homeDate)} style={{ width: 170 }} />
      <button className="pill" style={{ fontSize: 12 }} onClick={() => setDate(homeDate)}>{home}</button>
      <button className="pill" style={{ fontSize: 12 }} onClick={() => setDate(addDays(date, 1))}>+1 day</button>
      {right}
    </div>
  )
}

export function Busy({ busy, progress }: { busy: string | null; progress: number }) {
  if (!busy) return null
  return (
    <div>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--card)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.round(progress * 100)}%`, height: '100%', background: 'var(--gold)', transition: 'width .2s' }} />
      </div>
      <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>{busy}</div>
    </div>
  )
}

const ICON: Record<Made['kind'], string> = { verse: '☀️', story: '🌙', quiz: '🎮' }
const FILE: Record<Made['kind'], string> = { verse: 'verse-arcade-', story: 'verse-arcade-story-', quiz: 'verse-arcade-quiz-' }

const PLATFORMS: Array<[Platform, string]> = [['tiktok', 'TikTok'], ['youtube', 'YouTube Shorts'], ['facebook', 'Facebook'], ['instagram', 'Instagram Reels']]

// One platform's words, with the button that copies exactly what gets pasted
// there: the title on its own line for YouTube, the text, a blank line, the
// tags. Each platform has its own block because each wants its own length
// and its own number of hashtags, and one caption pasted four times reads
// as one caption pasted four times.
function PlatformBlock({ name, c }: { name: string; c: PlatformCopy }) {
  const tags = c.tags.map((t) => '#' + t).join(' ')
  const paste = [c.title, c.text, tags].filter(Boolean).join('\n\n')
  return (
    <div style={{ background: 'var(--card)', borderRadius: 12, padding: '8px 10px', display: 'grid', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 13 }}>{name}</b>
        <button className="pill" style={{ fontSize: 11, marginLeft: 'auto' }} onClick={() => navigator.clipboard.writeText(paste)}>📋 Copy</button>
      </div>
      {c.title && <div style={{ fontWeight: 700 }}>{c.title}</div>}
      <div style={{ whiteSpace: 'pre-wrap' }}>{c.text}</div>
      {tags && <div className="faint" style={{ fontSize: 12 }}>{tags}</div>}
    </div>
  )
}

/** The hook and the four platform blocks of one post's copy. */
export function CopyBlocks({ copy }: { copy: Copy }) {
  return (
    <div style={{ fontSize: 13, lineHeight: 1.45, display: 'grid', gap: 8 }}>
      <div><span className="faint">Hook:</span> {copy.hook}</div>
      {copy.platforms
        ? PLATFORMS.map(([id, name]) => <PlatformBlock key={id} name={name} c={copy.platforms![id]} />)
        : <PlatformBlock name="Caption" c={{ title: '', text: copy.caption, tags: copy.hashtags }} />}
    </div>
  )
}

export function MadeCard({ m }: { m: Made }) {
  const name = `${FILE[m.kind]}${m.date}.${m.ext}`
  return (
    <div className="card" style={{ marginBottom: 12, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <b style={{ fontFamily: 'var(--font-display)' }}>{ICON[m.kind]} {m.date} · {m.reference}</b>
        <span className="faint" style={{ fontSize: 11, marginLeft: 'auto' }}>{(m.size / 1e6).toFixed(1)} MB · {m.ext} · {m.tier}</span>
      </div>
      <video src={m.url} controls playsInline style={{ width: 200, borderRadius: 12, justifySelf: 'center', background: '#000' }} />
      <a href={m.url} download={name} className="pill" style={{ textAlign: 'center', fontWeight: 800 }}>⬇️ Download {name}</a>
      {m.copy && <CopyBlocks copy={m.copy} />}
    </div>
  )
}
