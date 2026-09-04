# The TikTok engine (Admin → TikTok)

Three posts a day for a faceless Verse Arcade TikTok, each behind its own pill
in Admin → TikTok: the **verse reading** (a painted figure — Peter by default —
standing in a Verse Arcade scene, reading the verse of the day, captioned WORD
BY WORD), **story time** (Tabitha telling the story behind it) and
**yesterday's quiz** (a CPU playing yesterday's five questions against the
clock). All end on `versearcade.org`. This is an **operator tool**: admin-only,
online-only, desktop Chrome. It changes nothing a player sees and it is behind
the dashboard's three gates.

The panel is a hub (`TikTokPanel.tsx`) and three generators
(`admin/tiktok/VersePost.tsx`, `StoryPost.tsx`, `QuizPost.tsx`) over one
`shared.tsx`. Tapping a pill opens that generator and nothing else — the forms
used to share one page, and with the second one it was already a page you
scrolled to find anything on.

## What one click produces

- `verse-arcade-<date>.mp4` — 1080×1920, 30fps, H.264 + AAC (or VP9/Opus WebM
  if the browser can't do H.264), audio baked in. Lead-in with the reference and
  a hook line, the reading with captions, a 2.6s end card.
- The **copy for each platform** — TikTok, YouTube Shorts (with a title),
  Facebook and Instagram Reels — each with its own length and its own number
  of hashtags, and a copy button per platform that copies exactly what gets
  pasted there. One Gemini call returns all four, and each block is sanitised
  on its own so one bad key never costs the other three. It is written ONCE
  per date and kind (`days/<date>/copy-<kind>.json`), so the hub's
  **Today's words** card shows all three sets for today without a render —
  the quiz's for yesterday, the day it replays — and swaps them at midnight
  on its own (a minute-timer watches the local date). A render on the same
  day gets the same words; ↻ Rewrite asks again.
- "Next 7 days" queues a week — `getVerseForDate` is deterministic, so any date
  can be made ahead of time. Each result gets its own download link (browsers
  block a chain of automatic downloads).

What's left for a human: pressing **Post it now** (or picking a time and
pressing **Schedule it**) on the finished card.

## Posting goes through Ayrshare

Every platform's own posting API needs an audited developer app before a post
can be public (TikTok's Content Posting API, YouTube's Data API, Meta's Graph
API), and driving a logged-in browser instead is what their fraud detection
looks for. So the four accounts are connected ONCE in Ayrshare's dashboard,
and the function's `post` action hands it a public video URL and that day's
per-platform words — one request per platform, so each gets its own text,
title and hashtag count. The key lives in Vault (`tiktok_ayrshare_key()`,
`0101`) or as an `AYRSHARE_API_KEY` function secret, never in the tree.

- **The browser's two steps.** `upload-url` gives it a signed upload URL for
  `days/<date>/<kind>.mp4` (the bucket is service-role write only, and a 20MB
  MP4 is too big to route through the function); it puts the file there, then
  calls `post` with the public URL. A WebM is refused up front: TikTok and
  Instagram will not take one, so render in Chrome.
- **Idempotent per (date, kind, platform).** A retry after a network blip
  cannot post the same video twice. What went out is parked at
  `days/<date>/posted-<kind>.json`, and the card shows it after a reload.
- **The per-platform options are deliberate.** YouTube: `shorts`, public,
  not made for kids, `containsSyntheticMedia` (the voice is synthetic).
  TikTok: public, `isAIGenerated` for the same reason, caption on one line
  because TikTok drops line breaks. Facebook: a Reel with the hook as its
  title. Instagram: a Reel shared to the feed, five hashtags at most.
- **`social`** reports what Ayrshare has connected and this month's post
  count against the plan's quota; the hub shows it, and warns in coral on a
  plan that three videos on four networks (twelve posts a day) will exhaust.

## The two halves

| Piece | Where | Why there |
|---|---|---|
| Voice (Gemini TTS), reader still (Nano Banana), reader loop (Veo), post copy (Gemini Flash) | `supabase/functions/tiktok-gen` | the only place the Gemini key exists |
| The video itself | `src/lib/tiktokRender.ts`, in the browser | WebCodecs + a muxer; no server owns ffmpeg |

The function parks its output in a Storage bucket named `tiktok` (public read,
service-role write), which it creates on first use — **no migration**. Files:

