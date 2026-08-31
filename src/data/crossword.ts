// The Cross Word — two words, one shared letter, laid out in the shape of a
// cross.
//
// A puzzle is deliberately tiny: an upright word read top-to-bottom and a
// crossbar word read left-to-right, crossing at one letter they have in common.
// Both words come from the SAME verse, and that verse is the reward — it stays
// hidden until the cross is finished, then it's read under the wood.
//
// Three rules hold this data together, and `scripts/check-cross.mjs` fails the
// build on any of them (see also `checkCrossPuzzles()` below, which asserts the
// same things at import in dev):
//
//  1. **The shape must read as a cross.** The crossbar sits in the upper third
//     of the upright (`downIndex` between 1 and a third of the word) and crosses
//     the crossbar near ITS middle, so the arms are even. Cross the words
//     anywhere else and you get a plus sign, a T, or a lopsided stick.
//  2. **The verse is the source of truth.** `reference` must name a verse in
//     `VERSE_POOL`, and BOTH words must actually appear in that verse's text.
//     The whole payoff is "oh — that's where those two words live", so a word
//     that isn't in the verse quietly turns the reveal into a non sequitur.
//  3. **A clue never contains its own answer.** Easy to do by accident when the
//     clue is written from the verse.
//
// Nothing here is scored, timed or ranked — it lives in Study, so it pays what
// every study run pays (a relic roll, a step on the road) and nothing else.

import { VERSE_POOL, type VerseSeed } from './bible/pool'

export interface CrossWord {
  /** The answer, A–Z only, upper case. */
  word: string
  /** What the player is given. Must not contain the answer. */
  clue: string
}

export interface CrossPuzzle {
  /** Stable id — the solved set is keyed by it, so never renumber one. */
  id: string
  /** A verse in VERSE_POOL. Its text is the reveal, and it holds both words. */
  reference: string
  /** The upright, read top to bottom. */
  down: CrossWord
  /** Which letter of the upright the crossbar crosses — the beam's height. */
  downIndex: number
  /** The crossbar, read left to right. */
  across: CrossWord
  /** Which letter of the crossbar sits on the upright. */
  acrossIndex: number
}

