// The scripted week: the two formats that replaced the verse hook and the
// evening story on 2026-11-02, written ahead and recorded by the operator.
//
//   MORNING · "Can you answer this?"   (kind `challenge`)
//     He asks the question in his own voice, the four options are on screen,
//     the clock runs, and he gives the answer and its teach line at the
//     reveal. Questions come from the app's own trivia data
//     (src/data/bible/trivia.ts), so the post teaches exactly what the game
//     teaches.
//
//   EVENING · "Most people get this wrong"   (kind `moment`)
//     A common belief, what the text actually says, and a question back to
//     the viewer — his voice over one held painting. Narrative facts only,
//     the trivia rule: nothing one tradition answers differently.
//
// Why these two. 94 posts (Oct 11–31) drew ZERO real comments and about five
// shares: the only comment under each was our own link. Both formats END ON A
// QUESTION THE VIEWER CAN ANSWER IN ONE WORD, and the caption asks it — that
// is the whole point of them. See docs/scripts/week-2026-11-02.md for what he
// reads.
//
// Keyed by the date the post GOES OUT. A date with no entry here is the
// engine exactly as it was (verse + story), so a week nobody scripted falls
// back rather than going dark.
//
// Pure data, no imports: the morning runner reads it in Node to decide the
// day's kinds, and the comment replier reads `scriptedQuiz` to know the
// answer it is replying about.

export interface ScriptedQuiz {
  /** On-screen opening line, max ~8 words. */
  hook: string
  prompt: string
  /** Four options, answer already shuffled into place. */
  options: [string, string, string, string]
  answerIndex: number
  /** Shown at the reveal under the answer. */
  teach: string
  /** Where it is in the text — the end card names it. */
  reference: string
  /** The question the caption and the first comment ask. */
  ask: string
  /** YouTube title (search intent, under 70 chars). */
  title: string
  /** Caption body, before the ask. Plain, no links, no emoji. */
  caption: string
  tags: string[]
}

export interface ScriptedMyth {
  hook: string
  /** The end card's title. */
  title: string
  reference: string
  /** A root-relative painting held for the whole post. */
  art: string
  ask: string
  title_yt: string
  caption: string
  tags: string[]
}

export const SCRIPTED_QUIZ: Record<string, ScriptedQuiz> = {
  '2026-11-02': {
    hook: 'Almost nobody knows how Jonah ends.',
    prompt: 'How does the book of Jonah end?',
    options: ['With Jonah preaching again', 'With the city destroyed', 'With a question from God that is never answered', 'With Jonah returning home'],
    answerIndex: 2,
    teach: '"Should I not have compassion on that great city?" The book stops there.',
    reference: 'Jonah 4:11',
    ask: 'Did you know how it ends?',
    title: 'How does the book of Jonah end? Most people don’t know',
    caption: 'Everybody remembers the fish. Almost nobody remembers the last line.',
    tags: ['jonah', 'biblequiz', 'bibletrivia', 'bible', 'shorts'],
  },
  '2026-11-03': {
    hook: 'God made Gideon’s army smaller on purpose.',
    prompt: 'With how many men did Gideon defeat the Midianites?',
    options: ['Ten thousand', 'Three hundred', 'Thirty', 'Seven hundred'],
    answerIndex: 1,
    teach: 'He started with 32,000. They won with torches, jars and trumpets.',
    reference: 'Judges 7:7',
    ask: 'What did you guess?',
    title: 'How many men did Gideon fight with? Bible quiz',
    caption: 'God kept cutting the army down until nobody could say they saved themselves.',
    tags: ['gideon', 'biblequiz', 'bibletrivia', 'judges', 'shorts'],
  },
  '2026-11-04': {
    hook: 'Jacob married the wrong sister.',
    prompt: 'Jacob worked seven years for Rachel. Who was he given instead?',
    options: ['Dinah', 'Rebekah', 'Bilhah', 'Leah'],
    answerIndex: 3,
    teach: 'Laban swapped them on the wedding night. Jacob worked seven more years for Rachel.',
    reference: 'Genesis 29:25',
    ask: 'Did you get it?',
    title: 'Who did Jacob marry by mistake? Bible quiz',
    caption: 'Seven years of work, and he woke up married to her sister.',
    tags: ['jacob', 'biblequiz', 'genesis', 'bibletrivia', 'shorts'],
  },
  '2026-11-05': {
    hook: 'A foreign widow became a king’s great-grandmother.',
    prompt: 'Ruth’s great-grandson became one of the most famous people in the Bible. Who?',
    options: ['King David', 'King Saul', 'Solomon', 'Samuel'],
    answerIndex: 0,
    teach: 'Ruth → Obed → Jesse → David.',
    reference: 'Ruth 4:17',
    ask: 'Did you know that one?',
    title: 'Who was Ruth’s great-grandson? Bible quiz',
    caption: 'A widow from Moab, picking up what the harvesters left behind.',
    tags: ['ruth', 'biblequiz', 'kingdavid', 'bibletrivia', 'shorts'],
  },
  '2026-11-06': {
    hook: 'The shortest verse in the Bible.',
    prompt: 'What is the shortest verse in most English Bibles?',
    options: ['God is love', 'Pray without ceasing', 'Rejoice always', 'Jesus wept'],
    answerIndex: 3,
    teach: 'John 11:35, at Lazarus’ tomb. He knew He was about to raise him. He wept anyway.',
    reference: 'John 11:35',
    ask: 'Did you get it?',
    title: 'What is the shortest verse in the Bible?',
    caption: 'Two words, at the tomb of a friend He was about to raise.',
    tags: ['jesuswept', 'biblequiz', 'john', 'bibletrivia', 'shorts'],
  },
  '2026-11-07': {
    hook: 'One woman inside Jericho changed sides.',
    prompt: 'Which woman of Jericho hid the two spies on her roof?',
    options: ['Deborah', 'Rahab', 'Jael', 'Miriam'],
    answerIndex: 1,
    teach: 'Her whole family was spared. Matthew puts her in the family line of Jesus.',
    reference: 'Joshua 2:6',
    ask: 'Did you know that?',
    title: 'Who hid the spies in Jericho? Bible quiz',
    caption: 'She hid them under stalks of flax, and ended up in Jesus’ family tree.',
    tags: ['rahab', 'biblequiz', 'joshua', 'bibletrivia', 'shorts'],
  },
  '2026-11-08': {
    hook: 'Luke chose who heard first.',
    prompt: 'Who does Luke say were the first people told that Jesus was born?',
    options: ['Wise men from the east', 'Priests in the temple', 'Shepherds in the fields', 'Herod’s household'],
    answerIndex: 2,
    teach: 'Night-shift workers, not priests and not kings. Luke does this on purpose.',
    reference: 'Luke 2:8',
    ask: 'What did you say?',
    title: 'Who heard about Jesus’ birth first? Bible quiz',
    caption: 'Not priests, not kings. The men on the night shift.',
    tags: ['christmas', 'biblequiz', 'luke', 'bibletrivia', 'shorts'],
  },
}

