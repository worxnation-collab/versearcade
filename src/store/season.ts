import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { todayLocalDate } from '@/lib/date'
import { useAuth } from './auth'
import { baseSkinId, passSkinEquipId, skinById } from '@/data/avatar'
import {
  BUNDLED_POOLS,
  KNOWN_VERBS,
  MILES,
  MILES_CAP,
  activeQuests,
  isRoadWeekend,
  waystationFor,
  type Quest,
} from '@/lib/season'
import { poolsFor } from '@/data/catalog'
import {
  COSMETIC_DEFAULTS,
  activeRoad,
  cosmeticKind,
  rewardsBetween,
  roadDay,
  type CosmeticKind,
  type Reward,
} from '@/data/season'

// The Pilgrimage — miles, quests, and what a road has handed over.
//
// Follows the house shape: a private isOnline(), a load() that reads whichever
// source is authoritative, and writers that update in-memory state first so the
// UI is instant. See store/reviews.ts or store/bookAccuracy.ts.
//
// Everything here is free (docs/BATTLE-PASS.md), so there is no entitlement to
// check, nothing to purchase and no commerce.ts call anywhere in this file.
//
// Miles never touch profiles.xp — that column IS the worldwide leaderboard
// (0006) — so nothing this store writes can move a player up or down a board.

export interface QuestState {
  progress: number
  done: boolean
}

interface SeasonState {
  loaded: boolean
  roadId: string | null
  miles: number
  waystation: number
  /** Durable reward ids the player has unlocked, across every road. */
  unlocks: string[]
  /** Quest id -> progress. */
  quests: Record<string, QuestState>
  /** Equipped seasonal cosmetics, by kind. */
  equipped: Partial<Record<CosmeticKind, string | null>>
  /** Rewards waiting to be revealed by WaystationToast. */
  pending: { waystation: number; rewards: Reward[] } | null
  /** Daily rerolls already used, keyed by local date. */
  rerolledOn: string | null
  rerolled: string[]

  load: () => Promise<void>
  track: (event: TrackEvent, payload?: TrackPayload) => Promise<void>
  equip: (kind: CosmeticKind, key: string | null) => Promise<void>
  reroll: (questKey: string) => Promise<void>
  dismiss: () => void
  /** Live quests for today, with the player's progress folded in. */
  liveQuests: () => (Quest & QuestState)[]
  owns: (rewardId: string) => boolean
}

/**
 * Everything a player can do that a quest might watch.
 *
 * Several of these pay NO miles (they aren't in SOURCE_FOR) and no bundled
 * quest uses them yet — they exist so a catalog road shipped months from now
 * can score them without an App Store submission. See the prepack note on
 * QuestVerb in lib/season.ts.
 */
export type TrackEvent =
  | 'quiz_complete'
  | 'daily_play'
  | 'chapter_read'
  | 'study_run'
  | 'chest_open'
  | 'share_daily'
  | 'donate'
  | 'save_verse'
  | 'cpu_win'
  // ── Prepacked emit sites ──
  | 'focus_drill'
  | 'replay_run'
  | 'battle_played'
  | 'battle_win'
  | 'decor_placed'
  | 'flora_planted'
  | 'relic_found'
  | 'keep_offering'
  | 'track_unlocked'
  | 'pet_equipped'

export interface TrackPayload {
  correct?: number
  perfect?: boolean
  comboMax?: number
  /** How many at once, for events that can happen in a batch. Defaults to 1. */
  count?: number
}

// ── storage ──────────────────────────────────────────────────────────────────

interface LocalSeason {
  miles: number
  quests: Record<string, QuestState>
  unlocks: string[]
  granted: string[]
  equipped: Partial<Record<CosmeticKind, string | null>>
  rerolledOn: string | null
  rerolled: string[]
  /** Local date the `paid` list belongs to. */
  dayDate: string | null
  /** Once-a-day sources already paid out today (see ONCE_PER_DAY). */
  paid: string[]
}

const EMPTY: LocalSeason = {
  miles: 0,
  quests: {},
  unlocks: [],
  granted: [],
  equipped: {},
  rerolledOn: null,
  rerolled: [],
  dayDate: null,
  paid: [],
}

function localKey(roadId: string): string {
  const uid = useAuth.getState().profile?.id
  return uid ? `va.season.${roadId}.${uid}` : `va.season.${roadId}.guest`
}

function readLocal(roadId: string): LocalSeason {
  try {
    const raw = JSON.parse(localStorage.getItem(localKey(roadId)) || 'null') as LocalSeason | null
    if (raw && Number.isFinite(raw.miles)) return { ...EMPTY, ...raw }
  } catch {
    /* fall through */
  }
  return { ...EMPTY }
}

