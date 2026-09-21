// The exchanges the third format is built on, and the rule that stops it
// becoming the same two faces every week.
//
// An EXCHANGE is a real question and its answer from the text: somebody asks,
// somebody replies, and the reply goes somewhere the asker did not expect.
// That is the reference account's setup-turn-payoff with no joke in it — the
// structure transfers, the register does not.
//
// **Face variety is the constraint here, not content supply.** Measured
// against the pool: 250 entries, 43 books, 88 of them in the gospels, and 39
// carrying a question or a reply in their own before/after metadata. Supply
// is fine. What is not fine is WHO SPEAKS — Jesus is the speaker on 80 of
// those 250 and Paul on 68, so the top two are 59% of everything. Picked by
// seed alone, this format is the same two faces by March, which is exactly
// the templated look the originality policies penalise.
//
// So the pick is ROTATED, the way `autoCast` rotates the morning reader:
// walk the bank from a fixed epoch and take the first exchange that reuses
// NOBODY from the last few posts. Deterministic, memoised, and derived from
// the date on both sides, so the dashboard and the runner agree.
//
// **Every id in `asker`/`answerer` needs THREE renders** — the base figure,
// `_asking` and `_struck`/`_settled` — because the expression swap on the turn
// is the one thing this layout has instead of motion. `npm run check:exchanges`
// fails the build on a cast id missing any of them, because that failure
// RENDERS: the figure simply never changes face, on the beat the whole post is
// built around.

export interface Exchange {
  id: string
  reference: string
  /** The pinned hook card — on screen for the whole video. */
  hook: string
  /** Who asks, and who answers: cast figure ids, both needing face renders. */
  asker: string
  answerer: string
  /** Their words, from the text. */
  question: string
  answer: string
  /** The whole-frame change saved for the end — their ducks, our arithmetic. */
  payoff: string
  /** The small word under the payoff, when a bare number needs a unit. */
  payoffNote?: string
  /**
   * What the OPERATOR records, in his own voice, at each end of the post.
   * `open` sets up the problem under the hook card before the first figure
   * speaks; `close` lands after the payoff and ends on the question that is
   * the comment ask. Both are scripts he departs from as he reads — the
   * disclosure claims the voice, never the words.
   */
  open: string
  close: string
  /** The end card's verse. */
  verseText: string
  /**
   * The held painting behind the two figures: a file stem under
   * `public/tiktok/exchange/`, keyed the way a verse painting is keyed on its
   * reference. Missing art falls back to the Harvest Road exactly as a
   * missing verse painting does, so an ungenerated backdrop is never a failed
   * post — and `check:exchanges` fails the build on one, because that
   * fallback is a wheat field behind a prison cell.
   */
  scene: string
}

/**
 * Which synthesised voice each figure speaks in, and how it is delivered.
 *
 * The delivery note does as much work as the voice id. The first Peter
 * shipped on `Puck` and read as performed — measured, the problem was not
 * pitch (115 Hz, an ordinary man's voice) but INTONATION SWING: Puck ranges
 * over 102 Hz inside a sentence where `Orus` ranges over 50. So the note says
 * "no lilt, no brightness, no theatrical flair" on every entry, and a voice
 * is chosen for its swing rather than its depth. `Algenib` is the lowest
 * voice in the set and the swingiest of all — deeper is not flatter.
 *
 * Two speakers in one post must never share a voice, or the exchange is one
 * person talking to himself. `check:exchanges` asserts it per entry.
 */
export interface SpeakerVoice { voice: string; style: string }

const PLAIN = 'Plain, level, unhurried. No lilt, no brightness, no theatrical flair.'