export const SCRIPTED_MYTH: Record<string, ScriptedMyth> = {
  '2026-11-02': {
    hook: 'Jonah wasn’t swallowed by a whale.',
    title: 'A great fish', reference: 'Jonah 1:17', art: '/tiktok/scenes/fishing_boat.jpg',
    ask: 'What do you think it was?',
    title_yt: 'Was Jonah swallowed by a whale? What the Bible actually says',
    caption: 'The book of Jonah never says whale. It says the Lord appointed a great fish.',
    tags: ['jonah', 'bible', 'biblefacts', 'faith', 'shorts'],
  },
  '2026-11-03': {
    hook: 'Matthew never says three wise men.',
    title: 'Into the house', reference: 'Matthew 2:11', art: '/tiktok/scenes/lamp_house.jpg',
    ask: 'Which part did you grow up with?',
    title_yt: 'Were there really three wise men? What Matthew actually says',
    caption: 'Three gifts, no number of visitors, and they came into a house, not a stable.',
    tags: ['wisemen', 'christmas', 'biblefacts', 'matthew', 'shorts'],
  },
  '2026-11-04': {
    hook: 'That’s not what the verse says.',
    title: 'The love of money', reference: '1 Timothy 6:10', art: '/tiktok/stages/temple.jpg',
    ask: 'Which version did you learn?',
    title_yt: 'Is money the root of all evil? The verse everyone misquotes',
    caption: 'Paul wrote that the love of money is a root of all kinds of evil. One word changes the whole verse.',
    tags: ['money', 'bible', 'biblefacts', 'misquoted', 'shorts'],
  },
  '2026-11-05': {
    hook: 'Genesis never says it was an apple.',
    title: 'The fruit', reference: 'Genesis 3:6', art: '/tiktok/scenes/garden_night.jpg',
    ask: 'What did you always picture?',
    title_yt: 'Did Adam and Eve eat an apple? What Genesis actually says',
    caption: 'Genesis just says fruit. The apple came much later, mostly from paintings.',
    tags: ['genesis', 'adamandeve', 'biblefacts', 'bible', 'shorts'],
  },
  '2026-11-06': {
    hook: 'Noah didn’t take just two of every animal.',
    title: 'Seven pairs', reference: 'Genesis 7:2', art: '/tiktok/stages/water.jpg',
    ask: 'Did you know that one?',
    title_yt: 'Did Noah take two of every animal? Read the next chapter',
    caption: 'For the clean animals, God tells Noah to take seven pairs.',
    tags: ['noah', 'noahsark', 'biblefacts', 'genesis', 'shorts'],
  },
  '2026-11-07': {
    hook: 'This famous verse isn’t in the Bible.',
    title: 'God helps the ones who can’t', reference: 'Mark 1:41', art: '/tiktok/stages/road.jpg',
    ask: 'Where did you first hear it?',
    title_yt: '"God helps those who help themselves" is not in the Bible',
    caption: 'It sounds like scripture. It is an old proverb, and the Bible keeps saying the opposite.',
    tags: ['bible', 'biblefacts', 'misquoted', 'faith', 'shorts'],
  },
  '2026-11-08': {
    hook: 'There is no innkeeper in the Christmas story.',
    title: 'No room', reference: 'Luke 2:7', art: '/tiktok/verse/luke-2-11.jpg',
    ask: 'Did your church have one?',
    title_yt: 'Was there an innkeeper in the Christmas story? What Luke says',
    caption: 'Luke just says there was no room for them. Nobody slams a door.',
    tags: ['christmas', 'nativity', 'biblefacts', 'luke', 'shorts'],
  },
}

export const scriptedQuiz = (date: string): ScriptedQuiz | null => SCRIPTED_QUIZ[date] ?? null
export const scriptedMyth = (date: string): ScriptedMyth | null => SCRIPTED_MYTH[date] ?? null
