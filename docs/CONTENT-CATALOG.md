# The content catalog

How to ship a season — a road, its rewards, its cosmetics and its art — to
phones that already have the app, without an App Store submission.

- Shapes and sanitisers: `src/data/catalog.ts`
- The fetch: `src/store/catalog.ts`
- The server: `supabase/migrations/0066_content_catalog.sql`
- What a road *is*: `docs/BATTLE-PASS.md`

## The problem this solves

The App Store build runs a copy of `dist` baked into the IPA (`webDir` in
`capacitor.config.ts`, no `server.url`). So everything compiled into the bundle
is frozen until the next review: `data/season.ts`, `data/avatar.ts`, and every
PNG in `public/`. Changing a reward table used to mean archive → upload →
review → wait, for content that is five hex codes and an emoji.

Now the bundled catalog is the **floor** and a fetched overlay merges over it.

## What can and cannot be published

| | |
|---|---|
| **Can** | Roads (window, waystations, rewards, blurb, length), their quest lists, titles, confetti themes, streak flames, chest skins, free/earned/road skins, and the art URL for any of them |
| **Cannot** | Quest **verbs**, reward **kinds**, wearable **items**, drawn-SVG art, screens, prices |

Three of those are worth explaining, because they're the ones you'll hit.

**Verbs are code.** A quest says "watch `focus_drills`", and only `deltaFor` in
`store/season.ts` knows how to turn a `focus_drill` event into progress. A
catalog quest naming a verb this build doesn't have is **dropped** —
`sanitizeQuestDefs` checks `KNOWN_VERBS` — rather than shown as a bar nobody can
fill. That is why the verb list is *prepacked* far ahead of the quests using it:
twelve verbs currently have live emit sites and no bundled quest. Adding a verb
is the one part of a season that still costs a release, so add them generously
and early, and check `checkQuestVerbs()` isn't complaining in dev.

**Items are code too, and this is a real gap.** Chest and road items
(`item_sickle`, `item_gleaner_shawl`) are drawn as hardcoded SVG per id inside
`components/Character.tsx`, so a catalog item id would render nothing. A
catalog road can hand out skins, titles, confetti, flames, chest skins, boosts,
freezes and mementos — not items. If seasonal items matter, the fix is the same
prepack move: draw a batch of generic slots now and let roads name them later.

**Prices, never.** `CatalogSkin` has no `price`, `sku`, `pack` or `bundleOnly`
field, and its `source` union deliberately excludes `'paid'`. Whether this app
may sell anything lives in `lib/commerce.ts` and nowhere else (see CLAUDE.md); a
price in a row an operator can edit is a storefront that skipped review, which
is against the rules in every storefront but the US one. This is also mostly
moot now — cosmetics aren't sold at all, the founding-patron whale excepted.

## The three rules

**1. Merge, never replace.** An overlay entry with a known id overrides that one
entry; a new id is appended; a bundled entry is *never* removed. So an old
binary fetching a catalog it half-understands still renders everything it
shipped with, and a cosmetic somebody equipped can't vanish. Bundled entries
keep their positions, so publishing doesn't reshuffle the equip grids under a
player mid-tap.

**2. Fail closed, per entry.** Every sanitiser drops what it can't read and
keeps going. One malformed row never takes out the road it's in; a catalog that
fails to load at all is simply the bundled one. **There is no state in which the
season screen renders empty because a fetch failed.** No keys, no network, a
500, bad JSON — all of them land on a complete, playable app.

**3. Code is not content.** Nothing served from the catalog is ever executed.
`art` URLs in particular are a security boundary rather than a tidiness one:
they end up in `<image href>`, so only `https:` or a root-relative path is
accepted. `javascript:`, `data:`, plain `http:` and protocol-relative `//host`
are all rejected.

## Publishing a season

1. **Write the doc** (shape below) and check it against the sanitisers before it
   goes anywhere near production. In the browser console of a dev build:

   ```js
   const { previewCatalog } = await import('/src/store/catalog.ts')
   previewCatalog(myDoc)   // what the app will ACTUALLY use
   ```

   Anything you wrote that isn't in the result was dropped. Diff the two — a
   silently missing quest is the failure mode here, not an error message.

2. **Publish** as an admin (`profiles.is_admin`):

   ```sql
   select admin_publish_catalog(3, '<the json>'::jsonb, 'Advent 2026');
   ```

   The new version goes active and every other one is deactivated in the same
   statement, so there is never a moment with two live catalogs.

3. **Roll back** if it's wrong. No deploy, nothing to reconstruct:

   ```sql
   select admin_rollback_catalog();
   ```

   Rolling back the very first catalog leaves nothing active, the RPC returns
   null, and every client falls back to bundled content. That's a valid state.

Clients pick it up on next launch. The overlay is cached in `localStorage`
(`va.catalog`) and applied **synchronously at import**, so a returning player
sees the published season on the first frame rather than a flash of the bundled
one.

## Two things that will bite you