export const SPEAKER_VOICE: Record<string, SpeakerVoice> = {
  cephas: { voice: 'Orus', style: `A weathered Galilean fisherman in his fifties. Low, rough, worn. ${PLAIN}` },
  jesus: { voice: 'Charon', style: `Unhurried and certain, speaking to one person standing in front of him. Warm, never grand. ${PLAIN}` },
  naomi: { voice: 'Vindemiatrix', style: `An older widow with nothing left to offer, telling someone to go home for their own good. Tired, kind. ${PLAIN}` },
  bride: { voice: 'Achernar', style: `A young woman deciding something irreversible and saying it out loud. Steady, quiet, not pleading. ${PLAIN}` },
  scribe: { voice: 'Schedar', style: `A careful man who has thought about this for a long time and wants a straight answer. ${PLAIN}` },
  paul: { voice: 'Iapetus', style: `Direct and unsentimental, answering a question that has just been asked in earnest. ${PLAIN}` },
  job: { voice: 'Gacrux', style: `A man who has lost everything and is not performing his grief. Level, spent, unbroken. ${PLAIN}` },
  mordecai: { voice: 'Rasalgethi', style: `An older kinsman naming a hard thing without softening it. Firm, not unkind. ${PLAIN}` },
  prophet_elder: { voice: 'Sadaltager', style: `An old priest, half awake, finally understanding what is happening. ${PLAIN}` },
  samuel: { voice: 'Puck', style: 'A boy answering in the dark, awake and a little frightened. Simple and small — no performance.' },
  james: { voice: 'Alnilam', style: `Practical and blunt, a man describing something he has watched happen. ${PLAIN}` },
  prophet_young: { voice: 'Fenrir', style: `Asking in good faith, wanting the answer to be the easy one. ${PLAIN}` },
  john: { voice: 'Umbriel', style: `A friend who has just found the thing they were all waiting for, fetching someone to come and look. Glad, plain, unexcited. ${PLAIN}` },
  jude: { voice: 'Achird', style: `Sceptical, saying out loud what everyone already thinks about a place like that. Dry, not unkind. ${PLAIN}` },
  daniel: { voice: 'Enceladus', style: `A man a long way from home who will not pretend to understand something. Honest, unembarrassed. ${PLAIN}` },
  david: { voice: 'Zubenelgenubi', style: `A young man stating a record rather than boasting about one. Even, matter of fact. ${PLAIN}` },
  solomon: { voice: 'Algieba', style: `A king used to being obeyed, asking a question he expects one answer to. Unhurried, incurious. ${PLAIN}` },
  nehemiah: { voice: 'Sadachbia', style: `A servant asking for the thing he has wanted for months, in front of the one man who can refuse it. Careful, steady. ${PLAIN}` },
}

/** The voice a figure speaks in, or a plain default so a new id still renders. */
export const voiceFor = (figure: string): SpeakerVoice =>
  SPEAKER_VOICE[figure] ?? { voice: 'Orus', style: PLAIN }

/**
 * How many posts back a SPEAKER may not reappear from.
 *
 * It was 5, which is a little under a fortnight at three a week — and that
 * number was picked before a single exchange was written. Against the real
 * bank it starves the pick: the recorded question-and-answer exchanges in
 * scripture are mostly gospel ones, Jesus answers most of those, and a memory
 * of 5 pushes him to roughly once a month. Two is what the nine below are
 * built for — nobody appears in the post before or after their own, which is
 * the thing a viewer can actually notice, and Jesus lands every third post.
 *
 * `pickExchange` falls back to the least-recently-used rather than repeating,
 * so the failure mode is a shorter gap and never a crash.
 */
export const SPEAKER_MEMORY = 2

/** A speaker is anyone on screen, asker or answerer: both faces are the post. */
export const speakersOf = (e: Exchange): string[] => [e.asker, e.answerer]

/**
 * The next exchange, given what the last few posts used.
 *
 * `recent` is newest-first. Returns the first candidate sharing NO speaker
 * with the window; if every candidate collides — which it will once the bank
 * is small relative to the memory — the one whose speakers were used longest
 * ago, so the rule degrades to "as far apart as possible" instead of failing.
 */
export function pickExchange(pool: Exchange[], recent: Exchange[], used: Set<string>): Exchange | null {
  const fresh = pool.filter((e) => !used.has(e.id))
  if (!fresh.length) return null
  const window = recent.slice(0, SPEAKER_MEMORY).flatMap(speakersOf)
  const clean = fresh.filter((e) => !speakersOf(e).some((s) => window.includes(s)))
  if (clean.length) return clean[0]
  // Nothing clean: the least-recently-seen speakers win. `lastSeen` is the
  // distance back to this exchange's most recent speaker, so a bigger number
  // is a longer rest.
  const lastSeen = (e: Exchange) => Math.min(...speakersOf(e).map((s) => {
    const i = recent.findIndex((r) => speakersOf(r).includes(s))
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }))
  return fresh.slice().sort((a, b) => lastSeen(b) - lastSeen(a))[0]
}

