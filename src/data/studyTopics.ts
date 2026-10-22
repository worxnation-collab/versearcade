// What a congregation might be studying this week — the autocomplete under
// "What is your congregation studying this week?" in the leadership planner
// (`StudyTopicWeek`, Content Generation only).
//
// Three sources, ranked together by `suggestTopics`:
//   * CURATED topics below: a series, a season or a theme, each carrying the
//     passages it is ANCHORED to. Picking one drafts a week straight from those
//     passages — no model is asked which scripture a topic means, and the words
//     on every day are fetched from the BSB, never written by the model.
//   * The 66 BOOKS. A book has no fixed passages (a week can't cover Romans),
//     so `church-draft`'s `topic` mode chooses up to three short passages
//     INSIDE that book, and the function refuses any it returns from elsewhere.
//   * The church's own PAST series, read from its schedule. Those, and anything
//     typed that matches nothing, go through the same `topic` mode.
//
// Every curated passage sits inside one chapter (the week mode's rule) and a
// topic's passages stay under `TOPIC_VERSES_MAX` in all, so the scripture fits
// the function's 6,000-character budget. `checkStudyTopics()` asserts both
// against the real verse counts at import in dev, and
// `scripts/check-study-topics.mjs` (in `npm run build`) re-derives them, since a
// passage that runs off the end of a chapter still renders — it just drafts a
// week from fewer verses than the leader was told.
//
// Content rule, the trivia one: nothing a Catholic and a Baptist would study
// differently. No baptism, communion, Sabbath or end-times schemes as topics.

import { BIBLE_BOOKS } from './bible/pool'
import { verseCount, canonBook } from './bible/structure'

export type TopicKind = 'series' | 'season' | 'theme' | 'book' | 'previous'

export interface StudyTopic {
  id: string
  /** What the leader sees and what the series is called unless `series` says otherwise. */
  label: string
  kind: TopicKind
  /** The series name the week is filed under (≤ 60, the column's cap). */
  series?: string
  /** Other words a leader might type for it. */
  aliases?: string[]
  /** The passages it is anchored to; empty ⇒ `topic` mode picks them. */
  passages: string[]
  /** For a book topic: the passages must come from this book. */
  book?: string
}

/** Each passage ≤ 40 verses (the function's cap); a topic ≤ this many in all. */
export const TOPIC_VERSES_MAX = 40
export const TOPIC_PASSAGES_MAX = 3

