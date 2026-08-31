# The Cross Word — two words in the shape of a cross

> *"Whoever does not take up his cross and follow Me is not worthy of Me."*
> — Matthew 10:38

## What it is

A crossword with exactly two words in it. One runs down (the **upright**), one
runs across (the **crossbar**), and they cross at a letter they share. The
crossbar sits in the upper third of the upright, so the grid is a Latin cross
before a single letter is typed.

Both words come out of the **same verse** — and that verse is the reward.
Finish the puzzle and the squares turn into two timbers with your letters
chiselled into them, and the verse is read underneath: *"KNOCK and OPENED both
live in this verse."*

Fifty-two crosses ship in the binary, Genesis to Revelation. It's a machine in
the arcade at `/arcade/cross` — picked off the wall in the lobby, or reached by
tapping the cabinet standing in the hall, the churchyard or your Upper Room. See
`docs/ARCADE.md` for the lobby and the rules every game there keeps.

## Why a two-word crossword rather than a crossword

A real crossword needs a dictionary, a grid generator, and a player with twenty
minutes. This one is two clues and a shape, and it can be finished on a bus.
The shape is the point: the puzzle IS a cross, and the moment it's solved is the
moment it becomes one.

It also fits the one thing this app refuses. Nothing in the arcade may rank
anybody, and this one doesn't even try: **no timer, no score, no streak, and
nothing anybody else can see.** Wrong answers cost nothing, hints cost nothing, and re-solving
one you've built before is allowed and pays exactly what it paid the first time
(nothing that ranks anybody).

## The rules the data has to keep

`src/data/crossword.ts` holds the puzzles, and every rule below is enforced
twice: by `checkCrossPuzzles()` at import in dev, and by
`scripts/check-cross.mjs` in `npm run build`. All three failure modes are
INVISIBLE on screen, which is why they're a build failure instead of a review
checklist:

| Rule | What breaks without it |
|---|---|
| `downIndex` between 1 and a third of the upright | A crossbar any lower is a plus sign, not a cross |
| `acrossIndex` within one of the crossbar's middle | Lopsided arms — reads as a mistake |
| The letters must match where they cross | The puzzle can't be solved at all |
| `reference` is in `VERSE_POOL`, and holds BOTH words | The reveal becomes a non sequitur: a verse that doesn't contain the words you just spelled |
| A clue never contains its own answer | The puzzle is free |

Adding one is: pick a pool verse, find two words in it that share a letter in
the right places, write two clues, run `npm run check:cross`.

## The daily rotation

`crossForDate()` is the same construction as `getVerseForDate()`: one fixed
shuffle of the whole set (seeded `'cross-order-v1'`), indexed by day number. So
everyone gets the same cross on the same date, and every puzzle comes round once
before any repeats. **Changing that seed reshuffles history — don't.**

"Build another" draws from `pastCrosses()` — days already gone — so playing more
can never spoil tomorrow's cross for you.

## What it pays, and where that goes

It sits in the arcade but it pays what a **study run** pays — what a thing is
doesn't change with where it stands — through the paths that already cap it:

- **A study drop roll** (`useDrops().roll()`) — capped per day, server-verified
  for accounts, and worth nothing but a relic to give to your church.
- **A step on the road** (`track('study_run')`) — the prepacked verb, no new one
  needed.
- **The verse is marked studied** (`store/bible.ts`), which lights it up on the
  player's own Bible. This is the half of a solve that belongs to the *account*,
  and it's why this is the one machine in the arcade that asks for one: the rest
  of the arcade persists nothing, so it's open to guests.

No XP, no points, no standing. Nothing on a leaderboard changes.

## Persistence: device-local, deliberately

`store/crossword.ts` keeps the solved set in `localStorage` in **both** modes —
the same deliberate break with the two-mode invariant that `store/looks.ts` and
`store/music.ts` make, and for the same kind of reason:

- It **grants nothing**. Everything a solve pays goes through the drop store and
  the season store, both of which are capped and (online) server-verified. A
  second device can't mint anything by re-solving.
- The part that's actually a record of study — **the verse** — does follow the
  account, through `bible_marks`.

So all the solved set decides is which cross "Build another" offers next.
Syncing that would mean a table, an RPC and a hand-applied migration.

If it ever should follow the account, the shape is the house one:
`cross_solves(user_id, puzzle_id, solved_on)` plus a security-definer
`record_cross_solve` taking `todayLocalDate()` and clamping it ±1, with this
store as the local mirror.

## The wood

`features/arcade/CrossArt.tsx` draws two layers over the same geometry, sized in
the same pixels and crossfaded:

- **Playing:** an HTML grid of real `<button>`s, so a square can be tapped,
  focused and read out by a screen reader.
- **Solved:** an SVG cross — two timbers, grain running along each beam, a knot,
  the crossbar's shadow thrown down the upright, and the letters *incised*: a lit
  copy under a dark one, so each stroke has a shadow above it and catches light
  below.

They share a cell size, so nothing moves a hair when the puzzle turns to wood.
That's the whole trick: the thing you filled in IS the thing that's now carved.

It's **drawn, not generated**, and that's the same call the church kit and the
keep's props make: a cross is a different shape for every pair of words (5×4
here, 9×7 there), and a baked image can't be re-cut per puzzle. The Study
shelf's *cover* for this book still follows the house rule and has a prompt in
`scripts/generate-study-covers.mjs`.

## Three things that bit while building it

- **Every edit goes through one reducer.** Typing five letters inside one tick
  put all five in the same square, because each handler planned against a hook
  snapshot instead of the previous state. Same scar as `KeepSheet`'s double-tap.
  Found by driving the real app; invisible in the diff.
- **Turning has to carry the cursor.** Every square but the shared one belongs to
  a single word, so flipping direction while leaving the cursor where it was
  pointed it outside the word being typed, and the keyboard did nothing at all.
- **The board is sized from measured space, not a fraction of the viewport.** A
  nine-letter upright pushed the on-screen keyboard off the bottom of a 390×844
  phone, and a puzzle you have to scroll to type into is a puzzle you can't play.
- **Advancing has to be dumb.** Skipping the already-filled crossing square
  looks like a kindness and puts the second word one square out of step, because
  somebody typing O-P-E-N-E-D is spelling the word, crossing letter included. It
  types perfectly until you solve the other word first, which is why it survived
  a first pass.

## What it deliberately doesn't have

- **No timer and no "solved in N guesses".** Both are scores, and both would
  make the shape of the thing into a performance.
- **No shared result to post.** There is no "Cross Word 231 4/6" — that's a
  comparison, and it's the one thing this app doesn't build.
- **No limit on hints,** and no mark against you for using them. A hint you're
  punished for is a hint nobody uses.
- **No streak.** The daily cross is an invitation, not a thing to fall behind on
  — the same argument as the Upper Room's lamp.
- **No second door.** It used to stand on the Study shelf as well. The arcade is
  its home now, and the shelf book went the way the Battle tab's "Your Keep →"
  card went when the hall started drawing itself on the tab. `/study/cross`
  redirects, so nothing already pointing at it breaks.
