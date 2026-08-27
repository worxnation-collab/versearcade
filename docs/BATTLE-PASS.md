# The Pilgrimage — a battle pass that can't rank anybody

The seasonal progression track: a second, parallel level ladder that resets every
season, fills from playing/reading/studying, and pays out cosmetics along the way.
Structurally it is a Fortnite / Modern Warfare battle pass — separate XP, a free
track and a paid track side by side, tier-by-tier unlocks, retroactive grant on
purchase. This is the design of record; build from it.

**Call it the Pilgrimage in the app, not the battle pass.** There is already a
`/battle` tab with real head-to-head battles in it, and "battle pass" next to it
means the wrong thing twice. The metaphor also does real work: a season is a
**road**, progress is measured in **miles**, tiers are **waystations**, and the
paid track is the **Pilgrim's Pass**. Nobody walks a road *against* anyone.

---

## 1. The rule that makes this shippable here

The mission constraint is stickiness without shame, and the leaderboard ranks on
`profiles.xp` (`0006_leaderboard.sql`). Put those two facts together and the
paid track has exactly one legal shape:

> **The Pilgrim's Pass is cosmetic-only, with no exceptions.** Anything that
> touches XP, points, streaks, relics, or church standing lives on the free
> track or nowhere.

This is not a style preference, it's the line that keeps the app honest. Three
tempting rewards fail it, and they are the three a normal battle pass would put
on the paid side first:

| Tempting premium reward | Why it's disqualified |
|---|---|
| **XP Boosts** | `xp` *is* the worldwide rank. Selling boosts sells rank. Free track only. |
| **Streak Freezes** | Streaks gate the borders, badges and armor pieces marked `earned` — the prestige tier that `AVATAR-ECONOMY.md` says must stay unbuyable. Selling freezes sells prestige indirectly. Free track only. |
| **Relics / better drop odds** | Relics exist to be given to your church (`donate_collectible`, 0049), and church points are a leaderboard. A paid drop bonus is money buying church standing. Free track only, and never a rate modifier. |

Everything the pass sells is a skin, an item, a companion, a card background, a
border or a badge. That is the same "cosmetic only" principle already written
down in `AVATAR-ECONOMY.md`, applied to a subscription-shaped surface.

Two more guards, both cheap and both load-bearing:

- **Nothing on the Pilgrimage screen shows another player.** No pace bar, no
  "you're behind", no "63% of players reached waystation 20", no friend
  comparison. The road shows where *you* are and what's next, full stop.
- **Nobody ends a season with nothing.** See §6 — reaching even waystation 1
  earns a permanent memento of that road, and the season-end screen reports a
  number that only goes up ("you walked 340 miles") rather than a fraction
  ("34/50").

---

## 2. Season shape

**Seasons are liturgical, because this app gets to do that.** A church already
runs on seasons, so the pass calendar is Advent / Lent / Eastertide / Harvest
rather than an arbitrary 60-day drumbeat. It costs nothing extra and it is the
single most on-brand decision available.

| Road | Window | Days | Waystations |
|---|---|---|---|
| **The Harvest Road** | Sep 1 – Nov 15 | 76 | 50 |
| **The Advent Road** | Nov 29 – Jan 6 | 39 | 30 |
| **The Wilderness Road** (Lent) | Feb 17 – Apr 4 | 46 | 40 |
| **The Emmaus Road** (Eastertide) | Apr 5 – May 24 | 50 | 40 |

Waystations ≈ 0.7 × days, so a player doing the dailies most days finishes with
room to spare and a player who plays once a week still lands a real haul. Gaps
between roads are intentional — a week off between seasons makes the next one an
event instead of a treadmill.

`data/season.ts` holds the roads with hard ISO start/end dates, exactly like
`LIMITED_UNTIL` in `data/avatar.ts`. The active road is a pure function of
`Date.now()`; there is no "current season" server flag to get out of sync.

---

## 3. Miles — the second currency

`miles` is a per-season counter, entirely separate from `xp`. It never appears on
a leaderboard, never feeds `level`, and is thrown away at season end (the
rewards it bought are kept forever).

Waystation *n* costs a flat **1,000 miles**, not an escalating curve. A battle
pass wants a metronome, not the ~35% compounding ramp `levelInfo()` uses — the
whole appeal is a predictable "two more days to the next thing".

