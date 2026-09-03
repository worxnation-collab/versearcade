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
  chapter?: number
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
  // Gacrux is Google's "mature" voice; Vindemiatrix its "gentle" one. An older
  // woman, soothing and slow — the ask was explicitly not a young narrator.
  tabitha: { steady: 'Gacrux', weighty: 'Gacrux', soft: 'Vindemiatrix', person: 'Tabitha — an older librarian with a soothing, unhurried voice, telling a story to a few people at her desk' },
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

// ---- who reads it, and where -------------------------------------------------
//
// The cast is chosen from the verse's own book and speaker, so a Psalm is read
// by David and Exodus by Moses, and the scene from the calendar and the mood.
// Deterministic like the voice: the same day gets the same cast everywhere,
// and the operator can override both in the panel.

export interface CastPick {
  reader: string
  scene: string
  why: string
}

const TORAH = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy']
const HISTORY = ['Joshua', 'Judges', '1 Samuel', '2 Samuel', '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Job']
const SONGS = ['Psalms', 'Psalm', 'Proverbs', 'Ecclesiastes', 'Song of Solomon', 'Song of Songs']
const PROPHETS = ['1 Kings', '2 Kings', 'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi']
const WOMEN = ['Esther', 'Ruth']

export function readerFor(seed: VoiceSeed): string {
  const sp = seed.speaker.toLowerCase()
  if (sp.startsWith('mary')) return 'mary'
  if (sp.startsWith('moses')) return 'moses'
  if (sp.startsWith('david')) return 'david'
  if (sp.startsWith('esther') || sp.startsWith('ruth')) return 'esther'
  if (sp.startsWith('elijah') || sp.startsWith('elisha')) return 'elijah'
  if (seed.book === 'Luke' && (seed.chapter ?? 99) <= 2) return 'mary'
  if (TORAH.includes(seed.book) || HISTORY.includes(seed.book)) return 'moses'
  if (SONGS.includes(seed.book)) return 'david'
  if (WOMEN.includes(seed.book)) return 'esther'
  if (PROPHETS.includes(seed.book)) return 'elijah'
  return 'cephas'
}

export function sceneFor(seed: VoiceSeed, date: string): string {
  const [, m, d] = date.split('-').map(Number)
  if (m === 12 && d <= 25) return 'advent'
  if (m === 11 && d >= 30) return 'advent'
  // The mood used to switch the painting (Lamplight for comfort and warning);
  // now it GRADES the daytime road instead (gradeFor), because the host's
  // Veo loop exists for the road and a moving host is worth more than a
  // different still.
  return 'harvest'
}

/** The time-of-day grade the verse post wears: dusk for comfort, night for warning. */
export function gradeFor(seed: VoiceSeed): 'dusk' | 'night' | undefined {
  const mood = moodFor(seed)
  return mood === 'comfort' ? 'dusk' : mood === 'warning' ? 'night' : undefined
}

/** The reaction beat each story paragraph gets: talk, listen, a laugh for the bright moods, and the lean-in for the verse. */
export function storyBeats(seed: VoiceSeed, paragraphs: number): Array<'talk' | 'listen' | 'laugh' | 'leanin'> {
  const mood = moodFor(seed)
  const bright = mood === 'praise' || mood === 'promise' || mood === 'story'
  return Array.from({ length: paragraphs }, (_, i) => {
    if (i === paragraphs - 1) return 'leanin'
    if (i === 1) return 'listen'
    if (i === 2) return bright ? 'laugh' : 'talk'
    return 'talk'
  })
}

/** The second voice for the words of God or Jesus, or null when the verse is anyone else's. */
export function secondVoiceFor(seed: VoiceSeed): { name: string; voice: string } | null {
  return moodFor(seed) === 'words-of-god' ? { name: 'Voice', voice: 'Orus' } : null
}

const READER_NAMES: Record<string, string> = { cephas: 'Peter', moses: 'Moses', elijah: 'Elijah', david: 'David', esther: 'Esther', mary: 'Mary' }
const SCENE_NAMES: Record<string, string> = { harvest: 'Harvest Road', lamplight: 'Lamplight', advent: 'Advent' }

