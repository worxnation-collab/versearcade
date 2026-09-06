// Pilgrimage reward math — the client half.
//
// Like every reward rule in this app, this exists twice: once here in
// TypeScript for guests, once in SQL for accounts (award_season_miles /
// track_quest, migration 0058). KEEP THEM IN SYNC — change one, change the
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
 *  and `battle_wins` are the only "beat something" verbs, and neither is ever
 *  compared against another player's count — winning a battle is a thing you
 *  did, not a place you hold.
 *
 * THIS LIST IS THE PREPACK, AND IT IS WHY IT IS LONGER THAN THE POOLS BELOW.
 * A road's quests are content (see RoadDef.daily/weekly in data/season.ts) and
 * can arrive from the remote catalog long after a binary shipped — but a verb
 * is CODE. `deltaFor` in store/season.ts is what turns an event into progress,
 * so a remote quest can only use a verb the installed app already understands.
 * Every verb here has a live emit site today, even when no bundled quest uses
 * it, precisely so a future season can reach for it without an App Store
 * submission. Adding a verb is the one part of a season that still needs a
 * release, so add them generously and early.
 *
 * The matching guard is KNOWN_VERBS: a catalog quest naming a verb this build
 * doesn't have is DROPPED, never shown. An unknown verb scores 0 forever, so
 * showing it would hand the player a daily they can't finish — the one failure
 * mode this feature must not have.
 */
export type QuestVerb =
  // ── Shipped with the Harvest Road ──
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
  // ── Prepacked for future roads (no bundled quest uses these yet) ──
  /** Any finished run, in any mode — not just the daily drop. */
  | 'play_any'
  /** `goal` correct answers in ONE run, rather than added up across the day. */
  | 'answers_in_run'
  /** Focus drills finished (Study tab). */
  | 'focus_drills'
  /** Replay runs finished (Study tab). */
  | 'replay_runs'
  /** Real battles won — against a person, but never ranked against them. */
  | 'battle_wins'
  /** Real battles played, won or lost. Showing up is the whole verb. */
  | 'battles_played'
  /**
   * Statues raised in the churchyard after a weekly rivalry win (0075).
   *
   * Scores the RAISING, never the winning: a road quest may ask a congregation
   * to put its trophy up, and must not be able to ask it to beat somebody. A
   * verb for the win itself would make a season quest out of another church
   * losing, which is the one thing the rivalry's design forbids.
   */
  | 'statue_raised'
  /** Decorations placed in the keep's hall. */
  | 'place_decor'
  /** Plants set in the churchyard. */
  | 'plant_flora'
  /** Relics found by studying (study drops). */
  | 'find_relic'
  /** Grand decorations offered from the hall to your church. */
  | 'give_offering'
  /** Soundtrack rooms walked into for the first time. */
  | 'unlock_track'
  /** A pet put out beside your character. */
  | 'equip_pet'
  /** Another player's feet washed — the Basin (John 13:14). */
  | 'wash_feet'
  /** Candles held for other people's notes on the Prayer Wall (Galatians 6:2). */
  | 'pray_for'
  /** Arcade runs finished — any tap game on the cabinet (features/arcade). */
  | 'arcade_runs'
  /** Things correctly taken in tap games, added up across runs. */
  | 'arcade_gathered'
  /** Rest rounds kept — a quota-0 round finished without a single tap. */
  | 'keep_rest'
  /** Furnishings set in your own Upper Room. */
  | 'furnish_room'
  /** Other players' rooms visited. */
  | 'visit_room'
  /** Relics given to another player, which cost the giver the item. */
  | 'give_gift'
  /** Practice prayers said in the Upper Room. */
  | 'pray'
  /**
   * Books checked out from the librarian in the Study tab's lending library.
   *
   * Scores the LONG WAY ROUND, never the studying: every checkout ends on a
   * study surface the shelf already offers, so a quest naming this verb asks a
   * player to visit the room rather than to practise more. Study's rank-free
   * rule is untouched by it — a road may notice you went to the library, and
   * may not notice how you did once you got there.
   */
  | 'borrow_book'

