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

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { addDays } from '@/lib/date'
import { getVerseForDate } from '@/data/bible/questions'
import { VERSE_POOL } from '@/data/bible/pool'
import { pickVoice, pickCast, pickCastRotated, PICKER_VOICES, SCENE_NAMES, VERSE_SCENES, READER_ORDER, type VoiceSeed, type CastPick } from '@/data/tiktokVoice'
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
// The three road paintings the app itself walks on, plus the portrait
// scenes painted for these posts alone (public/tiktok/roads, art/tiktok-scenes.json).
export const SCENES = [...VERSE_SCENES, 'advent'].map((id) => ({ id, name: SCENE_NAMES[id] ?? id }))
const ROAD_IDS = ['harvest', 'lamplight', 'advent']
/** Where a scene's painting lives: the app's own roads, or the TikTok-only folder. */
export const scenePath = (id: string) => (ROAD_IDS.includes(id) ? `/road/${id}.jpg` : `/tiktok/roads/${id}.jpg`)
/**
 * A scene's painting, or the Harvest Road when it is not there: the rotation
 * names paintings that ship with the site, and a build that predates one of
 * them (or a 404) must still make the post rather than fail the morning.
 */
export async function loadScene(r: Pick<Renderer, 'loadImage'>, id: string): Promise<HTMLImageElement> {
  try { return await r.loadImage(scenePath(id)) } catch { return r.loadImage('/road/harvest.jpg') }
}
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

// The cast rotates: a reader is not back within two days and a scene not
// within six, so a week of posts is a week of different pictures. Each day
// is picked with the previous days' picks in view, walking forward from a
// fixed epoch, so every device (the dashboard, the morning runner) computes
// the same sequence — the same guarantee getVerseForDate makes, by the same
// means. Days before the epoch keep the old book-only cast, because their
// videos were made under it.
const ROTATION_EPOCH = '2026-09-07'
const READER_MEMORY = 2, SCENE_MEMORY = 6
const castMemo = new Map<string, CastPick>()
export function autoCast(date: string): CastPick {
  if (date < ROTATION_EPOCH) return pickCast(seedFor(date), date)
  const hit = castMemo.get(date)
  if (hit) return hit
  const recent: CastPick[] = []
  for (let i = 1; i <= SCENE_MEMORY; i++) {
    const d = addDays(date, -i)
    if (d < ROTATION_EPOCH) break
    recent.push(autoCast(d))
  }
  const pick = pickCastRotated(seedFor(date), date, recent.slice(0, READER_MEMORY).map((c) => c.reader), recent.map((c) => c.scene))
  castMemo.set(date, pick)
  return pick
}

/**
 * Who plays the one-question challenge, and where. The first of the day is
 * the day's own cast; the second is a different face on a different road,
 * so two challenge posts on one afternoon are not the same post twice.
 */
export function challengeCast(date: string, slot: 1 | 2): { reader: string; scene: string } {
  const c = autoCast(date)
  if (slot === 1) return { reader: c.reader, scene: c.scene }
  const reader = READER_ORDER[(READER_ORDER.indexOf(c.reader) + 1) % READER_ORDER.length] ?? c.reader
  const scenes = c.scene === 'advent' ? ['advent'] : VERSE_SCENES
  const scene = scenes[(scenes.indexOf(c.scene) + 1) % scenes.length] ?? c.scene
  return { reader, scene }
}

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

// The headless runner (lib/tiktokDaily.ts) has no session: it calls the
// function with the service key instead, which the function accepts as the
// admin. Nothing in the app ever sets this; it exists for that one caller.
// The headless runner (src/lib/tiktokDaily.ts) has no session; it carries
// TIKTOK_RUNNER_TOKEN (Vault, 0102) as `x-runner-token`, and the function
// takes that as the admin. The dashboard never sets it.
let runnerToken: string | null = null
export function setRunnerToken(token: string | null) { runnerToken = token }

export async function call<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase!.functions.invoke('tiktok-gen', {
    body: { action, ...body },
    ...(runnerToken ? { headers: { 'x-runner-token': runnerToken } } : {}),
  })
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

// One copy, in lib/date.ts — the player-facing side reads dates the same way.
export { addDays }

