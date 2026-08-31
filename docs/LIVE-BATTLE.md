# Live battle — two people, one verse, one moment

Every other battle in this app is asynchronous: you play, they play later, a
winner is declared. That is the right shape for friends in different timezones
and the wrong shape for two people on a livestream who want to paddle right now.

A **live battle** is a room code, a ready-check and one clock. Both players read
the same verse, both tap "I've read it — I'm ready", and the questions start when
the second one taps. Scores race in a versus bar the whole way down.

- `features/arena/live.ts` — room codes, the seed, the winner rule (pure)
- `store/live.ts` — the Realtime channel and the match state
- `features/arena/LiveVersusQuiz.tsx` — `QuizRunner` + the live versus bar
- `features/arena/LiveBattle.tsx` — the door (`/battle/live`) and the room
  (`/battle/live/:code`)

## No migration, and no table

The transport is a Supabase Realtime **broadcast** channel (`live-battle:<CODE>`)
and deliberately not a table. Nothing in a live match outlives the match: live
scores are chatter, so a table would mean a row per answer plus a cleanup job,
and a dropped message costs one stale number for 400ms rather than a lost record.

What *does* outlive the match — who won — is written through the **existing**
`create_battle` / `submit_battle` RPCs, so a live match lands in battle history
and on the battle board like any other battle. No new SQL ships with this
feature.

## The seed is derived, never sent

`seedForRoom(code, round)` hashes the room code and the round number into the
seed that `battleVerse()` already turns into a verse and five questions. Both
devices compute it; nothing about the verse crosses the wire.

That is what keeps the handshake small enough to trust: there is no "the host
announces the seed" message to lose, to race, or to arrive after somebody has
already tapped ready. A rematch is `round + 1`, which is also why the round is in
the hash — the same room must not replay the same verse all stream.

## A rematch takes two, exactly like the start does

`rematch()` is an OFFER, not a command: it sets `iWantRematch`, sends the round
it is proposing, and starts the round only when the other side has asked too.
The receiver does the mirror — records `opponentWantsRematch`, and starts only
if it had already asked. Both sides land in `startRound()`, one function, so the
two devices cannot reset to different things.

It shipped the other way, and that was a bug worth writing down. The `rematch`
message reset the receiver outright, so one player tapping it swept the other
off their result screen into a round they had not agreed to — and if they were
still playing, out of the run they were in the middle of. This is the same
mistake in both places: **one device deciding for two.** The ready-check exists
precisely because a live match is two people agreeing to begin together, and the
second beginning needs the same agreement as the first.

The round number is `current + 1` computed on both sides rather than sent and
obeyed, so whichever order the two taps land in, the two devices derive the same
verse. And an offer dies with its owner: `bye` clears `opponentWantsRematch`, or
a player would sit waiting on somebody who has gone. The result screen draws all
four states — nobody asked, I asked, they asked, they left — because a button
that does nothing visible when tapped reads as broken.

## What the ready-check actually buys

`StartGate` (a prop on `QuizRunner`) holds the read phase until both players have
tapped. It lives in `QuizRunner` rather than in a wrapper for the reason every
other cross-mode concern does: the read phase and the button that ends it belong
to `QuizRunner`, and a caller that wanted to gate them would have to draw a
second copy of the verse card above the real one.

**It buys the feeling of starting together, and nothing else — by design.** Every
question is timed independently from the moment *it* starts on *your* device, so
points are a function of how fast you answered your own question, never of whose
clock started first. Ready is theatre, and the scoring is not relying on it.

Which is what makes the next decision safe.

## The runs are NOT locked in step

The feedback screen stays self-paced. The teach line is the entire point of a
wrong answer in this app — every answer reveals a fact — and a live match that
yanked the verse away the moment the faster player tapped "Next" would make the
reward for being slower "you don't get to read it".

So the two runs drift by a few seconds and the versus bar says where the other
player is: still reading, on question 3, locked, finished. Drift is legible
instead of hidden, and it costs nothing in fairness (see above).

