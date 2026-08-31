// The weekly rivalry — the one place in this app where losing is allowed.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS IS ALLOWED TO EXIST
//
// The house rule is "stickiness without shame": if a feature needs a loser, it
// is the wrong feature. That rule is about PEOPLE, and it is untouched. What
// changes here is that a CHURCH — an institution, not a person — may now lose a
// week. The distinction is the whole safety argument, so it is stated as three
// hard constraints that every surface below holds to:
//
//   NOBODY'S NAME IS EVER ON THE LOSING SIDE. A matchup has exactly two numbers
//   in it: your church's total and theirs. There is no per-member weekly board,
//   no "top contributor of the week", and the opponent's congregation is never
//   named, listed or drawn. `church_rivalry` (0075) returns two integers and a
//   church name — the data to build a shaming surface is not sent to the client
//   at all, which is the only way to be sure nobody builds one later.
//
//   LOSING COSTS NOTHING. There is no penalty, no demotion, no ladder to fall
//   down and no losing streak stored anywhere. A church that loses is exactly
//   where it started, minus nothing. The scoreboard resets to 0-0 every Monday,
//   so the worst week in the app's history is forgotten seven days later.
//
//   THE PRIZE IS A LOOK, NEVER A NUMBER THAT RANKS. A win buys a statue, and a
//   statue is a picture — it cannot be summed, ordered or compared against the
//   church next door. It is the same argument that lets a pet ride on a player
//   card (see CLAUDE.md): one id out of a fixed catalog, with no rarity label,
//   no count and no ordering. The church leaderboard is untouched by all of it.
//
// The virality bet, written down so a later session can check it: a church that
// recruits its congregation wins its week, the win is visible in the churchyard
// where visitors and prospective members see it, and "we beat them last week"
// is a sentence somebody says out loud at coffee hour. Nothing here works
// unless real people invite real people, which is the point.
//
// ─────────────────────────────────────────────────────────────────────────────
// KEEP IN SYNC with supabase/migrations/0075_church_rivalry.sql. As everywhere
// in this codebase, reward and eligibility maths exists twice — the SQL decides
// and this copy draws. The week maths, the size bands and the statue ids all
// have a mirror there. Change one, change the other.
//
// ONLINE-ONLY, inherited rather than chosen — the same break with the two-mode
// invariant `store/churchYard.ts` makes, for the same reason: the whole church
// feature is online-only because a church is a pooled, shared thing, and a
// rivalry additionally needs a second real congregation on the other end of it.
// A local weekly matchup is a church playing itself.

// ── The week ─────────────────────────────────────────────────────────────────
// A DELIBERATE EXCEPTION to the house "dates are the user's local date" rule,
// and the one place in the app that breaks it on purpose.
//
// Every other date here is local because a streak belongs to one person and
// should roll over at their midnight. A rivalry belongs to two congregations
// that may span several time zones, and every member of both has to agree about
// whether a gift landed inside the week or outside it. Two clocks means a point
// that counts for one member and not for another, which is the one bug this
// feature cannot survive. So the week is UTC, full stop, and both sides of the
// wire derive it from the same epoch rather than sending it.
//
// 2024-01-01 was a Monday, so weeks run Monday 00:00 UTC to Sunday 24:00 UTC.
const WEEK_EPOCH_UTC = Date.UTC(2024, 0, 1)
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** Which rivalry week a moment falls in. Mirrors `church_rivalry_week()`. */
import {
  clampToPercentBand,
  packPercent,
  unpackPercent,
  type PercentBand,
  type PercentPos,
} from '@/data/placement'

export function weekIndex(at: Date = new Date()): number {
  return Math.floor((at.getTime() - WEEK_EPOCH_UTC) / WEEK_MS)
}

/** The half-open window [start, end) a week covers, in UTC. */
export function weekWindow(week: number): { start: Date; end: Date } {
  const start = new Date(WEEK_EPOCH_UTC + week * WEEK_MS)
  return { start, end: new Date(start.getTime() + WEEK_MS) }
}

/** Milliseconds left in the current week — what the countdown reads. */
export function msLeftInWeek(at: Date = new Date()): number {
  return Math.max(0, weekWindow(weekIndex(at)).end.getTime() - at.getTime())
}

/**
 * "3 days left", "6 hours left", "Ends within the hour".
 *
 * Deliberately coarse. A live seconds ticker on a week-long contest is a
 * pressure device, and this is a feature about a congregation playing together
 * over a week, not a raid timer.
 */
export function timeLeftLabel(at: Date = new Date()): string {
  const ms = msLeftInWeek(at)
  const hours = Math.floor(ms / 3_600_000)
  if (hours >= 48) return `${Math.floor(hours / 24)} days left`
  if (hours >= 24) return '1 day left'
  if (hours >= 2) return `${hours} hours left`
  if (hours >= 1) return '1 hour left'
  return 'Ends within the hour'
}

