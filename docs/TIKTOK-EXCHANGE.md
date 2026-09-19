# The exchange — the third format

**One question, one answer, two figures, and his voice at both ends.**

A real exchange out of the text: somebody asks, somebody replies, and the
reply goes somewhere the asker did not expect. That is a setup, a turn and a
payoff with no joke in it — the structure of the format this was modelled on,
in a register that suits scripture.

Three a week, **Monday, Wednesday and Friday**, to **YouTube and Facebook**.
On those days the account posts three times: the verse at 08:00, the exchange
at 12:30, the story at 19:30.

---

## What a viewer sees

| beat | audio | screen |
|---|---|---|
| 0.0 | — | the two figures walk in from the edges and meet |
| 0.35 | **his voice** — the setup | hook card pinned; camera creeps in |
| after a beat | the asker (synthesised) | the asker's face changes to `_asking` |
| after a beat | the answerer (synthesised) | **camera pushes hard**; both faces turn |
| on his close | **his voice** | the frame darkens and the **payoff** lands over it |
| | | camera wide, then drifting in again |
| end | — | end card: the verse, then the link |

---

## The five rules

**1. It is voiced at both ends, and a day with no takes makes no post.**
Every other generator here degrades to a fully synthetic version when nothing
is parked, because it still has something to say — a verse gets read, a story
gets told. An exchange with no human voice in it is two synthesised characters
talking to each other over a painting, going to the two networks that judge a
CHANNEL. That is the exact shape the originality policies describe, and the
argument that put this format on those networks at all rests on him being in
it. So `makeExchange` **throws**; the runner reports it and the day quietly
makes two posts instead of three.

**2. The camera moves, and that is a deliberate exception.** "The only thing
moving is the caption" was written for a layout with ONE figure at 42% of the
frame height. Here there are two, full length, and the face that carries the
whole post is about ninety pixels tall at rest — swapping it changed nothing a
viewer could see. So the push is *motivated*: it creeps through the setup,
lands hard on the answer, snaps wide for the payoff, drifts in under the
close. Nothing else moves but the walk-in and the caption.

**3. There is no silence in it.** The first cut held the payoff over 2.8
seconds of dead air. The four speech blocks are butted up with beats of a few
hundred milliseconds (`EX_GAP_*`), and the payoff card plays **over** the
opening of his close rather than instead of it.

**4. The two figures converge.** At their opening marks the pair spans 90% of
the width, so any zoom at all cuts the asker in half. They drift toward each
other as the camera pushes (`EX_ASKER.close`, `EX_ANSWERER.close`), which at
the close-up's 1.42 loses only the outer hand of each figure — and reads as
two people closing the distance while they talk.

**5. No two speakers share a voice.** An exchange in one voice is one person
talking to himself; it sounds like a rendering bug and is a data bug.
`check:exchanges` asserts it per entry.

---

## Casting, and why the rotation exists

Measured against the verse pool: Jesus is the speaker on 80 of 250 entries and
Paul on 68 — the top two are **59% of everything**. Picked by seed alone this
format is the same two faces by March, which is exactly the templated look the
policies penalise.

So the pick is rotated. `pickExchange` walks the bank and takes the first
entry that reuses **nobody** from the last `SPEAKER_MEMORY` posts, falling back
to the least-recently-used rather than repeating. `exchangeForDate` walks that
forward from a fixed epoch, so the hub and the runner compute the same answer
for a date without asking each other.

`SPEAKER_MEMORY` is **2**, not the 5 it was written as. Five was picked before
a single exchange existed and starves the bank — the recorded question-and-
answer exchanges in scripture are mostly gospel ones, so five pushes Jesus to
roughly once a month. Two gives: **nobody in the post before or after their
own**, and Jesus every third post. Verified over a simulated year — 0
back-to-back faces, including across the wrap when the bank restarts.

**Every cast id needs three renders**: the base figure, `_asking`, and
`_struck`/`_settled`. A missing one is the silent failure this format has —
the face simply never changes, on the beat the whole post is built around.
`check:exchanges` fails the build on it.

---

## The voice, and what actually made Peter sound wrong

The first cut shipped Peter on `Puck` and he read as performed. Measured, the
problem was **not pitch** — Puck's median is 115 Hz, an ordinary man's voice.
It is **intonation swing**: Puck ranges over 102 Hz inside a sentence where
`Orus` ranges over 50.

| voice | median | swing |
|---|---|---|
| Puck | 115 Hz | 102 Hz |
| **Orus** | 114 Hz | **50 Hz** |
| Algenib | 101 Hz | 132 Hz |
| Gacrux | 127 Hz | 124 Hz |
| Schedar | 109 Hz | 75 Hz |

Note Algenib: the **lowest** voice in the set and the **swingiest**. Deeper is
not flatter. So `SPEAKER_VOICE` picks for swing, and every delivery note ends
with *"no lilt, no brightness, no theatrical flair"* — the note does as much
work as the id.