/**
 * Every verb this build can actually score. Anything outside it is dropped on
 * the way in — see `sanitizeQuestDefs`.
 *
 * Keep in sync with the switch in store/season.ts:deltaFor. The two are checked
 * against each other by `checkQuestVerbs()` in store/season.ts, which runs at
 * import in dev for the same reason `checkTrackData()` does in data/music.ts:
 * a verb listed here but missing from the switch is a quest that silently
 * never completes.
 */
export const KNOWN_VERBS = new Set<string>([
  'play_daily',
  'answer_correct',
  'perfect_run',
  'combo',
  'read_chapters',
  'study_runs',
  'cpu_wins',
  'save_verses',
  'donate',
  'share_daily',
  'open_chest',
  'play_any',
  'answers_in_run',
  'focus_drills',
  'replay_runs',
  'battle_wins',
  'battles_played',
  'statue_raised',
  'place_decor',
  'plant_flora',
  'find_relic',
  'give_offering',
  'unlock_track',
  'equip_pet',
  'wash_feet',
  'pray_for',
  'furnish_room',
  'visit_room',
  'give_gift',
  'pray',
  'arcade_runs',
  'arcade_gathered',
  'keep_rest',
  'borrow_book',
])

export interface QuestDef {
  key: string
  verb: QuestVerb
  goal: number
  text: string
}

/**
 * Drop any quest this build can't score, and any that is malformed.
 *
 * Catalog quests are content written months after the binary shipped, so this
 * is the boundary that keeps a bad row from becoming an uncompletable daily.
 * Bundled pools go through it too — one code path, no "trusted" input.
 */
export function sanitizeQuestDefs(defs: unknown): QuestDef[] {
  if (!Array.isArray(defs)) return []
  const seen = new Set<string>()
  const out: QuestDef[] = []
  for (const d of defs) {
    if (!d || typeof d !== 'object') continue
    const { key, verb, goal, text } = d as Partial<QuestDef>
    if (typeof key !== 'string' || !key) continue
    if (typeof verb !== 'string' || !KNOWN_VERBS.has(verb)) continue
    if (typeof text !== 'string' || !text.trim()) continue
    // The server clamps a goal to 1..1000 (track_season_quest, 0058); matching
    // that here means the client never shows a bar it can't fill.
    if (typeof goal !== 'number' || !Number.isFinite(goal) || goal < 1 || goal > 1000) continue
    if (seen.has(key)) continue // a duplicate key would collide as a quest id
    seen.add(key)
    out.push({ key, verb: verb as QuestVerb, goal: Math.floor(goal), text })
  }
  return out
}

/**
 * The daily pool. Three are drawn from it each day.
 *
 * DO NOT ADD TO OR REORDER THIS ARRAY WHILE A ROAD USING IT IS LIVE. `pick()`
 * shuffles the whole pool from a day seed, so one extra entry re-draws every
 * day's three — two players on different app versions would see different
 * dailies on the same date, which is the shared-drop promise broken. A new road
 * carries its OWN pools (`RoadDef.daily` / `.weekly`) instead; this one belongs
 * to the Harvest Road now and is effectively frozen.
 */
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

/**
 * The pools one road draws from. A road that names neither gets the bundled
 * ones, which is what keeps the Harvest Road exactly as it shipped.
 *
 * A ROAD'S POOLS ARE FROZEN ONCE IT STARTS, for the same reason the bundled
 * pool is: the draw is a seeded shuffle of the whole array, so editing it
 * mid-road re-draws every remaining day. Publish a catalog road's quests before
 * its `start`, and after that only ever fix a `text` typo — never add, remove
 * or reorder.
 */
export interface QuestPools {
  daily: QuestDef[]
  weekly: QuestDef[]
}

