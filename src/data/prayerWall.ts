// The Prayer Wall — leave a note, or hold a candle for somebody else's.
//
// "Bear ye one another's burdens, and so fulfil the law of Christ." —
// Galatians 6:2
//
// A player tucks ONE request into the wall. Anybody else who comes to it is
// DEALT a note — the wall hands one out, nobody browses — and kneeling for it
// (holding the candle until the wick catches) is one row on the server and one
// XP for the person who knelt. The requester learns that somebody knelt today,
// and nothing about who.
//
// THREE RULES, and they are the whole reason this can exist here:
//
//   THE CATEGORY IS WHAT TRAVELS. A stranger sees one of the eight tokens
//   below and nothing else. The optional line is shown only to the requester's
//   own church and their buddies — people who already know them by name — so
//   the app's first player-authored text never reaches a stranger and there is
//   no global moderation surface (one report hides a note pending the
//   operator's look). Anonymous by default: health and grief are why people
//   leave these.
//
//   THE XP IS THE BASIN'S. 1 XP per kneeling, twelve a day, once per note per
//   day, never for your own note — server-counted and server-paid (0099), the
//   client never sends an amount. THE REQUESTER IS PAID NOTHING, or people
//   would post notes to farm sympathy.
//
//   NO NUMBER ON ANY NOTE. Every note on the wall looks the same to a stranger:
//   no glow that says how loved it is, no tally, no ordering by need. The one
//   count that exists is your OWN note's, returned to you alone.
//
// KEEP IN SYNC with supabase/migrations/0099 — the category list, the cap,
// the line length and the expiry are enforced there; these are what the
// screen draws.

/** Twelve a day — one for each disciple, the Basin's cap. KEEP IN SYNC with 0099. */
export const PRAY_FOR_DAILY_CAP = 12

/** What one kneeling pays the person who did it. */
export const PRAY_FOR_XP = 1

/** A line on a note. KEEP IN SYNC with the check constraint in 0099. */
export const PRAYER_LINE_MAX = 120

/** A note lives this long, and can be renewed once. Server-enforced. */
export const PRAYER_NOTE_DAYS = 7

/** How long the candle has to be held before the wick catches. */
export const CANDLE_HOLD_MS = 2400

export type PrayerCategory =
  | 'healing'
  | 'work'
  | 'decision'
  | 'grief'
  | 'family'
  | 'journey'
  | 'peace'
  | 'thanks'

export interface PrayerCategoryDef {
  id: PrayerCategory
  emoji: string
  label: string
  /** What the note is asking for, in the requester's voice. */
  ask: string
  /** One verse read over the candle. King James, like the rest of the pool. */
  verse: string
  reference: string
  /** The one line a kneeler is offered to pray. Plain, and for anybody. */
  prayer: string
}

