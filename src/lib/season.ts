// Pilgrimage reward math — the client half.
//
// Like every reward rule in this app, this exists twice: once here in
// TypeScript for guests, once in SQL for accounts (award_season_miles /
// track_quest, migration 0056). KEEP THEM IN SYNC — change one, change the
// other, or guests and accounts quietly walk different roads.
//
// Miles are deliberately NOT xp. profiles.xp is the worldwide leaderboard
// (0006_leaderboard.sql); miles appear on no board, feed no level, and are
// never shown next to another player's number. That is what lets the Study tab
// pay them at all — see lib/drops.ts for the same argument about relics.
//
// ON QUEST GENERATION: the server does not generate quests, on purpose. The
// list is a pure function of (roadId, dayNumber) computed here, and the server
// only stores progress against whatever quest id it is handed. Mirroring a
// seeded PRNG in plpgsql would be fragile in exactly the way that produces two
// different quest lists for the same day. The server stays authoritative over
// the thing that matters — it clamps the miles a quest can pay from the id's
// own prefix, so a client cannot mint miles. A client that completed a quest it
// was never issued gains a cosmetic it would have reached by playing anyway,
// which is bounded and buys nothing rankable.

/** Miles per waystation. Flat, not a curve: a pass wants a metronome, and the
 *  appeal is a predictable "two more days to the next thing". (levelInfo()'s
 *  ~35% compounding ramp is right for a lifetime level and wrong for this.) */
export const MILES_PER_WAYSTATION = 1000

/** Every way miles are earned. Keep in sync with award_season_miles. */
export const MILES = {
  /** Flat part of finishing any quiz run, in any mode. */
  quizBase: 40,
  /** Per correct answer, on top of the base. */
  quizPerCorrect: 4,
  /** First play of the local day — the daily drop's own nudge. */
  dailyFirst: 100,
  chestOpen: 60,
  /** First chapter opened each local day. Reading is a footprint, not a grind. */
  chapterRead: 50,
  shareDaily: 75,
  donate: 50,
  questDaily: 250,
  questWeekly: 600,
} as const

/** Server-side ceiling for a single award, by source. The client sends what it
 *  thinks it earned and the server clamps — same shape as submit_focus_practice.
 *  Keep in sync with the `v_cap` case in award_season_miles. */
export const MILES_CAP: Record<string, number> = {
  quiz: MILES.quizBase + MILES.quizPerCorrect * 10,
  daily: MILES.dailyFirst,
  chest: MILES.chestOpen,
  chapter: MILES.chapterRead,
  share: MILES.shareDaily,
  donate: MILES.donate,
  quest_daily: MILES.questDaily,
  quest_weekly: MILES.questWeekly,
}

/** Road weekends: Friday through Sunday, local, everything pays double. One
 *  rule, and it gives the season a heartbeat. Keep in sync with the SQL. */
export function isRoadWeekend(d: Date = new Date()): boolean {
  const day = d.getDay()
  return day === 5 || day === 6 || day === 0
}

export function waystationFor(miles: number): number {
  return Math.floor(Math.max(0, miles) / MILES_PER_WAYSTATION)
}

/** Miles banked since the current waystation, and what the next one costs. */
export function milesProgress(miles: number): { into: number; span: number; pct: number } {
  const into = Math.max(0, miles) % MILES_PER_WAYSTATION
  return { into, span: MILES_PER_WAYSTATION, pct: into / MILES_PER_WAYSTATION }
}

// ── Quests ───────────────────────────────────────────────────────────────────

/** What a quest watches. Every verb is self-vs-self or self-vs-CPU: `cpu_wins`
 *  is the only "beat something" verb and the something is a simulation, which
 *  is the line CpuVersusQuiz already draws. */
export type QuestVerb =
  | 'play_daily'
  | 'answer_correct'
  | 'perfect_run'
  | 'combo'
  | 'read_chapters'
  | 'study_runs'
  | 'cpu_wins'
  | 'save_verses'
  | 'donate'
  | 'share_daily'
  | 'open_chest'

export interface QuestDef {
  key: string
  verb: QuestVerb
  goal: number
  text: string
}

/** The daily pool. Three are drawn from it each day. */
export const DAILY_QUESTS: QuestDef[] = [
  { key: 'd_play', verb: 'play_daily', goal: 1, text: 'Play today’s drop' },
  { key: 'd_correct', verb: 'answer_correct', goal: 10, text: 'Answer 10 questions correctly' },
  { key: 'd_study', verb: 'study_runs', goal: 2, text: 'Finish 2 study runs' },
  { key: 'd_read', verb: 'read_chapters', goal: 1, text: 'Read a chapter in your Bible' },
  { key: 'd_chest', verb: 'open_chest', goal: 1, text: 'Open the Daily Chest' },
  { key: 'd_perfect', verb: 'perfect_run', goal: 1, text: 'Finish a run with no misses' },
  { key: 'd_combo', verb: 'combo', goal: 4, text: 'Hit a 4× combo' },
  { key: 'd_save', verb: 'save_verses', goal: 1, text: 'Keep a verse' },
  { key: 'd_cpu', verb: 'cpu_wins', goal: 1, text: 'Beat the CPU once' },
]

