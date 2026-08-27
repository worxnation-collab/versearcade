# The Fortress — a faction's hall you can furnish

Tap a denomination on the Battle ranks and you go inside its hall: the building,
the faction's people standing in it, and the things its members have earned hung
on the walls. It's `ChurchDetailSheet` applied one level up — the moment a
leaderboard row stops being a number and becomes a place — and it is where the
Pilgrimage's furnishing rewards are actually seen.

Read `docs/BATTLE-PASS.md` first; this is where a third of that track pays out.
Everything here is free, like everything on the track.

---

## 1. What a denomination already is

`data/denominations.ts` is not a profile field, it's a **battle faction**. It
appears only on the Battle ranks, never on the encouragement-first main
leaderboard, and `battle_denomination_board` (0032) already ranks factions by
pooled battle wins with a member count. The comparison exists, deliberately, and
it's already fenced.

Two facts from that file constrain everything below, and the second one is the
easy one to get wrong:

- **Factions are already ranked by wins.** So the fortress must not become a
  *second*, parallel ranking — especially not one money can move.
- **`agnostic` and `atheist` are ordinary teams.** "No separate styling, no
  asterisk, no 'guest' tier. Same board, same rules." A fortress that is a
  chapel breaks that on the first render. See §4.

---

## 2. The rule that keeps this safe: presence, not quantity

The obvious build is "show everything the faction's members have unlocked."
Do that and a fortress becomes a live tally of faction size and grind —
Catholics with four thousand banners next to Adventists with forty. That's a
sectarian scoreboard, on a topic where real people have real sore spots, and
making the track free doesn't help: it just changes what the tally measures from
who paid to who has more members. It's the single worst thing this feature could
turn into.

`CLAUDE.md` already solved this exact problem one level down, for church skins:

> A skinned church is not a bigger church — no number distinguishes it, which is
> the point: the thing a church pays for is the thing that can't beat anybody.

Same rule, one level up:

> **A furnished fortress is not a bigger fortress.** Nothing in the hall is ever
> counted. A decoration is present or absent — never "×47", never "12 members
> own this", never a contributor name, never a total. One member owning the
> destrier and ten thousand owning it render identically.

Everything else in this doc falls out of that sentence.

---

## 3. Two layers in one room

The tension is real: "our house" wants to be collective, but a collective
trophy room saturates in a week and then a new member's banner is a drop in an
ocean — the reward stops working for exactly the people who most need it to.

So the room is two layers with different owners.

**The hall is the faction's, and unbuyable.** Architecture, size, the banner
colours, the crowd. It grows with pooled faction battle wins on a slow curve,
the same way `church_level_from_xp` grows a building for a congregation. Money
cannot touch this layer at all. This is the "our house" feeling and it's earned.

**The furnishings are yours, rendered into the shared room.** Your armoured
horse in the stable, your armour on the wall rack, your rosary on the table.
**You always see your own things.** Every member of a faction walks into a hall
furnished by themselves, standing among their own people.

For a visitor from another faction, the anchors fill with a **deterministic
sample** of what that faction's members have placed — seeded from the viewer's
id, so it varies between visitors and ranks nothing. No sample is "the best"
and nobody's placement wins a slot.

This is the only model where the reward pays off identically for the first
member and the ten-thousandth, and it makes the counting trap structurally
impossible: there is no collective set to count.

---

## 4. The building is secular, on purpose

**Not a chapel. A keep.** Stone hall, hearth, long table, banner poles, an
armoury wall, a stable through the arch. Every faction on the list gets the same
architecture at the same quality, including the two that aren't traditions —
which is what `denominations.ts` already promises in writing, and a hall is the
only base building that keeps that promise without an asterisk.

Faction identity comes from two free things:

- **The gonfalons** take `denominationColor(key)` — already measured to clear
  ΔE 9 from every other entry under normal, deutan and protan vision, because a
  faction dot is 10px next to an avatar. Two hanging banners in the faction's
  colour identify a hall instantly at any size.
- **A crest** on the shield above the hearth, one flat mark per faction.