// Forty crosses, Genesis to Revelation. Every pair was drawn from the verse it
// names, so a solved puzzle always resolves into a verse that contains both
// words. Adding one is: pick a pool verse, find two words in it that share a
// letter in the right places, write two clues, run `npm run check:cross`.
export const CROSS_PUZZLES: CrossPuzzle[] = [
  {
    id: 'genesis-1-1',
    reference: 'Genesis 1:1',
    down: { word: 'BEGINNING', clue: 'Where the whole story starts' },
    downIndex: 1,
    across: { word: 'CREATED', clue: 'Made something where there had been nothing' },
    acrossIndex: 2,
  },
  {
    id: 'exodus-14-14',
    reference: 'Exodus 14:14',
    down: { word: 'FIGHT', clue: 'What the LORD promises to do for you at the sea' },
    downIndex: 1,
    across: { word: 'STILL', clue: 'Quiet and unmoving — all you have to be' },
    acrossIndex: 2,
  },
  {
    id: 'joshua-1-9',
    reference: 'Joshua 1:9',
    down: { word: 'STRONG', clue: 'The first thing God commands Joshua to be' },
    downIndex: 2,
    across: { word: 'AFRAID', clue: 'What God tells him not to be' },
    acrossIndex: 2,
  },
  {
    id: 'psalm-23-4',
    reference: 'Psalm 23:4',
    down: { word: 'VALLEY', clue: 'The low place David walks through' },
    downIndex: 1,
    across: { word: 'SHADOW', clue: 'The dark shape a thing casts — of death, here' },
    acrossIndex: 2,
  },
  {
    id: 'psalm-27-1',
    reference: 'Psalm 27:1',
    down: { word: 'LIGHT', clue: 'What the LORD is, against every darkness' },
    downIndex: 1,
    across: { word: 'LIFE', clue: 'The LORD is the stronghold of it' },
    acrossIndex: 1,
  },
  {
    id: 'psalm-42-1',
    reference: 'Psalm 42:1',
    down: { word: 'STREAMS', clue: 'Running water, which the deer is longing for' },
    downIndex: 1,
    across: { word: 'PANTS', clue: 'Breathes hard with wanting' },
    acrossIndex: 3,
  },
  {
    id: 'psalm-46-1',
    reference: 'Psalm 46:1',
    down: { word: 'REFUGE', clue: 'A safe place to run into' },
    downIndex: 1,
    across: { word: 'STRENGTH', clue: 'What God is when yours is gone' },
    acrossIndex: 3,
  },
  {
    id: 'psalm-46-10',
    reference: 'Psalm 46:10',
    down: { word: 'NATIONS', clue: 'Whole countries — God will be exalted among them' },
    downIndex: 2,
    across: { word: 'STILL', clue: 'What to be, in order to know that He is God' },
    acrossIndex: 1,
  },
  {
    id: 'psalm-51-10',
    reference: 'Psalm 51:10',
    down: { word: 'CREATE', clue: 'What David asks God to do, not merely repair' },
    downIndex: 2,
    across: { word: 'CLEAN', clue: 'Washed, with nothing left staining it' },
    acrossIndex: 2,
  },
  {
    id: 'psalm-100-1',
    reference: 'Psalm 100:1',
    down: { word: 'JOYFUL', clue: 'Full of gladness' },
    downIndex: 1,
    across: { word: 'NOISE', clue: 'A loud sound — make one to the LORD' },
    acrossIndex: 1,
  },
  {
    id: 'psalm-121-1',
    reference: 'Psalm 121:1',
    down: { word: 'MAKER', clue: 'The one who made a thing — where help comes from' },
    downIndex: 1,
    across: { word: 'EARTH', clue: 'The other half of what He made, after heaven' },
    acrossIndex: 1,
  },
  {
    id: 'proverbs-3-5',
    reference: 'Proverbs 3:5',
    down: { word: 'TRUST', clue: 'To lean your whole weight on someone' },
    downIndex: 1,
    across: { word: 'HEART', clue: 'What to do it with — all of it' },
    acrossIndex: 3,
  },
  {
    id: 'proverbs-18-10',
    reference: 'Proverbs 18:10',
    down: { word: 'TOWER', clue: 'A tall stronghold you can run into and be safe' },
    downIndex: 1,
    across: { word: 'STRONG', clue: 'What that tower is — not weak' },
    acrossIndex: 3,
  },
  {
    id: 'proverbs-27-17',
    reference: 'Proverbs 27:17',
    down: { word: 'SHARPENS', clue: 'Puts an edge on a blade' },
    downIndex: 3,
    across: { word: 'IRON', clue: 'The metal that does it to itself' },
    acrossIndex: 1,
  },
  {
    id: 'ecclesiastes-3-1',
    reference: 'Ecclesiastes 3:1',
    down: { word: 'SEASON', clue: 'A time appointed for everything' },
    downIndex: 2,
    across: { word: 'HEAVEN', clue: 'Under it, every activity has its hour' },
    acrossIndex: 2,
  },
  {
    id: 'isaiah-40-31',
    reference: 'Isaiah 40:31',
    down: { word: 'EAGLES', clue: 'Great birds that ride the wind without flapping' },
    downIndex: 2,
    across: { word: 'WINGS', clue: 'What those who wait on the LORD mount up on' },
    acrossIndex: 3,
  },
  {
    id: 'isaiah-53-5',
    reference: 'Isaiah 53:5',
    down: { word: 'PIERCED', clue: 'Run through — what He was, for our transgressions' },
    downIndex: 1,
    across: { word: 'STRIPES', clue: 'The marks a scourging leaves; by them we are healed' },
    acrossIndex: 3,
  },
  {
    id: 'jeremiah-29-11',
    reference: 'Jeremiah 29:11',
    down: { word: 'PROSPER', clue: 'To flourish — what the plans are for, not harm' },
    downIndex: 2,
    across: { word: 'HOPE', clue: 'Looking forward to a good you cannot see yet' },
    acrossIndex: 1,
  },
  {
    id: 'micah-6-8',
    reference: 'Micah 6:8',
    down: { word: 'HUMBLY', clue: 'How to walk with your God' },
    downIndex: 1,
    across: { word: 'REQUIRE', clue: 'To ask for as a duty — what the LORD does of you' },
    acrossIndex: 3,
  },
  {
    id: 'matthew-4-4',
    reference: 'Matthew 4:4',
    down: { word: 'WRITTEN', clue: 'How Jesus answers the tempter: "It is ___"' },
    downIndex: 1,
    across: { word: 'BREAD', clue: 'What man shall not live on alone' },
    acrossIndex: 1,
  },
  {
    id: 'matthew-5-9',
    reference: 'Matthew 5:9',
    down: { word: 'BLESSED', clue: 'What the peacemakers are' },
    downIndex: 1,
    across: { word: 'CALLED', clue: 'Named as — sons of God' },
    acrossIndex: 2,
  },
  {
    id: 'matthew-5-14',
    reference: 'Matthew 5:14',
    down: { word: 'HIDDEN', clue: 'What a city on a hill cannot be' },
    downIndex: 1,
    across: { word: 'LIGHT', clue: 'What Jesus calls His followers, for the world' },
    acrossIndex: 1,
  },
  {
    id: 'matthew-5-16',
    reference: 'Matthew 5:16',
    down: { word: 'SHINE', clue: 'What your light should do in front of people' },
    downIndex: 1,
    across: { word: 'FATHER', clue: 'The one they end up praising, not you' },
    acrossIndex: 3,
  },
  {
    id: 'matthew-6-21',
    reference: 'Matthew 6:21',
    down: { word: 'TREASURE', clue: 'What you store up and value most' },
    downIndex: 1,
    across: { word: 'HEART', clue: 'What follows it, wherever it is' },
    acrossIndex: 3,
  },
  {
    id: 'matthew-7-7',
    reference: 'Matthew 7:7',
    down: { word: 'KNOCK', clue: 'What to do at a shut door' },
    downIndex: 1,
    across: { word: 'OPENED', clue: 'What that door will be, for you' },
    acrossIndex: 3,
  },
  {
    id: 'matthew-11-28',
    reference: 'Matthew 11:28',
    down: { word: 'WEARY', clue: 'Worn out — one of the two kinds of people invited' },
    downIndex: 1,
    across: { word: 'REST', clue: 'What Jesus gives to whoever comes' },
    acrossIndex: 1,
  },
  {
    id: 'matthew-28-19',
    reference: 'Matthew 28:19',
    down: { word: 'DISCIPLES', clue: 'Learners and followers — go and make them' },
    downIndex: 1,
    across: { word: 'NATIONS', clue: 'All of them: how far the commission reaches' },
    acrossIndex: 3,
  },
  {
    id: 'mark-4-39',
    reference: 'Mark 4:39',
    down: { word: 'SILENCE', clue: 'What Jesus commands the storm into' },
    downIndex: 1,
    across: { word: 'WIND', clue: 'One of the two things He rebukes' },
    acrossIndex: 1,
  },
  {
    id: 'mark-8-34',
    reference: 'Mark 8:34',
    down: { word: 'CROSS', clue: 'What to take up, if you would come after Him' },
    downIndex: 2,
    across: { word: 'ANYONE', clue: 'Every single person, without exception' },
    acrossIndex: 3,
  },
  {
    id: 'luke-2-11',
    reference: 'Luke 2:11',
    down: { word: 'DAVID', clue: 'The king whose city it happened in' },
    downIndex: 2,
    across: { word: 'SAVIOR', clue: 'The one who rescues — born to you today' },
    acrossIndex: 2,
  },
  {
    id: 'john-1-29',
    reference: 'John 1:29',
    down: { word: 'COMING', clue: 'What John sees Jesus doing, toward him' },
    downIndex: 2,
    across: { word: 'LAMB', clue: 'What John calls Him, who takes away the sin of the world' },
    acrossIndex: 2,
  },
  {
    id: 'john-8-32',
    reference: 'John 8:32',
    down: { word: 'TRUTH', clue: 'What you will know' },
    downIndex: 1,
    across: { word: 'FREE', clue: 'What it will make you' },
    acrossIndex: 1,
  },
  {
    id: 'john-10-11',
    reference: 'John 10:11',
    down: { word: 'SHEPHERD', clue: 'The good one lays down his life for the flock' },
    downIndex: 1,
    across: { word: 'SHEEP', clue: 'The flock itself' },
    acrossIndex: 1,
  },
  {
    id: 'john-11-35',
    reference: 'John 11:35',
    down: { word: 'JESUS', clue: 'The first word of the Bible’s shortest verse' },
    downIndex: 1,
    across: { word: 'WEPT', clue: 'The second one — what He did at the tomb' },
    acrossIndex: 1,
  },
  {
    id: 'john-15-5',
    reference: 'John 15:5',
    down: { word: 'BRANCHES', clue: 'What we are, in His picture of the garden' },
    downIndex: 3,
    across: { word: 'VINE', clue: 'What He is, in the same picture' },
    acrossIndex: 2,
  },
  {
    id: 'romans-5-8',
    reference: 'Romans 5:8',
    down: { word: 'SINNERS', clue: 'What we still were when He died for us' },
    downIndex: 1,
    across: { word: 'CHRIST', clue: 'The title that means "anointed one"' },
    acrossIndex: 3,
  },
  {
    id: 'romans-6-23',
    reference: 'Romans 6:23',
    down: { word: 'ETERNAL', clue: 'Without end — the kind of life God gives' },
    downIndex: 2,
    across: { word: 'WAGES', clue: 'What sin pays out, like an employer' },
    acrossIndex: 3,
  },
  {
    id: '1cor-13-13',
    reference: '1 Corinthians 13:13',
    down: { word: 'FAITH', clue: 'First of the three that remain' },
    downIndex: 1,
    across: { word: 'GREATEST', clue: 'What love is, of the three' },
    acrossIndex: 3,
  },
  {
    id: '1cor-15-57',
    reference: '1 Corinthians 15:57',
    down: { word: 'VICTORY', clue: 'What God gives us, over death itself' },
    downIndex: 1,
    across: { word: 'CHRIST', clue: 'Who it comes through, with the Lord Jesus' },
    acrossIndex: 3,
  },
  {
    id: '2cor-5-7',
    reference: '2 Corinthians 5:7',
    down: { word: 'FAITH', clue: 'What we walk by' },
    downIndex: 2,
    across: { word: 'SIGHT', clue: 'What we do not walk by' },
    acrossIndex: 1,
  },
  {
    id: 'galatians-5-22',
    reference: 'Galatians 5:22',
    down: { word: 'PATIENCE', clue: 'Bearing with people and with time' },
    downIndex: 3,
    across: { word: 'FRUIT', clue: 'What the Spirit grows — one word for all nine' },
    acrossIndex: 3,
  },
  {
    id: 'ephesians-2-8',
    reference: 'Ephesians 2:8',
    down: { word: 'THROUGH', clue: 'By way of — grace reaches you this way, by faith' },
    downIndex: 2,
    across: { word: 'GRACE', clue: 'A gift nobody earned' },
    acrossIndex: 1,
  },
  {
    id: 'ephesians-6-11',
    reference: 'Ephesians 6:11',
    down: { word: 'ARMOR', clue: 'What to put on — the whole of it' },
    downIndex: 2,
    across: { word: 'SCHEMES', clue: 'The devil’s crafty plans' },
    acrossIndex: 4,
  },
  {
    id: 'philippians-4-6',
    reference: 'Philippians 4:6',
    down: { word: 'PETITION', clue: 'A request made to God, with thanksgiving' },
    downIndex: 3,
    across: { word: 'ANXIOUS', clue: 'What not to be about anything' },
    acrossIndex: 3,
  },
  {
    id: 'colossians-3-13',
    reference: 'Colossians 3:13',
    down: { word: 'FORGIVE', clue: 'To let a grievance go, as the Lord did for you' },
    downIndex: 1,
    across: { word: 'ANOTHER', clue: 'One ___: who you bear with' },
    acrossIndex: 2,
  },
  {
    id: 'hebrews-11-1',
    reference: 'Hebrews 11:1',
    down: { word: 'CERTAINTY', clue: 'Being sure of what you cannot see' },
    downIndex: 3,
    across: { word: 'FAITH', clue: 'The thing being defined' },
    acrossIndex: 3,
  },
  {
    id: 'hebrews-12-2',
    reference: 'Hebrews 12:2',
    down: { word: 'AUTHOR', clue: 'The one who begins a thing — of our faith' },
    downIndex: 1,
    across: { word: 'ENDURED', clue: 'What He did with the cross, for the joy ahead' },
    acrossIndex: 3,
  },
  {
    id: 'hebrews-13-8',
    reference: 'Hebrews 13:8',
    down: { word: 'YESTERDAY', clue: 'The day before this one — He was the same then' },
    downIndex: 1,
    across: { word: 'FOREVER', clue: 'And He will be the same for this long' },
    acrossIndex: 3,
  },
  {
    id: 'james-4-7',
    reference: 'James 4:7',
    down: { word: 'RESIST', clue: 'To stand against' },
    downIndex: 1,
    across: { word: 'DEVIL', clue: 'The one who will flee from you' },
    acrossIndex: 1,
  },
  {
    id: '2timothy-4-7',
    reference: '2 Timothy 4:7',
    down: { word: 'FAITH', clue: 'What Paul says he has kept' },
    downIndex: 1,
    across: { word: 'RACE', clue: 'What he says he has finished' },
    acrossIndex: 1,
  },
  {
    id: '1john-4-8',
    reference: '1 John 4:8',
    down: { word: 'WHOEVER', clue: 'Anyone at all — the one who does not love' },
    downIndex: 2,
    across: { word: 'LOVE', clue: 'What God is, not merely what He does' },
    acrossIndex: 1,
  },
  {
    id: 'revelation-3-20',
    reference: 'Revelation 3:20',
    down: { word: 'VOICE', clue: 'What anyone has to hear before opening' },
    downIndex: 1,
    across: { word: 'DOOR', clue: 'What He stands at and knocks on' },
    acrossIndex: 1,
  },
]

