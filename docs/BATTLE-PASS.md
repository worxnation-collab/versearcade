# The Pilgrimage — a free seasonal track

A second, parallel level ladder that resets every season, fills from playing,
reading and studying, and pays out cosmetics the whole way. Structurally it's a
Fortnite / Modern Warfare battle pass — separate XP, tiered unlocks, a two-column
reward table — with one difference that changes the design more than it sounds:

> **Everything is free. Both columns, every reward, every season.**

There is no purchase, no price, no upsell, no premium track. This is the design
of record; build from it.

**Call it the Pilgrimage in the app, not the battle pass.** There's already a
`/battle` tab with real head-to-head battles in it. The metaphor also does work:
a season is a **road**, progress is **miles**, tiers are **waystations**. Nobody
walks a road *against* anyone.

---

## 1. What "free" buys us

Dropping the paid track deletes the hardest third of the feature and unlocks
rewards that would otherwise be off-limits.

**Deleted outright:** `commerce.ts` gating, `passVisible()`, the fail-closed
empty state, a per-season IAP SKU, RevenueCat product setup, the Stripe link,
App Review exposure on a brand-new surface, and the whole "does the screen still
read correctly with a column missing" problem.

**Unlocked:** XP Boosts and Streak Freezes can now sit **anywhere** on the track.
The old objection was that `profiles.xp` *is* the worldwide rank and streaks gate
the `earned` prestige tier — so selling boosts or freezes would sell standing.
With nothing for sale, that objection evaporates. They're just rewards. Same for
relics: a free track can hand them out without money ever touching church
standing.

**Keep exactly one rule from the paid design**, because its reason survives:

> Nothing on the track grants a **rate modifier** — no "+10% drop chance", no
> "+5% XP for the season", no battle bonus. Not because of money, but because a
> track that makes you permanently better than someone who started later is a
> ladder, and this app doesn't have those. Fixed grants (a boost you spend, a
> freeze you hold) are fine. Multipliers are not.

### Leave the seam in

Keep `has_pass` in the schema, **defaulting to `true`**, and keep the two-column
reward table. Grant both columns to everyone. If money ever comes back, it's a
change to how one boolean gets set — not a rebuild. If it never comes back, one
column of a `boolean not null default true` costs nothing.

Do **not** build the commerce path "just in case". An unused checkout surface is
the thing that gets a native build rejected.

---

## 2. Season shape

**Seasons are liturgical, because this app gets to do that.** A church already
runs on seasons.

| Road | Window | Days | Waystations |
|---|---|---|---|
| **The Harvest Road** | Sep 1 – Nov 15 | 76 | 50 |
| **The Advent Road** | Nov 29 – Jan 6 | 39 | 30 |
| **The Wilderness Road** (Lent) | Feb 17 – Apr 4 | 46 | 40 |
| **The Emmaus Road** (Eastertide) | Apr 5 – May 24 | 50 | 40 |

Waystations ≈ 0.7 × days, so a player doing the dailies most days finishes with
room to spare and a once-a-week player still lands a real haul. The week off
between roads makes the next one an event instead of a treadmill.

`data/season.ts` holds the roads with hard ISO dates, like `LIMITED_UNTIL` in
`data/avatar.ts`. The active road is a pure function of `Date.now()` — no
server-side "current season" flag to drift.

---

## 3. Miles

`miles` is a per-season counter, entirely separate from `xp`. It never appears on
a leaderboard, never feeds `level`, and resets at season end (the rewards it
bought are kept forever).

Waystation *n* costs a flat **1,000 miles**. A pass wants a metronome, not the
~35% compounding ramp `levelInfo()` uses — the appeal is a predictable "two more
days to the next thing".

| Action | Miles | Hook |
|---|---|---|
| Finish any quiz run | 40 + 4/correct | `QuizRunner.onComplete` — covers daily, practice, focus, CPU, battle in one place |
| Daily drop, first play of the day | +100 | same, gated on `playedToday` |
| Open the Daily Chest | +60 | `features/chest/DailyChest.tsx` |
| Read a Bible chapter (first that day) | +50 | `ChapterReader` / `BibleChapterScreen` |
| Share the daily verse | +75 | share handler |
| Donate a relic to your church | +50 | `donate_collectible` result |
| **Daily quest** | **250 each** (×3) | §4 |
| **Weekly quest** | **600 each** (×5) | §4 |

Quests are ~72% of a completionist's miles. That's deliberate: the ceiling is set
by *showing up on many days*, not by grinding many runs on one day, so no daily
cap is needed. There is no "you've hit today's limit" message anywhere, because
that message is a small shame and the numbers make it unnecessary.