// ── The Lamplight Road's pools ───────────────────────────────────────────────
// A road's pools are FROZEN once it starts (the draw is a seeded shuffle of the
// whole array, so adding one entry re-deals every remaining day). These are
// written before 2026-11-11 and must not be touched after it except to fix a
// `text` typo.
//
// They lean on verbs that were PREPACKED and never used by a bundled quest —
// pray, wash_feet, arcade_runs, visit_room, borrow_book, find_relic — which is
// the whole reason the verb list was written far ahead of the quests using it.
// A short road wants smaller goals: twelve waystations over eighteen days.
export const LAMPLIGHT_DAILY: QuestDef[] = [
  { key: 'l_play', verb: 'play_daily', goal: 1, text: 'Play today’s drop' },
  { key: 'l_correct', verb: 'answer_correct', goal: 10, text: 'Answer 10 questions correctly' },
  { key: 'l_pray', verb: 'pray', goal: 1, text: 'Say a prayer in your Upper Room' },
  { key: 'l_read', verb: 'read_chapters', goal: 1, text: 'Read a chapter in your Bible' },
  { key: 'l_study', verb: 'study_runs', goal: 2, text: 'Finish 2 study runs' },
  { key: 'l_chest', verb: 'open_chest', goal: 1, text: 'Open the Daily Chest' },
  { key: 'l_wash', verb: 'wash_feet', goal: 2, text: 'Wash 2 players’ feet' },
  { key: 'l_borrow', verb: 'borrow_book', goal: 1, text: 'Borrow a book from Tabitha' },
  { key: 'l_arcade', verb: 'arcade_runs', goal: 2, text: 'Play 2 rounds in the arcade' },
  { key: 'l_save', verb: 'save_verses', goal: 1, text: 'Keep a verse' },
]

export const LAMPLIGHT_WEEKLY: QuestDef[] = [
  { key: 'lw_correct', verb: 'answer_correct', goal: 50, text: 'Answer 50 questions correctly' },
  { key: 'lw_read', verb: 'read_chapters', goal: 6, text: 'Read 6 chapters' },
  { key: 'lw_pray', verb: 'pray', goal: 7, text: 'Say 7 prayers' },
  { key: 'lw_relic', verb: 'find_relic', goal: 3, text: 'Find 3 relics by studying' },
  { key: 'lw_wash', verb: 'wash_feet', goal: 10, text: 'Wash 10 players’ feet' },
  { key: 'lw_prayfor', verb: 'pray_for', goal: 5, text: 'Hold a candle for 5 notes on the Prayer Wall' },
  { key: 'lw_play', verb: 'play_daily', goal: 5, text: 'Play the drop on 5 days' },
  { key: 'lw_track', verb: 'unlock_track', goal: 1, text: 'Walk into a room you haven’t heard yet' },
  { key: 'lw_study', verb: 'study_runs', goal: 8, text: 'Finish 8 study runs' },
]

// ── The Advent Road's pools ─────────────────────────────────────────────────
// Same freeze rule: written before 2026-11-29 and not touched after it.
// Thirty waystations over thirty-eight days, so the goals sit slightly above
// the Lamplight Road's and slightly under the Harvest Road's.
export const ADVENT_DAILY: QuestDef[] = [
  { key: 'a_play', verb: 'play_daily', goal: 1, text: 'Play today’s drop' },
  { key: 'a_correct', verb: 'answer_correct', goal: 12, text: 'Answer 12 questions correctly' },
  { key: 'a_read', verb: 'read_chapters', goal: 1, text: 'Read a chapter in your Bible' },
  { key: 'a_pray', verb: 'pray', goal: 1, text: 'Say a prayer in your Upper Room' },
  { key: 'a_chest', verb: 'open_chest', goal: 1, text: 'Open the Daily Chest' },
  { key: 'a_study', verb: 'study_runs', goal: 2, text: 'Finish 2 study runs' },
  { key: 'a_perfect', verb: 'perfect_run', goal: 1, text: 'Finish a run with no misses' },
  { key: 'a_prayfor', verb: 'pray_for', goal: 1, text: 'Hold a candle on the Prayer Wall' },
  { key: 'a_save', verb: 'save_verses', goal: 1, text: 'Keep a verse' },
  { key: 'a_combo', verb: 'combo', goal: 4, text: 'Hit a 4× combo' },
  { key: 'a_battle', verb: 'battles_played', goal: 1, text: 'Play a battle, win or lose' },
  { key: 'a_room', verb: 'furnish_room', goal: 1, text: 'Set something in your Upper Room' },
]

