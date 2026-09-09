// Profile cosmetics — avatar borders + badge emblems, unlocked two ways.
//
//   requiredStreak  — the player's LONGEST streak ever, so a missed day never
//                     strips a cosmetic they earned. (0010.)
//   requiredChapters — chapters of the Bible opened, ever. (0109.)
//
// The second axis exists because until it landed, NOTHING in this app's
// wardrobe unlocked from reading scripture: every gate was streak, share,
// referral, live battles, battle wins, level or money, in an app whose whole
// subject is the text. Chapters opened is the right number to hang it on
// because it only goes up (`bible_marks` is cumulative and never deleted), it
// is written by the reader the player already uses, and the SERVER can verify
// it in one count — which the 66-book seal collection (data/seals.ts) cannot,
// since checking a seal needs the 1,189-number structure table. So the
// collection stays derived on the client and the equippables ride a number SQL
// can see.
//
// It also fills the gap this ladder had between day 7 and day 30: ten chapters
// is a first week, and there was nothing to earn in that window at all.
//
// Keys + thresholds here must match supabase/migrations/0010 and 0109 (the
// server gates equipping); the visual styling lives here on the client.

export type CosmeticKind = 'border' | 'badge'

export interface BorderDef {
  key: string
  name: string
  requiredStreak: number
  /** Chapters of the Bible opened. When set, this is the gate, not the streak. */
  requiredChapters?: number
  blurb: string
  /**
   * A border that comes with a skin pack rather than a streak. `requiredStreak`
   * is 0 for these and is NOT the gate — `packPreviewable` (data/avatar) is,
   * on the client, and migration 0096's set_cosmetics on the server. Same rule
   * the pack card backgrounds follow in data/playerCards.
   */
  pack?: 'patron'
}

export interface BadgeDef {
  key: string
  name: string
  requiredStreak: number
  /** Chapters of the Bible opened. When set, this is the gate, not the streak. */
  requiredChapters?: number
  emoji: string // '' for the "none" option
}

// Ordered by requiredStreak so galleries render as a progression.
export const BORDERS: BorderDef[] = [
  { key: 'default', name: 'Classic', requiredStreak: 0, blurb: 'The original gold ring.' },
  { key: 'ember', name: 'Ember', requiredStreak: 7, blurb: 'A warm glow for your first week.' },
  { key: 'silver', name: 'Silver', requiredStreak: 30, blurb: 'One month strong.' },
  { key: 'gold', name: 'Golden', requiredStreak: 90, blurb: 'Three months of showing up.' },
  { key: 'amethyst', name: 'Amethyst', requiredStreak: 180, blurb: 'Half a year of devotion.' },
  { key: 'aurora', name: 'Aurora', requiredStreak: 365, blurb: 'A full year — the sky celebrates.' },
  { key: 'halo', name: 'Halo of Light', requiredStreak: 1000, blurb: '1000 days. Truly radiant.' },
  // The founding patron's ring — pale stone with a gold vein, matching the
  // Cornerstone card. Comes with the pack (either patron skin), never a streak.
  { key: 'cornerstone', name: 'Cornerstone', requiredStreak: 0, pack: 'patron', blurb: 'Pale stone, one gold vein — the founding patron’s ring.' },
  // ——— The reading ring, earned in the Bible rather than on the calendar ———
  // Ordered by requiredChapters, and deliberately reachable early: the first
  // one is a first week of chapters.
  { key: 'vellum', name: 'Vellum', requiredStreak: 0, requiredChapters: 10, blurb: 'Ten chapters in. Warm parchment.' },
  { key: 'ink', name: 'Ink and Iron', requiredStreak: 0, requiredChapters: 60, blurb: 'Sixty chapters. The colour of a full nib.' },
  { key: 'illumination', name: 'Illumination', requiredStreak: 0, requiredChapters: 250, blurb: 'Two hundred and fifty. Gold leaf in the margin.' },
  { key: 'codex', name: 'The Codex', requiredStreak: 0, requiredChapters: 1189, blurb: 'Every chapter of the Bible, opened.' },
]

export const BADGES: BadgeDef[] = [
  { key: 'none', name: 'None', requiredStreak: 0, emoji: '' },
  { key: 'flame', name: 'Kindling', requiredStreak: 7, emoji: '🔥' },
  { key: 'star', name: 'Rising Star', requiredStreak: 30, emoji: '⭐' },
  { key: 'medal', name: 'Devoted', requiredStreak: 90, emoji: '🏅' },
  { key: 'gem', name: 'Treasured', requiredStreak: 180, emoji: '💎' },
  { key: 'crown', name: 'Crowned', requiredStreak: 365, emoji: '👑' },
  { key: 'halo', name: 'Radiant', requiredStreak: 1000, emoji: '😇' },
  // Reading badges, the same four rungs as the borders above.
  { key: 'bookmark', name: 'Bookmarked', requiredStreak: 0, requiredChapters: 10, emoji: '📑' },
  { key: 'quill', name: 'Copyist', requiredStreak: 0, requiredChapters: 60, emoji: '🪶' },
  { key: 'scroll', name: 'Scribe', requiredStreak: 0, requiredChapters: 250, emoji: '📜' },
  { key: 'codex', name: 'Codex', requiredStreak: 0, requiredChapters: 1189, emoji: '📔' },
]

/**
 * The reading ladder, borders and badges together, in the order they arrive.
 * The Seals page names the next rung from this, so the two can't drift.
 * KEEP IN SYNC with the chapter gates above and with 0109.
 */
