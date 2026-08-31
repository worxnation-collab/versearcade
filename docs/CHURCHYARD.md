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

## A plot is a row key, not a location (0084)

Since `0084` a planting stands **wherever you drag it**. Tap a plant on your own
church tab to pick it up, then drag it anywhere on the lawn; tap a plot marker
instead and it trades places with whatever is there, as it always did; tap the ✕
on its ring and it comes out and goes straight back in the picker.

The plot survives as the ROW KEY — it still bounds rows per player, still keeps
free text out of the table, and still says where a plant stands when its value
carries no position, which is what keeps every bed planted before `0084` exactly
where it was.

The value is the same grammar the keep's hall and the Upper Room use
(`src/data/placement.ts`), in **tenths of a percent**: `yard_ivy~x412y188` is
41.2% across and 18.8% up from the bottom. Percent rather than pixels because
the yard is HTML that stretches with the phone; tenths because one whole percent
is four pixels on a 390px canvas and 0..999 carries the decimal for free.

Three things about it are load-bearing:

- **`YARD_BAND` is the lawn.** Its top is the line the building's base sits on,
  so nothing can be dragged into the sky or onto the roof, and its sides stop
  short of the frame because the art is cropped tight and centred on its point —
  a hedge is half again as wide as it is tall.
- **A plant is sized by where it stands**, not by which plot it is filed under
  (`plotHeight(at.b)`, not `plotHeight(plot.b)`). Drag a sapling to the front of
  the lawn and it grows, or the yard stops reading as a yard.
- **`draggable={false}` on the plant `<img>`.** A generated plant is a raster,
  and an `<img>` starts a native image drag — the browser cancels the pointer
  stream to do it, so the first move of a real drag arrived as
  `lostpointercapture` and the plant refused to budge. The rooms never hit this
  because their props are SVG.

Only your own church tab passes `floraEditing`; a visited yard is handed no
editing prop at all, so it is inert by construction rather than by a handler
deciding to refuse. `scripts/check-placement.mjs` runs the real packers against
the real regexes from migrations 0083 and 0084 on every build, because a
disagreement between them is invisible on screen: the client updates
optimistically and the RPC quietly raises `bad flora`.

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