Earning, all of it small on purpose so quests stay the main engine:

| Action | Miles | Hook |
|---|---|---|
| Finish any quiz run | 40 + 4/correct | `QuizRunner.onComplete` — one call site covers daily, practice, focus, CPU, battle |
| Daily drop, first play of the day | +100 | same, gated on `playedToday` |
| Open the Daily Chest | +60 | `features/chest/DailyChest.tsx` |
| Read a Bible chapter (first time that day) | +50 | `ChapterReader` / `BibleChapterScreen`, the same choke points that write `read` marks |
| Share the daily verse | +75 | share handler |
| Donate a relic to your church | +50 | `donate_collectible` result |
| **Daily quest** | **250 each** (×3) | see §4 |
| **Weekly quest** | **600 each** (×5) | see §4 |

Roughly: quests are ~72% of a completionist's miles, play is the rest. That's
deliberate — it means the ceiling is set by *showing up on many days*, not by
grinding many runs on one day, so no daily cap wall is needed. There is no
"you've hit today's limit" message anywhere, because that message is a small
shame and the numbers make it unnecessary.

**Study runs award miles.** They still award no XP, no points and no standing —
`lib/drops.ts`'s rule is untouched. Miles are private and rank nothing, so this
is the first reward the Study tab can safely pay, and it finally gives studying
a forward pull without giving it a score.

---

## 4. Quests

The actual engagement engine. Fortnite and CoD both learned this: the XP ladder
is the reward, the quest list is the reason to open the app.

- **3 dailies**, rolling over at the player's local midnight. Unfinished ones
  vanish silently — never a "failed", never a red X, never a count of missed days.
- **5 weeklies**, issued Monday, that **persist to the end of the road**. A
  player who misses a week loses nothing; they just have more to do later. This
  is the single most important anti-shame mechanic in the feature.

**Quests are deterministic from `(roadId, dayNumber)` and identical for every
player** — seeded exactly like `getVerseForDate` and the question generator.
Everyone gets the same three today. That makes the guest mirror trivial (both
sides compute the same list from the same seed, nothing to sync), it makes the
quests shareable conversation, and since nothing is ranked there is no fairness
argument against it.

Quest verbs, drawn so they route players into surfaces that are currently
under-visited:

```
play_daily            finish today's drop
answer_correct(n)     n correct answers, any mode
perfect_run           a no-miss run
combo(n)              hit an n× combo
read_chapters(n)      open n chapters in the Bible
read_book(book)       open a chapter in a named book
study_runs(n)         n finished study runs
focus_accuracy(pct)   clear a focus drill at pct
cpu_wins(n)           beat the CPU n times
save_verses(n)        keep n verses
donate(n)             give n relics to your church
share_daily           share the daily verse
open_chest            open the Daily Chest
```

Every one of those is self-vs-self or self-vs-CPU. `cpu_wins` is the only
"beat something" verb and the something is a simulation, which is the same line
`CpuVersusQuiz` already draws.

---

## 5. The two tracks

Every waystation pays a **Road reward** (free, everyone). Pass holders *also*
get the **Pass reward** at that waystation. Buying at waystation 30 retroactively
grants all 30 pass rewards at once — non-negotiable, it's what makes a mid-season
purchase feel good instead of punishing.

**Rewards auto-grant on arrival, with a reveal.** No manual claim, no "12
unclaimed" badge nagging from the tab bar. Reuse the `StudyDropToast` pattern
exactly: the grant parks in `store/season.ts`, an app-mounted `WaystationToast`
shows it wherever the player lands, slim bar at the top so it never covers the
primary action.

### The Harvest Road, in full (Season 1)

Ruth and Boaz — gleaning, redemption, showing up in a field every day until the
harvest is in. It is almost embarrassingly on the nose for a progression track.

