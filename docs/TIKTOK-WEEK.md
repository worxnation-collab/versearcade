# The week: two posts a day, and your voice on both

The schedule this replaces was five templated posts a day, three of which no
human voice touched — and every network that judges a CHANNEL rather than a
video pushed back on exactly that shape. YouTube's inauthentic-content policy,
Meta's originality policy and Snapchat's quality page all say the same thing in
different words, and Snapchat says it outright:

> "Our content ranking algorithm rewards authentic, human-made content over
> wholly AI-generated content created outside of Snapchat, **even when
> AI-generated content has transparency disclosures**."

So the answer is not to label harder. It is to stop making posts nobody spoke
on. **Two posts a day, both carrying the operator's own recorded voice, and
every one of them going to every network.**

The first post is the same every day. The second is a different FORM every day
of the week, so a feed that rewards variety sees seven shapes rather than one
repeated.

## The week

| | Second post | What it is | Runs on |
|---|---|---|---|
| **Mon** | Story time | Tabitha tells the story behind the verse; his voice opens or closes it | as today |
| **Tue** | A book in 30 seconds | THE DAY'S OWN BOOK: how long it is, what happens in it, how it ends | `structure.ts`, `trivia.ts`, the day's verse |
| **Wed** | The moment | one painted biblical scene and the story it is holding | 28 of the card paintings |
| **Thu** | What happened just before | what led to today's verse, the verse, what came after | pool `before` / `after` |
| **Fri** | Who is this? | three clues in his voice, a beat, then the name | 13 named biblical figures |
| **Sat** | A quiet minute | one held painting, the verse, read slowly, music up | any backdrop |
| **Sun** | A prayer, read | a generated prayer, read aloud over the Upper Room | `data/prayers.ts` |

Saturday and Sunday are not arbitrary: they are the two days where the shape of
the day and the shape of the post agree. Friday is the one format that asks for
a comment (guess before the reveal), which is the single thing this schedule
would otherwise lose when the challenges stop.

## What this costs, and what it doesn't