**Study runs award miles.** They still award no XP, no points and no standing —
`lib/drops.ts`'s rule is untouched. Miles rank nothing, so this is the first
reward the Study tab can safely pay.

---

## 4. Quests

The actual engagement engine. The XP ladder is the reward; the quest list is the
reason to open the app.

- **3 dailies**, rolling at the player's local midnight. Unfinished ones vanish
  silently — never a "failed", never a red X, never a count of missed days.
- **5 weeklies**, issued Monday, that **persist to the end of the road**. Miss a
  week and you lose nothing; you just have more to do later. This is the single
  most important anti-shame mechanic in the feature.
- **One reroll per day.** Swap a daily you don't want. Removes the one real
  friction point — being handed a quest for a mode you don't play.
- **One gilded weekly per week**, marked, paying double. Costs nothing to
  implement and gives the week a shape.

**Quests are deterministic from `(roadId, dayNumber)` and identical for every
player** — seeded like `getVerseForDate`. Everyone gets the same three today.
That makes the guest mirror trivial (both sides compute the same list from the
same seed, nothing to sync) and makes quests shareable conversation.

Verbs, chosen to route players into under-visited surfaces:

```
play_daily · answer_correct(n) · perfect_run · combo(n)
read_chapters(n) · read_book(book) · study_runs(n) · focus_accuracy(pct)
cpu_wins(n) · save_verses(n) · donate(n) · share_daily · open_chest
place_decoration · equip_companion · finish_armor_rack
```

Every one is self-vs-self or self-vs-CPU. `cpu_wins` is the only "beat
something" verb and the something is a simulation — the line `CpuVersusQuiz`
already draws.

### Detours

Contextual mini-quests that appear where you already are: open Ruth 2 during the
Harvest Road and a slim bar offers *"read the whole chapter — 200 miles"*. They
expire when you leave, cost one row of config each, and are the cheapest
delight-per-line in the feature. Cap at one visible at a time so they never nag.

---

## 5. Rewards — eleven types, on purpose

A track that hands you a hat every third tier is a chore. **Variety of reward
*type* is what makes a road fun**, more than volume. Here's the full palette,
ordered by how cheap each is to produce:

| # | Type | Where it shows | Cost to build |
|---|---|---|---|
| 1 | **Titles** | under your name, everywhere | ~nothing — fixed catalog of strings |
| 2 | **Confetti / juice themes** | *every correct answer* | ~nothing — `useJuice()` already centralizes it |
| 3 | **Streak flame skins** | home screen, every day | tiny — recolor/reshape `StreakFlame` |
| 4 | **Chest skins** | the Daily Chest, every day | small — one flat SVG each |
| 5 | **Bible ribbon bookmarks** | `/bible`, where people linger | small — ribbon color + a charm on the tail |
| 6 | **Pedestals** | what you stand on in scenes | small |
| 7 | **Emotes** | result screen + the fortress | small — transforms, no new art |
| 8 | **Fortress decorations** | the faction hall (`docs/FORTRESS.md`) | small — flat SVG props |
| 9 | **Avatar items & companions** | your character everywhere | medium — one raster each |
| 10 | **Card backgrounds** | the player card | medium — vector scenes, see `CARD-ART-PROMPTS.md` |
| 11 | **Full skins** | your character everywhere | large — the commissioned tier |

Plus the fixed grants: **XP Boosts**, **Streak Freezes**, **relics**, **borders**
and **badges** (which today only unlock by streak — a road can now grant them).

The top four are the discovery here. A **confetti theme** costs a config object
and fires on every single correct answer a player ever gets; a **streak flame
skin** is seen every morning. Perceived value per unit of work on those beats a
commissioned skin by an order of magnitude, and they're what let a 50-waystation
road pay out something *different* almost every tier.

### The new reward types, concretely

**Titles** — a short earned phrase under your name, from a fixed catalog so
there's no moderation surface: *the Gleaner · Night Watchman · the Sower ·
Lamplighter · Wayfarer · Barley-Handed · First Light · Keeper of the Lamp ·
Early Riser · the Persistent*.

**Confetti themes** — what bursts on a correct answer and a finished run:
*Barley Chaff · Palm Fronds · Gold Coins · Doves · Rose Petals · Embers · Manna ·
Olive Leaves*. Respect reduce-motion through `useJuice()` as always; a theme
changes what's drawn, never whether motion happens.

**Streak flames** — *Ember (default) · Blue Flame · Olive Lamp · Pillar of Fire ·
Burning Bush · Candle · Lantern*.