export const ADVENT_WEEKLY: QuestDef[] = [
  { key: 'aw_correct', verb: 'answer_correct', goal: 60, text: 'Answer 60 questions correctly' },
  { key: 'aw_read', verb: 'read_chapters', goal: 7, text: 'Read 7 chapters' },
  { key: 'aw_pray', verb: 'pray', goal: 10, text: 'Say 10 prayers' },
  { key: 'aw_prayfor', verb: 'pray_for', goal: 7, text: 'Hold a candle for 7 notes on the Prayer Wall' },
  { key: 'aw_play', verb: 'play_daily', goal: 5, text: 'Play the drop on 5 days' },
  { key: 'aw_battles', verb: 'battles_played', goal: 5, text: 'Play 5 battles, won or lost' },
  { key: 'aw_donate', verb: 'donate', goal: 2, text: 'Give 2 relics to your church' },
  { key: 'aw_gift', verb: 'give_gift', goal: 1, text: 'Give a relic to another player' },
  { key: 'aw_visit', verb: 'visit_room', goal: 3, text: 'Visit 3 players’ Upper Rooms' },
  { key: 'aw_study', verb: 'study_runs', goal: 10, text: 'Finish 10 study runs' },
]

// ── The Jordan Road's pools (Epiphany) ──────────────────────────────────────
// Frozen at 2027-01-07, like every road's. See the note on LAMPLIGHT_DAILY.
export const JORDAN_DAILY: QuestDef[] = [
  { key: 'j_play', verb: 'play_daily', goal: 1, text: 'Play today’s drop' },
  { key: 'j_correct', verb: 'answer_correct', goal: 12, text: 'Answer 12 questions correctly' },
  { key: 'j_read', verb: 'read_chapters', goal: 1, text: 'Read a chapter in your Bible' },
  { key: 'j_wash', verb: 'wash_feet', goal: 3, text: 'Wash 3 players’ feet' },
  { key: 'j_study', verb: 'study_runs', goal: 2, text: 'Finish 2 study runs' },
  { key: 'j_chest', verb: 'open_chest', goal: 1, text: 'Open the Daily Chest' },
  { key: 'j_borrow', verb: 'borrow_book', goal: 1, text: 'Borrow a book from Tabitha' },
  { key: 'j_save', verb: 'save_verses', goal: 2, text: 'Keep 2 verses' },
  { key: 'j_pray', verb: 'pray', goal: 1, text: 'Say a prayer in your Upper Room' },
  { key: 'j_share', verb: 'share_daily', goal: 1, text: 'Share today’s verse' },
]

export const JORDAN_WEEKLY: QuestDef[] = [
  { key: 'jw_correct', verb: 'answer_correct', goal: 60, text: 'Answer 60 questions correctly' },
  { key: 'jw_read', verb: 'read_chapters', goal: 7, text: 'Read 7 chapters' },
  { key: 'jw_wash', verb: 'wash_feet', goal: 15, text: 'Wash 15 players’ feet' },
  { key: 'jw_prayfor', verb: 'pray_for', goal: 7, text: 'Hold a candle for 7 notes on the Prayer Wall' },
  { key: 'jw_play', verb: 'play_daily', goal: 5, text: 'Play the drop on 5 days' },
  { key: 'jw_study', verb: 'study_runs', goal: 10, text: 'Finish 10 study runs' },
  { key: 'jw_relic', verb: 'find_relic', goal: 4, text: 'Find 4 relics by studying' },
  { key: 'jw_save', verb: 'save_verses', goal: 8, text: 'Keep 8 verses' },
  { key: 'jw_battles', verb: 'battles_played', goal: 4, text: 'Play 4 battles, won or lost' },
]