**The recording load does not change.** It is two voiced posts a day today
(the verse and the story's half) and two under this. Fourteen a week either
way — the content stops repeating, the cadence does not move.

**The budget goes DOWN.** Two kinds on eight networks is 16 posts a day,
~490 a month against Ayrshare's 1,000-post plan, from 22 a day / ~670. Every
post carries a voice, so nothing needs holding back from YouTube, Meta or
Snapchat any more: for the first time everything goes everywhere.

**What stops:** the quiz and the two challenges. They only reached X, Threads
and a warming-up TikTok, so the measured loss is near zero — but the Grok
comment-replier goes idle with them, because it reads comments under challenge
posts that no longer exist.

## The four decisions, and what was decided

- **The note stays, and stays on Monday.** It is a photo rather than a video,
  so Facebook distributes it through machinery a Reel does not reach, and it is
  the best evergreen pin this engine makes. It is written from the SAME
  paragraphs Tabitha tells, so it belongs to the day the story runs and moves
  with it. That is +2 posts a week, not +14. (The obvious later step is a daily
  note written from the VERSE's own `before`/`after`/`facts` instead — it would
  decouple the card from the story entirely. Not now: it breaks the one
  guarantee that stops the card and the video disagreeing about what happened.)
- **An unrecorded day: the verse falls back to Gemini, the second post
  SKIPS.** The verse has always had that fallback and it is honestly labelled.
  The second post does not get one, because its whole reason for existing is
  that a person made it — a synthetic stand-in on a channel-judged network is
  the exact thing this plan exists to stop. A quiet day beats a thin one.
- **The quiz and the challenges are PARKED, not deleted.** `makeQuiz`,
  `makeChallenge` and the `replies` action all stay and keep working; they come
  off every network through `KINDS_OFF` and are labelled parked, the way
  `bonusTriviaFor` and `storyCards()` are. An account with traction might want
  a challenge back, and the code is the expensive part. What DOES change is the
  cron: `tiktok-replies.yml` is disabled, because a replier polling for posts
  that were never made is a scheduled error.
- **The Cross Word is dropped** from the seven. It is a puzzle on a timer and
  there is nothing natural to say over it in a human voice, which is the one
  thing every format here has to do.

## One layout, not six

The five reading formats (Tue, Wed, Thu, Sat, Sun) and Friday are all the same
thing: **his voice over held paintings, captioned, cutting on a beat, ending on
the card.** That is `renderStory` with one change — its `audio` (Tabitha's
telling) becomes optional, so `own` can be the whole track rather than a half
joined to hers.

Everything else it needs already exists and shipped in the stages change:

- **held paintings that CUT** (`scenes`, `storyShots`, `SHOT_PUSH`) — a format
  with two shots (Thursday's before/after) and one with a single held painting
  (Saturday) are the same code with a different list.
- **his own dark stage** (`stage`, `STORY_STAND`) — already there, already the
  place his voice stands.
- **captions timed to his recording**, `heldPhrase`, the handover clamp, the
  end card, the founder photo.

So Friday needs no clock: three clues, a pause he leaves in the recording, then
the name. That keeps the whole week on ONE layout, which is also what stops the
six formats drifting apart.

## What is genuinely new

1. **`StoryInput.audio` becomes optional.** One change in `renderStory`.
2. **Six content builders** in `admin/tiktok/make.ts`, each assembling
   paragraphs + backdrops from data that already exists.
3. **Six draft prompts** in the function's `thought` action, keyed by kind —
   the same shape the story's `open` / `close` variants already use.
4. **`kindForDate(date)`** — a pure function of the date string's weekday
   (parsed at noon UTC so no offset can land it on the wrong day), used by the
   hub and the runner so they cannot disagree about what today is.
5. **Two prepack tables**, both checked at build time like `check-stages`:
   - `data/tiktokMoments.ts` — **28 rows**, not 46. Checking the art rather
     than the filenames is what settled it: two thirds of the card paintings
     depict a specific biblical scene, and the rest are atmospheric landscapes
     belonging to achievement stamps (a shaft of light on hills, a mountain at
     dusk). Those make good backdrops for a quiet minute and poor subjects for
     a telling. A row's REFERENCE is a citation and is deliberately NOT
     required to be in `VERSE_POOL` — 22 of the 28 passages are not, because
     the pool is a curated 727 verses; citing what the arcade happens to carry
     instead of where the alabaster jar actually is would be a lie on screen.
     The end card carries the DAY'S verse, which is a pool verse with real
     text, so scripture is on screen exactly as on every other kind.
   - `data/tiktokFigures.ts` — **13 rows**, not 31. The 31 skins include the
     72-render starter set, promo exclusives and five historical figures; the
     named biblical people are thirteen. Three months of Fridays, and the
     five historical ones (Francis, Hildegard, Aquinas, Melisende, Baldwin)
     are the obvious extension when it runs low.

No migration. No new art.

## Runway

**Tuesday's book is the book the day's VERSE came from**, rather than an
independent rotation over all 66. Drafting the first fortnight is what decided
it: on 2026-10-20 the verse is Joel 3:10 — "beat your plowshares into swords",
Joel deliberately reversing the famous line — and a Joel summary beside it
makes the two posts of that day one argument instead of two subjects. The cost
is coverage: common books come up often and Obadiah may wait years. That is
fixable later by skipping a book seen in the last N Tuesdays and falling back
to a rotation; it is not worth the second seed now.

| Format | Supply | At once a week |
|---|---|---|
| Book | the day's own book | indefinite, unevenly |
| Moment | 28 paintings | 6 months |
| Figure | 13 figures | 3 months |
| Before / Quiet / Prayer | 727 verses | indefinite |

The three finite ones use the same no-repeat rotation `getVerseForDate` uses,
each under its own seed, so a repeat cannot land before the whole set has run.

## Cutover: 2026-10-13

A Tuesday, and every constraint lands on it:

- Everything already scheduled has run — verses through 09-14, stories and
  notes through 09-28.
- Scripts C and D cover 09-29 → 10-12. Starting earlier would waste every
  non-Monday take in Script D, which was drafted as story introductions.
- Story stages switch on that day anyway (stories are cached through 10-12).
- It is the first day of a week's rotation, so the run starts on a NEW format
  rather than mid-week.

Between now and then the schedule runs as it is.

## Recording

Batch by FORMAT rather than by date — one memo of four Tuesdays is easier to
read than one memo of a Tuesday, a Wednesday and a Thursday. `split` already
cuts a multi-take memo on "Day N" markers, and a verse take is heard again on
its own so its scripture is captioned from the known text rather than from a
transcript.
