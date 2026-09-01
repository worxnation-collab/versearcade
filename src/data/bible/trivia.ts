// Bonus trivia — the one question in a run that isn't about the verse in front
// of you.
//
// WHY THIS EXISTS. Every question the app has ever asked is derived from a
// single `VerseSeed` by `generateQuestions`: which book, who spoke, who was
// addressed, what came before, what came after, two fill-in-the-blanks, the
// theme, the reference. Nine shapes, and all nine are answerable from the card
// the player just read. That teaches verse attribution very well and cannot,
// by construction, ask what happened in a story — a question about a narrative
// needs the narrative, and a `VerseSeed` only knows about itself.
//
// So this file is the second question source: knowledge that spans a whole
// BOOK. It rides in the last slot of a run (see `generateQuestions`), which is
// the slot the combo multiplier has already made the most valuable one — the
// "bonus" is real without a single line of scoring changing.
//
// ─────────────────────────────────────────────────────────────────────────────
// FOUR RULES, and the first two are why this can exist in this app at all.
//
//  1. **A wrong answer still teaches.** `teach` is mandatory and renders on the
//     feedback screen either way, exactly as it does for a verse question. This
//     is trivia in a room with no losers: the point of a miss is the fact.
//
//  2. **Narrative only, inside the shared 66-book canon.** No doctrine, no
//     canon-count ("how many books are in the Bible" has two right answers
//     depending on who is asking), nothing distinctive to one tradition. This
//     app makes denominations into factions it deliberately never ranks, and a
//     trivia question that a Catholic and a Baptist answer differently would
//     quietly make one of them wrong on their own church's tab. Ask about
//     people, places, events, order and the numbers that are IN the text.
//
//  3. **Every book carries at least MIN_TRIVIA_PER_BOOK.** The daily verse can
//     land on any of the 66, and a bonus question that only sometimes appears
//     reads as a bug. `scripts/check-trivia.mjs` fails the build on a thin book
//     — the same guard `check-pool.mjs` puts on the verse pool, for the same
//     reason: content loss is silent otherwise.
//
//  4. **Four options, one answer, and the prompt never gives it away.** Checked
//     by the script and by `checkTriviaData()` at import in dev, because none
//     of it throws at runtime: a question whose prompt contains its own answer
//     just quietly becomes free.
//
// Options are stored in a fixed order and SHUFFLED per run against the run's
// seeded rng, so the answer isn't always in the same place but the same date
// still produces the same question in the same order for every player.

import type { Question } from '@/types'
import { BIBLE_BOOKS } from './pool'

export interface TriviaQuestion {
  /**
   * Stable and globally unique. Nothing keys off it today, but a saved "seen"
   * set or a catalog override would, and renumbering one later is the kind of
   * change that silently rewrites history. Prefix with the book.
   */
  id: string
  /** The question. Must not contain its own answer. */
  prompt: string
  /** Exactly four, all distinct. Order here is not the order shown. */
  options: string[]
  /** Index into `options` as written above. */
  answerIndex: number
  /** The fact revealed after answering — win or lose. Never scolds. */
  teach: string
}

/**
 * The floor every book has to clear.
 *
 * Six rather than four because the library's trivia round draws FIVE distinct
 * questions from one book, and a book with four can't fill a round without
 * repeating itself inside it. KEEP IN SYNC with `scripts/check-trivia.mjs`,
 * which re-derives this rather than importing it.
 */
export const MIN_TRIVIA_PER_BOOK = 6