function writeLocal(roadId: string, next: LocalSeason) {
  try {
    localStorage.setItem(localKey(roadId), JSON.stringify(next))
  } catch {
    /* private mode / storage full — in-memory only for this session */
  }
}

function isOnline(): boolean {
  const a = useAuth.getState()
  return !!supabase && a.mode === 'online' && a.isAuthed
}

// ── the store ────────────────────────────────────────────────────────────────

export const useSeason = create<SeasonState>((set, get) => ({
  loaded: false,
  roadId: null,
  miles: 0,
  waystation: 0,
  unlocks: [],
  quests: {},
  equipped: {},
  pending: null,
  rerolledOn: null,
  rerolled: [],

  async load() {
    const road = activeRoad()
    if (!road) {
      set({ loaded: true, roadId: null })
      return
    }
    if (isOnline()) {
      const { data, error } = await supabase!.rpc('season_json', { p_road: road.id })
      if (!error && data) {
        const raw = data as {
          miles?: number
          waystation?: number
          unlocks?: string[] | null
          quests?: { id: string; progress: number; done: boolean }[] | null
          equipped?: Record<string, string> | null
        }
        const quests: Record<string, QuestState> = {}
        for (const q of raw.quests ?? []) quests[q.id] = { progress: q.progress, done: q.done }
        set({
          loaded: true,
          roadId: road.id,
          miles: raw.miles ?? 0,
          waystation: raw.waystation ?? 0,
          unlocks: raw.unlocks ?? [],
          quests,
          equipped: (raw.equipped ?? {}) as SeasonState['equipped'],
        })
        return
      }
      // A failed read leaves the road unwalked rather than showing zeros as
      // though the player had lost progress; the next track() retries.
      set({ loaded: true, roadId: road.id })
      return
    }

    const local = readLocal(road.id)
    set({
      loaded: true,
      roadId: road.id,
      miles: local.miles,
      waystation: waystationFor(local.miles),
      unlocks: local.unlocks,
      quests: local.quests,
      equipped: local.equipped,
      rerolledOn: local.rerolledOn,
      rerolled: local.rerolled,
    })
  },

  /**
   * One call site per thing a player can do. `track()` resolves the miles AND
   * advances any live quest watching that verb, so adding a quest verb never
   * means finding a new place to call from.
   */
  async track(event, payload = {}) {
    const road = activeRoad()
    if (!road) return
    if (!get().loaded || get().roadId !== road.id) await get().load()

    const source = SOURCE_FOR[event]
    let amount = 0
    if (source) {
      amount = event === 'quiz_complete'
        ? MILES.quizBase + MILES.quizPerCorrect * Math.max(0, payload.correct ?? 0)
        : MILES_CAP[source] ?? 0
      amount = Math.min(amount, MILES_CAP[source] ?? 0)
    }

    // Quests first: a finished quest banks its own miles, so doing it in this
    // order means a run that both earns and completes a quest reveals one
    // waystation rather than two toasts in a row.
    await advanceQuests(road.id, event, payload)
    if (amount > 0 && source && !alreadyPaidToday(road.id, source)) {
      await addMiles(road.id, source, amount)
      markPaidToday(road.id, source)
    }
  },

  async equip(kind, key) {
    const road = get().roadId ?? activeRoad()?.id
    // Optimistic: the UI is a grid of tiles and a round-trip before the tick
    // moves is the difference between "chosen" and "maybe chosen".
    set((s) => ({ equipped: { ...s.equipped, [kind]: key } }))
    if (isOnline()) {
      const { error } = await supabase!.rpc('set_seasonal_cosmetic', { p_kind: kind, p_key: key })
      if (error) {
        // The server refused (not unlocked) — put it back rather than showing a
        // cosmetic the player can't actually wear.
        await get().load()
      }
      return
    }
    if (!road) return
    const disk = readLocal(road)
    writeLocal(road, { ...disk, equipped: { ...disk.equipped, [kind]: key } })
  },

  async reroll(questKey) {
    const road = get().roadId ?? activeRoad()?.id
    if (!road) return
    const today = todayLocalDate()
    const s = get()
    const used = s.rerolledOn === today ? s.rerolled : []
    if (used.length >= 1) return
    const next = [...used, questKey]
    set({ rerolledOn: today, rerolled: next })
    // The reroll is a local preference about which of today's three you're
    // shown; it grants nothing, so it never needs a server round-trip.
    const disk = readLocal(road)
    writeLocal(road, { ...disk, rerolledOn: today, rerolled: next })
  },

  dismiss() {
    set({ pending: null })
  },

  liveQuests() {
    const road = activeRoad()
    if (!road) return []
    const { quests, rerolledOn, rerolled } = get()
    const today = todayLocalDate()
    const swapped = rerolledOn === today ? rerolled : []
    // A catalog road may carry its own quest pools; poolsFor falls back to the
    // bundled ones, which is what keeps the Harvest Road exactly as it shipped.
    return activeQuests(road.id, roadDay(road), poolsFor(road, BUNDLED_POOLS()))
      .filter((q) => !swapped.includes(q.key))
      .map((q) => ({ ...q, ...(quests[q.id] ?? { progress: 0, done: false }) }))
  },

  owns(rewardId) {
    const kind = cosmeticKind(rewardId)
    // The catalog defaults are everyone's, always.
    if (kind && COSMETIC_DEFAULTS[kind] === rewardId) return true
    return get().unlocks.includes(rewardId)
  },
}))

