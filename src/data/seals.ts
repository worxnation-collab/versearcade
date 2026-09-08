// The Book Collection — a seal for every book of the Bible you finish reading.
//
// Every unlock axis in this app was streak, share, referral, live battles,
// battle wins, level or money. Not one of them was READING, which is what the
// app is for: a player could open forty chapters and nothing anywhere would
// say so. This is the axis that was missing.
//
// A seal is pressed when every chapter of a book has been opened
// (`bible_marks` kind='read', the footprint the reader already writes). It is
// therefore PURELY DERIVED — no table, no grant, no migration, nothing to
// revoke — the same bargain the keep's challenges, the Journal and the room's
// furnishings make. It works identically in both modes because the marks
// underneath it already do.
//
// Three rules, and they are what let a collection screen exist in an app with
// no losers:
//
//  - **A seal is a number you passed.** Marks are cumulative and never removed
//    (see lib/bibleProgress), so a pressed seal is pressed forever. There is no
//    way to lose one and nothing to fall behind on.
//  - **Nothing here is ever compared.** No seal count on a card, no board, no
//    RPC that asks how many anybody else has. The whole feature is a fact about
//    your own Bible, exactly as the reader's four tiers are.
//  - **There is always a close one.** Obadiah, Philemon, Jude and 2/3 John are
//    one chapter each, so the collection opens with something reachable today,
//    and Psalms is there for the year. That pacing is the point: this is the
//    thing that fills the gap between a 7-day streak and a 30-day one.
//
// What is EQUIPPABLE from reading is gated on total chapters opened rather than
// on seals (BORDERS/BADGES in data/cosmetics, `requiredChapters`), because that
// is one count the server can verify in a single query against `bible_marks`.
// Seals need the 1,189-number structure table to check, which the server does
// not have and should not grow — so the collection stays derived and honest on
// the client, and the cosmetics ride a number SQL can see.

import { BIBLE_BOOKS } from './bible/pool'
import { chapterCount, chapterKey } from './bible/structure'
import type { MarkMap } from '@/lib/bibleProgress'

export type DivisionId = 'law' | 'history' | 'wisdom' | 'prophets' | 'gospels' | 'letters' | 'revelation'

export interface DivisionDef {
  id: DivisionId
  name: string
  /** The wax's colour. Measured for separation against the cream page. */
  wax: string
  /** The darker rim, so a seal reads as pressed rather than as a sticker. */
  rim: string
  blurb: string
}

// Seven divisions, the traditional grouping: 5 + 12 + 5 + 17 = 39 in the Old
// Testament, 5 + 21 + 1 = 27 in the New.
export const DIVISIONS: DivisionDef[] = [
  { id: 'law', name: 'The Law', wax: '#b8763a', rim: '#7c4a1e', blurb: 'Genesis through Deuteronomy.' },
  { id: 'history', name: 'History', wax: '#9a2f2f', rim: '#661c1c', blurb: 'Joshua through Esther.' },
  { id: 'wisdom', name: 'Wisdom', wax: '#7a5aa8', rim: '#4c3570', blurb: 'Job through Song of Solomon.' },
  { id: 'prophets', name: 'The Prophets', wax: '#2f6b73', rim: '#1b464c', blurb: 'Isaiah through Malachi.' },
  { id: 'gospels', name: 'Gospels & Acts', wax: '#c08a20', rim: '#8a6008', blurb: 'Matthew through Acts.' },
  { id: 'letters', name: 'The Letters', wax: '#4a6b3a', rim: '#2d451f', blurb: 'Romans through Jude.' },
  { id: 'revelation', name: 'Revelation', wax: '#8c3a6b', rim: '#5d2247', blurb: 'The last book.' },
]

export const divisionById = (id: DivisionId): DivisionDef =>
  DIVISIONS.find((d) => d.id === id) ?? DIVISIONS[0]

// Where each division starts, as an index into BIBLE_BOOKS. Derived rather than
// listed book by book so it cannot drift from the canon order.
const STARTS: { at: number; id: DivisionId }[] = [
  { at: 0, id: 'law' },          // Genesis
  { at: 5, id: 'history' },      // Joshua
  { at: 17, id: 'wisdom' },      // Job
  { at: 22, id: 'prophets' },    // Isaiah
  { at: 39, id: 'gospels' },     // Matthew
  { at: 44, id: 'letters' },     // Romans
  { at: 65, id: 'revelation' },  // Revelation
]

