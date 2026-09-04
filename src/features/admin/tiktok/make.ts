// The three daily posts, made. One copy of each flow — voice, copy, assets,
// render — used by the dashboard's three generators AND by the headless
// runner (lib/tiktokDaily.ts) that makes them on a schedule. Two callers
// disagreeing about how a post is made is the drift the QuizRunner rule
// exists to prevent, so the components hold form state and nothing else.
//
// Every option is explicit and every date is a parameter: the runner has no
// "today" of its own (headless Chromium in CI sits in UTC), so nothing here
// reads the clock.

import { getVerseForDate } from '@/data/bible/questions'
import { SCORING } from '@/lib/config'
import { scoreQuestion } from '@/lib/progress'
import { pickStoryVoice, secondVoiceFor, gradeFor } from '@/data/tiktokVoice'
import { buildCpuPlan, CPU_PROFILES, type CpuLevel } from '@/features/arena/cpu'
import type { QuizStep } from '@/lib/tiktokRender'
import {
  READERS, TELLERS, ROOMS, skinPath,
  seedFor, autoPick, autoCast, spokenReference, call, fetchCopy, fetchStory, bedFor, backdropFor, tierFor,
  type Copy, type Made, type Story, type Renderer,
} from './shared'

export type Progress = (fraction: number, label: string) => void

/** What every generator returns: the finished file plus what the card shows. */
export interface MadeBlob extends Made { blob: Blob }

function made(d: string, kind: Made['kind'], reference: string, out: { blob: Blob; ext: 'mp4' | 'webm'; phrases: Made['phrases'] }, copy: Copy | null, tier: string): MadeBlob {
  return { date: d, kind, reference, url: URL.createObjectURL(out.blob), ext: out.ext, size: out.blob.size, copy, phrases: out.phrases, tier, blob: out.blob }
}

// ---- the verse reading -----------------------------------------------------------

export interface VerseOptions {
  /** A fixed reader+scene; omitted means the day's own cast. */
  cast?: { reader: string; scene: string }
  /** A fixed voice and delivery note; omitted means the figure's own. */
  voice?: { voice: string; style: string }
  copy?: boolean
  music?: boolean
  align?: boolean
}

export async function makeVerse(d: string, o: VerseOptions, progress: Progress): Promise<MadeBlob> {
  const v = getVerseForDate(d)
  progress(0, 'asking for the reading')
  // A batch reads each day in its own voice when the pick is automatic;
  // an operator's override applies to every day in the batch.
  const c = o.cast ?? autoCast(d)
  const p = o.voice ?? autoPick(d, c.reader)
  const sd = seedFor(d)
  // The words of God or Jesus are read by a second voice; the reader
  // says the reference. Anyone else's verse is one voice as before.
  const second = o.voice ? null : secondVoiceFor(sd)
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
  if (o.copy !== false) {
    progress(0, 'writing the caption')
    try { copy = await fetchCopy(d, 'verse') } catch { copy = null }
  }

  progress(0, 'rendering')
  const r: Renderer = await import('@/lib/tiktokRender')
  const tier = await tierFor(c.reader, c.scene)
  const backdrop = await backdropFor(r, tier, c.reader, c.scene)
  const bed = o.music !== false ? await bedFor(await r.plannedDuration(audio, copy?.hook, false), 'morning') : undefined
  const out = await r.renderTikTok({
    reference: v.reference, text: v.text, hook: copy?.hook, audio, backdrop, bed, align: o.align,
    grade: o.cast ? undefined : gradeFor(sd),
    onProgress: progress,
  })
  return made(d, 'verse', v.reference, out, copy, `${c.reader} · ${c.scene} · ${tier}`)
}

// ---- story time --------------------------------------------------------------------

export interface StoryOptions {
  /** A fixed teller and room; omitted means Tabitha in the story circle. */
  cast?: { teller: string; room: string }
  voice?: { voice: string; style: string }
  /** A story already fetched for this date (the panel shows it first). */
  story?: Story
  copy?: boolean
  music?: boolean
  align?: boolean
}

export async function storyAssets(r: Renderer, tellerId: string, roomPath: string) {
  // The story circle already has Tabitha in it; any other room draws the
  // teller's own render over the painting.
  const hasTeller = !!ROOMS.find((x) => x.id === roomPath)?.hasTeller
  const tellerImg = hasTeller ? undefined : await r.loadImage(skinPath(tellerId))
  const roomImg = await r.loadImage(roomPath).catch(() => r.loadImage('/keep/study-library.jpg'))
  return { roomImg, tellerImg }
}