```
days/<date>/voice.wav        the reading, made once per date (re-clicking is free)
readers/<figure>-<scene>.png the Nano Banana still, once per figure+scene
readers/<figure>-<scene>.mp4 the Veo loop, once per figure+scene
```

`src/features/admin/TikTokPanel.tsx` is the whole workflow, and it dynamically
imports the renderer so the two muxers (`mp4-muxer`, `webm-muxer`) never reach
the player bundle.

## Setup, once

1. Supabase → Edge Functions → Secrets: add `GEMINI_API_KEY`. Optional model
   overrides, if Google renames a preview: `GEMINI_TTS_MODEL`,
   `GEMINI_IMAGE_MODEL`, `GEMINI_TEXT_MODEL`, `VEO_MODEL`. The defaults are in
   the function header.
2. Deploy: `supabase functions deploy tiktok-gen`.
3. Open `/admin` → TikTok. The first "Make this day's post" works immediately
   on the built-in tier (the app's own `cephas.png` bobbing over the Harvest
   Road). Veo needs the paid Gemini tier; TTS and Nano Banana do not.

## Three tiers of reader

Best available wins, each made **once** and reused every day after:

1. **Painted still** — Nano Banana composes the figure over the scene at 9:16
   from two reference images (the skin PNG and the road JPEG, fetched from
   production so they're https). Held almost still: a 1.5% push across the
   whole post.
2. **Veo loop** — 8 seconds looped forward with a crossfade at the seam.
   Started with "Animate", polled every 8s for up to 8 minutes. A few dollars
   once.
3. **Built-in** — nothing generated: the skin PNG standing on the road scene
   with one soft contact shadow. Works with only the TTS secret set.

**The still wins over the loop, and that is a reversal.** The loop was the top
tier because it had real motion — and real motion was what made the post look
generated: the reader hovered, breathing on a sine under a pulsing gold halo.
A painting with a barely-there push reads as art. The loop stays above the
built-in tier because a loop that exists was made from that layout's own base
frame.

## Everything is picked for you, and everything can be overridden

`src/data/tiktokVoice.ts` fills the form in from the verse's own metadata,
deterministically, so the same day gets the same post on every device:

- **Reader** — from the book and speaker. Moses reads the Torah and the
  histories, David the Psalms and wisdom books, Elijah the prophets (Kings
  included), Esther her own book and Ruth, Mary the first two chapters of Luke,
  Peter everything else. A named speaker wins over the book.
- **Scene** — Advent from 30 November to Christmas Day; Lamplight for comfort
  and warning verses; Harvest Road otherwise.
- **Voice** — the figure's own (a steady one, a weightier one for the words of
  God or Jesus, a softer one for comfort and praise).
- **Delivery note** — whose words they are, plus a mood scored from the theme
  and text.
- **Caption, hook and hashtags** — Gemini Flash, from the verse.

Each pick shows its reason in the panel ("David · Lamplight — Psalms",
"Charon · comfort — a psalm"). Touching the reader or scene dropdown hands the
cast back to the operator; touching the voice or the note does the same for the
voice; an **↺ Auto** pill restores either. "Next 7 days" picks per day when
automatic and applies the operator's override to the whole batch when not.

A rotating cast means more figure+scene pairs; the built-in tier renders any
pair with nothing generated, and a painted still or Veo loop is added per pair
only when wanted.

## Story time: the evening post

The same panel has a second mode. **Story time** is Tabitha, the app's
librarian, telling the story BEHIND the day's verse: 60 to 90 seconds in her
library, sitting on a stool with a circle of children cross-legged in front of
her, the words she is saying on a panel above her, and the verse itself read
plainly at the end. It is the morning post's other half — Peter reads the
verse; Tabitha tells you what was happening — and it costs about three cents:
a Gemini Flash script and a longer TTS.

- **The script is written from the pool entry's own narrative fields** —
  `before`, `after`, `speaker`, `audience`, `facts` — and the function's prompt
  forbids anything not in the passage's plain narrative. Cached at
  `days/<date>/story.json`; **↻ Rewrite** asks again. Three paragraphs: the
  situation, what happens, what came after and why it matters, then the verse.
- **The panel above her holds the words, not pictures.** It used to be a
  picture card that changed with each paragraph, drawn from the app's own art.
  Two things were wrong with that: a picture matched by keyword is only ever
  loosely about the sentence being spoken, and at card size it left the room
  itself as a strip behind it. The panel is smaller, the scene has the frame
  back, and what the panel holds is the one thing that is exactly about the
  words — the words, with the one being spoken in gold. `storyCards()` and the
  twelve-scene deck it drew from are still in `data/tiktokVoice.ts`, labelled
  unwired.
