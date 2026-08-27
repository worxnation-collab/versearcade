# Church skins

How a church ends up wearing one, and the rules that make the feature safe to
sell.

## Two axes, and only one is for sale

| | decided by | earned how | who can change it |
|---|---|---|---|
| **Which building** (8 tiers) | `features/church/levels.ts` | congregation XP | nobody — it's the ladder |
| **What it's made of** (4 skins) | `features/church/skins.ts` | a claimed page | an admin, after a request |

A skinned church is not a bigger church. It doesn't rank higher, it doesn't
score, and no number anywhere distinguishes it from an unskinned one. That's the
point: the thing a church can pay for is deliberately the thing that can't beat
anybody. It's the same rule the cosmetic packs follow, applied to a congregation
instead of a player.

## The four skins

| id | name | what changes |
|---|---|---|
| `classic` | Classic | The house style — cream walls, violet roof, gold cross. The default. |
| `modern` | Modern | Flat roofs, a glazed clerestory instead of a pitch, slot windows, a blade spire. |
| `glass` | Stained glass | Lead roof over pale coursed stone, leaded jewel windows, a petal rose. |
| `tile` | Tile roof | Terracotta barrel tile with deep eaves, stucco, mission arches, a quatrefoil. |

Plus `custom`, which is **not a skin** — see below.

## Why these are drawn, not painted

There are 8 tiers × 4 skins = 32 buildings. As images that's 32 downloads for
something that renders at **44px in a leaderboard row**, and a picture that
reads at 44px is a different picture from one that reads at 220px on the church
hero. So skins are palettes and traits, and `ChurchArt` draws them.

The mechanism is a `Kit`: the eight tiers compose `Wall`, `Gable`, `Opening`,
`Wheel`, `Spire` and `Topper`, and each skin builds those primitives its own
way. That's what keeps a skin from being a recolour — `Gable` is a pitched roof
on Classic, barrel tile with an overhanging fascia on Tile, and a flat-capped
clerestory box on Modern, so the same composition comes out a different
silhouette.

- **Add a tier** → compose the kit. Every skin gets it free.
- **Add a skin** → add a branch to each primitive plus a palette. Every tier
  gets it free.

Same constraints as before: **flat fills, no `<defs>`.** Shared gradient and
filter ids across instances are how one leaderboard row ends up painting
another's colours, and flat shapes stay crisp at 44px.

One `Kit` is built per skin and cached (`KITS` in `ChurchArt.tsx`). Rebuilding
per render would hand React a new component type every paint and throw away the
whole subtree — in a board of fifty rows that's fifty remounts a scroll.

## How a church gets one

1. Someone on staff opens the church's page and taps **Add info → I'm on staff**.
2. The form shows the four skins previewed on **that church's own building** —
   the tier it has actually earned — and starts on the one it's already wearing.
3. Sending posts to `church_info_requests` (`submit_church_info_request`, 0051).
   **Nothing is published.** The chosen skin rides along as `skin` on the row.
4. A person reads the queue (`admin_church_info_requests` returns `skin`) and
   publishes with `admin_upsert_church_profile(..., p_skin => 'tile')`.
5. `church_json` carries the published skin onto every church shape, so the
   board row, the page, search and the church's own tab all change together.

Three guardrails, all enforced server-side rather than trusted from the form:

- **No client can write a church's page.** `church_profiles` has no
  insert/update policy and no player-callable RPC. Same rule as 0050, and for
  the same reason: this is somebody else's congregation.
- **Only leadership may pick.** `submit_church_info_request` nulls `p_skin` on
  the `member` path. Someone who merely attends can tell us the service times;
  they don't get to redecorate the building.
- **Unpublished means default.** `church_json` only reads a profile where
  `published`, so a page mid-setup never leaks a half-finished look.

## `custom` is a commission, not a look

`custom` means "draw our actual building" — their roofline, their windows. It's
stored so whoever works the queue knows to quote for it, and a church sitting on
it keeps wearing the **default** until real artwork lands as a new skin id.
`churchSkin()` falls back for anything it can't draw, which covers `custom`, a
null, and a value from a newer build all at once.

Delivering one means adding a real skin — a palette, a branch in each primitive,
an id in `CHURCH_SKINS`, and the id added to the three lists in the SQL check
constraints. It is not a per-church escape hatch, and there is deliberately no
way to store one church's bespoke colours.

## No prices, either mode — this is load-bearing

Nothing on this surface names a price or takes money, and that is not
squeamishness. The pill has to be **byte-identical on the web and in the App
Store build**, and by the rule in `lib/commerce.ts` a price label is a
storefront even with no button under it. So the custom option says what it is —
a commission, answered by email — and the money conversation happens with the
church, off the device.

That also happens to be the honest version: what a hand-drawn building costs
depends on the building.

If a church page ever gets a real in-app price, that decision goes in
`commerce.ts` and nowhere else.

## Adding a skin

1. Append to `CHURCH_SKINS` in `src/features/church/skins.ts` — palette, traits,
   blurb.
2. Handle any new trait values in `buildKit()` in `ChurchArt.tsx`.
3. Add the id to the check constraints and the `in (...)` guards in a new
   migration. **Extend the client and the server together**: the client falls
   back for an id it doesn't know, so a newer server never breaks an older app —
   but an older *server* rejects a newer app's choice outright.
4. Look at all eight tiers at 44px and at 220px before shipping it. The contact
   sheet is two loops over `CHURCH_TIERS` and `CHURCH_SKINS`; the failure mode
   is a skin that reads beautifully as a cathedral and as a grey smudge as a
   house gathering.
