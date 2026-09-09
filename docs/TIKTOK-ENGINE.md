# The TikTok engine (Admin → TikTok)

Three posts a day for a faceless Verse Arcade TikTok, each behind its own pill
in Admin → TikTok: the **verse reading** (a painted figure — Peter by default —
standing in a Verse Arcade scene, reading the verse of the day, captioned WORD
BY WORD), **story time** (Tabitha telling the story behind it) and
**yesterday's quiz** (a CPU playing yesterday's five questions against the
clock). All end on `versearcade.org`. This is an **operator tool**: admin-only,
online-only, desktop Chrome, behind the dashboard's three gates. It has exactly
ONE player-facing surface — a row of links to yesterday's verse video on the
result screen (see "What a player sees" below) — and nothing else it does
reaches anybody's screen.

The panel is a hub (`TikTokPanel.tsx`) and three generators
(`admin/tiktok/VersePost.tsx`, `StoryPost.tsx`, `QuizPost.tsx`) over one
`shared.tsx`. Tapping a pill opens that generator and nothing else — the forms
used to share one page, and with the second one it was already a page you
scrolled to find anything on.

## What one click produces

- `verse-arcade-<date>.mp4` — 1080×1920, 30fps, H.264 + AAC (or VP9/Opus WebM
  if the browser can't do H.264), audio baked in. The hook line large on the
  first frame with the voice starting under it at 0.35s, the reading with
  captions, and a 2.6s end card that carries the brand and the reference.
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

## The first frame is the hook, and the voice does not wait for it

Every layout used to open the same way: the brand at the top, the reference
under it, and — for 1.8 seconds — the hook line in the caption slot over a
silent painting. That is the shape of a title card, and a feed judges a post
in the time a title card takes. So the order was turned around, once, in
`lib/tiktokRender.ts` (`LEAD`, `HOOK_HOLD`, `drawHook`, `drawBrand`), for
all three painted layouts:

- **The hook is on screen at 0.0s, large, at the top of the frame** — gold,
  outlined, two lines at most — and holds for about three seconds before the
  painting has the top of the frame back. It is the thumbnail every network
  cuts, and the one line a thumb reads.
- **The voice starts at 0.35s**, under the hook, and the first caption lights
  with the first word. Nothing is held back for a lead-in.
- **The brand and the reference moved to the END card.** The reference is also
  the last thing the reader says, so nobody leaves without it; what it no
  longer does is spend the first second of every post on a label.
- The story's hook is its own **most dramatic sentence** (the function's
  `story` prompt asks for exactly that, at most ten words), and its first
  paragraph opens on the same moment — the whole telling is two paragraphs
  and about a minute now, where it was three and ninety seconds.
- The challenge's hook is the **question itself**, which is why that layout
  has no separate hook line: it opens on the prompt at 64px with the clock
  already running.

`plannedDuration()` follows the same constant, so the music bed is rendered
to the length the frames actually take.

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
  because TikTok drops line breaks (`withAsk` collapses the model's own
  paragraph breaks for the two networks that flatten them). Facebook: a Reel
  with the hook as its title. Instagram: a Reel shared to the feed, five hashtags at most. X: one
  line under 280 characters with two tags (and Ayrshare still calls it
  `twitter` on the wire — `ayrshareName()` in `social.ts` is the one place
  that translates). Threads: 500 characters, links tappable, the AI note in
  the caption, two tags, and NO quiz — `postsOn` in `social.ts` keeps the
  month under Ayrshare's 1,000-post plan by having a network give a kind up,
  and Threads gives up the 107-second replay. Pinterest: the verse and the
  story only — it is a search engine, so the copy prompt writes a title that
  leads with the reference and a description in the words somebody would
  type, the pin links to the site, and a video pin needs a same-size cover
  (`days/<date>/<kind>-cover.jpg`, the frame at 0.3s: the hook line over
  the painting), which the runner cuts with ffmpeg and the hub with a
  `<video>` and a canvas; no cover ⇒ skipped with the path, never failed.
  Snapchat: Spotlight only — its discovery feed, where an
  account nobody follows yet is still shown to strangers; asked for together
  with a saved story, Ayrshare posted only the story, which lives on the
  profile for people who already found it. TikTok's short line with three
  tags. A platform with no block of its own borrows TikTok's.
- **A video over 90 seconds goes to Facebook as a plain video, not a Reel.**
  Reels stop at 90s and Facebook refused the quiz (about 107s) and a
  91-second story on the first real day. The runner reads the length with
  ffmpeg and the dashboard from the video's metadata, both send it as
  `seconds`, and `social.ts` drops `reels` over the ceiling. The other
  networks take the length as it is.
- **Every post says the art and voice are AI-made.** TikTok
  (`isAIGenerated`), YouTube (`containsSyntheticMedia`) and Instagram
  (`isAIGenerated`) take it as a flag and draw their own label; Snapchat,
  Facebook and X have no flag on Ayrshare's API, so the caption carries the
  line `AI-generated art and voice.` — first on Snapchat, whose Spotlight
  review rejected the first verse as "undisclosed AI-generated content". A
  rejected post is re-sent with `attempt: 2`, which joins the idempotency key
  so Ayrshare takes it as new.
