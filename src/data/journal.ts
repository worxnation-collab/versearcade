// The Journal — everything you have done, in one place.
//
// The app had milestone ladders in five different features (washing, pets,
// cosmetics, the keep's challenges, the road's waystations) and no page that
// said what you had actually done. In a collection game that page is standard,
// and here it is also the ONLY safe kind of achievement screen, because of the
// rule it is built on:
//
//   EVERY RUNG IS A NUMBER YOU PASSED, NEVER A PLACE YOU HOLD.
//
// That is the same sentence data/washing.ts is built on, and it is what makes a
// Journal possible in an app with no losers. Nothing here is a percentile,
// nothing is "top 10%", nothing compares you to another player, and nothing
// expires — every number it reads only ever goes up, so a rung once passed is
// passed forever. A bad week can empty a streak; it cannot empty this page.
//
// It is also PURELY DERIVED. There is no journal table, no grant, nothing to
// migrate and nothing to revoke: the page is a pure function of numbers the app
// already keeps, which is the same bargain the keep's challenges make.

export type JournalTrackId =
  | 'days'
  | 'streak'
  | 'level'
  | 'study'
  | 'reading'
  | 'collection'
  | 'room'
  | 'battles'
  | 'washing'

export interface JournalRung {
  goal: number
  name: string
}

export interface JournalTrack {
  id: JournalTrackId
  icon: string
  title: string
  /** What the number is, in the fewest words that are still honest. */
  unit: string
  rungs: JournalRung[]
}

// Ladders are shallow on purpose — five or six rungs each. A twenty-rung track
// is a progress bar pretending to be an achievement, and the top rung of every
// one of these should be reachable by somebody who plays for a year.
export const JOURNAL: JournalTrack[] = [
  {
    id: 'days',
    icon: '📖',
    title: 'Daily verses',
    unit: 'played',
    rungs: [
      { goal: 1, name: 'First Light' },
      { goal: 10, name: 'Ten Mornings' },
      { goal: 50, name: 'Fifty Verses' },
      { goal: 150, name: 'A Season of Days' },
      { goal: 365, name: 'A Year of Mornings' },
    ],
  },
  {
    id: 'streak',
    icon: '🔥',
    title: 'Longest streak',
    unit: 'days in a row',
    rungs: [
      { goal: 3, name: 'Three Days' },
      { goal: 7, name: 'A Full Week' },
      { goal: 30, name: 'A Month Unbroken' },
      { goal: 100, name: 'A Hundred Days' },
      { goal: 365, name: 'A Year Unbroken' },
    ],
  },
  {
    id: 'level',
    icon: '⭐',
    title: 'Level',
    unit: 'reached',
    rungs: [
      { goal: 5, name: 'Getting the Hang of It' },
      { goal: 12, name: 'Well Read' },
      { goal: 25, name: 'Steady Hand' },
      { goal: 40, name: 'Old Friend of the Book' },
      { goal: 60, name: 'Elder' },
    ],
  },
  {
    id: 'study',
    icon: '📚',
    title: 'Verses studied',
    unit: 'verses',
    rungs: [
      { goal: 10, name: 'Ten Verses' },
      { goal: 50, name: 'Fifty Verses' },
      { goal: 200, name: 'Two Hundred' },
      { goal: 500, name: 'Five Hundred' },
      { goal: 1000, name: 'A Thousand Verses' },
    ],
  },
  {
    id: 'reading',
    icon: '📕',
    title: 'Chapters opened',
    unit: 'of 1,189',
    rungs: [
      { goal: 10, name: 'Ten Chapters' },
      { goal: 66, name: 'One for Every Book' },
      { goal: 260, name: 'A Quarter of It' },
      { goal: 595, name: 'Halfway Through' },
      { goal: 1189, name: 'The Whole Bible' },
    ],
  },
  {
    id: 'collection',
    icon: '🃏',
    title: 'Cards and relics',
    unit: 'collected',
    rungs: [
      { goal: 1, name: 'The First One' },
      { goal: 10, name: 'A Small Shelf' },
      { goal: 25, name: 'A Real Collection' },
      { goal: 40, name: 'Nearly Everything' },
    ],
  },
  {
    id: 'room',
    icon: '🪑',
    title: 'Your Upper Room',
    unit: 'furnishings earned',
    rungs: [
      { goal: 1, name: 'Somewhere to Sit' },
      { goal: 5, name: 'A Room You Live In' },
      { goal: 10, name: 'Well Furnished' },
      { goal: 18, name: 'A Bed, a Table, a Stool and a Candlestick' },
    ],
  },
  {
    id: 'battles',
    icon: '⚔️',
    title: 'Battles',
    unit: 'played',
    rungs: [
      { goal: 1, name: 'First Match' },
      { goal: 10, name: 'Ten Battles' },
      { goal: 50, name: 'Fifty Battles' },
      { goal: 150, name: 'A Hundred and Fifty' },
    ],
  },
  {
    id: 'washing',
    icon: '🪣',
    title: 'Feet washed',
    unit: 'people',
    rungs: [
      { goal: 1, name: 'The Basin' },
      { goal: 12, name: 'The Upper Room' },
      { goal: 25, name: 'As Jesus Did' },
      { goal: 100, name: 'Towel and Water' },
      { goal: 500, name: 'Servant of All' },
    ],
  },
]

export type JournalNumbers = Record<JournalTrackId, number>

/** How many rungs of a track are behind you. */
export function rungsPassed(track: JournalTrack, n: number): number {
  return track.rungs.filter((r) => n >= r.goal).length
}

/** The rung being climbed, or null once the whole track is behind you. */
export function nextRung(track: JournalTrack, n: number): JournalRung | null {
  return track.rungs.find((r) => n < r.goal) ?? null
}

/** Every rung passed, across every track — the one number the page shows. */
export function totalPassed(numbers: JournalNumbers): number {
  return JOURNAL.reduce((sum, t) => sum + rungsPassed(t, numbers[t.id] ?? 0), 0)
}

export function totalRungs(): number {
  return JOURNAL.reduce((sum, t) => sum + t.rungs.length, 0)
}