| Way | Road (free) | Pass (paid) |
|---|---|---|
| 1 | 1 Streak Freeze | **Ruth the Gleaner** (skin, state 1 — empty basket) |
| 3 | item: *Harvest Headscarf* (hat) | item: *Sickle* (held) |
| 5 | relic: Sheaf of Firstfruits | card bg: **Barley Field** |
| 8 | 1 XP Boost | item: *Gleaner's Shawl* (cape) |
| 10 | **companion: Lamb** | item: *Winnowing Fork* (held) |
| 13 | fortress: *Sheaf Banner* | card bg: **Gate of Bethlehem** |
| 15 | 1 Streak Freeze | badge: 🌾 *Gleaner* |
| 18 | relic: Threshing Sledge | item: *Jar of Parched Grain* (held) |
| 20 | card bg: **Gleaning** | **Ruth state 2** — basket half full |
| 23 | 1 XP Boost | fortress: *Harvest Tapestry* (armoury wall) |
| 25 | item: *Water Skin* (held) | **companion: Threshing Ox** (Deut 25:4) |
| 28 | relic: Measure of Barley | card bg: **Threshing Floor at Night** |
| 30 | **border: Barley Gold** | **fortress: Armoured Destrier** (stable) |
| 35 | 2 Streak Freezes | **Ruth state 3** — sheaf on the shoulder |
| 40 | fortress: *Hand-Mill* (hearth) | item: *Boaz's Signet* (held) |
| 45 | 2 XP Boosts | badge: 👑 *Kinsman-Redeemer* |
| 50 | **card bg: The Winnowing** + **memento: Harvest Road** | **Boaz** (skin) + **Ruth state 4** — basket overflowing |

Two things in that table are worth stealing for every future road:

**The reactive skin.** Ruth lands at waystation 1 so a purchase pays off in the
first minute, and then *changes* at 20, 35 and 50. Her basket fills. It is one
skin id with a `state` derived from the player's furthest waystation, four PNGs
instead of four skins, and it gives the long middle of the road something to pull
toward that isn't just "another hat". `Character.tsx` picks the art with
`RASTER_SKINS['ruth_' + state]`; the equip UI still shows one entry.

**The free track is generous.** Fortnite's free track is a token gesture because
Fortnite is free-to-play with 400M accounts. This app's free track *is* the
product for most people, so it carries real cosmetics, a companion, a border and
the season memento. The pass adds a full second column; it does not unlock the
first one.

### Battle-pass-only skins (never sold in the shop, ever)

This is what a pass is *for*. A pass skin does not come back as a `$2.99` tile
next season, which is exactly why someone walks the road for it.

| Road | Pass skins | Note |
|---|---|---|
| Harvest | **Ruth** (reactive, 4 states), **Boaz** | |
| Advent | **Caspar**, **Melchior**, **Balthasar** (the Magi, one per third of the road) | Mary stays earn-only or omitted, per `AVATAR-ECONOMY.md`; Jesus never, in any form |
| Wilderness (Lent) | **Aaron** (breastpiece of twelve stones), **Miriam** (timbrel) | the "carry the cross" Lenten act stays a separate *earned* unlock — it is devotional, not merchandise |
| Emmaus | **Cleopas** (road-dusty traveler), **Thomas** | the risen Christ on the Emmaus road is depicted **only** as an empty place at the table on the card background — never a skin |

**Note the divergence from `skinExpired`.** Today a `limitedUntil` skin vanishes
from the grid *even for owners* (see the filter in `CustomizeSection`). Pass skins
must not do that — they're earned, they're permanent, and the whole promise is
that you keep them. So pass skins carry no `limitedUntil`; their exclusivity is
that they are never listed for sale again, enforced by `source: 'pass'` never
appearing in the shop query. Add `'pass'` to `SkinDef.source` rather than
overloading `exclusive`, which currently means "promo code".

### Battle-pass-only items, and one new slot

Item slots today are `hat | held | cape` — note that `AVATAR-ECONOMY.md`
promises `top` and `bottoms` too, but the real `ItemSlot` in `src/types` never
had them — and there are exactly six items in `ITEMS[]`. A pass is the right vehicle to take that to fifty — items
are cheap to draw, they stack into a collection, and they're the free track's
bread and butter.

**Add a `companion` slot.** A small figure standing beside the character:
the lamb, the threshing ox, Elijah's raven, the turtledove, the Advent star.
Companions are the single most-wanted battle pass reward type in the genre (pets
and back blings), they're visually legible at avatar size in a way a belt is not,
and they're pure flavor with no stats. `ItemSlot` gains one member,
`Character.tsx` gains one render layer to the left of the figure at ground level,
and the existing `itemsBySlot` grid picks it up for free.

