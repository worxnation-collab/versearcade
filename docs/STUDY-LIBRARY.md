# The lending library

The Study tab is a shelf you tap. Above it now stands the room that shelf came
out of: a small lit library with a librarian in it, and tapping her is a second
way to reach the same books. Taking her route the first time pays **5 XP**, once
ever, as an Easter egg.

Files: `features/study/LibraryWindow.tsx` (the room), `features/study/
LibrarianSheet.tsx` (the desk), `data/library.ts` (her name and her lines),
`store/library.ts` (the card), `supabase/migrations/0081_library_card.sql`,
`art/library.json` (both renders).

## Why it exists

Every other section of this app opens with the place it is about — the road at
the top of `/season`, the hall under "Start a new battle", the churchyard as the
hero of `/church`, your own Upper Room under the player card. Study opened with
a menu. This gives it its world, and gives the players who want the *game* a way
to do the same thing by walking into a room instead of reading a list.

The shelf did not move and did not lose a book. It got smaller — `MAX_BOOK_WIDTH`
148 → 108 and `BOOK_SCALE` 0.86 → 0.66, about 230px of scroll — so the room and
the books share a screen. Captions did **not** shrink with the boards: they span
the full grid column now, because the caption is the only part of a book that
says what is inside it.

## The four rules

**Every destination she offers is already on the shelf.** She is handed the
tab's own `ShelfItem[]` and offers the ones carrying a `lend` line. So there is
one list of things to do in Study, and the library is a *route* to it rather
than a second menu that can drift — the same choke-point habit `QuizRunner` and
`CrowdLife` keep. Adding a book to the shelf decides once whether she lends it;
your bag and your reports are yours, not stock.

**She never measures anybody.** No due dates, no "it's been a while", no count
of visits, no opinion of how much you have read. The Study tab is rank-free and
a librarian who tuts is the one version of this feature that would be worse than
no librarian. Her lines are drawn from two fixed pools and none of them is a
measurement.

**The reveal waits.** Pick a book and the sheet stays open on the stamp, with an
"Open it →" button — it does not navigate for you. A study run navigates the
instant it finishes, which is the whole reason `StudyDropToast` had to be lifted
out of the run it belongs to; here the sheet owns the moment, so it just holds
it. A +5 XP line swept off screen by a route change is a line nobody reads.

**A second checkout is a success that pays nothing.** Not a refusal. She never
turns anybody away from the desk, and the sheet must never draw an error at
somebody for coming back. A *failed* call is the same: the book is still handed
over, because the destination was reachable from the shelf without her, and
refusing it here would make the long way round the worse way round.

## The XP, and why it is safe

`xp` IS the worldwide leaderboard (0006), so this follows the argument
`record_prayer` (0073) and `wash_feet` (0068) are built on:

- **The server counts and the server pays.** The client says "she checked a book
  out to me"; `checkout_library_book` decides whether that is worth anything.
  No client ever sends an amount.
- **The cap is in SQL, not in the button.** One row per account, held by the
  PRIMARY KEY rather than by a count — an insert that loses a race simply does
  nothing. Total lifetime exposure is 5 XP, a sixth of one daily drop, so there
  is nothing to farm and no date to lie about.
- **Nothing else is recorded.** A user id and a timestamp. Not which book, not
  how many times you have been back, and there is deliberately no RPC asking
  whether somebody *else* has a card — a count of who found the Easter egg is a
  leaderboard for finding Easter eggs.

**Once ever, not once a day, and that is a decision.** An Easter egg that pays
every morning stops being an Easter egg and becomes a chore-tap you feel behind
on for missing, which is the exact feeling this app is built not to produce. The
librarian keeps working forever; only the surprise is spent. Making it daily is
a one-line change in 0081 (count rows for a date, the way `record_prayer` does)
and it would need its own argument.

## Two modes, for real

`store/library.ts` has both paths rather than inheriting the online-only break
`store/churchYard.ts` makes. Checking a book out needs nobody on the other end,
and a keyless LOCAL build — the documented way to work on this app — reaches the
Study tab and must not find a dead librarian standing there. Guests keep the
card in `va.library.<uid|guest>` with the same once-ever cap against the local
profile, which ranks nobody. The guest branch does **not** stamp the card when
there is no profile to pay into: burning a one-time Easter egg on nothing has no
way back.

An unapplied 0081 degrades rather than breaks — `my_library_card` failing leaves
"no card known" and the sheet still works.

## The art

Two Nano Banana renders (`art/library.json`), both layered over drawn SVG
fallbacks the way every tier ladder here is, so a build whose generation failed
shows a library rather than a hole:

- **`study-library`** — the room, `kind: "scene"`. Its prompt says the left and
  centre of the floor must be **completely clear and empty**, three times over,
  for the same reason the keep's halls say "bare": a figure stands there, and
  anything painted into that space gets drawn over. It carries the new
  `"format": "jpg"` flag (see below).
- **`librarian`** — Tabitha, `kind: "skin"`, so she goes through the same keyed,
  isolated, full-length pipeline Moses and Esther take. The full-body rule
  applies to her exactly as it does to a player skin.

`scripts/gen-art.mjs` learned one option here: **`"format": "jpg"` on a scene**
gets the road's JPEG encoding without moving to the road's folder. Nothing about
a full-bleed opaque painting needs an alpha channel, and the library came back
at 1,008KB as a PNG against 166KB as a JPEG — on a tab people open every day.
The halls are still PNG; that is history, not a rule.

## The bubble

She wears one small emoji bubble, and only when she is actually tappable — the
same idiom `CrowdLife`'s `CHATTER` uses, and the same rule: an emoji from a
fixed list, never a line anybody can author. A bubble on the sheet's decorative
copy would promise a conversation a backdrop cannot have.

## The verb

`borrow_book` is prepacked in `KNOWN_VERBS` / `SCORED_VERBS` / `deltaFor`, with
`book_borrowed` as its emit site. No bundled quest uses it — adding a verb is
the part of a season that costs a release, so they go in early. It scores the
LONG WAY ROUND, never the studying: a road may notice you went to the library
and may not notice how you did once you got there, which is what keeps Study's
rank-free rule intact. It pays no miles (`SOURCE_FOR` has no entry), because
walking into a room is not an achievement.
