# The weekly rivalry

Every Monday your church is matched against another church its own size. Whoever
gives more over the week wins, and a win buys a statue for the churchyard.

This is the first feature in Verse Arcade where something can lose. That is a
deliberate change and the reason it is allowed is narrow, so it is written down
first.

## Why this is allowed to exist

The house rule is *stickiness without shame*: if a feature needs a loser, it is
the wrong feature. That rule is about **people**, and it is untouched. What
changed is that a **church** — an institution, not a person — may now lose a
week.

Three constraints make that distinction real rather than rhetorical. Every one
of them is enforced in the shape of the data, not in a UI decision, because a UI
decision is one refactor away from being reversed by somebody who did not read
this file.

**Nobody's name is ever on the losing side.** A matchup contains exactly two
numbers and one church name. There is no per-member weekly board, no "top
contributor of the week", and the opponent's congregation is never named, listed
or drawn. `church_rivalry` returns two integers and a name — the data required
to build a shaming surface is never sent to the client, so nobody can build one
by accident later. `church_week_points` returns one integer for a whole
congregation and has no group-by in it.

**Losing costs nothing.** No penalty, no demotion, no rating, no ladder to fall
down. There is no losses column anywhere in the schema and no index or RPC that
could answer "which churches lose the most". The scoreboard resets to 0–0 every
Monday, so the worst week in the app's history is gone seven days later.

**The prize is a look, never a number that ranks.** A statue is a picture. It
cannot be summed, ordered or compared against the church next door — the same
argument that lets a pet ride on a player card: one id out of a fixed catalog,
with no rarity, no count and no ordering. The church leaderboard is untouched.

The one number the rivalry publishes about a church is **weeks won**, on its
public page. It is safe for the reason every ladder here is safe: it says a
congregation showed up, and it cannot say that anybody else did not. It is shown
only once a church has won something, so a page never reads "0 weeks won".

## The virality bet

Stated plainly so a later session can check whether it paid off: a church that
recruits its congregation wins its week; the win is visible in the churchyard,
where visitors and prospective members see it; and *"we beat them last week"* is
a sentence somebody says out loud at coffee hour. Nothing here works unless real
people invite real people, which is the point.

## The week is UTC — the one place that breaks the local-date rule

Every other date in this app is the player's local date, because a streak
belongs to one person and should roll over at their midnight.

A rivalry belongs to two congregations that may span several time zones, and
every member of both has to agree about whether a gift landed inside the week or
outside it. Two clocks means a point that counts for one member and not for
another, which is the one bug this feature cannot survive.

So the week is UTC, full stop: Monday 00:00 UTC to Sunday 24:00 UTC, indexed
from 2024-01-01 (a Monday). Both sides **derive** it from that epoch rather than
sending it — `weekIndex()` in `features/church/rivalry.ts`, `church_rivalry_week()`
in `0075`. The usual keep-them-in-sync pair.

## Pairing is banded by size, and that is load-bearing

`BANDS` / `church_rivalry_band()`, six buckets from "two or three gathered"
(1–2 members) to "a packed sanctuary" (76+).

The churches this feature exists for are the small ones that just signed up and
are trying to get their members playing. Against a purely random draw, a
four-person congregation meets a two-hundred-person one and loses every week
forever — which teaches exactly the lesson this app must never teach, that
showing up was pointless. Banding makes the week winnable by out-recruiting
somebody your own size, which is the behaviour the whole thing is trying to
produce.

Candidates are ordered by band distance first, then by `md5(week || church_id)`
— deterministic, unguessable in advance, and **not** first-come, so opening the
app early or late cannot steer who you play.

## No cron, ever

Nothing in this project runs on a schedule: migrations are applied by hand and
there is no edge scheduler. So pairing and settling are **lazy and idempotent**,
and opening the church tab *is* the scheduler:

- `church_rivalry_pair()` — the first member to open the tab in a new week
  creates that week's matchup, writing both sides in one statement so a matchup
  is never half-written. Guarded by `pg_advisory_xact_lock` on the week, and
  re-checked inside the lock, so twenty members opening at once produce one
  matchup.
- `church_rivalry_settle()` — the first member to open the tab after a week ends
  freezes its scores and banks any statue earned. Idempotent by primary key, so
  it is safe to run on every read, which it does.

A church with nobody free to play gets a **bye**: not a loss, no statue, and
re-tried on the next call, so a church that was alone on Monday can still get a
game on Tuesday. An **empty** church is never paired at all — it cannot give
anything, so it would be a guaranteed free win for whoever drew it.

## Scoring