// ── The Wilderness Road's pools (Lent) ──────────────────────────────────────
// Leans on praying and the Prayer Wall harder than any other road, which is the
// one place a season is allowed to have a character: Lent's own practices are
// prayer and giving, and both are verbs this app already scores. It asks for
// nothing a player cannot do alone.
export const WILDERNESS_DAILY: QuestDef[] = [
  { key: 'w_play', verb: 'play_daily', goal: 1, text: 'Play today’s drop' },
  { key: 'w_pray', verb: 'pray', goal: 2, text: 'Say 2 prayers in your Upper Room' },
  { key: 'w_prayfor', verb: 'pray_for', goal: 2, text: 'Hold a candle for 2 notes on the Prayer Wall' },
  { key: 'w_read', verb: 'read_chapters', goal: 2, text: 'Read 2 chapters in your Bible' },
  { key: 'w_correct', verb: 'answer_correct', goal: 12, text: 'Answer 12 questions correctly' },
  { key: 'w_study', verb: 'study_runs', goal: 2, text: 'Finish 2 study runs' },
  { key: 'w_donate', verb: 'donate', goal: 1, text: 'Give a relic to your church' },
  { key: 'w_chest', verb: 'open_chest', goal: 1, text: 'Open the Daily Chest' },
  { key: 'w_wash', verb: 'wash_feet', goal: 3, text: 'Wash 3 players’ feet' },
  { key: 'w_save', verb: 'save_verses', goal: 2, text: 'Keep 2 verses' },
]

export const WILDERNESS_WEEKLY: QuestDef[] = [
  { key: 'ww_pray', verb: 'pray', goal: 14, text: 'Say 14 prayers' },
  { key: 'ww_prayfor', verb: 'pray_for', goal: 12, text: 'Hold a candle for 12 notes on the Prayer Wall' },
  { key: 'ww_read', verb: 'read_chapters', goal: 10, text: 'Read 10 chapters' },
  { key: 'ww_correct', verb: 'answer_correct', goal: 70, text: 'Answer 70 questions correctly' },
  { key: 'ww_donate', verb: 'donate', goal: 3, text: 'Give 3 relics to your church' },
  { key: 'ww_gift', verb: 'give_gift', goal: 2, text: 'Give 2 relics to other players' },
  { key: 'ww_wash', verb: 'wash_feet', goal: 20, text: 'Wash 20 players’ feet' },
  { key: 'ww_play', verb: 'play_daily', goal: 6, text: 'Play the drop on 6 days' },
  { key: 'ww_study', verb: 'study_runs', goal: 12, text: 'Finish 12 study runs' },
]

// ── The Emmaus Road's pools (Eastertide) ────────────────────────────────────
// The outward-facing road: sharing, battling, visiting, giving. Eastertide is
// the season of going and telling, and every verb below is one that involves
// somebody else — while still never asking a player to BEAT anybody
// (`battles_played`, not `battle_wins`).
export const EMMAUS_DAILY: QuestDef[] = [
  { key: 'e_play', verb: 'play_daily', goal: 1, text: 'Play today’s drop' },
  { key: 'e_share', verb: 'share_daily', goal: 1, text: 'Share today’s verse' },
  { key: 'e_battle', verb: 'battles_played', goal: 2, text: 'Play 2 battles, won or lose' },
  { key: 'e_correct', verb: 'answer_correct', goal: 14, text: 'Answer 14 questions correctly' },
  { key: 'e_visit', verb: 'visit_room', goal: 2, text: 'Visit 2 players’ Upper Rooms' },
  { key: 'e_wash', verb: 'wash_feet', goal: 3, text: 'Wash 3 players’ feet' },
  { key: 'e_study', verb: 'study_runs', goal: 2, text: 'Finish 2 study runs' },
  { key: 'e_read', verb: 'read_chapters', goal: 1, text: 'Read a chapter in your Bible' },
  { key: 'e_arcade', verb: 'arcade_runs', goal: 3, text: 'Play 3 rounds in the arcade' },
  { key: 'e_perfect', verb: 'perfect_run', goal: 1, text: 'Finish a run with no misses' },
]

