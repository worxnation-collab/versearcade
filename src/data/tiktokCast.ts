/**
 * Who stands in the middle of the frame, for a given verse.
 *
 * The morning post is one character, centred, while the verse is read. Until
 * now that character was a ROTATION — `autoCast` took the next reader not used
 * in two days — so Esther read Paul and Moses read Revelation, and the figure
 * said nothing about the words. This file makes the figure a fact about the
 * verse instead, and it is derived from metadata `VERSE_POOL` already carries
 * rather than from a hand-written table of 726 rows.
 *
 * Three rules, in order, and the ORDER is the design:
 *
 *  1. A NAMED speaker gets their own figure (`SPEAKER_FIGURE`). Paul alone is
 *     135 verses — 19% of the pool — and had no figure at all.
 *  2. Anything unnamed falls to the BOOK (`BOOK_FIGURE`). That one rule covers
 *     four separate problems at once: God speaking (105 verses, and see
 *     below), "The narrator" (37), "The psalmist" (7) and "The Teacher" (9).
 *     Isaiah stands for the LORD's words in Isaiah; David for the psalmist;
 *     Solomon for the Teacher in Ecclesiastes.
 *  3. Anything left over gets a figure that is not a claim — an elder prophet,
 *     a younger prophet, a scribe — chosen by testament so the look still
 *     fits. 83 speakers share the last 130 verses and no audience can tell
 *     Zephaniah from Haggai on sight; a GENERIC figure is honest where a
 *     confidently wrong named one is not.
 *
 * **God is never drawn, and that is rule 2's real job.** "The LORD", "The Lord
 * GOD", "The LORD of Hosts" and "God" are 105 verses, 14% of the pool, and
 * there is no figure this app can put in the centre of that frame: depicting
 * God divides traditions the way the trivia pool's banned canon-count question
 * does, and the mission rule says nothing here may quietly make one tradition
 * wrong. So a divine speaker resolves to the PROPHET WHO RECORDED IT, which is
 * both safe and true to how the words reached anybody. `DIVINE` is matched
 * first, before `SPEAKER_FIGURE`, so no future edit can add "The LORD" to the
 * named table by accident.
 *
 * Jesus IS drawn (80 verses), which was the app owner's decision, taken
 * explicitly rather than defaulted into.
 *
 * Every id here must exist as a full-length render — see `art/tiktok-cast.json`
 * and the `check:cast` script, which fails the build on an id with no art,
 * because the failure otherwise RENDERS: a missing figure is a reader who
 * silently does not appear, on the one post this account is built around.
 */

import type { VerseSeed } from './bible/pool'

/** Speakers that are God. Matched BEFORE the named table, and never drawn. */
const DIVINE = [
  'the lord', 'the lord god', 'the lord of hosts', 'god', 'the spirit',
  'the father', 'the holy spirit', 'the almighty', 'yahweh',
]

/**
 * A named human speaker and the figure who stands for them.
 *
 * Keys are lower-cased and matched loosely (`speakerKey`), because the pool
 * writes a speaker as prose — "John the elder", "The prophet Habakkuk",
 * "The narrator (Luke)" — rather than as an id.
 */
export const SPEAKER_FIGURE: Record<string, string> = {
  paul: 'paul',
  jesus: 'jesus',
  peter: 'cephas',
  john: 'john',
  'john the elder': 'john',
  'john the apostle': 'john',
  david: 'david',
  moses: 'moses',
  solomon: 'solomon',
  'the teacher': 'solomon',
  'the bride': 'bride',
  jeremiah: 'jeremiah',
  isaiah: 'isaiah',
  ezekiel: 'ezekiel',
  daniel: 'daniel',
  hosea: 'hosea',
  joel: 'joel',
  amos: 'amos',
  obadiah: 'prophet_elder',
  jonah: 'jonah',
  micah: 'micah',
  nahum: 'nahum',
  habakkuk: 'habakkuk',
  zephaniah: 'prophet_young',
  haggai: 'haggai',
  zechariah: 'zechariah',
  malachi: 'malachi',
  james: 'james',
  jude: 'jude',
  job: 'job',
  nehemiah: 'nehemiah',
  ezra: 'scribe',
  joshua: 'joshua',
  samuel: 'samuel',
  elijah: 'elijah',
  elisha: 'prophet_elder',
  esther: 'esther',
  mordecai: 'mordecai',
  ruth: 'ruth_1',
  naomi: 'naomi',
  boaz: 'boaz',
  deborah: 'deborah',
  jonathan: 'jonathan',
  joseph: 'joseph',
  mary: 'mary',
  gabriel: 'gabriel',
  luke: 'luke',
  'the author of hebrews': 'scribe',
  'the psalmist': 'david',
  'the preacher': 'solomon',
}