Then **all** religious character comes from decorations members chose to hang.
A Catholic hall looks Catholic because its members hung a rosary and an icon
corner; an Orthodox hall because someone hung a prayer rope; an atheist hall
because someone hung a map table, a chess set and a wall of books. Nothing is
assigned by faction, so nothing can be assigned *wrongly* by faction — which is
the failure mode worth designing out, since getting a tradition's iconography
subtly wrong is worse than not shipping it.

**Decoration availability is universal.** Anyone can earn and hang anything. Do
not gate the rosary to Catholics: that's an identity gate, it breaks the moment
somebody switches faction, and it turns a warm object into a permission check.

---

## 5. Everything here is free — and one rule survives anyway

Nothing in the hall is for sale (see `docs/BATTLE-PASS.md`), so the old
"devotional objects are earned, never sold" line is satisfied by construction.

One piece of it still binds, for a different reason:

> **No decoration is assigned by faction, and none is gated to one.** Anyone can
> earn and hang anything. Don't gate the rosary to Catholics — that's an identity
> check, it breaks the moment somebody switches faction, and it turns a warm
> object into a permission prompt.

A hall looks like its tradition because its members *chose* those objects, not
because the app decided what Catholics get. That's what keeps the feature warm
instead of presumptuous, and it's why the iconography can't be subtly wrong for
a tradition — the app never asserts anything about one.

### The catalog

**Devotional** — rosary · prayer rope · icon corner · prie-dieu · baptismal
font · censer · open Bible on its stand · chalice · Advent wreath · prayer
shawl · a lit candle rack.

**Heraldry** — faction gonfalon (auto, `denominationColor`) · Lion of Judah
standard · Chi-Rho banner · olive-branch pennant · twelve-star banner · sheaf
banner · a plain war banner.

**Armoury** — the six Armor of God pieces as a set · kite shield · crossed
spears · hunting horn · antique map of the Holy Land · a season tapestry
(Harvest, Exodus, Emmaus) · a rack of practice staves.

**Stable** — armoured destrier · palfrey · donkey · ox · camel · a yoked pair ·
dovecote · a sleeping hound.

**Table** — scribe's inkhorn and quill · chess set · loaves and fish · bowl of
pomegranates · oil lamp · a map with pins · a relic case (displays a relic you
actually found — ties the drop economy into the hall).

**Hearth & floor** — stone hearth with fire · brazier · anvil · barrel stacks ·
woven rug · hand-mill · a well.

**Rafters** — iron chandelier · hanging lanterns · a bell · roosting doves ·
stained-glass rose window · a hanging censer.

Roughly sixty objects across six anchor types, and every one of them is a small
flat SVG prop. That is the cheapest reward-per-unit-of-work in the whole
Pilgrimage, which is most of why the track leans on it.

## 6. Anchors — a loadout, not a canvas

The room has a **fixed set of typed anchors**, and you choose which of your
decorations sits in each. That's the locker screen the genre runs on, and it
bounds the scene's cost no matter how much a player owns.

| Anchor | Count | Takes |
|---|---|---|
| Banner poles | 2 | standards, gonfalons, pennants |
| Armoury wall | 3 | armour pieces, shields, crossed arms, horns, maps, tapestries |
| Stable arch | 2 | destrier, palfrey, donkey, ox, camel, dovecote |
| Long table | 3 | rosary, open Bible, chalice, censer, inkhorn, chess set, lamp, fruit bowl |
| Hearth & floor | 2 | brazier, anvil, rug, prie-dieu, font, barrels, hand-mill |
| Rafters | 2 | chandelier, lanterns, bell, roosting doves, stained glass |

Fourteen anchors, so the hall's render cost is fixed and a member with forty
decorations still draws fourteen props.

**Placement is per-user and has no free text.** This matters more than it looks:
`CLAUDE.md` is explicit that no client may write a church's page, because an open
field on somebody else's congregation is a moderation problem. A denomination is
*more* strangers than a congregation, so the fortress goes further —

- **No text anywhere in the hall.** No plaques, no dedications, no "hung by
  @someone", no faction motto. Decoration names come from a fixed catalog.
