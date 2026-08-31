# The Study tab is a library

`/study` is one room, filling the tab: a lit library with a librarian at the
desk. Everything Study can do is something in that room — Tabitha lends the five
things you can practise, the ledger on her desk is your reports, and the satchel
on the floor is your bag. **The first book you borrow each day pays 5 XP.**

Files: `features/study/LibraryScene.tsx` (the room), `features/study/
LibrarianSheet.tsx` (the desk), `data/library.ts` (the `StudyBook` list type,
her name and her lines), `store/library.ts` (the day's card),
`supabase/migrations/0081_library_card.sql`, `art/library.json` (three renders).

## Why the tiles went

It was a grid of book tiles. The argument for the room is the one every other
section of this app already made: the road is the top of `/season`, the hall
sits under "Start a new battle", the churchyard is the hero of `/church`, your
Upper Room is under the player card. Study was the last section that opened with
a *list of things* rather than the place they are in — and a wall of tiles is a
menu, which is the thing this app keeps trying not to be.

`StudyShelf.tsx` and `StudyBookArt.tsx` are gone. Their generated cover
paintings are **not**: `src/assets/study/*.webp` now render as small spines
beside the titles in Tabitha's offer, which is worth more there than the emoji
they replaced. The Bible keeps its emblem — its board carries the player's name
and is drawn, not painted, so it shouldn't borrow somebody else's cover.

## One list, two surfaces

`StudyBook[]` is built once in `StudyScreen` and handed **both** to the room
(for its hotspot badges) and to Tabitha (for what she lends). An entry carrying
`lend` is stock; one without it is yours and stands in the room as itself. That
decision is made once, in one place, so the room and her desk can never become
two menus that disagree — the same choke-point habit `QuizRunner` and
`CrowdLife` keep.

## Three hotspots, and the ceiling is deliberate

| In the room | Goes to |
|---|---|
| Tabitha, on the clear floor | her desk — the five things you can practise |
| The ledger, on the desk | `/study/reports` |
| The satchel, on the floor | `/study/bag` |

Nothing else is tappable. A room with a hotspot on every object is a menu with a
painting behind it, so anything new in Study belongs in Tabitha's offer rather
than as a fourth glowing thing on the floor.

Every marker is **always labelled**. This is a tab, not a puzzle: somebody
arriving must not have to hunt for the way to their own reports. Each carries a
generous invisible hit area, because a 26px pill is under Apple's 44px minimum
on its own. Tabitha's marker carries the **verses-due count**, since that is the
one number worth seeing before you decide to open anything, and there are no
rows left to put it on.

**Layers are painted back to front — ledger, then Tabitha, then satchel.** SVG
has no z-index, only document order, and in any other order her hem covers the
bag's own label.

## The rules that don't change

**She never measures anybody.** No due dates, no "it's been a while", no count
of visits, no opinion of how much you have read. The Study tab is rank-free and
a librarian who tuts is the one version of this feature that would be worse than
no librarian. Her lines come from two fixed pools and none of them is a
measurement.

**The reveal waits.** Pick a book and the sheet stays open on the stamp, with an
"Open it →" button — it does not navigate for you. A study run navigates the
instant it finishes, which is the whole reason `StudyDropToast` had to be lifted
out of the run it belongs to; here the sheet owns the moment, so it just holds
it. A +5 XP line swept off screen by a route change is a line nobody reads.

**Every checkout after the day's first is a success that pays nothing.** Not a
refusal, and neither is a failed call: the book is still handed over, because
Study has no other door and refusing at this one would be refusing the tab.

## The XP, and why it is safe

`xp` IS the worldwide leaderboard (0006), so this follows the argument
`record_prayer` (0073) and `wash_feet` (0068) are built on:

- **The server counts and the server pays.** The client says "she handed me a
  book"; `checkout_library_book` decides whether that is worth anything. No
  client ever sends an amount.
- **The cap is in SQL, not in the button**, and it is the PRIMARY KEY
  `(user_id, borrowed_on)` rather than a count — the second checkout of a day
  inserts nothing, and two taps racing each other settle themselves.
- **`todayLocalDate()` from the client, clamped ±1 server-side**, the house
  pattern. A lying client reaches three buckets — 15 XP — which is bounded.
- **5 a day is the smallest payout in the app**: the Basin pays 12, praying 30,
  a daily drop 30–60.

**Nothing counts the days.** No streak on the table, no rung in the Journal, no
RPC asking how many times anybody has been to the library, and `borrowedToday`
is a boolean rather than a tally on both paths. A daily reward you can fall
*behind* on is the version of this that would be wrong, and the guarantee is in
what isn't stored. (This shipped for about an hour as a once-ever Easter egg on
the reasoning that a daily reward becomes a chore-tap; the call was reversed by
the app's owner, and the no-streak rule is what keeps the reversal honest.)

## Two modes, for real

`store/library.ts` has both paths rather than inheriting the online-only break
`store/churchYard.ts` makes. Borrowing a book needs nobody on the other end, and
a keyless LOCAL build — the documented way to work on this app — *is* this tab,
so a dead librarian there would be a dead tab. Guests keep the day in
`va.library.<uid|guest>`, rolled over **on read** rather than on write, which is
what makes it reset at the player's own midnight with nothing firing at
midnight. The guest branch does not spend the day when there is no profile to
pay into.

An unapplied 0081 degrades rather than breaks — `my_library_card` failing leaves
"nothing known" and the room still works.

## The art

Three Nano Banana renders (`art/library.json`), each layered over a drawn SVG
fallback the way every tier ladder here is. That fallback matters more than
usual: this is the *entire* Study tab, so it is the difference between a
degraded tab and a broken one.

- **`study-library`** — the room, `kind: "scene"`, `"format": "jpg"`. It is a
  **5:8 portrait because the frame is one**: a 16:9 band at the top of a tab is
  a picture of a room, and this has to *be* the room. It was re-prompted twice
  to get there (16:9 → 4:5 → 5:8) and the final 398×640 fills a phone's content
  area with nothing cropped. Its prompt says the left and centre of the floor
  must be **completely clear and empty**, for the same reason the keep's halls
  say "bare": figures stand there, and anything painted in gets drawn over.
- **`librarian`** — Tabitha, `kind: "skin"`, so she goes through the same keyed,
  isolated, full-length pipeline Moses and Esther take. The full-body rule
  applies to her exactly as it does to a player skin. Her ground shadow is sized
  off *her ink* (~103 units) rather than off her layout box (144), or it reads
  as a puddle she is standing beside.
- **`study_satchel`** — the bag, `kind: "prop"`. The floor was prompted empty on
  purpose, so anything standing on it is something we put there.

`scripts/gen-art.mjs` learned one option here: **`"format": "jpg"` on a scene**
gets the road's JPEG encoding without moving to the road's folder. A full-bleed
opaque painting has no use for an alpha channel and PNG costs a lot for it.

The room is **bled past the shell's 18px gutter** (`margin: 0 -18px`), because
it is not a card on the tab, it is the tab — and on a 5:8 render every pixel
sideways is height too.

## The verb

`borrow_book` is prepacked in `KNOWN_VERBS` / `SCORED_VERBS` / `deltaFor`, with
`book_borrowed` as its emit site. No bundled quest uses it — adding a verb is
the part of a season that costs a release, so they go in early. It scores the
*visit*, never the studying: a road may notice you went to the library and may
not notice how you did once you got there, which is what keeps Study's rank-free
rule intact. It pays no miles (`SOURCE_FOR` has no entry).