const CURATED: StudyTopic[] = [
  { id: 'fruit-of-the-spirit', label: 'The Fruit of the Spirit', kind: 'series', aliases: ['love joy peace', 'galatians 5', 'spirit'], passages: ['Galatians 5:16-26'] },
  { id: 'beatitudes', label: 'The Beatitudes', kind: 'series', aliases: ['blessed', 'matthew 5', 'salt and light'], passages: ['Matthew 5:1-16'] },
  { id: 'sermon-on-the-mount', label: 'The Sermon on the Mount', kind: 'series', aliases: ['matthew 5-7'], passages: ['Matthew 5:1-16', 'Matthew 6:25-34', 'Matthew 7:24-29'] },
  { id: 'lords-prayer', label: 'The Lord’s Prayer', kind: 'series', aliases: ['our father', 'lords prayer', 'teach us to pray'], passages: ['Matthew 6:5-15', 'Luke 11:1-13'] },
  { id: 'armor-of-god', label: 'The Armor of God', kind: 'series', aliases: ['armour of god', 'ephesians 6', 'spiritual warfare'], passages: ['Ephesians 6:10-20'] },
  { id: 'love-chapter', label: 'Love', kind: 'theme', series: 'Love (1 Corinthians 13)', aliases: ['1 corinthians 13', 'love chapter', 'love one another'], passages: ['1 Corinthians 13:1-13', '1 John 4:7-21'] },
  { id: 'good-shepherd', label: 'The Good Shepherd', kind: 'series', aliases: ['psalm 23', 'shepherd', 'john 10'], passages: ['Psalm 23:1-6', 'John 10:1-18'] },
  { id: 'lost-and-found', label: 'Lost and Found', kind: 'series', series: 'Lost and Found (Luke 15)', aliases: ['luke 15', 'lost sheep', 'lost coin', 'prodigal son'], passages: ['Luke 15:1-10', 'Luke 15:11-32'] },
  { id: 'parables', label: 'The Parables of Jesus', kind: 'series', aliases: ['parables', 'sower', 'good samaritan'], passages: ['Matthew 13:1-9', 'Matthew 13:18-23', 'Luke 10:25-37'] },
  { id: 'i-am', label: 'The “I Am” Sayings', kind: 'series', series: 'The I Am Sayings of Jesus', aliases: ['i am sayings', 'bread of life', 'resurrection and the life'], passages: ['John 6:35-40', 'John 10:7-15', 'John 11:20-27'] },
  { id: 'abiding', label: 'Abiding in the Vine', kind: 'series', series: 'Abiding (John 15)', aliases: ['john 15', 'vine and branches', 'abide'], passages: ['John 15:1-17'] },
  { id: 'ten-commandments', label: 'The Ten Commandments', kind: 'series', aliases: ['commandments', 'exodus 20', 'greatest commandment'], passages: ['Exodus 20:1-17', 'Matthew 22:34-40'] },
  { id: 'psalms-of-trust', label: 'Psalms of Trust', kind: 'series', aliases: ['psalms', 'refuge', 'psalm 46', 'psalm 121'], passages: ['Psalm 23:1-6', 'Psalm 46:1-11', 'Psalm 121:1-8'] },
  { id: 'creation', label: 'Creation', kind: 'theme', aliases: ['genesis 1', 'in the beginning', 'image of god'], passages: ['Genesis 1:1-5', 'Genesis 1:26-31', 'Psalm 8:1-9'] },

  { id: 'advent', label: 'Advent', kind: 'season', aliases: ['waiting', 'coming', 'christmas'], passages: ['Isaiah 9:2-7', 'Luke 1:26-38', 'Luke 2:8-20'] },
  { id: 'christmas', label: 'Christmas', kind: 'season', aliases: ['nativity', 'birth of jesus', 'magi'], passages: ['Luke 2:1-20', 'Matthew 2:1-12'] },
  { id: 'lent', label: 'Lent', kind: 'season', series: 'Lent: Return to Me', aliases: ['repentance', 'wilderness', 'return to me'], passages: ['Joel 2:12-17', 'Matthew 4:1-11', 'Psalm 51:1-12'] },
  { id: 'holy-week', label: 'Holy Week', kind: 'season', aliases: ['palm sunday', 'passion', 'last supper', 'good friday'], passages: ['Mark 11:1-11', 'Mark 14:12-26', 'Mark 15:33-39'] },
  { id: 'easter', label: 'Easter', kind: 'season', series: 'Easter: He Is Risen', aliases: ['resurrection', 'he is risen', 'empty tomb'], passages: ['John 20:1-18', '1 Corinthians 15:1-11'] },
  { id: 'pentecost', label: 'Pentecost', kind: 'season', aliases: ['holy spirit', 'acts 2', 'the helper'], passages: ['Acts 2:1-21', 'John 14:15-27'] },
  { id: 'thanksgiving', label: 'Thanksgiving', kind: 'season', aliases: ['gratitude', 'give thanks', 'thankful'], passages: ['Psalm 100:1-5', 'Luke 17:11-19', '1 Thessalonians 5:12-24'] },

  { id: 'prayer', label: 'Prayer', kind: 'theme', aliases: ['praying', 'how to pray'], passages: ['Matthew 6:5-15', 'Philippians 4:4-9', 'James 5:13-18'] },
  { id: 'faith', label: 'Faith', kind: 'theme', series: 'By Faith (Hebrews 11)', aliases: ['hebrews 11', 'hall of faith', 'believing'], passages: ['Hebrews 11:1-16', 'Hebrews 12:1-3'] },
  { id: 'grace', label: 'Grace', kind: 'theme', aliases: ['saved by grace', 'ephesians 2', 'peace with god'], passages: ['Ephesians 2:1-10', 'Romans 5:1-11'] },
  { id: 'forgiveness', label: 'Forgiveness', kind: 'theme', aliases: ['forgive', 'seventy times seven', 'mercy'], passages: ['Matthew 18:21-35', 'Colossians 3:12-17'] },
  { id: 'anxiety', label: 'Anxiety and Peace', kind: 'theme', series: 'Do Not Worry', aliases: ['worry', 'fear', 'peace', 'stress'], passages: ['Matthew 6:25-34', 'Philippians 4:4-9', '1 Peter 5:6-11'] },
  { id: 'hope', label: 'Hope', kind: 'theme', aliases: ['suffering', 'living hope', 'grief'], passages: ['Romans 8:18-28', 'Lamentations 3:19-26', '1 Peter 1:3-9'] },
  { id: 'new-life', label: 'New Life in Christ', kind: 'theme', aliases: ['new creation', 'born again', 'romans 8'], passages: ['2 Corinthians 5:14-21', 'Romans 6:1-11', 'Romans 8:1-11'] },
  { id: 'identity', label: 'Identity in Christ', kind: 'theme', aliases: ['who i am', 'chosen', 'adopted'], passages: ['Ephesians 1:3-14', '1 Peter 2:9-10', 'Galatians 3:26-29'] },
  { id: 'serving', label: 'Serving Others', kind: 'theme', aliases: ['servant', 'humility', 'washing feet'], passages: ['John 13:1-17', 'Philippians 2:1-11'] },
  { id: 'generosity', label: 'Generosity', kind: 'theme', aliases: ['giving', 'stewardship', 'cheerful giver'], passages: ['2 Corinthians 9:6-15', 'Acts 4:32-37', 'Luke 21:1-4'] },
  { id: 'mission', label: 'The Great Commission', kind: 'theme', aliases: ['mission', 'evangelism', 'go and make disciples', 'witness'], passages: ['Matthew 28:16-20', 'Acts 1:6-11', 'Romans 10:9-17'] },
  { id: 'kingdom', label: 'The Kingdom of God', kind: 'theme', aliases: ['kingdom', 'mustard seed', 'hidden treasure'], passages: ['Mark 4:26-34', 'Matthew 13:44-46', 'Luke 17:20-21'] },
  { id: 'wisdom', label: 'Wisdom', kind: 'theme', aliases: ['proverbs', 'trust in the lord', 'decisions'], passages: ['Proverbs 2:1-11', 'Proverbs 3:1-12', 'James 1:2-8'] },

  { id: 'joseph', label: 'The Life of Joseph', kind: 'series', aliases: ['joseph', 'genesis 37'], passages: ['Genesis 37:3-11', 'Genesis 45:1-8', 'Genesis 50:15-21'] },
  { id: 'moses', label: 'Moses and the Exodus', kind: 'series', aliases: ['moses', 'burning bush', 'red sea'], passages: ['Exodus 3:1-15', 'Exodus 14:13-22'] },
  { id: 'david', label: 'The Life of David', kind: 'series', aliases: ['david', 'goliath', 'psalm 51'], passages: ['1 Samuel 17:32-50', 'Psalm 51:1-12'] },
  { id: 'ruth-story', label: 'The Story of Ruth', kind: 'series', aliases: ['ruth', 'naomi', 'boaz', 'loyalty'], passages: ['Ruth 1:6-18', 'Ruth 2:1-12', 'Ruth 4:13-17'] },
  { id: 'esther-story', label: 'The Story of Esther', kind: 'series', aliases: ['esther', 'for such a time as this', 'courage'], passages: ['Esther 4:1-17', 'Esther 7:1-10'] },
  { id: 'jonah-story', label: 'The Story of Jonah', kind: 'series', aliases: ['jonah', 'nineveh', 'second chances'], passages: ['Jonah 1:1-17', 'Jonah 3:1-10', 'Jonah 4:1-11'] },
  { id: 'peter', label: 'The Life of Peter', kind: 'series', aliases: ['peter', 'walking on water', 'do you love me'], passages: ['Matthew 14:22-33', 'Luke 22:54-62', 'John 21:15-19'] },
]