export type Platform = 'tiktok' | 'youtube' | 'facebook' | 'instagram' | 'x' | 'snapchat' | 'threads' | 'pinterest'
export interface PlatformCopy { title: string; text: string; tags: string[] }
export interface Copy { hook: string; caption: string; hashtags: string[]; platforms?: Partial<Record<Platform, PlatformCopy>> }
/**
 * The five posts a day: the verse, the story, yesterday's five-question
 * replay, and two one-question challenges ("Can you beat Peter?") about
 * yesterday's verse — `challenge2` is the second, a different question by a
 * different face, and its own kind because every path in the bucket
 * (`copy-<kind>`, `<kind>.mp4`, `posted-<kind>`) and every idempotency key
 * is per (date, kind). `own` is a clip the operator recorded themselves,
 * captioned and posted through the same door.
 */
export type Kind = 'verse' | 'story' | 'quiz' | 'challenge' | 'challenge2' | 'own'
export interface Made { date: string; kind: Kind; reference: string; url: string; ext: string; size: number; copy: Copy | null; phrases: TimedPhrase[]; tier: string }

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
/**
 * The maker's own skin, which takes the reader's place for the thought on a
 * VOICED verse post — so the figure on the road, the voice reading and the
 * photo in the frame are all one person for the second half.
 *
 * Two things about it are deliberate. It is dated rather than switched on
 * everywhere, because seven mornings were already rendered and scheduled
 * under the old look and a post should not change shape mid-week; a date is
 * also the one gate that needs nothing remembered. And it is the VERSE
 * layout only — the evening story is Tabitha's room, where a second figure
 * would be a stranger walking into somebody else's library, and the photo
 * alone already says who is talking.
 *
 * The art is read straight out of `public/skins/`, the same path every
 * reader uses; nothing here goes through `skinVisible`, so the skin being
 * `retired` and owned by one account is untouched by it.
 */
export const SPEAKER_SKIN = 'sharkey'
export const SPEAKER_SKIN_FROM = '2026-09-08'

/**
 * His figure and the bare road to stand it on, or null on a date before the
 * swap begins. Both are needed together: on the two painted backdrop tiers
 * the reader is IN the picture, so the road is what covers him.
 */
export async function speakerFor(r: Renderer, d: string, scene: string): Promise<{ figure: HTMLImageElement; scene: HTMLImageElement } | null> {
  if (d < SPEAKER_SKIN_FROM) return null
  try {
    const [figure, sceneImg] = await Promise.all([r.loadImage(`/skins/${SPEAKER_SKIN}.png`), loadScene(r, scene)])
    return { figure, scene: sceneImg }
  } catch {
    // A missing render is the day's reader staying put, never a failed post.
    return null
  }
}

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
  const [sceneImg, figure] = await Promise.all([loadScene(r, sc), r.loadImage(`/skins/${rd}.png`)])
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

// ---- the operator's own voice ---------------------------------------------------
//
// A recording parked for a date (lib/tiktokVoice.ts) replaces Gemini's
// reading of the verse and adds the operator's thought after it. Both paths
// live in the bucket: the WAV at days/<date>/voice-verse.wav and the timed
// transcript beside it. The founder photo the thought section draws is one
// file, uploaded once. `fetchVoice` answers null on a day with nothing
// parked, which is what makes the morning fall back to Gemini's voice.

export const FOUNDER_PHOTO = 'founder/photo.jpg'
export const VOICE_LABEL = 'Matthew · founder'
/**
 * The two posts a day the operator can speak on. The VERSE is his outright —
 * his reading replaces Gemini's and his thought follows it — while the STORY
 * keeps Tabitha's telling and appends his closing word to the end of it. Both
 * park the same shape (`VoiceTrack`); a story CODA is simply one whose
 * `verse` is empty, which is what lets one set of actions, one transcript
 * format and one `refit` serve both.
 */
