# The arcade — a room with machines in it

> *"There is nothing better for a man than to eat and drink and enjoy his
> work."* — Ecclesiastes 2:24

## What it is

A cabinet stands in the hall, in the churchyard and in your own Upper Room, and
the "In the meantime…" card on the home screen is the same machine again.
Tapping any of them opens **`/arcade`** — a wall of machines with their names
under them — and you pick one.

Two games today:

| Game | Route | What a minute of it is |
|---|---|---|
| Manna Rush | `/arcade/manna` | Tap the fresh flakes, leave yesterday's, keep the seventh day |
| Cross Word | `/arcade/cross` | Two words sharing a letter, in the shape of a cross (`docs/CROSS-WORD.md`) |

## Why a lobby

The cabinet used to open Manna Rush directly, which was right when there was one
game. The moment there were two, a door that always led to the same machine is
lying about what's behind it — and the alternative (a second cabinet in every
scene) turns three little worlds into a shopping street.

So the machine in the room is a **door to the arcade**, and its little screen
runs an **attract cycle** through the games so it can't promise the wrong one.
Reduce-motion holds the first frame instead: the cycle is decoration, and the
lobby says what's inside in words.

## The rules

**`features/arcade/games.ts` is the list, and it's the only list.** The lobby
draws a cabinet per entry. Adding a game is a row there plus a route — two
places naming the machines would disagree the first time one was added, which is
the same choke-point habit as `QuizRunner` and the little worlds.

**Nothing in the arcade may rank anybody.** This is the whole reason an arcade
can exist in an app built on "no feature needs a person to lose". A game here
may well be one a player gets *better* at — that's fine — but its result has to
be private and uncomparable:

- **No score on any cabinet.** No high score, no last run, no "best today". A
  list of games with your numbers on it is a scoreboard with a coin slot.
- **No meaningful order.** The list is the order they were built. Not a
  ranking, not a popularity chart, not a difficulty ladder.
- **A result screen shows your own numbers against your own bar** and offers no
  way to put them beside anybody else's. Manna Rush's harvest is the shape to
  copy.

**What a run may pay:** a study-drop roll (capped, and worth only a relic to
give to your church) and season-road progress through a verb. Not XP, not
points, not standing — those rank people, and this is a place to spend a minute.

**Guest-open by default.** A game that persists nothing has nothing an account
would keep for you tomorrow, so walling it would be a padlock in front of
something that works. The exception is a game that writes to the player's own
record: the Cross Word marks its verse studied on your Bible, so it carries
`needsAccount` and the route wraps it in `RequireAccount`. The lobby shows the
padlock on that cabinet — the nav's convention, for the nav's reason: a locked
machine still stands in the room, and tapping it explains itself.

## Adding a game

1. Build the screen under `features/arcade/`. Wear `ArcadeShell` — it owns the
   way out, the title and the tagline, so two games can't drift into two
   different headers.
2. Add a row to `ARCADE_GAMES` (id, title, tagline, route, `screen`, and
   `needsAccount` only if it writes to the player's record).
3. Add the route in `App.tsx`, **static segment first** so a game can never be
   swallowed by the lobby's own path.
4. Give the cabinet a `CabinetScreen` in `ArcadeCabinet.tsx` if it needs its own
   attract art, and add it to `SCREEN_ORDER` so the in-world machines cycle it.
   Keep it a *shape*, not a picture: the screen is nine pixels tall in a
   churchyard, which is the same argument that keeps lettering off the marquee.
5. Check `trackForPath` in `data/music.ts`. `/arcade` takes the run's music;
   a game that isn't a run (the Cross Word is a crossword) says so there.

## Where the cabinet is drawn

`ArcadeCabinet.tsx`, once, used by every surface that shows it — the same rule
as `KeepScene` and `CrowdLife`. It's drawn SVG rather than a Nano Banana render
for two reasons that both come from where it stands: the Upper Room's scene is
serialised into a postcard (`lib/postcard.ts`), and an SVG loaded into an `<img>`
never fetches external resources; and it has to read at about 40px in a
churchyard. It's drawn around its ground point, like every prop in `KeepArt` and
`RoomArt`, so a caller places it by where it stands.