// Keyed by the book name exactly as `pool.ts` spells it — `BIBLE_BOOKS` is the
// spelling, and the checker fails on a key that isn't in it (a stray 'Psalm'
// for 'Psalms' would otherwise just mean that book never gets a bonus).
export const BOOK_TRIVIA: Record<string, TriviaQuestion[]> = {
  // ————————————————————————— Old Testament: Torah —————————————————————————
  Genesis: [
    { id: 'genesis-1', prompt: 'Who was told to build an ark before the flood?', options: ['Noah', 'Enoch', 'Methuselah', 'Abraham'], answerIndex: 0, teach: 'God told Noah to build the ark. Genesis says he was six hundred years old when the flood came.' },
    { id: 'genesis-2', prompt: 'What did God set in the clouds as the sign of His promise never to flood the earth again?', options: ['A rainbow', 'A dove', 'A morning star', 'A pillar of cloud'], answerIndex: 0, teach: 'The rainbow is the sign of the covenant God made with Noah and every living creature.' },
    { id: 'genesis-3', prompt: 'What was the name of the garden where Adam and Eve were placed?', options: ['Eden', 'Gethsemane', 'Shiloh', 'Bethel'], answerIndex: 0, teach: 'God planted a garden in Eden and put the man there to work it and keep it.' },
    { id: 'genesis-4', prompt: 'Jacob worked seven years for the woman he loved and was given her older sister instead. Who was the sister?', options: ['Leah', 'Rachel', 'Dinah', 'Rebekah'], answerIndex: 0, teach: 'Laban gave Jacob his older daughter Leah, then Rachel for another seven years of work.' },
    { id: 'genesis-5', prompt: 'Which country did Joseph’s brothers sell him into?', options: ['Egypt', 'Babylon', 'Assyria', 'Moab'], answerIndex: 0, teach: 'Joseph was sold to traders bound for Egypt, where he eventually became second only to Pharaoh.' },
    { id: 'genesis-6', prompt: 'At which tower did God confuse the language of the whole earth?', options: ['Babel', 'Jericho', 'Siloam', 'Shechem'], answerIndex: 0, teach: 'The people built a tower to reach the heavens at Babel, and their one language became many.' },
  ],
  Exodus: [
    { id: 'exodus-1', prompt: 'How was the baby Moses hidden on the Nile?', options: ['In a basket among the reeds', 'In a clay jar', 'In a wooden chest', 'Under a fishing net'], answerIndex: 0, teach: 'His mother sealed a papyrus basket with tar and pitch and set it among the reeds by the riverbank.' },
    { id: 'exodus-2', prompt: 'How many plagues struck Egypt before Pharaoh let Israel go?', options: ['Ten', 'Seven', 'Twelve', 'Three'], answerIndex: 0, teach: 'Ten plagues, ending with the death of the firstborn — the night Passover began.' },
    { id: 'exodus-3', prompt: 'What was burning without being consumed when God first spoke to Moses?', options: ['A bush', 'A lampstand', 'An altar', 'A cedar tree'], answerIndex: 0, teach: 'Moses turned aside to see why the bush was not burning up, and God called to him out of it.' },
    { id: 'exodus-4', prompt: 'Which sea parted so that Israel could cross on dry ground?', options: ['The Red Sea', 'The Dead Sea', 'The Sea of Galilee', 'The Great Sea'], answerIndex: 0, teach: 'The LORD drove the sea back with a strong east wind all night, and Israel walked through on dry ground.' },
    { id: 'exodus-5', prompt: 'On which mountain did Moses receive the Ten Commandments?', options: ['Mount Sinai', 'Mount Carmel', 'Mount Nebo', 'Mount Zion'], answerIndex: 0, teach: 'Moses was on Mount Sinai forty days and forty nights when he was given the two stone tablets.' },
    { id: 'exodus-6', prompt: 'What did the Israelites make and worship while Moses was up the mountain?', options: ['A golden calf', 'A bronze serpent', 'A carved eagle', 'A silver throne'], answerIndex: 0, teach: 'Aaron collected their gold earrings and shaped a calf, and Moses broke the tablets when he came down.' },
  ],
  Leviticus: [
    { id: 'leviticus-1', prompt: 'On the Day of Atonement, what was driven into the wilderness carrying the people’s sins?', options: ['A goat', 'A ram', 'A bull', 'A dove'], answerIndex: 0, teach: 'The high priest laid both hands on the live goat, confessed Israel’s sins over it, and sent it away.' },
    { id: 'leviticus-2', prompt: 'Which tribe of Israel served as its priests, and gives the book its name?', options: ['Levi', 'Judah', 'Benjamin', 'Ephraim'], answerIndex: 0, teach: 'Leviticus is the priests’ handbook — the tribe of Levi carried the tabernacle and served at the altar.' },
    { id: 'leviticus-3', prompt: 'What did Leviticus command farmers to leave unharvested at the edges of their fields?', options: ['The corners of the crop, for the poor', 'The tallest stalks, for the priests', 'One field in four, for the king', 'The first sheaf, for the temple'], answerIndex: 0, teach: 'Leaving the edges and the gleanings for the poor and the foreigner is the law Ruth later lives on.' },
    { id: 'leviticus-4', prompt: 'Which two sons of Aaron died after offering unauthorized fire before the LORD?', options: ['Nadab and Abihu', 'Eleazar and Ithamar', 'Hophni and Phinehas', 'Korah and Dathan'], answerIndex: 0, teach: 'Nadab and Abihu offered fire God had not commanded. Their brothers Eleazar and Ithamar carried on the priesthood.' },
    { id: 'leviticus-5', prompt: 'What did Leviticus call every fiftieth year, when debts were released and land returned?', options: ['The Jubilee', 'The Sabbath year', 'The Passover year', 'The year of Atonement'], answerIndex: 0, teach: 'In the Jubilee a trumpet sounded, slaves went free, and every family’s land came back to them.' },
    { id: 'leviticus-6', prompt: 'Leviticus 19 gives a command Jesus later called the second greatest. What is it?', options: ['Love your neighbour as yourself', 'Honour your father and mother', 'Do not bear false witness', 'Keep the Sabbath holy'], answerIndex: 0, teach: 'It sits in the middle of a chapter about wages, courts and the deaf and blind — love with its sleeves rolled up.' },
  ],
  Numbers: [
    { id: 'numbers-1', prompt: 'How many years did Israel wander in the wilderness?', options: ['Forty', 'Seven', 'Twelve', 'Seventy'], answerIndex: 0, teach: 'A year for each of the forty days the spies had explored the land — the generation that refused it did not enter.' },
    { id: 'numbers-2', prompt: 'Whose donkey spoke to him on the road?', options: ['Balaam', 'Balak', 'Barak', 'Boaz'], answerIndex: 0, teach: 'Balaam had been hired to curse Israel. His donkey saw the angel in the road before he did.' },
    { id: 'numbers-3', prompt: 'How many spies were sent ahead into Canaan?', options: ['Twelve', 'Two', 'Seven', 'Forty'], answerIndex: 0, teach: 'One leader from each tribe. Ten came back afraid, and the people believed the ten.' },
    { id: 'numbers-4', prompt: 'Which two spies urged Israel to go up and take the land?', options: ['Joshua and Caleb', 'Aaron and Hur', 'Eleazar and Ithamar', 'Dathan and Abiram'], answerIndex: 0, teach: 'Joshua and Caleb were the only two of that generation who lived to enter the land.' },
    { id: 'numbers-5', prompt: 'What did Moses lift up on a pole so that those bitten by snakes would live?', options: ['A bronze serpent', 'A flowering staff', 'A golden lamp', 'A stone tablet'], answerIndex: 0, teach: 'Jesus points back to this moment in John 3, just before the verse about God so loving the world.' },
    { id: 'numbers-6', prompt: 'What does the book of Numbers take its name from?', options: ['Two censuses counting Israel', 'The number of the plagues', 'The years of the wandering', 'The tribes of Jacob'], answerIndex: 0, teach: 'The book opens with a count of the people and holds a second one forty years later, after the wandering.' },
  ],
  Deuteronomy: [
    { id: 'deuteronomy-1', prompt: 'What is the book of Deuteronomy mostly made up of?', options: ['Moses’ final speeches to Israel', 'Israel’s battle records', 'Songs written for the temple', 'Letters sent between the tribes'], answerIndex: 0, teach: 'Moses speaks on the plains of Moab, in sight of a land he has been told he will not enter.' },
    { id: 'deuteronomy-2', prompt: 'Deuteronomy 6 begins a famous prayer with which words?', options: ['Hear, O Israel', 'Blessed are the poor', 'The LORD is my shepherd', 'In the beginning'], answerIndex: 0, teach: 'The Shema — "Hear, O Israel: the LORD our God, the LORD is one" — is still prayed daily in Jewish homes.' },
    { id: 'deuteronomy-3', prompt: 'On which mountain did Moses see the promised land before he died?', options: ['Mount Nebo', 'Mount Sinai', 'Mount Hermon', 'Mount Gilboa'], answerIndex: 0, teach: 'God showed him the whole land from Nebo. Deuteronomy says no one knows where he was buried.' },
    { id: 'deuteronomy-4', prompt: 'Who was appointed to lead Israel after Moses?', options: ['Joshua', 'Caleb', 'Aaron', 'Samuel'], answerIndex: 0, teach: 'Moses laid his hands on Joshua son of Nun, and the people listened to him.' },
    { id: 'deuteronomy-5', prompt: 'Deuteronomy 6:5 says to love the LORD with all your heart, all your soul, and all your what?', options: ['Strength', 'Wisdom', 'Riches', 'Days'], answerIndex: 0, teach: 'Heart, soul and strength — Jesus quotes this line when asked which commandment is the greatest.' },
    { id: 'deuteronomy-6', prompt: 'How old does Deuteronomy say Moses was when he died?', options: ['A hundred and twenty', 'Eighty', 'Ninety-nine', 'A hundred and seventy-five'], answerIndex: 0, teach: 'A hundred and twenty — and the book adds that his eyes were not weak nor his strength gone.' },
  ],
  // ——————————————————————— Old Testament: history ———————————————————————
  Joshua: [
    { id: 'joshua-1', prompt: 'Which city’s walls fell after Israel marched around them?', options: ['Jericho', 'Ai', 'Hebron', 'Gibeon'], answerIndex: 0, teach: 'Israel marched once a day for six days, seven times on the seventh, and the wall fell down flat.' },
    { id: 'joshua-2', prompt: 'Which woman of Jericho hid the two spies on her roof?', options: ['Rahab', 'Deborah', 'Jael', 'Achsah'], answerIndex: 0, teach: 'Rahab hid them under stalks of flax and was spared with her whole family. Matthew lists her in Jesus’ genealogy.' },
    { id: 'joshua-3', prompt: 'Which river did Israel cross to enter the promised land?', options: ['The Jordan', 'The Nile', 'The Euphrates', 'The Kishon'], answerIndex: 0, teach: 'The water stopped as soon as the priests carrying the ark stepped into it, and the nation crossed on dry ground.' },
    { id: 'joshua-4', prompt: 'What did Israel set up as a memorial after crossing the river?', options: ['Twelve stones', 'A bronze altar', 'A wooden pillar', 'A tent of meeting'], answerIndex: 0, teach: 'One stone for each tribe, so that when children asked what they meant, the crossing would be told again.' },
    { id: 'joshua-5', prompt: 'Joshua told Israel to choose whom they would serve, then said: "As for me and my house, we will serve" whom?', options: ['The LORD', 'The God of Egypt', 'The kings of Canaan', 'The gods of our fathers'], answerIndex: 0, teach: 'It is the last thing he asks of them, at Shechem, near the end of his life.' },
    { id: 'joshua-6', prompt: 'Whose disobedience over plunder brought defeat at Ai?', options: ['Achan', 'Achish', 'Abner', 'Adoni-zedek'], answerIndex: 0, teach: 'Achan hid a robe, silver and gold under his tent. Israel lost the next battle before the matter came to light.' },
  ],
  Judges: [
    { id: 'judges-1', prompt: 'Which judge’s strength was tied to his uncut hair?', options: ['Samson', 'Gideon', 'Jephthah', 'Othniel'], answerIndex: 0, teach: 'Samson was a Nazirite from birth. Delilah had his hair cut while he slept, and his strength left him.' },
    { id: 'judges-2', prompt: 'With how many men did Gideon defeat the Midianites?', options: ['Three hundred', 'Ten thousand', 'Thirty', 'Seven hundred'], answerIndex: 0, teach: 'God kept reducing the army so Israel could not boast it had saved itself. They won with torches, jars and trumpets.' },
    { id: 'judges-3', prompt: 'Which woman judged Israel and went into battle alongside Barak?', options: ['Deborah', 'Jael', 'Hannah', 'Miriam'], answerIndex: 0, teach: 'Deborah held court under a palm tree. Barak refused to go into battle unless she came with him.' },
    { id: 'judges-4', prompt: 'What did Gideon lay on the threshing floor twice to test whether God had really spoken?', options: ['A wool fleece', 'A stone altar', 'A grain offering', 'A clay jar'], answerIndex: 0, teach: 'First the fleece was wet and the ground dry, then the ground wet and the fleece dry.' },
    { id: 'judges-5', prompt: 'Who killed the commander Sisera with a tent peg?', options: ['Jael', 'Deborah', 'Barak', 'Abimelech'], answerIndex: 0, teach: 'Sisera fled to what he thought was a friendly tent. Deborah’s song in Judges 5 retells the whole battle.' },
    { id: 'judges-6', prompt: 'Judges repeatedly explains Israel’s chaos by saying the nation had no what?', options: ['King', 'Temple', 'Army', 'Prophet'], answerIndex: 0, teach: 'The refrain is "everyone did what was right in his own eyes" — the book that makes the case for what comes next.' },
  ],
  Ruth: [
    { id: 'ruth-1', prompt: 'Whose mother-in-law was Naomi?', options: ['Ruth’s', 'Esther’s', 'Hannah’s', 'Abigail’s'], answerIndex: 0, teach: 'Naomi lost her husband and both sons in Moab. Ruth, one of her widowed daughters-in-law, refused to leave her.' },
    { id: 'ruth-2', prompt: 'In whose field did Ruth glean grain?', options: ['Boaz', 'Obed', 'Elimelech', 'Jesse'], answerIndex: 0, teach: 'Boaz told his harvesters to pull out stalks for her on purpose, and later became her husband.' },
    { id: 'ruth-3', prompt: 'Which country did Ruth come from?', options: ['Moab', 'Edom', 'Philistia', 'Egypt'], answerIndex: 0, teach: 'She was a Moabite — a foreigner in Bethlehem — which is part of why the book is so pointed about kindness.' },
    { id: 'ruth-4', prompt: 'To whom did Ruth say, "Where you go I will go"?', options: ['Naomi', 'Boaz', 'Orpah', 'Obed'], answerIndex: 0, teach: 'It is said on the road out of Moab, to a mother-in-law who had told her twice to go home.' },
    { id: 'ruth-5', prompt: 'Ruth and Boaz’s son Obed became the grandfather of which king?', options: ['David', 'Saul', 'Solomon', 'Hezekiah'], answerIndex: 0, teach: 'Obed fathered Jesse, and Jesse fathered David — which is why this small book sits where it does.' },
    { id: 'ruth-6', prompt: 'What name did Naomi ask to be called when she returned to Bethlehem?', options: ['Mara', 'Hadassah', 'Rachel', 'Tamar'], answerIndex: 0, teach: 'Mara means bitter. She said she had gone out full and come back empty — before the book answered her.' },
  ],
  '1 Samuel': [
    { id: '1samuel-1', prompt: 'Which boy heard God calling him in the night and answered, "Speak, for Your servant is listening"?', options: ['Samuel', 'David', 'Saul', 'Jonathan'], answerIndex: 0, teach: 'He thought it was the priest Eli calling. It took three times before Eli realised who it was.' },
    { id: '1samuel-2', prompt: 'Who was anointed as Israel’s first king?', options: ['Saul', 'David', 'Samuel', 'Solomon'], answerIndex: 0, teach: 'The people asked for a king so they could be like the other nations. Samuel warned them what a king would cost.' },
    { id: '1samuel-3', prompt: 'What did David use to bring down Goliath?', options: ['A sling and a stone', 'A spear', 'A bow', 'A sword'], answerIndex: 0, teach: 'He refused Saul’s armour and picked five smooth stones out of the brook on his way to the valley.' },
    { id: '1samuel-4', prompt: 'Who was Samuel’s mother, who had prayed for a son and gave him back to God?', options: ['Hannah', 'Peninnah', 'Naomi', 'Abigail'], answerIndex: 0, teach: 'Hannah prayed so silently at the tabernacle that Eli assumed she was drunk. Her song echoes in Mary’s, centuries later.' },
    { id: '1samuel-5', prompt: 'Whose deep friendship with David cost him his father’s favour?', options: ['Jonathan', 'Abner', 'Joab', 'Ahimelech'], answerIndex: 0, teach: 'Jonathan was Saul’s son and heir, and he warned David of his own father’s plans to kill him.' },
    { id: '1samuel-6', prompt: 'Which woman’s quick thinking with food stopped David from taking revenge on her husband Nabal?', options: ['Abigail', 'Michal', 'Bathsheba', 'Merab'], answerIndex: 0, teach: 'Abigail rode out to meet David with loaves, wine and figs. She later became his wife.' },
  ],
  '2 Samuel': [
    { id: '2samuel-1', prompt: 'Which city did David capture and make his capital?', options: ['Jerusalem', 'Hebron', 'Bethlehem', 'Samaria'], answerIndex: 0, teach: 'He took the stronghold of Zion from the Jebusites, and it became known as the City of David.' },
    { id: '2samuel-2', prompt: 'What did David dance before as it was brought into the city?', options: ['The ark of the covenant', 'The bronze altar', 'The golden lampstand', 'The king’s standard'], answerIndex: 0, teach: 'He danced with all his might in a linen ephod, and his wife Michal despised him for it from a window.' },
    { id: '2samuel-3', prompt: 'Which prophet confronted David with the words, "You are the man"?', options: ['Nathan', 'Gad', 'Samuel', 'Elijah'], answerIndex: 0, teach: 'Nathan told him a story about a rich man stealing a poor man’s only lamb, and let David pass sentence on himself.' },
    { id: '2samuel-4', prompt: 'Whose husband Uriah was placed at the front of the battle to die?', options: ['Bathsheba’s', 'Abigail’s', 'Michal’s', 'Tamar’s'], answerIndex: 0, teach: 'Uriah the Hittite was one of David’s own mighty men. Psalm 51 is traditionally David’s prayer after this.' },
    { id: '2samuel-5', prompt: 'Which son of David led a rebellion against him?', options: ['Absalom', 'Solomon', 'Adonijah', 'Amnon'], answerIndex: 0, teach: 'Absalom stole the hearts of Israel at the city gate, and David fled Jerusalem barefoot and weeping.' },
    { id: '2samuel-6', prompt: 'What caught Absalom in an oak tree during the battle?', options: ['His hair', 'His cloak', 'His shield', 'His reins'], answerIndex: 0, teach: 'His mule went on without him. David’s grief — "O Absalom, my son" — is one of the rawest passages in the book.' },
  ],
  '1 Kings': [
    { id: '1kings-1', prompt: 'Which king asked God for a discerning heart rather than riches or long life?', options: ['Solomon', 'David', 'Rehoboam', 'Jeroboam'], answerIndex: 0, teach: 'God gave him wisdom and the wealth he had not asked for. His first recorded case was two women and one living baby.' },
    { id: '1kings-2', prompt: 'What did Solomon build in Jerusalem over seven years?', options: ['The temple', 'The city wall', 'A fleet of ships', 'The tabernacle'], answerIndex: 0, teach: 'The stone was dressed at the quarry, so no hammer or chisel was heard at the building site.' },
    { id: '1kings-3', prompt: 'Which prophet challenged the prophets of Baal on Mount Carmel?', options: ['Elijah', 'Elisha', 'Micaiah', 'Nathan'], answerIndex: 0, teach: 'He soaked the altar with water first, and fire fell anyway. Afterwards he ran from one woman, Jezebel, and asked to die.' },
    { id: '1kings-4', prompt: 'Which queen travelled to test Solomon with hard questions?', options: ['The Queen of Sheba', 'Jezebel', 'Athaliah', 'Esther'], answerIndex: 0, teach: 'She came with spices, gold and precious stones, and said the half had not been told her.' },
    { id: '1kings-5', prompt: 'What fed Elijah by the brook during the drought?', options: ['Ravens', 'Doves', 'Wild goats', 'Locusts'], answerIndex: 0, teach: 'Ravens brought him bread and meat morning and evening, until the brook itself dried up.' },
    { id: '1kings-6', prompt: 'After Solomon’s death the kingdom split in two. What were the halves called?', options: ['Israel and Judah', 'Judah and Samaria', 'Israel and Edom', 'Zion and Judah'], answerIndex: 0, teach: 'Ten tribes followed Jeroboam as Israel in the north; Judah stayed with Solomon’s son Rehoboam in the south.' },
  ],
  '2 Kings': [
    { id: '2kings-1', prompt: 'How was Elijah taken up to heaven?', options: ['In a whirlwind, with a chariot of fire', 'On the wings of an eagle', 'In a cloud at noon', 'In a pillar of smoke'], answerIndex: 0, teach: 'Elisha saw it happen and cried out, "My father, my father, the chariots of Israel and its horsemen!"' },
    { id: '2kings-2', prompt: 'Who asked for a double portion of Elijah’s spirit?', options: ['Elisha', 'Gehazi', 'Jehu', 'Obadiah'], answerIndex: 0, teach: 'He picked up the cloak that fell as Elijah went up, and struck the Jordan with it.' },
    { id: '2kings-3', prompt: 'Which foreign commander was healed of leprosy in the Jordan?', options: ['Naaman', 'Sennacherib', 'Ben-hadad', 'Nebuchadnezzar'], answerIndex: 0, teach: 'He was insulted by such a plain instruction, and it was his own servants who talked him into obeying it.' },
    { id: '2kings-4', prompt: 'How many times was Naaman told to wash in the river?', options: ['Seven', 'Three', 'Ten', 'Twelve'], answerIndex: 0, teach: 'Seven times — and his skin came back like that of a young boy.' },
    { id: '2kings-5', prompt: 'How old was Josiah when he became king of Judah?', options: ['Eight', 'Sixteen', 'Twenty-one', 'Thirty'], answerIndex: 0, teach: 'A boy king. The Book of the Law was found during repairs to the temple in his eighteenth year, and he tore his robes.' },
    { id: '2kings-6', prompt: 'Which empire carried Judah into exile at the end of 2 Kings?', options: ['Babylon', 'Egypt', 'Persia', 'Greece'], answerIndex: 0, teach: 'Nebuchadnezzar of Babylon burned the temple and took the people away. The northern kingdom had fallen to Assyria long before.' },
  ],
  '1 Chronicles': [
    { id: '1chronicles-1', prompt: 'How does 1 Chronicles begin?', options: ['With genealogies, starting from Adam', 'With the exodus from Egypt', 'With the fall of Jerusalem', 'With a psalm of David'], answerIndex: 0, teach: 'Nine chapters of names. For readers coming home from exile, the list itself was the argument that they still existed.' },
    { id: '1chronicles-2', prompt: 'Which king is the central figure of 1 Chronicles?', options: ['David', 'Solomon', 'Saul', 'Hezekiah'], answerIndex: 0, teach: 'The book retells his reign, dwelling on worship and the ark rather than on his household troubles.' },
    { id: '1chronicles-3', prompt: 'Whose short prayer in 1 Chronicles asks God to enlarge his territory?', options: ['Jabez', 'Jehoshaphat', 'Joab', 'Jotham'], answerIndex: 0, teach: 'Two verses, buried in a genealogy, about a man whose name sounded like the word for pain.' },
    { id: '1chronicles-4', prompt: 'David gathered materials for the temple but was told he would not build it. Why?', options: ['He was a man of war who had shed blood', 'He was too old', 'He was not of the tribe of Levi', 'He had not asked God first'], answerIndex: 0, teach: 'God told him his son, a man of peace, would build it instead — so David spent his last years stockpiling for it.' },
    { id: '1chronicles-5', prompt: 'Which tribe was set apart for the tabernacle rather than counted for war?', options: ['Levi', 'Dan', 'Asher', 'Naphtali'], answerIndex: 0, teach: 'Chronicles gives the Levites unusual space — the singers, gatekeepers and musicians are all named.' },
    { id: '1chronicles-6', prompt: 'Who died touching the ark to steady it when the oxen stumbled?', options: ['Uzzah', 'Obed-edom', 'Ahio', 'Abinadab'], answerIndex: 0, teach: 'The ark was being carried on a cart rather than on poles by the Levites. The second attempt was done the prescribed way.' },
  ],
  '2 Chronicles': [
    { id: '2chronicles-1', prompt: 'Who built and dedicated the temple in 2 Chronicles?', options: ['Solomon', 'David', 'Hezekiah', 'Zerubbabel'], answerIndex: 0, teach: 'His dedication prayer asks God to hear from heaven whenever people turn toward this house.' },
    { id: '2chronicles-2', prompt: 'What filled the temple at its dedication, so the priests could not stand to minister?', options: ['A cloud, the glory of the LORD', 'Smoke from the altar', 'A rushing wind', 'The sound of trumpets'], answerIndex: 0, teach: 'The same glory-cloud that had filled the tabernacle in the wilderness centuries earlier.' },
    { id: '2chronicles-3', prompt: '2 Chronicles 7:14 says that if God’s people humble themselves, pray and seek His face, He will forgive their sin and do what?', options: ['Heal their land', 'Send them a king', 'Rebuild the temple', 'Scatter their enemies'], answerIndex: 0, teach: 'It is God’s answer to Solomon’s dedication prayer, spoken at night after the festival ended.' },
    { id: '2chronicles-4', prompt: 'Which king was struck with leprosy for burning incense in the temple himself?', options: ['Uzziah', 'Ahaz', 'Manasseh', 'Amaziah'], answerIndex: 0, teach: 'Eighty priests tried to stop him. He lived in a separate house for the rest of his life.' },
    { id: '2chronicles-5', prompt: 'Which king’s reforms followed the discovery of the Book of the Law in the temple?', options: ['Josiah', 'Jehoshaphat', 'Asa', 'Joash'], answerIndex: 0, teach: 'He read it aloud to everyone from the least to the greatest, then kept the largest Passover since the days of Samuel.' },
    { id: '2chronicles-6', prompt: 'Whose decree, allowing the exiles to go home and rebuild, closes 2 Chronicles?', options: ['Cyrus of Persia', 'Nebuchadnezzar of Babylon', 'Darius the Mede', 'Pharaoh Neco'], answerIndex: 0, teach: 'The book ends mid-sentence, on an invitation: "Let him go up." Ezra picks the same decree up on its first page.' },
  ],
  Ezra: [
    { id: 'ezra-1', prompt: 'What did the returning exiles set out to rebuild in the book of Ezra?', options: ['The temple', 'The city wall', 'The king’s palace', 'The tabernacle'], answerIndex: 0, teach: 'The altar went up first, before a single foundation stone was laid, so the sacrifices could begin again.' },
    { id: 'ezra-2', prompt: 'Which Persian king’s decree first sent the exiles home?', options: ['Cyrus', 'Xerxes', 'Nebuchadnezzar', 'Sennacherib'], answerIndex: 0, teach: 'He also sent back the temple articles Nebuchadnezzar had carried off — counted out, item by item.' },
    { id: 'ezra-3', prompt: 'What did the older men do when the foundation of the new temple was laid?', options: ['Wept aloud', 'Kept silent', 'Left the city', 'Refused to look'], answerIndex: 0, teach: 'They had seen the first temple. The weeping and the shouting were so mixed that nobody could tell them apart.' },
    { id: 'ezra-4', prompt: 'What was Ezra himself?', options: ['A priest and scribe skilled in the Law', 'A king’s general', 'A carpenter', 'A shepherd'], answerIndex: 0, teach: 'The book says he set his heart to study the Law, to do it, and to teach it — in that order.' },
    { id: 'ezra-5', prompt: 'How was the rebuilding halted for a time?', options: ['Neighbouring officials wrote to the king against it', 'An earthquake destroyed the foundation', 'The builders ran out of cedar', 'A famine emptied the city'], answerIndex: 0, teach: 'Work stopped until the reign of Darius, when the decree of Cyrus was found again in the archives.' },
    { id: 'ezra-6', prompt: 'Which two prophets encouraged the people to finish the temple?', options: ['Haggai and Zechariah', 'Isaiah and Jeremiah', 'Amos and Hosea', 'Joel and Obadiah'], answerIndex: 0, teach: 'Both men have books of their own, and both were preaching to the same stalled building site.' },
  ],
  Nehemiah: [
    { id: 'nehemiah-1', prompt: 'What did Nehemiah come to Jerusalem to rebuild?', options: ['The city wall', 'The temple', 'The royal road', 'The water tunnel'], answerIndex: 0, teach: 'He rode out at night first, alone, to see how bad the ruins were before telling anybody his plan.' },
    { id: 'nehemiah-2', prompt: 'What was Nehemiah’s position before he went to Jerusalem?', options: ['Cupbearer to the king', 'Captain of the guard', 'Chief scribe', 'Keeper of the treasury'], answerIndex: 0, teach: 'A cupbearer was trusted with the king’s life, which is why his sad face was dangerous enough to frighten him.' },
    { id: 'nehemiah-3', prompt: 'In how many days was the wall finished?', options: ['Fifty-two', 'Seven', 'A hundred and twenty', 'Forty'], answerIndex: 0, teach: 'Even Israel’s enemies concluded the work had been done with God’s help, because of the speed of it.' },
    { id: 'nehemiah-4', prompt: 'Which two men mocked and schemed against the builders?', options: ['Sanballat and Tobiah', 'Haman and Memucan', 'Rehum and Bishlam', 'Gog and Magog'], answerIndex: 0, teach: 'They tried ridicule, then threats, then four separate invitations to a meeting on the plain. Nehemiah refused all of them.' },
    { id: 'nehemiah-5', prompt: 'How did the builders work once threats began?', options: ['With a tool in one hand and a weapon in the other', 'Only after dark', 'In shifts of seven days', 'Behind a wooden screen'], answerIndex: 0, teach: 'Half the men built while half stood guard, and the trumpeter stayed beside Nehemiah to call everyone to one place.' },
    { id: 'nehemiah-6', prompt: 'Who read the Law aloud to the assembled people from a wooden platform?', options: ['Ezra', 'Nehemiah', 'Eliashib', 'Hanani'], answerIndex: 0, teach: 'They read from daybreak till noon, with others explaining it, and the people wept until they were told it was a day to feast.' },
  ],
  Esther: [
    { id: 'esther-1', prompt: 'Which cousin raised Esther and sat at the king’s gate?', options: ['Mordecai', 'Haman', 'Hegai', 'Memucan'], answerIndex: 0, teach: 'He had brought her up after her parents died. Her Hebrew name was Hadassah.' },
    { id: 'esther-2', prompt: 'Who plotted to destroy the Jews throughout the empire?', options: ['Haman', 'Mordecai', 'Vashti', 'Xerxes'], answerIndex: 0, teach: 'He cast lots — "pur" — to choose the day, which is where the festival of Purim gets its name.' },
    { id: 'esther-3', prompt: 'Who told Esther she may have come to her position "for such a time as this"?', options: ['Mordecai', 'The king', 'Hegai', 'Zeresh'], answerIndex: 0, teach: 'He also warned her that staying silent would not save her, and that deliverance would come from somewhere.' },
    { id: 'esther-4', prompt: 'What did Esther ask the Jews of the city to do for three days before she approached the king?', options: ['Fast', 'March', 'Leave the city', 'Send letters'], answerIndex: 0, teach: 'Going to the king unsummoned could cost her life. She said, "If I perish, I perish."' },
    { id: 'esther-5', prompt: 'Which festival remembers the rescue told in this book?', options: ['Purim', 'Passover', 'Tabernacles', 'Weeks'], answerIndex: 0, teach: 'Purim is still kept with feasting, gifts of food, and gifts to the poor — all four commanded at the end of the book.' },
    { id: 'esther-6', prompt: 'What happened to the gallows Haman had built for Mordecai?', options: ['Haman was hanged on it himself', 'It was burned by the king', 'It was left standing empty', 'Mordecai had it moved to the gate'], answerIndex: 0, teach: 'The king had just discovered that Mordecai’s report of an assassination plot had never been rewarded.' },
  ],
  // ————————————————————— Old Testament: wisdom and poetry —————————————————
  Job: [
    { id: 'job-1', prompt: 'How many friends came and sat with Job in his suffering?', options: ['Three', 'Seven', 'Two', 'Twelve'], answerIndex: 0, teach: 'Eliphaz, Bildad and Zophar. A fourth man, Elihu, speaks up only much later.' },
    { id: 'job-2', prompt: 'How long did Job’s friends sit with him without saying a word?', options: ['Seven days and seven nights', 'One night', 'Three days', 'A month'], answerIndex: 0, teach: 'It is the best thing they do in the whole book. The trouble starts when they open their mouths.' },
    { id: 'job-3', prompt: 'Out of what did God finally answer Job?', options: ['A storm', 'A burning bush', 'A still small voice', 'A pillar of fire'], answerIndex: 0, teach: 'The answer is four chapters of questions rather than an explanation — where were you when I laid the earth’s foundations?' },
    { id: 'job-4', prompt: 'Which younger man spoke after Job’s three friends had run out of arguments?', options: ['Elihu', 'Eliphaz', 'Bildad', 'Zophar'], answerIndex: 0, teach: 'Elihu says he held back because of his age. God never rebukes him the way He rebukes the other three.' },
    { id: 'job-5', prompt: 'Which two great creatures does God describe to Job at the end?', options: ['Behemoth and Leviathan', 'Rahab and Nephilim', 'Cherubim and Seraphim', 'Bashan and Gilead'], answerIndex: 0, teach: 'Chapters of poetry about animals no one can tame, offered to a man asking why he suffered.' },
    { id: 'job-6', prompt: 'How does the book of Job end?', options: ['God restores Job twice what he had lost', 'Job dies in poverty', 'Job leaves for another country', 'The three friends inherit his land'], answerIndex: 0, teach: 'He is also told to pray for the three friends who counselled him so badly — and he does.' },
  ],
  Psalms: [
    { id: 'psalms-1', prompt: 'Which psalm begins, "The LORD is my shepherd, I shall not want"?', options: ['Psalm 23', 'Psalm 1', 'Psalm 51', 'Psalm 121'], answerIndex: 0, teach: 'Six short verses that move from green pastures to a valley to a table set in front of enemies.' },
    { id: 'psalms-2', prompt: 'Which king is named in the titles of more psalms than anyone else?', options: ['David', 'Solomon', 'Hezekiah', 'Josiah'], answerIndex: 0, teach: 'Roughly half carry his name. Others are credited to Asaph, the sons of Korah, Moses and Solomon.' },
    { id: 'psalms-3', prompt: 'Which psalm is the longest chapter in the whole Bible?', options: ['Psalm 119', 'Psalm 150', 'Psalm 100', 'Psalm 23'], answerIndex: 0, teach: 'A hundred and seventy-six verses, almost every one of them about God’s word.' },
    { id: 'psalms-4', prompt: 'How is Psalm 119 arranged?', options: ['As an acrostic through the Hebrew alphabet', 'As a single unbroken poem', 'As a dialogue between two voices', 'As a list of the tribes'], answerIndex: 0, teach: 'Twenty-two sections of eight verses, one for each Hebrew letter, and every verse in a section starts with it.' },
    { id: 'psalms-5', prompt: 'Into how many books or sections is Psalms traditionally divided?', options: ['Five', 'Two', 'Twelve', 'Three'], answerIndex: 0, teach: 'Each of the five ends with a burst of praise, and the whole collection finishes with Psalm 150.' },
    { id: 'psalms-6', prompt: 'Which psalm opens with the words Jesus cried from the cross, "My God, my God, why have You forsaken me?"', options: ['Psalm 22', 'Psalm 31', 'Psalm 69', 'Psalm 88'], answerIndex: 0, teach: 'The same psalm goes on to describe pierced hands and feet, and clothing divided by lot.' },
    { id: 'psalms-7', prompt: 'Which psalm is the shortest chapter in the Bible?', options: ['Psalm 117', 'Psalm 23', 'Psalm 1', 'Psalm 150'], answerIndex: 0, teach: 'Two verses — and it sits only a few pages from Psalm 119, the longest chapter of all.' },
    { id: 'psalms-8', prompt: 'Psalm 1 compares the person who delights in God’s law to what?', options: ['A tree planted by streams of water', 'A city on a hill', 'A lamp in a window', 'A ship in harbour'], answerIndex: 0, teach: 'Yielding fruit in season, its leaf never withering — while the wicked are like chaff the wind blows away.' },
  ],
  Proverbs: [
    { id: 'proverbs-1', prompt: 'Which king is named at the start of the book as its main author?', options: ['Solomon', 'David', 'Hezekiah', 'Lemuel'], answerIndex: 0, teach: 'Later sections name others — Agur, King Lemuel, and "the men of Hezekiah" who copied more of Solomon’s sayings.' },
    { id: 'proverbs-2', prompt: 'Proverbs says the fear of the LORD is the beginning of what?', options: ['Wisdom', 'Sorrow', 'Riches', 'Peace'], answerIndex: 0, teach: 'And the knowledge of the Holy One is understanding — the book’s thesis, stated twice.' },
    { id: 'proverbs-3', prompt: 'How does Proverbs picture wisdom in its opening chapters?', options: ['As a woman calling out in the streets', 'As a locked treasury', 'As a mountain to be climbed', 'As a scroll sealed with wax'], answerIndex: 0, teach: 'She shouts at the city gate where the crowds are, which is a strange place to look for wisdom and exactly the point.' },
    { id: 'proverbs-4', prompt: 'Which creature is the sluggard told to go and watch?', options: ['The ant', 'The eagle', 'The ox', 'The lion'], answerIndex: 0, teach: '"Consider her ways and be wise" — she has no commander, and still stores her provisions in summer.' },
    { id: 'proverbs-5', prompt: 'Proverbs 15 says a gentle answer turns away what?', options: ['Wrath', 'Shame', 'Poverty', 'Slander'], answerIndex: 0, teach: 'The other half of the verse: a harsh word stirs up anger. The book is full of these paired opposites.' },
    { id: 'proverbs-6', prompt: 'What does the last chapter of Proverbs describe at length?', options: ['A wife of noble character', 'The building of the temple', 'The end of the world', 'A king’s coronation'], answerIndex: 0, teach: 'It is an acrostic too, and it is taught to King Lemuel by his mother.' },
  ],
  Ecclesiastes: [
    { id: 'ecclesiastes-1', prompt: 'What word does the Teacher repeat over everything he examines?', options: ['Meaningless — a breath, or vapour', 'Wicked', 'Glorious', 'Forbidden'], answerIndex: 0, teach: 'The Hebrew "hevel" means vapour or breath — not worthless so much as impossible to hold on to.' },
    { id: 'ecclesiastes-2', prompt: 'Which chapter of Ecclesiastes says there is a time for everything under heaven?', options: ['Chapter 3', 'Chapter 1', 'Chapter 7', 'Chapter 12'], answerIndex: 0, teach: 'A time to be born and a time to die, a time to weep and a time to laugh — fourteen pairs in all.' },
    { id: 'ecclesiastes-3', prompt: 'Ecclesiastes says there is nothing new where?', options: ['Under the sun', 'In the king’s court', 'Beyond the sea', 'Among the wise'], answerIndex: 0, teach: '"Under the sun" is the book’s favourite phrase — life measured without looking any higher than the horizon.' },
    { id: 'ecclesiastes-4', prompt: 'Ecclesiastes says two are better than one, and that a cord of three strands is what?', options: ['Not quickly broken', 'Fit for a king', 'Heavier than gold', 'Worn out sooner'], answerIndex: 0, teach: 'It comes from a passage about a man with no one to help him up when he falls.' },
    { id: 'ecclesiastes-5', prompt: 'How does the Teacher describe himself at the start of the book?', options: ['Son of David, king in Jerusalem', 'A shepherd of Tekoa', 'A scribe of the exile', 'A gatekeeper of the temple'], answerIndex: 0, teach: 'Which is why the book is traditionally read as Solomon looking back on everything he had tried.' },
    { id: 'ecclesiastes-6', prompt: 'What does Ecclesiastes give as the conclusion of the whole matter?', options: ['Fear God and keep His commandments', 'Eat, drink and forget', 'Store up wealth for your children', 'Seek wisdom above all'], answerIndex: 0, teach: 'The very last lines of a book that has spent twelve chapters taking everything else apart.' },
  ],
  'Song of Solomon': [
    { id: 'song-1', prompt: 'What kind of book is Song of Solomon?', options: ['A love song between a bride and her beloved', 'A record of temple offerings', 'A collection of laws', 'A prophecy against the nations'], answerIndex: 0, teach: 'It is a poem in voices, with a chorus — the daughters of Jerusalem — answering the lovers.' },
    { id: 'song-2', prompt: 'What flowers does the bride compare herself to?', options: ['A rose of Sharon and a lily of the valleys', 'A cedar of Lebanon and a palm', 'A vine of Engedi and an olive', 'A myrtle and a fig'], answerIndex: 0, teach: 'Her beloved answers that a lily among thorns is what she is next to everyone else.' },
    { id: 'song-3', prompt: 'Complete the book’s best-known line: "I am my beloved’s and…"', options: ['my beloved is mine', 'he shall not leave me', 'the LORD is his', 'his banner over me'], answerIndex: 0, teach: 'A version of the line appears three times, each with the order of the two halves slightly changed.' },
    { id: 'song-4', prompt: 'Song of Solomon says love is as strong as what?', options: ['Death', 'The sea', 'Iron', 'The dawn'], answerIndex: 0, teach: 'The same verse says its jealousy is unyielding as the grave, and it burns like a mighty flame.' },
    { id: 'song-5', prompt: 'Who answers and comments on the lovers throughout the book?', options: ['The daughters of Jerusalem', 'The elders at the gate', 'The priests of the temple', 'The watchmen of Lebanon'], answerIndex: 0, teach: 'The bride charges them repeatedly not to awaken love before it pleases.' },
    { id: 'song-6', prompt: 'Which king is named in the book’s opening title?', options: ['Solomon', 'David', 'Hezekiah', 'Rehoboam'], answerIndex: 0, teach: 'It calls itself the Song of Songs — a Hebrew way of saying the finest song of all.' },
  ],
  // ————————————————————— Old Testament: the major prophets —————————————————
  Isaiah: [
    { id: 'isaiah-1', prompt: 'What did Isaiah see in his vision in the temple?', options: ['The Lord on a throne, with seraphim calling out', 'A valley of dry bones', 'A hand writing on a wall', 'A wheel within a wheel'], answerIndex: 0, teach: 'The doorposts shook at the sound of their voices, and the house filled with smoke.' },
    { id: 'isaiah-2', prompt: 'What touched Isaiah’s lips to take away his guilt?', options: ['A live coal from the altar', 'A drop of oil', 'A branch of hyssop', 'The hem of a robe'], answerIndex: 0, teach: 'A seraph carried it with tongs. Isaiah had just cried out that he was a man of unclean lips.' },
    { id: 'isaiah-3', prompt: 'How did Isaiah answer when he heard, "Whom shall I send, and who will go for Us?"', options: ['Here am I. Send me!', 'I am only a child', 'I am slow of speech', 'Send another, I pray'], answerIndex: 0, teach: 'It comes at the end of the throne-room vision — and the job he is given is a hard one.' },
    { id: 'isaiah-4', prompt: 'Isaiah 9 gives a child four titles. Which of these is one of them?', options: ['Prince of Peace', 'King of Kings', 'Bright Morning Star', 'Lamb of God'], answerIndex: 0, teach: 'Wonderful Counsellor, Mighty God, Everlasting Father, Prince of Peace — read every December, written in a time of war.' },
    { id: 'isaiah-5', prompt: 'Isaiah 53 describes a figure usually called what?', options: ['The suffering servant', 'The son of the morning', 'The watchman of Zion', 'The shepherd of Israel'], answerIndex: 0, teach: 'Despised and rejected, pierced for our transgressions, silent like a lamb before its shearers.' },
    { id: 'isaiah-6', prompt: 'Which king of Judah did Isaiah tell that fifteen years would be added to his life?', options: ['Hezekiah', 'Ahaz', 'Uzziah', 'Manasseh'], answerIndex: 0, teach: 'The shadow on the stairway went backwards ten steps as the sign, and Hezekiah wrote a poem about it afterwards.' },
  ],
  Jeremiah: [
    { id: 'jeremiah-1', prompt: 'By what nickname is Jeremiah usually known?', options: ['The weeping prophet', 'The shepherd prophet', 'The prophet of fire', 'The silent prophet'], answerIndex: 0, teach: 'He preached for forty years to a city that would not listen, and watched it fall exactly as he had said.' },
    { id: 'jeremiah-2', prompt: 'What did Jeremiah protest when God first called him?', options: ['That he was only a child and did not know how to speak', 'That he was too old', 'That he had no scroll', 'That his brothers were better suited'], answerIndex: 0, teach: 'God answered that He had known him before he was formed in the womb, and touched his mouth.' },
    { id: 'jeremiah-3', prompt: 'Which workshop was Jeremiah sent to watch, as a picture of God and Israel?', options: ['A potter’s house', 'A blacksmith’s forge', 'A weaver’s loom', 'A carpenter’s yard'], answerIndex: 0, teach: 'The pot was spoiled in the potter’s hands, so he reshaped it into another pot as seemed best to him.' },
    { id: 'jeremiah-4', prompt: 'How many years did Jeremiah say the exile in Babylon would last?', options: ['Seventy', 'Forty', 'Seven', 'A hundred'], answerIndex: 0, teach: 'Daniel is later found reading this very number and working out that the time is nearly up.' },
    { id: 'jeremiah-5', prompt: 'What did Jeremiah buy while Jerusalem was under siege, as a sign that life would return?', options: ['A field at Anathoth', 'A house in Jerusalem', 'A flock of sheep', 'A vineyard in Samaria'], answerIndex: 0, teach: 'He had the deed sealed in a clay jar to last a long time — a property purchase as an act of hope.' },
    { id: 'jeremiah-6', prompt: 'Where was Jeremiah thrown and left to sink in the mud?', options: ['A cistern', 'A lions’ den', 'A stable', 'A grain pit'], answerIndex: 0, teach: 'Ebed-melech, a foreigner in the king’s house, pulled him out with rags and worn-out clothes for padding.' },
  ],
  Lamentations: [
    { id: 'lamentations-1', prompt: 'Which city does Lamentations mourn?', options: ['Jerusalem', 'Babylon', 'Nineveh', 'Samaria'], answerIndex: 0, teach: 'It opens by calling the city a widow — once great among the nations, now sitting alone.' },
    { id: 'lamentations-2', prompt: 'How many chapters does Lamentations have?', options: ['Five', 'Three', 'Twelve', 'Twenty-two'], answerIndex: 0, teach: 'Five poems for five stages of grief over one event, and the middle one is the longest.' },
    { id: 'lamentations-3', prompt: 'How are most of its poems built?', options: ['As acrostics on the Hebrew alphabet', 'As songs for two choirs', 'As a legal case', 'As letters to the exiles'], answerIndex: 0, teach: 'Grief laid out A to Z — a deliberate shape imposed on something shapeless.' },
    { id: 'lamentations-4', prompt: 'Lamentations 3 says God’s mercies are new how often?', options: ['Every morning', 'Every Sabbath', 'Every year', 'Every generation'], answerIndex: 0, teach: 'The line "great is Your faithfulness" comes from the middle of the saddest book in the Bible.' },
    { id: 'lamentations-5', prompt: 'Which prophet is traditionally taken to be its author?', options: ['Jeremiah', 'Isaiah', 'Ezekiel', 'Daniel'], answerIndex: 0, teach: 'It sits right after his book for that reason, though the poems themselves name no one.' },
    { id: 'lamentations-6', prompt: 'Which event lies behind the book?', options: ['The destruction of Jerusalem by Babylon', 'The plagues of Egypt', 'The fall of Jericho', 'The famine in Samaria'], answerIndex: 0, teach: 'The temple burned, the wall came down, and the people were marched away. Lamentations is what was written afterwards.' },
  ],
  Ezekiel: [
    { id: 'ezekiel-1', prompt: 'What did Ezekiel see filling a valley, which then came to life?', options: ['Dry bones', 'Rusted chariots', 'Broken pots', 'Fallen cedars'], answerIndex: 0, teach: 'He was asked, "Son of man, can these bones live?" and answered, "O Lord GOD, You know."' },
    { id: 'ezekiel-2', prompt: 'Where was Ezekiel living when he prophesied?', options: ['Among the exiles in Babylon', 'In Jerusalem’s temple', 'In the wilderness of Judah', 'At the court of Egypt'], answerIndex: 0, teach: 'His first vision came by the Kebar River — the strange wheels and living creatures of chapter 1.' },
    { id: 'ezekiel-3', prompt: 'What was Ezekiel told to eat, which tasted as sweet as honey?', options: ['A scroll', 'A loaf of barley', 'A honeycomb', 'A handful of grain'], answerIndex: 0, teach: 'The scroll was covered on both sides with words of lament and mourning and woe — and still it tasted sweet.' },
    { id: 'ezekiel-4', prompt: 'Ezekiel promised God would replace a heart of stone with a heart of what?', options: ['Flesh', 'Fire', 'Gold', 'Light'], answerIndex: 0, teach: 'Along with a new spirit put within them — a promise made to people who had lost everything.' },
    { id: 'ezekiel-5', prompt: 'What title does God use for Ezekiel again and again?', options: ['Son of man', 'Servant of the LORD', 'Watchman of Judah', 'Friend of God'], answerIndex: 0, teach: 'Over ninety times. It means, roughly, "mortal" — a reminder of the distance between the two speakers.' },
    { id: 'ezekiel-6', prompt: 'What does the book of Ezekiel end with?', options: ['A vision of a new temple with a river flowing from it', 'The crowning of a king', 'A list of the returning exiles', 'A song of victory'], answerIndex: 0, teach: 'The river gets deeper the further it goes, and trees on both banks bear fruit every month.' },
  ],
  Daniel: [
    { id: 'daniel-1', prompt: 'Who was thrown into the lions’ den for praying?', options: ['Daniel', 'Shadrach', 'Mordecai', 'Nehemiah'], answerIndex: 0, teach: 'The law had been written so that even the king could not undo it. He fasted all night and ran to the den at dawn.' },
    { id: 'daniel-2', prompt: 'Which three men were thrown into the blazing furnace?', options: ['Shadrach, Meshach and Abednego', 'Ananias, Azariah and Michael', 'Eliab, Abinadab and Shammah', 'Gershom, Kohath and Merari'], answerIndex: 0, teach: 'Those were their Babylonian names. They had told the king that even if God did not rescue them, they would not bow.' },
    { id: 'daniel-3', prompt: 'What appeared during Belshazzar’s feast?', options: ['A hand writing on the wall', 'A pillar of fire', 'A voice from the ceiling', 'A rider on a white horse'], answerIndex: 0, teach: 'Mene, mene, tekel, upharsin. The king’s knees knocked together, and the city fell that same night.' },
    { id: 'daniel-4', prompt: 'What did Daniel and his friends ask to eat instead of the king’s food?', options: ['Vegetables and water', 'Bread and oil', 'Fish and figs', 'Barley and milk'], answerIndex: 0, teach: 'They asked for a ten-day trial, and at the end of it looked healthier than everybody on the royal menu.' },
    { id: 'daniel-5', prompt: 'Which king dreamed of a great statue of gold, silver, bronze and iron?', options: ['Nebuchadnezzar', 'Belshazzar', 'Darius', 'Cyrus'], answerIndex: 0, teach: 'He demanded that his wise men tell him the dream as well as its meaning — which is where Daniel comes in.' },
    { id: 'daniel-6', prompt: 'How many times a day did Daniel pray at his open window?', options: ['Three', 'Seven', 'Once', 'Twice'], answerIndex: 0, teach: 'He kept doing it exactly as before after the decree was signed, windows still open toward Jerusalem.' },
  ],
  // ————————————————————— Old Testament: the twelve —————————————————————————
  Hosea: [
    { id: 'hosea-1', prompt: 'What was Hosea told to do as a living picture of God and Israel?', options: ['Marry a wife who would be unfaithful to him', 'Live alone in the desert', 'Build an altar of unhewn stone', 'Go barefoot for three years'], answerIndex: 0, teach: 'The whole book is that marriage argued out loud — God as a husband who will not stop loving.' },
    { id: 'hosea-2', prompt: 'What was the name of Hosea’s wife?', options: ['Gomer', 'Gomorrah', 'Hagar', 'Zipporah'], answerIndex: 0, teach: 'Hosea later buys her back for silver and barley rather than letting her go.' },
    { id: 'hosea-3', prompt: 'Hosea’s children were given names that were messages. What did the last one mean?', options: ['Not My people', 'Man of sorrows', 'God is with us', 'Swift to the plunder'], answerIndex: 0, teach: 'Lo-ammi, "not My people" — and the book then reverses it: they will be called sons of the living God.' },
    { id: 'hosea-4', prompt: 'Hosea says God desires mercy and not what?', options: ['Sacrifice', 'Silver', 'Fasting', 'Songs'], answerIndex: 0, teach: 'Jesus quotes this line twice in Matthew, both times to people criticising who He was eating with.' },
    { id: 'hosea-5', prompt: 'Which kingdom was Hosea mainly speaking to?', options: ['The northern kingdom, Israel', 'The southern kingdom, Judah', 'Edom', 'Assyria'], answerIndex: 0, teach: 'He preached in its last decades, before Assyria swept it away for good.' },
    { id: 'hosea-6', prompt: 'What image does Hosea use for Israel’s loyalty, which vanishes early?', options: ['The morning mist and the early dew', 'A cracked cistern', 'A bent bow', 'Chaff on the threshing floor'], answerIndex: 0, teach: 'Gone by mid-morning — one of the gentlest and saddest lines in the prophets.' },
  ],
  Joel: [
    { id: 'joel-1', prompt: 'What disaster opens the book of Joel?', options: ['A plague of locusts', 'A siege', 'An earthquake', 'A flood'], answerIndex: 0, teach: 'Four waves of them, stripping the land bare — and Joel reads the ruin as a summons to turn back.' },
    { id: 'joel-2', prompt: 'Joel says God will restore the years that what had eaten?', options: ['The locusts', 'The fire', 'The sword', 'The famine'], answerIndex: 0, teach: 'One of the most quoted promises in the prophets, made to people standing in a stripped field.' },
    { id: 'joel-3', prompt: 'Joel tells the people to rend their hearts and not their what?', options: ['Garments', 'Banners', 'Altars', 'Scrolls'], answerIndex: 0, teach: 'Tearing your clothes was the public sign of grief. Joel asks for the thing the sign was supposed to stand for.' },
    { id: 'joel-4', prompt: 'Which promise from Joel did Peter quote on the day of Pentecost?', options: ['I will pour out My Spirit on all people', 'A virgin shall conceive', 'The stone the builders rejected', 'Out of Bethlehem shall come a ruler'], answerIndex: 0, teach: 'Sons and daughters prophesying, old men dreaming dreams — Peter said, this is what you are looking at.' },
    { id: 'joel-5', prompt: 'Which day does Joel warn is near?', options: ['The day of the LORD', 'The day of atonement', 'The day of trumpets', 'The day of rest'], answerIndex: 0, teach: 'Great and dreadful, and yet the same passage says everyone who calls on the name of the LORD will be saved.' },
    { id: 'joel-6', prompt: 'What does Joel call the people to hold in response?', options: ['A fast and a solemn assembly', 'A coronation', 'A census', 'A festival of lights'], answerIndex: 0, teach: 'Everyone summoned — elders, children, even the bride and groom out of their rooms.' },
  ],
  Amos: [
    { id: 'amos-1', prompt: 'What was Amos doing before he was called to prophesy?', options: ['Herding sheep and tending sycamore-fig trees', 'Serving in the temple', 'Copying scrolls', 'Commanding a garrison'], answerIndex: 0, teach: 'He says plainly that he was no prophet nor a prophet’s son — the LORD took him from following the flock.' },
    { id: 'amos-2', prompt: 'Amos says to let justice roll on like what?', options: ['A river, and righteousness like a never-failing stream', 'A fire through stubble', 'A storm off the sea', 'An army in ranks'], answerIndex: 0, teach: 'Quoted by Martin Luther King Jr. in Washington in 1963, and often since.' },
    { id: 'amos-3', prompt: 'What did Amos see the Lord standing beside, held against a wall?', options: ['A plumb line', 'A measuring rod', 'A drawn sword', 'A burning torch'], answerIndex: 0, teach: 'A tool that only ever answers one question: is this straight? Amos’s point is that the answer was no.' },
    { id: 'amos-4', prompt: 'Which priest told Amos to go home and prophesy in Judah instead?', options: ['Amaziah', 'Eli', 'Abiathar', 'Zadok'], answerIndex: 0, teach: 'He complained to the king that the land could not bear Amos’s words — a compliment he did not mean to pay.' },
    { id: 'amos-5', prompt: 'Whose comfort does Amos attack hardest?', options: ['The rich who trample the poor', 'The soldiers of the garrison', 'The foreign traders', 'The temple builders'], answerIndex: 0, teach: 'Ivory beds, fine music and the finest lotions, in a country where the needy were being sold for a pair of sandals.' },
    { id: 'amos-6', prompt: 'Which town did Amos come from?', options: ['Tekoa', 'Bethel', 'Gilgal', 'Samaria'], answerIndex: 0, teach: 'A southern shepherd sent north to preach at the royal sanctuary of another kingdom — an outsider by design.' },
  ],
  Obadiah: [
    { id: 'obadiah-1', prompt: 'What is unusual about the length of Obadiah?', options: ['It is the shortest book in the Old Testament', 'It is the longest of the prophets', 'It has no chapter divisions at all in Hebrew', 'It is written entirely as a letter'], answerIndex: 0, teach: 'One chapter, twenty-one verses. It takes about three minutes to read aloud.' },
    { id: 'obadiah-2', prompt: 'Which nation is the book of Obadiah addressed against?', options: ['Edom', 'Moab', 'Assyria', 'Philistia'], answerIndex: 0, teach: 'A neighbour, not a distant empire — which is what makes the charge sting.' },
    { id: 'obadiah-3', prompt: 'Edom was descended from which brother?', options: ['Esau', 'Ishmael', 'Lot', 'Reuben'], answerIndex: 0, teach: 'So the quarrel in this book is a family one, still running centuries after Jacob and Esau made peace.' },
    { id: 'obadiah-4', prompt: 'What was Edom’s offence?', options: ['Standing by and gloating while Jerusalem was plundered', 'Worshipping a golden idol', 'Breaking a treaty with Egypt', 'Refusing to pay tribute'], answerIndex: 0, teach: 'Obadiah lists it step by step: you looked on, you rejoiced, you entered the gate, you cut off the fugitives.' },
    { id: 'obadiah-5', prompt: 'Where does Obadiah say Edom lived, feeling untouchable?', options: ['In the clefts of the rock, high up', 'On the plains beyond the river', 'Among the marshes', 'Behind an iron gate'], answerIndex: 0, teach: 'Their cities were cut into cliffs. "Though you soar like the eagle, from there I will bring you down."' },
    { id: 'obadiah-6', prompt: 'What does Obadiah say has deceived Edom?', options: ['The pride of their heart', 'The word of false prophets', 'The gold of Tarshish', 'The counsel of Egypt'], answerIndex: 0, teach: 'It is the hinge of the whole book: everything Edom did followed from believing no one could reach them.' },
  ],
  Jonah: [
    { id: 'jonah-1', prompt: 'Which city was Jonah sent to?', options: ['Nineveh', 'Babylon', 'Tarshish', 'Damascus'], answerIndex: 0, teach: 'The capital of Assyria — the empire that had been terrorising his own people.' },
    { id: 'jonah-2', prompt: 'Where did Jonah try to sail instead?', options: ['Tarshish', 'Egypt', 'Cyprus', 'Joppa'], answerIndex: 0, teach: 'As far in the other direction as a ship could take him. He was asleep below deck when the storm hit.' },
    { id: 'jonah-3', prompt: 'How long was Jonah inside the great fish?', options: ['Three days and three nights', 'Seven days', 'One night', 'Forty days'], answerIndex: 0, teach: 'Jesus points back to this as a sign. Jonah prays a psalm from inside it, and the prayer is all past tense.' },
    { id: 'jonah-4', prompt: 'How did the people of Nineveh respond to Jonah’s message?', options: ['They repented, from the king down', 'They drove him out of the city', 'They ignored him entirely', 'They put him in prison'], answerIndex: 0, teach: 'The king came down off his throne and sat in ashes, and even the animals were put in sackcloth.' },
    { id: 'jonah-5', prompt: 'What grew up to shade Jonah and then withered overnight?', options: ['A plant', 'A fig tree', 'A cedar', 'A tent of reeds'], answerIndex: 0, teach: 'He was happier about the plant than about a city being spared, which is exactly the point God makes.' },
    { id: 'jonah-6', prompt: 'How does the book of Jonah end?', options: ['With a question from God that is never answered', 'With Jonah preaching again', 'With the city destroyed', 'With Jonah returning home'], answerIndex: 0, teach: '"Should I not have compassion on that great city?" The reader is left holding it.' },
  ],
  Micah: [
    { id: 'micah-1', prompt: 'Which small town did Micah name as the birthplace of a coming ruler?', options: ['Bethlehem', 'Nazareth', 'Hebron', 'Shiloh'], answerIndex: 0, teach: 'The chief priests quote this verse to Herod when the wise men come asking where the child is.' },
    { id: 'micah-2', prompt: 'Micah 6:8 says the LORD requires you to act justly, love mercy, and do what?', options: ['Walk humbly with your God', 'Keep the feasts of the year', 'Offer the firstborn', 'Build an altar of stone'], answerIndex: 0, teach: 'It is the answer to a question about how many offerings would be enough — thousands of rams? Rivers of oil?' },
    { id: 'micah-3', prompt: 'Micah pictures nations beating their swords into what?', options: ['Plowshares', 'Ropes', 'Chains', 'Coins'], answerIndex: 0, teach: 'And spears into pruning hooks, each person sitting under their own vine and fig tree, with nobody to frighten them.' },
    { id: 'micah-4', prompt: 'Which better-known prophet was Micah’s contemporary?', options: ['Isaiah', 'Jeremiah', 'Ezekiel', 'Elijah'], answerIndex: 0, teach: 'The two share the swords-into-plowshares passage almost word for word.' },
    { id: 'micah-5', prompt: 'Which two capitals does Micah open by naming?', options: ['Samaria and Jerusalem', 'Nineveh and Babylon', 'Bethel and Dan', 'Tyre and Sidon'], answerIndex: 0, teach: 'North and south together — he tells both that the rot has reached the capital.' },
    { id: 'micah-6', prompt: 'What does the name Micah itself mean?', options: ['Who is like the LORD?', 'The LORD saves', 'Gift of God', 'Comfort'], answerIndex: 0, teach: 'And he ends the book by asking it: "Who is a God like You, who pardons sin?"' },
  ],
  Nahum: [
    { id: 'nahum-1', prompt: 'Which city’s fall does Nahum announce?', options: ['Nineveh', 'Jerusalem', 'Babylon', 'Tyre'], answerIndex: 0, teach: 'The same city that repented in Jonah — about a century and a half earlier.' },
    { id: 'nahum-2', prompt: 'Nineveh was the capital of which empire?', options: ['Assyria', 'Babylon', 'Persia', 'Egypt'], answerIndex: 0, teach: 'The superpower that had already destroyed the northern kingdom of Israel and besieged Jerusalem.' },
    { id: 'nahum-3', prompt: 'Nahum 1:7 says the LORD is good, and is what in the day of trouble?', options: ['A stronghold', 'A lamp', 'A shepherd', 'A witness'], answerIndex: 0, teach: 'He knows those who take refuge in Him — one quiet verse in a book of thunder.' },
    { id: 'nahum-4', prompt: 'What does the name Nahum mean?', options: ['Comfort', 'Judgement', 'Watchman', 'Servant'], answerIndex: 0, teach: 'A strange name for so fierce a book — until you remember who was being comforted, and by whose downfall.' },
    { id: 'nahum-5', prompt: 'How does Nahum describe the attack on the city?', options: ['Chariots racing madly through the streets', 'A silent siege lasting years', 'A plague emptying the houses', 'An earthquake at midnight'], answerIndex: 0, teach: 'It is written like an eyewitness report of something that had not happened yet — whips cracking, wheels jolting.' },
    { id: 'nahum-6', prompt: 'What happened to Nineveh in the end?', options: ['It fell and was never rebuilt', 'It surrendered and paid tribute', 'It repented a second time', 'It was abandoned peacefully'], answerIndex: 0, teach: 'It fell in 612 BC and vanished so completely that later travellers walked over the mound without knowing.' },
  ],
  Habakkuk: [
    { id: 'habakkuk-1', prompt: 'What is unusual about the shape of Habakkuk?', options: ['It is a dialogue — the prophet argues with God', 'It is written as a letter', 'It has no author named anywhere', 'It is a single unbroken poem'], answerIndex: 0, teach: 'He complains, God answers, he complains about the answer — and the book takes his questions seriously throughout.' },
    { id: 'habakkuk-2', prompt: 'Which nation did God say He was raising up, to Habakkuk’s horror?', options: ['The Babylonians', 'The Egyptians', 'The Philistines', 'The Persians'], answerIndex: 0, teach: 'Habakkuk had asked why the wicked go unpunished. The answer was worse than the question.' },
    { id: 'habakkuk-3', prompt: 'Habakkuk 2:4 says the righteous shall live by his what?', options: ['Faith', 'Works', 'Wisdom', 'Strength'], answerIndex: 0, teach: 'Quoted in Romans, Galatians and Hebrews — one line from a small book that shaped a great deal of what came after.' },
    { id: 'habakkuk-4', prompt: 'Where did Habakkuk say he would stand to wait for God’s answer?', options: ['At his watchpost on the ramparts', 'In the temple courts', 'By the city gate', 'On the mountain'], answerIndex: 0, teach: 'He waits like a sentry — and says he will see what God answers concerning his complaint.' },
    { id: 'habakkuk-5', prompt: 'What was Habakkuk told to do with the vision he was given?', options: ['Write it plainly on tablets, so a runner could read it', 'Seal it until the end', 'Tell it only to the priests', 'Sing it at the festival'], answerIndex: 0, teach: 'Large and legible, like a sign by the road — because the appointed time was still a way off.' },
    { id: 'habakkuk-6', prompt: 'How does Habakkuk end?', options: ['With a song saying he will rejoice even if the harvest fails', 'With the fall of Jerusalem', 'With God refusing to answer', 'With a list of the kings of Judah'], answerIndex: 0, teach: 'Though the fig tree does not bud and there are no sheep in the pen — yet I will rejoice. Nothing had improved.' },
  ],
  Zephaniah: [
    { id: 'zephaniah-1', prompt: 'Which coming day does Zephaniah announce again and again?', options: ['The day of the LORD', 'The day of atonement', 'The day of the harvest', 'The day of rest'], answerIndex: 0, teach: 'Great and near and hurrying — the phrase that a medieval hymn, the Dies Irae, was later built on.' },
    { id: 'zephaniah-2', prompt: 'During which king’s reign did Zephaniah prophesy?', options: ['Josiah', 'Hezekiah', 'Ahaz', 'Manasseh'], answerIndex: 0, teach: 'Probably before Josiah’s great reforms — the preaching may well have helped bring them on.' },
    { id: 'zephaniah-3', prompt: 'Zephaniah 3:17 says God will quiet you with His love and do what over you?', options: ['Rejoice with singing', 'Build a wall', 'Send an angel', 'Write your name'], answerIndex: 0, teach: 'God singing over His people, in a book that spends two chapters describing wreckage.' },
    { id: 'zephaniah-4', prompt: 'Whom does Zephaniah tell to seek the LORD, and seek humility?', options: ['The humble of the land', 'The priests of the temple', 'The captains of the army', 'The merchants of the coast'], answerIndex: 0, teach: 'Perhaps you will be sheltered — the whole hope of the book, offered without a guarantee attached.' },
    { id: 'zephaniah-5', prompt: 'To which king does Zephaniah trace his own ancestry in verse 1?', options: ['Hezekiah', 'David', 'Solomon', 'Josiah'], answerIndex: 0, teach: 'Four generations, which is an unusually long pedigree for a prophet — he may have been of royal blood.' },
    { id: 'zephaniah-6', prompt: 'What does Zephaniah promise God will finally do with the scattered?', options: ['Gather them and bring them home', 'Number them for judgement', 'Leave them among the nations', 'Send them further away'], answerIndex: 0, teach: 'The last words of the book are about restoring their fortunes before their very eyes.' },
  ],
  Haggai: [
    { id: 'haggai-1', prompt: 'What did Haggai urge the returned exiles to get on with?', options: ['Rebuilding the temple', 'Rebuilding the city wall', 'Crowning a king', 'Copying the Law'], answerIndex: 0, teach: 'Work had stalled for years. Within three weeks of his first sermon, the building site was busy again.' },
    { id: 'haggai-2', prompt: 'What were the people busy with instead?', options: ['Their own panelled houses', 'Trading with Egypt', 'Fortifying the gates', 'Digging new wells'], answerIndex: 0, teach: '"Is it a time for you yourselves to be living in panelled houses, while this house remains a ruin?"' },
    { id: 'haggai-3', prompt: 'Which two leaders did Haggai address by name?', options: ['Zerubbabel the governor and Joshua the high priest', 'Ezra and Nehemiah', 'Cyrus and Darius', 'Sanballat and Tobiah'], answerIndex: 0, teach: 'Zechariah was preaching to the same two men at the same time — the books are dated to the same few months.' },
    { id: 'haggai-4', prompt: 'What did Haggai say about wages earned in those years?', options: ['They were put into a purse with holes in it', 'They were buried in the field', 'They were paid in foreign coin', 'They were taken by the tax collector'], answerIndex: 0, teach: 'Sowing much and harvesting little, eating without being filled — a diagnosis of a whole national mood.' },
    { id: 'haggai-5', prompt: 'What did Haggai promise about the glory of the new temple?', options: ['It would be greater than that of the former house', 'It would equal the tabernacle', 'It would last a thousand years', 'It would be hidden from the nations'], answerIndex: 0, teach: 'Said to old men who had wept because the new foundation looked so small next to the one they remembered.' },
    { id: 'haggai-6', prompt: 'How long is the book of Haggai?', options: ['Two chapters', 'Seven chapters', 'One chapter', 'Twelve chapters'], answerIndex: 0, teach: 'Four dated messages delivered in under four months — one of the most precisely timed books in the Bible.' },
  ],
  Zechariah: [
    { id: 'zechariah-1', prompt: 'Zechariah 9 pictures a king coming to Jerusalem riding on what?', options: ['A donkey, on a colt', 'A white horse', 'A chariot of gold', 'The shoulders of his men'], answerIndex: 0, teach: 'All four Gospels have Palm Sunday in mind against this verse — righteous and victorious, and lowly.' },
    { id: 'zechariah-2', prompt: 'Zechariah says it is not by might nor by power, but by what?', options: ['My Spirit, says the LORD of hosts', 'The sword of Judah', 'The wisdom of kings', 'The strength of Lebanon'], answerIndex: 0, teach: 'Spoken to Zerubbabel beside a vision of a golden lampstand fed by two olive trees.' },
    { id: 'zechariah-3', prompt: 'Which prophet was Zechariah working alongside?', options: ['Haggai', 'Malachi', 'Amos', 'Nahum'], answerIndex: 0, teach: 'Ezra names them both as the two who got the temple finished.' },
    { id: 'zechariah-4', prompt: 'How does the first half of Zechariah mostly deliver its message?', options: ['Through a series of night visions', 'Through letters to the exiles', 'Through a courtroom trial', 'Through a travel diary'], answerIndex: 0, teach: 'Eight of them in one night — horsemen among myrtle trees, a flying scroll, a woman in a basket, four chariots.' },
    { id: 'zechariah-5', prompt: 'What sum of silver is weighed out and thrown to the potter in Zechariah 11?', options: ['Thirty pieces', 'Twenty pieces', 'A hundred pieces', 'Three talents'], answerIndex: 0, teach: 'Matthew quotes this passage when Judas throws the money back down in the temple.' },
    { id: 'zechariah-6', prompt: 'What was Zechariah encouraging the people to finish?', options: ['The rebuilding of the temple', 'The wall of Jerusalem', 'The reading of the Law', 'The census of the returned'], answerIndex: 0, teach: 'His visions are all aimed at one stalled building site, and at two discouraged men leading it.' },
  ],
  Malachi: [
    { id: 'malachi-1', prompt: 'Where does Malachi sit in the Old Testament?', options: ['It is the last book', 'It is the first of the prophets', 'It is in the middle of the twelve', 'It comes before Isaiah'], answerIndex: 0, teach: 'After it, the Old Testament stops — and the New opens with a messenger in the wilderness, exactly as Malachi said.' },
    { id: 'malachi-2', prompt: 'What kind of animals were being brought to the altar, to Malachi’s disgust?', options: ['Blind, lame and diseased ones', 'Animals bought from foreigners', 'Firstborn of the flock', 'Animals too young to wean'], answerIndex: 0, teach: '"Try offering them to your governor," he says. "Would he be pleased with you?"' },
    { id: 'malachi-3', prompt: 'What does Malachi 3 invite the people to bring into the storehouse, and test God in it?', options: ['The whole tithe', 'The morning sacrifice', 'The firstborn son', 'A freewill offering'], answerIndex: 0, teach: 'It is the one place in the Bible where God says to put Him to the test — over whether generosity comes back.' },
    { id: 'malachi-4', prompt: 'Who does Malachi say will be sent before the great day of the LORD?', options: ['Elijah the prophet', 'Moses the lawgiver', 'David the king', 'Melchizedek the priest'], answerIndex: 0, teach: 'A cup is still set for Elijah at the Passover table. The Gospels connect the promise to John the Baptist.' },
    { id: 'malachi-5', prompt: 'How is most of Malachi structured?', options: ['As a running argument, with the people answering back', 'As a temple liturgy', 'As a king’s decree', 'As a travel account'], answerIndex: 0, teach: 'God says something, the people reply "How have we done that?", and God answers in detail. Six times over.' },
    { id: 'malachi-6', prompt: 'What does the name Malachi mean?', options: ['My messenger', 'The LORD reigns', 'Comfort of God', 'Servant of the LORD'], answerIndex: 0, teach: 'Which is also the word used in chapter 3 for the one who is to come — the book may be named for its own theme.' },
  ],
  // ————————————————————— New Testament: the Gospels and Acts ———————————————
  // The four Gospels carry eight apiece rather than six (as Psalms does above):
  // they hold the most verses in the pool, so those books come up as the daily
  // drop most often, and a thin set would repeat itself soonest there.
  Matthew: [
    { id: 'matthew-1', prompt: 'How does the Gospel of Matthew open?', options: ['With a genealogy of Jesus', 'With John the Baptist preaching', 'With the words "In the beginning"', 'With the empty tomb'], answerIndex: 0, teach: 'It traces the line from Abraham through David — and names four women, three of them foreigners.' },
    { id: 'matthew-2', prompt: 'Who followed a star to find the child Jesus?', options: ['Wise men from the east', 'Shepherds from the hills', 'Priests from the temple', 'Fishermen from Galilee'], answerIndex: 0, teach: 'Matthew never says how many there were. The traditional three comes from counting the gifts.' },
    { id: 'matthew-3', prompt: 'What are the opening lines of the Sermon on the Mount called?', options: ['The Beatitudes', 'The Magnificat', 'The Benedictus', 'The Lord’s Prayer'], answerIndex: 0, teach: 'Nine "blessed are" sayings, beginning with the poor in spirit and ending with the persecuted.' },
    { id: 'matthew-4', prompt: 'Which king tried to kill the infant Jesus?', options: ['Herod', 'Pilate', 'Caesar Augustus', 'Archelaus'], answerIndex: 0, teach: 'Warned in a dream, Joseph took the family to Egypt — so Matthew can say a son was called out of Egypt again.' },
    { id: 'matthew-5', prompt: 'What was Matthew’s job when Jesus called him?', options: ['Tax collector', 'Fisherman', 'Carpenter', 'Tentmaker'], answerIndex: 0, teach: 'He got up from the booth and left it. The next scene is a dinner at his house full of the wrong sort of people.' },
    { id: 'matthew-6', prompt: 'How does Matthew’s Gospel end?', options: ['With the command to go and make disciples of all nations', 'With the ascension from Bethany', 'With Peter’s denial', 'With the road to Emmaus'], answerIndex: 0, teach: 'On a mountain in Galilee — and Matthew adds, honestly, that some of them doubted.' },
    { id: 'matthew-7', prompt: 'In Matthew 25, on what basis are the sheep separated from the goats?', options: ['Whether they fed, clothed and visited the least of these', 'Whether they kept the Sabbath', 'Whether they tithed', 'Whether they had been baptised'], answerIndex: 0, teach: 'Both groups are surprised. Neither had noticed who they were really dealing with.' },
    { id: 'matthew-8', prompt: 'Which prayer does Jesus teach in the Sermon on the Mount?', options: ['The Lord’s Prayer', 'The Shema', 'The prayer of Jabez', 'The Magnificat'], answerIndex: 0, teach: 'Given as a corrective to long public prayers — "your Father knows what you need before you ask him".' },
  ],
  Mark: [
    { id: 'mark-1', prompt: 'What is distinctive about Mark among the four Gospels?', options: ['It is the shortest', 'It is the longest', 'It has no account of the crucifixion', 'It is written as a letter'], answerIndex: 0, teach: 'Sixteen fast chapters. Most scholars think it was written first, and that Matthew and Luke both used it.' },
    { id: 'mark-2', prompt: 'Which word does Mark use over and over to hurry the story along?', options: ['Immediately', 'Behold', 'Verily', 'Therefore'], answerIndex: 0, teach: 'Around forty times. The Gospel reads like someone telling you what happened before they run out of breath.' },
    { id: 'mark-3', prompt: 'Who does Mark begin his Gospel with?', options: ['John the Baptist in the wilderness', 'Mary and the angel', 'Adam', 'The wise men'], answerIndex: 0, teach: 'No birth story at all — Mark starts with a voice shouting in the desert and a man in camel’s hair.' },
    { id: 'mark-4', prompt: 'Mark 10:45 says the Son of Man came not to be served but to serve, and to give His life as what?', options: ['A ransom for many', 'A light to the nations', 'A sign to Israel', 'A seal of the covenant'], answerIndex: 0, teach: 'Said straight after two disciples asked for the best seats in the kingdom.' },
    { id: 'mark-5', prompt: 'Who said at the cross, "Truly this man was the Son of God"?', options: ['A Roman centurion', 'Peter', 'Joseph of Arimathea', 'Nicodemus'], answerIndex: 0, teach: 'The first human being in Mark to say it plainly — and he was on the execution detail.' },
    { id: 'mark-6', prompt: 'Whose preaching does tradition say lies behind Mark’s Gospel?', options: ['Peter’s', 'Paul’s', 'James’s', 'John’s'], answerIndex: 0, teach: 'Which may explain why Peter comes off so badly in it — the failures are told without softening.' },
    { id: 'mark-7', prompt: 'What did four friends do to get a paralysed man to Jesus?', options: ['Dug through the roof and lowered him down', 'Carried him through the night', 'Sent word by a servant', 'Hired a boat'], answerIndex: 0, teach: 'Mark says Jesus saw *their* faith. The homeowner’s reaction is not recorded.' },
    { id: 'mark-8', prompt: 'What did Jesus say to the storm on the lake?', options: ['Peace, be still', 'Rise and walk', 'Let it be done', 'Go, and sin no more'], answerIndex: 0, teach: 'He had been asleep on a cushion in the stern. The disciples asked whether He cared that they were drowning.' },
  ],
  Luke: [
    { id: 'luke-1', prompt: 'What was Luke’s profession, according to Colossians?', options: ['A physician', 'A tentmaker', 'A tax collector', 'A fisherman'], answerIndex: 0, teach: 'Paul calls him "the beloved physician". He is also the only Gentile author in the New Testament.' },
    { id: 'luke-2', prompt: 'To whom are Luke’s Gospel and Acts both addressed?', options: ['Theophilus', 'Timothy', 'Titus', 'Philemon'], answerIndex: 0, teach: 'The name means "lover of God". Luke says he wrote so this man could be certain of what he had been taught.' },
    { id: 'luke-3', prompt: 'Which of these parables is found only in Luke?', options: ['The good Samaritan', 'The sower', 'The mustard seed', 'The wicked tenants'], answerIndex: 0, teach: 'The prodigal son, the rich man and Lazarus, and the persistent widow are all his alone too.' },
    { id: 'luke-4', prompt: 'What is Mary’s song of praise in Luke 1 called?', options: ['The Magnificat', 'The Te Deum', 'The Gloria', 'The Nunc Dimittis'], answerIndex: 0, teach: 'It is about thrones being pulled down and the hungry being fed — sung by a teenager from a country town.' },
    { id: 'luke-5', prompt: 'What does Luke say he did before writing his Gospel?', options: ['Carefully investigated everything from the beginning', 'Received it in a vision', 'Copied it from Matthew', 'Wrote down Peter’s sermons'], answerIndex: 0, teach: 'He says many others had already drawn up accounts — and that he had spoken to eyewitnesses himself.' },
    { id: 'luke-6', prompt: 'Which second book did the author of Luke go on to write?', options: ['Acts', 'Hebrews', 'Revelation', '1 Peter'], answerIndex: 0, teach: 'Together they are about a quarter of the whole New Testament — more than Paul wrote.' },
    { id: 'luke-7', prompt: 'Who were the first to be told of Jesus’ birth in Luke’s account?', options: ['Shepherds in the fields', 'Wise men from the east', 'The priests of the temple', 'Herod’s household'], answerIndex: 0, teach: 'Night-shift workers with a poor reputation. Luke does this kind of thing on purpose all the way through.' },
    { id: 'luke-8', prompt: 'On which road did two disciples walk with the risen Jesus without recognising Him?', options: ['The road to Emmaus', 'The road to Damascus', 'The road to Jericho', 'The road to Gaza'], answerIndex: 0, teach: 'They knew Him when He broke the bread — and then said their hearts had been burning the whole walk.' },
  ],
  John: [
    { id: 'john-1', prompt: 'How does the Gospel of John begin?', options: ['In the beginning was the Word', 'The book of the genealogy of Jesus Christ', 'The beginning of the gospel of Jesus Christ', 'Many have undertaken to draw up an account'], answerIndex: 0, teach: 'Deliberately echoing the first words of Genesis, and reaching back before the manger entirely.' },
    { id: 'john-2', prompt: 'What was the first sign Jesus performed in John’s Gospel?', options: ['Turning water into wine at Cana', 'Feeding the five thousand', 'Healing a blind man', 'Walking on water'], answerIndex: 0, teach: 'Six stone water jars at a wedding, filled to the brim, and the best wine served last.' },
    { id: 'john-3', prompt: 'Which Pharisee came to Jesus by night?', options: ['Nicodemus', 'Gamaliel', 'Joseph of Arimathea', 'Simon'], answerIndex: 0, teach: 'He turns up twice more — arguing for due process, and bringing spices to the tomb.' },
    { id: 'john-4', prompt: 'Which of these is one of John’s "I am" sayings?', options: ['I am the good shepherd', 'I am the son of David', 'I am the rock', 'I am the first and the last'], answerIndex: 0, teach: 'Seven of them: the bread of life, the light of the world, the door, the good shepherd, the resurrection, the way, the true vine.' },
    { id: 'john-5', prompt: 'What is the shortest verse in most English Bibles, found in John 11?', options: ['Jesus wept', 'God is love', 'Pray without ceasing', 'Rejoice always'], answerIndex: 0, teach: 'At Lazarus’ tomb — and He wept knowing exactly what He was about to do.' },
    { id: 'john-6', prompt: 'Which disciple said he would not believe until he saw the nail marks?', options: ['Thomas', 'Philip', 'Andrew', 'Nathanael'], answerIndex: 0, teach: 'A week later he was invited to do exactly that, and answered, "My Lord and my God."' },
    { id: 'john-7', prompt: 'What did Jesus do for the disciples at the last supper in John 13?', options: ['Washed their feet', 'Anointed their heads', 'Wrote their names down', 'Gave them each a lamp'], answerIndex: 0, teach: 'The job of the lowest servant in the house. Peter tried to refuse it and was told he would have no part with Him.' },
    { id: 'john-8', prompt: 'Which woman did Jesus meet at a well in Samaria?', options: ['A Samaritan woman who had had five husbands', 'Mary Magdalene', 'Martha of Bethany', 'Salome'], answerIndex: 0, teach: 'The longest recorded conversation Jesus has with anybody — and she went and told the whole town.' },
  ],
  Acts: [
    { id: 'acts-1', prompt: 'What happened at Pentecost in Acts 2?', options: ['A sound like wind, tongues of fire, and every language heard', 'A blinding light on the road', 'An earthquake in the prison', 'A vision of a sheet let down from heaven'], answerIndex: 0, teach: 'The crowd’s first theory was that the disciples were drunk. Peter pointed out it was only nine in the morning.' },
    { id: 'acts-2', prompt: 'Who was the first Christian martyr?', options: ['Stephen', 'James', 'Peter', 'Barnabas'], answerIndex: 0, teach: 'He was stoned while a young man named Saul stood watching the coats.' },
    { id: 'acts-3', prompt: 'On which road was Saul struck blind and converted?', options: ['The road to Damascus', 'The road to Emmaus', 'The road to Joppa', 'The Appian Way'], answerIndex: 0, teach: 'He was carrying letters authorising arrests. Three days later a frightened disciple named Ananias came and called him brother.' },
    { id: 'acts-4', prompt: 'In which city were the disciples first called Christians?', options: ['Antioch', 'Jerusalem', 'Rome', 'Corinth'], answerIndex: 0, teach: 'It seems to have started as an outsiders’ nickname — "the Christ people".' },
    { id: 'acts-5', prompt: 'Who travelled with Paul on his first missionary journey?', options: ['Barnabas', 'Timothy', 'Luke', 'Titus'], answerIndex: 0, teach: 'They fell out later over whether to take John Mark again, and parted ways.' },
    { id: 'acts-6', prompt: 'How does the book of Acts end?', options: ['With Paul in Rome, preaching under guard', 'With Paul’s execution', 'With Peter’s release from prison', 'With the fall of Jerusalem'], answerIndex: 0, teach: 'Two whole years at his own expense, welcoming everyone who came — and the last word in Greek means "unhindered".' },
  ],
  // ————————————————————— New Testament: Paul’s letters ——————————————————————
  Romans: [
    { id: 'romans-1', prompt: 'Had Paul visited Rome when he wrote this letter?', options: ['No — he was writing to a church he had never met', 'Yes, twice before', 'Yes, he had founded it', 'He wrote it from a Roman prison'], answerIndex: 0, teach: 'He says he has longed to come for years, and hopes they will help him on to Spain afterwards.' },
    { id: 'romans-2', prompt: 'Romans 3:23 says all have sinned and fall short of what?', options: ['The glory of God', 'The law of Moses', 'The promise of Abraham', 'The kingdom of heaven'], answerIndex: 0, teach: 'The whole first three chapters are an argument that this leaves nobody with anything to boast about.' },
    { id: 'romans-3', prompt: 'Romans 8 says that in all things God works for the good of whom?', options: ['Those who love Him, called according to His purpose', 'The strong in faith', 'The children of Abraham', 'Those who keep the commandments'], answerIndex: 0, teach: 'The same chapter ends by listing everything that cannot separate us from that love, and finding nothing.' },
    { id: 'romans-4', prompt: 'Romans 12 asks believers to offer their bodies as what?', options: ['A living sacrifice', 'A holy temple', 'A drink offering', 'A sealed letter'], answerIndex: 0, teach: 'Paul calls it their true and proper worship — the pivot where the letter turns from argument to daily life.' },
    { id: 'romans-5', prompt: 'Who is commended at the end of Romans, and is generally thought to have carried the letter?', options: ['Phoebe', 'Priscilla', 'Junia', 'Lydia'], answerIndex: 0, teach: 'Chapter 16 greets around thirty people by name, and a striking number of them are women.' },
    { id: 'romans-6', prompt: 'Which Old Testament figure does Paul use as his main example of faith?', options: ['Abraham', 'Moses', 'David', 'Elijah'], answerIndex: 0, teach: 'Because Abraham was credited with righteousness before the law existed and before he was circumcised.' },
  ],
  '1 Corinthians': [
    { id: '1corinthians-1', prompt: 'What is 1 Corinthians 13 about?', options: ['Love', 'The resurrection', 'The Lord’s Supper', 'Spiritual gifts'], answerIndex: 0, teach: 'Read at weddings, written to a church that was suing each other and dividing over favourite preachers.' },
    { id: '1corinthians-2', prompt: 'What was one of the first problems Paul tackles in the letter?', options: ['Divisions over which leader people followed', 'Persecution by the governor', 'A famine in the city', 'False reports of Paul’s death'], answerIndex: 0, teach: '"I follow Paul", "I follow Apollos" — and Paul’s answer is that he is glad he baptised hardly any of them.' },
    { id: '1corinthians-3', prompt: 'What does Paul compare the church to in chapter 12?', options: ['A body with many parts', 'A field of wheat', 'A ship at sea', 'A city on a hill'], answerIndex: 0, teach: 'The eye cannot say to the hand, "I don’t need you" — and the parts that seem weakest are indispensable.' },
    { id: '1corinthians-4', prompt: 'What is 1 Corinthians 15 chiefly about?', options: ['The resurrection', 'Marriage', 'Food offered to idols', 'Head coverings'], answerIndex: 0, teach: 'Paul lists who saw the risen Jesus, including more than five hundred at once, most of them still alive to ask.' },
    { id: '1corinthians-5', prompt: 'In which country was Corinth?', options: ['Greece', 'Turkey', 'Italy', 'Syria'], answerIndex: 0, teach: 'A wealthy port with traffic in both directions across the isthmus — and a reputation to match.' },
    { id: '1corinthians-6', prompt: 'What does Paul say he passed on to them concerning the Lord’s Supper?', options: ['What he had himself received', 'A new rule of his own', 'The custom of the Jerusalem church', 'A vision he had been given'], answerIndex: 0, teach: 'It is the earliest written account of that night we have — older than any of the four Gospels.' },
  ],
  '2 Corinthians': [
    { id: '2corinthians-1', prompt: 'What did Paul call the affliction he asked God three times to remove?', options: ['A thorn in the flesh', 'A yoke on the neck', 'A stone in the path', 'A cloud over the eyes'], answerIndex: 0, teach: 'The answer was no: "My grace is sufficient for you, for My power is made perfect in weakness."' },
    { id: '2corinthians-2', prompt: 'Paul says we hold this treasure in what?', options: ['Jars of clay', 'Cedar chests', 'Woven baskets', 'Iron boxes'], answerIndex: 0, teach: 'So that the surpassing power belongs to God and not to us — cheap pottery, priceless contents.' },
    { id: '2corinthians-3', prompt: 'What does 2 Corinthians 9 say God loves?', options: ['A cheerful giver', 'A quiet worshipper', 'A faithful teacher', 'A patient servant'], answerIndex: 0, teach: 'It comes from two whole chapters about a collection Paul was gathering for the poor in Jerusalem.' },
    { id: '2corinthians-4', prompt: 'What does Paul say anyone in Christ has become?', options: ['A new creation', 'A living stone', 'An heir of Abraham', 'A citizen of Rome'], answerIndex: 0, teach: 'The old has gone, the new has come — and with it the job of reconciliation, handed on.' },
    { id: '2corinthians-5', prompt: 'What does Paul list at length to defend his ministry?', options: ['His sufferings — beatings, shipwrecks, hunger', 'His visions and revelations only', 'The churches he founded', 'His schooling under Gamaliel'], answerIndex: 0, teach: 'Five floggings, three shipwrecks, a night and a day in the open sea. He calls it boasting in his weakness.' },
    { id: '2corinthians-6', prompt: 'Whom is Paul answering back in this letter, with heavy irony?', options: ['Rival teachers he calls "super-apostles"', 'The governor of Achaia', 'The elders in Jerusalem', 'The synagogue at Ephesus'], answerIndex: 0, teach: 'They seem to have said he was impressive in his letters and unimpressive in person. He quotes them saying it.' },
  ],
  Galatians: [
    { id: 'galatians-1', prompt: 'What is Paul arguing for throughout Galatians?', options: ['That people are put right with God by faith, not by keeping the law', 'That the law should be abolished', 'That Gentiles should not be admitted', 'That elders should be appointed in every town'], answerIndex: 0, teach: 'The presenting question was whether Gentile believers had to be circumcised. Paul says the gospel itself is at stake.' },
    { id: 'galatians-2', prompt: 'Which apostle did Paul oppose to his face at Antioch?', options: ['Peter', 'James', 'John', 'Barnabas'], answerIndex: 0, teach: 'Peter had stopped eating with Gentiles when certain men arrived — and Paul says even Barnabas was carried along.' },
    { id: 'galatians-3', prompt: 'Which of these is part of the fruit of the Spirit in Galatians 5?', options: ['Patience', 'Wisdom', 'Courage', 'Knowledge'], answerIndex: 0, teach: 'Love, joy, peace, patience, kindness, goodness, faithfulness, gentleness, self-control — one fruit, nine flavours.' },
    { id: 'galatians-4', prompt: 'Galatians 3:28 says there is neither Jew nor Greek, slave nor free, male nor female, for you are all what?', options: ['One in Christ Jesus', 'Heirs of Abraham', 'Children of promise', 'Citizens of heaven'], answerIndex: 0, teach: 'Three divisions that structured the whole ancient world, named and set aside in one sentence.' },
    { id: 'galatians-5', prompt: 'What is unusual about the opening of Galatians?', options: ['There is no thanksgiving — Paul goes straight to being astonished', 'It has no greeting at all', 'It names no author', 'It is addressed to one person'], answerIndex: 0, teach: 'Every other letter of his opens by thanking God for the readers. Here he says, "I am astonished."' },
    { id: 'galatians-6', prompt: 'Galatians 2:20 says, "I have been crucified with Christ, and I no longer live, but…"', options: ['Christ lives in me', 'the law lives in me', 'I live for the Spirit', 'I am free from all men'], answerIndex: 0, teach: 'The rest of the verse: the life I now live in the body, I live by faith in the Son of God who loved me.' },
  ],
  Ephesians: [
    { id: 'ephesians-1', prompt: 'What does Ephesians 6 tell believers to put on?', options: ['The full armour of God', 'A crown of righteousness', 'A robe of white', 'The yoke of Christ'], answerIndex: 0, teach: 'Belt, breastplate, shoes, shield, helmet, sword — possibly written while Paul was chained to a soldier wearing them.' },
    { id: 'ephesians-2', prompt: 'Ephesians 2:8 says it is by grace you have been saved, through faith — and this is what?', options: ['The gift of God, not from yourselves', 'The reward of the diligent', 'The inheritance of Israel', 'The seal of the covenant'], answerIndex: 0, teach: 'Not by works, so that no one can boast — and the very next verse says we are His workmanship.' },
    { id: 'ephesians-3', prompt: 'Where was Paul when he wrote Ephesians?', options: ['In prison', 'In Corinth', 'On a ship to Rome', 'In Jerusalem'], answerIndex: 0, teach: 'He calls himself the prisoner of Christ Jesus. Philippians, Colossians and Philemon come from the same confinement.' },
    { id: 'ephesians-4', prompt: 'Which piece of the armour of God is the sword?', options: ['The Spirit, which is the word of God', 'Faith', 'Righteousness', 'Salvation'], answerIndex: 0, teach: 'The only piece on the list used for anything but defence — and it is the one you have to know to use.' },
    { id: 'ephesians-5', prompt: 'What does Ephesians 2 say Christ has destroyed between Jew and Gentile?', options: ['The dividing wall of hostility', 'The veil of the temple', 'The debt of the law', 'The record of sins'], answerIndex: 0, teach: 'A real wall in the temple courts kept Gentiles out on pain of death. Paul says it has come down.' },
    { id: 'ephesians-6', prompt: 'Ephesians 4 lists one body, one Spirit, one hope, one Lord, one faith, and one what?', options: ['Baptism', 'Table', 'Covenant', 'Kingdom'], answerIndex: 0, teach: 'Seven "ones" in three verses, ending with one God and Father of all.' },
  ],
  Philippians: [
    { id: 'philippians-1', prompt: 'Which word runs through Philippians despite Paul’s circumstances?', options: ['Joy', 'Sorrow', 'Warning', 'Judgement'], answerIndex: 0, teach: 'Some form of "rejoice" appears more than a dozen times in four short chapters, written from custody.' },
    { id: 'philippians-2', prompt: 'What does the hymn in Philippians 2 say Christ did?', options: ['Emptied Himself and took the form of a servant', 'Ascended above the heavens', 'Judged the nations', 'Sealed the covenant'], answerIndex: 0, teach: 'Obedient to death, even death on a cross — and therefore given the name above every name.' },
    { id: 'philippians-3', prompt: 'Philippians 4:13 says, "I can do all things through…"', options: ['Him who strengthens me', 'the faith of Abraham', 'the Spirit of truth', 'the grace of God'], answerIndex: 0, teach: 'The context is contentment: Paul has just said he has learned to live with plenty and with nothing.' },
    { id: 'philippians-4', prompt: 'Which two women does Paul urge to agree with each other?', options: ['Euodia and Syntyche', 'Mary and Martha', 'Lydia and Priscilla', 'Tryphena and Tryphosa'], answerIndex: 0, teach: 'He says they contended at his side for the gospel — a disagreement between two good people, named in scripture forever.' },
    { id: 'philippians-5', prompt: 'What does Philippians 4 say to do instead of being anxious?', options: ['Present your requests to God by prayer, with thanksgiving', 'Wait quietly for the morning', 'Confess it to the elders', 'Fast for three days'], answerIndex: 0, teach: 'And the peace that follows is described as standing guard over your heart and mind, like a soldier at a post.' },
    { id: 'philippians-6', prompt: 'How had the Philippians helped Paul, which the letter thanks them for?', options: ['They sent him a gift while he was in need', 'They hid him from the authorities', 'They wrote to the governor', 'They freed him from prison'], answerIndex: 0, teach: 'Epaphroditus carried it and nearly died on the trip. Much of the letter is a thank-you note.' },
  ],
  Colossians: [
    { id: 'colossians-1', prompt: 'What does Colossians 1 call Christ?', options: ['The image of the invisible God, firstborn over all creation', 'The lion of the tribe of Judah', 'The bright morning star', 'The lamb who was slain'], answerIndex: 0, teach: 'In Him all things hold together — the whole letter is an argument that nothing needs adding to Him.' },
    { id: 'colossians-2', prompt: 'What does Paul warn the Colossians against being taken captive by?', options: ['Hollow and deceptive philosophy', 'The sword of Rome', 'False reports about him', 'The teaching of Apollos'], answerIndex: 0, teach: 'Along with rules about food, festivals and new moons — shadows, he says, of something that has already arrived.' },
    { id: 'colossians-3', prompt: 'Colossians 3 says to set your minds on what?', options: ['Things above, not on earthly things', 'The needs of the poor', 'The teaching of the elders', 'The day of judgement'], answerIndex: 0, teach: 'What follows is startlingly practical: clothe yourselves with compassion, kindness, humility, gentleness and patience.' },
    { id: 'colossians-4', prompt: 'Had Paul been to Colossae himself?', options: ['Apparently not — Epaphras had taught them', 'Yes, he founded the church', 'Yes, he wintered there', 'He passed through on the way to Rome'], answerIndex: 0, teach: 'He says they have not met him face to face, and he is writing about a church he knows only by report.' },
    { id: 'colossians-5', prompt: 'Which runaway slave is sent back in the closing greetings, tying this letter to Philemon?', options: ['Onesimus', 'Tychicus', 'Epaphras', 'Archippus'], answerIndex: 0, teach: 'Paul calls him "our faithful and dear brother, who is one of you" — a careful sentence, written on purpose.' },
    { id: 'colossians-6', prompt: 'How does Colossians describe Luke in its final greetings?', options: ['The beloved physician', 'The faithful scribe', 'Our brother from Antioch', 'The keeper of the accounts'], answerIndex: 0, teach: 'It is the only place in the Bible that tells us what Luke did for a living.' },
  ],
  '1 Thessalonians': [
    { id: '1thessalonians-1', prompt: 'What question about the future was troubling the Thessalonians?', options: ['What happens to believers who have already died', 'Whether to pay Roman taxes', 'Whether Gentiles must be circumcised', 'Who should lead the church'], answerIndex: 0, teach: 'Paul answers that they will not miss anything — the dead in Christ will rise first.' },
    { id: '1thessalonians-2', prompt: '1 Thessalonians 5 says to rejoice always, give thanks in all circumstances, and pray how?', options: ['Without ceasing', 'In the temple', 'With fasting', 'At the third hour'], answerIndex: 0, teach: 'Three commands in three short verses, and the letter calls all of them God’s will for you.' },
    { id: '1thessalonians-3', prompt: 'How did Paul support himself while he was with them?', options: ['He worked night and day so as not to burden anyone', 'He was supported by the synagogue', 'He was funded by the church in Jerusalem', 'He lived on gifts from Rome'], answerIndex: 0, teach: 'He describes it as working with his own hands — Acts says his trade was tentmaking.' },
    { id: '1thessalonians-4', prompt: 'What does Paul say will accompany the Lord’s coming in chapter 4?', options: ['A loud command, the voice of an archangel and the trumpet of God', 'A silence in heaven', 'A great earthquake', 'A scroll opened in the sky'], answerIndex: 0, teach: 'He ends the passage not with a warning but with an instruction: encourage one another with these words.' },
    { id: '1thessalonians-5', prompt: 'In which country was Thessalonica?', options: ['Greece', 'Turkey', 'Egypt', 'Italy'], answerIndex: 0, teach: 'The capital of the Roman province of Macedonia, on the main road east to west. It is still a city today.' },
    { id: '1thessalonians-6', prompt: 'What is generally said about the date of this letter?', options: ['It is one of the earliest books in the New Testament', 'It is the last thing Paul wrote', 'It was written after the fall of Jerusalem', 'It was written before the Gospels of Matthew and Luke only'], answerIndex: 0, teach: 'Probably around AD 50 — earlier than any of the Gospels, and within about twenty years of the crucifixion.' },
  ],
  '2 Thessalonians': [
    { id: '2thessalonians-1', prompt: 'What false report had unsettled the church?', options: ['That the day of the Lord had already come', 'That Paul had died', 'That Jerusalem had fallen', 'That Timothy had been arrested'], answerIndex: 0, teach: 'Possibly spread by a forged letter in Paul’s name, which is why he points out his own handwriting at the end.' },
    { id: '2thessalonians-2', prompt: 'Who does Paul say must be revealed before that day comes?', options: ['The man of lawlessness', 'The false prophet', 'The angel of the abyss', 'The rider on the pale horse'], answerIndex: 0, teach: 'Paul says he told them this in person, and seems mildly exasperated at having to write it down.' },
    { id: '2thessalonians-3', prompt: 'What rule does Paul give about those refusing to work?', options: ['If anyone is unwilling to work, let him not eat', 'Let them be put out of the church', 'Let the elders support them', 'Let them keep silent in the assembly'], answerIndex: 0, teach: 'Some had apparently stopped working because they thought the end had arrived. Paul reminds them he paid his own way.' },
    { id: '2thessalonians-4', prompt: 'How does Paul mark his letters as genuinely his?', options: ['With a greeting in his own handwriting', 'With the seal of the church at Antioch', 'With Timothy as a witness', 'With a quotation from the Law'], answerIndex: 0, teach: 'He says it is the distinguishing mark in all his letters — which suggests a scribe wrote most of the rest.' },
    { id: '2thessalonians-5', prompt: 'What does Paul urge them to stand firm and hold to?', options: ['The teachings passed on to them', 'The commandments of Moses', 'The customs of their fathers', 'The counsel of the elders'], answerIndex: 0, teach: 'Whether by word of mouth or by letter — both counted, in a world where few could read either.' },
    { id: '2thessalonians-6', prompt: 'What does the letter tell the church to do about those who are idle?', options: ['Warn them as brothers, not treat them as enemies', 'Report them to the elders', 'Send them away from the city', 'Say nothing and let it pass'], answerIndex: 0, teach: 'Even the sharpest discipline in the letter is fenced by that instruction.' },
  ],
  '1 Timothy': [
    { id: '1timothy-1', prompt: 'Where had Paul left Timothy when he wrote this letter?', options: ['Ephesus', 'Crete', 'Corinth', 'Philippi'], answerIndex: 0, teach: 'To stop certain people teaching strange doctrines — a young man left holding a difficult job.' },
    { id: '1timothy-2', prompt: '1 Timothy says the love of money is a root of what?', options: ['All kinds of evil', 'Every quarrel', 'The fall of kings', 'Idolatry alone'], answerIndex: 0, teach: 'Often misquoted as "money is the root of all evil". The verse before says godliness with contentment is great gain.' },
    { id: '1timothy-3', prompt: 'What does Paul tell Timothy about his age?', options: ['Let no one look down on him for being young', 'That he should wait until he is thirty', 'That he should defer to the elders in all things', 'That youth is no excuse for error'], answerIndex: 0, teach: 'Instead, set an example — in speech, in conduct, in love, in faith and in purity.' },
    { id: '1timothy-4', prompt: 'What does 1 Timothy 3 set out?', options: ['Qualifications for overseers and deacons', 'The order of the church’s services', 'Rules for the collection', 'A list of approved teachers'], answerIndex: 0, teach: 'Almost all of it is about character rather than ability — hospitable, gentle, not quarrelsome, good with their own family.' },
    { id: '1timothy-5', prompt: 'What practical advice does Paul give Timothy about his health?', options: ['To take a little wine for his stomach', 'To fast twice a week', 'To travel less', 'To sleep before midnight'], answerIndex: 0, teach: 'One of the small human details that makes these letters feel like real post between two people.' },
    { id: '1timothy-6', prompt: '1 Timothy is one of three letters usually grouped together. What are they called?', options: ['The Pastoral Epistles', 'The Prison Epistles', 'The Catholic Epistles', 'The Captivity Letters'], answerIndex: 0, teach: '1 and 2 Timothy and Titus — written to individuals leading churches rather than to the churches themselves.' },
  ],
  '2 Timothy': [
    { id: '2timothy-1', prompt: 'What is 2 Timothy generally thought to be?', options: ['The last surviving letter Paul wrote', 'His first letter', 'A circular sent to several churches', 'A letter written before his conversion'], answerIndex: 0, teach: 'He says the time of his departure has come — and asks Timothy to hurry, and to come before winter.' },
    { id: '2timothy-2', prompt: '2 Timothy 3:16 says all Scripture is what?', options: ['God-breathed and useful for teaching', 'Sealed until the end', 'Given to the elders', 'Written for the Jews first'], answerIndex: 0, teach: 'For teaching, rebuking, correcting and training in righteousness — a working tool, not an ornament.' },
    { id: '2timothy-3', prompt: 'Which line near the end of 2 Timothy sums up Paul’s life?', options: ['I have fought the good fight, I have finished the race, I have kept the faith', 'To live is Christ and to die is gain', 'I am the least of the apostles', 'I press on toward the goal'], answerIndex: 0, teach: 'Written from a cell, by a man who expected to be executed shortly, and was.' },
    { id: '2timothy-4', prompt: 'Who does Paul say first taught Timothy the faith?', options: ['His grandmother Lois and his mother Eunice', 'The elders at Lystra', 'Barnabas', 'Paul himself'], answerIndex: 0, teach: 'Acts adds that his father was Greek. Paul says he has known the Scriptures since infancy.' },
    { id: '2timothy-5', prompt: 'What does Paul ask Timothy to bring with him?', options: ['His cloak, and the scrolls and parchments', 'A letter of introduction', 'Money for the journey', 'A physician'], answerIndex: 0, teach: 'The cloak had been left at Troas. It is one of the most human requests in the New Testament.' },
    { id: '2timothy-6', prompt: 'Who does Paul say deserted him, "because he loved this world"?', options: ['Demas', 'Titus', 'Tychicus', 'Crescens'], answerIndex: 0, teach: 'The same Demas is greeted warmly as a fellow worker in two earlier letters. Only Luke was still with him.' },
  ],
  Titus: [
    { id: 'titus-1', prompt: 'On which island had Paul left Titus?', options: ['Crete', 'Cyprus', 'Malta', 'Patmos'], answerIndex: 0, teach: 'To put in order what was left unfinished, and to appoint elders in every town.' },
    { id: 'titus-2', prompt: 'What was Titus’s main task there?', options: ['Appointing elders in every town', 'Collecting money for Jerusalem', 'Delivering a letter to Rome', 'Recording the names of believers'], answerIndex: 0, teach: 'The letter then spends most of a chapter on what sort of person is fit for the job.' },
    { id: 'titus-3', prompt: 'Whom does Paul quote when describing the Cretans?', options: ['One of their own prophets', 'The Roman governor', 'A Jewish teacher', 'A ship’s captain'], answerIndex: 0, teach: 'The line about Cretans is a quotation, not Paul’s own coinage — he is turning their own proverb back on them.' },
    { id: 'titus-4', prompt: 'What does Titus 2 say the grace of God teaches?', options: ['To say no to ungodliness and live self-controlled lives', 'To keep the feasts', 'To separate from the world entirely', 'To submit to the synagogue'], answerIndex: 0, teach: 'Grace as a teacher rather than a loophole — the letter’s central move.' },
    { id: 'titus-5', prompt: 'What does Titus say to avoid?', options: ['Foolish controversies, genealogies and quarrels about the law', 'All contact with Gentiles', 'Travel by sea', 'Reading the prophets'], answerIndex: 0, teach: 'Because they are unprofitable and useless — the reason given is practical, not doctrinal.' },
    { id: 'titus-6', prompt: 'How long is the letter to Titus?', options: ['Three chapters', 'One chapter', 'Six chapters', 'Twelve chapters'], answerIndex: 0, teach: 'Short enough to read aloud in about eight minutes, and it still finds room for a note about a lawyer named Zenas.' },
  ],
  Philemon: [
    { id: 'philemon-1', prompt: 'How long is the letter to Philemon?', options: ['A single chapter — the shortest of Paul’s letters', 'Two chapters', 'Four chapters', 'Six chapters'], answerIndex: 0, teach: 'Twenty-five verses, and the most personal thing Paul wrote that we still have.' },
    { id: 'philemon-2', prompt: 'On whose behalf is Paul writing?', options: ['Onesimus, a runaway slave', 'Timothy, a young leader', 'Epaphras, a fellow prisoner', 'Archippus, a soldier'], answerIndex: 0, teach: 'He had met him in prison, and calls him "my very heart" — a man he is sending back at real risk.' },
    { id: 'philemon-3', prompt: 'What does the name Onesimus mean, which Paul plays on in the letter?', options: ['Useful', 'Beloved', 'Faithful', 'Free'], answerIndex: 0, teach: '"Once useless to you, but now useful both to you and to me." Paul is making a joke and an argument at once.' },
    { id: 'philemon-4', prompt: 'What does Paul ask Philemon to do?', options: ['Welcome him back no longer as a slave but as a dear brother', 'Sell him to Paul', 'Say nothing about the matter', 'Send him to Rome'], answerIndex: 0, teach: 'He says he could order it, and deliberately does not — he would rather it be voluntary.' },
    { id: 'philemon-5', prompt: 'What does Paul offer about anything Onesimus owes?', options: ['To pay it back himself, in his own hand', 'To ask the church to cover it', 'To have it forgiven by the elders', 'To settle it when he next visits'], answerIndex: 0, teach: 'Then he adds, gently, that Philemon owes him his very self — the letter is a masterclass in persuasion.' },
    { id: 'philemon-6', prompt: 'Where was Paul writing from?', options: ['Prison', 'Corinth', 'Antioch', 'The house of Lydia'], answerIndex: 0, teach: 'He calls himself a prisoner of Christ Jesus, and asks Philemon to keep a guest room ready anyway.' },
  ],
  // ————————————————— New Testament: the general letters and Revelation ——————
  Hebrews: [
    { id: 'hebrews-1', prompt: 'What is unusual about the authorship of Hebrews?', options: ['No author is named anywhere in it', 'It names three authors', 'It was written by a Roman official', 'It is signed by Peter'], answerIndex: 0, teach: 'It has been attributed to Paul, Barnabas, Apollos and Priscilla among others. Nobody knows.' },
    { id: 'hebrews-2', prompt: 'What is Hebrews 11 known as?', options: ['The roll call of faith', 'The hymn of love', 'The armour chapter', 'The shepherd psalm'], answerIndex: 0, teach: 'Abel, Enoch, Noah, Abraham, Sarah, Moses, Rahab — and then a rush of names it says there is no time to tell.' },
    { id: 'hebrews-3', prompt: 'Which mysterious Old Testament priest-king does Hebrews compare Jesus to?', options: ['Melchizedek', 'Aaron', 'Eli', 'Zadok'], answerIndex: 0, teach: 'He appears in three verses of Genesis and one psalm, and Hebrews builds two whole chapters on him.' },
    { id: 'hebrews-4', prompt: 'Hebrews 4:12 says the word of God is living and active, and sharper than what?', options: ['Any double-edged sword', 'The finest gold', 'A potter’s knife', 'A serpent’s tooth'], answerIndex: 0, teach: 'Dividing soul and spirit, joints and marrow — it judges the thoughts and attitudes of the heart.' },
    { id: 'hebrews-5', prompt: 'What does Hebrews 12 say surrounds us as we run our race?', options: ['A great cloud of witnesses', 'A wall of fire', 'A host of angels', 'A crowd of accusers'], answerIndex: 0, teach: 'It follows straight on from chapter 11 — the witnesses are the people whose stories have just been told.' },
    { id: 'hebrews-6', prompt: 'Hebrews 13 says that by showing hospitality to strangers, some people have done what without knowing?', options: ['Entertained angels', 'Sheltered prophets', 'Fed the poor of Israel', 'Housed a king'], answerIndex: 0, teach: 'A nod back to Abraham at the oaks of Mamre, feeding three visitors he had never met.' },
  ],
  James: [
    { id: 'james-1', prompt: 'Which James is traditionally taken to be the author?', options: ['The brother of Jesus, who led the church in Jerusalem', 'James the son of Zebedee', 'James the son of Alphaeus', 'James the father of Judas'], answerIndex: 0, teach: 'He introduces himself simply as a servant of God and of the Lord Jesus Christ — no mention of the family connection.' },
    { id: 'james-2', prompt: 'What does James say about faith without deeds?', options: ['It is dead', 'It is small', 'It is young', 'It is hidden'], answerIndex: 0, teach: 'His example is telling a cold, hungry person to keep warm and eat well, and giving them nothing.' },
    { id: 'james-3', prompt: 'What does James compare the tongue to?', options: ['A small spark that sets a forest ablaze', 'A locked door', 'A cracked jar', 'A bent arrow'], answerIndex: 0, teach: 'And to a ship’s rudder and a horse’s bit — small things steering something much larger.' },
    { id: 'james-4', prompt: 'What does James 1 call religion that God accepts as pure?', options: ['Looking after orphans and widows, and keeping oneself unpolluted', 'Fasting twice a week', 'Attending the assembly', 'Reciting the Law daily'], answerIndex: 0, teach: 'A definition of religion with no ritual in it at all — which is very much the tone of the whole letter.' },
    { id: 'james-5', prompt: 'What does James warn against in chapter 2?', options: ['Showing favouritism to the rich in the assembly', 'Eating with Gentiles', 'Teaching without permission', 'Praying in public'], answerIndex: 0, teach: 'Gold ring and fine clothes get the good seat; shabby clothes get "sit on the floor by my feet".' },
    { id: 'james-6', prompt: 'What does James say to do if you lack wisdom?', options: ['Ask God, who gives generously without finding fault', 'Consult the elders', 'Wait for a dream', 'Search the Scriptures alone'], answerIndex: 0, teach: 'It sits in the middle of a passage about trials — wisdom is what he assumes you will be short of.' },
  ],
  '1 Peter': [
    { id: '1peter-1', prompt: 'How does 1 Peter address its readers?', options: ['As exiles scattered among the nations', 'As elders of the church', 'As the households of Caesar', 'As the twelve tribes'], answerIndex: 0, teach: 'Strangers in the world — the letter’s whole pastoral strategy grows out of that one image.' },
    { id: '1peter-2', prompt: 'What is the main subject of 1 Peter?', options: ['Suffering, and how to live well through it', 'Church government', 'The end of the world', 'Food laws'], answerIndex: 0, teach: 'Do not be surprised at the fiery ordeal, he says — as though it were something strange happening to you.' },
    { id: '1peter-3', prompt: 'What does 1 Peter say to do with your anxiety?', options: ['Cast it on Him, because He cares for you', 'Bear it quietly', 'Confess it to the church', 'Fast until it passes'], answerIndex: 0, teach: 'The verse before is about humbling yourself. Peter treats worry and pride as the same problem.' },
    { id: '1peter-4', prompt: 'What does 1 Peter compare the devil to?', options: ['A roaring lion looking for someone to devour', 'A thief in the night', 'A wolf among sheep', 'A serpent in the grass'], answerIndex: 0, teach: 'And the response prescribed is to resist, standing firm in the faith — not to run.' },
    { id: '1peter-5', prompt: 'What does 1 Peter 2 call believers?', options: ['A chosen people, a royal priesthood, a holy nation', 'Soldiers of the covenant', 'Heirs of Abraham', 'Servants of the Most High'], answerIndex: 0, teach: 'Every title once given to Israel at Sinai, handed to a scattered group of mostly Gentile converts.' },
    { id: '1peter-6', prompt: 'What does 1 Peter tell believers to always be prepared to give?', options: ['A reason for the hope they have, with gentleness and respect', 'An account of their giving', 'A defence before the governor', 'A blessing to their household'], answerIndex: 0, teach: 'The gentleness and respect are part of the instruction, not a footnote to it.' },
  ],
  '2 Peter': [
    { id: '2peter-1', prompt: 'What is 2 Peter mainly warning about?', options: ['False teachers inside the church', 'Roman persecution', 'A coming famine', 'Division over circumcision'], answerIndex: 0, teach: 'Springs without water, mists driven by a storm — the imagery is all of things that promise and do not deliver.' },
    { id: '2peter-2', prompt: 'What does 2 Peter say about a day with the Lord?', options: ['A day is like a thousand years, and a thousand years like a day', 'A day is set and cannot be moved', 'No day is known but the last', 'Each day is judged on its own'], answerIndex: 0, teach: 'The point is an answer to scoffers asking why nothing has happened yet.' },
    { id: '2peter-3', prompt: 'Why does 2 Peter say God is waiting?', options: ['He is patient, not wanting anyone to perish', 'The temple is not yet rebuilt', 'The gospel has not reached Spain', 'The angels are not ready'], answerIndex: 0, teach: 'What looks like slowness, the letter argues, is actually mercy running longer than expected.' },
    { id: '2peter-4', prompt: 'What does 2 Peter say about Paul’s letters?', options: ['They contain some things that are hard to understand', 'They should be read only by elders', 'They have all been lost', 'They were written for Gentiles alone'], answerIndex: 0, teach: 'And it puts them alongside "the other Scriptures" — an early sign of how they were already being regarded.' },
    { id: '2peter-5', prompt: 'What does the writer say he was an eyewitness of?', options: ['Christ’s majesty on the sacred mountain', 'The empty tomb', 'The ascension', 'The day of Pentecost'], answerIndex: 0, teach: 'The transfiguration — and he says the voice from heaven is something he heard with his own ears.' },
    { id: '2peter-6', prompt: 'How does 2 Peter say the day of the Lord will come?', options: ['Like a thief', 'With a trumpet at dawn', 'After three signs', 'When the gospel reaches every nation'], answerIndex: 0, teach: 'The question it draws out is practical: since it will, what sort of people ought you to be?' },
  ],
  '1 John': [
    { id: '1john-1', prompt: 'Which three-word statement about God does 1 John make twice?', options: ['God is love', 'God is holy', 'God is just', 'God is near'], answerIndex: 0, teach: 'And it draws a hard conclusion from it: whoever does not love does not know God.' },
    { id: '1john-2', prompt: '1 John also says God is light, and in Him is what?', options: ['No darkness at all', 'A consuming fire', 'The fullness of glory', 'The beginning of wisdom'], answerIndex: 0, teach: 'Walking in the light is then defined, surprisingly, as fellowship with one another.' },
    { id: '1john-3', prompt: 'What does 1 John 1:9 promise if we confess our sins?', options: ['He is faithful and just to forgive and cleanse us', 'The elders will absolve us', 'Our names will be written again', 'We will be given a new name'], answerIndex: 0, teach: 'The words "faithful and just" are doing the work — the promise rests on God’s character, not on the quality of the confession.' },
    { id: '1john-4', prompt: 'What does 1 John say perfect love drives out?', options: ['Fear', 'Doubt', 'Anger', 'Shame'], answerIndex: 0, teach: 'Because fear has to do with punishment — a sentence written to people worried about where they stand.' },
    { id: '1john-5', prompt: 'What does 1 John call believers, and marvel that they should be so called?', options: ['Children of God', 'Friends of the bridegroom', 'Heirs of the promise', 'Servants of the light'], answerIndex: 0, teach: '"And that is what we are!" — the exclamation is in the text.' },
    { id: '1john-6', prompt: 'What test does 1 John give for recognising a true teacher?', options: ['Whether they acknowledge that Jesus came in the flesh', 'Whether they can work miracles', 'Whether they were sent from Jerusalem', 'Whether they refuse payment'], answerIndex: 0, teach: 'The people it is warning about seem to have taught that Jesus only appeared to be human.' },
  ],
  '2 John': [
    { id: '2john-1', prompt: 'How long is 2 John?', options: ['Thirteen verses', 'Two chapters', 'Five chapters', 'A single verse'], answerIndex: 0, teach: 'About the length of a single sheet of papyrus, which may be exactly why it stops where it does.' },
    { id: '2john-2', prompt: 'Who is 2 John addressed to?', options: ['The chosen lady and her children', 'Gaius', 'The elders at Ephesus', 'Demetrius'], answerIndex: 0, teach: 'Possibly a woman and her household, possibly a church described affectionately as one. Readers have argued about it for centuries.' },
    { id: '2john-3', prompt: 'What does the author call himself?', options: ['The elder', 'The apostle', 'The servant', 'The witness'], answerIndex: 0, teach: '3 John opens exactly the same way — the two letters look like a matching pair.' },
    { id: '2john-4', prompt: 'What does 2 John warn about welcoming?', options: ['Deceivers who deny Jesus came in the flesh', 'Tax collectors', 'Travellers from Rome', 'Anyone who asks for money'], answerIndex: 0, teach: 'In a world where teachers travelled and stayed with families, a bed and a meal were an endorsement.' },
    { id: '2john-5', prompt: 'Which command does the letter say is not new, but from the beginning?', options: ['That we love one another', 'That we keep the Sabbath', 'That we honour the elders', 'That we confess our sins'], answerIndex: 0, teach: 'Almost every paragraph of the three letters of John comes back to it.' },
    { id: '2john-6', prompt: 'Why does the writer say he would rather not use paper and ink?', options: ['He hopes to visit and speak face to face', 'The ink is running out', 'The letter might be intercepted', 'His eyes are failing'], answerIndex: 0, teach: '"So that our joy may be complete" — a good reason to keep a letter short.' },
  ],
  '3 John': [
    { id: '3john-1', prompt: 'Who is 3 John written to?', options: ['Gaius', 'Diotrephes', 'Demetrius', 'Philemon'], answerIndex: 0, teach: 'The writer says nothing gives him greater joy than to hear that his children are walking in the truth.' },
    { id: '3john-2', prompt: 'Who is criticised for loving to be first and refusing to welcome the brothers?', options: ['Diotrephes', 'Gaius', 'Demetrius', 'Alexander'], answerIndex: 0, teach: 'He was even putting out of the church those who did welcome them — a very early church dispute, preserved in full.' },
    { id: '3john-3', prompt: 'Who is spoken well of by everyone in the letter?', options: ['Demetrius', 'Diotrephes', 'Timothy', 'Tychicus'], answerIndex: 0, teach: 'He may well have been the person carrying the letter — a reference in the hand of the man it describes.' },
    { id: '3john-4', prompt: 'What is Gaius commended for?', options: ['Hospitality to travelling teachers who were strangers to him', 'His preaching', 'His giving to the poor in Jerusalem', 'His knowledge of the Scriptures'], answerIndex: 0, teach: 'The letter says sending them on their way in a manner worthy of God makes you a fellow worker for the truth.' },
    { id: '3john-5', prompt: 'What does the writer say to imitate?', options: ['What is good, not what is evil', 'The elders of Jerusalem', 'The faith of the fathers', 'The patience of Job'], answerIndex: 0, teach: 'A single line of advice, dropped between two named men, one of whom had just failed the test.' },
    { id: '3john-6', prompt: 'What does the writer call himself, as in 2 John?', options: ['The elder', 'The apostle', 'The overseer', 'The teacher'], answerIndex: 0, teach: 'Both letters also end the same way — hoping to come soon, and speak face to face.' },
  ],
  Jude: [
    { id: 'jude-1', prompt: 'How does Jude describe himself?', options: ['A servant of Jesus Christ and a brother of James', 'An apostle of the circumcision', 'An elder of Jerusalem', 'A prophet of the Most High'], answerIndex: 0, teach: 'Which almost certainly makes him another brother of Jesus — and he does not mention that either.' },
    { id: 'jude-2', prompt: 'What did Jude say he had meant to write about instead?', options: ['The salvation they shared', 'The return of Christ', 'The collection for Jerusalem', 'His travel plans'], answerIndex: 0, teach: 'He changed the letter because of an urgent problem — and says so openly in the third verse.' },
    { id: 'jude-3', prompt: 'Which archangel does Jude say disputed with the devil about the body of Moses?', options: ['Michael', 'Gabriel', 'Raphael', 'Uriel'], answerIndex: 0, teach: 'Jude’s point is restraint: even Michael did not dare bring a slanderous accusation.' },
    { id: 'jude-4', prompt: 'Which images does Jude use for the false teachers?', options: ['Clouds without rain and wandering stars', 'Wolves in the fold and thieves at night', 'Dry bones and broken cisterns', 'Chaff and stubble'], answerIndex: 0, teach: 'Also shepherds who feed only themselves, and autumn trees without fruit, uprooted twice over.' },
    { id: 'jude-5', prompt: 'How long is the letter of Jude?', options: ['Twenty-five verses in a single chapter', 'Three chapters', 'One chapter of sixty verses', 'Two chapters'], answerIndex: 0, teach: 'It has a great deal in common with 2 Peter — the two letters clearly know the same material.' },
    { id: 'jude-6', prompt: 'How does Jude end?', options: ['With a doxology to Him who is able to keep you from stumbling', 'With a list of greetings', 'With a warning of judgement', 'With a request for money'], answerIndex: 0, teach: 'One of the best-known blessings in the Bible, at the end of one of its least-read books.' },
  ],
  Revelation: [
    { id: 'revelation-1', prompt: 'On which island was John when he received the revelation?', options: ['Patmos', 'Crete', 'Cyprus', 'Malta'], answerIndex: 0, teach: 'A small Aegean island. He says he was there "because of the word of God and the testimony of Jesus".' },
    { id: 'revelation-2', prompt: 'How many churches receive letters at the start of Revelation?', options: ['Seven', 'Twelve', 'Three', 'Ten'], answerIndex: 0, teach: 'Ephesus, Smyrna, Pergamum, Thyatira, Sardis, Philadelphia and Laodicea — all real cities on one postal route.' },
    { id: 'revelation-3', prompt: 'Seven is the number Revelation keeps returning to. Which of these comes in sevens?', options: ['The seals, trumpets and bowls', 'The horsemen', 'The witnesses', 'The thrones'], answerIndex: 0, teach: 'Seven churches, lampstands, spirits, seals, trumpets, bowls — the book counts in sevens almost throughout.' },
    { id: 'revelation-4', prompt: 'What is released by the first four seals?', options: ['Four horsemen', 'Four winds', 'Four angels of the abyss', 'Four living creatures'], answerIndex: 0, teach: 'A white horse, a red, a black and a pale one — the pale rider is the only one the text names.' },
    { id: 'revelation-5', prompt: 'How is the New Jerusalem described as it comes down out of heaven?', options: ['As a bride beautifully dressed for her husband', 'As a city of iron', 'As a mountain of glass', 'As a garden restored'], answerIndex: 0, teach: 'And the book notes what it does not contain: no temple, because God and the Lamb are its temple.' },
    { id: 'revelation-6', prompt: 'What does Revelation 21 say God will wipe away?', options: ['Every tear from their eyes', 'Every name from the book', 'Every debt owed', 'Every stain from their robes'], answerIndex: 0, teach: 'No more death or mourning or crying or pain, for the old order of things has passed away.' },
  ],
}