- **Nothing writes the faction's hall.** The shared layer is derived from
  battle wins and from members' own placements; there is no
  `admin_upsert_fortress` because there is nothing authored to publish.

### Merging duplicates

Put a decoration you already have out somewhere a second time and the two
**merge** into one finer piece — plain, then Fine, then Grand — and the spot you
were about to fill stays empty for something else. Three tiers is the ceiling.

It is pure upside: nothing is spent, nothing is destroyed, the spare anchor
comes back, and clearing a merged prop simply starts it again at plain, because
ownership is still derived from the six counters and you never stopped owning
the rug. On the stable, which has one spot, "put a second one out" means tapping
the one you have, so the destrier can be gilded like everything else.

This does not break *presence, not quantity*. A tier is a **look**, the same way
a church skin is: a Grand rug is not a bigger rug, no number distinguishes it,
and reading a hall backwards still tells you nothing about how many members own
one or who hung it. The gilt is drawn as an accent behind the existing prop
rather than as new artwork — 15 decorations x 3 tiers would be 45 renders for
something drawn at 40px, which is the same size argument that made church skins
a kit instead of 32 images.

On the wire the tier is a suffix on the placement value — `keep_woven_rug`, then
`keep_woven_rug.2`, `.3` — so every row written before merging existed reads
correctly as tier 1, `my_keep` and `keep_json` pass it through untouched, and
nothing had to be backfilled (migration 0060). `planPlacement` in
`src/data/keep.ts` is the single place that decides what a duplicate means, so
the guest path and the RPC path cannot disagree.

### The Armor of God rack

The six pieces from `ARMOR` (Ephesians 6:14–17) hang on the armoury wall as a
set — helmet, breastplate, belt, shield, sword, sandals. It mirrors the avatar
armour the player already knows, it's a genuine long-horizon collection, and a
half-finished rack reads as a work in progress rather than a deficiency. Free
track, all six.

---

## 7. The crowd

Reuse `ChurchScene`'s rules verbatim — they were argued through once already and
they're the same argument:

- At most **eleven figures**, in two ranks, back rank smaller and dimmer.
- **Stable per-person jitter** from the username hash, so nobody shuffles on a
  re-render.
- **You stand at the front**, everyone else in the server's order (oldest member
  first). Nobody is ordered by what they gave and no figure carries a score.
- **No "+23 more" badge.** It's a picture of a place, not a census.

A faction is much bigger than a congregation, so the roster below the scene
diverges in one way: it lists a **sample**, not the membership, and says so
plainly — "some of the people who play here". The head count already lives on
the battle board row. There is **no "top givers" list at any point**: `CLAUDE.md`
keeps that for your own church, where it's a thank-you; among tens of thousands
of strangers it's just a comparison.

---

## 8. It needs almost no new server surface

**Fortress decorations are items.** `ItemSlot` is `'hat' | 'held' | 'cape'`
today; add `'fortress'` and give `ItemDef` a `mount` field naming its anchor
type. Then grants ride the existing `grantItem` → `profiles.owned_items` path
with **no new table and no new grant RPC**, and the Pilgrimage's reward table
hands them out exactly like a hat.