// ── internals ────────────────────────────────────────────────────────────────

/**
 * Sources that pay MILES at most once per local day.
 *
 * Reading a chapter is a footprint, not a grind — without this, flicking
 * through Psalms is 150 chapters x 50 miles and the road is over in an evening.
 * The gate is on the miles only: quest progress still counts every chapter, so
 * "read 7 chapters" works exactly as it reads.
 *
 * Deliberately a client-side throttle rather than a server one. The server
 * clamps the AMOUNT of a single award (award_season_miles), which is what stops
 * a client minting miles; frequency is not worth a per-source per-day table
 * here, because the worst a replayed call buys is a cosmetic the player would
 * have reached by playing — miles rank nothing. Same reasoning as the +/-1 day
 * clamp in lib/drops.
 */
const ONCE_PER_DAY = new Set(['chapter', 'daily', 'share'])

/** Has this source already been paid today? Reads the day off DISK for the same
 *  reason every other guest write does — see addMiles. */
function alreadyPaidToday(roadId: string, source: string): boolean {
  if (!ONCE_PER_DAY.has(source)) return false
  const disk = readLocal(roadId)
  const today = todayLocalDate()
  return disk.dayDate === today && disk.paid.includes(source)
}

function markPaidToday(roadId: string, source: string) {
  if (!ONCE_PER_DAY.has(source)) return
  const disk = readLocal(roadId)
  const today = todayLocalDate()
  const paid = disk.dayDate === today ? disk.paid : []
  if (paid.includes(source)) return
  writeLocal(roadId, { ...disk, dayDate: today, paid: [...paid, source] })
}

const SOURCE_FOR: Partial<Record<TrackEvent, string>> = {
  quiz_complete: 'quiz',
  daily_play: 'daily',
  chapter_read: 'chapter',
  chest_open: 'chest',
  share_daily: 'share',
  donate: 'donate',
}

/**
 * Bank miles and hand over anything the new waystation crossed.
 *
 * Guest writes read the road off DISK before merging, never off this store: a
 * run can finish before anything in the session called load() — a deep link
 * straight into a quiz, a reload mid-run — and merging onto an empty in-memory
 * value would write zero back over a real total. Same trap as
 * store/bookAccuracy.ts:record and store/drops.ts:rollGuest.
 */
async function addMiles(roadId: string, source: string, amount: number): Promise<void> {
  const road = activeRoad()
  if (!road) return

  if (isOnline()) {
    const { data, error } = await supabase!.rpc('award_season_miles', {
      p_road: roadId,
      p_source: source,
      p_amount: amount,
      p_local_date: todayLocalDate(),
    })
    if (error || !data) return
    const raw = data as { miles?: number; waystation?: number; from?: number }
    const before = raw.from ?? useSeason.getState().waystation
    const after = raw.waystation ?? before
    useSeason.setState({ miles: raw.miles ?? 0, waystation: after })
    if (after > before) await grantCrossed(roadId, before, after)
    return
  }

  // Guest mirror of award_season_miles. Keep the doubling rule in sync.
  const paid = isRoadWeekend() ? amount * 2 : amount
  const disk = readLocal(roadId)
  const before = waystationFor(disk.miles)
  const miles = disk.miles + paid
  const after = waystationFor(miles)
  writeLocal(roadId, { ...disk, miles })
  useSeason.setState({ miles, waystation: after })
  if (after > before) await grantCrossed(roadId, before, after)
}