**A road's quest pools are frozen once it starts.** `pick()` shuffles the whole
pool from a day seed, so adding one entry re-draws every remaining day — two
players on different versions would see different dailies on the same date, and
the shared-drop promise is the whole point. Publish quests before `start`; after
that, only ever fix a `text` typo. The bundled `DAILY_QUESTS` belongs to the
Harvest Road now and is effectively frozen for the same reason: a new road
carries its own `daily`/`weekly`.

**Overlapping windows resolve to the road that starts latest.** So a short
holiday road sitting inside a long one wins, which is almost always what you
meant. Two roads with the same start is undefined — don't.

## The document

```jsonc
{
  "version": 3,
  "roads": [{
    "id": "advent",
    "name": "The Advent Road",
    "blurb": "Four weeks of waiting, a day at a time.",
    "start": "2026-11-29T00:00:00Z",
    "end":   "2026-12-26T00:00:00Z",
    "length": 24,                       // an Advent road is 24, not 50
    "memento": "memento_advent",
    "waystations": [
      { "n": 1,  "a": [{ "id": "freeze", "qty": 1 }], "b": [{ "id": "title_starlit" }] },
      { "n": 6,  "a": [{ "id": "confetti_snow" }],    "b": [{ "id": "skin_gabriel" }] },
      { "n": 24, "a": [{ "id": "flame_candlelight" }],
                 "b": [{ "id": "skin_magus" }, { "id": "memento_advent" }],
                 "milestone": true }
    ],
    "daily": [                          // >= 3 required, or the bundled pool is used
      { "key": "adv_play",  "verb": "play_daily",  "goal": 1, "text": "Play today’s drop" },
      { "key": "adv_focus", "verb": "focus_drills","goal": 2, "text": "Finish 2 focus drills" },
      { "key": "adv_read",  "verb": "read_chapters","goal": 1, "text": "Read a chapter" },
      { "key": "adv_relic", "verb": "find_relic",  "goal": 1, "text": "Find a relic by studying" }
    ],
    "weekly": [ /* >= 5 required */ ]
  }],
  "titles":   [{ "id": "title_starlit", "text": "the Starlit" }],
  "confetti": [{ "id": "confetti_snow", "name": "Snowfall",
                 "colors": ["#ffffff", "#cfe6ff", "#9ec8f5"] }],
  "flames":   [{ "id": "flame_candlelight", "name": "Candlelight",
                 "glyph": "🕯️", "rgb": "255,214,150" }],
  "chests":   [{ "id": "chest_creche", "name": "Creche", "glyph": "🎄" }],
  "skins":    [{ "id": "magus", "name": "The Magus", "source": "pass",
                 "blurb": "One of the wise men — myrrh in both hands." }],
  "art":      { "magus": "https://<project>.supabase.co/storage/v1/object/public/skins/magus.png" }
}
```

### Field rules the sanitisers enforce

- `id` — `[a-z0-9][a-z0-9_]{0,63}`, case-insensitive. Reward and art ids also
  allow a trailing state (`skin_ruth_2`, `noel_1`).
- `start` / `end` — anything `new Date()` parses; `end` must be after `start`.
- `length` — 1–200, default 50.
- Waystation `n` — 1..`length`, integers, **first wins** on a duplicate.
- Reward `qty` — 1–10. Consumables are `+= qty` in SQL, so this is bounded on
  purpose.
- Confetti `colors` — `#rgb` / `#rrggbb`, max 12. A theme left with none is
  dropped rather than bursting nothing.
- Flame `rgb` — `"r,g,b"`, each 0–255.
- Quest `goal` — 1–1000, matching the server's own clamp.
- Skin `source` — `free` | `earned` | `pass`.
- `art` values — `https://…` or `/rooted/path`.

## Art

Art follows the house rule (`art/README.md`): generated through
`scripts/gen-art.mjs`, checked with `scripts/check-art.mjs`. For a *seasonal*
skin the only difference is where the PNG lands — upload it to a public Supabase
Storage bucket and put the URL in `art`, instead of committing it to `public/`.

`skinArtUrl()` in `data/avatar.ts` resolves in one order, and each step is a
fallback rather than a preference:

1. catalog overlay (`art`) — the only tier that can appear after submission
2. `GENERATED_ART` — written by the generator, bundled in `public/`
3. `RASTER_SKINS` — hand-placed files predating the generator
4. drawn SVG paths

An id in none of them is still a skin. No id can point at a 404 that leaves a
hole where a character should be.

### Renders must be full-length figures

A skin PNG serves two frames from one file. Avatar chips crop to a portrait
(`preserveAspectRatio: 'xMidYMin slice'`), but the little worlds — the Harvest
Road, the churchyard crowd, `ProfileHero` — render the **same file** with
`fullBody`, feet and all.

So a bust looks perfect in every avatar circle in the app and becomes a floating
torso the moment the character stands somewhere. The manifests say
head-to-feet three times for this reason, and `check-art.mjs` flags any skin
whose ink is squarer than 1.05:1 as `(BUST?)`. All fifteen shipped skins are
1.08 or taller. It's a heuristic and a nudge to look — it cannot tell a
well-drawn bust from a well-drawn figure, so open the file.
