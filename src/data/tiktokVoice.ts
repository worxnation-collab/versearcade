// Which voice reads today's verse, and how.
//
// The TikTok engine reads one verse a day through a Gemini prebuilt voice, and
// the operator used to pick the voice by hand every morning. This is the
// automatic first guess: the READER FIGURE decides the voice (Peter has one
// voice; he doesn't sound like Esther on Tuesdays), and the VERSE decides the
// delivery — whose words they are, and what kind of verse it is. The operator
// can always override both in the panel; this only fills the form in.
//
// Pure and deterministic over the verse's own metadata (speaker, testament,
// theme, text), so the same verse gets the same read on every device and it
// can be tested over the whole pool in Node.

export interface VoiceSeed {
  speaker: string
  testament: 'OT' | 'NT'
  theme: string
  text: string
  book: string
}

export interface VoicePick {
  /** A Gemini prebuilt voice name, from the function's allowlist. */
  voice: string
  /** The delivery note handed to the TTS model ahead of the text. */
  style: string
  /** One line for the operator: what was chosen and why. */
  why: string
  mood: Mood
}

export type Mood = 'words-of-god' | 'comfort' | 'praise' | 'promise' | 'warning' | 'wisdom' | 'story'

// Each figure has a steady voice and a weightier one for the words of God.
// Names are Gemini's prebuilt voices; the descriptors are Google's own.
const PALETTE: Record<string, { steady: string; weighty: string; soft: string; person: string }> = {
  cephas: { steady: 'Charon', weighty: 'Orus', soft: 'Charon', person: 'Peter — a fisherman who heard these words spoken, reading them to a small room' },
  moses: { steady: 'Orus', weighty: 'Orus', soft: 'Schedar', person: 'Moses — the lawgiver, old and unhurried, reading to the people' },
  elijah: { steady: 'Algenib', weighty: 'Orus', soft: 'Sadaltager', person: 'Elijah — a prophet with a weathered voice, plain and sure' },
  david: { steady: 'Iapetus', weighty: 'Orus', soft: 'Enceladus', person: 'David — a singer, reading as though he could break into the song' },
  esther: { steady: 'Kore', weighty: 'Kore', soft: 'Aoede', person: 'Esther — a queen, composed and warm, speaking to her own people' },
  mary: { steady: 'Aoede', weighty: 'Kore', soft: 'Aoede', person: 'Mary — gentle and close, as if to one person sitting beside her' },
}
const FALLBACK = PALETTE.cephas

const MOOD_NOTE: Record<Mood, string> = {
  'words-of-god': 'These are the words of God: unhurried, with a tender authority — spoken, never preached.',
  comfort: 'Tender and reassuring, as if to someone who is afraid tonight.',
  praise: 'Lifted and glad, a little brighter than speech, but never shouted.',
  promise: 'Hopeful, with a quiet confidence — a promise being kept, not sold.',
  warning: 'Grave and steady, never harsh; the weight is in the pauses.',
  wisdom: 'Plain and steady, like good advice from an old friend.',
  story: 'Like a story being told at a table, not a lesson being given.',
}

// Scored rather than first-match: "all have sinned and fall short of the
// glory of God" is a warning that happens to contain the word "glory".
const CUES: Record<Exclude<Mood, 'words-of-god'>, string[]> = {
  warning: ['woe', 'wrath', 'judg', 'sin', 'repent', 'perish', 'wicked', 'fall short', 'condemn', 'destroy'],
  comfort: ['fear', 'afraid', 'refuge', 'comfort', 'rest', 'heal', 'weary', 'anxious', 'peace', 'shepherd', 'strength', 'trouble', 'broken', 'dark', 'presence', 'care', 'burden'],
  praise: ['praise', 'rejoice', 'joy', 'worship', 'delight', 'thank', 'sing', 'bless the lord', 'hallelujah', 'magnif'],
  promise: ['plans', 'will give', 'will be', 'promise', 'hope', 'redeem', 'new ', 'inherit', 'reward', 'never leave', 'eternal'],
  story: ['narrator', 'creation', 'in the beginning', 'birth', 'call of', 'and it came'],
  wisdom: [],
}
const ORDER: Array<Exclude<Mood, 'words-of-god'>> = ['warning', 'comfort', 'praise', 'promise', 'story']

export function moodFor(seed: VoiceSeed): Mood {
  const speaker = seed.speaker.toLowerCase()
  if (speaker.startsWith('jesus') || speaker.startsWith('god')) return 'words-of-god'
  const s = `${seed.speaker} ${seed.theme} ${seed.text}`.toLowerCase()
  let best: Mood = 'wisdom', bestScore = 0
  for (const m of ORDER) {
    const score = CUES[m].reduce((n, w) => n + (s.includes(w) ? 1 : 0), 0)
    if (score > bestScore) { best = m; bestScore = score }
  }
  return best
}

export function pickVoice(seed: VoiceSeed, reader: string): VoicePick {
  const pal = PALETTE[reader] ?? FALLBACK
  const mood = moodFor(seed)
  const voice = mood === 'words-of-god' ? pal.weighty : mood === 'comfort' || mood === 'praise' ? pal.soft : pal.steady
  const whose = mood === 'words-of-god'
    ? `the words of ${seed.speaker.replace(/\s*\(.*\)$/, '')}`
    : /psalm/i.test(seed.book) ? 'a psalm' : `${seed.speaker.replace(/^The /, 'the ')}, ${seed.testament === 'OT' ? 'Old Testament' : 'New Testament'}`
  const style = `Read this as ${pal.person}. Slowly and warmly, at a natural pace. ${MOOD_NOTE[mood]} Pause at the punctuation. Say the reference at the end gently, as an afterthought.`
  const why = `${voice} · ${mood.replaceAll('-', ' ')} — ${whose}`
  return { voice, style, why, mood }
}

/** Every voice the picker can return — kept in step with the function's allowlist. */
export const PICKER_VOICES = Array.from(new Set(Object.values(PALETTE).flatMap((p) => [p.steady, p.weighty, p.soft])))
