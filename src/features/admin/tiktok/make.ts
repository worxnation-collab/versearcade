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
import { challengeIndex } from '@/lib/tiktokChallenge'
import {
  READERS, TELLERS, ROOMS, skinPath, loadScene, publicUrl, existsAt, parkFile,
  seedFor, autoPick, autoCast, challengeCast, spokenReference, call, fetchCopy, fetchStory, fetchVoice, bedFor, backdropFor, tierFor, speakerFor, loadStages, ownStage,
  FOUNDER_PHOTO, VOICE_LABEL, voiceWavPath, voiceJsonPath,
  type Copy, type Made, type Story, type Renderer, type VoiceTrack,
} from './shared'
import { sanitizeStages } from '@/data/tiktokStages'

export type Progress = (fraction: number, label: string) => void

/** What every generator returns: the finished file plus what the card shows. */
export interface MadeBlob extends Made { blob: Blob }

function made(d: string, kind: Made['kind'], reference: string, out: { blob: Blob; ext: 'mp4' | 'webm'; phrases: Made['phrases'] }, copy: Copy | null, tier: string, voiced = false): MadeBlob {
  return { date: d, kind, reference, url: URL.createObjectURL(out.blob), ext: out.ext, size: out.blob.size, copy, phrases: out.phrases, tier, voiced, blob: out.blob }
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
  /** Use the operator's parked recording for the date when there is one (default true); false forces Gemini's reading. */
  ownVoice?: boolean
}

/**
 * The operator's recording for a date, transcribed: the parked transcript
 * when the hub already listened, else — a WAV in the bucket with nothing
 * beside it, which is what an upload from a PHONE leaves — listened to here
 * and parked, so the morning runner makes the post from a recording nobody
 * has opened on a desktop. The caption is rewritten once at that moment,
 * since the day's copy may already describe a painted reader.
 */
/**
 * The operator's own half of a story, listened to if a recording is parked
 * and nothing has transcribed it yet — `ensureVoice`'s twin, and it exists
 * for the same reason: a phone only uploads, so the morning runner has to be
 * able to do the listening itself. The difference is that this half is all
 * thought, so there is no verse to find in it (`transcribeOwn`).
 *
 * `place` is only used when this function does the listening. A recording
 * somebody already transcribed carries its own, which is what stops a render
 * moving a word that was recorded as a closing one to the front.
 */
export async function ensureOwn(d: string, progress: Progress, place: 'open' | 'close' = 'close'): Promise<(VoiceTrack & { wavUrl: string }) | null> {
  const parked = await fetchVoice(d, 'story').catch(() => null)
  if (parked) return parked
  const wavUrl = publicUrl(voiceWavPath(d, 'story'))
  if (!(await existsAt(wavUrl + '?v=' + Date.now(), 'audio/'))) return null
  progress(0, place === 'open' ? 'listening to your introduction' : 'listening to your closing word')
  const m = await import('@/lib/tiktokVoice')
  // The STORY's target: this half plays against Tabitha, not alone.
  const dec = await m.decodeRecording(await (await fetch(wavUrl + '?v=' + Date.now())).blob(), m.SPEECH_TARGET.story)
  const track = await m.transcribeOwn(dec.samples, dec.sampleRate, place, (label) => progress(0, label))
  await parkFile(voiceJsonPath(d, 'story'), new Blob([JSON.stringify(track)], { type: 'application/json' }), 'application/json')
  try { await fetchCopy(d, 'story', true, { voiced: true }) } catch { /* written at render time otherwise */ }
  return { ...track, wavUrl }
}

export async function ensureVoice(d: string, progress: Progress): Promise<(VoiceTrack & { wavUrl: string }) | null> {
  const parked = await fetchVoice(d).catch(() => null)
  if (parked) return parked
  const wavUrl = publicUrl(voiceWavPath(d))
  if (!(await existsAt(wavUrl + '?v=' + Date.now(), 'audio/'))) return null
  const v = getVerseForDate(d)
  progress(0, 'listening to your recording')
  const m = await import('@/lib/tiktokVoice')
  const dec = await m.decodeRecording(await (await fetch(wavUrl + '?v=' + Date.now())).blob())
  const track = await m.splitRecording(dec.samples, dec.sampleRate, v.text, v.reference, (label) => progress(0, label))
  await parkFile(voiceJsonPath(d), new Blob([JSON.stringify(track)], { type: 'application/json' }), 'application/json')
  try { await fetchCopy(d, 'verse', true, { voiced: true }) } catch { /* written at render time otherwise */ }
  return { ...track, wavUrl }
}

