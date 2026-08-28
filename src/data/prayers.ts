// Practice prayers — the one thing in this app that isn't a game.
//
// It lives in the Upper Room because that is the room in this app that belongs
// to one person, and praying is the thing you do in a room by yourself. Tap
// your own figure standing in it and it offers to pray with you.
//
// WHY IT GENERATES RATHER THAN QUOTES. Somebody who is nervous about praying
// out loud is rarely short of prayers to read — they are short of a SHAPE, and
// the fear is of not knowing what comes next. So a prayer here is built from
// four movements in order, one line drawn from each, and the sheet can name
// them: who you're talking to, what you're thankful for, what you're asking,
// and how you finish. Read a dozen and the shape is yours; that is the whole
// goal, and it is why this is not a list of famous prayers.
//
// THREE RULES, and they are the reason this can exist in a game at all:
//
//   IT PAYS, AND THE SERVER DECIDES. Three a day, 10 XP each (0073). The
//   earlier version of this paid nothing on the argument that a count of
//   prayers said is a number you start performing for; that call was reversed
//   by the app's owner, so what matters is HOW it pays. `xp` is the worldwide
//   leaderboard (0006), so this follows the Basin's doctrine exactly: the
//   client says "I prayed", the server counts the rows and pays, and no client
//   ever sends an amount. The fourth prayer of a day is still a prayer — it
//   just doesn't pay, and the sheet never treats that as an error.
//
//   THE CAP AND THE PAYOUT EXIST TWICE, like all reward math here — the two
//   constants below for guests, `record_prayer` (0073) for accounts. Change
//   one, change the other.
//
//   NOTHING IS SHARED. The table records a user and a DATE and nothing else —
//   no occasion, no text, no streak — because the cap has to be counted and
//   that is the whole of what counting it requires. No other player can ever
//   see it, and there is deliberately no RPC that asks how much somebody else
//   has prayed. There is also no Journal ladder for it, which is the one piece
//   of the original rule that stands: a rung you climb by praying is a rung you
//   would pray to climb.
//
//   NO PLAYER-AUTHORED TEXT, same as everywhere else — every line below is
//   written here, so there is nothing to moderate and nothing to fetch.
//
// The language is deliberately plain and broadly Christian: no tradition's
// formulae, nothing that assumes a denomination, and nothing that assumes the
// person praying is sure. `data/denominations.ts` promises every faction the
// same treatment with no asterisk, and this has to keep that promise.

/** Three a day. KEEP IN SYNC with `cap` in record_prayer (0073). */
export const PRAYER_DAILY_CAP = 3

/** What one prayer pays. KEEP IN SYNC with `pay` in record_prayer (0073). */
export const PRAYER_XP = 10

export type Occasion =
  | 'morning'
  | 'evening'
  | 'worry'
  | 'thanks'
  | 'someone'
  | 'hard_day'
  | 'reading'
  | 'courage'
  | 'sorry'
  | 'meal'

export interface OccasionDef {
  id: Occasion
  label: string
  emoji: string
  /** One line under the title, saying when a person might reach for this. */
  blurb: string
}

export const OCCASIONS: OccasionDef[] = [
  { id: 'morning', label: 'Morning', emoji: '🌅', blurb: 'Before the day starts.' },
  { id: 'evening', label: 'Evening', emoji: '🌙', blurb: 'At the end of it.' },
  { id: 'thanks', label: 'Thanks', emoji: '🌾', blurb: 'When something went right.' },
  { id: 'worry', label: 'Worry', emoji: '🕊️', blurb: 'When your head is loud.' },
  { id: 'hard_day', label: 'A hard day', emoji: '🌧️', blurb: 'When it has been heavy.' },
  { id: 'someone', label: 'For someone', emoji: '🤝', blurb: 'When it is not about you.' },
  { id: 'courage', label: 'Courage', emoji: '🦁', blurb: 'Before something you are dreading.' },
  { id: 'sorry', label: 'Sorry', emoji: '🌱', blurb: 'When you got it wrong.' },
  { id: 'reading', label: 'Before reading', emoji: '📖', blurb: 'Opening the Bible.' },
  { id: 'meal', label: 'A meal', emoji: '🍞', blurb: 'Before you eat.' },
]

export const occasionById = (id?: string | null): OccasionDef | undefined =>
  OCCASIONS.find((o) => o.id === id)