// ── Size bands ───────────────────────────────────────────────────────────────
// Pairing is banded by congregation size rather than being uniformly random,
// and that choice is load-bearing for the whole idea.
//
// The churches this feature is FOR are the small ones that have just signed up
// and are trying to get their members playing. Against a purely random draw a
// four-person congregation meets a two-hundred-person one and loses every week
// forever, which teaches them the exact lesson the app must never teach: that
// showing up was pointless. Banding means a small church plays other small
// churches, so the week is winnable by out-recruiting somebody your own size —
// which is the behaviour the whole thing is trying to produce.
//
// KEEP IN SYNC with `church_rivalry_band()` in 0075.

export interface BandDef {
  /** Index, low to high. Also the value stored on a matchup row. */
  band: number
  /** Smallest member count in the band. */
  min: number
  /** Largest member count, or null for the open-ended top band. */
  max: number | null
  label: string
}

export const BANDS: BandDef[] = [
  { band: 0, min: 1, max: 2, label: 'Two or three gathered' },
  { band: 1, min: 3, max: 5, label: 'A small circle' },
  { band: 2, min: 6, max: 12, label: 'A full pew' },
  { band: 3, min: 13, max: 30, label: 'A congregation' },
  { band: 4, min: 31, max: 75, label: 'A full house' },
  { band: 5, min: 76, max: null, label: 'A packed sanctuary' },
]

export function bandFor(members: number): BandDef {
  const n = Math.max(0, Math.floor(members))
  return BANDS.find((b) => n >= b.min && (b.max === null || n <= b.max)) ?? BANDS[0]
}

export const bandLabel = (band: number): string =>
  BANDS.find((b) => b.band === band)?.label ?? 'A congregation'

// ── What a week can end as ───────────────────────────────────────────────────
// Four outcomes, and only one of them is a loss. Note that there is no
// 'forfeit', no 'no-show' and no way to be knocked out: the vocabulary itself
// is kept small so a future surface can't find a harsher word lying around.
export type RivalryOutcome =
  /** Still running. */
  | 'live'
  /** More points than the other church. Earns a statue. */
  | 'won'
  /** Both scored, and level. Both churches earn a statue — a tie is not a loss. */
  | 'drew'
  /** Fewer points. Costs nothing at all. */
  | 'lost'
  /** Nobody gave anything all week. Not a loss for either side, and no statue. */
  | 'quiet'
  /** No opponent was available in range this week. Not a loss, and no statue. */
  | 'bye'

// NOTE, because the habit in this codebase points the other way: there is
// deliberately NO client mirror of `church_rivalry_settle()` here.
//
// Reward math normally exists twice (lib/practice.ts <-> submit_practice, and
// so on) because a guest needs a local copy that agrees with the SQL. This
// feature has no guest path at all — it is online-only, and a locally-decided
// win would be a trophy you awarded yourself. So the outcome is decided in
// exactly one place, the server sends it, and the client only ever renders it.
// A second copy of the rules here would be dead code that nothing calls and
// nothing checks, which is the quiet way the two halves drift apart.
//
// For the record, since it is the interesting half of the decision: a DRAW pays
// both churches (the rule is that a church has to out-give somebody to win, and
// two congregations that gave exactly as much as each other both did that), and
// a 0-0 pays nobody (so a dormant opponent is never a free statue).

/** Whether an outcome banks a statue pick. */
export const outcomeEarnsStatue = (o: RivalryOutcome): boolean => o === 'won' || o === 'drew'

/**
 * The line the card shows for a finished week.
 *
 * Every one of these is written to be readable by the church that lost. There
 * is no "defeated", no "beaten", no exclamation mark on somebody else's win,
 * and the losing line points at the next week rather than at the last one —
 * a church can lose here, but it is never told it is a loser.
 */
export function outcomeLine(o: RivalryOutcome, opponent: string | null): string {
  switch (o) {
    case 'won':
      return 'Your church gave the most this week. Raise a statue in the yard.'
    case 'drew':
      return `Level with ${opponent ?? 'them'} to the point. Both churches raise a statue.`
    case 'lost':
      return `${opponent ?? 'They'} gave more this week. A new matchup starts Monday.`
    case 'quiet':
      return 'A quiet week — neither church put anything in. Monday starts a new one.'
    case 'bye':
      return 'No matchup this week. Your church keeps everything it has.'
    default:
      return ''
  }
}

// ── The statues ──────────────────────────────────────────────────────────────
// The prize. Eight figures, and the church PICKS which one to raise rather than
// being handed one, which is not a convenience — it is how this feature avoids
// telling a congregation which saints its tradition venerates. A Baptist church
// and a Catholic parish reach into the same catalog and pull out different
// things, and neither is served a figure it would rather not have in its yard.
//
// The whole catalog is open from the first win. Wins are the currency and the
// catalog is the menu: a church with two wins raises two statues, choosing
// freely. There is deliberately NO rarity, no per-statue unlock ladder and no
// ordering — the moment one statue is rarer than another, a yard starts saying
// how well a church has done rather than what it chose, and the "a look, never
// a number" rule at the top of this file stops holding.
//
// KEEP IN SYNC with `church_statue_exists()` in 0075.