/**
 * The bank. Ordered as authored; the rotation decides what actually airs, so
 * adding one here never re-deals the ones already scheduled — the lesson the
 * season's quest pools learned the hard way.
 */
export const EXCHANGES: Exchange[] = [
  {
    id: 'forgive-seventy',
    reference: 'Matthew 18:21-22',
    hook: 'Peter thought seven was generous',
    asker: 'cephas',
    answerer: 'jesus',
    question: 'Lord, how many times shall I forgive my brother who sins against me? Up to seven times?',
    answer: 'I tell you, not seven times, but seventy times seven.',
    payoff: '490',
    payoffNote: 'times',
    open: "Peter thought he was being generous. He'd done the math, and he brought Jesus a number.",
    close: "Seven felt like a lot to Peter. It wasn't a limit Jesus was raising. It was a limit he was removing. Who are you still counting?",
    verseText: 'Then Peter came to Jesus and asked, "Lord, how many times shall I forgive my brother who sins against me? Up to seven times?" Jesus answered, "I tell you, not seven times, but seventy times seven."',
    scene: 'forgive-seventy',
  },
  {
    id: 'where-you-go',
    reference: 'Ruth 1:15-16',
    hook: 'Naomi told her to go home',
    asker: 'naomi',
    answerer: 'bride',
    question: 'Look, your sister-in-law is going back to her people and her gods. Go back with her.',
    answer: 'Where you go I will go, and where you stay I will stay. Your people will be my people and your God my God.',
    payoff: 'YOUR GOD',
    payoffNote: 'my God',
    open: 'Naomi had nothing left to offer her. No husband, no land, no reason to stay. She said go.',
    close: "Ruth wasn't promised anything. She chose a widow with no future and got written into the line of Christ. Who did you already decide to leave?",
    verseText: '"Where you go I will go, and where you stay I will stay. Your people will be my people and your God my God."',
    scene: 'where-you-go',
  },
  {
    id: 'what-must-i-do',
    reference: 'Acts 16:30-31',
    hook: 'He had just locked them up',
    asker: 'scribe',
    answerer: 'paul',
    question: 'Sirs, what must I do to be saved?',
    answer: 'Believe in the Lord Jesus, and you will be saved — you and your household.',
    payoff: 'ONE',
    payoffNote: 'sentence',
    open: "He'd beaten them and chained them that afternoon. By midnight he was on his knees asking them for help.",
    close: 'He expected a list. Penance, restitution, something to work off. He got one sentence and his whole house. What are you still trying to earn?',
    verseText: 'He then brought them out and asked, "Sirs, what must I do to be saved?" They replied, "Believe in the Lord Jesus, and you will be saved — you and your household."',
    scene: 'what-must-i-do',
  },
  {
    id: 'who-do-you-say',
    reference: 'Matthew 16:15-16',
    hook: 'Jesus asked first',
    asker: 'jesus',
    answerer: 'cephas',
    question: 'But what about you? Who do you say I am?',
    answer: 'You are the Messiah, the Son of the living God.',
    payoff: 'YOU',
    open: 'Everybody had an opinion about him. John the Baptist, Elijah, a prophet. Then he turned it around on them.',
    close: "He didn't ask what the crowd thought. He asked Peter. That question has never once been answered by somebody else. So who do you say he is?",
    verseText: '"But what about you?" he asked. "Who do you say I am?" Simon Peter answered, "You are the Messiah, the Son of the living God."',
    scene: 'who-do-you-say',
  },
  {
    id: 'curse-god-and-die',
    reference: 'Job 2:9-10',
    hook: 'His wife said quit',
    asker: 'bride',
    answerer: 'job',
    question: 'Are you still maintaining your integrity? Curse God and die!',
    answer: 'Shall we accept good from God, and not trouble?',
    payoff: 'AND NOT',
    payoffNote: 'trouble?',
    open: 'He had lost the children, the livestock, the house, and his health. The last person left told him to let go.',
    close: "He never said it didn't hurt. He said it doesn't only run one direction. What have you only ever thanked him for the good half of?",
    verseText: 'His wife said to him, "Are you still maintaining your integrity? Curse God and die!" He replied, "Shall we accept good from God, and not trouble?"',
    scene: 'curse-god-and-die',
  },
  {
    id: 'speak-lord',
    reference: '1 Samuel 3:8-10',
    hook: 'The boy thought it was the old man',
    asker: 'prophet_elder',
    answerer: 'samuel',
    question: 'Go and lie down, and if he calls you, say: Speak, Lord, for your servant is listening.',
    answer: 'Speak, for your servant is listening.',
    payoff: 'THE FOURTH',
    payoffNote: 'time',
    open: 'Three times in the night a voice called him. Three times he ran to the wrong bed. The old priest finally worked out who it was.',
    close: "God called him three times before anybody told him how to answer. He wasn't ignoring it. He didn't know it was for him. What have you been running to the wrong door about?",
    verseText: 'So Eli told Samuel, "Go and lie down, and if he calls you, say, ‘Speak, Lord, for your servant is listening.’" … Then Samuel said, "Speak, for your servant is listening."',
    scene: 'speak-lord',
  },
  {
    id: 'greatest-commandment',
    reference: 'Matthew 22:36-40',
    hook: 'He was counting six hundred and thirteen',
    asker: 'scribe',
    answerer: 'jesus',
    question: 'Teacher, which is the greatest commandment in the Law?',
    answer: 'Love the Lord your God with all your heart, and love your neighbour as yourself. All the Law hangs on these two.',
    payoff: '2',
    payoffNote: 'commandments',
    open: 'The rabbis had the law sorted into six hundred and thirteen commands. Somebody asked him which one was the big one.',
    close: "He didn't shorten the list to make it easier. Two is harder than six hundred and thirteen, because you can't tick them off. Which one are you better at?",
    verseText: '"Teacher, which is the greatest commandment in the Law?" Jesus replied, "Love the Lord your God with all your heart … and love your neighbour as yourself. All the Law and the Prophets hang on these two commandments."',
    scene: 'greatest-commandment',
  },
  {
    id: 'such-a-time',
    reference: 'Esther 4:13-14',
    hook: 'Going in uninvited was a death sentence',
    asker: 'mordecai',
    answerer: 'bride',
    question: 'Do not think that because you are in the king’s house you alone will escape. And who knows but that you have come to your position for such a time as this?',
    answer: 'I will go to the king, even though it is against the law. And if I perish, I perish.',
    payoff: 'IF I PERISH',
    payoffNote: 'I perish',
    open: "She was the queen and she still couldn't walk into the room. Uninvited meant executed unless he held out the sceptre.",
    close: "He didn't tell her it would work out. He told her it would happen with her or without her. What are you waiting to be safe before you do?",
    verseText: '"And who knows but that you have come to your royal position for such a time as this?" … "I will go to the king, even though it is against the law. And if I perish, I perish."',
    scene: 'such-a-time',
  },
  {
    id: 'faith-without-works',
    reference: 'James 2:14-17',
    hook: 'He asked if saying it counts',
    asker: 'prophet_young',
    answerer: 'james',
    question: 'What good is it if someone claims to have faith but has no deeds? Can such faith save him?',
    answer: 'If a brother is without clothes and daily food, and you say, Go in peace, keep warm and well fed, but do nothing — faith by itself is dead.',
    payoff: 'DEAD',
    open: 'Somebody wanted to know whether believing the right thing was the whole job. James had watched people go hungry in his own church.',
    close: "He's not arguing you earn it. He's saying a faith that never once cost you anything might not be there. Who did you say you'd pray for and didn't?",
    verseText: 'What good is it, my brothers and sisters, if someone claims to have faith but has no deeds? … In the same way, faith by itself, if it is not accompanied by action, is dead.',
    scene: 'faith-without-works',
  },
  {
    id: 'born-again',
    reference: 'John 3:4-5',
    hook: 'He came at night so nobody would see',
    asker: 'prophet_elder',
    answerer: 'jesus',
    question: 'How can a man be born when he is old? Can he enter his mother’s womb a second time and be born?',
    answer: 'Unless one is born of water and the Spirit, he cannot enter the kingdom of God.',
    payoff: 'BORN',
    payoffNote: 'from above',
    open: 'He was a ruler, a teacher, a man with a reputation to keep. He waited until it was dark to go and ask.',
    close: 'Nicodemus heard a biology problem. Jesus was not talking about his mother. He was talking about starting over. What are you trying to repair that needs starting again?',
    verseText: '“How can a man be born when he is old?” Nicodemus asked. “Can he enter his mother’s womb a second time and be born?” Jesus answered, “Unless one is born of water and the Spirit, he cannot enter the kingdom of God.”',
    scene: 'born-again',
  },
  {
    id: 'one-thing-you-lack',
    reference: 'Mark 10:17-21',
    hook: 'He came asking what to add',
    asker: 'prophet_young',
    answerer: 'jesus',
    question: 'Good Teacher, what must I do to inherit eternal life?',
    answer: 'One thing you lack. Go, sell everything you have and give to the poor, and you will have treasure in heaven. Then come, follow Me.',
    payoff: 'ONE',
    payoffNote: 'thing you lack',
    open: 'He ran up and knelt in the road. He had kept the commandments since he was a boy, and he wanted to know what else there was.',
    close: 'He asked what to add. He was told what to put down. He went away sad, because he had a great deal. What are you holding that is holding you?',
    verseText: '“Good Teacher,” he asked, “what must I do to inherit eternal life?” … “One thing you lack,” Jesus said. “Go, sell everything you have and give to the poor, and you will have treasure in heaven. Then come, follow Me.”',
    scene: 'one-thing-you-lack',
  },
  {
    id: 'what-do-you-want',
    reference: 'Mark 10:51',
    hook: 'A blind man shouting on the roadside',
    asker: 'jesus',
    answerer: 'job',
    question: 'What do you want Me to do for you?',
    answer: 'Rabboni, let me see again.',
    payoff: 'TO SEE',
    open: 'The crowd told him to be quiet. He shouted louder. Jesus stopped the whole road and had him brought over.',
    close: 'Jesus made him say it out loud. He already knew the answer. Being asked was half the gift. What have you stopped asking for because you assume you know?',
    verseText: '“What do you want Me to do for you?” Jesus asked. The blind man said, “Rabboni, let me see again.”',
    scene: 'what-do-you-want',
  },
  {
    id: 'come-and-see',
    reference: 'John 1:46',
    hook: 'He had already written the town off',
    asker: 'jude',
    answerer: 'john',
    question: 'Can anything good come from Nazareth?',
    answer: 'Come and see.',
    payoff: 'COME',
    payoffNote: 'and see',
    open: 'Philip had found the one they had all been waiting for. He went straight to his friend, and his friend laughed at the address.',
    close: 'Philip did not argue with him. He did not defend Nazareth. He told him to come and look for himself. What have you ruled out without looking?',
    verseText: '“Can anything good come from Nazareth?” Nathanael asked. “Come and see,” said Philip.',
    scene: 'come-and-see',
  },
  {
    id: 'how-can-i',
    reference: 'Acts 8:30-31',
    hook: 'He was reading it out loud and understood none of it',
    asker: 'john',
    answerer: 'daniel',
    question: 'Do you understand what you are reading?',
    answer: 'How can I, unless someone guides me?',
    payoff: 'UNLESS',
    payoffNote: 'someone shows me',
    open: 'He had travelled hundreds of miles to worship, bought the scroll at enormous cost, and was reading it aloud on the road home.',
    close: 'He was not too important to say he did not understand. That one sentence is why he went home baptised. What are you pretending to follow?',
    verseText: '“Do you understand what you are reading?” Philip asked. “How can I,” he said, “unless someone guides me?”',
    scene: 'how-can-i',
  },
  {
    id: 'why-are-you-afraid',
    reference: 'Matthew 8:25-26',
    hook: 'The boat was already filling with water',
    asker: 'cephas',
    answerer: 'jesus',
    question: 'Lord, save us! We are perishing!',
    answer: 'You of little faith, why are you so afraid?',
    payoff: 'WHY',
    payoffNote: 'are you afraid?',
    open: 'Professional fishermen, in a storm bad enough to frighten them, and the only man asleep in the boat was the carpenter.',
    close: 'They asked him to do something. He asked them a question first. The storm was never the emergency. What are you certain is going to sink you?',
    verseText: 'The disciples went and woke Him, saying, “Lord, save us! We are perishing!” “You of little faith,” Jesus replied, “why are you so afraid?”',
    scene: 'why-are-you-afraid',
  },
  {
    id: 'mary',
    reference: 'John 20:15-16',
    hook: 'She thought he was the gardener',
    asker: 'jesus',
    answerer: 'bride',
    question: 'Woman, why are you weeping? Whom are you seeking?',
    answer: 'Sir, if you have carried Him off, tell me where you have put Him, and I will get Him.',
    payoff: 'MARY',
    open: 'She had come before sunrise to finish burying him. The tomb was open, the body was gone, and a man was standing there asking why she was crying.',
    close: 'She did not recognise his face. She recognised her own name. He said one word and she knew him. What would it take for you to hear yours?',
    verseText: '“Woman, why are you weeping?” Jesus asked. … Thinking He was the gardener, she said, “Sir, if you have carried Him off, tell me where you have put Him.” Jesus said to her, “Mary.”',
    scene: 'mary',
  },
  {
    id: 'only-a-boy',
    reference: '1 Samuel 17:33-37',
    hook: 'The king told him he was too young',
    asker: 'prophet_elder',
    answerer: 'david',
    question: 'You cannot go out against this Philistine to fight him. You are only a boy, and he has been a warrior from his youth.',
    answer: 'The LORD who delivered me from the paw of the lion and the bear will deliver me from the hand of this Philistine.',
    payoff: 'THE LION',
    payoffNote: 'and the bear',
    open: 'Every trained soldier in Israel was hiding in a trench. The only volunteer was a boy who had come to bring his brothers bread.',
    close: 'Saul counted his years. David counted what God had already done. He had a record nobody else had watched. What has He already brought you through?',
    verseText: '“You cannot go out against this Philistine,” Saul replied. “You are only a boy.” … But David said, “The LORD who delivered me from the paw of the lion and the bear will deliver me from the hand of this Philistine.”',
    scene: 'only-a-boy',
  },
  {
    id: 'more-than-those',
    reference: '2 Kings 6:15-16',
    hook: 'They woke up surrounded',
    asker: 'prophet_young',
    answerer: 'prophet_elder',
    question: 'Oh, my master, what are we to do?',
    answer: 'Do not be afraid, for those who are with us are more than those who are with them.',
    payoff: 'MORE',
    payoffNote: 'than them',
    open: 'He got up early and the whole city was ringed with horses and chariots. He ran to wake his master, and his master was not worried.',
    close: 'The servant counted what he could see. Elisha asked God to open his eyes, and the hills were full of fire. What are you counting?',
    verseText: '“Oh, my master, what are we to do?” his servant asked. “Do not be afraid,” said Elisha, “for those who are with us are more than those who are with them.”',
    scene: 'more-than-those',
  },
  {
    id: 'even-if-he-does-not',
    reference: 'Daniel 3:15-18',
    hook: 'The furnace was already lit',
    asker: 'solomon',
    answerer: 'daniel',
    question: 'And who is the god who will deliver you from my hands?',
    answer: 'Our God whom we serve is able to deliver us. But even if He does not, we will not serve your gods.',
    payoff: 'EVEN IF',
    payoffNote: 'He does not',
    open: 'The king gave them one more chance. Bow when the music plays, or go into the fire. They did not ask for time to think.',
    close: 'The first half of that answer is faith. The second half is the half that costs. They trusted him without requiring the rescue. Could you?',
    verseText: '“And who is the god who will deliver you from my hands?” … “Our God whom we serve is able to deliver us … But even if He does not, we will not serve your gods.”',
    scene: 'even-if-he-does-not',
  },
  {
    id: 'send-me',
    reference: 'Nehemiah 2:4-5',
    hook: 'He had been crying at work',
    asker: 'solomon',
    answerer: 'nehemiah',
    question: 'What is your request?',
    answer: 'If it pleases the king, send me to Judah, to the city where my fathers are buried, so that I may rebuild it.',
    payoff: 'SEND ME',
    open: 'He was the man who tasted the king’s wine. Looking sad in front of a king could cost you your life, and the king had noticed.',
    close: 'He prayed in the gap between the question and his answer. Then he asked for the one thing he actually wanted. What have you prayed about and never asked for?',
    verseText: '“What is your request?” the king asked. … “If it pleases the king, send me to Judah, to the city where my fathers are buried, so that I may rebuild it.”',
    scene: 'send-me',
  },
  {
    id: 'today',
    reference: 'Luke 23:42-43',
    hook: 'He was dying for something he had actually done',
    asker: 'job',
    answerer: 'jesus',
    question: 'Jesus, remember me when You come into Your kingdom.',
    answer: 'Truly I tell you, today you will be with Me in Paradise.',
    payoff: 'TODAY',
    open: 'He admitted he deserved it. He had nothing left to offer, no way to put any of it right, and hours to live.',
    close: 'He asked to be remembered some day. He was told today. No time, no restitution, nothing to bring. Who have you decided is too far gone?',
    verseText: 'Then he said, “Jesus, remember me when You come into Your kingdom.” And Jesus said to him, “Truly I tell you, today you will be with Me in Paradise.”',
    scene: 'today',
  },
]

