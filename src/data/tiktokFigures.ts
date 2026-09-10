// Friday: who is this?
//
// Three clues in his voice, a held pause, then the name. The pause is the
// guess, and it is the only format in the week that asks for a comment —
// which is the one thing the schedule would otherwise lose when the
// challenges stop.
//
// It needs no clock and no second layout. The beat is silence he leaves in
// the recording, so this runs on the same reading layout as the other five.
//
// Two rules:
//
//   - **The figure is a skin this build already ships**, drawn standing on a
//     stage by the same `standFigure` the morning post uses. Nothing here
//     goes through `skinVisible` — the art is read from `public/skins/` like
//     every reader's — so a skin staying retired or owned by one account is
//     untouched.
//   - **The clues go general to specific and the LAST one is nearly a
//     giveaway.** A guessing format that stays hard is a format people scroll
//     past; the point is the small satisfaction of getting it on clue three,
//     not a test. Nothing here is scored and nobody is told they were wrong.

export interface FigureDef {
  /** A render in public/skins, without .png. */
  skin: string
  name: string
  /** Three clues, general → specific. Spoken in order. */
  clues: [string, string, string]
  /** Where they belong, for the end card's citation. */
  reference: string
}

export const FIGURES: FigureDef[] = [
  { skin: 'boaz', name: 'Boaz', reference: 'Ruth 2:12', clues: [
    'He owns the field, and he tells his workers to leave extra grain on the ground on purpose.',
    'He is descended from Rahab, and he marries a foreigner — which puts two outsiders in the family line of David.',
    'What he does for her has a name in the law: kinsman-redeemer.' ] },
  { skin: 'deborah', name: 'Deborah', reference: 'Judges 4:4', clues: [
    'She held court under a palm tree, and the whole country came to her to settle things.',
    'The general would not go to war unless she came with him.',
    'She is the only woman among the judges of Israel, and she is a prophet as well.' ] },
  { skin: 'esther', name: 'Esther', reference: 'Esther 4:14', clues: [
    'She was an orphan raised by her cousin, and she did not tell anyone where she was from.',
    'She won a competition she never entered and became queen of an empire.',
    'She broke the law by walking into the throne room uninvited, to stop a genocide.' ] },
  { skin: 'moses', name: 'Moses', reference: 'Exodus 3:14', clues: [
    'He was found in a basket by the daughter of the man trying to kill him.',
    'He argued with God about whether he could speak well enough for the job.',
    'He came down a mountain twice carrying stone, and broke it the first time.' ] },
  { skin: 'david', name: 'David', reference: 'Psalm 23:1', clues: [
    'He was the youngest of eight brothers, and nobody thought to call him in from the field.',
    'He played music for a king who was losing his mind, and later took his throne.',
    'About half the Psalms carry his name.' ] },
  { skin: 'elijah', name: 'Elijah', reference: '1 Kings 19:12', clues: [
    'He shut the sky for three years, and it did not rain until he said so.',
    'He beat four hundred and fifty prophets in a contest, and then ran away and asked to die.',
    'God answered him not in the wind or the earthquake, but in a low whisper.' ] },
  { skin: 'joseph', name: 'Joseph', reference: 'Genesis 50:20', clues: [
    'His brothers sold him, and their father was told he had been killed by an animal.',
    'He read two dreams in a prison and one for a king, and it made him the second most powerful man in Egypt.',
    'When he finally told his brothers who he was, he said: you meant it for evil, God meant it for good.' ] },
  { skin: 'ruth_1', name: 'Ruth', reference: 'Ruth 1:16', clues: [
    'She was a foreigner, and by every custom of the time she should have gone home.',
    'She told her mother-in-law: where you go I will go, and your God will be my God.',
    'She ends up the great-grandmother of King David.' ] },
  { skin: 'mary', name: 'Mary', reference: 'Luke 1:46', clues: [
    'She was a teenager in a town of a few hundred people when an angel turned up.',
    'Her answer to the most disruptive news anybody has ever received was: let it be to me.',
    'She sang a song about the powerful being pulled off their thrones.' ] },
  { skin: 'cephas', name: 'Peter', reference: 'Matthew 16:18', clues: [
    'He was a fisherman, and he left the boat in the middle of a working day.',
    'He walked on water for a few seconds and then looked down.',
    'He denied he knew Jesus three times, and was handed the keys anyway.' ] },
  { skin: 'jonathan', name: 'Jonathan', reference: '1 Samuel 18:3', clues: [
    'He was the king’s son, which made him next in line for the throne.',
    'He gave his robe, his armour and his sword to the man who was going to have it instead.',
    'His friendship with David is the one the Bible describes as loving him as his own soul.' ] },
  { skin: 'gabriel', name: 'Gabriel', reference: 'Luke 1:37', clues: [
    'He turns up four times in the Bible, and three of them are to explain something nobody understood.',
    'He told an old priest he would have a son, and the priest did not believe him.',
    'He is the one who tells Mary that nothing will be impossible with God.' ] },
  { skin: 'michael', name: 'Michael', reference: 'Daniel 10:13', clues: [
    'He is called a prince, and he is the only one of his kind the Bible gives that title to.',
    'He held up an answer to a prayer for twenty-one days by fighting for it.',
    'Jude says he argued with the devil over the body of Moses, and would not slander him.' ] },
]

export const FIGURE_SKINS: ReadonlySet<string> = new Set(FIGURES.map((f) => f.skin))
export const figurePath = (skin: string) => `/skins/${skin}.png`
