# The churchyard

The design of record for the landscaping in front of a church. Code:
`src/features/church/yard.ts` (catalog), `ChurchFlora.tsx` (art),
`store/churchYard.ts`, migration `0061_church_yard.sql`.

## What it is

Every church already has three things that can change about it, and only now
does the third one belong to a person:

| Axis | Whose | Moved by |
|---|---|---|
| Which building (`levels.ts`) | the congregation's | pooled church XP — earned, never bought |
| What it's made of (`skins.ts`) | the congregation's | published by staff; the one axis money touches |
| **What's planted out front** (`yard.ts`) | **yours** | **your lifetime giving** |

Giving already grows the building for everybody. The same points, counted as
*your* lifetime giving, open the landscaping *you* get to choose — so the reward
for giving is a thing you place rather than a number that goes up.

## The three rules

**Plantings are per-player; the yard is shared.** You choose your own six plots.
The churchyard a visitor sees on a church's page is a deterministic per-viewer
sample of everyone's plantings (`church_yard_json`) — your own planting wins its
plot, other members fill the rest. So a yard fills in as a congregation gives,
and no bed anywhere carries a name. This is exactly the keep's hall
(`keep_json`), for exactly the same reasons.

**Presence, not quantity.** Nothing is counted and nobody is compared. The yard
RPC returns which plots hold what and nothing else — never how many members
planted, never who planted a plot, never a per-member total. That is the one
place the data could leak, so it is the place the leak is made impossible. "Top
givers" stays on your own church tab, where a number is a thank-you rather than
a comparison between strangers.

**Giving is still free.** Points given cost the giver nothing — their own XP and
rank do not move — so a flower can never be *spent*. The threshold is lifetime
given across every church you have ever given to, so it only goes up, and
switching churches keeps every flower: the points were a gift, not a deposit,
which is already what `leave_church` tells the player.

**No prices, either mode.** Nothing here is or becomes a purchase, so the
surface is byte-identical on the web and in the App Store build and
`commerce.ts` never has to know it exists — the same rule the church page's "Add
info" pill follows. If landscaping ever gets a price, that decision goes in
`commerce.ts` and nowhere else.

## Plots

Six spots, three depth bands, symmetric: two beds against the front wall, two
out on the lawn, two flanking the foot of the path. Fixed, so the yard's render
cost never grows and planting is a loadout rather than a canvas.

The coordinates are measured against `ChurchScene`, not guessed: the building is
190px wide on a 390px canvas, so its footprint is x 26–74% with its base at
b≈31%, and the path flares from x 47–53% at the door to x 35–65% at the viewer.
Each side's three plots sit in three separate x-columns, and that part is
load-bearing — a lamp post at the front is a quarter of the scene tall, so a
front plot sharing a column with a back plot puts a lamp head straight through a
flower bed. It did, in the first pass, and only a screenshot showed it.

The flora layer draws between the building and the crowd: flowers are planted in
front of the wall, and people walk in front of the flowers.

## The ladder

Eight plants against lifetime given, from 250 to 120,000. The first two land
inside a week of ordinary play so a new giver sees the yard change; the dogwood
is a long season of giving. Deliberately not all flowers — a lamp post and a
hedge are what make a strip of grass read as landscaping rather than a flower
shop. Six plots and eight plants, so a full collection still has to choose.

Drawn, not generated: flat SVG in a 40x48 box around each plant's ground point,
same constraints as `ChurchArt` and `KeepArt` (no `<defs>`, no gradients, no
filters — several render at once inside a sheet, and shared `<defs>` ids across
instances are how one instance ends up painting another's colours).

**The thresholds exist twice**, like all reward math here: `FLORA` in
`features/church/yard.ts` and `church_flora_min_given` in 0061. Change one,
change the other. Unlike the keep's counters this one is *verified* rather than
clamped — the number it checks against is a sum of rows the server wrote itself,
so there is nothing to trust the client about.

## The one deliberate exception

This breaks the two-mode invariant in `CLAUDE.md`, and it inherits the break
rather than choosing it: the whole church feature is online-only because a
church is a pooled, shared thing with nothing meaningful to keep on one device,
and a guest has no church to stand a flowerpot in front of. Guests get the same
sign-in card the rest of the tab shows. `store/churchYard.ts` names the shape to
use if a local yard is ever wanted.