// --- selection ---------------------------------------------------------------

// A local Fisher–Yates rather than the one in `questions.ts`: both are three
// lines, and exporting one across the two files only to share it would put a
// data module in the import path of the generator that reads it.
function shuffled<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Books that have trivia, in `BIBLE_BOOKS` order. */
export function triviaBooks(): string[] {
  return BIBLE_BOOKS.filter((b) => (BOOK_TRIVIA[b]?.length ?? 0) > 0)
}

/** Every question this build knows about, for the checker and the round builder. */
export function allTrivia(): { book: string; q: TriviaQuestion }[] {
  return triviaBooks().flatMap((book) => (BOOK_TRIVIA[book] ?? []).map((q) => ({ book, q })))
}

/**
 * Turn a stored trivia entry into a runnable `Question`.
 *
 * The options are shuffled against the run's rng so the answer isn't parked in
 * the same slot every time, while the same seed still lays them out identically
 * on both phones in a live battle.
 */
export function asQuestion(t: TriviaQuestion, rng: () => number, book: string): Question {
  const correct = t.options[t.answerIndex]
  const options = shuffled(t.options, rng)
  return {
    prompt: t.prompt,
    options,
    answerIndex: options.indexOf(correct),
    teach: t.teach,
    bonus: book,
  }
}