export type VoiceKind = 'verse' | 'story'
export const voiceWavPath = (d: string, kind: VoiceKind = 'verse') => `days/${d}/voice-${kind}.wav`
export const voiceJsonPath = (d: string, kind: VoiceKind = 'verse') => `days/${d}/voice-${kind}.json`
export type VoiceTrack = import('@/lib/tiktokVoice').VoiceTrack
export async function fetchVoice(d: string, kind: VoiceKind = 'verse'): Promise<(VoiceTrack & { wavUrl: string }) | null> {
  const v = await call<Partial<VoiceTrack> & { wavUrl?: string }>('voice', { date: d, kind })
  return v && Array.isArray(v.verse) && Array.isArray(v.thought) && v.wavUrl ? (v as VoiceTrack & { wavUrl: string }) : null
}
/** The operator's spoken reflection for a date — drafted by Gemini, or their own saved edit. */
export interface Thought { text: string; words: number; source: 'gemini' | 'operator'; at: string; cached?: boolean }
export async function fetchThought(d: string, force = false, samples: string[] = []): Promise<Thought> {
  const v = getVerseForDate(d)
  const sd = seedFor(d)
  return call<Thought>('thought', { date: d, force, reference: v.reference, text: v.text, theme: v.theme, speaker: sd.speaker, audience: sd.audience, before: sd.before, after: sd.after, facts: sd.facts, samples })
}
/**
 * The story's closing word — written FROM the story, so it has to be told
 * one. That is the whole reason this is a second call rather than a flag:
 * the morning thought is drafted off the verse's own data and can be written
 * a week early, while a summary of a telling cannot exist until the telling
 * does.
 */
/**
 * Which end of a story the operator speaks at. 'close' answers Tabitha's
 * telling; 'open' introduces her and hands over by name. The two are drafted
 * from opposite ends of the same material and cached apart, so a day can
 * carry a draft of each and only one recording.
 */
export type Place = 'open' | 'close'

export async function fetchStoryWord(d: string, force = false, samples: string[] = [], place: Place = 'close'): Promise<Thought> {
  const v = getVerseForDate(d)
  const st = await fetchStory(d, false)
  return call<Thought>('thought', { date: d, kind: 'story', place, force, reference: v.reference, text: v.text, paragraphs: st.paragraphs, samples })
}
/** The draft already parked for a date, or null — never drafts. */
export async function peekThought(d: string, kind: VoiceKind = 'verse', place: Place = 'close'): Promise<Thought | null> {
  const t = await call<Partial<Thought>>('thought', { date: d, kind, place, peek: true })
  return t && typeof t.text === 'string' ? (t as Thought) : null
}
export async function saveThought(d: string, text: string, kind: VoiceKind = 'verse', place: Place = 'close'): Promise<Thought> {
  return call<Thought>('thought', { date: d, kind, place, save: text })
}
/** Park a file in the bucket through a signed upload URL (the bucket is service-role write only). */
export async function parkFile(path: string, blob: Blob, contentType: string): Promise<string> {
  const up = await call<{ path: string; token: string; publicUrl: string }>('upload-url', { path })
  const { error } = await supabase!.storage.from(BUCKET).uploadToSignedUrl(up.path, up.token, blob, { contentType, upsert: true })
  if (error) throw new Error(`upload: ${error.message}`)
  return up.publicUrl
}

export async function fetchStory(d: string, force: boolean): Promise<Story> {
  const v = getVerseForDate(d)
  const sd = seedFor(d)
  return call<Story>('story', { date: d, force, reference: v.reference, text: v.text, theme: v.theme, speaker: sd.speaker, audience: sd.audience, before: sd.before, after: sd.after, facts: sd.facts })
}

// The words for a date's post of one kind, written once (cached in the
// bucket by date and kind) so the hub can show today's without rendering a
// video, and a render on the same day gets the same words.
export async function fetchCopy(d: string, kind: Made['kind'], force = false, extra: { question?: string; about?: string } = {}): Promise<Copy> {
  const v = getVerseForDate(d)
  return call<Copy>('copy', { date: d, kind, force, reference: v.reference, text: v.text, theme: v.theme, ...extra })
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

const ICON: Record<Made['kind'], string> = { verse: '☀️', story: '🌙', quiz: '🎮', challenge: '⚡', challenge2: '⚡', own: '🎤' }
const FILE: Record<Made['kind'], string> = { verse: 'verse-arcade-', story: 'verse-arcade-story-', quiz: 'verse-arcade-quiz-', challenge: 'verse-arcade-challenge-', challenge2: 'verse-arcade-challenge2-', own: 'verse-arcade-own-' }

const PLATFORMS: Array<[Platform, string]> = [['tiktok', 'TikTok'], ['youtube', 'YouTube Shorts'], ['facebook', 'Facebook'], ['instagram', 'Instagram Reels'], ['x', 'X']]

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
        ? PLATFORMS.map(([id, name]) => copy.platforms![id] ? <PlatformBlock key={id} name={name} c={copy.platforms![id]!} /> : null)
        : <PlatformBlock name="Caption" c={{ title: '', text: copy.caption, tags: copy.hashtags }} />}
    </div>
  )
}