/** Hand over every reward between two waystations and park the reveal. */
async function grantCrossed(roadId: string, from: number, to: number): Promise<void> {
  const road = activeRoad()
  if (!road) return
  const rewards = rewardsBetween(road, from, to)
  if (rewards.length === 0) {
    useSeason.setState({ pending: { waystation: to, rewards: [] } })
    return
  }

  const auth = useAuth.getState()
  const fresh: string[] = []

  for (const r of rewards) {
    const already = useSeason.getState().unlocks.includes(r.id)
    if (isOnline()) {
      const { data } = await supabase!.rpc('claim_season_reward', {
        p_road: roadId,
        p_reward_id: r.id,
      })
      if ((data as { granted?: boolean } | null)?.granted) fresh.push(r.id)
    } else if (!already) {
      fresh.push(r.id)
    }

    // Consumables are counters, not unlocks. Online the RPC already moved them;
    // mirror locally so the number on screen is right without a reload.
    if (!already) {
      const qty = r.qty ?? 1
      if (r.id === 'boost' && auth.profile) {
        void auth.updateProfile({ xpBoosts: (auth.profile.xpBoosts ?? 0) + qty })
      } else if (r.id === 'freeze' && auth.profile) {
        void auth.updateProfile({ streakFreezes: (auth.profile.streakFreezes ?? 0) + qty })
      } else if (r.id.startsWith('item_')) {
        // Wearable avatar items ride the existing owned_items path, so the
        // customize grid picks them up with no season-specific code there.
        auth.grantItem(r.id)
      }
    }
  }

  if (fresh.length) {
    const unlocks = [...useSeason.getState().unlocks, ...fresh]
    useSeason.setState({ unlocks })
    if (!isOnline()) {
      const disk = readLocal(roadId)
      writeLocal(roadId, {
        ...disk,
        unlocks: Array.from(new Set([...disk.unlocks, ...fresh])),
        granted: Array.from(new Set([...disk.granted, ...fresh])),
      })
    }
  }

  useSeason.setState({ pending: { waystation: to, rewards } })

  // Ruth's basket fills as the road is walked. If she's equipped, upgrade the
  // stored skinId to the newest state so the change is visible the moment the
  // waystation lands — and travels with the spec, so every other viewer sees
  // the right basket too (see passSkinEquipId in data/avatar).
  const spec = auth.profile?.avatarCharacter
  const equipped = spec?.skinId
  if (spec && equipped && baseSkinId(equipped) === 'ruth') {
    const ruth = skinById('ruth')
    if (ruth) {
      const next = passSkinEquipId(ruth, useSeason.getState().unlocks)
      if (next !== equipped) auth.setAvatarCharacter({ ...spec, skinId: next })
    }
  }
}

/** Advance every live quest watching this event, paying out any that finish. */
async function advanceQuests(
  roadId: string,
  event: TrackEvent,
  payload: TrackPayload,
): Promise<void> {
  const road = activeRoad()
  if (!road) return

  for (const q of useSeason.getState().liveQuests()) {
    if (q.done) continue
    const delta = deltaFor(q.verb, event, payload, q.goal)
    if (delta <= 0) continue

    const before = q.progress
    const next = Math.min(q.goal, before + delta)
    const nowDone = next >= q.goal

    useSeason.setState((s) => ({
      quests: { ...s.quests, [q.id]: { progress: next, done: nowDone } },
    }))

    if (isOnline()) {
      const { data } = await supabase!.rpc('track_season_quest', {
        p_road: roadId,
        p_quest_id: q.id,
        p_delta: delta,
        p_goal: q.goal,
        p_local_date: todayLocalDate(),
      })
      const res = data as { paid?: boolean; award?: { miles?: number; waystation?: number; from?: number } } | null
      if (res?.paid && res.award) {
        const before2 = res.award.from ?? useSeason.getState().waystation
        const after = res.award.waystation ?? before2
        useSeason.setState({ miles: res.award.miles ?? 0, waystation: after })
        if (after > before2) await grantCrossed(roadId, before2, after)
      }
    } else {
      const disk = readLocal(roadId)
      writeLocal(roadId, {
        ...disk,
        quests: { ...disk.quests, [q.id]: { progress: next, done: nowDone } },
      })
      if (nowDone) {
        await addMiles(roadId, q.kind === 'daily' ? 'quest_daily' : 'quest_weekly', q.miles)
      }
    }
  }
}

/**
 * How much one event moves a quest watching a given verb.
 *
 * `goal` is passed because two verbs are thresholds rather than tallies: they
 * either clear the bar in ONE run or score nothing. Everything else counts.
 *
 * The `default: 0` is deliberate and load-bearing for the remote catalog — an
 * unrecognised verb scores nothing rather than throwing. It should be
 * unreachable, though: `sanitizeQuestDefs` drops any verb outside KNOWN_VERBS
 * before a quest is ever shown, so a quest that lands here is a bug in the two
 * lists agreeing, which `checkQuestVerbs()` catches in dev.
 */