**Chest skins** — *Clay Jar · Cedar Chest · Woven Basket · Stone Cistern ·
Treasure Sack · Ark* (the last one earned late and reverently — a container, not
a relic to own).

**Emotes** — a two-second flourish: *Bow · Raise the Staff · Timbrel Dance ·
Kneel · Wave · Toss the Grain · Lift the Lamp*. Plays on the result screen and
when you tap your own figure in the fortress.

**Ribbons** — the bookmark in `/bible`: color plus a small charm on the tail
(a barley ear, a dove, a key, a shell). Note `features/bible/paper.ts` tokens are
*measured* — 11:1 ink contrast, ΔE 10 between tiers. A ribbon is decoration on
the page edge and must not restyle the page itself.

---

## 6. The Harvest Road (Season 1)

Ruth and Boaz — gleaning, redemption, showing up in a field every day until the
harvest is in. Almost embarrassingly on the nose for a progression track.

Both columns are free. Column A is the steady drip; column B is the bigger beat.

| Way | A | B |
|---|---|---|
| 1 | 1 Streak Freeze | **Ruth the Gleaner** (skin, state 1 — empty basket) |
| 2 | title: *the Gleaner* | confetti: **Barley Chaff** |
| 3 | item: *Harvest Headscarf* (hat) | item: *Sickle* (held) |
| 4 | fortress: *Sheaf Banner* | 1 XP Boost |
| 5 | chest skin: **Woven Basket** | card bg: **Barley Field** |
| 6 | relic: Sheaf of Firstfruits | emote: **Toss the Grain** |
| 8 | ribbon: *Barley Ear* | item: *Gleaner's Shawl* (cape) |
| 10 | **companion: Lamb** | item: *Winnowing Fork* (held) |
| 12 | pedestal: *Threshing Floor* | fortress: *Harvest Tapestry* |
| 13 | 1 Streak Freeze | card bg: **Gate of Bethlehem** |
| 15 | streak flame: **Olive Lamp** | badge: 🌾 *Gleaner* |
| 18 | relic: Threshing Sledge | item: *Jar of Parched Grain* (held) |
| 20 | title: *Barley-Handed* | **Ruth state 2** — basket half full |
| 22 | confetti: **Gold Coins** | emote: **Bow** |
| 23 | 2 XP Boosts | fortress: *Armoured Destrier* (stable) |
| 25 | item: *Water Skin* (held) | **companion: Threshing Ox** (Deut 25:4) |
| 28 | chest skin: **Cedar Chest** | card bg: **Threshing Floor at Night** |
| 30 | **border: Barley Gold** | item: *Redeemer's Mantle* (cape) |
| 32 | fortress: *Hand-Mill* (hearth) | ribbon: *Kinsman's Key* |
| 35 | 2 Streak Freezes | **Ruth state 3** — sheaf on the shoulder |
| 38 | emote: **Lift the Lamp** | fortress: *Iron Chandelier* (rafters) |
| 40 | card bg: **Harvest Moon** | item: *Boaz's Signet* (held) |
| 43 | streak flame: **Pillar of Fire** | title: *Kinsman-Redeemer* |
| 45 | 3 XP Boosts | badge: 👑 *Redeemer* |
| 47 | confetti: **Doves** | fortress: *Wall Rack — Armor of God* (set) |
| 50 | card bg: **The Winnowing** + **memento: Harvest Road** | **Boaz** (skin) + **Ruth state 4** — basket overflowing |

Two mechanics in that table worth keeping for every road:

**The reactive skin.** Ruth lands at waystation 1 so the road pays off in the
first minute, then *changes* at 20, 35 and 50 — her basket fills. One skin id,
four PNGs, and the long middle of the road gets something to pull toward that
isn't another hat.

**Milestone waystations.** Every tenth is a bigger beat with a bigger reveal
(the toast holds longer, `juice.celebrate()` instead of the small one). Free
pacing.

### Future roads

| Road | Skins | Note |
|---|---|---|
| Advent | **Caspar**, **Melchior**, **Balthasar** | Mary stays earn-only or omitted, per `AVATAR-ECONOMY.md`; Jesus never, in any form |
| Wilderness (Lent) | **Aaron** (breastpiece of twelve stones), **Miriam** (timbrel) | the "carry the cross" Lenten act stays a separate *earned* unlock — devotional, not a tier |
| Emmaus | **Cleopas**, **Thomas** | the risen Christ appears only as an empty place at the table on a card background — never a skin |

**Road skins never return.** A road skin doesn't come back next season as a shop
tile — there is no shop. Add `'pass'` to `SkinDef.source` rather than overloading
`exclusive` (which means "promo code") and give them **no `limitedUntil`**: today
a `limitedUntil` skin vanishes from the grid *even for owners* (see the filter in
`CustomizeSection`), which would break the whole promise.