## Recording, and why the host does it

The host is the challenger and creates the row with the guest named as the
invited player; the guest then submits against it. That ordering is forced by the
schema — `create_battle` takes the challenger's score, so the row cannot exist
before somebody has played — which is why the host waits for both results.

The guest **polls** for the row rather than being told about it: a "recorded"
broadcast would be one more message to lose at the exact moment both phones are
navigating to a result screen.

All of it is best-effort. The result on screen is computed locally by
`liveWinner()` and is already correct; recording is what makes the match count on
the board, and a failure there must not eat the result the two players just
watched happen. **`liveWinner()` mirrors `submit_battle`'s tiebreak** (score, then
lower total time, then a tie) for the same reason `lib/practice.ts` mirrors
`submit_practice` — change one, change the other, or a stream shows one winner on
screen and the other one in battle history.

## A drop is noticed, and it is not a dead end

Presence tells each client who else is in the room. A closed tab sends no
goodbye, and a phone that quietly vanishes with no explanation on screen is the
worst version of this feature failing — so the bar says *"They dropped — finish
your run, it still counts"* and the run plays out.

Read the whole roster on `sync`; do not react to `join`/`leave` events. A leave
payload carries the tracked fields and a `presence_ref` but no channel key, and a
client re-tracking emits leave/join in an order you do not control. The first
version of this handler said "They dropped" from the opening question of a match
in which nobody had gone anywhere.

## Online-only, inherited rather than chosen

Same break with the two-mode invariant that `store/washing.ts` and
`store/churchYard.ts` make, and for the same kind of reason: the whole gesture is
a second real person answering the same question at the same second. A LOCAL path
would be a person racing themselves, which is what `/battle/cpu` already is and
does better. There is no half-built guest path here to finish — there is nothing
for one to do.

## A room code, and now a queue in front of it

Matchmaking with strangers is a queue table, a pairing function, timeouts and
abandonment handling. Two people who already know they are about to play each
other need none of it, and a code can be read out loud on a stream, which is the
use this was built for. If open matchmaking is ever wanted it goes in *front* of
this screen and everything here still works unchanged.

That is exactly what happened, and the prediction held: **Quick match** ends by
handing two devices the same room code, so from that second on it *is* a
room-code match and not a line of `store/live.ts` changed. The paragraph above is
still the reason the room exists — it was an argument about two people who
already know each other, which is the case a code covers and the case "find me
anyone" does not.

### The queue has no table either

`store/liveQueue.ts`. Everybody looking stands in one Realtime presence roster
(`live-battle:queue`); the pairing is *derived from that roster on every device*
rather than assigned by a server, and a three-message handshake settles who
actually got whom. Nothing outlives the search — a closed tab is a vanished
presence, which is the whole of the abandonment handling. Still no migration.

**The pairing rule is the smallest one that cannot disagree with itself:** the
person who has been waiting longest proposes, everybody else waits. One pair
forms at a time and both leave the roster, so the queue drains in join order and
arriving late can't jump anybody. Sorted rather than hashed — unlike the church
rivalry's draw, there *is* an order here worth honouring.

Everything that rule can still get wrong is caught rather than prevented, because
two devices half a second apart genuinely do see different rosters:

- **offer → accept → confirm, three messages, not two.** The accepter is not in
  the room until it hears back. With two, an offer crossing another offer leaves
  one player alone in a room the other never entered — the same "one device
  deciding for two" shape as the rematch bug above.
- **The lower ticket wins a collision.** If both sides believe they are the head,
  they compare the two ticket strings and reach the same answer with no round
  trip to agree on it.
- **A dead head can't stall the queue.** An unanswered offer expires after 4s and
  that ticket is skipped for 10s; anybody may propose once they have waited 8s,
  so a client that never offers (a frozen tab, an older build) is routed around
  rather than waited on.
- **Never two presences wearing the same username.** That is your own second tab,
  and `create_battle` refuses a battle with yourself anyway.

### The empty lobby is the state that matters