- **X posts with the account's OWN developer app, and the keys ride as
  headers.** Since 2026-03-31 Ayrshare has no X keys of its own: every
  account registers an X developer app (console.x.com — "Web App, Automated
  App or Bot", callbacks `https://app.ayrshare.com/social-accounts` and
  `https://profile.ayrshare.com/social-accounts`, Read and write) and its
  Consumer **API Key** and **API Secret** go on every X-bound request as
  `X-Twitter-OAuth1-Api-Key` / `X-Twitter-OAuth1-Api-Secret`. Ayrshare stores
  neither, so the function carries them the way it carries the Ayrshare key:
  `X_API_KEY` / `X_API_SECRET` function secrets first, then Vault through
  `tiktok_x_api_key()` / `tiktok_x_api_secret()` (`0104`). `ayrshare()` takes a
  `forX` flag and `post`, `links` and `analytics` set it for X rows. With no
  keys the headers are simply absent and X is refused as before. The OAuth 2.0
  Client ID / Secret, the Bearer Token and the Access Token pair on the same
  X page are NOT what it wants.
- **A platform that isn't linked in Ayrshare yet is skipped, not failed.**
  `post` reads the account's active networks first and records a `skipped`
  row for the rest, so X can sit in every list before the account exists and
  the first run after it is linked simply reaches it. The record is merged
  over the earlier one, and the runner re-posts only to platforms not yet
  accepted.
- **No caption carries a link, on any network, and the ask is the same
  everywhere: share it.** Two reasons. The measurable one is Facebook's own
  Professional dashboard, which lists "remove links from your caption" among
  the things a Reel is rewarded for, and every feed that ranks video treats
  an outbound link the same way. The one that decided it is that a post
  ending in a URL reads as an advertisement, and these have to read as
  something a person would say and pass on. The brand is IN the video — the
  end card, the site, the reference — so the caption is just the words.
  `dropLinkSentence()` removes whole any sentence carrying a versearcade.org
  mention (a bare mention as well as a real URL: the model writes both) and
  `callToAction()` puts "Share this with someone who needs to hear it today."
  on the end. A challenge asks for the comment first and the share second.
  There is deliberately NO second ask — a caption asking for a share and a
  follow and a comment asks for none of them, and the follow is the weaker
  one anyway: it reaches people already watching, where a share reaches a
  stranger's feed. The copy prompt asks for the same tone; social.ts is the
  guarantee, over words a model may not have written that way.
- **The tracked link is not lost — it moves.** On **Facebook, YouTube and X**
  it goes out as Ayrshare's `firstComment`, added when the post actually
  publishes, which is also the only moment a SCHEDULED post has an id to
  comment on. All three were validated against the live API before shipping
  (a scheduled post carrying `firstComment` is accepted by Ayrshare's
  pre-validation, then deleted). The other five are deliberate omissions:
  Ayrshare will post a first comment on **TikTok** and **Instagram**, but a
  link in a comment there is dead text, so one would buy nothing; **Snapchat,
  Threads and Pinterest** have no comment endpoint on Ayrshare at all. Those
  five carry `?src=<network>` in their **bio link, set by hand** — which is
  what TikTok, Snapchat and Instagram already did, with **Threads joining
  them**. Pinterest also keeps its tracked URL in `pinterestOptions.link`,
  which is the pin's DESTINATION rather than caption text: tapping a pin is
  following the link.
- **Snapchat's 160 characters are budgeted by what must survive them.** The
  AI disclosure first (its Spotlight review rejected the first verse as
  "undisclosed AI-generated content"), then the words, then a SHORT form of
  the ask, then a tag if there is room. What gets shortened is the model's
  words, cut at a whole SENTENCE where one fits and only otherwise at a word
  — a `slice(0, 160)` over the assembled post ended one halfway through the
  word "share".
- **Two of Facebook's tips are not reachable from the API and stay manual.**
  Ayrshare's Facebook options carry no subtitle or caption-file field, so a
  real CC track cannot be attached from here — the videos' burned-in
  word-by-word captions are the accessibility that ships, and a CC track
  would be uploaded by hand in Meta Business Suite. Reels PLAYLISTS have no
  Ayrshare endpoint at all (its only playlist API is a YouTube analytics
  read), so adding a Reel to one is a manual step on the page. Don't add
  either to the runner as a silent no-op.
- **`social`** reports what Ayrshare has connected and this month's post
  count against the plan's quota; the hub shows it, and warns in coral on a
  plan that five videos on five networks (twenty-five posts a day) will
  exhaust.
- **`analytics`** reads Ayrshare's per-post numbers for one day's record of
  one kind — views, likes, comments, shares, seconds watched, new followers,
  under whatever name each network gives them — and caches them six hours at
  `days/<date>/analytics-<kind>.json`. The hub's **The last seven days** card
  fetches a week of them (35 calls, one per day and kind) and totals them per
  network and per kind. Operator numbers about posts elsewhere; nothing here
  is a player.