### Items and slots

`ItemSlot` is `'hat' | 'held' | 'cape'` today — note `AVATAR-ECONOMY.md` promises
`top` and `bottoms` that `src/types` never had. Add them if you want the tunic
and sandals; don't assume they exist.

**Add a `companion` slot.** A small figure beside the character — the lamb, the
threshing ox, Elijah's raven, a turtledove, the Advent star. Companions are the
most-wanted reward type in the genre, they're legible at avatar size in a way a
belt is not, and they're pure flavor. One `ItemSlot` member, one render layer to
the left of the figure at ground level, and `itemsBySlot` picks up the grid free.

**Add a `fortress` slot** with a `mount` field naming its anchor — then hall
decorations grant through the existing `grantItem` → `profiles.owned_items` path
with no new table. See `docs/FORTRESS.md`.

---

## 7. Delivery

**Rewards auto-grant on arrival, with a reveal.** No claim button, no "12
unclaimed" badge nagging from the tab bar. Reuse the `StudyDropToast` pattern
exactly: the grant parks in `store/season.ts`, an app-mounted `WaystationToast`
shows it wherever the player lands, slim bar at the *top* so it never covers the
primary action someone is reaching for.

**Road weekends** — double miles Friday through Sunday, announced on the strip.
One config field, and it gives the season a heartbeat.

---

## 8. Season end

1. Every reward already granted stays granted. Nothing is ever revoked.
2. `miles` resets. Waystations not reached are simply not reached — nothing
   anywhere says how many were missed.
3. **Everyone who reached waystation 1 gets that road's memento** — a small
   collectible card recording that they walked it. One row in `COLLECTIBLES` per
   season, and it's the "nobody ends empty-handed" guarantee.
4. **The Pilgrim's Log**: a recap page listing everything earned, headed with
   *"You walked 340 miles on the Harvest Road."* Not 34/50, no percentage, no
   other player's number. Shareable through the existing share-card path.

---

## 9. Data model

### Online

New migration — take the next free number and write it idempotently (`0034` is
used twice and `0038` is a re-add, per `CLAUDE.md`).

```sql
create table if not exists public.season_progress (
  user_id      uuid references auth.users on delete cascade,
  road_id      text not null,
  miles        integer not null default 0,
  waystation   integer not null default 0,   -- highest reached
  has_pass     boolean not null default true, -- the seam; everyone has it
  granted      text[]  not null default '{}',
  primary key (user_id, road_id)
);

create table if not exists public.season_quest_progress (
  user_id   uuid, road_id text, quest_id text,
  progress  integer not null default 0,
  done_at   timestamptz,
  rerolled  boolean not null default false,
  primary key (user_id, road_id, quest_id)
);
```

Functions follow the house pattern — `security definer`, `set search_path =
public`, `auth.uid()`, validated inputs, `grant execute to authenticated`, each
guarding itself with `if uid is null then raise`:

- `award_season_xp(p_road, p_source, p_amount, p_local_date)` — clamps the date
  ±1 like `submit_focus_practice`, clamps `p_amount` against a server-side
  per-source maximum so a client can't mint miles, advances `miles`, recomputes
  `waystation`, returns newly-granted reward ids. **The server owns the reward
  table** — a client claiming waystation 50 gets told no.
- `track_quest(p_road, p_quest_id, p_delta, p_local_date)` — same clamping,
  marks `done_at` and awards its miles atomically so a double-fire can't pay
  twice.
- `reroll_quest(p_road, p_quest_id, p_local_date)` — one per local day.

Apply the migration **before** merging the client; nothing applies them on deploy.

### Local / guest

`va.season.<roadId>` → `{ miles, waystation, granted, quests }`.

**Guest writes merge onto disk, not onto in-memory state.** A run can finish
before anything called `load()` — deep link straight into a quiz — and merging
onto `{}` erases the season. Read the record off `localStorage` inside the
writer, like `store/drops.ts:rollGuest` and the comment in
`store/bookAccuracy.ts:record`.

### Mirrored math

`lib/season.ts` holds `MILES_PER_WAYSTATION`, the earn table, the quest seed and
the reward table; the SQL holds the same numbers. Carry the "keep in sync with
`award_season_xp`" comment, like `lib/practice.ts` and `lib/drops.ts`.

---

## 10. Client wiring

One store, one tracking call, no sprinkling:

```ts
useSeason().track('quiz_complete', { correct: 8 })
useSeason().track('chapter_read', { book: 'Ruth', chapter: 2 })
```

