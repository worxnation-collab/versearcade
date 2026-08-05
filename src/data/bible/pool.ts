// Curated verse pool with the metadata needed to generate verse-specific
// questions (speaker, audience, surrounding context, theme, a key word) plus
// "did you know" facts for shame-free wrong-answer reveals.
//
// Text here is the public-domain Berean Standard Bible. In connected mode the
// exact passage can also be fetched live via the bible-api (see config.ts);
// the generator only relies on the fields below, so it stays self-consistent.
//
// NOTE (content scale): a production daily app needs 365+ curated entries. This
// pool of 18 proves the mechanic and cycles deterministically by date. The real
// pipeline is an offline batch (LLM-assisted metadata + human review) writing to
// the `daily_verses` table — see docs/ARCHITECTURE.md.

export type Testament = 'OT' | 'NT'

export interface VerseSeed {
  reference: string
  book: string
  chapter: number
  verseStart: number
  verseEnd?: number
  text: string
  testament: Testament
  speaker: string
  audience: string
  before: string
  after: string
  theme: string
  keyword: string // a distinctive word appearing in `text`, for fill-in-the-blank
  facts: string[]
}

export const VERSE_POOL: VerseSeed[] = [
  {
    reference: 'John 3:16', book: 'John', chapter: 3, verseStart: 16,
    text: 'For God so loved the world that He gave His one and only Son, that everyone who believes in Him shall not perish but have eternal life.',
    testament: 'NT', speaker: 'Jesus', audience: 'Nicodemus',
    before: 'Jesus tells Nicodemus that the Son of Man must be lifted up.',
    after: 'Jesus explains that God sent the Son to save, not to condemn, the world.',
    theme: 'God’s love and salvation', keyword: 'world',
    facts: [
      'This verse is spoken during a night visit from Nicodemus, a Pharisee curious about Jesus.',
      'The Greek word translated "world" here is "kosmos" — the whole created order of people.',
    ],
  },
  {
    reference: 'Genesis 1:1', book: 'Genesis', chapter: 1, verseStart: 1,
    text: 'In the beginning God created the heavens and the earth.',
    testament: 'OT', speaker: 'The narrator (Moses, traditionally)', audience: 'Readers of Israel',
    before: 'Nothing — these are the opening words of the Bible.',
    after: 'The earth is described as formless and empty, with darkness over the deep.',
    theme: 'Creation', keyword: 'beginning',
    facts: [
      'These are the very first words of the entire Bible.',
      'The Hebrew opening word is "Bereshit," which means "in the beginning."',
    ],
  },
  {
    reference: 'Psalm 23:1', book: 'Psalms', chapter: 23, verseStart: 1,
    text: 'The LORD is my shepherd; I shall not want.',
    testament: 'OT', speaker: 'David', audience: 'God / worshipers',
    before: 'This is the opening line of one of the best-loved psalms.',
    after: 'David says God makes him lie down in green pastures and leads him beside still waters.',
    theme: 'God’s provision and care', keyword: 'shepherd',
    facts: [
      'David wrote this psalm; he had been a shepherd himself as a boy.',
      'Psalm 23 is one of the most memorized passages in the world.',
    ],
  },
  {
    reference: 'Philippians 4:13', book: 'Philippians', chapter: 4, verseStart: 13,
    text: 'I can do all things through Christ who gives me strength.',
    testament: 'NT', speaker: 'Paul', audience: 'The church in Philippi',
    before: 'Paul says he has learned to be content whether well-fed or hungry.',
    after: 'Paul thanks the Philippians for sharing in his troubles.',
    theme: 'Strength and contentment', keyword: 'strength',
    facts: [
      'Paul wrote Philippians from prison, yet the letter overflows with joy.',
      'The context is contentment in every circumstance, not athletic achievement.',
    ],
  },
  {
    reference: 'Proverbs 3:5', book: 'Proverbs', chapter: 3, verseStart: 5,
    text: 'Trust in the LORD with all your heart, and lean not on your own understanding.',
    testament: 'OT', speaker: 'Solomon (the teacher)', audience: 'His son / the reader',
    before: 'The father urges the son not to forget his teaching.',
    after: 'In all your ways acknowledge Him, and He will make your paths straight.',
    theme: 'Trust and wisdom', keyword: 'understanding',
    facts: [
      'Proverbs is largely a collection of wisdom sayings attributed to Solomon.',
      'The next verse promises that God will "make your paths straight."',
    ],
  },
  {
    reference: 'Jeremiah 29:11', book: 'Jeremiah', chapter: 29, verseStart: 11,
    text: 'For I know the plans I have for you, declares the LORD, plans to prosper you and not to harm you, plans to give you a future and a hope.',
    testament: 'OT', speaker: 'God (through Jeremiah)', audience: 'The exiles in Babylon',
    before: 'God tells the exiles to build houses and settle down in Babylon.',
    after: 'God promises that when they seek Him with all their heart, they will find Him.',
    theme: 'Hope and God’s plans', keyword: 'hope',
    facts: [
      'This promise was first given to Israelites living in exile far from home.',
      'It comes in a letter Jeremiah sent to the captives in Babylon.',
    ],
  },
  {
    reference: 'Matthew 5:9', book: 'Matthew', chapter: 5, verseStart: 9,
    text: 'Blessed are the peacemakers, for they will be called sons of God.',
    testament: 'NT', speaker: 'Jesus', audience: 'The crowds on the mountain',
    before: 'Jesus blesses the merciful and the pure in heart.',
    after: 'Jesus blesses those persecuted for righteousness.',
    theme: 'The Beatitudes', keyword: 'peacemakers',
    facts: [
      'This line is part of the Beatitudes that open the Sermon on the Mount.',
      'Each Beatitude begins with the word "Blessed."',
    ],
  },
  {
    reference: 'Romans 8:28', book: 'Romans', chapter: 8, verseStart: 28,
    text: 'And we know that God works all things together for the good of those who love Him, who are called according to His purpose.',
    testament: 'NT', speaker: 'Paul', audience: 'The church in Rome',
    before: 'Paul says the Spirit helps us in our weakness when we do not know how to pray.',
    after: 'Paul writes that those God foreknew He also predestined.',
    theme: 'God’s purpose in all things', keyword: 'good',
    facts: [
      'Paul had never visited Rome when he wrote this letter to its believers.',
      'This verse is often quoted for comfort during hardship.',
    ],
  },
  {
    reference: 'Joshua 1:9', book: 'Joshua', chapter: 1, verseStart: 9,
    text: 'Have I not commanded you to be strong and courageous? Do not be afraid or discouraged, for the LORD your God is with you wherever you go.',
    testament: 'OT', speaker: 'God', audience: 'Joshua',
    before: 'God tells Joshua to meditate on the Book of the Law day and night.',
    after: 'Joshua orders the officers to prepare the people to cross the Jordan.',
    theme: 'Courage and God’s presence', keyword: 'courageous',
    facts: [
      'God spoke this as Joshua took over leadership from Moses.',
      'Israel was about to cross the Jordan River into the promised land.',
    ],
  },
  {
    reference: 'Isaiah 40:31', book: 'Isaiah', chapter: 40, verseStart: 31,
    text: 'But those who wait upon the LORD will renew their strength; they will mount up with wings like eagles; they will run and not grow weary; they will walk and not faint.',
    testament: 'OT', speaker: 'God (through Isaiah)', audience: 'Weary Israel',
    before: 'Isaiah says even youths grow tired and weary.',
    after: 'Isaiah continues comforting God’s people in exile.',
    theme: 'Renewed strength', keyword: 'eagles',
    facts: [
      'Isaiah 40 opens with the famous words "Comfort, comfort my people."',
      'The image of eagles’ wings pictures effortless, lifted strength.',
    ],
  },
  {
    reference: 'Matthew 28:19', book: 'Matthew', chapter: 28, verseStart: 19,
    text: 'Therefore go and make disciples of all nations, baptizing them in the name of the Father and of the Son and of the Holy Spirit.',
    testament: 'NT', speaker: 'Jesus', audience: 'The eleven disciples',
    before: 'Jesus declares that all authority in heaven and on earth has been given to Him.',
    after: 'Jesus promises to be with them always, to the very end of the age.',
    theme: 'The Great Commission', keyword: 'nations',
    facts: [
      'These are among the last recorded words of Jesus in Matthew.',
      'This passage is known as the "Great Commission."',
    ],
  },
  {
    reference: 'Psalm 46:10', book: 'Psalms', chapter: 46, verseStart: 10,
    text: 'Be still and know that I am God; I will be exalted among the nations, I will be exalted over the earth.',
    testament: 'OT', speaker: 'God', audience: 'The nations / worshipers',
    before: 'The psalm describes God making wars cease to the ends of the earth.',
    after: 'The psalm ends: the LORD of Hosts is with us; the God of Jacob is our fortress.',
    theme: 'Stillness and God’s sovereignty', keyword: 'still',
    facts: [
      'This psalm inspired the hymn "A Mighty Fortress Is Our God."',
      '"Be still" can also be translated "cease striving."',
    ],
  },
  {
    reference: 'John 14:6', book: 'John', chapter: 14, verseStart: 6,
    text: 'Jesus answered, I am the way and the truth and the life. No one comes to the Father except through Me.',
    testament: 'NT', speaker: 'Jesus', audience: 'Thomas and the disciples',
    before: 'Thomas asks how they can know the way, since they do not know where Jesus is going.',
    after: 'Jesus says that if they know Him, they know the Father also.',
    theme: 'Jesus as the way', keyword: 'way',
    facts: [
      'This is one of the seven "I am" statements in John’s Gospel.',
      'Jesus said it the night before His crucifixion.',
    ],
  },
  {
    reference: 'Galatians 5:22', book: 'Galatians', chapter: 5, verseStart: 22,
    text: 'But the fruit of the Spirit is love, joy, peace, patience, kindness, goodness, faithfulness.',
    testament: 'NT', speaker: 'Paul', audience: 'The churches in Galatia',
    before: 'Paul lists the works of the flesh that oppose the Spirit.',
    after: 'Paul adds gentleness and self-control, saying against such things there is no law.',
    theme: 'The fruit of the Spirit', keyword: 'fruit',
    facts: [
      'The full list of the fruit of the Spirit has nine qualities.',
      'Paul contrasts this "fruit" with the "works of the flesh."',
    ],
  },
  {
    reference: 'Micah 6:8', book: 'Micah', chapter: 6, verseStart: 8,
    text: 'He has shown you, O man, what is good. And what does the LORD require of you but to act justly, to love mercy, and to walk humbly with your God?',
    testament: 'OT', speaker: 'The prophet Micah', audience: 'The people of Israel',
    before: 'Micah asks what offering the LORD would accept.',
    after: 'Micah confronts the dishonest scales and violence in the city.',
    theme: 'Justice, mercy, humility', keyword: 'humbly',
    facts: [
      'Micah prophesied in the 8th century BC, a contemporary of Isaiah.',
      'This verse summarizes what God truly desires over ritual sacrifice.',
    ],
  },
  {
    reference: 'Hebrews 11:1', book: 'Hebrews', chapter: 11, verseStart: 1,
    text: 'Now faith is the assurance of what we hope for and the certainty of what we do not see.',
    testament: 'NT', speaker: 'The writer of Hebrews', audience: 'Jewish Christians',
    before: 'The writer urges readers not to shrink back but to have faith.',
    after: 'The chapter recounts heroes of faith like Abel, Enoch, and Noah.',
    theme: 'Faith', keyword: 'faith',
    facts: [
      'Hebrews 11 is often called the "Hall of Faith."',
      'The author of Hebrews is not named in the text.',
    ],
  },
  {
    reference: 'Matthew 6:33', book: 'Matthew', chapter: 6, verseStart: 33,
    text: 'But seek first the kingdom of God and His righteousness, and all these things will be added unto you.',
    testament: 'NT', speaker: 'Jesus', audience: 'The crowds on the mountain',
    before: 'Jesus tells them not to worry about food, drink, or clothing.',
    after: 'Jesus says not to worry about tomorrow, for each day has enough trouble of its own.',
    theme: 'Priorities and trust', keyword: 'kingdom',
    facts: [
      'This verse comes from the Sermon on the Mount.',
      'It follows Jesus’ teaching about the birds and the lilies.',
    ],
  },
  {
    reference: '1 Corinthians 13:4', book: '1 Corinthians', chapter: 13, verseStart: 4,
    text: 'Love is patient, love is kind. It does not envy, it does not boast, it is not proud.',
    testament: 'NT', speaker: 'Paul', audience: 'The church in Corinth',
    before: 'Paul says that without love, he is only a noisy gong or clanging cymbal.',
    after: 'Paul writes that love keeps no record of wrongs.',
    theme: 'The nature of love', keyword: 'patient',
    facts: [
      '1 Corinthians 13 is often read at weddings.',
      'Paul wrote it to a church that was quarreling over spiritual gifts.',
    ],
  },
]