export const EMMAUS_WEEKLY: QuestDef[] = [
  { key: 'ew_share', verb: 'share_daily', goal: 4, text: 'Share the daily verse 4 times' },
  { key: 'ew_battles', verb: 'battles_played', goal: 8, text: 'Play 8 battles, won or lost' },
  { key: 'ew_visit', verb: 'visit_room', goal: 5, text: 'Visit 5 players’ Upper Rooms' },
  { key: 'ew_gift', verb: 'give_gift', goal: 2, text: 'Give 2 relics to other players' },
  { key: 'ew_correct', verb: 'answer_correct', goal: 70, text: 'Answer 70 questions correctly' },
  { key: 'ew_wash', verb: 'wash_feet', goal: 20, text: 'Wash 20 players’ feet' },
  { key: 'ew_read', verb: 'read_chapters', goal: 7, text: 'Read 7 chapters' },
  { key: 'ew_play', verb: 'play_daily', goal: 6, text: 'Play the drop on 6 days' },
  { key: 'ew_arcade', verb: 'arcade_runs', goal: 12, text: 'Play 12 rounds in the arcade' },
]

// ── The Sower's Road pools (Ordinary Time) ──────────────────────────────────
// The long one: 103 days. Goals sit slightly HIGHER than the other roads' and
// the road is proportionally longer, so the pace is identical — a summer season
// is not a harder season, it is a longer one.
export const SOWER_DAILY: QuestDef[] = [
  { key: 's_play', verb: 'play_daily', goal: 1, text: 'Play today’s drop' },
  { key: 's_correct', verb: 'answer_correct', goal: 14, text: 'Answer 14 questions correctly' },
  { key: 's_read', verb: 'read_chapters', goal: 2, text: 'Read 2 chapters in your Bible' },
  { key: 's_study', verb: 'study_runs', goal: 3, text: 'Finish 3 study runs' },
  { key: 's_plant', verb: 'plant_flora', goal: 1, text: 'Plant something in your churchyard' },
  { key: 's_room', verb: 'furnish_room', goal: 1, text: 'Set something in your Upper Room' },
  { key: 's_decor', verb: 'place_decor', goal: 1, text: 'Put something out in the keep’s hall' },
  { key: 's_chest', verb: 'open_chest', goal: 1, text: 'Open the Daily Chest' },
  { key: 's_arcade', verb: 'arcade_runs', goal: 3, text: 'Play 3 rounds in the arcade' },
  { key: 's_pray', verb: 'pray', goal: 1, text: 'Say a prayer in your Upper Room' },
  { key: 's_relic', verb: 'find_relic', goal: 1, text: 'Find a relic by studying' },
  { key: 's_combo', verb: 'combo', goal: 5, text: 'Hit a 5× combo' },
]

