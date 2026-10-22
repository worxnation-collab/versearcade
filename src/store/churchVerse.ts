import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { todayLocalDate } from '@/lib/date'
import { useAuth } from './auth'
import type { AvatarSpec } from '@/data/avatar'
import type { PlayResult, Question } from '@/types'

// The church's own verse, as its OWN lane (0128).
//
// Until 0128 a verified church's verse stood in for the global daily drop. It
// does not any more: everybody plays the global verse, and a member of a
// verified church that scheduled one for today ALSO gets this — its own card
// on the Play tab, its own run at `/play/church`, its own play record
// (`church_verse_plays`). It pays no XP: `xp` is the worldwide leaderboard, and
// a second daily XP source needs its own capped, server-paid argument.
//
// Online-only, like every church store. Every read fails closed to "nothing
// today", because this is a layer on top of the day and must never be able to
// break it.

function online(): boolean {
  return !!supabase && useAuth.getState().mode === 'online'
}

export interface ChurchVerseToday {
  churchId: string
  churchName: string
  date: string
  reference: string
  text: string
  questions: Question[]
  series?: string
  note?: string
  /** Your own result, once you have played it. */
  played: { score: number; correct: number; total: number } | null
  /** How far through this verse's series you are — days played / days so far. */
  progress: { total: number; soFar: number; played: number } | null
}

/**
 * The series the member's church is in right now (0130), as the run of days it
 * is — so a series reads as one connected thing rather than isolated drops.
 * Present on a gap day and before a series starts, which `today` is not. A
 * future day carries its date only: no reference until it comes.
 */
export interface ChurchSeries {
  churchId: string
  churchName: string
  name: string
  today: string
  days: { date: string; reference: string | null; played: boolean; today: boolean }[]
}

/** Where today sits in a series: "Day 3 of 5", the next day ahead, what you've played. */
export function seriesPosition(s: ChurchSeries) {
  const idx = s.days.findIndex((d) => d.today)
  const next = s.days.find((d) => d.date > s.today) ?? null
  return {
    day: idx >= 0 ? idx + 1 : null,
    total: s.days.length,
    played: s.days.filter((d) => d.played).length,
    started: s.days.some((d) => d.date <= s.today),
    next,
  }
}

interface State {
  today: ChurchVerseToday | null
  /** The series around today (0130); null with none, or on a server without 0130. */
  series: ChurchSeries | null
  date: string | null
  loaded: boolean
  load: (force?: boolean) => Promise<void>
  submit: (r: PlayResult) => Promise<void>
  clear: () => void
}

export const useChurchVerse = create<State>((set, get) => ({
  today: null,
  series: null,
  date: null,
  loaded: false,

  async load(force = false) {
    const date = todayLocalDate()
    if (!force && get().loaded && get().date === date) return
    if (!online()) {
      set({ today: null, series: null, date, loaded: true })
      return
    }
    // The series is a second read so a server without 0130 still has its day:
    // a failed series read is "no series", never "no church verse".
    const [verse, series] = await Promise.all([
      supabase!.rpc('my_church_verse', { p_local_date: date }),
      supabase!.rpc('my_church_series', { p_local_date: date }),
    ])
    set({
      today: verse.error ? null : parse(verse.data),
      series: series.error ? null : parseSeries(series.data),
      date,
      loaded: true,
    })
  },

  async submit(r) {
    const t = get().today
    if (!t || !online()) return
    // Optimistic: the card turns into "done" the moment the run ends.
    const sr = get().series
    set({
      today: { ...t, played: { score: r.score, correct: r.correctCount, total: r.totalQuestions },
        progress: t.progress && !t.played ? { ...t.progress, played: t.progress.played + 1 } : t.progress },
      series: sr ? { ...sr, days: sr.days.map((d) => (d.date === t.date ? { ...d, played: true } : d)) } : sr,
    })
    const { error } = await supabase!.rpc('submit_church_verse_play', {
      p_local_date: t.date,
      p_score: Math.max(0, Math.min(10000, Math.round(r.score))),
      p_correct: r.correctCount,
      p_total: r.totalQuestions,
      p_time_ms: Math.round(r.timeMs),
    })
    // Re-read the server's truth either way, so a refused write never leaves
    // an optimistic "done" on screen (the churchYard shape).
    if (error) await get().load(true)
  },

  clear() {
    set({ today: null, series: null, date: null, loaded: false })
  },
}))

