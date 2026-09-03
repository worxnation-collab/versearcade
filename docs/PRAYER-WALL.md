# The Prayer Wall

The design of record for prayer requests. Code: `src/data/prayerWall.ts`
(categories, cap, ladder), `store/prayerWall.ts`, `features/prayer/PrayerWallScreen.tsx`
(+ `WallScene.tsx`, `Candle.tsx`), migration `0099_prayer_wall.sql`, art
`art/prayer-wall.json`. Route: `/pray`. On the map under You, and in the
compass's invitations.

## What it is

A player tucks ONE note into an old stone wall: what kind of thing it is (one
of eight categories), an optional line of their own, and whether to sign it
with their face. Anybody else who comes to the wall taps **Pray for someone**
and the wall **deals** them a note — nobody browses. They read it, read the
verse under it, and **hold the candle** until the wick catches. Letting go
early puts it out with nothing recorded. When it catches, the note rises off
the screen like incense (Psalm 141:2), the kneeler is paid 1 XP, and the
requester learns that somebody knelt at their note today.

When the requester marks the note **answered**, it becomes a star on the wall
for a week and everyone who knelt at it gets a line in their mailbox: "A prayer
you prayed was answered." That is the one payout in this feature that arrives
days later, and it is the reason to come back.

## Why the wall deals

A list of requests is a list you scroll, and a list you scroll has an order —
newest first, most prayed first, whichever — and the notes at the bottom are
never seen. `draw_prayer_request` hands out the open note with the **fewest
kneelings**, at random among equals, never your own, never one you knelt at
today, never one you passed on this sitting. The buried ones surface on their
own, and no number has to be shown to make that happen. Two people at the wall
at once are not handed the same note.

## The first player-authored text in the app, and the shape that keeps it small

The crowd scenes speak in ten fixed emoji on purpose; church pages are written
by the operator only. A prayer request is the first thing here a player types
that another player reads, so the rails are in the data, not in copy:

- **The category is what travels.** A stranger is shown one of eight tokens
  and nothing else. That is enough to pray over and nothing to moderate.
- **The line is for people who already know you.** `prayer_line_visible`
  returns it only to members of the requester's own church and to accepted
  buddies. Global reach, no global moderation surface. It is still cleaned on
  the way in (control characters out, whitespace collapsed, 120 chars).
- **Anonymous by default.** `signed` is opt-in. Health and grief are why people
  leave these.
- **One open note per person, seven days, renewable once.** Nothing
  accumulates and no archive of anybody's hard week is kept.
- **Reported is hidden.** One report takes a note off the wall by itself; the
  operator (Admin → Prayers) either puts it back or takes it down for good. The
  requester is told only that it was taken off for a look, never by whom.

## The XP is the Basin's, exactly

`xp` is the worldwide leaderboard (0006), so the Basin's doctrine (0068)
applies word for word: the server counts the rows and pays, the client never
sends an amount, **1 XP**, **twelve a day**, once per note per day by the
primary key `(request_id, user_id, prayed_on)`, never for your own note, the
client's local date clamped ±1. The twelve is counted under a row lock on the
profile so two candles finishing together can't both spend the last point.

**The requester is paid nothing.** Not a point, not a rung, not a streak. The
moment a note earns its owner anything countable, people post notes to farm
sympathy, and the wall becomes a place to perform need. What a requester gets
is a lit lantern ("somebody knelt today"), a tally only they can see, and the
answered-star.

Over the cap the kneeling is still **recorded** — the requester still sees it
and the Journal still counts it — it just isn't paid. The thirteenth prayer is
still a prayer, and the sheet says the warm version of that.

## No number on any note, ever

Every slip on the wall looks identical: no glow that says how loved a note is,
no tally, no age, no ordering by need. A wall where one note blazes and one is
dark is a ladder of who is loved, and the guarantee is in the payload shape —
`prayer_note_json` (what a stranger is handed) carries no count at all. The
only counts that exist:

- **Your own note's tally**, returned by `my_prayer_note_json` to you and
  nobody else — the `my_washings.received` rule.
- **How many notes are in the wall tonight** — a number about the room, never
  about a person, the same kind as the live lobby's "people looking".

The Journal has a **Candles held** ladder (1 → 500), because every rung there
is a number you passed. There is deliberately **no rung for being prayed
for** — receiving isn't an achievement, it's a gift.

## Online-only, inherited

The same break with the two-mode invariant that `store/washing.ts` makes, for
the same reason: a note needs a stranger to kneel at it and a candle needs a
stranger's note. A local wall would be a person praying over their own
requests, which is what the Upper Room's prayer sheet already is. The store
header names the shape to use if that ever changes, and why it shouldn't (the
XP would be client-granted).

The screen fails closed: a keyless build shows the wall and the account card;
a server without 0099 shows the wall and "isn't open on this server yet", and
the compass never invites it (`available` gates the invitation).

## The hold

`Candle.tsx`. Press and hold for 2.4s; a haptic tick every ~600ms so it can be
held without watching it; the flame climbs with the hold; release early resets
to nothing. It is the smallest possible ritual — long enough to read the verse
and mean the one line under it — and it is what makes kneeling at a stranger's
note feel like something you did rather than something you dismissed.
Reduce-motion keeps the hold (it is the gesture) and drops the flicker.

## Not in this design, on purpose

- No reply, no message back, no "thank you" button. A note is a request, not a
  thread.
- No count of prayers visible on anybody else's note or card. `get_player_card`
  is untouched.
- No list of who knelt at your note. The lantern says "today, yes" and the
  tally says how many; never who.
- No push notification. The mailbox and the compass are the channels this app
  already has.
- The Upper Room does not draw the lantern yet. The natural next step is a
  lantern by the room's door that is lit when somebody knelt at your note
  today — `RoomArt`'s `lit` pattern, gated to your own room like the lamp.
