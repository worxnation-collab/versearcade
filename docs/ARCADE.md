# The arcade — a room with machines in it

> *"There is nothing better for a man than to eat and drink and enjoy his
> work."* — Ecclesiastes 2:24

## What it is

A cabinet stands in your own Upper Room, and the "In the meantime…" card on the
home screen is the same machine again — offered **only once the day's verse is
done**, under the countdown to the next one. Tapping either opens **`/arcade`**
— a wall of machines with their names under them — and you pick one.

**Two doors, and the count is the design.** It stood in the keep's hall and in
the churchyard too, and both were removed: those are the FACTION'S room and the
CONGREGATION'S yard, and a games machine wheeled into somebody else's shared
space reads as an advertisement standing in it. The two that remain are the two
places where the offer is honestly yours — the room that belongs to you alone,
and the moment on the home screen when today's verse is finished and the app has
nothing left to ask of you. That second one is the whole pitch for the arcade
existing at all: it answers the sentence the countdown already started.

Three machines today:

| Game | Route | What a minute of it is |
|---|---|---|
| Manna Rush | `/arcade/manna` | Tap the fresh flakes, leave yesterday's, keep the seventh day |
| Word Catch | `/arcade/word-catch` | A verse come loose from the page — tap the words back into order, then read it whole. Run 1 is today's; "Play again" deals another |
| Cross Word | `/arcade/cross` | Two words sharing a letter, in the shape of a cross. Today's is authored; after that they're cut from the pool (`docs/CROSS-WORD.md`) |

Manna Rush and Word Catch are two games on **one engine** (`TapRunner` +
`lib/tapGame.ts`), and the split between them is the useful one: Manna Rush asks
*should you take this*, Word Catch asks *what comes next*. The engine holds both
because a game may answer two questions itself — what to put on the field
(`plan`) and whether a tap was right **at tap time** (`verdictOf`). That second
one is load-bearing: the same word is the wrong answer on the way down and the
right one the moment the word before it is placed, and a table of fixed spawn
weights cannot say that. Both hooks default to the old fixed-verdict behaviour,
so a game that doesn't need them writes nothing.

`TapGameScreen` is the screen those two wear — gate, run, harvest, and an
optional `finale` under the numbers — so a fourth tap game is a definition, a
surface and three lines of copy. The Cross Word isn't a tap game and wears
`ArcadeShell` directly.

**Two machines end on scripture, and they end on the same card.** The Cross Word
reveals the verse its two words came out of; Word Catch hands back the whole
verse you have just spent a minute pulling apart. `VerseCard` + `VerseActions`
are that card and its two offers (keep it, read the chapter), shared so the two
can't drift. Word Catch passes it as `finale`, a beat after the tallies, because
"17 words, 1 of 4 lines clean" is a poor last thing to leave somebody looking at
when scripture is the point. The verse shows on a free go too — it's the payoff,
not a reward — while the two actions don't, per the demo rule above.

**Pacing is a per-game number, and it is measured in reading, not reaction.**
Word Catch's first cut was tuned like Manna Rush and played too fast on a real
phone: a word lived 2.1s, which is enough to *see* a flake but not enough to
read four words, work out which comes next, and get a thumb to it. A word now
lives 3.2s (2.5–3.4s on the drilled passes), arrives every 860ms rather than
620ms, and its line has half again as long on the clock. Fewer arrivals with
longer lives is the lever: more words on the paper is more scanning, and
scanning is not what the game teaches. Lines are also split evenly now — 17
words over four lines is 5-4-4-4, not 5-5-5-**2**, because a two-word round is
over before the title card has been read.

## Why a lobby

The cabinet used to open Manna Rush directly, which was right when there was one
game. The moment there were two, a door that always led to the same machine is
lying about what's behind it — and the alternative (a second cabinet in every
scene) turns a little world into a shopping street. The same instinct is why
there are two doors rather than four now.

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
give to your church), season-road progress through a verb, and — since `0084` —
**5 XP for the day's first run on each machine**. Not points, not standing, and
never anything that scales with how the run went.

That XP is the one thing here that touches a number which ranks people (`xp` IS
the worldwide leaderboard, 0006), so it is bounded on every side, and each rail
is worth understanding before touching it:

- **What is paid for is turning up, not doing well.** Forty flakes and four
  flakes are worth exactly the same 5 XP, and nothing on the paying path ever
  sees a score. This is what keeps the rule above intact: a run still cannot be
  behind any other run.
- **The server counts and the server pays.** `record_arcade_play` decides;
  no client ever sends an amount. The client sends `todayLocalDate()` and the
  server clamps it ±1, the house pattern.
- **The cap is a PRIMARY KEY, not a count.** `(user_id, game_id, played_on)`
  means the second run of a machine today inserts nothing and pays nothing, and
  two runs finishing together settle themselves.
- **The game id is validated against a fixed list in SQL, and that list IS the
  ceiling.** Three machines × 5 XP = 15 XP a day, against a daily drop's 30–60.
  Without the list a client could invent ids and mint 5 XP each. Adding a
  machine that should pay is therefore a migration, deliberately.
- **A free go from a shared link pays nothing**, like everything else a demo
  doesn't pay — there is no account behind an invite, and paying for one would
  make a share farmable.
- **Nothing counts runs or days.** The table stores a user, a game id and a
  date. No streak, no total, no "days in a row", and no RPC asking what anybody
  else has collected — a daily reward you can fall *behind* on is the version
  that would be wrong, and the guarantee is in what isn't stored.