function parse(d: any): ChurchVerseToday | null {
  if (!d || typeof d.reference !== 'string' || typeof d.text !== 'string' || !d.church_id) return null
  if (!Array.isArray(d.questions) || d.questions.length < 1) return null
  const questions: Question[] = []
  for (const q of d.questions) {
    if (!q || typeof q.prompt !== 'string' || typeof q.teach !== 'string' || !Array.isArray(q.options)) return null
    const options = q.options.filter((o: unknown): o is string => typeof o === 'string')
    if (options.length < 2 || options.length !== q.options.length) return null
    if (!Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex >= options.length) return null
    questions.push({ prompt: q.prompt, options, answerIndex: q.answerIndex, teach: q.teach })
  }
  const p = d.played
  const sp = d.series_progress
  return {
    churchId: String(d.church_id),
    churchName: String(d.church_name ?? 'Your church'),
    date: String(d.drop_date),
    reference: d.reference,
    text: d.text,
    questions,
    series: line(d.series, 60),
    note: line(d.note, 280),
    played: p && Number.isFinite(p.score) ? { score: Number(p.score), correct: Number(p.correct), total: Number(p.total) } : null,
    progress: sp && Number.isFinite(sp.total)
      ? { total: Number(sp.total), soFar: Number(sp.so_far), played: Number(sp.played) }
      : null,
  }
}

function parseSeries(d: any): ChurchSeries | null {
  const name = line(d?.series, 60)
  if (!d || !name || !d.church_id || typeof d.today !== 'string' || !Array.isArray(d.days)) return null
  const days = (d.days as any[])
    .filter((x) => x && typeof x.date === 'string')
    .map((x) => ({
      date: String(x.date),
      reference: typeof x.reference === 'string' && x.reference ? x.reference : null,
      played: x.played === true,
      today: x.today === true,
    }))
  if (!days.length) return null
  return { churchId: String(d.church_id), churchName: String(d.church_name ?? 'Your church'), name, today: d.today, days }
}

function line(x: unknown, max: number): string | undefined {
  if (typeof x !== 'string') return undefined
  const t = x.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max)
  return t || undefined
}

// ---------------------------------------------------------------------------
// The congregation's activity feed (0128) — members and leadership of that
// verified church. Scores included, the owner's call.
// ---------------------------------------------------------------------------
export type FeedKind = 'church_verse' | 'drop' | 'gave' | 'joined' | 'notice'

export interface FeedEvent {
  kind: FeedKind
  at: string
  username: string | null
  avatarEmoji: string | null
  avatarCharacter: AvatarSpec | null
  score: number | null
  correct: number | null
  total: number | null
  /** The church verse's reference, or a notice's text. */
  detail: string | null
  points: number | null
}

const KINDS: FeedKind[] = ['church_verse', 'drop', 'gave', 'joined', 'notice']

export async function fetchChurchFeed(churchId: string, limit = 40): Promise<FeedEvent[] | null> {
  if (!online()) return null
  const { data, error } = await supabase!.rpc('church_feed', { p_church_id: churchId, p_limit: limit })
  const d = data as any
  if (error || !d?.ok || !Array.isArray(d.events)) return null
  return (d.events as any[])
    .filter((e) => KINDS.includes(e?.kind))
    .map((e) => ({
      kind: e.kind as FeedKind,
      at: String(e.at),
      username: typeof e.username === 'string' ? e.username : null,
      avatarEmoji: typeof e.avatar_emoji === 'string' ? e.avatar_emoji : null,
      avatarCharacter: (e.avatar_character as AvatarSpec | null) ?? null,
      score: num(e.score),
      correct: num(e.correct),
      total: num(e.total),
      detail: typeof e.detail === 'string' ? e.detail : null,
      points: num(e.points),
    }))
}

function num(x: unknown): number | null {
  const n = Number(x)
  return x == null || !Number.isFinite(n) ? null : n
}

// ---------------------------------------------------------------------------
// "This week in our church" (0130): church TOTALS for the rivalry's UTC week.
// Player counts under five come back null (the 0119 floor) and are drawn as
// nothing rather than as a small number that points at two people.
// ---------------------------------------------------------------------------
export interface ChurchWeek {
  members: number
  /** Members who played the church verse this week; null under the floor. */
  versePlayers: number | null
  /** Members who played the daily verse this week; null under the floor. */
  dropPlayers: number | null
  /** Church-verse days the week has had so far. */
  verseDays: number
  floor: number
}

export async function fetchChurchWeek(churchId: string): Promise<ChurchWeek | null> {
  if (!online()) return null
  const { data, error } = await supabase!.rpc('church_week_summary', { p_church_id: churchId })
  const d = data as any
  if (error || !d?.ok) return null
  return {
    members: num(d.members) ?? 0,
    versePlayers: num(d.verse_players),
    dropPlayers: num(d.drop_players),
    verseDays: num(d.verse_days) ?? 0,
    floor: num(d.floor) ?? 5,
  }
}