- **Nothing in the room moves.** The room is a painting (`story-circle.jpg`),
  anchored to its bottom edge so the circle sits low and the quiet upper half
  is where the panel goes, with a 2% push across the whole post. Tabitha's Veo
  loops — talking, listening, laughing, leaning in — are no longer used by any
  room: a face whose mouth moves for ninety seconds is the single clearest
  tell that a video was generated, and it was the first thing anyone noticed.
- **Auto everything, same as the verse post.** Tabitha in the story circle by
  default, her own voice (an older, unhurried one) with a storytelling note,
  and a story-flavoured caption. Every field flips to manual when touched.
- `renderStory()` shares `produce()` with the verse layout — one copy of the
  codec, timing, AAC and audible-track checks.

## Yesterday's quiz: the replay

The third post. A CPU player — the reader figure the cast picked for that day,
Peter by default — plays yesterday's five questions on a game board over the
road, and the viewer plays along. Then the answers.

- **Yesterday, by default and by name.** The five questions are the same five
  for everybody on a date, so a public replay of today's would hand out
  today's answers. The date row's home button reads "Yesterday", and the panel
  warns in coral if the date isn't over.
- **The CPU is the game's own CPU.** `features/arena/cpu.ts` — the same three
  profiles (Rookie 55%, Deacon 74%, Prophet 90%), the same seeded plan (from
  the date, so the same day replays the same way everywhere), the same
  `scoreQuestion` with the combo counted as the game counts it. Nothing here
  invents a player; the panel lists what it will pick and when before you
  make the video.
- **The clock runs all the way down on every question.** The CPU's chip lands
  on its option partway through, but the reveal waits for zero, so a viewer
  always has the whole window to pick. Twelve seconds by default against the
  game's 16.5 — a video is not a game, and the game is the payoff at the end.
  Adjustable from 6 to 16.
- **A wrong answer teaches, exactly as in the app.** The reveal card carries
  the question's own `teach` line, so the post is a lesson with a scoreboard on
  it rather than a scoreboard.
- **Its sounds are synthesised** (`quizCues`): a soft tick for the last five
  seconds, a two-note click when the player locks in, a rising chime for a
  right answer, a low pair for a miss — the bargain `juice/sound.ts` makes, no
  files. The verse is read aloud over its card first (the same TTS as the
  morning post, so it is usually cached), and the road's music sits under all
  of it.
- `renderQuiz()` shares `produce()` with the other two layouts — one copy of
  the codec, timing, AAC and audible-track checks. `quizTimeline()` is the
  one place the timing lives, so the bed and the cues are sized by the same
  numbers the frames are drawn from.

## The few generated pieces, and why those

Everything generated for these posts is chosen to be true EVERY day, never
about one verse, so it is paid for once and used forever:

- **The story circle, `public/tiktok/rooms/story-circle.jpg`** — Tabitha on a
  stool in her library with five children sitting cross-legged in front of
  her, painted from the librarian render, the Study library painting and two
  starter characters as references. Its prompt insists the upper half stays
  quiet and empty, because the caption panel is drawn over it.
  `art/tiktok-rooms.json` is the manifest, and `tiktok` is a `kind` in
  `scripts/gen-art.mjs`: 9:16, 2K, landing at 1080×1920 (every other painting
  in the app is landscape and caps at 640) and deliberately NOT wired into
  `GENERATED_ART`, since no player-facing surface reads it.
- **A Veo loop of the reader, `public/tiktok/loops/cephas-harvest.mp4`** — used
  only when no painted still exists for that figure+scene. Eight seconds,
  looped forward with a crossfade at the seam.
- **Still in the repo, unused:** `tabitha-*.mp4` (the four library loops) and
  the twelve-place deck in `public/tiktok/scenes/`. Both were replaced rather
  than found wanting, and both are one edit from coming back — but they are
  megabytes in a `public/` folder that the App Store build bakes into the IPA,
  so the honest next move is to park all of `public/tiktok/` in the Storage
  bucket beside the stills.

The only thing moving on either layout is now the caption. An earlier cut had
gold motes drifting up the frame, a warm pulse over everything, a bobbing
figure and a page-turn wipe; together they read as generated rather than
painted, which is exactly what a faceless account cannot afford.

