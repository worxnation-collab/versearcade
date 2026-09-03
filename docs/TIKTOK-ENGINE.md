# The TikTok engine (Admin → TikTok)

One post a day for a faceless Verse Arcade TikTok: a painted figure — Peter
(Cephas) by default — hovering over a Verse Arcade scene, reading the verse of
the day, captioned phrase by phrase, ending on `versearcade.org`. This is an
**operator tool**: admin-only, online-only, desktop Chrome. It changes nothing
a player sees and it is behind the dashboard's three gates.

## What one click produces

- `verse-arcade-<date>.mp4` — 1080×1920, 30fps, H.264 + AAC (or VP9/Opus WebM
  if the browser can't do H.264), audio baked in. Lead-in with the reference and
  a hook line, the reading with captions, a 2.6s end card.
- The **caption** and six hashtags, with a copy button.
- "Next 7 days" queues a week — `getVerseForDate` is deterministic, so any date
  can be made ahead of time. Each result gets its own download link (browsers
  block a chain of automatic downloads).

What's left for a human: upload to TikTok, paste the caption. There is no
TikTok posting integration on purpose — their Content Posting API needs an
audited app for public posts, and one upload a day is a thirty-second job.

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

1. **Veo loop** — real motion, 8 seconds ping-ponged so it has no seam. Started
   with "Animate", polled every 8s for up to 8 minutes. Costs a few dollars once.
2. **Painted still** — Nano Banana composes the figure over the scene at 9:16
   from two reference images (the skin PNG and the road JPEG, fetched from
   production so they're https). Drawn with a slow Ken Burns push.
3. **Built-in** — nothing generated: the skin PNG at 2× with a breathing gold
   glow, over the road scene. Works with only the TTS secret set.

## How the captions land on the words

Gemini TTS returns no word timings, so `tiktokRender` measures the WAV: it finds
the runs of speech between silences ≥ 220ms, and when their count matches the
number of clauses in the verse (phrases ending in punctuation, plus the spoken
reference as the last clause) each clause is pinned to its pause and the
phrases inside it are spread by character count. When the counts don't match
it falls back to proportional timing across the whole reading. Verified on
synthetic audio with four bursts: every clause boundary landed on its gap.

The reference is spoken as "Matthew 16, verse 18" (`spokenReference`) so the
voice never reads a colon.

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

TTS ~1¢ a day, copy a fraction of that, a still ~4¢ once, a Veo loop $1–3 once
per figure+scene. The video encode is free (your laptop). About 20–40 seconds a
day of encoding for a 35-second post.

## Ideas parked

- Rotate the reader by book (Moses for Exodus, David for Psalms) — the panel
  already takes six figures; a map from `verse.book` to a reader id is one line.
- Two-part format: the verse, then one of the day's trivia questions with the
  teach line as the reveal.
- Word-level karaoke captions once a real aligner is worth adding (Gemini audio
  understanding can transcribe with timestamps, but only to the second).