export async function makeVerse(d: string, o: VerseOptions, progress: Progress): Promise<MadeBlob> {
  const v = getVerseForDate(d)
  const c = o.cast ?? autoCast(d)
  const sd = seedFor(d)
  // The operator's own recording, if one is parked for the date, replaces
  // Gemini's reading and adds their thought after the verse — the words were
  // timed once (in the hub, or here from a phone upload nobody has opened on
  // a desktop). No recording (or `ownVoice: false`) is the morning as it
  // always was.
  const own = o.ownVoice === false ? null : await ensureVoice(d, progress).catch((e) => { console.warn('own voice unavailable, falling back to Gemini:', e); return null })
  if (own) {
    progress(0, 'fetching your recording')
    const audio = await (await fetch(own.wavUrl + '?v=' + Date.now())).arrayBuffer()
    let copy: Copy | null = null
    if (o.copy !== false) {
      progress(0, 'writing the caption')
      try { copy = await fetchCopy(d, 'verse', false, { voiced: true }) } catch { copy = null }
    }
    progress(0, 'rendering')
    const r: Renderer = await import('@/lib/tiktokRender')
    const tier = await tierFor(c.reader, c.scene)
    const backdrop = await backdropFor(r, tier, c.reader, c.scene)
    const photo = await r.loadImage(publicUrl(FOUNDER_PHOTO) + '?v=' + Date.now()).catch(() => undefined)
    // The day's reader hands the road to the maker as the thought begins, so
    // the figure, the voice and the photo are one person for the rest of it.
    // Null before the swap's start date, and on any day its art will not
    // load — the reader simply stays put.
    const speaker = (await speakerFor(r, d, c.scene)) ?? undefined
    const bed = o.music !== false ? await bedFor(await r.plannedDuration(audio, copy?.hook, false), 'morning') : undefined
    const out = await r.renderTikTok({
      reference: v.reference, text: v.text, hook: copy?.hook, audio, backdrop, bed, speaker,
      voice: { verse: own.verse, thought: own.thought, photo, label: VOICE_LABEL },
      grade: o.cast ? undefined : gradeFor(sd),
      onProgress: progress,
    })
    return made(d, 'verse', v.reference, out, copy, `${c.reader}${speaker ? ' → you' : ''} · ${c.scene} · ${tier} · your voice`, true)
  }
  progress(0, 'asking for the reading')
  // A batch reads each day in its own voice when the pick is automatic;
  // an operator's override applies to every day in the batch.
  const p = o.voice ?? autoPick(d, c.reader)
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
    try { copy = await fetchCopy(d, 'verse', false, { voiced: false }) } catch { copy = null }
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
  /** Render the telling alone, ignoring anything parked in the operator's voice for the date. */
  ownVoice?: boolean
  /**
   * Where a recording that has NOT yet been transcribed belongs — 'open' to
   * introduce Tabitha, 'close' to answer her. A recording already listened
   * to carries its own and wins, so this only decides the first render.
   */
  ownPlace?: 'open' | 'close'
}

export async function storyAssets(r: Renderer, tellerId: string, roomPath: string) {
  // The story circle already has Tabitha in it; any other room draws the
  // teller's own render over the painting.
  const hasTeller = !!ROOMS.find((x) => x.id === roomPath)?.hasTeller
  const tellerImg = hasTeller ? undefined : await r.loadImage(skinPath(tellerId))
  const roomImg = await r.loadImage(roomPath).catch(() => r.loadImage('/keep/study-library.jpg'))
  return { roomImg, tellerImg }
}

/**
 * The day's NOTE: Facebook's photo-and-text post, the one thing this engine
 * makes that is not a video.
 *
 * It reuses the day's own cast and painting so the note and the morning Reel
 * are visibly the same day, and it asks for the STORY first — the note's
 * words are written from the same paragraphs Tabitha tells in the evening,
 * so the two cannot contradict each other about what happened. A story that
 * will not generate is not fatal: the copy falls back to the verse's own
 * data, which is what the caption path has always had.
 */