const BOOKS: StudyTopic[] = BIBLE_BOOKS.map((b) => ({ id: `book:${b}`, label: b, kind: 'book' as const, passages: [], book: b }))

export const STUDY_TOPICS: StudyTopic[] = [...CURATED, ...BOOKS]

/** A typed or past topic that names no catalog entry — `topic` mode picks its passages. */
export function freeTopic(label: string, kind: 'previous' | 'theme' = 'theme'): StudyTopic {
  return { id: `${kind}:${label.toLowerCase()}`, label, kind, passages: [] }
}

const norm = (s: string) =>
  s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * Up to `limit` suggestions for what has been typed. Past series come first
 * when they match at all — a church's own words beat ours — then the catalog by
 * how well it matches: label prefix, then any word of the label or an alias
 * starting with the query, then a plain substring. An empty query offers the
 * past series and the seasons and series a church is likeliest to be in.
 */
export function suggestTopics(query: string, previous: string[] = [], limit = 8): StudyTopic[] {
  const q = norm(query)
  const prev = dedupe(previous).map((p) => {
    const hit = STUDY_TOPICS.find((t) => norm(t.series ?? t.label) === norm(p) || norm(t.label) === norm(p))
    return hit ? { ...hit, kind: 'previous' as const, label: p, series: p } : freeTopic(p, 'previous')
  })
  if (!q) {
    const picks = ['advent', 'easter', 'fruit-of-the-spirit', 'beatitudes', 'lords-prayer', 'prayer', 'grace', 'anxiety']
    return [...prev.slice(0, 3), ...picks.map((id) => CURATED.find((t) => t.id === id)!)].slice(0, limit)
  }
  const scored: { t: StudyTopic; s: number }[] = []
  for (const t of [...prev, ...STUDY_TOPICS]) {
    const s = score(q, t)
    if (s > 0) scored.push({ t, s: s + (t.kind === 'previous' ? 0.5 : 0) })
  }
  scored.sort((a, b) => b.s - a.s)
  const seen = new Set<string>()
  const out: StudyTopic[] = []
  for (const { t } of scored) {
    const k = norm(t.series ?? t.label)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
    if (out.length === limit) break
  }
  return out
}

