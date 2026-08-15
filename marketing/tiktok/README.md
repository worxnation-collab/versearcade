# TikTok slideshow cards

Four 1080 × 1920 cards for a TikTok photo slideshow, in the app's own visual
language (deep violet night sky, candy accents, Baloo 2 — the same tokens as
`src/index.css`).

| File | Copy |
|---|---|
| `card-1.png` | "Does studying scripture feel **uncomfortable**?" |
| `card-2.png` | "Do you wish you had **others** to share scripture with?" |
| `card-3.png` | "Do you want study to be **engaging and fun**?" |
| `card-4.png` | **versearcade.org** — the payoff card |

Post them in that order. Each of cards 1–3 carries the URL in a small pill so
the domain is on screen the whole way through, and card 4 is the call to action.

## Safe areas

Content sits inside `top: 150px` / `bottom: 430px` / `84px` side margins.
TikTok's caption, username, and the right-hand action rail cover roughly the
bottom 430px and right 130px, so nothing important lands underneath them.

## Re-rendering

```bash
node marketing/tiktok/render.mjs
```

`cards.html` holds all four cards; `render.mjs` screenshots each `.card`
section to a PNG next to it. Playwright + Chromium are the only requirements.

Edit the copy or colours in `cards.html` and re-run. Per-card accents come from
the `--accent` / `--accent-2` / `--glow` / `--wash` variables set inline on each
`<section class="card">`.

`fonts-embed.css` is the Latin subset of Baloo 2 (600/700/800) and Fredoka
(600/700) from Google Fonts, base64-inlined so rendering is byte-identical and
works with no network. The starfield and grain are seeded, so re-running
produces the same image.