export async function makeNote(d: string, o: { cast?: { reader: string; scene: string }; copy?: boolean }, progress: Progress): Promise<MadeBlob> {
  const v = getVerseForDate(d)
  const c = o.cast ?? autoCast(d)
  const sd = seedFor(d)
  progress(0, 'writing the note')
  let copy: Copy | null = null
  if (o.copy !== false) {
    let paragraphs: string[] = []
    try { paragraphs = (await fetchStory(d, false)).paragraphs } catch { paragraphs = [] }
    try { copy = await call<Copy>('copy', { date: d, kind: 'note', reference: v.reference, text: v.text, theme: v.theme, paragraphs }) } catch { copy = null }
  }
  progress(0, 'painting the card')
  const r: Renderer = await import('@/lib/tiktokRender')
  const tier = await tierFor(c.reader, c.scene)
  const backdrop = await backdropFor(r, tier, c.reader, c.scene)
  const blob = await r.renderNoteCard({ reference: v.reference, text: v.text, backdrop, grade: o.cast ? undefined : gradeFor(sd) })
  return {
    date: d, kind: 'note', reference: v.reference, url: URL.createObjectURL(blob), ext: 'jpg',
    size: blob.size, copy, phrases: [], tier: `${c.reader} · ${c.scene} · ${tier} · note`, voiced: false, blob,
  }
}

export async function makeStory(d: string, o: StoryOptions, progress: Progress): Promise<MadeBlob> {
  const v = getVerseForDate(d)
  const sd = seedFor(d)
  // Asked FIRST, like makeVerse: the caption's words differ on a day the
  // maker speaks (`voiced` on the copy action), so his half has to be known
  // and its transcript parked before `fetchCopy` runs below.
  const own = o.ownVoice === false ? null : await ensureOwn(d, progress, o.ownPlace).catch((e) => { console.warn('your voice unavailable, telling it without one:', e); return null })
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
    try { copy = await fetchCopy(d, 'story', false, { voiced: !!own }) } catch { copy = null }
  }
  progress(0, 'rendering')
  const r: Renderer = await import('@/lib/tiktokRender')
  const { roomImg, tellerImg } = await storyAssets(r, tellerId, roomPath)
  const paragraphs = [...st.paragraphs, `${v.text.trim()} ${v.reference}.`]
  // Where each paragraph is set. The VERSE — always the last one — is never
  // staged: Tabitha reads it from her own book in her own room, and coming
  // back is what makes the middle feel like somewhere she took you.
  const scenes = st.scenes?.length
    ? [...await loadStages(r, sanitizeStages(st.scenes, st.paragraphs.length)), null]
    : undefined
  // His own dark stage, and his figure standing on it — the same one-of-one
  // skin the morning post's reader hands the road to. A missing painting is
  // his photo over the library exactly as before, never a failed post.
  const stage = own ? await ownStage(r) : null
  const hook = st.hook || copy?.hook
  // The operator's own half, when one is parked for the date. The telling is
  // unchanged either way — his recording is joined to it, never in place of
  // it — so a day with no recording renders exactly as before.
  const ownAudio = own ? await (await fetch(own.wavUrl + '?v=' + Date.now())).arrayBuffer() : undefined
  const photo = own ? await r.loadImage(publicUrl(FOUNDER_PHOTO) + '?v=' + Date.now()).catch(() => undefined) : undefined
  const bed = o.music !== false ? await bedFor(await r.plannedDuration(audio, hook, true, ownAudio), 'cloister') : undefined
  const out = await r.renderStory({
    title: st.title, reference: v.reference, verseText: v.text,
    paragraphs, hook, audio, room: roomImg, teller: tellerImg, bed, align: o.align, scenes, stage: stage ?? undefined,
    own: own && ownAudio
      ? { audio: ownAudio, words: own.thought, text: own.text, place: own.place ?? o.ownPlace ?? 'close', photo, label: VOICE_LABEL }
      : undefined,
    onProgress: progress,
  })
  const teller = TELLERS.find((x) => x.id === tellerId)?.name ?? tellerId
  return made(d, 'story', v.reference, out, copy, `${teller} · story${own ? ' · your voice' : ''}`, !!(own && ownAudio))
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
    // The same reading the morning post makes, so it is usually cached. A
    // reading that cannot be had (Gemini TTS hung for one voice on 2026-09-07
    // until the gateway gave up) costs the post its voice, never the post:
    // the quiz layout has always run without audio.
    progress(0, 'asking for the reading')
    const p = autoPick(d, c.reader)
    try {
      const tts = await call<{ url: string; cached: boolean }>('tts', { date: d, text: `${v.text.trim()} ${spokenReference(v.reference)}.`, voice: o.voiceName ?? p.voice, style: p.style })
      audio = await (await fetch(tts.url + '?v=' + Date.now())).arrayBuffer()
    } catch (e) { console.warn('quiz: no reading, rendering without one:', e); audio = undefined }
  }
  let copy: Copy | null = null
  if (o.copy !== false) {
    progress(0, 'writing the caption')
    try { copy = await fetchCopy(d, 'quiz') } catch { copy = null }
  }
  progress(0, 'rendering')
  const r: Renderer = await import('@/lib/tiktokRender')
  const [backdrop, figure] = await Promise.all([loadScene(r, c.scene), r.loadImage(`/skins/${c.reader}.png`)])
  const base = { reference: v.reference, text: v.text, questions: v.questions, plan: steps, windowSec, playerName: name, figure, backdrop, hook: copy?.hook }
  const tl = r.quizTimeline(audio ? await r.audioSeconds(audio) : null, base)
  const [bed, cues] = await Promise.all([o.music !== false ? bedFor(tl.total, 'morning') : Promise.resolve(undefined), r.quizCues(tl.events, tl.total)])
  const out = await r.renderQuiz({ ...base, audio, bed, cues, align: o.align, onProgress: progress })
  const won = steps.filter((s, i) => s.pick === v.questions[i].answerIndex).length
  return made(d, 'quiz', v.reference, out, copy, `${name} · ${CPU_PROFILES[level].name} · ${won}/${v.questions.length}`)
}