/**
 * The figure for a book, used whenever the speaker is not a named person.
 *
 * This is the prophet-who-recorded-it rule, and it is keyed on the BOOK rather
 * than on the speaker string so it answers every unnamed form at once.
 */
export const BOOK_FIGURE: Record<string, string> = {
  Genesis: 'moses', Exodus: 'moses', Leviticus: 'moses', Numbers: 'moses', Deuteronomy: 'moses',
  Joshua: 'joshua', Judges: 'deborah', Ruth: 'ruth_1',
  '1 Samuel': 'samuel', '2 Samuel': 'samuel', '1 Kings': 'elijah', '2 Kings': 'elijah',
  '1 Chronicles': 'david', '2 Chronicles': 'david', Ezra: 'scribe', Nehemiah: 'nehemiah', Esther: 'mordecai',
  Job: 'job', Psalms: 'david', Proverbs: 'solomon', Ecclesiastes: 'solomon', 'Song of Solomon': 'bride',
  Isaiah: 'isaiah', Jeremiah: 'jeremiah', Lamentations: 'jeremiah', Ezekiel: 'ezekiel', Daniel: 'daniel',
  Hosea: 'hosea', Joel: 'joel', Amos: 'amos', Obadiah: 'prophet_elder', Jonah: 'jonah',
  Micah: 'micah', Nahum: 'nahum', Habakkuk: 'habakkuk', Zephaniah: 'prophet_young',
  Haggai: 'haggai', Zechariah: 'zechariah', Malachi: 'malachi',
  Matthew: 'jesus', Mark: 'jesus', Luke: 'jesus', John: 'jesus', Acts: 'luke',
  Romans: 'paul', '1 Corinthians': 'paul', '2 Corinthians': 'paul', Galatians: 'paul',
  Ephesians: 'paul', Philippians: 'paul', Colossians: 'paul',
  '1 Thessalonians': 'paul', '2 Thessalonians': 'paul',
  '1 Timothy': 'paul', '2 Timothy': 'paul', Titus: 'paul', Philemon: 'paul',
  Hebrews: 'scribe', James: 'james', '1 Peter': 'cephas', '2 Peter': 'cephas',
  '1 John': 'john', '2 John': 'john', '3 John': 'john', Jude: 'jude', Revelation: 'john',
}

/** The last resort, by testament, so an unplaceable verse still looks like itself. */
const FALLBACK = { OT: 'prophet_elder', NT: 'scribe' } as const

/**
 * The speaker as a lookup key.
 *
 * The pool writes speakers as prose, so the parenthetical is dropped ("The
 * narrator (Luke)"), a leading article is dropped, and a title is stripped
 * ("The prophet Habakkuk" → habakkuk). Everything is lower-cased. What is NOT
 * done is fuzzy matching — a speaker this file does not know falls to the book,
 * which is always right, rather than to whichever name looks closest.
 */
export function speakerKey(speaker: string): string {
  return String(speaker || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(the prophet|the apostle|king|queen|prophet|apostle|saint|st\.?)\b/gi, ' ')
    .replace(/[^A-Za-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export const isDivine = (speaker: string): boolean => {
  const k = speakerKey(speaker)
  return DIVINE.includes(k) || /^the lord\b/.test(k)
}

export interface Cast {
  /** The figure id — a full-length render in `public/tiktok/cast/`. */
  figure: string
  /** Why, for the operator's own screen. Never shown to a viewer. */
  why: 'speaker' | 'divine-to-book' | 'book' | 'fallback'
}

/** The figure that stands in the frame for this verse. */
export function castFor(seed: { speaker?: string; book: string; testament?: VerseSeed['testament'] }): Cast {
  // God first, so no later edit can name a divine speaker in SPEAKER_FIGURE.
  if (isDivine(seed.speaker ?? '')) {
    const byBook = BOOK_FIGURE[seed.book]
    if (byBook) return { figure: byBook, why: 'divine-to-book' }
    return { figure: FALLBACK[seed.testament ?? 'OT'] ?? FALLBACK.OT, why: 'fallback' }
  }
  const named = SPEAKER_FIGURE[speakerKey(seed.speaker ?? '')]
  if (named) return { figure: named, why: 'speaker' }
  const byBook = BOOK_FIGURE[seed.book]
  if (byBook) return { figure: byBook, why: 'book' }
  return { figure: FALLBACK[seed.testament ?? 'OT'] ?? FALLBACK.OT, why: 'fallback' }
}

/** Every figure id this file can ever return — what `art/tiktok-cast.json` must cover. */
export const CAST_IDS: string[] = [...new Set([
  ...Object.values(SPEAKER_FIGURE),
  ...Object.values(BOOK_FIGURE),
  ...Object.values(FALLBACK),
])].sort()