export const READING_COSMETICS: { key: string; name: string; kind: CosmeticKind; chapters: number }[] = [
  ...BORDERS.filter((b) => b.requiredChapters).map((b) => ({
    key: b.key, name: b.name, kind: 'border' as CosmeticKind, chapters: b.requiredChapters!,
  })),
  ...BADGES.filter((b) => b.requiredChapters).map((b) => ({
    key: b.key, name: b.name, kind: 'badge' as CosmeticKind, chapters: b.requiredChapters!,
  })),
].sort((a, b) => a.chapters - b.chapters || (a.kind === 'border' ? -1 : 1))

export const borderByKey = (key?: string | null): BorderDef =>
  BORDERS.find((b) => b.key === key) ?? BORDERS[0]

export const badgeByKey = (key?: string | null): BadgeDef | null =>
  key && key !== 'none' ? BADGES.find((b) => b.key === key) ?? null : null

/**
 * Whether a cosmetic is available. A founder grant unlocks everything.
 *
 * A cosmetic gated on CHAPTERS ignores the streak entirely — its
 * `requiredStreak` is 0 and must not be reachable by showing up alone, the same
 * trap the Cornerstone border's pack gate closes in 0096. Mirrored in 0109's
 * set_cosmetics; keep the two in sync.
 */
export const isUnlocked = (
  def: { requiredStreak: number; requiredChapters?: number },
  longestStreak: number,
  founder?: boolean,
  chaptersRead = 0,
): boolean => {
  if (founder) return true
  if (def.requiredChapters != null) return chaptersRead >= def.requiredChapters
  return longestStreak >= def.requiredStreak
}

// Render config for a border. `type: 'shadow'` draws stacked rings via
// box-shadow; `type: 'gradient'` needs a conic-gradient wrapper (Avatar handles
// that). `halo` also animates (see the .va-halo rule in index.css).
export type BorderRender =
  | { type: 'shadow'; boxShadow: string }
  | { type: 'gradient'; gradient: string; animated?: boolean; glow?: string }

const BASE_SHADOW = '0 6px 16px rgba(0,0,0,0.4)'

export function borderRender(key: string): BorderRender {
  switch (key) {
    case 'ember':
      return { type: 'shadow', boxShadow: `0 0 0 3px #ff9f1c, 0 0 14px 2px rgba(255,159,28,0.60), ${BASE_SHADOW}` }
    case 'silver':
      return { type: 'shadow', boxShadow: `0 0 0 3px #d7dee8, 0 0 0 6px rgba(215,222,232,0.35), ${BASE_SHADOW}` }
    case 'gold':
      return { type: 'shadow', boxShadow: `0 0 0 3px #ffd23f, 0 0 0 6px rgba(255,210,63,0.35), 0 0 16px 2px rgba(255,210,63,0.45), ${BASE_SHADOW}` }
    case 'amethyst':
      return { type: 'shadow', boxShadow: `0 0 0 3px #a06bff, 0 0 18px 3px rgba(160,107,255,0.65), ${BASE_SHADOW}` }
    case 'aurora':
      return { type: 'gradient', gradient: 'conic-gradient(from 0deg, #5ee7df, #a06bff, #ffd23f, #43e97b, #ff6b6b, #5ee7df)' }
    case 'halo':
      return { type: 'gradient', gradient: 'conic-gradient(from 0deg, #fff6cf, #ffd23f, #fff6cf, #ffe58a, #ffffff, #ffd23f, #fff6cf)', animated: true }
    // ——— The reading rings ———
    case 'vellum':
      // Warm parchment, one shade off the page. The quietest ring here on
      // purpose: it is the first thing most people will ever unlock.
      return { type: 'shadow', boxShadow: `0 0 0 3px #e8d9b4, 0 0 0 5px rgba(184,137,43,0.30), ${BASE_SHADOW}` }
    case 'ink':
      // Iron-gall ink, with the gold glint of a nib.
      return { type: 'shadow', boxShadow: `0 0 0 3px #2c3550, 0 0 0 5px rgba(255,210,63,0.42), 0 0 12px 1px rgba(44,53,80,0.55), ${BASE_SHADOW}` }
    case 'illumination':
      // Gold leaf and lapis in the margin of a manuscript. Still — an
      // illuminated capital doesn't spin.
      return {
        type: 'gradient',
        gradient: 'conic-gradient(from 210deg, #ffd23f 0%, #f6e4a8 12%, #2a4a8f 26%, #ffd23f 40%, #9a2f2f 54%, #f6e4a8 68%, #2a4a8f 82%, #ffd23f 100%)',
        glow: '0 0 14px 2px rgba(255,210,63,0.35), 0 6px 16px rgba(0,0,0,0.4)',
      }
    case 'codex':
      // All 1,189 chapters. The only reading ring that moves.
      return {
        type: 'gradient',
        gradient: 'conic-gradient(from 0deg, #fdfaf0, #e8d9b4, #ffd23f, #fdfaf0, #b8892b, #fdfaf0, #e8d9b4)',
        animated: true,
      }
    case 'cornerstone':
      // Mostly pale limestone, with two gold veins running through the ring —
      // the card's texture wrapped round the face. Still, like the stone.
      return {
        type: 'gradient',
        gradient: 'conic-gradient(from 200deg, #efe6d3 0%, #d9ccb0 9%, #ffd23f 13%, #f6eedc 18%, #e6dac2 40%, #f3ebd9 55%, #ffd23f 60%, #d9ccb0 64%, #efe6d3 80%, #e6dac2 100%)',
        glow: '0 0 14px 2px rgba(255,210,63,0.35), 0 6px 16px rgba(0,0,0,0.4)',
      }
    case 'default':
    default:
      return { type: 'shadow', boxShadow: `0 0 0 3px var(--gold), ${BASE_SHADOW}` }
  }
}