// The three letters stamped into the wax. Written out rather than derived: a
// rule that takes the first three letters gives Judges and Jude the same seal,
// and two identical seals in one collection is a bug you only find by squinting
// at a grid. `checkSealData()` asserts all 66 are present and distinct.
const ABBR: Record<string, string> = {
  Genesis: 'Gen', Exodus: 'Exo', Leviticus: 'Lev', Numbers: 'Num', Deuteronomy: 'Deu',
  Joshua: 'Jos', Judges: 'Jdg', Ruth: 'Rut', '1 Samuel': '1Sa', '2 Samuel': '2Sa',
  '1 Kings': '1Ki', '2 Kings': '2Ki', '1 Chronicles': '1Ch', '2 Chronicles': '2Ch',
  Ezra: 'Ezr', Nehemiah: 'Neh', Esther: 'Est',
  Job: 'Job', Psalms: 'Psa', Proverbs: 'Pro', Ecclesiastes: 'Ecc', 'Song of Solomon': 'Sng',
  Isaiah: 'Isa', Jeremiah: 'Jer', Lamentations: 'Lam', Ezekiel: 'Eze', Daniel: 'Dan',
  Hosea: 'Hos', Joel: 'Joe', Amos: 'Amo', Obadiah: 'Oba', Jonah: 'Jon', Micah: 'Mic',
  Nahum: 'Nah', Habakkuk: 'Hab', Zephaniah: 'Zep', Haggai: 'Hag', Zechariah: 'Zec', Malachi: 'Mal',
  Matthew: 'Mat', Mark: 'Mrk', Luke: 'Luk', John: 'Jhn', Acts: 'Act',
  Romans: 'Rom', '1 Corinthians': '1Co', '2 Corinthians': '2Co', Galatians: 'Gal',
  Ephesians: 'Eph', Philippians: 'Php', Colossians: 'Col',
  '1 Thessalonians': '1Th', '2 Thessalonians': '2Th', '1 Timothy': '1Ti', '2 Timothy': '2Ti',
  Titus: 'Tit', Philemon: 'Phm', Hebrews: 'Heb', James: 'Jas',
  '1 Peter': '1Pe', '2 Peter': '2Pe', '1 John': '1Jn', '2 John': '2Jn', '3 John': '3Jn',
  Jude: 'Jud', Revelation: 'Rev',
}

export interface SealDef {
  book: string
  division: DivisionId
  /** Three letters pressed into the wax. */
  abbr: string
  chapters: number
}

export const SEALS: SealDef[] = BIBLE_BOOKS.map((book, i) => {
  let division: DivisionId = 'law'
  for (const s of STARTS) if (i >= s.at) division = s.id
  return { book, division, abbr: ABBR[book] ?? book.slice(0, 3), chapters: chapterCount(book) }
})

const SEAL_BY_BOOK: Record<string, SealDef> = Object.fromEntries(SEALS.map((s) => [s.book, s]))

export const sealFor = (book: string): SealDef | undefined => SEAL_BY_BOOK[book]

export function sealsIn(division: DivisionId): SealDef[] {
  return SEALS.filter((s) => s.division === division)
}

// ————————————————————————————— what you've pressed ——————————————————————————

/** Chapters of `book` opened, from the reader's own `Book|chapter` marks. */
export function chaptersReadIn(book: string, chapters: MarkMap): number {
  const total = chapterCount(book)
  let n = 0
  for (let c = 1; c <= total; c++) if (chapters[chapterKey(book, c)]) n++
  return n
}

/** A seal is pressed once every chapter of its book has been opened. */
export function sealPressed(book: string, chapters: MarkMap): boolean {
  const total = chapterCount(book)
  return total > 0 && chaptersReadIn(book, chapters) === total
}

/** Every book finished, in canon order. */
export function pressedSeals(chapters: MarkMap): string[] {
  return SEALS.filter((s) => sealPressed(s.book, chapters)).map((s) => s.book)
}

/** Chapters opened anywhere — the number the reading cosmetics are gated on. */
export function chaptersOpened(chapters: MarkMap): number {
  return Object.keys(chapters).length
}

/**
 * The book closest to a seal without being finished — one goal on the one rung
 * within reach, the Buildings panel's rule. Books not started are excluded: a
 * "nearest" that is always Obadiah at 0 of 1 is a suggestion, not progress.
 */
export function nearestSeal(chapters: MarkMap): { seal: SealDef; read: number } | null {
  let best: { seal: SealDef; read: number } | null = null
  for (const seal of SEALS) {
    const read = chaptersReadIn(seal.book, chapters)
    if (read === 0 || read === seal.chapters) continue
    const left = seal.chapters - read
    if (!best || left < best.seal.chapters - best.read) best = { seal, read }
  }
  return best
}

// ——————————————————————————————— dev assertions —————————————————————————————

// The failure modes here all RENDER: a missing abbreviation shows three letters
// of the book name, a duplicate shows two identical seals, and a book filed in
// the wrong division shows the wrong colour. None of that throws, so it is
// asserted at import in dev the way checkTrackData and checkTriviaData are.
export function checkSealData(): string[] {
  const problems: string[] = []
  if (SEALS.length !== 66) problems.push(`${SEALS.length} books, expected 66`)
  const seen = new Set<string>()
  for (const s of SEALS) {
    if (!ABBR[s.book]) problems.push(`no abbreviation for ${s.book}`)
    if (seen.has(s.abbr)) problems.push(`duplicate abbreviation ${s.abbr}`)
    seen.add(s.abbr)
    if (s.chapters < 1) problems.push(`${s.book} has no chapters`)
  }
  const counts = DIVISIONS.map((d) => sealsIn(d.id).length).join(',')
  if (counts !== '5,12,5,17,5,21,1') problems.push(`division sizes ${counts}, expected 5,12,5,17,5,21,1`)
  return problems
}

if (import.meta.env?.DEV) {
  const problems = checkSealData()
  if (problems.length) console.warn('[seals] seal data:\n  ' + problems.join('\n  '))
}