// ---- posting ------------------------------------------------------------------
//
// A finished video goes out through Ayrshare — the four accounts are connected
// once in its dashboard, and the function's `post` action hands it the video
// and that day's per-platform words. The browser's part is two steps: put the
// MP4 in the bucket (a signed upload URL, since the bucket is service-role
// write only), then ask the function to post the public URL. What went out is
// parked by the function, so a reload shows it.

export type PostResult = { platform: string; status: string; postUrl?: string | null; error?: string | null; scheduleDate?: string | null }
export interface Posted { at?: string; results?: PostResult[] }
const PLATFORM_NAMES: Record<Platform, string> = { tiktok: 'TikTok', youtube: 'YouTube', facebook: 'Facebook', instagram: 'Instagram', x: 'X', snapchat: 'Snapchat', threads: 'Threads', pinterest: 'Pinterest' }

export async function fetchPosted(d: string, kind: Made['kind']): Promise<Posted> {
  return call<Posted>('posted', { date: d, kind })
}

/**
 * Ask Ayrshare what became of the day's SCHEDULED posts and fill in the URLs a
 * network only issues once it publishes. The morning runner does this for
 * yesterday on its own; this is the button for a post made by hand, and the
 * links it records are what the app's "watch yesterday's verse" row offers.
 */
export async function fetchLinks(d: string, kind: Made['kind']): Promise<Posted> {
  return call<Posted>('links', { date: d, kind })
}

/** The frame at 0.3s — the hook line over the painting — as a JPG the size of the video. */
function coverJpeg(url: string): Promise<Blob | undefined> {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    v.preload = 'auto'; v.muted = true; v.playsInline = true
    v.onerror = () => resolve(undefined)
    v.onloadedmetadata = () => { v.currentTime = 0.3 }
    v.onseeked = () => {
      try {
        const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight
        c.getContext('2d')!.drawImage(v, 0, 0)
        c.toBlob((b) => resolve(b ?? undefined), 'image/jpeg', 0.86)
      } catch { resolve(undefined) }
    }
    v.src = url
  })
}

/** A video's length from its metadata, or undefined if the browser cannot read it. */
function videoSeconds(url: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => resolve(Number.isFinite(v.duration) ? v.duration : undefined)
    v.onerror = () => resolve(undefined)
    v.src = url
  })
}

/** Upload the video to the bucket and post it; returns what Ayrshare said per platform. */
export async function postVideo(m: Made, platforms: Platform[], scheduleDate: string | undefined, onStep: (label: string) => void): Promise<Posted> {
  if (m.ext !== 'mp4') throw new Error('This one is a WebM; TikTok and Instagram refuse it. Render in Chrome for an MP4.')
  onStep('Uploading the video')
  const path = `days/${m.date}/${m.kind}.mp4`
  const up = await call<{ path: string; token: string; publicUrl: string }>('upload-url', { path })
  const blob = await (await fetch(m.url)).blob()
  const { error } = await supabase!.storage.from(BUCKET).uploadToSignedUrl(up.path, up.token, blob, { contentType: 'video/mp4', upsert: true })
  if (error) throw new Error(`upload: ${error.message}`)
  // Pinterest refuses a video pin without a cover the size of the video, so
  // the first frame goes up beside the MP4. Best effort: no frame, no cover,
  // and the function skips Pinterest with a row that says so.
  if (platforms.includes('pinterest')) {
    onStep('Making the cover')
    const jpg = await coverJpeg(m.url)
    if (jpg) {
      const c = await call<{ path: string; token: string }>('upload-url', { path: `days/${m.date}/${m.kind}-cover.jpg` })
      await supabase!.storage.from(BUCKET).uploadToSignedUrl(c.path, c.token, jpg, { contentType: 'image/jpeg', upsert: true })
    }
  }
  // One call per platform: Ayrshare fetches the video inside the call, and
  // six of those in one request ran past the function gateway's limit (the
  // function finished; the browser saw a timeout). The function merges each
  // call's rows over the day's record, so the result is the same.
  // The length travels with the post: Facebook Reels stop at 90 seconds and
  // the function posts a longer one to the page as a plain video instead.
  const seconds = await videoSeconds(m.url)
  const results: PostResult[] = []
  let at: string | undefined
  for (const platform of platforms) {
    onStep(`${scheduleDate ? 'Scheduling' : 'Posting'} · ${PLATFORM_NAMES[platform]}`)
    const r = await call<Posted>('post', { date: m.date, kind: m.kind, videoUrl: up.publicUrl, platforms: [platform], scheduleDate, reference: m.reference, seconds })
    results.push(...(r.results ?? []))
    at = r.at ?? at
  }
  return { at, results }
}