export interface StatueDef {
  id: string
  name: string
  blurb: string
  /** Multiplier on the plinth's height. A column of dove is not a lion. */
  scale: number
}

export const STATUES: StatueDef[] = [
  { id: 'statue_shepherd', name: 'The Good Shepherd', scale: 1.0, blurb: 'A lamb across his shoulders, carried home.' },
  { id: 'statue_mary', name: 'The Virgin Mary', scale: 0.98, blurb: 'Hands open, head bowed. A garden figure.' },
  { id: 'statue_moses', name: 'Moses and the Tablets', scale: 1.06, blurb: 'Two tablets held against his chest.' },
  { id: 'statue_angel', name: 'The Guardian Angel', scale: 1.12, blurb: 'Wings folded, standing watch over the path.' },
  { id: 'statue_david', name: 'David with the Sling', scale: 0.94, blurb: 'A boy, five stones, and no armour.' },
  { id: 'statue_dove', name: 'The Descending Dove', scale: 0.9, blurb: 'A column, and the Spirit coming down on it.' },
  { id: 'statue_tomb', name: 'The Empty Tomb', scale: 0.86, blurb: 'The stone rolled back off an open door.' },
  { id: 'statue_lion_lamb', name: 'The Lion and the Lamb', scale: 0.92, blurb: 'Lying down together, the way it was promised.' },
]

/**
 * Takes an id OR a packed value, for the reason floraById does: almost every
 * caller holds the latter, and forgetting to unpack draws an empty plinth
 * rather than throwing — a bug nobody sees until they look at their own yard.
 */
export const statueById = (id?: string | null): StatueDef | undefined => {
  if (!id) return undefined
  const bare = id.includes('~') ? unpackPercent(id).id : id
  return STATUES.find((s) => s.id === bare)
}

// ── Plinths ──────────────────────────────────────────────────────────────────
// Three spots, so a fourth win is a CHOICE about the yard rather than another
// row of trophies. Same reasoning as the churchyard's six plots and the keep's
// anchors: a fixed set keeps the scene's render cost flat and makes a full
// collection a loadout rather than a hoard.
//
// Coordinates are ChurchScene's — x percent across, b percent up from the
// bottom — and the columns were chosen AGAINST the flora plots in yard.ts
// rather than guessed, because the two layers share the lawn. The flanking
// plinths sit between the `lawn_*` (x 14/86, b 17) and `bed_*` (x 33/67, b 28)
// columns; the gate monument sits at the very foot of the path, in front of
// everything, where the path flare is at its widest and no flower is planted.
export interface PlinthDef {
  id: string
  x: number
  b: number
  label: string
}

export const PLINTHS: PlinthDef[] = [
  { id: 'plinth_l', x: 19, b: 26, label: 'Back lawn, left' },
  { id: 'plinth_r', x: 81, b: 26, label: 'Back lawn, right' },
  { id: 'plinth_gate', x: 50, b: 1, label: 'The gate, front and centre' },
]

export const plinthById = (id: string): PlinthDef | undefined => PLINTHS.find((p) => p.id === id)

// ── Where a statue may actually stand ───────────────────────────────────────
// Same move the churchyard's plants made, and the same grammar: a plinth is a
// ROW KEY, and the statue stands wherever its value says — falling back to the
// plinth when there is no position, so every monument raised before this stands
// exactly where it always has.
//
// The band is the churchyard's, pulled in a little at the sides because a
// monument is taller and wider than a pot of marigolds.
export const PLINTH_BAND: PercentBand = { x0: 6, b0: 1, x1: 94, b1: 30 }

export function packStatue(id: string, pos: PercentPos): string {
  return packPercent(id, clampToPercentBand(PLINTH_BAND, pos.x, pos.b))
}

/** The statue in a value — a bare `statue_dove` or a positioned one. */
export const raisedId = (value?: string | null): string => unpackPercent(value).id

/** Where a monument stands: its own position, or its plinth's. */
export function statueAt(value: string | undefined, plinth: PlinthDef): PercentPos {
  const u = unpackPercent(value)
  return { x: u.x ?? plinth.x, b: u.b ?? plinth.b }
}

/**
 * Depth cue, matching the crowd's and the flora's: further up the yard is
 * smaller. Statues run taller than plants at the same depth because a monument
 * on a plinth should read as a monument — b 1..30 -> 58..34px.
 */
export function plinthHeight(b: number): number {
  const clamped = Math.min(Math.max(b, 1), 30)
  return 58 - ((clamped - 1) / 29) * 24
}

/** plinth id -> statue value (`statue_dove`, or `statue_dove~x500y120`). */
export type Statues = Record<string, string>

/**
 * How many plinths a church has earned the right to fill.
 *
 * Wins are lifetime and only ever go up — there is no revoke, exactly like the
 * churchyard's lifetime-given ladder, and for the same reason: it was won, not
 * deposited. Capped at the number of plinths, so the fourth win onward buys the
 * freedom to change your mind rather than more yard.
 */
export function plinthsEarned(wins: number): number {
  return Math.min(PLINTHS.length, Math.max(0, Math.floor(wins)))
}