export function pickCast(seed: VoiceSeed, date: string): CastPick {
  const reader = readerFor(seed)
  const scene = sceneFor(seed, date)
  const why = `${READER_NAMES[reader] ?? reader} · ${SCENE_NAMES[scene] ?? scene} — ${seed.book}${scene === 'advent' ? ', Advent' : ''}`
  return { reader, scene, why }
}

// ---- story time: the picture book ---------------------------------------------
//
// The evening post is Tabitha telling the story behind the verse, with a
// picture card for each paragraph. Every picture is art the app already ships:
// the collectible-card illustrations (public/cards), the reader figures, the
// road scenes and the rooms. Chosen by keyword from the verse's own narrative
// fields, so nothing is generated and the same story gets the same pictures.

export interface StoryCardPick {
  /** Public path of the picture, or undefined for the verse card. */
  image?: string
  /** Optional figure to stand in the corner of the card. */
  figure?: string
  label: string
}

// Collectible cards that depict something from the Bible (achievement cards
// like "week warrior" are deliberately not here), each with the words that
// call for it. Order matters: earlier rows win a tie.
const CARD_CUES: Array<[string, string[]]> = [
  ['tablets_law', ['commandment', 'law', 'sinai', 'covenant', 'statute', 'decree']],
  ['covenant_rainbow', ['rainbow', 'flood', 'noah', 'ark', 'promise']],
  ['manna', ['manna', 'wilderness', 'desert', 'bread from heaven', 'daily bread', 'provision', 'provide']],
  ['jordan_water', ['jordan', 'river', 'baptis', 'cross over', 'red sea', 'sea', 'waters']],
  ['shepherds_crook', ['shepherd', 'sheep', 'flock', 'lamb', 'pasture']],
  ['davids_harp', ['harp', 'sing', 'song', 'psalm', 'praise', 'music', 'instrument']],
  ['star_of_bethlehem', ['bethlehem', 'star', 'born', 'birth', 'manger', 'nativity', 'wise men']],
  ['descending_dove', ['dove', 'spirit', 'holy spirit', 'baptized', 'peace']],
  ['loaves_fish', ['loaves', 'fish', 'five thousand', 'fed', 'hungry', 'feast']],
  ['mustard_seed', ['mustard', 'seed', 'sow', 'faith as small', 'grow', 'plant']],
  ['pearl_price', ['pearl', 'treasure', 'merchant', 'kingdom of heaven is like', 'worth']],
  ['kingdom_keys', ['keys', 'peter', 'rock', 'church', 'bind', 'loose']],
  ['widows_mite', ['widow', 'coins', 'offering', 'gave all', 'poor', 'give']],
  ['alabaster_jar', ['alabaster', 'perfume', 'anoint', 'ointment', 'feet']],
  ['anointing_oil', ['anoint', 'oil', 'samuel', 'chosen king', 'horn']],
  ['golden_chalice', ['cup', 'wine', 'supper', 'covenant in my blood', 'chalice', 'drink']],
  ['clay_lamp', ['lamp', 'light', 'darkness', 'shine', 'lampstand', 'night']],
  ['ancient_menorah', ['temple', 'menorah', 'priest', 'holy place', 'tabernacle']],
  ['jubilee_trumpet', ['trumpet', 'jubilee', 'jericho', 'walls', 'shout', 'victory']],
  ['palm_frond', ['palm', 'hosanna', 'jerusalem', 'triumph', 'branches']],
  ['olive_branch', ['olive', 'gethsemane', 'garden', 'mount of olives', 'peace be']],
  ['angels_host', ['angel', 'host', 'heavenly', 'glory to god', 'shepherds in the field']],
  ['angels_ladder', ['ladder', 'jacob', 'dream', 'bethel', 'vision']],
  ['centurion', ['centurion', 'soldier', 'roman', 'servant', 'authority', 'army', 'pharaoh']],
  ['leper_king', ['leper', 'leprosy', 'heal', 'healed', 'naaman', 'clean']],
  ['apostles_letter', ['letter', 'wrote', 'writes', 'paul', 'epistle', 'church in', 'brothers and sisters']],
  ['scroll_fragment', ['scroll', 'scripture', 'word', 'read', 'prophet', 'written']],
  ['water_jar', ['water', 'well', 'jar', 'thirst', 'cana', 'wedding', 'living water']],
  ['saved_by_grace', ['grace', 'saved', 'gift', 'faith', 'mercy', 'forgive']],
]

