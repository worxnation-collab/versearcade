// The church year, derived from the date.
//
// Every other "what day is it" in this app is the app's own invention — a
// drop date, a road window, a rivalry week. This is the one calendar that was
// already there before the app existed, and until now nothing here knew that
// today was Good Friday.
//
// **It is content, which is the whole strategic point.** `activeRoad()` is
// already a pure function of the clock against hard ISO windows, and the
// catalog can ship a road without a submission — so a Lent road or an Advent
// road is a reward table and five hex codes, and `LITURGY` is what tells it
// when to open. Nothing here reads or writes player data.
//
// ── The tradition problem, and where the line is ───────────────────────────
//
// This is the sharpest version of the rule `data/bible/trivia.ts` already
// states: "a question a Catholic and a Baptist answer differently would
// quietly make one of them wrong on their own church's tab." A church year is
// exactly that kind of thing — traditions keep different days, on different
// reckonings, with different names, and an app that picks one and presents it
// as THE calendar is telling most of its players that their church does it
// wrong.
//
// So three lines are drawn, and each one is a deliberate exclusion:
//
// - **Only days kept broadly across traditions.** Advent, Christmas, Epiphany,
//   Ash Wednesday, Lent, Holy Week, Good Friday, Easter, Ascension, Pentecost.
//   NO saints' days, no Marian feasts, no Corpus Christi, no Reformation Day —
//   the moment this list contains a day one tradition keeps and another
//   doesn't, it has taken a side. If a future session wants those, they belong
//   behind a per-tradition choice, not in the bundled list.
// - **No observance is prescribed.** It says what the day IS and never what
//   you should do on it: no fasting rules, no obligation, no "you should be at
//   church tonight". The app does not get to tell somebody how to keep Lent.
// - **The reckoning is NAMED rather than assumed.** These are the Western
//   (Gregorian) dates. Orthodox Pascha usually falls on a different Sunday
//   because it is reckoned on the Julian calendar, and silently showing one
//   date to everybody is the "quietly wrong on your own church's tab" failure
//   in its purest form — so `WESTERN_NOTE` is rendered wherever a computed
//   date is, and it is not decoration.
//
// Everything here is pure, deterministic and offline. `npm run check:liturgy`
// asserts the computus against independently-known Easter dates, because an
// off-by-one in it renders perfectly and is wrong for a year at a time.

export type SeasonId =
  | 'advent' | 'christmas' | 'epiphany' | 'lent' | 'holyweek'
  | 'easter' | 'pentecost' | 'ordinary'

export interface SeasonDef {
  id: SeasonId
  name: string
  /** What the season is, in one sentence. Never what to do in it. */
  line: string
  /** The colour tradition broadly associates with it — decoration only. */
  hex: string
}

export const SEASONS: Record<SeasonId, SeasonDef> = {
  advent:    { id: 'advent',    name: 'Advent',        line: 'The four weeks of waiting before Christmas.',                 hex: '#6b5ca5' },
  christmas: { id: 'christmas', name: 'Christmastide',  line: 'The twelve days from Christmas to Epiphany.',                 hex: '#d8c37a' },
  epiphany:  { id: 'epiphany',  name: 'Epiphany',      line: 'The season of the light shown to the nations.',               hex: '#4f8f9c' },
  lent:      { id: 'lent',      name: 'Lent',          line: 'The forty days before Easter, not counting Sundays.',         hex: '#6d5a7a' },
  holyweek:  { id: 'holyweek',  name: 'Holy Week',     line: 'The last week — Palm Sunday through to the tomb.',            hex: '#7a3f47' },
  easter:    { id: 'easter',    name: 'Eastertide',    line: 'The fifty days from Easter to Pentecost.',                    hex: '#e0cf88' },
  pentecost: { id: 'pentecost', name: 'Pentecost',     line: 'The coming of the Spirit, and the days after it.',            hex: '#b4553f' },
  ordinary:  { id: 'ordinary',  name: 'Ordinary Time', line: 'The long green stretch of the year — the walking part.',      hex: '#5c7a52' },
}

export interface FeastDef {
  id: string
  name: string
  /** One sentence about what happened. Narrative, never instruction. */
  line: string
  /**
   * A verse for the day, in the pool's citation form.
   *
   * Preferred from `VERSE_POOL` where one fits, so the day can be READ rather
   * than cited — but a day whose own verse the pool does not carry keeps the
   * true reference and shows it alone, which is exactly what the player card's
   * favourite verse does. Never a near-miss passed off as the day's verse.
   */
  reference?: string
}

/** A resolved day in a given year. */
export interface LiturgicalDay {
  /** Local date, YYYY-MM-DD. */
  date: string
  season: SeasonDef
  /** Set only when the date IS one of the kept days. */
  feast?: FeastDef
}

export const WESTERN_NOTE =
  'Western (Gregorian) dates. Orthodox Pascha is reckoned on the Julian calendar and usually falls on a different Sunday.'

// ── Date helpers ───────────────────────────────────────────────────────────
// Everything is done in UTC internally and formatted back to a plain
// YYYY-MM-DD, so a player's timezone never shifts which day Easter is on. The
// DATE a player is having is still their local one — `todayLocalDate()` is
// what gets passed in.

const DAY = 86_400_000
const utc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d)
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return utc(y, m, d)
}