`track()` resolves miles from the earn table *and* advances any quest matching
that verb, so a new verb never needs a new call site. Wire it at the existing
choke points and nowhere else: `QuizRunner.onComplete` (every quiz mode at
once), `ReviewScreen` (the one study surface that bypasses it — same reason it
calls `useDrops().roll()` itself), `ChapterReader` / `BibleChapterScreen`,
`DailyChest`, the share handler, and `donate_collectible`'s result.

### Surfaces

- **`/pilgrimage`** — the road. A vertical scroller of waystations (vertical
  beats horizontal at 520px max width), current position pinned, next reward
  always visible without scrolling. Quests fold above it through the shared
  `Collapsible`, count on the header.
- **A strip on `/play`** — miles bar, next reward thumbnail, tap to open. The
  bottom nav is full at five tabs; don't add a sixth. This strip is how the
  feature gets seen.
- **A row on `/you`** — second entry point, next to the book.
- **`WaystationToast`** — mounted once in `App`, top of screen.

---

## 11. Art

Volume per road: ~4 skin renders + ~15 items/companions + ~12 fortress props +
6 card backgrounds. The eleven reward types are deliberately weighted toward the
cheap end so the road stays fundable by one person.

**Skins, companions and items follow `docs/RASTER-SKINS.md` exactly** — that
pipeline exists because generated art arrives with a silhouette, a watermark and
a magenta halo, and the despill pass is the non-obvious part:

1. Generate square: **full body, flat magenta `#FF00FF` background, no ground
   shadow, no text, no border, single figure, centered**.
2. Key magenta → transparent with a soft edge, then **despill every pixel within
   2px of transparency**, or the magenta-tinted outline survives as a pink halo —
   invisible on the dark avatar circle, obvious everywhere else.
3. Isolate by empty-column split, keep the region with the most ink. Drops the
   silhouette and the corner watermark.
4. Pad 8% below the feet (the figure sits above the shadow `Character` draws at
   y=162 of a 170-unit viewBox).
5. **Cap at 400px tall.** The avatar never renders above 92 CSS px = 276 device
   px at 3× DPR. Uncapped 1024px sources were ~500KB; capped, ~90KB.
6. Land in `public/skins/<id>.png`, register in `RASTER_SKINS`.

**Style ladder.** Generate a whole road against one reference — pass
`public/skins/moses.png` and `esther.png` as style references on every call. The
existing ten skins are the house style and a road that doesn't match them looks
like a different game inside the same grid.

> Full-body character illustration of {subject}, {wardrobe and held object},
> standing, facing forward, matching the reference style: flat cel shading, warm
> earthen palette, thick confident outlines, no gradients, no background detail.
> Solid flat magenta #FF00FF background. No shadow, no text, no watermark, no
> frame. Single figure, centered, full body head to feet.

**Items** are `/items/<id>.png` (no `item_` prefix on the file), object only, no
figure, same magenta key, cap ~200px. The existing six are the size target —
`staff.png` is 11KB, `headwrap.png` 55KB; anything over ~60KB gets re-exported.

**Card backgrounds are not a generation job.** They're 400×240 vector scenes
recolored through a 4-slot palette, and every inch of the card is covered by
avatar, name, XP bar and stat tiles — read `docs/CARD-ART-PROMPTS.md` for the
measured crop windows first.

**Fortress props, flames, chests and ribbons are drawn, not generated** — flat
SVG, no `<defs>` (shared ids across instances silently repaint each other).

**The API key never lands in the repo.** `scripts/gen-art.mjs` reads
`GEMINI_API_KEY` from the environment; `.env.local` is already gitignored.

---

## 12. Rollout

1. **Miles + the road, one column, LOCAL only.** No quests, no second column.
   Prove `track()` fires from every choke point and that miles survive a reload —
   drive the real app in Chromium, seed `localStorage`, play a run, reload. Both
   of the last two real bugs here were state bugs invisible in the diff.
2. **The cheap reward types** — titles, confetti, flames, chest skins. Four
   types, almost no art, and they prove the grant → equip → render loop end to
   end before a single figure gets drawn.
3. **Quests**, with the reroll. Verify the guest client and the SQL produce an
   identical list for the same `(roadId, dayNumber)`.
4. **Online parity.** Migration, the three RPCs, the store's `isOnline()` branch.
   Apply the schema by hand against `visuppaucpzzigwtqmdd` before merging.
5. **The art tiers** — items, companions, fortress props, then skins.
6. **Season 2 as a config change.** If adding the Advent Road touches anything
   outside `data/season.ts` and `public/`, step 1 was built wrong.