/** Rows and columns a puzzle's grid needs. */
export function crossSize(p: CrossPuzzle): { rows: number; cols: number } {
  return { rows: p.down.word.length, cols: p.across.word.length }
}

/** The cell the two words share — the joint of the cross. */
export function crossJoint(p: CrossPuzzle): { row: number; col: number } {
  return { row: p.downIndex, col: p.acrossIndex }
}

/** Every cell the puzzle actually has, as "row,col" keys. */
export function crossCells(p: CrossPuzzle): string[] {
  const { rows, cols } = crossSize(p)
  const keys: string[] = []
  for (let r = 0; r < rows; r++) keys.push(`${r},${p.acrossIndex}`)
  for (let c = 0; c < cols; c++) if (c !== p.acrossIndex) keys.push(`${p.downIndex},${c}`)
  return keys
}

/** The verse a finished cross reveals. Null only if the data drifted. */
export function crossVerse(p: CrossPuzzle): VerseSeed | null {
  return VERSE_POOL.find((v) => v.reference === p.reference) ?? null
}

export function crossById(id: string): CrossPuzzle | null {
  return CROSS_PUZZLES.find((p) => p.id === id) ?? null
}

// --- the daily rotation -----------------------------------------------------
// Same construction as `getVerseForDate`: one fixed shuffle of the whole set,
// indexed by day number, so everyone gets the same cross on the same date and
// every puzzle comes round once before any repeats. Changing the seed below
// reshuffles history — don't.