// ---- the one-question challenge ------------------------------------------------
//
// "Can you beat Peter?" — ONE of yesterday's five questions, the clock, the
// reveal with its teach line, and an ask to comment. About twenty seconds,
// which is the length a feed actually finishes; the five-question replay is
// the long form of the same idea. Two a day, on different questions and
// with different faces (`challengeCast`), because the second is a different
// post rather than the first one again.

// `challengeIndex` lives in lib/tiktokChallenge.ts (pure, so the comment
// replier can bundle it without React); re-exported for the forms.
export { challengeIndex }

export interface ChallengeOptions {
  slot?: 1 | 2
  level?: CpuLevel
  windowSec?: number
  cast?: { reader: string; scene: string }
  /** Read the question aloud as the clock starts (default true). */
  voice?: boolean
  voiceName?: string
  copy?: boolean
  music?: boolean
}

export async function makeChallenge(d: string, o: ChallengeOptions, progress: Progress): Promise<MadeBlob> {
  const v = getVerseForDate(d)
  const slot = o.slot ?? 1
  const kind: Made['kind'] = slot === 2 ? 'challenge2' : 'challenge'
  const level = o.level ?? 'medium'
  const windowSec = o.windowSec ?? 12
  const c = o.cast ?? challengeCast(d, slot)
  const name = READERS.find((x) => x.id === c.reader)?.name.split(' ')[0] ?? 'Peter'
  const qi = challengeIndex(d, slot, v.questions.length)
  const q = v.questions[qi]
  // The same play the replay post shows for this question, so the two posts
  // never disagree about whether Peter got it.
  const step = quizPlan(d, level, windowSec, v.questions)[qi]
  let audio: ArrayBuffer | undefined
  if (o.voice !== false) {
    // Same rule as the quiz: a question that cannot be read aloud is asked
    // on screen alone rather than not asked at all. The first challenge of
    // 2026-09-07 was lost to a TTS hang before this existed.
    progress(0, 'asking for the question')
    const p = autoPick(d, c.reader)
    try {
      const tts = await call<{ url: string; cached: boolean }>('tts', { date: d, text: q.prompt, voice: o.voiceName ?? p.voice, style: `Ask this as a quiz question to a friend: bright, curious, unhurried. ${p.style.split('. ').slice(0, 1).join('. ')}.` })
      audio = await (await fetch(tts.url + '?v=' + Date.now())).arrayBuffer()
    } catch (e) { console.warn('challenge: no reading, rendering without one:', e); audio = undefined }
  }
  let copy: Copy | null = null
  if (o.copy !== false) {
    progress(0, 'writing the caption')
    try { copy = await fetchCopy(d, kind, false, { question: q.prompt }) } catch { copy = null }
  }
  progress(0, 'rendering')
  const r: Renderer = await import('@/lib/tiktokRender')
  const [backdrop, figure] = await Promise.all([loadScene(r, c.scene), r.loadImage(`/skins/${c.reader}.png`)])
  const base = { reference: v.reference, text: v.text, questions: [q], plan: [step], windowSec, playerName: name, figure, backdrop, hook: copy?.hook, solo: true }
  const tl = r.quizTimeline(audio ? await r.audioSeconds(audio) : null, base)
  const [bed, cues] = await Promise.all([o.music !== false ? bedFor(tl.total, 'morning') : Promise.resolve(undefined), r.quizCues(tl.events, tl.total)])
  const out = await r.renderQuiz({ ...base, audio, bed, cues, onProgress: progress })
  const won = step.pick === q.answerIndex
  return made(d, kind, v.reference, out, copy, `${name} · Q${qi + 1} · ${won ? 'got it' : 'missed it'}`)
}