export async function makeStory(d: string, o: StoryOptions, progress: Progress): Promise<MadeBlob> {
  const v = getVerseForDate(d)
  const sd = seedFor(d)
  progress(0, 'writing the story')
  const st = o.story ?? await fetchStory(d, false)
  const tellerId = o.cast?.teller ?? 'tabitha'
  const roomPath = o.cast?.room ?? ROOMS[0].id
  const p = o.voice ?? pickStoryVoice(sd, tellerId)
  const second = o.voice ? null : secondVoiceFor(sd)
  const tellerName = TELLERS.find((x) => x.id === tellerId)?.name.split(' ')[0] ?? 'Teller'
  const spoken = second
    ? [...st.paragraphs.map((pg) => `${tellerName}: ${pg}`), `${second.name}: ${v.text.trim()}`, `${tellerName}: ${spokenReference(v.reference)}.`].join('\n\n')
    : [...st.paragraphs, `${v.text.trim()} ${spokenReference(v.reference)}.`].join('\n\n')
  progress(0, 'asking for the telling')
  const tts = await call<{ url: string; cached: boolean }>('tts', {
    date: d, text: spoken, voice: p.voice, style: p.style,
    speakers: second ? [{ name: tellerName, voice: p.voice }, { name: second.name, voice: second.voice }] : undefined,
  })
  const audio = await (await fetch(tts.url + '?v=' + Date.now())).arrayBuffer()
  let copy: Copy | null = null
  if (o.copy !== false) {
    progress(0, 'writing the caption')
    try { copy = await fetchCopy(d, 'story') } catch { copy = null }
  }
  progress(0, 'rendering')
  const r: Renderer = await import('@/lib/tiktokRender')
  const { roomImg, tellerImg } = await storyAssets(r, tellerId, roomPath)
  const paragraphs = [...st.paragraphs, `${v.text.trim()} ${v.reference}.`]
  const hook = st.hook || copy?.hook
  const bed = o.music !== false ? await bedFor(await r.plannedDuration(audio, hook, true), 'cloister') : undefined
  const out = await r.renderStory({
    title: st.title, reference: v.reference, verseText: v.text,
    paragraphs, hook, audio, room: roomImg, teller: tellerImg, bed, align: o.align,
    onProgress: progress,
  })
  return made(d, 'story', v.reference, out, copy, `${TELLERS.find((x) => x.id === tellerId)?.name ?? tellerId} · story`)
}

// ---- yesterday's quiz ----------------------------------------------------------------

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

// The CPU's play for a date: the game's own plan, mapped onto the video's
// shorter window. A wrong answer picks a wrong OPTION deterministically so the
// same date replays the same way on every device. Points are the game's
// (`scoreQuestion`, with the combo counted as the game counts it), scaled so
// the CPU's speed means the same fraction of the window it would in the app.
export function quizPlan(date: string, level: CpuLevel, windowSec: number, questions: Array<{ answerIndex: number; options: string[] }>): QuizStep[] {
  const steps = buildCpuPlan(hash(date), questions.length, CPU_PROFILES[level])
  let combo = 0
  return questions.map((q, i) => {
    const s = steps[i]
    const frac = s.answerMs / SCORING.answerWindowMs
    const atSec = Math.max(1.2, Math.min(windowSec - 0.6, frac * windowSec))
    const wrong = (hash(`${date}:${i}`) % (q.options.length - 1))
    const pick = s.correct ? q.answerIndex : (wrong >= q.answerIndex ? wrong + 1 : wrong)
    const points = scoreQuestion(s.correct, Math.round(frac * SCORING.answerWindowMs), combo)
    combo = s.correct ? combo + 1 : 0
    return { pick, atSec, points }
  })
}

export interface QuizOptions {
  level?: CpuLevel
  windowSec?: number
  cast?: { reader: string; scene: string }
  /** Read the verse aloud over its card first (default true). */
  voice?: boolean
  /** A fixed voice for that reading; omitted means the figure's own. */
  voiceName?: string
  copy?: boolean
  music?: boolean
  align?: boolean
}

export async function makeQuiz(d: string, o: QuizOptions, progress: Progress): Promise<MadeBlob> {
  const v = getVerseForDate(d)
  const level = o.level ?? 'medium'
  const windowSec = o.windowSec ?? 12
  const c = o.cast ?? autoCast(d)
  const name = READERS.find((x) => x.id === c.reader)?.name.split(' ')[0] ?? 'Peter'
  const steps = quizPlan(d, level, windowSec, v.questions)
  let audio: ArrayBuffer | undefined
  if (o.voice !== false) {
    // The same reading the morning post makes, so it is usually cached.
    progress(0, 'asking for the reading')
    const p = autoPick(d, c.reader)
    const tts = await call<{ url: string; cached: boolean }>('tts', { date: d, text: `${v.text.trim()} ${spokenReference(v.reference)}.`, voice: o.voiceName ?? p.voice, style: p.style })
    audio = await (await fetch(tts.url + '?v=' + Date.now())).arrayBuffer()
  }
  let copy: Copy | null = null
  if (o.copy !== false) {
    progress(0, 'writing the caption')
    try { copy = await fetchCopy(d, 'quiz') } catch { copy = null }
  }
  progress(0, 'rendering')
  const r: Renderer = await import('@/lib/tiktokRender')
  const [backdrop, figure] = await Promise.all([r.loadImage(`/road/${c.scene}.jpg`), r.loadImage(`/skins/${c.reader}.png`)])
  const base = { reference: v.reference, text: v.text, questions: v.questions, plan: steps, windowSec, playerName: name, figure, backdrop, hook: copy?.hook }
  const tl = r.quizTimeline(audio ? await r.audioSeconds(audio) : null, base)
  const [bed, cues] = await Promise.all([o.music !== false ? bedFor(tl.total, 'morning') : Promise.resolve(undefined), r.quizCues(tl.events, tl.total)])
  const out = await r.renderQuiz({ ...base, audio, bed, cues, align: o.align, onProgress: progress })
  const won = steps.filter((s, i) => s.pick === v.questions[i].answerIndex).length
  return made(d, 'quiz', v.reference, out, copy, `${name} · ${CPU_PROFILES[level].name} · ${won}/${v.questions.length}`)
}