function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function order(): number[] {
  const rng = mulberry32(hashString('cross-order-v1'))
  const a = CROSS_PUZZLES.map((_, i) => i)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function dayNumber(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Math.floor(Date.UTC(y || 1970, (m || 1) - 1, d || 1) / 86400000)
}

/** The cross everyone gets on a given local date. */
export function crossForDate(dateStr: string): CrossPuzzle {
  const N = CROSS_PUZZLES.length
  const idx = ((dayNumber(dateStr) % N) + N) % N
  return CROSS_PUZZLES[order()[idx]]
}

/**
 * The crosses from days already past, most recent first.
 *
 * "Build another" draws from here rather than from the whole set, so playing
 * more can never spoil tomorrow's cross for you — the same courtesy the daily
 * drop's replay list extends.
 */
export function pastCrosses(dateStr: string): CrossPuzzle[] {
  const N = CROSS_PUZZLES.length
  const seq = order()
  const today = ((dayNumber(dateStr) % N) + N) % N
  const out: CrossPuzzle[] = []
  for (let back = 1; back < N; back++) out.push(CROSS_PUZZLES[seq[(today - back + N) % N]])
  return out
}

// --- dev-time integrity check ----------------------------------------------
// Mirrors scripts/check-cross.mjs, which runs in the build. This one runs at
// import in dev so a puzzle added mid-session says what's wrong with it before
// the shape looks odd on screen. Same habit as `checkTrackData` in data/music.
export function checkCrossPuzzles(): string[] {
  const problems: string[] = []
  const seen = new Set<string>()

  for (const p of CROSS_PUZZLES) {
    const at = `cross ${p.id}`
    if (seen.has(p.id)) problems.push(`${at}: duplicate id`)
    seen.add(p.id)

    const down = p.down.word
    const across = p.across.word
    if (!/^[A-Z]{5,9}$/.test(down)) problems.push(`${at}: the upright must be 5–9 letters, A–Z`)
    if (!/^[A-Z]{3,8}$/.test(across)) problems.push(`${at}: the crossbar must be 3–8 letters, A–Z`)

    if (p.downIndex < 1 || p.downIndex >= down.length) {
      problems.push(`${at}: downIndex out of range`)
    } else if (p.downIndex > Math.ceil(down.length / 3)) {
      // A crossbar below the upper third is a plus sign, not a cross.
      problems.push(`${at}: the crossbar sits too low on the upright (${p.downIndex})`)
    }

    if (p.acrossIndex < 0 || p.acrossIndex >= across.length) {
      problems.push(`${at}: acrossIndex out of range`)
    } else if (Math.abs(p.acrossIndex - (across.length - 1) / 2) > 1) {
      problems.push(`${at}: the arms are lopsided (${p.acrossIndex} of ${across.length})`)
    }

    if (down[p.downIndex] !== across[p.acrossIndex]) {
      problems.push(`${at}: the words don't share a letter where they cross`)
    }

    const verse = crossVerse(p)
    if (!verse) {
      problems.push(`${at}: ${p.reference} is not in VERSE_POOL`)
    } else {
      const text = verse.text.replace(/[‘’']/g, '').toUpperCase()
      for (const w of [down, across]) {
        if (!new RegExp(`\\b${w}\\b`).test(text)) {
          problems.push(`${at}: "${w}" does not appear in ${p.reference}`)
        }
      }
    }

    for (const side of [p.down, p.across]) {
      if (side.clue.toUpperCase().includes(side.word)) {
        problems.push(`${at}: the clue for "${side.word}" gives the answer away`)
      }
    }
  }

  return problems
}

if (import.meta.env?.DEV) {
  const problems = checkCrossPuzzles()
  if (problems.length) console.error('[crossword] data problems:\n' + problems.join('\n'))
}