The result screen says `+5 XP` once, through one shared component
(`ArcadeWelcome`) so three machines can't drift into saying different things,
and says **nothing at all** on a later run: quiet, never refused.

**Guest-open by default.** A game that persists nothing has nothing an account
would keep for you tomorrow, so walling it would be a padlock in front of
something that works. The exception is a game that writes to the player's own
record: the Cross Word marks its verse studied on your Bible, so it carries
`needsAccount` and the route wraps it in `RequireAccount`. The lobby shows the
padlock on that cabinet — the nav's convention, for the nav's reason: a locked
machine still stands in the room, and tapping it explains itself.

## Sharing a machine: one free go

Every arcade screen carries a **Share** button, and it lives in `ArcadeShell`
rather than in each game — "every game can be shared" has to mean every game
that will ever exist, and a button per screen is a rule you have to remember
instead of one the code keeps.

The link is `/arcade/<game>/invite`, and whoever opens it gets **one play on
that machine, then the invitation to make an account**. Six things about it are
deliberate:

- **The machine is the pitch, so the ask comes after.** That is the opposite
  order from the battle invite (`/battle/:id`), which asks first — it has to,
  because accepting a battle writes a score against a real account. A free go
  writes nothing, so nothing has to be established first.
- **The route is PUBLIC** — no `RequireProfile`, no wall. The person on the
  other end of a share may never have seen this app.
- **The free go pays NOTHING.** No relic, no road step, no mark on anybody's
  Bible, no solved cross recorded (`demo` on the game components). Two reasons:
  there is no account to pay into, and it means the one-play limit guards
  nothing worth farming. The wood, the verse, the harvest — the whole payoff —
  happen exactly as they do for anybody else.
- **No score is ever in a share.** The arcade's safety argument is that a result
  here can't be set beside anybody else's, and "I got 47, beat me" is precisely
  the comparison this app doesn't build. A share invites somebody to the
  machine; it doesn't challenge them. The copy is `shareLine` in `games.ts`.
- **An account skips the whole thing.** A signed-in player opening a shared link
  is redirected straight to the machine — a free go is for people who don't have
  one, and putting a full account onto a one-play page takes something away.
- **The link carries the referral code** (through `inviteUrl`, like every other
  link the app hands out) and the sharer's username as `?from=`. That name is
  somebody else's text arriving in a URL, so it is sanitised to
  `[A-Za-z0-9_]{1,20}` before it is ever rendered (`sanitizeFrom`).

`store/arcadeInvite.ts` is the bookkeeping, device-local and honest about it:
whoever this is has no account, so there is nowhere else to put it, and clearing
site data is another free go. That's fine — the only thing a determined visitor
can farm is more of the game we are trying to give them.

Two traps that are written into the code and worth repeating:

- **The "have they played" decision is frozen at mount.** Finishing the go marks
  the machine spent, and re-reading that would swap the screen out at the exact
  moment the player's result appears — snatching away the payoff that is doing
  all the persuading.
- **Anything account-shaped is hidden on a demo**, not left to fail: the Cross
  Word's "Keep this verse" would write to a shelf the visitor doesn't have, and
  "Read the chapter" is behind the account wall, so on a free go it is a link
  that bounces. Same for "Walk the week again" and "Build another cross" — one
  play is one play, and offering "again" underneath the sign-up card would make
  the card a suggestion rather than the next step.

## Adding a game

1. Build the screen under `features/arcade/`. A tap game is a `TapGameDef`, a
   `TapSurface` and a `TapGameScreen`; anything else wears `ArcadeShell`
   directly — it owns the way out, the title, the tagline and the Share button,
   so games can't drift into different headers.
2. Add the id to `ArcadeGameId`, a row to `ARCADE_GAMES` (title, tagline,
   route, `shareLine`, `screen`, and `needsAccount` only if it writes to the
   player's record), and the component to `GAME_SCREENS`. The id union is what
   makes the compiler insist the row and the screen both exist — `games.ts`
   stays pure data on purpose, because holding the components there put it in
   an import cycle with `ArcadeShell`.
   Accept a `demo?: boolean` prop: skip every payout and hide every "again".
3. Add the route in `App.tsx`, **static segment first** so a game can never be
   swallowed by the lobby's own path.
4. Give the cabinet a `CabinetScreen` in `ArcadeCabinet.tsx` if it needs its own
   attract art, and add it to `SCREEN_ORDER` so the in-world machines cycle it.
   Keep it a *shape*, not a picture: the screen is nine pixels tall in the
   Upper Room, which is the same argument that keeps lettering off the marquee.
5. Check `trackForPath` in `data/music.ts`. `/arcade` takes the run's music;
   a game that isn't a run (the Cross Word is a crossword) says so there. The
   invite paths sit under the game's own path, so they inherit its music.

## Where the cabinet is drawn

`ArcadeCabinet.tsx`, once, used by every surface that shows it — the same rule
as `KeepScene` and `CrowdLife`, and it stays one drawing even now that only two
surfaces show it: the machine on the home card has to be recognisably the one
standing in the room, or the card is a new icon rather than a door into a place
you have already been. It's drawn SVG rather than a Nano Banana render for two
reasons that both come from where it stands: the Upper Room's scene is
serialised into a postcard (`lib/postcard.ts`), and an SVG loaded into an
`<img>` never fetches external resources; and it has to read at about 40px in a
room. It's drawn around its ground point, like every prop in `KeepArt` and
`RoomArt`, so a caller places it by where it stands.