## The morning cron: the same five posts with nobody at the dashboard

`scripts/tiktok-daily.mjs`, run by `.github/workflows/tiktok-daily.yml` every
morning (09:30 UTC — 05:30 New York, an hour of slack under the verse's 07:00
slot so the DST shift never lands a post late) and on demand from the Actions
tab. It makes the day's five videos and hands them to Ayrshare, each
SCHEDULED at its own time of day in `TIKTOK_TZ`:

| Post | Default slot | Why then |
|---|---|---|
| The verse | 07:00 | the day's verse is what the morning is for; it lands before the commute and before anyone opens the app |
| Challenge 1 | 10:00 | a twenty-second question in the mid-morning lull, about yesterday's verse |
| Yesterday's quiz | 12:30 | a lunch-break play-along, and by noon yesterday is safely yesterday everywhere the app is played |
| Challenge 2 | 16:00 | a different question, a different face, for the afternoon scroll |
| Story time | 19:30 | Tabitha's is an evening story, told after the day's verse has been read |

Override with the `TIKTOK_POST_TIMES` repository variable
(`verse=07:00,challenge=10:00,quiz=12:30,challenge2=16:00,story=19:30`) and
`KINDS` on a dispatch. A slot already past when the runner gets there posts
immediately rather than tomorrow. Five posts on five networks is
twenty-five a day, 750 a month against the plan's 1,000.

It finishes by calling `links` for YESTERDAY's five records: those posts have
published by now, so this is where the URLs a scheduled post never carried get
written down — and the app's "watch yesterday's verse" row has nothing to offer
until they are.

Four things about it are load-bearing:

- **It renders EXACTLY what the button renders.** The runner bundles
  `src/lib/tiktokDaily.ts`, which calls `makeVerse` / `makeStory` /
  `makeQuiz` from `features/admin/tiktok/make.ts` — the same functions the
  three generator cards call — in headless Chromium, and catches the finished
  file as a download. There is no second renderer to drift. Headless Chromium
  on Linux encodes VP9/Opus WebM, so every file goes through ffmpeg once into
  H.264/AAC MP4 (the shape TikTok and Instagram accept) before upload.
