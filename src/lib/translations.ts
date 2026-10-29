// Which Bible a player reads in, and where each one comes from.
//
// Two sources, and a translation names one or both:
//   - API.Bible, through the `bible-text` Edge Function (the key lives there,
//     never in this bundle — the iOS build ships `dist` inside the IPA). This
//     is the only way a LICENSED translation (NLT, MSG) reaches the app.
//   - bible-api.com, the free public-domain source the reader has always used.
//     It needs no key and no Supabase, so a keyless LOCAL build still reads.
//
// The id is what `settings.readingTranslation` stores. 'web', 'kjv' and 'bbe'
// were the bible-api codes stored before API.Bible existed, so they are kept as
// ids verbatim — nobody's saved choice changes meaning.
//
// A QUIZ follows the choice too, where the translation is `quizzable`: the deal
// is still made from the bundled BSB, and data/bible/localize.ts rewrites its
// fill-in-the-blanks against the chosen text (see `quizTranslation`). Head-to-
// head battles stay BSB, so two players racing one score read one wording.

import { isSupabaseConfigured } from './config'
import { BIBLE_BOOKS } from '@/data/bible/pool'
import { canonBook } from '@/data/bible/structure'

export interface TranslationOption {
  id: string
  abbr: string
  name: string
  /** API.Bible Bible id, when the Edge Function can serve it. */
  apiBibleId?: string
  /** bible-api.com code, when it can be read without a key. */
  bibleApiCode?: string
  /** Copyrighted: needs API.Bible, carries its publisher's notice, and is
   *  reported to API.Bible's fair-use system when shown. */
  licensed: boolean
  /** One plain line for the picker. */
  blurb: string
  /**
   * May a QUIZ be played in it — fill-in-the-blanks cut from its text, Word
   * Catch rebuilding it word by word? True for every version today, NLT and MSG
   * included: that was the owner's call (2026-10-21), made knowing API.Bible's
   * terms forbid "altering" licensed text and that whether a blanked word
   * counts is the rights holder's to say. If Tyndale or NavPress object, this
   * flag is the whole switch back — one word per translation.
   */
  quizzable: boolean
}

// Keep the API.Bible ids in sync with ALLOWED in
// supabase/functions/bible-text/index.ts — that list is the server's ceiling.
//
// LICENSING, UNRESOLVED (re-flagged 2026-10-29 for the 1.4.0 release): NLT
// (Tyndale) and MSG (NavPress) are `licensed` AND `quizzable`, in an app that
// sells a $9.99 patron skin. API.Bible's terms carry a non-commercial clause
// and forbid "altering" licensed text, and a quiz blanks a word out of it. No
// publisher has been asked. Quizzing them was the owner's deliberate call
// (CLAUDE.md → "Scripture in the player's translation"), so it is NOT flipped
// here — but until a publisher or API.Bible confirms it, the safe release
// setting is `quizzable: false` on those two rows: they stay readable, and a
// run in either falls back to the BSB deal exactly as an un-cuttable blank does.
export const TRANSLATIONS_ALL: TranslationOption[] = [
  { id: 'bsb', abbr: 'BSB', name: 'Berean Standard Bible', apiBibleId: 'bba9f40183526463-01', licensed: false, quizzable: true, blurb: 'Built into the app, so it reads offline' },
  { id: 'nlt', abbr: 'NLT', name: 'New Living Translation', apiBibleId: 'd6e14a625393b4da-01', licensed: true, quizzable: true, blurb: 'Clear, modern, thought-for-thought' },
  { id: 'msg', abbr: 'MSG', name: 'The Message', apiBibleId: '6f11a7de016f942e-01', licensed: true, quizzable: true, blurb: 'A paraphrase in everyday speech' },
  { id: 'kjv', abbr: 'KJV', name: 'King James Version', apiBibleId: 'de4e12af7f28f599-02', bibleApiCode: 'kjv', licensed: false, quizzable: true, blurb: 'The classic of 1611' },
  { id: 'web', abbr: 'WEB', name: 'World English Bible', apiBibleId: '9879dbb7cfe39e4d-04', bibleApiCode: 'web', licensed: false, quizzable: true, blurb: 'Modern and public domain' },
  { id: 'asv', abbr: 'ASV', name: 'American Standard Version', apiBibleId: '06125adad2d5898a-01', licensed: false, quizzable: true, blurb: 'Word-for-word, 1901' },
  { id: 'dra', abbr: 'DRA', name: 'Douay-Rheims', apiBibleId: '179568874c45066f-01', licensed: false, quizzable: true, blurb: 'The Catholic English classic' },
  { id: 'bbe', abbr: 'BBE', name: 'Bible in Basic English', bibleApiCode: 'bbe', licensed: false, quizzable: true, blurb: 'A small, simple vocabulary' },
]