/**
 * WHICH DAYS carry an exchange, and which exchange each of them gets.
 *
 * Three a week — Monday, Wednesday, Friday — because that is the cadence the
 * recordings can actually keep: six takes a week on top of the fourteen the
 * verse and the story already want. The days are read in UTC for the reason
 * the church rivalry's week is: the runner is headless Chromium sitting in
 * UTC and the hub is on a person's laptop, and the two have to agree about
 * which exchange a date gets.
 *
 * The pick is DERIVED, never stored: walk `pickExchange` forward from a fixed
 * epoch, taking one per exchange day, so the hub and the runner compute the
 * same answer for a date without asking each other. Same shape as `autoCast`
 * and, like it, memoised — and like `getVerseForDate`'s shuffle, the epoch is
 * history: moving it re-deals every past and future post.
 */
export const EXCHANGE_EPOCH = '2026-09-19'
export const EXCHANGE_DAYS = [1, 3, 5]

const dayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay()
/**
 * The EPOCH is always an exchange day, whatever weekday it falls on.
 *
 * It is a Saturday: the format launched with a post made by hand on the day
 * it was approved, off the Mon/Wed/Fri schedule it runs on from then. Without
 * this the first scheduled Monday would deal index 0 and re-run the exchange
 * that had aired two days earlier — the rotation's whole job, undone on its
 * first day by an off-schedule launch.
 */