/**
 * Easter Sunday, Gregorian, by the Anonymous/Meeus algorithm.
 *
 * Written out rather than reached for from a library because it is twenty
 * lines and the whole calendar hangs off it: every movable day below is an
 * offset from this one, so an off-by-one here is wrong for a year at a time
 * and renders perfectly the whole while. `check-liturgy.mjs` asserts it
 * against independently-entered published dates.
 */
export function easter(year: number): number {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return utc(year, month, day)
}

/** The first Sunday of Advent: four Sundays before Christmas Day. */
export function adventStart(year: number): number {
  const xmas = utc(year, 12, 25)
  const dow = new Date(xmas).getUTCDay() // 0 = Sunday
  // The Sunday on or before Christmas, then back three more weeks.
  return xmas - dow * DAY - 21 * DAY
}

/** Every kept day of a given year, as date → feast. */
export function feastsIn(year: number): Map<string, FeastDef> {
  const E = easter(year)
  const out = new Map<string, FeastDef>()
  const put = (t: number, f: FeastDef) => out.set(iso(t), f)

  put(utc(year, 1, 6), {
    id: 'epiphany', name: 'Epiphany',
    line: 'The wise men reach the child, and the light is shown to the nations.',
    reference: 'Matthew 2:2',
  })
  put(E - 46 * DAY, {
    id: 'ash', name: 'Ash Wednesday',
    line: 'The first day of Lent — dust, and the long road to Easter begins.',
    reference: 'Joel 2:13',
  })
  put(E - 7 * DAY, {
    id: 'palm', name: 'Palm Sunday',
    line: 'He rides into Jerusalem and the crowd lays down its coats.',
    reference: 'Matthew 21:22',
  })
  put(E - 3 * DAY, {
    id: 'maundy', name: 'Maundy Thursday',
    line: 'The last supper, and the night He washed their feet.',
    reference: 'John 13:34',
  })
  put(E - 2 * DAY, {
    id: 'goodfriday', name: 'Good Friday',
    line: 'The cross, and the sky going dark over it.',
    reference: 'Luke 23:46',
  })
  put(E, {
    id: 'easter', name: 'Easter Sunday',
    line: 'The stone is rolled back and the tomb is empty.',
    reference: 'Matthew 28:19',
  })
  put(E + 39 * DAY, {
    id: 'ascension', name: 'Ascension',
    line: 'He is taken up, and they are left looking at the sky.',
    reference: 'Acts 1:8',
  })
  put(E + 49 * DAY, {
    id: 'pentecost', name: 'Pentecost',
    line: 'Wind, fire, and everyone hearing it in their own language.',
    reference: 'Acts 2:21',
  })
  put(adventStart(year), {
    id: 'advent', name: 'The first Sunday of Advent',
    line: 'The waiting begins.',
    reference: 'Isaiah 9:2',
  })
  put(utc(year, 12, 25), {
    id: 'christmas', name: 'Christmas Day',
    line: 'Born in Bethlehem, and laid in a manger because there was no room.',
    reference: 'Luke 2:11',
  })
  return out
}

/** Which season a date falls in. */
export function seasonOn(date: string): SeasonDef {
  const t = parse(date)
  const year = Number(date.slice(0, 4))
  const E = easter(year)

  if (t >= adventStart(year) && t < utc(year, 12, 25)) return SEASONS.advent
  // Christmastide straddles New Year, so it is checked from both ends.
  if (t >= utc(year, 12, 25) || t < utc(year, 1, 6)) return SEASONS.christmas
  if (t >= E - 46 * DAY && t < E - 7 * DAY) return SEASONS.lent
  if (t >= E - 7 * DAY && t < E) return SEASONS.holyweek
  if (t >= E && t < E + 49 * DAY) return SEASONS.easter
  if (t >= E + 49 * DAY && t < E + 56 * DAY) return SEASONS.pentecost
  if (t >= utc(year, 1, 6) && t < E - 46 * DAY) return SEASONS.epiphany
  return SEASONS.ordinary
}

/** Today, as the church year has it. */
export function liturgyFor(date: string): LiturgicalDay {
  const year = Number(date.slice(0, 4))
  return {
    date,
    season: seasonOn(date),
    // Advent and Christmas can belong to the year either side of a New Year,
    // so both years' tables are consulted rather than only the date's own.
    feast: feastsIn(year).get(date) ?? feastsIn(year - 1).get(date),
  }
}

/** The next kept day on or after `date`, for "what's coming". */
export function nextFeast(date: string, withinDays = 400): { date: string; feast: FeastDef; inDays: number } | null {
  const start = parse(date)
  const year = Number(date.slice(0, 4))
  const all = [...feastsIn(year), ...feastsIn(year + 1)]
    .map(([d, f]) => ({ date: d, feast: f, at: parse(d) }))
    .filter((x) => x.at > start)
    .sort((a, b) => a.at - b.at)
  const hit = all[0]
  if (!hit) return null
  const inDays = Math.round((hit.at - start) / DAY)
  return inDays <= withinDays ? { date: hit.date, feast: hit.feast, inDays } : null
}

/** Every kept day of the year `date` falls in, in order — the calendar page. */
export function yearOf(date: string): { date: string; feast: FeastDef }[] {
  const year = Number(date.slice(0, 4))
  return [...feastsIn(year)]
    .map(([d, feast]) => ({ date: d, feast }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}