/**
 * One bonus question about `book`, or null if this build has none for it.
 *
 * **NOT CURRENTLY WIRED.** The daily drop used to end on one of these; it now
 * asks five questions about the verse and nothing else, and trivia has rounds
 * of its own instead (`/play/trivia`, `/study/trivia`, and the battle mode).
 * Kept because it is the only thing that builds a single bonus question, so
 * putting one back is a line rather than a rewrite — and because nothing about
 * it is stale: `asQuestion` below is live and `BOOK_TRIVIA` is the same data
 * the rounds draw from.
 *
 * If it is rewired, it must be appended AFTER the verse questions are drawn,
 * exactly as `generateQuestions` used to do it. That ordering is what let the
 * bonus be added and removed without re-dealing a single historic run.
 *
 * Null is a real answer, not a failure: a caller falls back to a verse
 * question, so a book the catalog has never heard of degrades to the run the
 * app has always had. Fail closed, per entry.
 */
export function bonusTriviaFor(book: string, rng: () => number): Question | null {
  const pool = BOOK_TRIVIA[book]
  if (!pool || pool.length === 0) return null
  return asQuestion(pool[Math.floor(rng() * pool.length)], rng, book)
}

/**
 * A whole round of trivia about one book — what the library lends.
 *
 * With `book` null it draws across every book, which is the "any book" round.
 * Distinct by id: `MIN_TRIVIA_PER_BOOK` is what guarantees a single-book round
 * can be filled without asking the same question twice.
 */