// Eight, fixed, and not a taxonomy of suffering — broad enough that anything
// somebody would tuck into a wall fits one, few enough to fit on one screen.
// The verse under each is what makes holding the candle a reading rather than
// a button press.
export const PRAYER_CATEGORIES: PrayerCategoryDef[] = [
  {
    id: 'healing',
    emoji: '🩹',
    label: 'Healing',
    ask: 'Somebody is unwell.',
    verse: 'He healeth the broken in heart, and bindeth up their wounds.',
    reference: 'Psalm 147:3',
    prayer: 'Lord, be near the one this note is for. Bring healing, and bring rest.',
  },
  {
    id: 'work',
    emoji: '💼',
    label: 'Work or money',
    ask: 'Provision is needed.',
    verse: 'But my God shall supply all your need according to his riches in glory by Christ Jesus.',
    reference: 'Philippians 4:19',
    prayer: 'Lord, provide what is needed, and give peace while it is on its way.',
  },
  {
    id: 'decision',
    emoji: '🧭',
    label: 'A decision',
    ask: 'A choice has to be made.',
    verse: 'In all thy ways acknowledge him, and he shall direct thy paths.',
    reference: 'Proverbs 3:6',
    prayer: 'Lord, make the way plain for the one this note is for, and give them courage to take it.',
  },
  {
    id: 'grief',
    emoji: '🕊️',
    label: 'Grief',
    ask: 'Somebody has been lost.',
    verse: 'Blessed are they that mourn: for they shall be comforted.',
    reference: 'Matthew 5:4',
    prayer: 'Lord, sit with the one this note is for. Hold what they cannot.',
  },
  {
    id: 'family',
    emoji: '🏠',
    label: 'Family',
    ask: 'Something at home.',
    verse: 'Behold, how good and how pleasant it is for brethren to dwell together in unity!',
    reference: 'Psalm 133:1',
    prayer: 'Lord, bring peace under that roof, and mend what is strained.',
  },
  {
    id: 'journey',
    emoji: '🧳',
    label: 'A journey',
    ask: 'Somebody is travelling, or starting over.',
    verse: 'The LORD shall preserve thy going out and thy coming in from this time forth, and even for evermore.',
    reference: 'Psalm 121:8',
    prayer: 'Lord, go ahead of them, and bring them safely where they are going.',
  },
  {
    id: 'peace',
    emoji: '🌊',
    label: 'Peace of mind',
    ask: 'A head that is loud.',
    verse: 'Peace I leave with you, my peace I give unto you: not as the world giveth, give I unto you.',
    reference: 'John 14:27',
    prayer: 'Lord, quiet the one this note is for. Let them sleep tonight.',
  },
  {
    id: 'thanks',
    emoji: '🌾',
    label: 'Thanks',
    ask: 'Something went right, and it should be said.',
    verse: 'O give thanks unto the LORD; for he is good: for his mercy endureth for ever.',
    reference: 'Psalm 107:1',
    prayer: 'Lord, thank you — for this, and for the one who noticed it.',
  },
]

export function prayerCategoryById(id: string): PrayerCategoryDef {
  return PRAYER_CATEGORIES.find((c) => c.id === id) ?? PRAYER_CATEGORIES[0]
}

export interface PrayForMilestone {
  id: string
  /** Lifetime kneelings needed. */
  goal: number
  name: string
  blurb: string
  emoji: string
}

// A ladder, not a leaderboard: every rung is a number you passed, never a
// place you hold. There is no rung for being prayed FOR — receiving isn't an
// achievement, it's a gift (the Basin's rule, word for word).
export const PRAY_FOR_MILESTONES: PrayForMilestone[] = [
  { id: 'pray_first', goal: 1, name: 'One Candle', emoji: '🕯️', blurb: 'You knelt at a stranger’s note.' },
  { id: 'pray_twelve', goal: 12, name: 'A Whole Day', emoji: '🌙', blurb: 'Twelve — every disciple, once.' },
  { id: 'pray_fifty', goal: 50, name: 'Bearing Burdens', emoji: '🤲', blurb: 'Fifty. Galatians 6:2, lived.' },
  { id: 'pray_hundred', goal: 150, name: 'A Hundred and Fifty', emoji: '🌅', blurb: 'The wall knows your knees.' },
  { id: 'pray_intercessor', goal: 500, name: 'Intercessor', emoji: '👑', blurb: '“Pray one for another.” — James 5:16' },
]

/** The highest rung reached, or null before the first kneeling. */
export function prayForRank(lifetime: number): PrayForMilestone | null {
  let best: PrayForMilestone | null = null
  for (const m of PRAY_FOR_MILESTONES) if (lifetime >= m.goal) best = m
  return best
}

/** The rung being climbed, or null once every one is behind you. */
export function nextPrayForMilestone(lifetime: number): PrayForMilestone | null {
  return PRAY_FOR_MILESTONES.find((m) => lifetime < m.goal) ?? null
}

/** True when this kneeling was the one that reached a rung. */
export function prayForMilestoneReached(lifetime: number): PrayForMilestone | null {
  return PRAY_FOR_MILESTONES.find((m) => m.goal === lifetime) ?? null
}
