import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { getVerseForDate } from '@/data/bible/questions'
import { todayLocalDate } from '@/lib/date'
import { localdb } from '@/lib/localdb'
import { applyPlayLocal } from '@/lib/progress'
import { useAuth } from './auth'
import type { DailyVerse, DailyPulse, PlayResult, SubmitOutcome } from '@/types'

interface GameState {
  today: DailyVerse | null
  todayDate: string
  playedToday: boolean
  lastResult: { result: PlayResult; outcome: SubmitOutcome } | null
  pulse: DailyPulse | null

  loadToday: () => Promise<void>
  submitPlay: (result: PlayResult) => Promise<SubmitOutcome>
  loadPulse: () => Promise<void>
}

export const useGame = create<GameState>((set, get) => ({
  today: null,
  todayDate: todayLocalDate(),
  playedToday: false,
  lastResult: null,
  pulse: null,

  async loadToday() {
    const date = todayLocalDate()
    const verse = getVerseForDate(date)
    const mode = useAuth.getState().mode

    if (mode === 'local' || !supabase) {
      const existing = localdb.getPlay(date)
      set({
        today: verse,
        todayDate: date,
        playedToday: !!existing,
        lastResult: existing,
      })
      return
    }

    // ONLINE: make sure the shared row exists, then check if the user played.
    await supabase.rpc('ensure_daily_verse', {
      p_drop_date: date,
      p_translation: verse.translation,
      p_reference: verse.reference,
      p_book: verse.book,
      p_chapter: verse.chapter,
      p_verse_start: verse.verseStart,
      p_verse_end: verse.verseEnd ?? null,
      p_text: verse.text,
      p_theme: verse.theme ?? null,
      p_questions: verse.questions,
      p_facts: verse.facts,
    })
    const { data: u } = await supabase.auth.getUser()
    let played = false
    if (u.user) {
      const { data } = await supabase
        .from('plays')
        .select('id')
        .eq('user_id', u.user.id)
        .eq('drop_date', date)
        .maybeSingle()
      played = !!data
    }
    set({ today: verse, todayDate: date, playedToday: played })
  },

  async submitPlay(result) {
    const date = get().todayDate
    const auth = useAuth.getState()

    if (auth.mode === 'local' || !supabase) {
      const prof = auth.profile
      if (!prof) throw new Error('No profile')
      const { profile, outcome } = applyPlayLocal(prof, {
        dropDate: date,
        score: result.score,
        correct: result.correctCount,
      })
      auth.setProfileLocal(profile)
      localdb.savePlay(date, result, outcome)
      set({ playedToday: true, lastResult: { result, outcome } })
      return outcome
    }

    const { data, error } = await supabase.rpc('submit_play', {
      p_drop_date: date,
      p_score: result.score,
      p_time_ms: result.timeMs,
      p_correct: result.correctCount,
      p_total: result.totalQuestions,
      p_combo_max: result.comboMax,
    })
    if (error) throw error
    const outcome = normalizeOutcome(data)
    await auth.refreshProfile()
    set({ playedToday: true, lastResult: { result, outcome } })
    return outcome
  },

  async loadPulse() {
    const date = get().todayDate
    if (!supabase) {
      // LOCAL mode: synthesize a warm, believable ambient pulse so solo play
      // still feels populated. (Clearly fake data; real counts come online.)
      set({ pulse: synthPulse() })
      return
    }
    const { data, error } = await supabase.rpc('get_daily_pulse', { p_drop_date: date })
    if (error) return
    const raw = data as { opened: number; feed: any[] }
    set({
      pulse: {
        opened: raw.opened,
        feed: raw.feed.map((f) => ({
          username: f.username,
          avatarEmoji: f.avatar_emoji,
          points: f.points,
          kind: f.kind,
          createdAt: f.created_at,
        })),
      },
    })
  },
}))

function normalizeOutcome(d: any): SubmitOutcome {
  return {
    alreadyPlayed: !!d.already_played,
    xpEarned: d.xp_earned,
    xp: d.xp,
    level: d.level,
    leveledUp: !!d.leveled_up,
    currentStreak: d.current_streak,
    usedFreeze: !!d.used_freeze,
    streakFreezes: d.streak_freezes,
  }
}

// Believable filler for offline/solo so "you're not alone" still lands.
const NAMES = ['grace_r', 'j_walks', 'psalmsurfer', 'noah_b', 'lightseeker', 'ruth88', 'danielc', 'ekklesia', 'maranatha', 'olivebranch', 'shalomkid', 'the_esther', 'ziontrail', 'abba_reads']
const EMOJI = ['📖', '🕊️', '✨', '🌿', '🔥', '⭐', '🙏', '🌅']
function synthPulse(): DailyPulse {
  const feed = Array.from({ length: 14 }).map((_, i) => ({
    username: NAMES[i % NAMES.length],
    avatarEmoji: EMOJI[i % EMOJI.length],
    points: 400 + Math.floor(Math.random() * 900),
    kind: 'scored' as const,
    createdAt: new Date(Date.now() - i * 42000).toISOString(),
  }))
  return { opened: 2130 + Math.floor(Math.random() * 400), feed }
}