---

## Recording

Two takes per post, six a week, on top of the fourteen the verse and story
already want. The scripts are **authored in `data/tiktokExchanges.ts`**
(`open` and `close`) rather than drafted by Gemini — this format's words turn
on a specific reversal, and a model asked for them writes around it.

They park as two kinds, because every path in this engine is already keyed on
kind:

```
days/<date>/voice-exchange.{wav,json}         his opening
days/<date>/voice-exchange-close.{wav,json}   his closing
```

`postKindOf` maps the closing half back to the `exchange` post, so the caption
is written under the key the day's record actually reads.

From a terminal:

```bash
node scripts/tiktok-voice.mjs listen  2026-09-21 open.m4a  --kind=exchange
node scripts/tiktok-voice.mjs listen  2026-09-21 close.m4a --kind=exchange-close
node scripts/tiktok-voice.mjs render  2026-09-21 --kind=exchange
node scripts/tiktok-voice.mjs post    2026-09-21 --kind=exchange
```

A phone only uploads — `ensureExchangeVoice` does the listening itself when
the morning runner finds a WAV with nothing beside it.

---

## The disclosure

`AI_NOTE_EXCHANGE`:

> AI-generated art, and both speakers are AI voices. The opening and closing
> words are mine.

It needs its own line because neither of the others describes this post.
`AI_NOTE_OPENED` says "the verse is read by an AI voice", singular, and there
is no verse read here at all — there are two synthetic voices playing two
named people talking to each other, and his voice is at **both** ends rather
than only the front.

The caption's ask is the **comment**, not the share: this is the one format
built on a question, and the video ends by asking one out loud. Answering that
with "share this" answers a question with an errand.

---

## Files

| what | where |
|---|---|
| the bank, the voices, the rotation, the calendar | `src/data/tiktokExchanges.ts` |
| the layout | `renderExchange` in `src/lib/tiktokRender.ts` |
| the flow both callers use | `makeExchange` in `src/features/admin/tiktok/make.ts` |
| the hub card | `src/features/admin/tiktok/ExchangePost.tsx` |
| the paintings | `art/tiktok-exchanges.json` → `public/tiktok/exchange/` |
| the schedule | `exchange=12:30` in `scripts/tiktok-times.mjs` |
| the build check | `scripts/check-exchanges.mjs` |

---

## The paintings

One shared prompt shell, so the nine read as one hand. It says the same three
things every time, and all three are about what gets drawn OVER it: the
**bottom half** is open level ground with nothing crossing it (two figures
stand on it at three quarters height), the **top third** is quiet with no
detail (the hook card sits there), and the **centre** is emptier than the
sides (the gap between the two figures must not land on anything busy).

Generated at `tiktok-exchange` kind — portrait, full-bleed, JPEG, in a folder
of its own so an exchange called `shore` can never collide with the road of
that name. They are deliberately **not** wired into `GENERATED_ART`: no
player-facing surface reads them, and `scene` is a file stem rather than an
art id, so there is one name for one file.

One scar worth knowing: Susa came back on the first pass **photorealistic and
soft-focus** — a blurred render rather than a flat painting — where the other
seven landed in style. A straight re-roll on the same prompt fixed it, so the
drift was the draw rather than the words. Check a new batch by eye against the
others before trusting it; this one would have shipped and looked like a
different app.

## Adding one

1. Append to `EXCHANGES` — it is ordered as authored, and the rotation deals
   from it, so adding one never re-deals what is already scheduled.
2. Both speakers need renders and a `SPEAKER_VOICE` entry with different
   voices.
3. Add a painting to `art/tiktok-exchanges.json` keyed on the `scene` stem.
4. `npm run check:exchanges`.
5. Write the two takes into `open` and `close`, and record them.

---

## Two bugs this format found in code that was already there

**The runner could never park a transcript.** `scripts/tiktok-daily.mjs`
proxies the bucket to the page, and that branch forwarded **reads only** — a
PUT went out as a GET and the storage client read the answer as
`Bucket not found`. So `ensureVoice`, `ensureReading` and
`ensureExchangeVoice` all failed the moment they tried to park what they had
just transcribed, and the documented "the morning runner can do the listening
itself when a phone only uploaded" was false in the runner for as long as it
had existed. Every other kind hid it by falling back to a synthetic voice; the
exchange, which refuses to, surfaced it on the first run. The proxy now
forwards the signed-upload path — and only that path, with a token
`upload-url` minted against a validated path.

**The end card inherited its alignment.** `drawCaption` restores
`textAlign = 'center'` on its way out, but it returns **early** when there is
no phrase — which on the end card is every frame. So the verse wrapped to 880
and then drew from the middle leftwards, off the right edge. It is set
explicitly now. Found by pulling a frame out of the MP4, not from the log: the
runner reported a clean render every time.
