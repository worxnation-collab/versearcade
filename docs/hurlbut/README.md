# Hurlbut stories: the operator's read-aloud bank

The operator records himself telling a short Bible story, told by a person
from start to finish. The text comes from Jesse Lyman Hurlbut's children's
Bible, cut down until one story fits one post.

## Source, and why this edition

*Mother's Story of the Bible* (Hurlbut, **1905**): the same 168 stories later
sold as *Hurlbut's Story of the Bible*. Text:
`archive.org/download/mothersstoryofbi00hurl/mothersstoryofbi00hurl_djvu.txt`.

**Use the 1905 edition only.** Anything published in the US before 1931 is
public domain. The 1932-and-later printings may carry renewed copyright on
revised text, so do not quote from them. The children's storybooks churches
use today (Jesus Storybook Bible, Beginner's Bible, Gospel Project, Orange)
are copyrighted. A church's licence to use them does not extend to us, so
never record from them.

That scan is **missing its first ~30 pages** (Creation through Abram: the
garden, Cain and Abel, Noah, Babel). Those stories will be retold from the
BSB (also public domain) when we need them.

## The target

| | |
|---|---|
| Hard ceiling | **90s**. That is Facebook's Reel cap (`FACEBOOK_REEL_MAX_SECONDS`); over it the post drops to a plain Page video. |
| Words | **145-180**. That reads in about 60-80s at a storytelling pace (135-150 wpm), leaving room for the end card. |
| Never | over 185 words. A slow take of 185 is already about 82s. |

## The cutting rules

A Hurlbut story is 800-3,000 words, so getting it to 180 words is a fresh
retelling, not a trim. These rules make each cut the same way:

1. **One episode per video.** Many Hurlbut stories hold two or three episodes
   ("Elisha and the Bow; Jonah and Nineveh"). Take the one that stands alone.
   A long arc becomes a short series: Joseph is three parts (sold, prison to
   palace, the brothers in Egypt), which fits the five-night weekday series.
2. **Hook first, and the hook is the turn.** Line one is the surprising thing
   (the donkey could see the angel; God said 32,000 was too many), never
   "Long ago in the land of…". It sits on screen from frame 0, the same rule
   the engine follows everywhere.
3. **Keep what the turn needs, cut the rest.** Cut geography and distances,
   genealogy, Hurlbut's asides to the reader ("You remember Story Nine…"),
   explanations of customs, side characters who don't change the outcome,
   and his closing moral.
4. **Keep one or two spoken lines, word for word if possible.** "Speak, for
   your servant is listening." "Here comes that dreamer." Dialogue is what
   makes a telling sound told rather than summarised.
5. **Use three beats where the Bible does.** Three times, seven times, forty
   days. Repetition shapes a spoken story, and it is cheap in words.
6. **End on one line, said slower.** It names what the story turned on, in
   plain words. One sentence, no "and so children, we learn…".
7. **Keep it gentle.** It must be fit for a child, with no gore. Goliath
   "fell to the ground"; the Egyptians aren't described in the sea.
8. **Modernise the language, don't change the story.** Drop "thee" and
   "wast". Every fact must be in Hurlbut AND in the scripture reference. If
   the two disagree, the scripture wins.
9. **Never draw God.** This applies to the art prompts as well as the words.

## Timing: when a story runs

- **Seasonal stories are held for their season.** The manger story runs in
  Advent; the wise men late December into Epiphany (Jan 6); the Red Sea and
  the Passover stories around Easter. The `when` field in `scripts.json` says
  which.
- **A multi-part arc runs Monday to Friday**, matching the weekday series
  (`src/data/tiktokSeries.ts`), so one part never sits days away from the next.
- **Everything else is evergreen**, and an evergreen story is what a day with
  no fresh recording falls back to.

## Recording

- Record them in batches: every text is fixed, so a sitting of 10-15 is
  possible. Say the take marker ("Day four") before each one, so the batch
  splitter can cut them apart.
- Pause one beat after the hook and before the last line.
- If a take runs over about 80s, cut a middle beat rather than speeding up.

## Files

- `scripts.json`: the batch as data (id, Hurlbut story number, references,
  season, hook / body / landing line). The engine will read this.
- `SCRIPTS.md`: the same batch laid out for reading aloud.