export const SOWER_WEEKLY: QuestDef[] = [
  { key: 'sw_correct', verb: 'answer_correct', goal: 80, text: 'Answer 80 questions correctly' },
  { key: 'sw_read', verb: 'read_chapters', goal: 12, text: 'Read 12 chapters' },
  { key: 'sw_study', verb: 'study_runs', goal: 14, text: 'Finish 14 study runs' },
  { key: 'sw_donate', verb: 'donate', goal: 3, text: 'Give 3 relics to your church' },
  { key: 'sw_relic', verb: 'find_relic', goal: 6, text: 'Find 6 relics by studying' },
  { key: 'sw_plant', verb: 'plant_flora', goal: 3, text: 'Plant 3 things in your churchyard' },
  { key: 'sw_play', verb: 'play_daily', goal: 6, text: 'Play the drop on 6 days' },
  { key: 'sw_offering', verb: 'give_offering', goal: 1, text: 'Offer a Grand piece to your church' },
  { key: 'sw_track', verb: 'unlock_track', goal: 1, text: 'Walk into a room you haven’t heard yet' },
  { key: 'sw_wash', verb: 'wash_feet', goal: 20, text: 'Wash 20 players’ feet' },
]

export const BUNDLED_POOLS = (): QuestPools => ({ daily: DAILY_QUESTS, weekly: WEEKLY_QUESTS })

/** The three dailies for a given road day. Identical for every player. */
export function dailyQuests(roadId: string, day: number, pools: QuestPools = BUNDLED_POOLS()): Quest[] {
  return pick(pools.daily, 3, `${roadId}:d:${day}`).map((q) => ({
    ...q,
    id: `d:${roadId}:${day}:${q.key}`,
    kind: 'daily' as const,
    miles: MILES.questDaily,
  }))
}

/** How many weeklies a player holds at once. Five, on every road. */
export const WEEKLY_SLOTS = 5

/**
 * The five weeklies for a given road week. They are issued once and persist to
 * the end of the road — miss a week and you lose nothing, you just have more to
 * do later. That is the single most important anti-shame mechanic here.
 *
 * THIS IS THE ORIGINAL, ACCUMULATING DRAW, and it is kept for the Harvest Road
 * ALONE. Every road after it uses `rollingWeeklies` below; see the note there
 * for what went wrong and why this one cannot simply be fixed in place.
 */