It will be empty most of the time — that is simply true of a small app, and a
spinner that never resolves is the version of this feature that teaches people
not to tap it. So the search keeps running (somebody may walk in at any second)
and after 20 quiet seconds the screen says so plainly and puts the two doors that
always work right there: a room code, and the async battle that needs nobody to
be holding their phone at all. Not a dead end — the same rule the account wall
follows.

### It adds no comparison

Worth stating, because "matchmaking" is the word that usually brings ranking with
it. There is no rating, no bracket, no queue position and no skill matching:
whoever is looking, in join order. The lobby draws a COUNT of other people
looking — a number about the room, never about a person — and the match itself is
the battle that already existed. Ranking strangers by ability is the ladder this
app refuses everywhere else, and it would need a rating on every account, which
is a number that ranks people (0006) and would then want a table to keep it in.

### Which side hosts

The pair's proposer becomes the host, and the room is told which side it is by
the navigation that opens it. A navigation that STATES a role now wins over the
remembered `va.live.host.<code>` flag, both ways round — that flag is a refresh
fallback, and two tabs of one browser share `sessionStorage`, which made both
halves of a quick match arrive as 'host'. `store/live.ts` drops every message
from a player wearing your own role, so the two of them sat in the same room each
being told nobody had joined. Found by driving it, invisible in the diff.

## What it pays, and the two skins

Live battles paid nothing at all until `0086`, which is defensible for a room
code between friends and not for a queue full of strangers. Now a battle pays
**10 XP, three a day** — and the grant sits inside `create_battle` and
`submit_battle` rather than anywhere in this feature, because those two are what
a live match already goes through to be recorded. Nothing in `store/live.ts`
decides a reward; it passes `p_live: true` and re-reads the profile.

**The winner and the loser are paid the same 10 XP.** `award_battle_xp` never
reads a score. That is not a nicety — `xp` is the worldwide leaderboard (0006),
so paying the winner more would make that board a battle ladder and make losing
cost something, which is the one thing this app's whole design refuses. The
result screen puts the line under "that part doesn't have a loser" on purpose:
both players see the identical sentence.

**Jonathan (3 live battles) and Deborah (15)** are earned looks that only the
live door gives — a room code and a quick match both count, because after the
handshake they are the same thing. The counter is `profiles.live_battles`,
server-written and only ever going up, and it counts battles PLAYED: lose all
fifteen and Deborah is yours anyway. `live` is stamped once by the host on the
battle row, so the guest never declares it and no client can relabel an async
battle into the counter.

## Verified by driving it

Two browser contexts, a real Supabase project, a full match: same verse on both
without a seed on the wire, the gate holding until the second tap, the opponent's
live score arriving exactly, the widest possible drift, both result screens
agreeing on the winner, a rematch landing both players back on a new verse, and a
closed tab surfacing as a drop.

Two bugs were found that way and neither was visible in the diff: the round
filter in `onWire` was eating the `rematch` message (the player who tapped it went
back to the ready check alone), and the presence handler was reporting a drop
before anyone had dropped.

**Still untested: the recording path**, which needs two real accounts and could
not be exercised with guest profiles. Do one rehearsal match on two signed-in
accounts before going live, and check the battle shows up in both players'
history.

### Quick match, verified the same way

Two isolated browsing contexts running the real store and the real screens: two
taps from "find me anyone" to the ready-check, both on one room code with one
host and one guest, the same verse on both, a full five-question run and both
result screens agreeing on the winner. Then the cases that only a second player
makes visible — three people tapping at the same instant produce exactly one pair
and leave the third looking; two tabs of one account never pair; a client that
sits in the roster and answers nothing is skipped rather than waited on; the
quiet panel appears at 20s and stopping the search returns the door.

**The transport under that test was a stand-in, not Supabase Realtime** — this
sandbox's proxy refuses WebSocket upgrades, so the live service was unreachable
from it. The protocol, the screens and the room are the real ones; what has not
been exercised against the live project is the presence roster itself. Do the
quick-match rehearsal on two real devices at the same time as the recording one
above.
