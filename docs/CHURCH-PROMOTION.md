# The sponsored slot

One church, at the top of "Suggested for you", labelled **Sponsored**, for
players nearby who haven't picked a church yet. It is the only thing in this
app a third party can pay to put in front of a player, and the rules below are
what make it safe to sell.

Schema: `0075_church_promotions.sql`. Client: `ChurchPicker`, plus the
**Sponsored slot** panel under Admin → Churches.

## What a church is actually buying

| | |
|---|---|
| **Where it shows** | The untyped "Suggested for you" strip at the top of `/church`, for a player with no church |
| **How many** | One slot, per area, at a time |
| **How it's chosen** | Earliest-starting live promotion covering the player — first come |
| **How far** | Within the promotion's radius of the church's own front door, capped at 30 mi |
| **What it costs the player** | Nothing. It's a suggestion, and every other church is still right below it |

## The three rails

### 1. The money never touches the device

There is no client-callable way to create, extend or pay for a promotion. The
only writer is `admin_set_church_promotion`, behind `require_admin()`, and the
money happens off-device — an invoice by email, exactly like the custom church
skin in `docs/CHURCH-SKINS.md`.

That isn't squeamishness, it's the same compliance line the rest of the app
holds. A slot sold *inside* the app is a storefront `lib/commerce.ts` would have
to gate, and a "boost" bought by a user in the App Store build is an in-app
purchase by Apple's reckoning (it's why dating-app boosts are IAP). Sold to the
church, off the device, it is ordinary advertising and neither problem exists.

**So: no price, no checkout, no "get in touch about promotion" pill, in either
mode.** If that ever changes, the decision goes in `commerce.ts` and nowhere
else — same rule as every other purchasable thing here.

### 2. It cannot lie about distance

A promotion has **no position of its own**. It carries a radius; the centre is
the church's own `lat`/`lng`. A congregation therefore cannot advertise into a
town it isn't in — by construction, not by an operator remembering not to let
them.

The radius is capped at 30 miles, which is `SEARCH_RADIUS_MILES`, the picker's
own reach. The slot exists to raise a **local** church higher, never to import a
distant one into a list that says "near you".

### 3. It is a billboard, not an auction

`sponsored_church` orders by `starts_at` and takes one. Flat rate, first come.

Ranking congregations by what they paid is the exact ladder this app refuses to
build everywhere else, and it would break the church-skins rule that the thing a
church can pay for is the thing that **can't beat anybody**. A sponsored church
is not a bigger church: it has no extra XP, no rank, no badge on the
leaderboard, and nothing about the slot appears on `/church/:id` or the board.

Because only one shows, **selling a second slot in the same circle is taking
money for a row that will never appear**. `admin_set_church_promotion` returns
every overlapping live promotion and the panel renders it in coral. That's the
failure mode; the warning is the fix.

## What it does not do

- **It never displaces search.** Type a name and the sponsored row disappears
  along with the whole suggested/nearby split — results are distance-ordered and
  unpaid. A sponsored church that matches what you typed appears as an ordinary
  row like any other.
- **It never lengthens the list.** The sponsored church takes one of the three
  suggestion slots rather than sitting on top of them, so the strip is the same
  size whether or not anybody bought it.
- **It records no location.** `sponsored_church` takes the same coordinates
  `search_churches` already takes and stores none of them. The picker promises
  "your location is only used to search — we never save it", and this feature
  must not be the reason that stops being true.
- **It tells the church nothing about anybody.** `church_promotion_joins` is a
  count of players who joined through the slot, readable only by the operator.
  No names, no timestamps beyond the join, nothing a church can see.

## Fail-closed, everywhere

`loadSponsored` returns `null` on: no Supabase keys, a server that predates
0075, a network blip, a slow response past the 10s deadline, and the ordinary
case of no promotion in this area. All five land on the same screen — the picker
exactly as it was before this feature existed.

## Selling it honestly

A player picks a church **once, ever**, so the impressions a slot earns in an
area equal new signups in that area. Price it as a local sponsorship, not as
advertising, and expect to sell it bundled with the things a church already
wants — a filled-in page (`admin_upsert_church_profile`) and a skin
(`docs/CHURCH-SKINS.md`) — rather than on its own.

`note_promotion_join` is what makes a renewal an honest conversation: "eleven
people joined your congregation through the slot last month" is a real number,
verified server-side (the RPC checks the caller actually plays for that church
before counting), and it is the only number the slot produces.

## How a church asks

There is one entry point, and it's the one that already existed: the
**"＋ Add info"** pill on `ChurchPageBody`, which both the leaderboard sheet
(`ChurchDetailSheet`) and the public page (`/church/:id`) render. Tapping it,
choosing **I'm on staff** and ticking *"Tell me about reaching players nearby"*
sets `wants_promotion` on the request (`0076`); the admin queue flags it with a
gold pill.

It is an **ask, not a sale**. Ticking it grants nothing, names no price and
takes no money — only `admin_set_church_promotion` starts a slot. That is what
keeps the surface byte-identical on the web and in the App Store build, exactly
like the `custom` church skin, and it's why `commerce.ts` never has to gate it.

Leadership only, enforced in SQL rather than in the form: the server nulls the
flag on the member path the same way it nulls the skin. Someone who just
attends is passing on service times, not deciding a congregation's advertising.

## Operating it

Admin → Churches → **Sponsored slot**.

1. Find the church by name or city.
2. Days and radius (max 30 mi), plus an operator-only note — who bought it and
   what they paid. The note is never shown to a player.
3. Start it. Any promotion that church already had running is ended first, so a
   church never holds two, and any overlapping live slot is reported.
4. **End** stops one early; a refund is a conversation, not a row.