- **Function mode is the deployed one.** With `TIKTOK_RUNNER_TOKEN` the
  runner calls `tiktok-gen` as the admin: the token lives in Vault (`0102`,
  `tiktok_runner_token()`), travels as the `x-runner-token` header beside the
  anon key (which is what gets it past the gateway's JWT check), and the
  function compares digests. It was NOT built on the service-role key, the
  obvious credential: that key can do anything to the project, and a CI
  secret whose job is posting videos should be able to post videos and
  nothing else. Rotating it is a new Vault row. The voice, the copy, the
  story and the finished MP4 all land in the bucket and the dashboard shows
  the day exactly as if it had been made by hand; `days/<date>/posted-<kind>.json`
  is written by the same `post` action.
- **Local mode exists for a machine with no service key** (`AYRSHARE_API_KEY`
  + `GEMINI_API_KEY`): a shim stands in for the function, makes the reading
  through Gemini directly, reads the day's copy and story from the bucket's
  public cache and NEVER writes there, and the video goes to Ayrshare's own
  media store — which is a Premium-plan endpoint, so on the free plan this
  mode renders and cannot post. The words per network come from `tiktok-gen/social.ts`, which
  the function imports and the runner bundles — one copy of what a TikTok
  caption or a YouTube title looks like.
- **A re-run cannot double-post.** Ayrshare's idempotency key is
  `va-<date>-<kind>-<platform>` on both paths, so running the workflow twice
  on a day (a retry, a manual dispatch after the cron) schedules nothing
  twice.

Secrets it needs, as GitHub Actions secrets: `TIKTOK_RUNNER_TOKEN`
(required — the value of the Vault secret of the same name), `SUPABASE_URL`
and `SUPABASE_ANON_KEY` (optional, defaulted to the project). `TIKTOK_TZ` is a
repository variable. The Gemini and Ayrshare keys never reach the workflow:
the function reads them from Vault.

The aligner's Whisper model comes from huggingface.co on first use; a runner
with no route there (an egress-filtered sandbox) can set `MODELS_DIR` to a
directory holding `models/onnx-community/whisper-tiny.en_timestamped/…` and
`ort/ort-wasm-simd-threaded*` and the page fetches them from the runner
instead. Every render still falls back to the energy heuristic if the model
fails to load, so a post is never blocked on it.

## What a player sees: "Watch yesterday's verse"

The app spent a year advertising nothing about the account advertising it. The
one crossing point is a row on the result screen, right under the verse card,
the moment somebody finishes the daily drop: **Watch yesterday's verse**, and a
pill per network that actually has the video up (`WatchYesterday.tsx` over
`src/lib/socialPosts.ts`).

- **It reads the bucket, not an RPC.** `days/<date>/posted-<kind>.json` is
  parked by the `post` action in a bucket that is public read, so the app gets
  the day's links with a plain GET — no table, no migration, no auth, guests
  included.
- **It is YESTERDAY's, and that follows from how posting works.** A scheduled
  post has no URL until the network publishes it, and the cron schedules all
  three at their own hour — so today's links do not exist yet when today's
  player finishes. Yesterday's were filled in by this morning's run.
- **`links` is what fills them in.** `POST { action: 'links', date, kind }` asks
  Ayrshare (`GET /post/<id>`) what became of each row that has an id and no URL,
  and re-parks the record. The runner does it for yesterday every morning; the
  **↻ Links** button on a posted card does it by hand. Nothing else would: the
  record is written hours before the videos exist.
- **It fails closed and says nothing when there is nothing.** No keys, no
  record, a post still pending, a network not linked → the row does not render.
  There is no error state and no "coming soon".
- **A link may only go where it says it goes.** The URLs come from Ayrshare
  rather than from us and land in an `href` on a player's screen, so each is
  checked against the host of the platform it claims to be — https only, known
  host only. Same rule as the catalog's `art` URLs.
- **It carries no number.** No views, no likes, nothing countable — the app
  doesn't count people at each other and a link out is no place to start.

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
- **Scene** — Advent from 30 November to Christmas Day; otherwise one of
  nine roads, preferred by mood (the lamplit road for comfort, the shore for
  the words of Jesus, the city gate for a warning, the hills at dawn for
  praise…) and rotated — see below.
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

**The cast ROTATES, and the rotation is deterministic.** A week of Psalms was
a week of David on the Harvest Road, which on an account posting daily read
as one video reposted. Since the rotation epoch (`ROTATION_EPOCH` in
`admin/tiktok/shared.tsx`, 2026-09-07) each pick is a preference list —
`readerPrefs` / `scenePrefs` in `data/tiktokVoice.ts`, the verse's own
choice first — and `autoCast(date)` takes the first entry not used in the
last two days (readers) or six days (scenes). Each day is computed with the
previous days' picks in view, walking forward from the epoch and memoised,
so the dashboard and the morning runner arrive at the same cast for the
same date by construction — the guarantee `getVerseForDate` makes, by the
same means. Days before the epoch keep the old book-only cast, because their
videos were made under it. The seven new roads are `art/tiktok-scenes.json`
(a `tiktok-road` kind: 9:16, 2K, `public/tiktok/roads/`), painted with the
Harvest Road and Lamplight as references so the ten read as one hand; a
scene whose painting is missing falls back to the Harvest Road
(`loadScene`) rather than failing the post.

## Story time: the evening post

The same panel has a second mode. **Story time** is Tabitha, the app's
librarian, telling the story BEHIND the day's verse: 60 to 90 seconds in her
library, sitting on a stool with a circle of children cross-legged in front of
her, the words she is saying on a panel above her, and the verse itself read
plainly at the end. About a minute since the hook-first change: two
paragraphs, 80 to 100 words, opening on the dramatic moment. It is the morning post's other half — Peter reads the
verse; Tabitha tells you what was happening — and it costs about three cents:
a Gemini Flash script and a longer TTS.

- **The script is written from the pool entry's own narrative fields** —
  `before`, `after`, `speaker`, `audience`, `facts` — and the function's prompt
  forbids anything not in the passage's plain narrative. Cached at
  `days/<date>/story.json`; **↻ Rewrite** asks again. Two paragraphs: the
  first OPENS on the dramatic moment and only then says where we are, the
  second is what came after and why it matters, then the verse. (It was
  three paragraphs and 120–150 words; a story that ran past ninety seconds
  was also the one Facebook refused as a Reel.) A cached three-paragraph
  story still renders.
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

### The stages: where each paragraph is SET

The telling used to be one picture — her library — held for a minute while she
told what happened somewhere else entirely. It now CUTS: one held painting per
paragraph, to the place that paragraph happens in, and back to the library for
the verse. `data/tiktokStages.ts` is the list, `art/tiktok-stages.json` the
prompts, `public/tiktok/stages/` the paintings.

**A cut is the whole of the motion this adds, and that is the point.** The rule
on these layouts is that the only thing moving is the caption, and it exists
because drifting motes, a warm pulse, a hovering figure, page-turn wipes and Veo
loops summed to something that read as GENERATED rather than painted. None of
that is a cut. A picture book is entirely still images and reads as story, so
this buys the story feel at no cost against the rule — where a floating figure
or a Veo shot of the scene would spend the whole of it.

What each cut carries besides the picture is **one camera being placed**: the
new shot arrives 3.5% wide and settles over 0.9s (`SHOT_PUSH`, `SHOT_SETTLE`),
the same on every cut including the handover, so it is a grammar rather than an
effect on one moment.

Five rules:

- **The stage list is the PREPACK.** The client sends the ids IT has with the
  `story` request; Gemini picks inside that list; the function validates the
  answer against exactly what it was sent and keeps no list of its own. The
  paintings ship in the app bundle, so the build is the only thing that knows
  which exist. Adding a stage costs a release, CHOOSING one is content — the
  same bargain `KNOWN_VERBS` makes for a season's quests.
- **It fails closed at every step.** A story cached before stages existed (no
  `scenes` key), an id this build lacks, a painting that 404s, an ungenerated
  batch: all of them are the library, which is a complete post and is exactly
  what shipped before this.
- **The last paragraph is never staged.** `makeStory` appends the verse and its
  reference, and Tabitha reads that from her own book in her own room. Coming
  back is what makes the middle feel like somewhere she took you.
- **Tabitha is not drawn on a stage.** The drawn teller (for a room that does
  not already have her painted in) renders only while the library is up: she is
  narrating what happened there, not standing in it.
- **Consecutive identical shots collapse.** Two paragraphs on the same stage is
  one held painting, not a cut to itself — which would settle for 0.9s in the
  middle of a sentence and read as a glitch.

Ten stages, chosen for the settings the narrative books keep returning to
rather than for variety: `road`, `house`, `hills`, `water`, `gate`, `temple`,
`prison`, `field`, `upper`, `wilderness`. A throne room is the obvious
eleventh. Deliberately not fifty: a stage only loosely about the sentence being
spoken is worse than one steady picture, which is exactly why the per-paragraph
picture CARDS came out of this layout once already.

`npm run check:stages` (in `npm run build`) asserts every declared stage has a
painting, because the failure renders perfectly — the model picks the id,
`sanitizeStages` keeps it (it IS an id this build carries), the load 404s, and
that paragraph is quietly told in the library forever.

### His own stage

His half used to play over her library with his photo growing into the middle
of it. The objection that kept the morning post's reader swap off this layout —
"that is Tabitha's room, a second figure in it is a stranger in somebody else's
library" — applies to that too, and it is about the ROOM rather than about him.
So he gets a stage: `own.jpg`, a dark empty space with one warm pool of light,
and the `sharkey` figure standing in it. That narrows the old rule rather than
overturning it. Her room is still hers.

- **The figure REPLACES the photo ring** while it is up. He is already on
  screen; a photograph of the same person floating over him is him twice. The
  photo still closes the post on the end card.
- **Where he stands is measured, not chosen.** The pool of light is centred at
  0.77 of the frame once `cover` has anchored the painting to its bottom edge,
  and the caption panel ends at y=668, so `STORY_STAND` is feet at 0.79, 0.41
  high — in the light, head clear of the panel, at the same size the road's
  figure is drawn. **Re-render `own.jpg` and both numbers have to be checked
  again**, because the light moves.
- **It fails closed twice.** No stage painting, or no figure render, is his
  photo over the library exactly as before — never a failed post.

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

## The one-question challenge: "Can you beat Peter?"

The fourth and fifth posts of a day (`makeChallenge` in `admin/tiktok/make.ts`,
`ChallengePost.tsx`, kinds `challenge` and `challenge2`). ONE of yesterday's
five questions, read aloud by the day's reader as a twelve-second clock
starts, the reveal with the question's own teach line, and an ask to comment
— about twenty seconds, which is the length a feed actually finishes. The
five-question replay is the long form of the same idea; this is the one
built to be watched to the end and answered in the comments.

- **It is the quiz layout in `solo` mode**, not a fourth renderer:
  `QuizInput.solo` drops the verse card, opens on the question at 64px with
  the clock already running, holds the reveal for 5.5 seconds, and ends on
  "Did you beat Peter? Comment your answer" instead of a score. Same
  `quizTimeline`, same cues, same `produce()`.
- **Two a day, and the second is a different post.** `challengeIndex(date,
  slot)` picks the question two apart in the day's five, and `challengeCast`
  gives the second slot the next reader on the next road, so the afternoon's
  is not the morning's again. Both are `challenge*` kinds because every path
  in the bucket and every idempotency key is per (date, kind).
- **Yesterday's verse, like the replay**, for the replay's reason: today's
  answers on a public feed would spoil the drop. And **the CPU's play is the
  replay's play** — the same `quizPlan` for the same date, sliced to one
  question — so the two posts never disagree about whether Peter got it.
- **The caption teases the question and never answers it.** The `copy`
  action takes the question for these kinds and the prompt says so twice.

## The comment replier: the account answers

The challenges ask people to comment A, B, C or D, and an account that
answers gets shown more. `.github/workflows/tiktok-replies.yml` runs
`scripts/tiktok-replies.mjs` every two hours: for today's and yesterday's two
challenge posts it asks the function's `replies` action to read the comments
on each network's copy through Ayrshare (`GET /comments/:id`), have **Grok**
draft a one-line reply to each ANSWER-shaped comment, and post it as a reply
to that comment (`POST /comments/reply/:commentId`, `searchPlatformId`, and
TikTok's `videoId`). The hub's **Replies** card is every word it has said in
the last three days, with **Draft only** and **Reply now** buttons.

Four rules keep it a reply rather than a bot:

- **Only answers.** A comment is screened by a cheap rule first (a lone
  letter, a number 1-4, a word from an option), then Grok decides whether it
  is an answer at all; a question, praise, an opinion or an argument is left
  alone, and it never replies to a reply or to its own comments.
- **Once per person per post, once per comment ever.** The record at
  `days/<date>/replies-<kind>.json` is the memory, so a run two hours later
  reaches only new comments. A dry run records nothing.
- **Warm, one sentence, no emoji, no link, and a wrong answer gets the fact,
  not a verdict** — the question's own teach line, in the account's own
  voice. The prompt forbids ranking, comparing and mentioning an AI.
- **Capped per run** (20 by default), and everything said is parked so the
  operator can read every reply the account has ever made.

The function has no verse data, so the caller hands it the question,
options, answer and teach line from `lib/tiktokChallenge.ts` — the same pure
function the renderer used to pick the question, bundled alone for Node.
Grok is the one thing here that is not Gemini, because the operator holds
**X is read and never answered.** X's automation rules
([help.x.com/…/x-automation](https://help.x.com/en/rules-and-policies/x-automation))
allow automated replies only to people who asked to be contacted, forbid
replies driven by keyword search, and require X's prior written approval for
any AI reply bot; and since February 2026 `POST /2/tweets` refuses a
programmatic reply unless the original author @mentioned or quoted the
account. So the `replies` action lists X's comments under `skipped` with the
reason and posts nothing there — the operator answers those by hand from the
X app. The other five networks are replies on the account's OWN posts to
people who commented on them, which is the case every platform's automation
policy allows. Two ideas were looked at and rejected on the same page:
replying to a curated list of Christian influencers' posts every few hours,
and replying to people whose posts ask a Bible question. Both are unsolicited
automated replies (the second is the keyword-search case by name), both are
the shape of account that gets restricted, and X's API now blocks the
mechanism anyway.

## The story's own word: a closing one, or an introduction

The evening story is Tabitha's telling, and since the operator's voice
arrived it can carry ~20 seconds of him at ONE END of it: his photo grows
into the middle of the frame while he speaks, his words are captioned from
their own timings, and the end card keeps him small under the ask. The
telling is unchanged and complete without him, so a day with no recording
renders exactly as it always did.

`place` picks the end. **`close`** answers her — the thing the story turned
on, then one plain thing he carries from it. **`open`** introduces her and
hands over by name ("In this round-up, Tabitha…"), which is shorter (30–45
words, ~15 seconds) because it is spending the opening of the video.

A day carries ONE of them, never both: two turns from the same voice around
one story is a conversation with one person in it. So both use the single
parked recording, and the place is written into the transcript when it is
listened to (`--intro`) rather than chosen at render time — a recording made
as a closing word cannot then be moved to the front. Only the DRAFTS are
cached apart (`thought-story.json` / `thought-story-intro.json`), so both
can be written and one chosen.

**An introduction may not push the hook off frame 0**, which is the one rule
this layout has. His photo therefore waits for the hook to fade rather than
arriving with his first word (`ownShow`); his voice starts at 0.35s under
the hook exactly as the verse layout's reading does, and it is his WORDS
that open, never a title card. He steps back out as she begins (`ownHide`),
so the last thing before her first word is her room and not his face.

Two voiced posts a day (the morning verse and this) was chosen over voicing
all five deliberately. YouTube judges a channel and one genuinely human
format lifts the whole of it; TikTok and Meta judge each post, so those two
are the ones that earn. Four extra recordings a day is 28 a week, and a
cadence that stops looks worse than one that never started. The challenges
and the quiz stay automated and labelled.

- **His half is the same shape as a verse recording with an empty `verse`.**
  It parks at `days/<date>/voice-story.{wav,json}`, so `refit`, the `fix`
  correction step, `voice` / `voice-clear` / `upload-url` and the renderer's
  caption path are all the ones that already existed, keyed on kind.
  `transcribeOwn` (`lib/tiktokVoice.ts`) is the only new listener — there is
  no verse inside it to find, and `place` is metadata it carries rather than
  anything it does — and `ensureOwn` mirrors `ensureVoice` so the morning
  runner can listen for itself when a phone only uploaded.
- **Both drafts are written FROM the telling** — `thought` with
  `kind: 'story'` and a `place`. The closing word is 45–60 words (about
  twenty seconds): it opens by naming in one breath the thing the story
  turned on, so somebody who half-watched still has it, then one plain thing
  he carries from it, and ends on a statement. The introduction is 30–45
  words and pulls the opposite way — it names the QUESTION the story is
  about to answer, is forbidden from telling it, giving away the turn or
  quoting the verse (Tabitha does all three in a moment, and the hook on
  screen is already saying the dramatic thing), and ends by handing over to
  her by name. Both are a second call rather than a flag on the first
  because the morning thought comes off the verse's own data and can be
  drafted a week early, while a word about a story cannot exist before the
  story does. `drafts` prints the day's two, so one sitting records the week;
  `--intro` swaps which story half it drafts.
- **The other speaker's captions are closed where this one begins.** A
  caption holds until the next one so a pause is not a blank panel; the last
  caption of a half has nothing after it to stop it, and Tabitha's held
  FOURTEEN SECONDS into his — his voice, her words on the screen. The frame
  lookup takes the first phrase whose span covers the moment, so the
  over-running one shadowed the right one. Every phrase is now closed at the
  handover, and the two halves are concatenated in SPEAKING order so the
  lookup finds the right one first; the verse layout has carried the same
  line since it grew a thought. It rendered perfectly throughout — only
  reading the captions off a real frame found it, which is why `render` now
  prints the caption count.
- **A pause holds the last caption SPOKEN, not the last one in the array**
  (`heldPhrase`, shared by both layouts). Those were the same thing while the
  array was one speaker's words in order. With an introduction they are not:
  the beat between his last word and Tabitha's first, about a second and a
  half, held HER closing reference line — one frame of the end of the story
  at the start of it. Found by pulling the frame out of the MP4, like every
  other bug on this layout.
- **Her captions are timed against HER samples only.** `timedCaptions`
  matches a transcript to a recording, so handing it her minute of words over
  audio that ends in somebody else's voice makes it chase the tail and
  stretch her last phrases across his. When he opens, her timings are
  computed against her own recording and then SHIFTED by where it starts.
- **The music bed covers both.** `plannedDuration` takes his audio too, or
  the bed runs out under the one part of the post a person actually spoke.

From a terminal it is the same loop as the verse with `--story` on the end:

```bash
node scripts/tiktok-voice.mjs drafts 2026-09-08 7          # verse + closing word
node scripts/tiktok-voice.mjs drafts 2026-09-08 7 --intro  # verse + introduction
node scripts/tiktok-voice.mjs listen 2026-09-08 memo.m4a --story [--intro]
node scripts/tiktok-voice.mjs fix    2026-09-08 fixed.txt  --story
node scripts/tiktok-voice.mjs render 2026-09-08            --story
node scripts/tiktok-voice.mjs post   2026-09-08            --story   # 19:30 by default
```

## Where the sign-ups come from

No caption carries a link. The tracked link is
`https://versearcade.org/play?src=<network>` (`siteLink` in `social.ts`) and
it reaches people two ways: as the post's FIRST COMMENT on Facebook, YouTube
and X, and as the profile's BIO LINK — set by hand, same shape — on TikTok,
Snapchat, Instagram and Threads. Pinterest carries it as the pin's own
destination. `/play` is open to a guest, so the stranger plays today's
verse first and meets the account wall with a streak started — that is the
conversion path, not the homepage. The client keeps the first `src` it sees
(`lib/attribution.ts`), and `set_signup_source` (0106) files a NEW account
under it, once, server-side. The hub's weekly table shows Sign-ups beside
views per network.

xAI credits: `XAI_API_KEY` as a function secret or Vault through
`tiktok_xai_key()` (`0105`), model `XAI_MODEL` (default
`grok-4.20-0309-non-reasoning`). With no key the action fails closed with a
clear error and nothing is posted.

## Your voice: the operator reads the verse

The morning post is Gemini's voice unless a recording of the operator is
parked for the date, and the hub's **Your voice** card
(`admin/tiktok/YourVoice.tsx`) is where one gets parked. This is the human
element the platforms that pay ask for: a person reading the verse and
saying one thing about it is a human-produced video with AI visuals, where
the same painting under a synthetic voice is not. Nothing else about the
post changes — the painting, the reader figure, the gold captions and the
end card are as they were — and the day's other four posts stay fully
automated. Full workflow, in the order the operator does it:

1. **Draft.** `thought` writes a ~110-word spoken reflection per date from
   the verse's own data (speaker, audience, before, after, theme, facts —
   never invented doctrine, nothing one tradition would say differently),
   first person, short sentences, ending on a line that hands off. Cached
   at `days/<date>/thought.json`; `force` redrafts, `save` parks the
   operator's own edit, `peek` reads without drafting so opening the card
   for a week costs nothing. Once a few recordings exist their transcripts
   ride along as `samples`, so the draft starts sounding like the person
   rather than like a devotional.
2. **Record.** A phone voice memo: a beat of silence, the verse read a touch
   slower than speech, no reference (the end card has it), a beat, the
   thought, stop. One take, don't edit.
3. **Upload — from the phone is fine, and a phone only uploads.** The
   listener is ~140MB of Whisper in WASM and blanked an iPhone tab twice, so
   on a phone the card stops at the parked WAV; the desktop hub offers
   **Listen to it** for a recording with no transcript beside it, and the
   morning runner listens on its own (`ensureVoice`, `make.ts`) when nothing
   has, rewriting the day's copy at that moment. On a desktop
   `lib/tiktokVoice.ts` does the rest in the operator's tab.
   `decodeRecording` turns whatever the phone produced into a mono 24 kHz
   WAV, trimmed and levelled to where Gemini's readings sit, parked at
   `days/<date>/voice-verse.wav`. `splitRecording` transcribes it with the
   same Whisper the captions use and finds the VERSE inside the transcript
   by matching the verse's words onto it (`fitWords` in `tiktokAlign`, the
   LCS the aligner always used); everything heard after the verse's last
   word is the THOUGHT, captioned from the transcript itself. A spoken
   reference at the head of the thought is dropped. The hub shows the
   transcript for correction — Whisper tiny mishears a word now and then —
   and `refit` puts the corrected words back onto the timings Whisper
   heard. **Save** parks `days/<date>/voice-verse.json` (`VoiceTrack`: the
   timed verse words, the timed thought words, the raw heard words, the
   text) and rewrites the day's verse copy, since a caption written earlier
   credits a painted Peter with the voice.
4. **Nothing else.** `makeVerse` asks `voice` for the date first; a parked
   track means the WAV is the audio, the parked timings are the captions
   (no Whisper at render time, so the 07:00 runner needs no model on a
   voiced day), and the render carries `voice: { verse, thought, photo,
   label }`. No track ⇒ Gemini's reading exactly as before. The Verse
   reading card shows a parked recording and a tick to force Gemini's
   voice for one render (`ownVoice: false`).

**Or without the dashboard at all: `scripts/tiktok-voice.mjs`.** The same
loop from a terminal, which is what a Claude Code session runs when the
operator sends memos there instead of opening the hub — `drafts [start]
[days]` prints the week as Markdown, `listen <date> <file>` parks and
transcribes any phone memo, `render <date>` makes the verse post as an MP4
to look at, and `post <date> [--at HH:MM]` schedules it only when asked.
It bundles `src/lib/tiktokVoiceCli.ts` into headless Chromium the way the
morning runner does, so all three doors render the same video.

What the render does with it (`tiktokRender.ts`): the verse's words light
gold on the operator's own timing; the reference shows plain through the
beat of silence after the verse; then the thought plays, and for that
stretch a round photo of the operator (`founder/photo.jpg`, uploaded once
from the card) sits above the captions with a thin gold ring that widens
with the voice — the reading's RMS envelope, smoothed — and a small label
under it. Deliberately not a waveform: the one motion added is the picture
of a person speaking. The same photo, smaller, sits on the end card under
"Made by Matthew". A day with a recording and no photo renders the thought
over the painting alone.

Two things learned on the first synthetic recording, both in the code:

- **The recording is tiled into window-sized pieces, and nothing is
  skipped.** Whisper's 30-second windows stopped early at the long pause
  between the verse and the thought and dropped the speech after it; a
  silence detector tuned for clean TTS then called a 79-second phone memo
  ONE run and half the thought vanished the same way. `tilePieces` cuts the
  whole file at its quietest quarter-seconds (a pause is the quietest thing
  in reach, so cuts land in pauses), each piece is heard with a margin and
  keeps the words whose midpoint falls in it, a piece that comes back with
  speech left unheard is heard again, and a piece's first word starts at
  its first sound rather than Whisper's 0.00. The verse is matched in the
  opening stretch only and ends at its last heard word, because a re-quoted
  "to the saints" inside the thought was once taken as the verse's ending.
  The operator's words are read by Whisper **base** (tiny turned "Jude
  writes this letter" into "writes the slider"); when base's word clock
  collapses on a short piece, tiny's clock stands in.
- **Whisper names what it can't read**, `[BLANK_AUDIO]`, `[ Pause ]`, and a
  breath that tripped the speech detector comes back as one. Anything
  bracketed is dropped before it can be captioned.

The AI note follows the voice: `social.ts` takes `voiced` on `PostArgs`
(the function sets it when the day's `voice-verse.json` exists) and the
caption says `AI-generated art; the voice is our own.` instead of claiming
the voice. TikTok's, YouTube's and Instagram's flags stay set — the painting
is still generated. The `copy` prompt's description of the post changes the
same way, which is why the hub rewrites the copy on Save.

## Your own clip

The one post a painted figure cannot make: the operator, on camera, once a
week. The hub's **Your own clip** card takes an MP4 and a line about what it
is, writes each network's words in the operator's own voice (`copy` with
kind `own` and `about`), and hands it to the same `MadeCard` — upload,
schedule, post — every generated post uses. Deliberately no AI note on it:
nothing in it is generated. MP4 only, for the reason every other card has.

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
- **The one player-facing row is a link, not a feature.** It grants nothing,
  records nothing and counts nothing; it renders only when there is a published
  video to point at.

## Costs, roughly

TTS ~1¢ a day, copy a fraction of that, a thought draft about the same, a 2K still ~25¢ once, a Veo loop $1–3 once
per figure+scene. A voiced day costs nothing at all: no TTS, and the transcription runs in the operator's tab. The video encode is free (your laptop). About 20–40 seconds a
day of encoding for a 35-second post.

## Ideas parked

- Moving the operator's art (`public/tiktok/`) into the Storage bucket, so the
  App Store build stops carrying megabytes only the dashboard reads.
