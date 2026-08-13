import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { localdb } from '@/lib/localdb'
import { getVerseForDate } from '@/data/bible/questions'
import { todayLocalDate } from '@/lib/date'
import { levelInfo } from '@/components/XpBar'
import {
  PRACTICE_LIST_SIZE,
  practiceBonusXp,
  rewardAvailable,
  nextRewardDate,
} from '@/lib/practice'
import { useAuth } from './auth'
import type { DailyVerse, PlayResult, PracticeItem, PracticeOutcome } from '@/types'

// Practice mode store: the list of recently-played verses you can restudy, and
// the run/submit flow. Replaying is free study; XP only comes from beating your
// best, once per week per verse (see lib/practice + migration 0014).

function isOnline(): boolean {
  const a = useAuth.getState()
  return !!supabase && a.mode === 'online' && a.isAuthed
}

interface PracticeState {
  list: PracticeItem[]
  loadedList: boolean
  loadList: () => Promise<void>

  activeDate: string | null
  verse: DailyVerse | null
  lastResult: { result: PlayResult; outcome: PracticeOutcome } | null
  start: (dropDate: string) => void
  submit: (result: PlayResult) => Promise<PracticeOutcome>
}

export const usePractice = create<PracticeState>((set, get) => ({
  list: [],
  loadedList: false,
  activeDate: null,
  verse: null,
  lastResult: null,

  async loadList() {
    const today = todayLocalDate()

    if (isOnline() && supabase) {
      const { data: u } = await supabase.auth.getUser()
      const uid = u.user?.id
      if (!uid) {
        set({ list: [], loadedList: true })
        return
      }
      // Your last N played verses (never today's — you can't practice a verse
      // you're still playing fresh; and it keeps the daily distinct).
      const { data: plays } = await supabase
        .from('plays')
        .select('drop_date, score')
        .eq('user_id', uid)
        .neq('drop_date', today)
        .order('drop_date', { ascending: false })
        .limit(PRACTICE_LIST_SIZE)
      const rows = plays ?? []
      const dates = rows.map((r) => r.drop_date as string)
      const ppByDate = new Map<string, { best_score: number; last_reward_on: string | null }>()
      if (dates.length) {
        const { data: pps } = await supabase
          .from('practice_plays')
          .select('drop_date, best_score, last_reward_on')
          .eq('user_id', uid)
          .in('drop_date', dates)
        ;(pps ?? []).forEach((p) =>
          ppByDate.set(p.drop_date as string, {
            best_score: (p.best_score as number) ?? 0,
            last_reward_on: (p.last_reward_on as string | null) ?? null,
          }),
        )
      }
      const list: PracticeItem[] = rows.map((r) => {
        const date = r.drop_date as string
        const pp = ppByDate.get(date)
        const bestScore = Math.max((r.score as number) ?? 0, pp?.best_score ?? 0)
        return {
          dropDate: date,
          reference: getVerseForDate(date).reference,
          bestScore,
          rewardable: rewardAvailable(pp?.last_reward_on, today),
          nextRewardOn: rewardAvailable(pp?.last_reward_on, today) ? null : nextRewardDate(pp?.last_reward_on),
        }
      })
      set({ list, loadedList: true })
      return
    }

    // LOCAL / guest: last N played dates from localdb, newest first.
    const plays = localdb.getPlays()
    const dates = Object.keys(plays)
      .filter((d) => d !== today)
      .sort((a, b) => (a < b ? 1 : -1))
      .slice(0, PRACTICE_LIST_SIZE)
    const list: PracticeItem[] = dates.map((date) => {
      const dailyScore = plays[date]?.result.score ?? 0
      const pp = localdb.getPractice(date)
      const bestScore = Math.max(dailyScore, pp?.bestScore ?? 0)
      const avail = rewardAvailable(pp?.lastRewardOn, today)
      return {
        dropDate: date,
        reference: getVerseForDate(date).reference,
        bestScore,
        rewardable: avail,
        nextRewardOn: avail ? null : nextRewardDate(pp?.lastRewardOn),
      }
    })
    set({ list, loadedList: true })
  },

  start(dropDate) {
    set({ activeDate: dropDate, verse: getVerseForDate(dropDate), lastResult: null })
  },

  async submit(result) {
    const date = get().activeDate
    if (!date) throw new Error('No active practice verse')
    const auth = useAuth.getState()
    const today = todayLocalDate()

    if (isOnline() && supabase) {
      const { data, error } = await supabase.rpc('submit_practice', {
        p_drop_date: date,
        p_score: result.score,
      })
      if (error) throw error
      const d = data as Record<string, unknown>
      const outcome: PracticeOutcome = {
        score: Number(d.score ?? result.score),
        previousBest: Number(d.previous_best ?? 0),
        newBest: Number(d.new_best ?? result.score),
        improved: !!d.improved,
        rewarded: !!d.rewarded,
        xpEarned: Number(d.xp_earned ?? 0),
        weeklyLocked: !!d.weekly_locked,
        nextRewardOn: (d.next_reward_on as string | null) ?? null,
      }
      if (outcome.rewarded) await auth.refreshProfile()
      set({ lastResult: { result, outcome } })
      get().loadList()
      return outcome
    }

    // LOCAL / guest — mirror the server rules.
    const prof = auth.profile
    if (!prof) throw new Error('No profile')
    // You can only earn from a verse you've actually played (same gate the
    // server enforces) — this stops direct-URL practice of unplayed verses.
    const dailyPlay = localdb.getPlay(date)
    if (!dailyPlay) {
      const outcome: PracticeOutcome = {
        score: result.score,
        previousBest: result.score,
        newBest: result.score,
        improved: false,
        rewarded: false,
        xpEarned: 0,
        weeklyLocked: false,
        nextRewardOn: null,
      }
      set({ lastResult: { result, outcome } })
      return outcome
    }
    const dailyScore = dailyPlay.result.score ?? 0
    const pp = localdb.getPractice(date)
    const previousBest = Math.max(dailyScore, pp?.bestScore ?? 0)
    const improved = result.score > previousBest
    const canReward = improved && rewardAvailable(pp?.lastRewardOn, today)
    const xpEarned = canReward ? practiceBonusXp(result.score - previousBest) : 0
    const newBest = Math.max(previousBest, result.score)

    localdb.savePractice(date, {
      bestScore: newBest,
      lastRewardOn: xpEarned > 0 ? today : (pp?.lastRewardOn ?? null),
    })

    if (xpEarned > 0) {
      const newXp = prof.xp + xpEarned
      const updated = { ...prof, xp: newXp, level: levelInfo(newXp).level }
      auth.setProfileLocal(updated)
      // Keep the guest's cumulative XP on the worldwide leaderboard in step.
      if (supabase) {
        supabase
          .rpc('record_guest_open', {
            p_drop_date: today,
            p_guest_id: localdb.getGuestId(),
            p_username: updated.username,
            p_emoji: updated.avatarEmoji,
            p_score: 0,
            p_xp: updated.xp,
            p_level: updated.level,
          })
          .then(
            () => {},
            () => {},
          )
      }
    }

    const outcome: PracticeOutcome = {
      score: result.score,
      previousBest,
      newBest,
      improved,
      rewarded: xpEarned > 0,
      xpEarned,
      weeklyLocked: improved && !canReward,
      nextRewardOn: canReward ? nextRewardDate(today) : nextRewardDate(pp?.lastRewardOn),
    }
    set({ lastResult: { result, outcome } })
    get().loadList()
    return outcome
  },
}))