export function weeklyQuests(
  roadId: string,
  week: number,
  pools: QuestPools = BUNDLED_POOLS(),
): Quest[] {
  const chosen = pick(pools.weekly, WEEKLY_SLOTS, `${roadId}:w:${week}`)
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

/**
 * FIVE WEEKLIES, TOPPED UP — the draw every road after Harvest uses.
 *
 * ## What was wrong
 *
 * The original draw issues five fresh weeklies every week and never retires
 * one, so the list is `5 x weeks` long and each week re-shuffles the SAME small
 * pool. Measured on the real roads rather than reasoned about: on its last day
 * the Harvest Road shows **55 weekly rows drawn from 9 lines**, with one line
 * repeated ten times; the Sower's Road would show **75 rows from 10 lines**.
 *
 * Three separate failures come out of that, and only the first is cosmetic:
 *
 * 1. The same sentence appears several times in a row, which reads as broken.
 * 2. `advanceQuests` advances EVERY live quest watching a verb, so one action
 *    completes every open copy at once and pays for each of them.
 * 3. A wall of 75 rows is unusable, and it is unusable even if every line in it
 *    were distinct — which is the reason "just write a bigger pool" is not the
 *    fix. Removing repeats from the Sower's Road needs 75 genuinely different
 *    weekly asks, and there are not 75 different things worth asking.
 *
 * ## The rule
 *
 * A player holds exactly FIVE weeklies. At the start of each week the ones
 * finished in earlier weeks are replaced; the ones still open are not touched.
 *
 * That keeps the promise the accumulating draw was built for — **an unfinished
 * weekly is never taken away** — and drops the thing that promise did not
 * require, which is that finished ones pile up forever. It also makes the list
 * honest: five things you have not done, rather than seventy-five rows in which
 * they are hidden.
 *
 * Nothing is lost by it. A player who clears five a week is issued five a week,
 * so the miles available over a road are unchanged for anyone actually doing
 * them; only a lapsed player is issued fewer, and those were quests they were
 * never going to finish. Nothing counts completed quests anywhere — no Journal
 * rung, no total, no RPC — so a finished weekly leaving the list costs no record.
 *
 * ## Why the Harvest Road keeps the old one
 *
 * Its pools froze when it started (2026-08-27) and it is mid-road with real
 * players on it. Changing the draw under them would re-deal every remaining
 * week, which is the exact failure the freeze rule exists to prevent — so this
 * is opted into per road by `RoadDef.rollingWeeklies`, and Harvest simply does
 * not set it. Verified byte-identical afterwards rather than assumed.
 *
 * ## The one subtlety
 *
 * The sweep runs for weeks that have ENDED, never for the current one. If it
 * ran on the current week, finishing a weekly would instantly replace it —
 * turning weeklies into dailies and snatching away the tick you just earned.
 * So a quest completed this week keeps its slot, and its ✓, until Monday.
 */
export function rollingWeeklies(
  roadId: string,
  week: number,
  pools: QuestPools,
  isDone: (questId: string) => boolean,
): Quest[] {
  // key -> the quest holding that slot. Insertion order is the display order,
  // so a long-open quest stays put rather than jumping around week to week.
  const held = new Map<string, Quest>()

  for (let w = 0; w <= week; w++) {
    const free = WEEKLY_SLOTS - held.size
    if (free > 0) {
      // Never re-issue something the player is already holding: that is the
      // duplicate row, and the double payout, closed at the source.
      const candidates = pools.weekly.filter((q) => !held.has(q.key))
      const chosen = pick(candidates, free, `${roadId}:w:${w}`)
      const gildedAt = Math.floor(rng(seedFrom(`${roadId}:g:${w}`))() * Math.max(1, chosen.length))
      for (let i = 0; i < chosen.length; i++) {
        const q = chosen[i]
        held.set(q.key, {
          ...q,
          id: `w:${roadId}:${w}:${q.key}`,
          kind: 'weekly' as const,
          gilded: i === gildedAt,
          miles: i === gildedAt ? MILES.questWeekly * 2 : MILES.questWeekly,
        })
      }
    }
    // Sweep only weeks that are OVER — see "the one subtlety" above.
    if (w < week) {
      for (const [key, q] of [...held]) if (isDone(q.id)) held.delete(key)
    }
  }

  return [...held.values()]
}

/** Every quest currently live: today's three, plus every week issued so far. */
export function activeQuests(
  roadId: string,
  day: number,
  pools: QuestPools = BUNDLED_POOLS(),
  opts?: {
    /** The road opts into the five-slot draw (`RoadDef.rollingWeeklies`). */
    rolling?: boolean
    /** Whether a quest id has been completed. Required for the rolling draw. */
    isDone?: (questId: string) => boolean
  },
): Quest[] {
  const week = Math.floor(day / 7)
  // Defaults to the accumulating draw, so a caller that passes nothing gets
  // exactly what it got before this existed — which is what keeps the Harvest
  // Road, and any old client, untouched.
  if (opts?.rolling && opts.isDone) {
    return [...dailyQuests(roadId, day, pools), ...rollingWeeklies(roadId, week, pools, opts.isDone)]
  }
  const weeks: Quest[] = []
  for (let w = 0; w <= week; w++) weeks.push(...weeklyQuests(roadId, w, pools))
  return [...dailyQuests(roadId, day, pools), ...weeks]
}

/** The replacement offered when a daily is rerolled — deterministic too, so a
 *  reroll can't be re-rolled for a better one by reloading. */
export function rerollFor(
  roadId: string,
  day: number,
  questKey: string,
  pools: QuestPools = BUNDLED_POOLS(),
): Quest {
  const taken = new Set(dailyQuests(roadId, day, pools).map((q) => q.key))
  const pool = pools.daily.filter((q) => !taken.has(q.key))
  const chosen = pick(pool.length ? pool : pools.daily, 1, `${roadId}:r:${day}:${questKey}`)[0]
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