const CARD_LABELS: Record<string, string> = {
  tablets_law: 'The tablets of the law', covenant_rainbow: 'The covenant rainbow', manna: 'Manna in the wilderness', jordan_water: 'The waters', shepherds_crook: 'A shepherd\u2019s crook', davids_harp: 'David\u2019s harp', star_of_bethlehem: 'The star', descending_dove: 'The dove', loaves_fish: 'Loaves and fish', mustard_seed: 'A mustard seed', pearl_price: 'The pearl of great price', kingdom_keys: 'The keys of the kingdom', widows_mite: 'The widow\u2019s mite', alabaster_jar: 'The alabaster jar', anointing_oil: 'Anointing oil', golden_chalice: 'The cup', clay_lamp: 'A clay lamp', ancient_menorah: 'The menorah', jubilee_trumpet: 'The trumpet', palm_frond: 'Palm branches', olive_branch: 'An olive branch', angels_host: 'The heavenly host', angels_ladder: 'Jacob\u2019s ladder', centurion: 'A centurion', leper_king: 'The healing', apostles_letter: 'A letter', scroll_fragment: 'The scroll', water_jar: 'A water jar', saved_by_grace: 'Saved by grace',
}

function bestCard(text: string, exclude: Set<string>): string | null {
  const s = text.toLowerCase()
  let best: string | null = null, bestScore = 0
  for (const [id, cues] of CARD_CUES) {
    if (exclude.has(id)) continue
    const score = cues.reduce((n, w) => n + (s.includes(w) ? 1 : 0), 0)
    if (score > bestScore) { best = id; bestScore = score }
  }
  return best
}

// The generated scene deck (public/tiktok/scenes): twelve PLACES most Bible
// stories happen in, painted once in the house style and keyword-matched to
// the story's own narrative. A reader figure stands in whichever one wins.
export const SCENE_DECK: Array<[string, string, string[]]> = [
  ['shore', 'The shore', ['shore', 'sea', 'red sea', 'beach', 'sand', 'coast', 'waves', 'across the water']],
  ['fishing_boat', 'On the water', ['boat', 'fish', 'net', 'lake', 'galilee', 'storm', 'waves', 'sail']],
  ['desert_road', 'The road', ['road', 'journey', 'travel', 'walk', 'damascus', 'emmaus', 'on the way', 'path']],
  ['wilderness_camp', 'The wilderness', ['wilderness', 'desert', 'camp', 'tent', 'wander', 'forty', 'manna', 'tabernacle']],
  ['mountain', 'The mountain', ['mountain', 'sinai', 'mount', 'hill', 'summit', 'carmel', 'horeb', 'transfigur']],
  ['city_gate', 'The city', ['city', 'gate', 'jerusalem', 'jericho', 'walls', 'street', 'market', 'crowd', 'nineveh', 'babylon']],
  ['throne_room', 'The palace', ['king', 'queen', 'throne', 'palace', 'pharaoh', 'royal', 'court', 'esther', 'solomon', 'herod', 'pilate']],
  ['temple_court', 'The temple', ['temple', 'priest', 'altar', 'sacrifice', 'offering', 'worship', 'synagogue', 'holy place']],
  ['garden_night', 'The garden', ['garden', 'gethsemane', 'olive', 'night', 'pray', 'prayed', 'eden']],
  ['lamp_house', 'At home', ['house', 'home', 'table', 'supper', 'meal', 'family', 'mother', 'father', 'room', 'bethany', 'lamp']],
  ['prison', 'The prison', ['prison', 'jail', 'chains', 'cell', 'arrest', 'guard', 'dungeon', 'captiv', 'exile']],
  ['harvest_field', 'The field', ['field', 'harvest', 'sow', 'seed', 'vineyard', 'wheat', 'grain', 'reap', 'ruth', 'gleaning', 'shepherd']],
]