export function triviaRoundFor(book: string | null, rng: () => number, n = 5): Question[] {
  const scoped = book ? (BOOK_TRIVIA[book] ?? []).map((q) => ({ book, q })) : allTrivia()
  const pool = scoped.length ? scoped : allTrivia()
  return shuffled(pool, rng)
    .slice(0, n)
    .map(({ q, book: b }) => asQuestion(q, rng, b))
}

// --- integrity ---------------------------------------------------------------

/**
 * Assert the things that don't throw.
 *
 * A duplicate id, a prompt containing its own answer, three options where there
 * should be four — none of it breaks a render, it just quietly makes a question
 * broken or free. Called at import in dev (below) and re-derived independently
 * by `scripts/check-trivia.mjs`, which is what runs in `npm run build`.
 */
export function checkTriviaData(): string[] {
  const problems: string[] = []
  const seen = new Set<string>()

  for (const book of Object.keys(BOOK_TRIVIA)) {
    if (!BIBLE_BOOKS.includes(book)) {
      problems.push(`trivia: "${book}" is not a book name used by the verse pool`)
    }
    const list = BOOK_TRIVIA[book] ?? []
    if (list.length < MIN_TRIVIA_PER_BOOK) {
      problems.push(`trivia ${book}: has ${list.length} questions, needs ${MIN_TRIVIA_PER_BOOK}`)
    }
    for (const q of list) {
      const at = `trivia ${q.id}`
      if (seen.has(q.id)) problems.push(`${at}: duplicate id`)
      seen.add(q.id)

      if (q.options.length !== 4) problems.push(`${at}: has ${q.options.length} options, needs 4`)
      if (new Set(q.options).size !== q.options.length) problems.push(`${at}: repeats an option`)
      if (q.answerIndex < 0 || q.answerIndex >= q.options.length) {
        problems.push(`${at}: answerIndex is out of range`)
        continue
      }
      if (!q.teach.trim()) problems.push(`${at}: no teach line — a miss has to teach something`)
      // A question mark ANYWHERE, not at the end: plenty of prompts close on a
      // quoted phrase ('…why have You forsaken me?"') or trail off into the
      // options with an ellipsis. Requiring it last flagged perfectly good
      // questions, which is how a checker teaches people to ignore it.
      if (!q.prompt.includes('?') && !q.prompt.includes('…')) {
        problems.push(`${at}: the prompt should ask something`)
      }

      // The prompt giving away its own answer is the failure mode that looks
      // completely fine in review and makes the question worthless in play.
      //
      // DIGITS ARE KEPT. Stripping them collapsed 'Psalm 23' to 'psalm', which
      // then "matched" every prompt with the word psalm in it — five false
      // positives on the first real run, all of them fine questions.
      const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
      const answer = norm(q.options[q.answerIndex])
      if (answer.length > 3 && norm(q.prompt).includes(answer)) {
        problems.push(`${at}: the prompt contains its own answer ("${q.options[q.answerIndex]}")`)
      }
    }
  }

  const missing = BIBLE_BOOKS.filter((b) => !(b in BOOK_TRIVIA))
  if (missing.length) problems.push(`trivia: no questions for ${missing.join(', ')}`)

  return problems
}

if (import.meta.env?.DEV) {
  const problems = checkTriviaData()
  if (problems.length) console.error('[trivia] data problems:\n' + problems.join('\n'))
}