function deltaFor(verb: Quest['verb'], event: TrackEvent, p: TrackPayload, goal: number): number {
  const n = Math.max(1, Math.floor(p.count ?? 1))
  switch (verb) {
    case 'play_daily':
      return event === 'daily_play' ? 1 : 0
    case 'answer_correct':
      return event === 'quiz_complete' ? Math.max(0, p.correct ?? 0) : 0
    case 'perfect_run':
      return event === 'quiz_complete' && p.perfect ? 1 : 0
    case 'combo':
      // A peak, not a tally. "Hit a 4x combo" means in ONE run — returning the
      // raw comboMax would let two 2x runs add up to it, which is not what the
      // quest says and not what it should feel like.
      //
      // The bar is the quest's own goal, so a catalog road can ask for any
      // combo it likes. At goal 4 this is byte-identical to the hardcoded 4
      // this shipped with, which is what makes it safe to generalise mid-road.
      return event === 'quiz_complete' && (p.comboMax ?? 0) >= goal ? goal : 0
    case 'read_chapters':
      return event === 'chapter_read' ? 1 : 0
    case 'study_runs':
      return event === 'study_run' ? 1 : 0
    case 'cpu_wins':
      return event === 'cpu_win' ? 1 : 0
    case 'save_verses':
      return event === 'save_verse' ? 1 : 0
    case 'donate':
      return event === 'donate' ? 1 : 0
    case 'share_daily':
      return event === 'share_daily' ? 1 : 0
    case 'open_chest':
      return event === 'chest_open' ? 1 : 0

    // ── Prepacked: no bundled quest uses these, a catalog road may ──
    case 'play_any':
      return event === 'quiz_complete' ? 1 : 0
    case 'answers_in_run':
      // A threshold like `combo`: the run either cleared the bar or it didn't,
      // so two half-runs never add up to it.
      return event === 'quiz_complete' && Math.max(0, p.correct ?? 0) >= goal ? goal : 0
    case 'focus_drills':
      return event === 'focus_drill' ? n : 0
    case 'replay_runs':
      return event === 'replay_run' ? n : 0
    case 'battle_wins':
      return event === 'battle_win' ? n : 0
    case 'battles_played':
      return event === 'battle_played' ? n : 0
    case 'place_decor':
      return event === 'decor_placed' ? n : 0
    case 'plant_flora':
      return event === 'flora_planted' ? n : 0
    case 'find_relic':
      return event === 'relic_found' ? n : 0
    case 'give_offering':
      return event === 'keep_offering' ? n : 0
    case 'unlock_track':
      return event === 'track_unlocked' ? n : 0
    case 'equip_pet':
      return event === 'pet_equipped' ? n : 0
    default:
      return 0
  }
}

/**
 * Every verb `deltaFor` actually handles, asserted against KNOWN_VERBS at
 * import in dev — the same guard shape as `checkTrackData()` in data/music.ts.
 *
 * The two lists live in different files (the verb type is reward math, the
 * scoring switch is store wiring) and drifting apart has one very quiet
 * symptom: a catalog road ships a quest that passes sanitisation, renders with
 * a progress bar, and can never be completed. This turns that into a console
 * error the first time anyone runs the app.
 */
const SCORED_VERBS = new Set<string>([
  'play_daily', 'answer_correct', 'perfect_run', 'combo', 'read_chapters',
  'study_runs', 'cpu_wins', 'save_verses', 'donate', 'share_daily', 'open_chest',
  'play_any', 'answers_in_run', 'focus_drills', 'replay_runs', 'battle_wins',
  'battles_played', 'place_decor', 'plant_flora', 'find_relic', 'give_offering',
  'unlock_track', 'equip_pet',
])

export function checkQuestVerbs(): string[] {
  const problems: string[] = []
  for (const v of KNOWN_VERBS) {
    if (!SCORED_VERBS.has(v)) problems.push(`verb "${v}" is in KNOWN_VERBS but deltaFor cannot score it`)
  }
  for (const v of SCORED_VERBS) {
    if (!KNOWN_VERBS.has(v)) problems.push(`verb "${v}" is scored but missing from KNOWN_VERBS — catalog quests using it are dropped`)
  }
  return problems
}

if (import.meta.env.DEV) {
  const problems = checkQuestVerbs()
  if (problems.length) console.error('[season] quest verb mismatch:\n' + problems.join('\n'))
}
