// The moments: Wednesday's post, and the pile of painted art that was doing
// nothing.
//
// Forty-six card backgrounds ship in `public/cards/` at 1040x520, and until
// now they were only ever seen behind a player card. Roughly two thirds of
// them depict a SPECIFIC biblical scene — the alabaster jar, Jacob's ladder,
// the tablets of the law — and those are the ones listed here. The rest are
// atmospheric landscapes (a shaft of light on hills, a mountain at dusk) that
// belong to achievement stamps rather than to passages; they make good
// backdrops for a quiet minute and poor subjects for a telling, so they are
// deliberately absent.
//
// Three rules:
//
//   - **They are 2:1 and must NOT be cropped to 9:16.** A full-bleed crop
//     takes a 260px slice out of a 1040px painting. A moment renders the
//     picture as a wide window in the frame with the words above and below —
//     which is also what makes this format look unlike everything else in the
//     schedule, and Snapchat's quality page rewards exactly that.
//   - **A row's REFERENCE is a citation, not a pool lookup**, and that was
//     settled by checking: 22 of these 28 passages are not in `VERSE_POOL`,
//     because the pool is a curated 727 verses rather than the whole Bible.
//     Mark 14:8 is where the alabaster jar is, and citing Mark 1:15 instead
//     because that is what the arcade happens to carry would be a lie on
//     screen. So a moment SAYS its own passage and the end card carries the
//     DAY'S verse — which is a pool verse with real text, so scripture is on
//     screen exactly as it is on every other kind. `check-week.mjs` asserts
//     the citation is well-formed and names one of the 66 books; it does not
//     require the pool to hold it.
//   - **The rotation is no-repeat**, seeded like every other rotation here, so
//     every painting gets a Wednesday before any of them gets a second one.

export interface MomentDef {
  /** The file in public/cards, without .webp. */
  id: string
  /** What the painting is holding, for the title. */
  title: string
  /** The passage the picture is holding. A citation — NOT required to be in VERSE_POOL. */
  reference: string
  /** One line of orientation for the draft — never the script itself. */
  about: string
}

export const MOMENTS: MomentDef[] = [
  { id: 'alabaster_jar', title: 'The alabaster jar', reference: 'Mark 14:8', about: 'A woman breaks a jar worth a year of wages over Jesus and never defends herself; He does it for her.' },
  { id: 'ancient_menorah', title: 'The lampstand', reference: 'Exodus 25:31', about: 'The seven-branched lamp in the tabernacle, hammered from one piece of gold, never to go out.' },
  { id: 'angels_host', title: 'The host in the field', reference: 'Luke 2:14', about: 'The armies of heaven announcing a birth to the men on the night shift.' },
  { id: 'angels_ladder', title: 'Jacob’s ladder', reference: 'Genesis 28:16', about: 'A man asleep on a stone sees the traffic between heaven and earth and wakes up frightened.' },
  { id: 'anointing_oil', title: 'The anointing oil', reference: 'Psalm 23:5', about: 'Oil poured on the head: the mark of a king, a priest, and a guest somebody was glad to see.' },
  { id: 'apostles_letter', title: 'A letter from prison', reference: 'Philippians 4:11', about: 'Most of the New Testament is post. Some of the warmest of it was written under guard.' },
  { id: 'centurion', title: 'The centurion', reference: 'Matthew 8:8', about: 'A Roman officer tells Jesus not to bother coming; just say the word. Jesus calls it the greatest faith in Israel.' },
  { id: 'clay_lamp', title: 'The clay lamp', reference: 'Psalm 119:105', about: 'A small oil lamp lights the next step and no further, which is the point of the picture.' },
  { id: 'covenant_rainbow', title: 'The bow in the cloud', reference: 'Genesis 9:13', about: 'A war bow hung up in the sky, pointed away — the first promise God makes to everybody at once.' },
  { id: 'davids_harp', title: 'David’s harp', reference: 'Psalm 34:1', about: 'The instrument a shepherd boy played for a king who was losing his mind.' },
  { id: 'descending_dove', title: 'The dove descending', reference: 'Matthew 3:17', about: 'The one moment in the gospels where all three Persons are visible at once, at a river, over a queue of sinners.' },
  { id: 'golden_chalice', title: 'The cup', reference: 'Luke 22:20', about: 'The third cup of a Passover meal, handed round a table with a traitor at it.' },
  { id: 'jordan_water', title: 'The Jordan', reference: 'Joshua 3:17', about: 'A river that stopped so a nation could walk across, and the same river a carpenter was baptised in.' },
  { id: 'jubilee_trumpet', title: 'The jubilee trumpet', reference: 'Leviticus 25:10', about: 'Every fiftieth year, a horn sounds and every debt in the country is cancelled.' },
  { id: 'kingdom_keys', title: 'The keys', reference: 'Matthew 16:18', about: 'Handed to the disciple who would deny Him three times, before he denied Him.' },
  { id: 'leper_king', title: 'The leper outside the gate', reference: 'Mark 1:41', about: 'A man nobody was allowed to touch, and the first thing Jesus does is reach out and touch him.' },
  { id: 'loaves_fish', title: 'Five loaves and two fish', reference: 'John 6:9', about: 'A boy’s packed lunch, handed over, and the leftovers fill twelve baskets.' },
  { id: 'manna', title: 'Manna', reference: 'Exodus 16:4', about: 'Bread that arrives daily and rots if you hoard it — a lesson in the shape of a food.' },
  { id: 'mustard_seed', title: 'The mustard seed', reference: 'Matthew 17:20', about: 'The smallest thing a farmer in that country planted, used as the measure of enough faith.' },
  { id: 'olive_branch', title: 'The olive branch', reference: 'Genesis 8:11', about: 'A bird comes back with a leaf, and a man in a boat knows the world is dry again.' },
  { id: 'palm_frond', title: 'The palm branches', reference: 'John 12:13', about: 'A crowd waving branches at a king on a donkey, five days before they change their minds.' },
  { id: 'pearl_price', title: 'The pearl of great price', reference: 'Matthew 13:46', about: 'A merchant sells everything he owns for one thing, and the parable never says he regretted it.' },
  { id: 'scroll_fragment', title: 'The scroll', reference: 'Isaiah 40:8', about: 'Handwritten, copied by hand, checked letter by letter — and the copies agree across a thousand years.' },
  { id: 'shepherds_crook', title: 'The shepherd’s crook', reference: 'Psalm 23:4', about: 'The rod and the staff: one to fight off what is coming, one to pull a sheep out of a hole.' },
  { id: 'star_of_bethlehem', title: 'The star', reference: 'Matthew 2:10', about: 'Foreign astrologers read the sky and travel for months; the people next door do not look up.' },
  { id: 'tablets_law', title: 'The tablets', reference: 'Exodus 20:2', about: 'Cut twice, because the first set was broken at the bottom of the mountain.' },
  { id: 'water_jar', title: 'The water jar at noon', reference: 'John 4:14', about: 'A woman fetching water in the heat to avoid the other women, who meets somebody who already knows why.' },
  { id: 'widows_mite', title: 'The widow’s two coins', reference: 'Mark 12:44', about: 'The smallest gift in the treasury that day, and the only one Jesus mentions.' },
]

export const MOMENT_IDS: ReadonlySet<string> = new Set(MOMENTS.map((m) => m.id))
export const momentPath = (id: string) => `/cards/${id}.webp`