Harvest item set, for scale: *Sickle, Winnowing Fork, Jar of Parched Grain,
Water Skin, Boaz's Signet, Sheaf* (held) · *Harvest Headscarf, Threshing Veil*
(hat) · *Gleaner's Shawl, Redeemer's Mantle, Road Cloak* (cape) · *Lamb,
Threshing Ox, Turtledove* (companion). Add `top`/`bottoms` to `ItemSlot` if you
want the tunic and sandals — don't assume they exist.

### Fortress decorations — the third reward type

The furnishings for a faction's hall (`docs/FORTRESS.md`): banners, an armoured
destrier in the stable, armour on the wall rack, a rosary on the long table.
These are the best value-per-unit-of-work on the whole track — they're small flat
SVG props rather than figures, they hang in a space other players walk into
(which is what actually drives cosmetic desire), and they have zero gameplay
effect by construction.

They're **items**, mechanically: `ItemSlot` gains `'fortress'` and `ItemDef`
gains a `mount` naming its anchor, so they grant through the existing
`grantItem` → `profiles.owned_items` path with no new table.

One rule crosses over from that doc and binds here: **devotional objects are
earned or free, never sold.** A rosary, an icon corner, a censer, a font, a
prie-dieu go on the Road; the Pass sells heraldry and furniture. Nobody is
charged $5.99 for a devotional object of their own tradition.

---

## 6. Season end

At the end of a road, in this order:

1. Every reward already granted stays granted, forever. Nothing is revoked, ever.
2. `miles` resets to zero. Waystations not reached are simply not reached — no
   screen anywhere says how many were missed.
3. **Everyone who reached waystation 1 gets that road's memento**: a small
   collectible card (`category: 'card'`) recording that they walked it. This is
   the "nobody ends empty-handed" guarantee, and it costs one row in
   `COLLECTIBLES` per season.
4. The recap says **"You walked 340 miles on the Harvest Road"** and lists what
   was earned. It does not say 34/50, it does not show a percentage, and it does
   not show anyone else's number.

An unowned pass at season end shows *nothing* about what could have been —
no ghosted premium column with a "you missed these" caption. That's the FOMO
lever the genre pulls hardest and it is the exact shape this app refuses.

---

## 7. Commerce — the part that gets the build rejected

The pass is a purchase, so it obeys `lib/commerce.ts` and nothing else. **Add
`passVisible()` there; do not branch on `isNativeApp()` in the Pilgrimage
screen.**

```ts
/** May we show the Pilgrim's Pass upsell — its price, its column, its CTA? */
export const passVisible = (road: RoadDef, owned: boolean): boolean =>
  owned || storefrontEnabled()
```

**The screen must be complete and correct with the premium column absent.** That
is the fail-closed state — no RevenueCat key, offline, product not approved yet —
and it is the state the app ships in until StoreKit actually returns the product.
Design the road as the free track *first*, with the pass column as an overlay
that can be removed without leaving a hole. Concretely, when `passVisible()` is
false: no second column, no lock icons, no price, no "$5.99", no "coming soon"
line, no greyed silhouettes of Ruth. A hidden shop is compliant; a shop that
can't take money is a rejection, and a locked column *is* a shop.

**SKU per season, non-consumable.** `pass_harvest_2026`, `pass_advent_2026`, …
Not an auto-renewing subscription: subscriptions drag in management UI, renewal
messaging, and a "your pass lapsed" state that is pure shame, and they'd be the
first thing App Review looks hard at. A non-consumable per-season product drops
straight into the flow that already exists — RevenueCat entitlement →
`iap-fulfill` (0047) → grant. Web sells the same SKU through a Stripe Payment
Link in `BUNDLE_BUY_URLS`' sibling map.

**Price $5.99**, matching the Angel Pack. It's the established top of the band
and the pass carries more content than any pack.

**The client never says what it bought.** Same rule as every entitlement here:
the app asks `iap-fulfill` to settle up, the function asks RevenueCat what the
subscriber owns and grants that. There is deliberately no client-callable
`grant_pass`. `award_season_xp` and `claim_waystation` are player-callable;
granting the *pass entitlement* is not.

Display price on native comes from `displayPrice(sku)` — Apple's localized
string — never a hardcoded `$5.99`.