/** The four movements, in the order they are always said. */
export const MOVEMENTS = [
  { key: 'address', label: 'Who you’re talking to' },
  { key: 'thanks', label: 'Something you’re thankful for' },
  { key: 'ask', label: 'What you’re asking' },
  { key: 'close', label: 'How you finish' },
] as const

export type MovementKey = (typeof MOVEMENTS)[number]['key']

/** A line, and which occasions it suits. No `only` means it suits all of them. */
interface Line {
  text: string
  only?: Occasion[]
}

// ── 1. Who you're talking to ────────────────────────────────────────────────
// Deliberately unfussy. The single most common thing that stops someone praying
// out loud is not knowing how to start the sentence.
const ADDRESS: Line[] = [
  { text: 'Father, it’s me.' },
  { text: 'God, thank you that I can just talk to you.' },
  { text: 'Lord, I don’t really know how to say this, so I’ll just say it.' },
  { text: 'Father, thank you for listening, even to a clumsy prayer.' },
  { text: 'God, here I am.' },
  { text: 'Lord, thank you that you already know what I’m about to say.' },
  { text: 'Father, good morning.', only: ['morning'] },
  { text: 'Lord, it’s the end of the day.', only: ['evening'] },
  { text: 'God, before I open this, I want to say something.', only: ['reading'] },
  { text: 'Father, before we eat.', only: ['meal'] },
]

// ── 2. Something you're thankful for ────────────────────────────────────────
const THANKS: Line[] = [
  { text: 'Thank you for today — for the whole of it, the good and the ordinary.' },
  { text: 'Thank you that I woke up and got to try again.' },
  { text: 'Thank you for the people who put up with me.' },
  { text: 'Thank you that you have never once been tired of me.' },
  { text: 'Thank you for this morning, and for the day that hasn’t happened yet.', only: ['morning'] },
  { text: 'Thank you for getting me through today, even the parts I got wrong.', only: ['evening', 'hard_day'] },
  { text: 'Thank you — really, thank you. I don’t want to rush past this one.', only: ['thanks'] },
  { text: 'Thank you that you are not anxious about any of this.', only: ['worry'] },
  { text: 'Thank you for the person I’m about to pray for.', only: ['someone'] },
  { text: 'Thank you that your patience with me has not run out.', only: ['sorry'] },
  { text: 'Thank you that your word is here and I can read it for myself.', only: ['reading'] },
  { text: 'Thank you for this food, and for whoever made it.', only: ['meal'] },
  { text: 'Thank you that courage isn’t something I have to manufacture alone.', only: ['courage'] },
]

// ── 3. What you're asking ───────────────────────────────────────────────────
const ASK: Line[] = [
  { text: 'Help me be kind today, especially when it costs me something.', only: ['morning'] },
  { text: 'Go ahead of me into the parts of today I’m not looking forward to.', only: ['morning'] },
  { text: 'Make me useful to somebody today, even in a small way.', only: ['morning'] },

  { text: 'Take the weight of today off me. I don’t want to carry it into tomorrow.', only: ['evening'] },
  { text: 'Forgive me for what I got wrong today, and let me put it down.', only: ['evening'] },
  { text: 'Let me sleep, and let me wake up gentler than I was.', only: ['evening'] },

  { text: 'Quiet my head. I’ve been turning this over for days and it hasn’t helped.', only: ['worry'] },
  { text: 'Help me to hand this to you and not immediately take it back.', only: ['worry'] },
  { text: 'Give me enough peace for tonight. I’ll come back tomorrow for more.', only: ['worry'] },

  { text: 'Help me not to hurry past this and forget it by Thursday.', only: ['thanks'] },
  { text: 'Teach me to notice the good things sooner.', only: ['thanks'] },
  { text: 'Let this thankfulness change how I treat people today.', only: ['thanks'] },

  { text: 'Be near them. Be more real to them than whatever they’re facing.', only: ['someone'] },
  { text: 'Give them what I can’t give them, and show me the bit I can.', only: ['someone'] },
  { text: 'Help me love them well, and not just feel sorry for them.', only: ['someone'] },

  { text: 'Today was heavy. I’m not asking you to explain it — just don’t leave.', only: ['hard_day'] },
  { text: 'Help me get through tonight, and give me the next step in the morning.', only: ['hard_day'] },
  { text: 'Let me be honest with you about how much this hurts.', only: ['hard_day'] },

  { text: 'Open this up for me. Don’t let me read it as words on a page.', only: ['reading'] },
  { text: 'Show me one thing here I can actually do something about.', only: ['reading'] },
  { text: 'Help me listen to this instead of just finishing it.', only: ['reading'] },

  { text: 'I’m afraid of this. Go with me into it anyway.', only: ['courage'] },
  { text: 'Give me the nerve to do the right thing when it would be easier not to.', only: ['courage'] },
  { text: 'Steady me. I don’t need to feel brave, I just need to not run.', only: ['courage'] },

  { text: 'I’m sorry. I’m not going to explain it away — I just want to say it.', only: ['sorry'] },
  { text: 'Help me put right what I can, and to actually go and do it.', only: ['sorry'] },
  { text: 'Change the thing in me that keeps doing this.', only: ['sorry'] },

  { text: 'Thank you for what’s in front of us. Let us not take it for granted.', only: ['meal'] },
  { text: 'Bless the people at this table, and the ones who should be here and aren’t.', only: ['meal'] },
  { text: 'Remind us of the people who don’t have this today.', only: ['meal'] },
]

