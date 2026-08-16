# Facebook carousel — the 48-hour drop (Aug 14–16, 2026)

Eleven 1080×1080 PNGs in `images/`, meant to be posted as a single multi-photo
Facebook post so people swipe one update at a time. They're numbered in the
order they should be uploaded; each card carries its own `NN / 11` counter and
progress dots, so the order matters.

Every card is drawn in the app's own design language — the tokens at the top of
`src/index.css` (deep violet night sky, gold/coral/grape accents, Baloo 2
display type) and, on the church cards, the actual building SVGs from
`src/features/church/ChurchArt.tsx`.

## What's on each card

| # | Update | Shipped in |
|---|--------|-----------|
| 01 | Cover — 19 updates, 726 verses, 66 books | — |
| 02 | Play for your church: pick your congregation, pour points into it, grow the building through 8 tiers | #70 |
| 03 | Church board: 10–50 mile radii plus the new worldwide **All** chip | #75 (and #72) |
| 04 | Verse pool 250 → 726, all 66 books with 10+ verses each | #69 |
| 05 | Study tracks accuracy book by book, charted weakest-first | #63 |
| 06 | Focus practice restored — live CPU versus, daily XP | #61 |
| 07 | Battle hub split into Your turn / Their turn / Finished | #76 |
| 08 | Player cards: add a buddy or start a battle from any avatar; four-tab nav; vs CPU back | #60, #62, #64 |
| 09 | Add to Home Screen, real app icon, how-to-play walkthrough, daily reminder push | #65, #67, #68 |
| 10 | The Angel Pack — 3 skins + 2 calling cards, one $5.99 bundle | #78 |
| 11 | Call to action — today's verse is live | — |

Not pictured, because they're plumbing rather than news: the leaderboard
cleanup (#59), the churches RPC grant fix (#71), the CLAUDE.md notes (#73), the
dead deploy workflow removal (#74), and the admin sales view (#58).

## Suggested post copy

Post the eleven images together, with this as the post body:

> We didn't sleep much this week. 🔥
>
> In the last 48 hours Verse Arcade shipped **19 updates** — including the
> biggest one yet: you can now **play for your church**. Find the congregation
> you actually attend, and every verse you nail pours points into it. Your
> church's building grows from a house gathering all the way to a basilica, and
> it costs you nothing — your own XP never drops.
>
> Also new: 726 verses covering all 66 books, a Study tab that shows you exactly
> which books you're weakest in, a battle hub that finally tells you whose turn
> it is, and the Angel Pack.
>
> Swipe through all 11 → then go take today's verse. Same verse, same day, for
> every player on earth. versearcade.org
>
> Which book are you weakest in? Drop it in the comments — no shame here, wrong
> answers are how this thing teaches you. 👇

Per-image captions, if you'd rather post them one at a time over a few days,
are the headline plus body already on each card — they're written to stand alone.

## Regenerating

```bash
python3 build.py     # needs pillow; writes out/verse-arcade-NN.png
```

It renders each card as HTML and screenshots it with the Chromium at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Two things that will
bite you if you change it:

- Chrome's `--screenshot` captures the **window**, not the viewport, and
  reserves 87px of the window height for itself. The script asks for a
  1080×1167 window and crops back to a 1080 square.
- `fonts.json` is the Baloo 2 latin subset, base64'd, so the cards render the
  brand's display face with no network access at build time.