function score(q: string, t: StudyTopic): number {
  const label = norm(t.label)
  if (label === q) return 5
  if (label.startsWith(q)) return 4
  const words = [label, norm(t.series ?? ''), ...(t.aliases ?? []).map(norm)].filter(Boolean)
  if (words.some((w) => w === q)) return 3.5
  if (words.some((w) => w.split(' ').some((x) => x.startsWith(q)) || w.startsWith(q))) return 3
  if (words.some((w) => w.includes(q))) return 1.5
  // Every typed word somewhere in the label or an alias ("prodigal son").
  const qs = q.split(' ')
  if (qs.length > 1 && words.some((w) => qs.every((x) => w.includes(x)))) return 1
  return 0
}

function dedupe(xs: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const x of xs) {
    const k = norm(x)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(x.trim())
  }
  return out
}

/** The catalog entry a typed line names exactly, if any — so typing "Advent" and pressing Enter is the same as picking it. */
export function topicByLabel(label: string): StudyTopic | null {
  const q = norm(label)
  if (!q) return null
  return STUDY_TOPICS.find((t) => norm(t.label) === q || norm(t.series ?? '') === q || (t.aliases ?? []).some((a) => norm(a) === q && t.kind !== 'book')) ?? null
}

const REF = /^(.+?)\s+(\d+):(\d+)(?:[-–](\d+))?$/

/** How many verses a citation covers, or null if it isn't a real, single-chapter one. */
export function passageVerses(ref: string): number | null {
  const m = REF.exec(ref.trim())
  if (!m) return null
  const book = canonBook(m[1])
  const chapter = Number(m[2]), start = Number(m[3]), end = m[4] ? Number(m[4]) : start
  const count = verseCount(book, chapter)
  if (!count || start < 1 || end < start || end > count) return null
  return end - start + 1
}

/** Dev-time: every curated passage is real, one chapter, and the topic fits the budget. */
export function checkStudyTopics(): string[] {
  const errors: string[] = []
  const ids = new Set<string>()
  for (const t of STUDY_TOPICS) {
    if (ids.has(t.id)) errors.push(`${t.id}: duplicate id`)
    ids.add(t.id)
    if ((t.series ?? t.label).length > 60) errors.push(`${t.id}: series name over 60`)
    if (t.passages.length > TOPIC_PASSAGES_MAX) errors.push(`${t.id}: more than ${TOPIC_PASSAGES_MAX} passages`)
    let total = 0
    for (const p of t.passages) {
      const n = passageVerses(p)
      if (n === null) errors.push(`${t.id}: "${p}" is not a real single-chapter passage`)
      else total += n
    }
    if (total > TOPIC_VERSES_MAX) errors.push(`${t.id}: ${total} verses, over ${TOPIC_VERSES_MAX}`)
    if (t.kind !== 'book' && !t.passages.length) errors.push(`${t.id}: a curated topic needs passages`)
  }
  return errors
}

if (import.meta.env.DEV) {
  const errors = checkStudyTopics()
  if (errors.length) console.error('[studyTopics]', errors)
}