export function PostControls({ m }: { m: Made }) {
  const [chosen, setChosen] = useState<Platform[]>(['tiktok', 'youtube', 'facebook', 'instagram', 'x', 'snapchat', 'threads', 'pinterest'])
  const [when, setWhen] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [posted, setPosted] = useState<Posted | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    fetchPosted(m.date, m.kind).then((p) => { if (live && p.results?.length) setPosted(p) }).catch(() => { /* nothing recorded */ })
    return () => { live = false }
  }, [m.date, m.kind])
  const go = async () => {
    if (busy) return
    setErr(null); setBusy('Starting')
    try {
      // A local datetime from the picker becomes the UTC instant Ayrshare wants.
      const schedule = when ? new Date(when).toISOString().replace(/\.\d{3}Z$/, 'Z') : undefined
      setPosted(await postVideo(m, chosen, schedule, setBusy))
    } catch (e) { setErr(String((e as Error).message || e)) } finally { setBusy(null) }
  }
  const toggle = (p: Platform) => setChosen((xs) => (xs.includes(p) ? xs.filter((x) => x !== p) : [...xs, p]))
  return (
    <div style={{ display: 'grid', gap: 6, borderTop: '1px solid var(--stroke)', paddingTop: 8 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {(Object.keys(PLATFORM_NAMES) as Platform[]).map((p) => (
          <label key={p} className="faint" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={chosen.includes(p)} onChange={() => toggle(p)} /> {PLATFORM_NAMES[p]}
          </label>
        ))}
        <label className="faint" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
          at <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={{ fontSize: 11 }} />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="pill" style={{ fontWeight: 800 }} disabled={!!busy || !chosen.length} onClick={go}>
          {busy ? `${busy}…` : when ? '📤 Schedule it' : '📤 Post it now'}
        </button>
        {posted?.results?.length ? (
          <button
            className="pill"
            style={{ fontSize: 11 }}
            disabled={!!busy}
            onClick={async () => {
              setErr(null); setBusy('Checking links')
              try { setPosted(await fetchLinks(m.date, m.kind)) } catch (e) { setErr(String((e as Error).message || e)) } finally { setBusy(null) }
            }}
          >↻ Links</button>
        ) : null}
        {posted?.at && <span className="faint" style={{ fontSize: 11 }}>sent {new Date(posted.at).toLocaleString()}</span>}
      </div>
      {err && <p style={{ color: 'var(--coral)', fontSize: 12, margin: 0 }}>{err}</p>}
      {posted?.results?.map((r) => (
        <div key={r.platform} style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ width: 80 }}>{PLATFORM_NAMES[r.platform as Platform] ?? r.platform}</span>
          <span style={{ color: r.status === 'error' ? 'var(--coral)' : 'var(--mint)' }}>{r.status}{r.scheduleDate ? ` for ${new Date(r.scheduleDate).toLocaleString()}` : ''}</span>
          {r.postUrl && <a href={r.postUrl} target="_blank" rel="noreferrer" className="faint" style={{ fontSize: 11 }}>open ↗</a>}
          {r.error && <span className="faint" style={{ fontSize: 11 }}>{r.error}</span>}
        </div>
      ))}
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
      <PostControls m={m} />
    </div>
  )
}