---

## 8. Data model

### Online

New migration (take the next free number; write it idempotently — `0034` is
already used twice and `0038` is a re-add, per `CLAUDE.md`).

```sql
create table if not exists public.season_progress (
  user_id      uuid references auth.users on delete cascade,
  road_id      text not null,
  miles        integer not null default 0,
  waystation   integer not null default 0,   -- highest reached
  has_pass     boolean not null default false,
  granted      text[]  not null default '{}',-- reward ids already handed out
  primary key (user_id, road_id)
);

create table if not exists public.season_quest_progress (
  user_id   uuid, road_id text, quest_id text,  -- quest_id = '<road>:<kind>:<seed>'
  progress  integer not null default 0,
  done_at   timestamptz,
  primary key (user_id, road_id, quest_id)
);
```

Functions, house pattern (`security definer`, `set search_path = public`,
`auth.uid()`, validated inputs, `grant execute to authenticated`, each guarding
itself with `if uid is null then raise`):

- `award_season_xp(p_road text, p_source text, p_amount int, p_local_date date)`
  — clamps the date ±1 like `submit_focus_practice`, clamps `p_amount` against a
  server-side per-source maximum so a lying client can't mint miles, advances
  `miles`, recomputes `waystation`, and returns any newly-granted reward ids.
  **The server owns the reward table**, not the client — a client that claims
  waystation 50 must be told no.
- `track_quest(p_road text, p_quest_id text, p_delta int, p_local_date date)` —
  same clamping, marks `done_at` and awards the quest's miles atomically so a
  double-fire can't pay twice.
- `grant_season_pass(...)` — `postgres`/`service_role` only, called by
  `iap-fulfill`. Sets `has_pass` and immediately grants every pass reward at or
  below the current waystation (the retroactive unlock). Never grantable by a
  client, exactly like `grant_skins` / `fulfill_skin`.

Check the real ACL before assuming, as always:

```sql
select proname, proacl from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and proname like '%season%';
```

**Apply the migration before merging the client** — nothing applies them on
deploy.

### Local / guest

`va.season.<roadId>` → `{ miles, waystation, granted, quests }`, plus
`va.season.pass.<roadId>` for the local-mode pass flag (LOCAL mode has no
purchase, so this is dev-only / a manual grant).

**Guest writes merge onto disk, not onto in-memory state.** A run can finish
before anything called `load()` — deep link straight into a quiz — and merging
onto `{}` erases the season. Read the road record off `localStorage` inside the
writer, exactly like `store/drops.ts:rollGuest` and the comment in
`store/bookAccuracy.ts:record`.

### Mirrored math

`lib/season.ts` holds `MILES_PER_WAYSTATION`, the earn table, the quest seed
function and the reward table; the SQL holds the same numbers. Carry the
"keep in sync with `award_season_xp`" comment, same as `lib/practice.ts` and
`lib/drops.ts`.

---

## 9. Client wiring

One store, one tracking call, no sprinkling:

```ts
useSeason().track('quiz_complete', { correct: 8 })
useSeason().track('chapter_read', { book: 'Ruth', chapter: 2 })
```

`track()` resolves miles from the earn table *and* advances any quest matching
that verb, so a new quest verb never needs a new call site. Wire it at the
existing choke points and nowhere else:

- `QuizRunner.onComplete` → every quiz mode at once (daily, practice, focus, CPU,
  battle). Same reason `studyDrop` lives there.
- `ReviewScreen` → the one study surface that bypasses `QuizRunner`, exactly like
  its `useDrops().roll()` call.
- `ChapterReader` / `BibleChapterScreen` → reading, the same two places that
  write `read` marks.
- `DailyChest`, the share handler, `donate_collectible`'s result.

### Surfaces

- **`/pilgrimage`** — the road. A vertical scroller of waystations (vertical
  beats horizontal on a 520px-max phone layout), current position pinned, next
  reward always visible without scrolling. Quests as a folded `Collapsible`
  above it, head count on the header like the church roster.
- **A strip on `/play`** — miles bar, next reward thumbnail, tap to open. The
  bottom nav is full at five tabs; don't add a sixth. This strip is how the
  feature gets seen.