/** What a new install reads in: the same words the quiz asks about, so a
 *  recap never seems to disagree with the run that came before it. */
export const DEFAULT_TRANSLATION_ID = 'bsb'

/** The bundled pool's own translation — the fallback of last resort. */
export const BUNDLED: Pick<TranslationOption, 'abbr' | 'name'> = { abbr: 'BSB', name: 'Berean Standard Bible' }

export function translationById(id: string | null | undefined): TranslationOption {
  return TRANSLATIONS_ALL.find((t) => t.id === id)
    ?? TRANSLATIONS_ALL.find((t) => t.id === DEFAULT_TRANSLATION_ID)!
}

/** Can this build reach API.Bible at all? No keys ⇒ no Edge Function. */
export const apiBibleReachable = isSupabaseConfigured

// The Bibles the Edge Function confirmed this key serves, remembered so the
// picker draws instantly and offline. Absent ⇒ we haven't asked successfully.
const AVAIL_KEY = 'va.bibles.available'
const AVAIL_TTL = 7 * 24 * 60 * 60 * 1000

export interface AvailableBible { id: string; abbr: string; name: string; copyright: string }

export function readAvailable(): AvailableBible[] | null {
  try {
    const raw = localStorage.getItem(AVAIL_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as { at: number; bibles: AvailableBible[] }
    if (!Array.isArray(v.bibles)) return null
    return v.bibles
  } catch { return null }
}

export function availableIsFresh(): boolean {
  try {
    const raw = localStorage.getItem(AVAIL_KEY)
    return !!raw && Date.now() - (JSON.parse(raw) as { at: number }).at < AVAIL_TTL
  } catch { return false }
}

export function writeAvailable(bibles: AvailableBible[]) {
  try { localStorage.setItem(AVAIL_KEY, JSON.stringify({ at: Date.now(), bibles })) } catch { /* private mode */ }
}

/**
 * What the picker offers. A translation readable without a key is always
 * there. One that needs API.Bible appears only once the function has said this
 * key serves it — fail closed, so nobody picks a version that then reads in
 * something else forever.
 */
export function selectableTranslations(available: AvailableBible[] | null = readAvailable()): TranslationOption[] {
  const served = new Set((available ?? []).map((b) => b.id))
  return TRANSLATIONS_ALL.filter((t) =>
    t.bibleApiCode || (apiBibleReachable && t.apiBibleId && served.has(t.apiBibleId)),
  )
}

/** The publisher's notice for a translation, as API.Bible states it. */
export function copyrightFor(t: TranslationOption): string {
  const hit = t.apiBibleId ? readAvailable()?.find((b) => b.id === t.apiBibleId) : undefined
  if (hit?.copyright) return hit.copyright
  return t.licensed ? `${t.name}. All rights reserved.` : `${t.name} — public domain.`
}

// USFM book codes, in BIBLE_BOOKS order — what API.Bible names a book by.
const USFM = [
  'GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA', '1KI', '2KI',
  '1CH', '2CH', 'EZR', 'NEH', 'EST', 'JOB', 'PSA', 'PRO', 'ECC', 'SNG',
  'ISA', 'JER', 'LAM', 'EZK', 'DAN', 'HOS', 'JOL', 'AMO', 'OBA', 'JON', 'MIC', 'NAM',
  'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL',
  'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH',
  'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS',
  '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV',
]
if (import.meta.env.DEV && USFM.length !== BIBLE_BOOKS.length) {
  console.error(`translations: ${USFM.length} USFM codes for ${BIBLE_BOOKS.length} books`)
}

export function usfmFor(book: string): string | null {
  const i = BIBLE_BOOKS.indexOf(canonBook(book))
  return i >= 0 ? USFM[i] : null
}

/**
 * The translation a solo quiz should be played in, or null for the BSB. Null
 * for the BSB itself (the deal already IS the BSB), and for a version whose
 * publisher hasn't cleared quizzing (`quizzable`).
 */
export function quizTranslation(id: string | null | undefined): TranslationOption | null {
  const t = translationById(id)
  return t.id === 'bsb' || !t.quizzable ? null : t
}
