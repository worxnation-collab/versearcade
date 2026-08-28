# The Upper Room — a place that is yours

> *"Let us make a little chamber on the wall; and let us set for him there a bed,
> and a table, and a stool, and a candlestick."* — 2 Kings 4:10

## Why this exists

Every place in this app belongs to a group. The hall is the **faction's**. The
churchyard is the **congregation's**. The Harvest Road is the **season's**.
`ProfileHero` is a portrait — you can't set anything down in it.

So the app had a decorating system (merge, move, anchors, a planner that can't
lose a piece) attached exclusively to a room the player shares with thousands of
strangers, and no private space at all. In a collection game the private space
is the thing all the collecting points at. This is that space.

It is the fourth little world, and it follows every rule the other three do
(see "The little worlds go where the section lives" in CLAUDE.md): one component
used by every surface that shows it, editing belongs to exactly one surface, and
the world opens its section rather than sitting behind a row describing it.

## What it is

A small chamber, drawn in the app's flat-fill SVG idiom, at the top of `/you`
directly under `ProfileHero`. Twelve anchors across six mounts. Eighteen
furnishings, each earned from a lifetime number that only ever goes up.

**The room grows with your own level**, five tiers, the same earned-not-bought
split as church levels and keep halls:

| Tier | From level | Name |
|---|---|---|
| 1 | 1 | Bare Chamber |
| 2 | 5 | Plastered Room |
| 3 | 12 | Lit Chamber |
| 4 | 25 | Upper Room |
| 5 | 40 | Room on the Wall |

## The rules it inherits, and the one it adds

- **Presence, not quantity.** Nothing in the room is counted, ever. No "12
  furnishings", no completion percentage on the scene, no comparison between
  two people's rooms. The Journal counts what you've *done*; the room does not.
- **Nothing is ever lost.** Placement goes through the same planner as the keep
  (`data/placement.ts`): an empty spot takes the piece, the same piece merges a
  tier finer, anything else trades places. There is no overwrite path.
- **Ownership is derived, never granted.** Eighteen furnishings against six
  lifetime numbers the app already keeps (level, longest streak, plays, verses
  studied, chapters read, collectibles stamped). No grant table, nothing to
  revoke, and a bad week can't take a chair away.
- **Nowhere to write a string.** Anchors and furnishing ids against fixed
  catalogs, exactly like the keep. A room a stranger can visit with a text field
  in it is a moderation queue.
- **New here: a room can be visited, and a visitor can only look.** `room_json`
  returns another player's placements and their tier. It returns no numbers —
  not level, not streak, not a count of anything — because a room you can rank
  is a scoreboard with furniture on it.

## The shared planner

`planPlacement`, `planMove` and `planPick` used to be hardcoded against the
keep's `ANCHORS`. A second world needed the same three functions with a
different anchor set, and copying them is exactly the drift the QuizRunner rule
exists to prevent — so they moved to `data/placement.ts`, parameterised by a
`Surface` (`{ anchors, mountOf }`), and `data/keep.ts` keeps its existing
exports as thin wrappers. **Every keep call site is untouched**, and the merge
semantics can no longer disagree between the two rooms because there is only one
copy of them.

`packDecor` / `unpackDecor` moved with them. The wire format is unchanged
(`room_reed_mat`, `room_reed_mat.2`), so the keep's rows read exactly as before.

## Persistence — the usual two-mode shape

- ONLINE → `room_placements` + `set_room_placement` / `my_room` / `room_json`
  (migration `0069`). `set_room_placement` validates the anchor and the id
  against regexes and does not check ownership — the same doctrine as
  `set_keep_placement`: the ladder is cosmetic, so the server clamps the shape
  and does not audit the earning.
- LOCAL/guest → `va.room.<uid>`, and **writes merge onto what's on disk**, never
  onto in-memory state (the `store/bookAccuracy.ts:record` trap — a room can be
  opened before anything called `load()`).

`supabase.rpc(...)` is **awaited** and its `error` checked; on failure the store
re-reads from the server rather than leaving an optimistic lie on screen. This
is the bug that left `keep_placements` at zero rows in production.

## Art

Drawn SVG today (`features/room/RoomArt.tsx`), with `art/upper-room.json` ready
to generate the five tiers through `scripts/gen-art.mjs`. Wiring is automatic:
`RoomArt` looks up `room-<tier>` in `GENERATED_ART`, so a painting reaches
players the moment it lands and a tier without one still renders as itself.

The postcard button lives on the "Your Upper Room" heading, not inside the Furnish
shelf — sharing a room is not a step of decorating one, and a control folded behind
a collapsible is a control nobody finds. On native it goes through
`@capacitor/filesystem` + `@capacitor/share` (write to the cache directory, hand the
`file://` URI to the share sheet). That is not a nicety: the web fallback is an
`<a download>` click, which a WKWebView ignores without throwing, so the button used
to do nothing at all and report success while doing it.

Furnishings stay drawn for the reason the kite shield does: the postcard
rasteriser serialises the scene to a canvas, and an SVG loaded as an image never
fetches external resources — a room made of `<image href>` would export blank.

## What is deliberately not here

- **No visitor book, no guest list, no "3 people visited".** A count of who
  likes your room is the feature this app doesn't have (same argument as
  `my_washings` being recipient-only).
- **No trading.** Furnishings are earned and derived; a market makes them
  comparable and needs a moderation queue.
- **No numbers on the scene.** The Journal is where "what you've done" lives.