(Worth noting while you're in there: `AVATAR-ECONOMY.md` and the reward table in
`BATTLE-PASS.md` both mention `top` and `bottoms` slots that the real `ItemSlot`
never had. Either add them or drop those rewards — don't leave the doc claiming
a slot the type doesn't have.)

What's genuinely new is small:

```sql
-- Which of my decorations sits in which anchor. No text, no faction column —
-- placements follow the player between factions.
create table if not exists public.fortress_placements (
  user_id  uuid references auth.users on delete cascade,
  anchor   text not null,          -- 'banner_1', 'wall_2', 'table_3', …
  item_id  text not null,
  primary key (user_id, anchor)
);
```

Plus one read RPC, `fortress_json(p_denomination text)`, returning the faction's
hall level, the crowd sample and the anchor fill — the caller's own placements
when they're a member, a viewer-seeded sample otherwise. One RPC is the whole
read path, for the same reason `church_json` is: the board, the sheet and your
own tab can't drift apart if they all ask one question.

**Two modes, as always.** Guests have no faction (denomination is a profile
field and the battle board is online-only), so LOCAL mode shows **your own
hall** — your decorations in their anchors, you standing in it, no crowd. The
display half of the feature works with no network at all; the crowd half is
inherently other people, exactly like the church roster. Placements go to
`va.fortress.placements` for guests, merged onto what's on disk inside the
writer, never onto in-memory state — the `store/bookAccuracy.ts:record` trap.

---

## 9. Drawing it

Follow `ChurchArt`'s constraints, which are not stylistic:

- **Flat fills, no `<defs>`, no gradients or filters.** Many halls can render at
  once (board rows, the sheet), and shared `<defs>` ids across instances are a
  classic way to get one instance silently painting another's colours.
- **Two sizes, one drawing.** A hall reads at ~44px in a board row and ~220px in
  the sheet. Decorations are only ever drawn in the sheet, so they get a single
  size — but the *hall* needs both, which is why it's palettes and traits for a
  `Kit` to draw rather than image files.
- **Decorations are props, not scenes.** Small flat SVG components on a fixed
  anchor transform. This is the cheapest reward type in the whole Pilgrimage to
  produce, which is a large part of why it's the right one to lean on.

The horse is the exception worth spending on: a barded destrier in the stable
arch is the decoration everybody will want, and it's the one that needs to read
as an animal rather than a shape. Give it the same reference-style treatment as
a skin (`docs/RASTER-SKINS.md`) if it has to be raster to look right, but prefer
drawn — it sits next to drawn architecture.

---

## 10. Sheet mechanics

Copy `ChurchDetailSheet` exactly:

- **Portal to `document.body`.** The battle board sits inside a `.card`, `.card`
  sets `backdrop-filter`, and a backdrop filter is a containing block for
  `position: fixed`. Same family of bug as the `perspective` note in
  `BookOpening`.
- **`z-index: 100`, the sheet tier.** Don't raise it — the player card is 110 and
  is meant to open *over* the sheet, because tapping a figure in the crowd opens
  exactly that.
- The roster folds through the shared `Collapsible`, count on the header, so a
  folded section still says how big the faction is.

Entry points: tapping a row on the Battle tab's denomination board (rows aren't
tappable today — that's the change), and a "your hall" card on the Battle tab
that opens your own.

---

## 11. The shame audit

Run this list before shipping; every item is a thing the genre does by default
that this app can't.

- [ ] No count of decorations, contributors, or owners appears anywhere.
- [ ] No "top contributor" or "top decorator" list, for any faction.
- [ ] No faction-vs-faction furnishing comparison, and no way to view two halls
      side by side.
- [ ] The faction's rank and win total stay on the battle board where they're
      already scoped; they do not appear inside the hall.
- [ ] A bare hall is described warmly — "stone, and room to fill it" — not as
      empty, poor, or behind.
- [ ] The open factions get the same building, the same anchors and the same
      decoration catalog, with no religious decor assigned by default.
- [ ] Nothing in the hall is behind a price, and no decoration is gated to a
      faction.
- [ ] Nothing in the hall is text a player can author.
- [ ] The crowd carries no per-person score and no join-order prestige.
- [ ] Nothing hung on a wall affects battles, XP, points, drops or standing.

---

## 12. Where it lands in the rollout

Slot it after step 4 of `BATTLE-PASS.md` (the pass column shipped dark), because
the fortress is the payoff surface that makes furnishing rewards worth buying —
but it needs the free track working first so the hall isn't empty for everyone
who hasn't paid.

1. **The hall, free decorations only, LOCAL mode.** `ItemSlot` gains `fortress`,
   the anchors render, placement persists across a reload. Drive it in Chromium
   and reload — placement is exactly the kind of state bug that never shows in a
   diff.
2. **The faction layer.** `fortress_json`, the crowd, hall growth from pooled
   battle wins, tappable rows on the denomination board.
3. **Pass decorations.** They're already just items by then, so this is a reward
   table edit and some drawing.