function deckScene(text: string): { image: string; label: string } | null {
  const s = text.toLowerCase()
  let best: [string, string] | null = null, bestScore = 0
  for (const [id, label, cues] of SCENE_DECK) {
    const score = cues.reduce((n, w) => n + (s.includes(w) ? 1 : 0), 0)
    if (score > bestScore) { best = [id, label]; bestScore = score }
  }
  return best ? { image: `/tiktok/scenes/${best[0]}.jpg`, label: best[1] } : null
}

const SCENE_BY_GROUP = (book: string, testament: 'OT' | 'NT'): string => {
  if (TORAH.includes(book) || HISTORY.includes(book)) return '/road/harvest.jpg'
  if (PROPHETS.includes(book)) return '/road/lamplight.jpg'
  if (SONGS.includes(book)) return '/room/room-2.jpg'
  if (['Matthew', 'Mark', 'Luke', 'John', 'Acts'].includes(book)) return '/road/harvest.jpg'
  if (book === 'Revelation') return '/road/advent.jpg'
  return testament === 'NT' ? '/room/room-3.jpg' : '/road/harvest.jpg'
}

/**
 * One picture per paragraph: the place and the person for the opening, a
 * collectible-card illustration matched to the middle, another for the
 * aftermath (or the place again), and the verse itself for the close.
 */
export function storyCards(seed: VoiceSeed & { before?: string; after?: string }, paragraphs: number): StoryCardPick[] {
  const reader = readerFor(seed)
  const fallback = SCENE_BY_GROUP(seed.book, seed.testament)
  // The deck wins when the story names a place it has; the road or room
  // scenes stay as the fallback so a verse about nothing in particular still
  // opens somewhere.
  const deck = deckScene(`${seed.before ?? ''} ${seed.text} ${seed.theme} ${seed.book}`)
  const scene = deck?.image ?? fallback
  const used = new Set<string>()
  const opening: StoryCardPick = { image: scene, figure: `/skins/${reader}.png`, label: deck?.label ?? seed.book }
  const middleId = bestCard(`${seed.theme} ${seed.text} ${seed.before ?? ''}`, used)
  if (middleId) used.add(middleId)
  const middle: StoryCardPick = middleId ? { image: `/cards/${middleId}.webp`, label: CARD_LABELS[middleId] } : { image: '/keep/room_open_scroll.png', label: 'The scroll' }
  const afterId = bestCard(`${seed.after ?? ''} ${seed.theme}`, used)
  const afterDeck = deckScene(`${seed.after ?? ''}`)
  const aftermath: StoryCardPick = afterId
    ? { image: `/cards/${afterId}.webp`, label: CARD_LABELS[afterId] }
    : afterDeck && afterDeck.image !== scene ? afterDeck : { image: scene, label: deck?.label ?? seed.book }
  const cards = [opening, middle, aftermath].slice(0, Math.max(1, paragraphs - 1))
  while (cards.length < paragraphs - 1) cards.push({ image: scene, label: seed.book })
  cards.push({ label: seed.book }) // the verse card, drawn as text
  return cards
}

export function pickStoryVoice(seed: VoiceSeed, teller: string): VoicePick {
  const pal = PALETTE[teller] ?? PALETTE.tabitha
  const mood = moodFor(seed)
  const voice = mood === 'comfort' ? pal.soft : pal.steady
  const style = `Read this as ${pal.person}. An older woman's voice: calm, low, soothing, a little slower than conversation, with a smile in it. A story told aloud to a few people who are listening closely. Let the sentences breathe; pause at full stops. ${MOOD_NOTE[mood === 'words-of-god' ? 'story' : mood]} When you reach the verse at the end, slow down a little more and read it plainly, then say the reference gently.`
  return { voice, style, why: `${voice} · story — ${seed.book}`, mood }
}