/** The weekly pool. Five are drawn each week, and they last until the road ends. */
export const WEEKLY_QUESTS: QuestDef[] = [
  { key: 'w_correct', verb: 'answer_correct', goal: 60, text: 'Answer 60 questions correctly' },
  { key: 'w_study', verb: 'study_runs', goal: 10, text: 'Finish 10 study runs' },
  { key: 'w_read', verb: 'read_chapters', goal: 7, text: 'Read 7 chapters' },
  { key: 'w_cpu', verb: 'cpu_wins', goal: 3, text: 'Beat the CPU 3 times' },
  { key: 'w_share', verb: 'share_daily', goal: 2, text: 'Share the daily verse twice' },
  { key: 'w_donate', verb: 'donate', goal: 2, text: 'Give 2 relics to your church' },
  { key: 'w_perfect', verb: 'perfect_run', goal: 3, text: 'Finish 3 runs with no misses' },
  { key: 'w_play', verb: 'play_daily', goal: 5, text: 'Play the drop on 5 days' },
  { key: 'w_save', verb: 'save_verses', goal: 5, text: 'Keep 5 verses' },
]

export interface Quest extends QuestDef {
  /** Stable id: `d:<road>:<day>:<key>` or `w:<road>:<week>:<key>`. The prefix is
   *  what the server reads to decide what this quest may pay. */
  id: string
  kind: 'daily' | 'weekly'
  miles: number
  /** One weekly a week is gilded and pays double. */
  gilded?: boolean
}

// FNV-1a → mulberry32. Same family as the per-person hash in ChurchScene, and
// used the same way: a stable shuffle from a string seed, so the same day
// produces the same quests for every player, forever.
function seedFrom(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function rng(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(pool: T[], n: number, seed: string): T[] {
  const r = rng(seedFrom(seed))
  const copy = [...pool]
  // Fisher-Yates with the seeded generator.
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, n)
}

/** The three dailies for a given road day. Identical for every player. */
export function dailyQuests(roadId: string, day: number): Quest[] {
  return pick(DAILY_QUESTS, 3, `${roadId}:d:${day}`).map((q) => ({
    ...q,
    id: `d:${roadId}:${day}:${q.key}`,
    kind: 'daily' as const,
    miles: MILES.questDaily,
  }))
}

/**
 * The five weeklies for a given road week. They are issued once and persist to
 * the end of the road — miss a week and you lose nothing, you just have more to
 * do later. That is the single most important anti-shame mechanic here.
 */
export function weeklyQuests(roadId: string, week: number): Quest[] {
  const chosen = pick(WEEKLY_QUESTS, 5, `${roadId}:w:${week}`)
  // One gilded weekly per week, also seeded, paying double.
  const gildedAt = Math.floor(rng(seedFrom(`${roadId}:g:${week}`))() * chosen.length)
  return chosen.map((q, i) => ({
    ...q,
    id: `w:${roadId}:${week}:${q.key}`,
    kind: 'weekly' as const,
    gilded: i === gildedAt,
    miles: i === gildedAt ? MILES.questWeekly * 2 : MILES.questWeekly,
  }))
}

/** Every quest currently live: today's three, plus every week issued so far. */
export function activeQuests(roadId: string, day: number): Quest[] {
  const week = Math.floor(day / 7)
  const weeks: Quest[] = []
  for (let w = 0; w <= week; w++) weeks.push(...weeklyQuests(roadId, w))
  return [...dailyQuests(roadId, day), ...weeks]
}

/** The replacement offered when a daily is rerolled — deterministic too, so a
 *  reroll can't be re-rolled for a better one by reloading. */
export function rerollFor(roadId: string, day: number, questKey: string): Quest {
  const taken = new Set(dailyQuests(roadId, day).map((q) => q.key))
  const pool = DAILY_QUESTS.filter((q) => !taken.has(q.key))
  const chosen = pick(pool.length ? pool : DAILY_QUESTS, 1, `${roadId}:r:${day}:${questKey}`)[0]
  return {
    ...chosen,
    id: `d:${roadId}:${day}:${chosen.key}:r`,
    kind: 'daily',
    miles: MILES.questDaily,
  }
}

/** What a quest id is allowed to pay, read from its prefix — the same check the
 *  server makes. Returns 0 for an id it doesn't recognise. */
export function questMilesCap(id: string): number {
  if (id.startsWith('d:')) return MILES.questDaily
  if (id.startsWith('w:')) return MILES.questWeekly * 2 // a gilded weekly is the ceiling
  return 0
}