## How the captions land on the words

The reading is TRANSCRIBED, in the browser, and every word is put where it
was heard. `lib/tiktokAlign.ts` runs Whisper (tiny.en, the
`onnx-community/whisper-tiny.en_timestamped` export, whose cross-attentions
yield word-level timestamps) through transformers.js — WebGPU where Chrome
has an adapter, WASM otherwise — and matches the recognised words back onto
the caption's own words by longest common subsequence over normalised tokens.
The text is known in advance, which is what makes a tiny model enough: the
transcript only has to be close enough to line up, never to be read. Words
Whisper drops or mangles ("truth—and", "1:1") are interpolated between their
matched neighbours; the first word starts no earlier than the first sound;
each phrase holds until the next begins. About 40MB of model, fetched from
Hugging Face on first use and cached by the browser; a 15-second reading
transcribes in a second or two.

**Why this and not the heuristic.** The energy-weighted timing
(`timeWords`) is still computed first and is the fallback — no model, no
network, an unsupported browser, a transcript that will not line up — so a
post is never blocked on this. But it was measured against Whisper on a real
reading and one word was 1.6 seconds late ("know" at 11.7s against 10.1s):
a highlight that lands a beat off reads as wrong, and the whole point of the
highlight is that it lands. `align: false` on any render keeps the heuristic
for a fast preview.

Under it, the phrase layer is unchanged: clauses are pinned to the pauses
Whisper's timestamps reveal, and when the model is unavailable, to the
silences `speechSegments` finds (≥220ms), else proportionally.

The word being spoken is drawn in gold; words already said are white; words
still to come are held back (42% on the story panel, 50% over the verse). A
caption with no word timings — the lead-in hook, and both posters — is drawn
plain white, and is still split into words, because a single unbreakable token
does not wrap.

The reference is spoken as "Matthew 16, verse 18" (`spokenReference`) so the
voice never reads a colon.

## The audio track is checked, not assumed

The first real render came out mute: the video was perfect, the MP4 had an
AAC track full of real speech with a correct decoder header — and QuickTime
and TikTok played nothing. The cause was TIMING. AAC frames are always 1024
samples, but the encoder had been fed 4800-sample chunks, which is not a
multiple of 1024, and Chrome stamped the frame straddling each chunk boundary
with the next chunk's time: the track's `stts` table read 704, 1024 and 1728.
Chrome's own decoder tolerates that, which is why a decode-and-listen check
passed while every real player dropped the track. (Opus packets are 960
samples and 4800 IS a multiple of 960, which is why the WebM path never
showed it.)

So `tiktokRender` now does three things, and the third is the one that
matters: it feeds the encoder in whole codec frames (4×1024 for AAC, 5×960
for Opus); it stamps every AAC frame onto the 1024-sample grid itself instead
of trusting the encoder's timestamps; and after muxing it walks the finished
MP4's box tree (`mp4AudioDeltas`) and refuses any audio track whose deltas are
not all 1024, then decodes the file with the browser's own demuxer to be sure
it is audible. A file that fails either check is re-rendered as WebM rather
than handed over. The checker is pure over bytes and was run against the mute
file itself, which it rejects.

It also builds the two-byte AAC AudioSpecificConfig whenever the encoder's
`decoderConfig.description` is missing, since an `esds` without it is the
other way to ship a silent track.

## Rules that carry over from the app

- **No comparison, no shame.** The copy prompt says so, and the end card is an
  invitation, not a score. Nothing here reads a player's data.
- **Every image comes from Nano Banana.** The still is generated through the
  same model `scripts/gen-art.mjs` uses, from the app's own renders as refs.
- **The key never reaches a client.** The function verifies `sharkbait` the way
  `push-send` does; the panel only ever holds public URLs.
- **Not a store surface.** The tab is inside `/admin`, which renders nothing for
  any other account, so the baked `dist` carries it harmlessly.

## Costs, roughly

TTS ~1¢ a day, copy a fraction of that, a 2K still ~25¢ once, a Veo loop $1–3 once
per figure+scene. The video encode is free (your laptop). About 20–40 seconds a
day of encoding for a 35-second post.

## Ideas parked

- Two-part format: the verse, then one of the day's trivia questions with the
  teach line as the reveal.
- Moving the operator's art (`public/tiktok/`) into the Storage bucket, so the
  App Store build stops carrying megabytes only the dashboard reads.