export const isExchangeDay = (date: string): boolean =>
  date === EXCHANGE_EPOCH || EXCHANGE_DAYS.includes(dayOf(date))

/** How many exchange days have passed from the epoch up to and including `date`. */
export function exchangeIndex(date: string): number {
  const from = Date.parse(`${EXCHANGE_EPOCH}T00:00:00Z`)
  const to = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return -1
  // The epoch is index 0; everything after it is counted by weekday.
  let n = 0
  for (let t = from + 86_400_000; t <= to; t += 86_400_000) {
    if (EXCHANGE_DAYS.includes(new Date(t).getUTCDay())) n++
  }
  return n
}

const orderMemo: Exchange[] = []
/**
 * The first `n + 1` exchanges the rotation deals, memoised.
 *
 * When the bank runs out the cycle restarts rather than the rotation giving
 * up — `used` is cleared and the speaker window carries over, so the join
 * between one cycle and the next obeys the same no-adjacent-face rule as
 * every other step. A bank of nine at three a week is three weeks, so this
 * happens often and must not be a special case.
 */
function exchangeOrder(n: number): Exchange[] {
  if (!EXCHANGES.length) return []
  const used = new Set(orderMemo.map((e) => e.id))
  while (orderMemo.length <= n) {
    let next = pickExchange(EXCHANGES, orderMemo.slice().reverse(), used)
    if (!next) { used.clear(); next = pickExchange(EXCHANGES, orderMemo.slice().reverse(), used) }
    if (!next) break
    orderMemo.push(next)
    used.add(next.id)
  }
  return orderMemo
}

/** The exchange a date carries, or null when that date is not an exchange day. */
export function exchangeForDate(date: string): Exchange | null {
  if (!isExchangeDay(date)) return null
  const i = exchangeIndex(date)
  if (i < 0) return null
  return exchangeOrder(i)[i] ?? null
}