- **A row on `/you`** — a second entry point next to the book.
- **`WaystationToast`** — mounted once in `App`, top of screen, the
  `StudyDropToast` pattern.

---

## 10. Art — the Nano Banana pass

Volume: ~4 skins (Ruth ×4 states counts as 4 renders) + ~17 items + 3 companions
+ 6 card backgrounds per road. Items and companions are the bulk and they are
small, so batch them.

**Skins and companions follow `docs/RASTER-SKINS.md` exactly** — that pipeline
exists because generated art arrives with a silhouette, a watermark and a magenta
halo, and the despill pass is the non-obvious part:

1. Generate square, **full body, flat magenta `#FF00FF` background, no ground
   shadow, no text, no border, single figure, centered**.
2. Key magenta → transparent with a soft edge, then despill every pixel within
   2px of transparency, or the magenta-tinted outline survives as a pink halo
   that is invisible on the dark avatar circle and obvious everywhere else.
3. Isolate by empty-column split, keep the region with the most ink — this is
   what drops the silhouette and the corner watermark.
4. Pad 8% below the feet (the figure sits above the shadow `Character` draws at
   y=162 of a 170-unit viewBox).
5. Cap at **400px tall**. The avatar never renders above 92 CSS px = 276 device
   px at 3× DPR. Uncapped 1024px sources were ~500KB each; capped, ~90KB.
6. Land in `public/skins/<id>.png`, register in `RASTER_SKINS`.

**Style ladder.** Generate the whole road against one reference — feed Nano
Banana `public/skins/moses.png` and `esther.png` as style references on every
call. The existing ten skins are the house style and a road that doesn't match
them looks like a different game inside the same grid. Prompt skeleton:

> Full-body character illustration of {subject}, {wardrobe and held object},
> standing, facing forward, matching the reference style: flat cel shading, warm
> earthen palette, thick confident outlines, no gradients, no background detail.
> Solid flat magenta #FF00FF background. No shadow, no text, no watermark, no
> frame. Single figure, centered, full body head to feet.

**Items are a different spec.** They render as `/items/<id>.png` (no `item_`
prefix on the file) at chip size on the customize grid — object only, no figure,
same magenta key, cap ~200px. The existing six (`staff.png` at 11KB,
`headwrap.png` at 55KB) are the size target; anything over ~60KB should be
re-exported before it lands.

**Card backgrounds are not a Nano Banana job.** They are 400×240 vector scenes
recolored through a 4-slot palette, and every inch of the card is covered by
avatar, name, XP bar and stat tiles — see `docs/CARD-ART-PROMPTS.md` for the
measured crop windows before drawing a single one. A raster background will look
wrong next to the 42 existing cards.

**Raster is still a preview path.** Per `RASTER-SKINS.md`, raster can't compose
with armor and items and softens at the 18px presence chip. Ruth and Boaz ship
raster to get the season out; anything that survives past its road should be
redrawn as SVG paths.

---

## 11. Rollout

1. **Miles + the road, free track only, LOCAL first.** No quests, no pass, no
   commerce. Prove `track()` fires from every choke point and that miles survive
   a reload — drive the real app in Chromium, seed `localStorage`, play a run,
   reload, check what survived. Both of the last two real bugs here were state
   bugs invisible in the diff.
2. **Quests.** Deterministic generation, the daily roll, the persistent weeklies.
   Verify the guest client and the SQL produce the identical list for the same
   `(roadId, dayNumber)`.
3. **Online parity.** Migration, the three RPCs, the store's `isOnline()` branch.
   Apply the schema by hand against `visuppaucpzzigwtqmdd` before merging.
4. **The pass column, behind `passVisible()` returning false.** Ship it dark and
   confirm the screen is complete without it. This is the state native runs in
   until StoreKit has the product, so it has to be the good state, not the
   degraded one.
5. **Commerce.** Stripe link on web, `pass_harvest_2026` through RevenueCat →
   `iap-fulfill` on native, retroactive grant on fulfillment. Bump
   `package.json` `version` and `android/app/build.gradle` `versionName`
   together — 1.0 is live and a repeat version is rejected 20 minutes into a
   signed archive.
6. **Season 2 as a config change.** If adding the Advent Road means touching
   anything outside `data/season.ts` and `public/skins/`, step 1 was built wrong.