// ── 4. How you finish ───────────────────────────────────────────────────────
// The ending is the other half of the fear: people trail off because nobody
// told them a prayer is allowed to just stop.
const CLOSE: Line[] = [
  { text: 'In Jesus’ name, amen.' },
  { text: 'Amen.' },
  { text: 'I’ll talk to you later. Amen.' },
  { text: 'Thank you for listening. Amen.' },
  { text: 'That’s all I’ve got. Amen.' },
  { text: 'In Jesus’ name — amen.' },
]

export interface Prayer {
  occasion: Occasion
  lines: { movement: MovementKey; text: string }[]
}

// A tiny seeded RNG so a prayer can be rebuilt from its seed — which is what
// lets "read it again" and the read-aloud show the SAME prayer rather than
// quietly swapping a line mid-sentence on a re-render.
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const forOccasion = (pool: Line[], occasion: Occasion): Line[] => {
  const fitted = pool.filter((l) => !l.only || l.only.includes(occasion))
  // Never return an empty pool: a movement with nothing to say would silently
  // drop a whole line out of the prayer.
  return fitted.length ? fitted : pool.filter((l) => !l.only)
}

/** Build the prayer for this occasion and seed. Pure — same seed, same prayer. */
export function buildPrayer(occasion: Occasion, seed: number): Prayer {
  const r = rng(seed)
  const pick = (pool: Line[]) => {
    const fitted = forOccasion(pool, occasion)
    return fitted[Math.floor(r() * fitted.length)].text
  }
  return {
    occasion,
    lines: [
      { movement: 'address', text: pick(ADDRESS) },
      { movement: 'thanks', text: pick(THANKS) },
      { movement: 'ask', text: pick(ASK) },
      { movement: 'close', text: pick(CLOSE) },
    ],
  }
}

/** The whole prayer as one string, for the read-aloud and for copying. */
export const prayerText = (p: Prayer): string => p.lines.map((l) => l.text).join(' ')

// ── Dev assertion ───────────────────────────────────────────────────────────
// Every occasion must be able to fill every movement. An occasion with no `ask`
// of its own would silently fall back to the general pool and read as somebody
// else's prayer — invisible in a diff, obvious only if you happened to open
// that one occasion. Same guard shape as checkQuestVerbs() and checkTrackData().
export function checkPrayerData(): string[] {
  const problems: string[] = []
  for (const o of OCCASIONS) {
    if (!forOccasion(ASK, o.id).some((l) => l.only?.includes(o.id))) {
      problems.push(`occasion "${o.id}" has no ask of its own and will borrow a general one`)
    }
    for (const [name, pool] of [['address', ADDRESS], ['thanks', THANKS], ['close', CLOSE]] as const) {
      if (forOccasion(pool, o.id).length === 0) problems.push(`occasion "${o.id}" has no ${name} line`)
    }
  }
  return problems
}

if (import.meta.env.DEV) {
  const problems = checkPrayerData()
  if (problems.length) console.error('[prayers]\n' + problems.join('\n'))
}