A week's total is a sum over the three existing timestamped ledgers that can put
points in a church's bank: `church_contributions`, `church_offerings` (relics
given) and `keep_offerings` (Grand decorations offered). No new counter, nothing
to drift, nothing to backfill — and a relic given to the church counts exactly
like a direct gift, which it should, since both are somebody choosing their
congregation.

No client ever sends a score. The server sums rows it wrote itself — the same
rule `wash_feet` and `record_prayer` follow.

| Outcome | When | Statue |
|---|---|---|
| `won` | more points than the opponent | yes |
| `drew` | both scored, and level | **yes, both churches** |
| `lost` | fewer points | no, and nothing else happens |
| `quiet` | neither church gave anything all week | no |
| `bye` | no opponent was available | no |

A draw pays both sides: the rule is that a church has to out-give somebody to
win, and two congregations that gave exactly as much as each other both did
that. A 0–0 pays nobody, so a dormant opponent is never a free statue.

## The statues

Eight figures, and **the church picks** rather than being handed one. That is
not a convenience — it is how the feature avoids telling a congregation which
saints its tradition venerates. A Baptist church and a Catholic parish reach
into the same catalog and pull out different things:

The Good Shepherd · The Virgin Mary · Moses and the Tablets · The Guardian Angel
· David with the Sling · The Descending Dove · The Empty Tomb · The Lion and the
Lamb

The whole catalog is open from the first win. Wins are the currency, the catalog
is the menu. There is deliberately **no rarity, no per-statue unlock ladder and
no ordering** — the moment one statue is rarer than another, a yard starts
saying how well a church has done rather than what it chose, and the "a look,
never a number" rule stops holding.

Three plinths, so a fourth win is a *choice* about the yard rather than another
row of trophies — the same reasoning as the churchyard's six plots and the
keep's anchors. Wins are lifetime and only ever go up; changing a statue is
always free and never costs one.

**Any member may raise or change one, and it carries no name.** There is no
church admin in this app and inventing one for a garden ornament would be a
permissions system nobody asked for. `set_by` is stored for support forensics
only and is never returned by any RPC: a statue that carried a name would turn
the congregation's trophy into one member's, and "who put that there" is the
first step to "who didn't".

Unlike the flora, statues are **not** sampled per viewer: a statue belongs to
the congregation, so everybody who visits sees the same one standing there.

**Any member may also MOVE one, since 0084, and that is the same rule rather
than a new one.** This layer was read-only on every surface until then, on the
grounds that two members dragging the same trophy around each other's screens is
a fight over a shared object. What that argument missed is that any member could
already swap or take down any statue — so where it stands is a smaller version
of a decision the congregation already shares, and moving one exposes nothing
new: no name, no count, no who-moved-it, and `set_by` stays forensics that never
leaves the server. Only your own church tab passes `statueEditing`; a visited
yard is handed no editing prop at all, so it stays inert by construction. A
statue that replaces one already standing keeps its spot, the way a finer piece
upgrades in place in the two rooms.

Art follows the house rule: drawn SVG in `features/church/ChurchStatues.tsx`
today, with `art/church-statues.json` ready to generate and `GENERATED_ART` as
the slot the renders drop into. Two things the drawing pass taught, both in that
file's header: a lamb drawn *across the shoulders* has to go behind the head in
paint order or it becomes a hat, and a lion with two eyes and a mouth reads as a
ghost at 37px — the silhouette has to carry it.

## Online-only, inherited rather than chosen

The same break with the two-mode invariant `store/churchYard.ts` makes. The
whole church feature is online-only because a church is a pooled, shared thing,
and a rivalry additionally needs a second real congregation on the other end of
it: a local weekly matchup is a church playing itself, and a locally-granted
statue is a trophy you awarded yourself. `store/rivalry.ts` names the shape to
use if that ever changes, and says why it should not.

## Files

| Thing | Where |
|---|---|
| Design of record, week maths, bands, statues, plinths | `src/features/church/rivalry.ts` |
| Schema + every RPC | `supabase/migrations/0075_church_rivalry.sql` |
| Store | `src/store/rivalry.ts` |
| The card on the church tab | `src/features/church/RivalryCard.tsx` |
| The carvings, and the yard layer | `src/features/church/ChurchStatues.tsx` |
| Art manifest | `art/church-statues.json` |

## Known and accepted

- **A member who switches churches mid-week does not move past points.**
  Contributions are timestamped against the church they were given to, so
  switching only redirects future giving. That is correct and also the only
  behaviour that keeps a settled week un-rewritable.
- **A bye upgraded mid-week starts behind** a church that has been playing since
  Monday. Accepted: a late game is better than no game, and the alternative is
  making the church wait until the following Monday.
- **A church that never opens the tab never banks its win.** The lazy settle is
  the price of having no scheduler. The win is not lost — the row is still there
  and the next read banks it, however many weeks later.
