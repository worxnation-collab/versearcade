# First light

The first person to open a day's verse holds that day's **first light**. Every
account that opens the same verse after them is worth **1 XP** to them, up to a
ceiling of 60 for the day, and their player card sits on the Play tab under the
daily drop for everybody to open.

The point is minted by the server. Nothing is taken from the people who follow
them in — a follower's XP, score, streak and standing are byte-identical to what
they would have been if nobody had opened the verse before them. There is no
subtraction anywhere in this app and there isn't going to be one here.

## Why this is allowed to exist

The house rule is *stickiness without shame*: if a feature needs a person to
lose, it is the wrong feature. A "first" mechanic is the obvious way to break
that, so the three things keeping it inside the rule are enforced in the shape
of the data rather than in copy — a UI decision is one refactor away from being
reversed by somebody who did not read this file.

**One person is named, and nobody has a position.** There is no second place, no
"you were 400th", and no ordering of the day's openers anywhere. `daily_opens`
is read as a **count** and as a **primary key** — never as a sorted list — and
`first_light()` returns one holder plus two counts about the day. The data
needed to build a "who got here first" ladder is never sent to a client, so
nobody can assemble one later by accident. Being late is invisible; the app
never tells anybody they were slow.

**It is a day, not a ladder.** The lantern resets at midnight and nothing
accumulates. There is deliberately **no lifetime "dawns held" number**, no badge,
no title and no Journal rung — the same argument `record_prayer` makes for having
no prayer streak. A rung you climb by getting up earlier is a rung people would
get up earlier to climb, and this app should not be handing out a reason to set
a 4am alarm.

**A follower is doing something warm, not losing a race.** The copy addresses
them as somebody who joined in ("you were one of the ones who followed them
in"), never as somebody who missed out, and the holder's line counts the people
who came *with* them rather than the people they beat.

## How the XP is bounded

`profiles.xp` is the worldwide leaderboard (0006), so any feature that pays into
it has to bound itself. This is the same argument `wash_feet` (0068) and
`record_prayer` (0073) are built on.

- **One XP per follower**, and only for a real account's **first** open of the
  day — held by the primary key on `daily_opens`.
- **A ceiling of 60 XP a day** (`FIRST_LIGHT_XP_CAP`, mirrored in SQL). A daily
  drop pays 30-60, so holding first light in front of ten thousand people is
  worth one extra run and not a rank. The ceiling is enforced inside the same
  statement that pays, under a row lock, so two followers landing together can't
  both read "one under the cap" and both pay.
- **Followers are still counted honestly** past the ceiling. `followers` and
  `xp_awarded` diverge on a busy day on purpose: the card can say "1,400 have
  followed you in" while the XP stops at 60.
- **Guests pay nothing.** They are counted in the day's pulse exactly as they
  always were, but `record_guest_open` takes a client-generated device id — so
  paying for guest opens would let a holder mint the whole ceiling out of
  invented uuids. The natural limit on this is the same one the Basin relies on:
  it takes real accounts.
- **Never to yourself.** The holder's own open pays nobody, by a `user_id <>
  p_user` guard in SQL rather than by the client not asking.
- The client sends `todayLocalDate()` and the server clamps it to ±1 day — the
  house pattern. A lying client can reach three day-buckets, which is bounded
  and buys no standing.

## What counts as "opening"

Opening the verse is opening the screen that shows it. The daily run screen
(`QuizScreen`) calls `open_daily_verse` when it mounts, which is the honest
choke point — it is the only place in the app where the day's verse is read.

`submit_play` records an open too. That is not redundancy: `ios/` ships a baked
`dist`, so every already-approved App Store build finishes a daily drop without
ever calling the new RPC, and recording it there is what keeps those players
counting toward the day. The primary key makes the second write a no-op for
anyone whose client does both, and only a *fresh* row ever pays.

## The timezone caveat, written down

A `drop_date` is the player's **local** date (`lib/date.ts`), so a given date
begins in Kiritimati some 26 hours before it begins in Honolulu, and the far
east reaches each new verse first.

This deliberately does **not** follow the church rivalry's break to UTC (0075).
The rivalry is two institutions that need one clock; the daily verse is one
person's own ritual, and every table around it — `plays`, `guest_opens`,
`presence_events` — is keyed on that local date. Introducing a second date
system into the daily tables is the exact mistake 0074 had to undo.

What keeps the caveat small is the ceiling: the advantage is worth one drop's XP
a day and buys no title, no badge and no rung. If it ever needs fixing, the
answer is a lantern per region, and that needs a location this app deliberately
does not store.

## Where it shows

One card, on the Play tab, directly under the daily drop — it is a fact about
that verse, and the only thing it asks anybody to do is open it.

- **Unclaimed:** a sunrise and "Nobody has opened today's verse yet".
- **Somebody else holds it:** their avatar and handle, and the whole row opens
  their **player card** — the same pop-up tapping a figure in the churchyard or
  a row on the board opens, through the one `PlayerCardProvider`. There is no
  second card component here to drift from that one.
- **You hold it:** a gold border, a `+N XP` pill and the count of players who
  have followed you in.
- **A hidden account holds it** (app review, and the same accounts
  `get_player_card` refuses): the day reads as claimed with no name on it,
  rather than naming somebody whose card would then fail to open.
- **Nothing came back** — no keys, or a server without 0081 — and the card
  renders nothing at all rather than announcing that nobody has opened a verse
  somebody is holding.

## Two modes

**Online-only, inherited rather than chosen** — the same break with the two-mode
invariant `store/washing.ts` and `store/churchYard.ts` make. "First" needs
everybody else to be first *of*: offline there is one player, so the lantern
would be claimed every single day by the only person there, and the XP would be
client-granted, which is the one thing this feature's safety argument rests on
not happening.

A guest can still **see** who holds it — `first_light` is granted to `anon` —
and that is the pitch for the account that would let them hold it themselves. A
keyless LOCAL build shows nothing: the presence strip's synthesized numbers are
ambience, but a named holder who doesn't exist would be a lie you can tap.

If it ever should work offline, `store/firstLight.ts` names the shape to use,
and the reward would have to become something that doesn't rank.

## Files

| What | Where |
|---|---|
| Ceiling, and the line under the card | `src/data/firstLight.ts` |
| Store (online-only, fails closed) | `src/store/firstLight.ts` |
| The card | `src/features/daily/FirstLight.tsx` |
| Where the open is recorded | `src/features/daily/QuizScreen.tsx` |
| Schema + RPCs | `supabase/migrations/0081_first_light.sql` |
