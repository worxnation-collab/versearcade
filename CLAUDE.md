# Verse Arcade — working notes

Read this before changing anything. It's the stuff that isn't obvious from the
files and that has bitten previous sessions.

**Mission constraint, not a slogan:** stickiness without shame. Wrong answers
teach (every answer reveals a fact), and nothing ranks a player against a
friend. If a feature idea needs a loser, it's the wrong feature.

## Commands

```bash
npm install        # node_modules is NOT in the container image — do this first
npm run dev        # LOCAL mode with no .env.local; the full solo loop works
npm run typecheck  # tsc -b --noEmit
npm run build      # tsc -b && vite build
```

Use `npm run typecheck`, never a bare `npx tsc` — the repo pins TypeScript 5.x
and `tsconfig.json` still sets `baseUrl`, which a globally-installed tsc 6.x
rejects outright (TS5101) before it checks a single file.

`tsconfig.tsbuildinfo` is tracked and gets rewritten by every build. Don't
commit that churn — `git checkout tsconfig.tsbuildinfo` before staging.

## The one invariant: every feature works in both modes

The app runs **LOCAL** (no Supabase keys, or a guest) and **ONLINE** (signed in),
and the promise is that solo play is complete on its own. So any feature that
persists something needs both paths, or it's half-built:

- ONLINE → a table + an RPC, through `supabase.rpc(...)`.
- LOCAL/guest → `localdb` (`va.*` keys) or a per-account `localStorage` key.

Every store follows this shape: a private `isOnline()`, a `load()` that reads
whichever source is authoritative, and a writer that optimistically updates
in-memory state first so the UI is instant. Copy `store/reviews.ts` or
`store/bookAccuracy.ts` — don't invent a third pattern.

**Guest-mode writes must merge onto what's on disk, not onto in-memory state.**
A store is empty after a reload, and a run can finish before anything called
`load()` (deep link straight into a quiz). Merging onto `{}` and writing that
back silently erases everything else. This has already happened once; see the
comment in `store/bookAccuracy.ts:record`.

## Two checkouts, never the wrong one

The web app sells cosmetic packs through Stripe Payment Links. The App Store /
Play build sells the same packs through in-app purchase (Guideline 3.1.1)
instead. Wherever a shop appears, it must not show a price it can't charge or
name a pack it can't sell — hiding just the checkout button is not enough: a
`$5.99` label or a "purchases are opening soon" line is still a storefront.

**Anti-steering, stated precisely** (it's narrower than it used to be): since the
Epic v. Apple injunction, apps on the **United States storefront** may include
buttons, external links and calls to action pointing at an outside checkout, no
entitlement required. Every other storefront still forbids it. Since the
storefront is a per-device runtime fact, this app takes the one path that's
correct everywhere and sells through IAP full stop — a deliberate simplification,
not a legal requirement. A US-only Stripe path is a real option worth real money
(Apple takes 15–30%); if it's ever added, the storefront check goes in
`commerce.ts` and nowhere else.

So the same catalog is sold twice: Stripe on web (`lib/config.ts`), Apple IAP in
the app (`lib/iap.ts` + `store/iap.ts`, RevenueCat). Setup runbook and the
account-gated Apple steps: `docs/APPLE-IAP.md`.

`lib/commerce.ts` is the only place the *decision* lives — `storefrontEnabled()`,
`skinVisible()`, `cardBgVisible()`, `displayPrice()`. Every commerce surface asks
it, so the app and the site can't drift apart by accident. Don't reach for
`Capacitor.isNativePlatform()` in a component to gate something you can buy; add
it to `commerce.ts` instead.

**It fails closed, and it must stay that way.** On native the storefront turns on
only once StoreKit has actually returned products — no RevenueCat key, no
network, products not approved yet ⇒ the whole marketplace stays hidden, exactly
as it was before IAP existed. A hidden shop is compliant; a shop that can't take
money is a rejection. And prices on native are always Apple's localized string,
never the `price` fields in `data/avatar.ts` — those are the USD web prices and
are wrong in every other currency.

Apple also **requires** a visible "Restore purchases" control for non-consumable
IAP; it lives in the Skins section and shows whenever StoreKit is reachable, even
when the shop is hidden. Restoring is not selling. Purchases land through the
`iap-fulfill` Edge Function (0047), never a direct `profiles` write —
`enforce_skin_entitlement` blocks those on purpose. **The client never tells the
server what it bought.** It asks the function to settle up; the function asks
RevenueCat what that subscriber owns, using the secret key, and grants that.
Verification needs a secret, and a secret can't live in an RPC the client can
call — which is why there is deliberately no client-callable grant path.

What native still has, identical to web: earned skins (shared days, referrals),
free promo-code skins (`redeem_code` — codes are never sold), churches, battles,
and **every cosmetic the player already owns**, including packs bought on the
website. Letting someone *use* content they bought elsewhere is fine; advertising
the sale inside the app is not.

Everything else that differs between the two is deliberate and unrelated:
haptics, the OAuth redirect (`store/auth.ts`), the install prompt, and
`appStoreAsk()` (review vs. download). There is no other divergence — keep it
that way.

## Every image comes from Nano Banana

House rule, not a preference: art we add is **generated through
`scripts/gen-art.mjs`** (Gemini image models) from a prompt manifest in `art/`,
so the whole app reads as one hand rather than as five sessions' worth of
drawing styles.

```bash
GEMINI_API_KEY=... node scripts/gen-art.mjs art/keep-halls.json [--only <id>]
```

The key lives in `.env.local` (gitignored) and comes only from the environment —
never write it into a tracked file.

**Then check what came back**: `node scripts/check-art.mjs`. A model that ignores
the chroma-key instruction returns a file that looks fine and wires itself in,
and renders as an opaque rectangle behind the object — `open_bible` and `rosary`
shipped that way and drew grey boxes on the keep's table for months. The script
reads `art/*.json` to know which files are meant to be cut-outs and which are
full-bleed scenes.

Expect to reword prompts: `PROHIBITED_CONTENT` came back for "lion cub" and for
"donkey" (a *burro* generated first try), and several subjects ignored the
magenta backdrop until the instruction was moved first and put in caps. `kind` picks the pipeline: `scene` for a
full-bleed background (no keying, capped at 640px), `prop` for one object on
flat magenta (keyed, cropped, capped at 150px), `skin`/`item` for the avatar
path. `art/README.md` has the details and the wiring.

**Generated art layers OVER a drawn fallback, never instead of it.** A tier
whose PNG hasn't been generated still has to render as itself. Wiring is
automatic: the generator writes `src/data/generatedArt.ts` (id → public path)
and every surface looks itself up there, so a render reaches the player the
moment it exists and no id can point at a 404. That file is generated — don't
hand-edit it — and entries merge, so one `--only` never un-wires an earlier
batch.

Two things stay drawn, and it isn't laziness. **Anything taking a runtime
colour** — the kite shield, the destrier's barding, the gonfalon — is painted in
`denominationColor()`, which is measured for colourblind separation and isn't
knowable at generation time; a baked image can't take a colour. And **church
buildings** stay a kit, because 8 tiers x 4 skins is 32 images for something
that must also read at 44px in a board row (see `features/church/skins.ts`).

## Church pages

Every row on the church leaderboard opens `ChurchDetailSheet` — the building
drawn wide by `ChurchScene` with the congregation's own characters standing
outside it, plus whatever the church has published about itself. The sheet is
portalled to `document.body` because the board sits inside a `.card`, and
`.card` sets `backdrop-filter`, which is a containing block for `position:
fixed` — same family of bug as the `perspective` note in `BookOpening`.

Two rules here are load-bearing:

- **No client can write a church's page.** `church_profiles` (0050) has no
  insert/update policy and no player-callable RPC; publishing is
  `admin_upsert_church_profile`. The "Add info" pill submits to a review queue
  (`church_info_requests`) and publishes nothing. This is somebody else's
  congregation — an open text field on it is a moderation problem, and it is
  also the thing a church is meant to pay for later, so it follows the same
  can't-be-forged rule the IAP entitlements do.
- **No prices, no checkout, either mode.** The pill is an inquiry, so the
  surface is byte-identical on web and in the App Store build and never becomes
  a storefront that `commerce.ts` would have to gate. If a church page ever gets
  a real price, that decision goes in `commerce.ts` and nowhere else.

The page names the congregation ("Who plays here") as well as drawing it. Both
the roster and the scene are ordered by join date and carry no per-person
points: a crowd, not a ladder. "Top givers" stays your own church's thank-you
list, where it's a thank-you rather than a comparison between strangers.

The roster folds through the shared `Collapsible`, with the head count on the
header so a folded section still says how big the congregation is. The choice is
one flag for the whole feature (`va.church.roster`), not one per church — whether
you want to read names is a taste, not a fact about a congregation.

The sheet sits at `z-index: 100` — the app's sheet tier. Don't raise it: the
player card (110) is meant to open *over* a sheet, and tapping a face in the
roster opens exactly that.

### Church skins

Two axes, and only one is for sale. `levels.ts` decides *which* of the eight
buildings a church has — earned by playing, and nothing buys it. `skins.ts`
decides what it's *made of*: `classic` (default), `modern`, `glass`, `tile`. A
skinned church is not a bigger church — no number distinguishes it, which is the
point: the thing a church pays for is the thing that can't beat anybody.

Skins are drawn, not painted, and that's a size decision, not a taste one: 8
tiers × 4 skins is 32 images for something that renders at 44px in a board row.
`ChurchArt` composes each tier from a `Kit` (`Wall`/`Gable`/`Opening`/`Wheel`/
`Spire`/`Topper`) that each skin builds its own way, so a skin changes the
silhouette and not just the palette. Add a tier by composing the kit; add a skin
by branching each primitive. Still flat fills and no `<defs>` — same reason.

Staff pick one inside the "Add info" inquiry and it publishes nothing:
`submit_church_info_request` (0051) records it, and only
`admin_upsert_church_profile` can grant it. The server nulls the skin on the
`member` path rather than trusting the form. `church_json` is the one place the
published skin is read, so the board, the page, search and your own church tab
can't drift apart.

`custom` ("draw our actual building") is a commission, not a look — stored so
the queue knows to quote it, and the church keeps the default until real
artwork ships as a new skin id. **Still no prices, either mode**: the custom
option says it's answered by email, and the money happens off the device. See
`docs/CHURCH-SKINS.md`.

### The churchyard

Giving grows the building for everybody; the same points, counted as *your*
lifetime giving, open the landscaping you plant in front of it. Eight plants,
six plots, thresholds from 250 to 120,000 given — `features/church/yard.ts` and
`church_flora_min_given` (0061), which is the usual keep-them-in-sync pair.

Same three rules as the keep's hall, because it's the same shape of feature:
plantings are **per-player** while the yard is shared (`church_yard_json` blends
a per-viewer sample, your own planting winning its plot), nothing is ever
**counted** — no "3 planted", no who-planted-what, no per-member total — and
there is **nowhere to write a string**. Lifetime given is across *every* church,
so switching keeps every flower: the points were a gift, not a deposit.

Anything planted can be **moved by tapping** it and then tapping another plot,
with the keep's rules (an occupied plot trades places, so no tap loses a plant).
Only your own church tab passes `floraEditing`; a bed you can move in somebody
else's yard is exactly what the church-page rule forbids.

This one is **online-only**, inheriting the church store's break with the
two-mode invariant rather than choosing its own: a guest has no church to stand
a flowerpot in front of. `store/churchYard.ts` names the shape to use if that
ever changes. Still no prices, either mode. See `docs/CHURCHYARD.md`.

## Content is deterministic — keep it that way

`getVerseForDate(date)` must return the same verse for the same date for every
player, forever. It's a no-repeat rotation: one fixed shuffle of the whole pool
seeded `'verse-order-v1'`, indexed by day number, so every verse appears once
before any repeat. Changing that seed or the shuffle reshuffles history and
breaks the shared daily drop. Questions are seeded off the date string for the
same reason.

Add verses by appending to `VERSE_POOL` (`src/data/bible/pool.ts`) with full
metadata — the generator needs `speaker`, `audience`, `before`, `after`,
`theme`, `keyword`, `facts` to build its five MCQs.

## The player's Bible

`/bible` draws **all 66 books, 1,189 chapters and 31,102 verse slots** with no
network at all — `data/bible/structure.ts` ships the verse count of every
chapter, and only the *words* are fetched (a chapter at a time, `lib/bible.ts` →
bible-api). That's why a chapter still renders every verse when the API is down.

Each verse wears one of four states, brightest first: **saved** (kept — the
favorites store, unchanged), **studied** (quizzed in any mode), **read** (its
chapter was opened), **unread**. Orthogonal to all four: whether the verse is in
`VERSE_POOL`, shown as a ✨ you can tap to play it. Most of the Bible isn't in
the pool and the reader says so plainly — "here to read", never a disabled
button or a dimmed second class.

Three things bite here:

- **The pool cites `Psalm 23:1`; the book is `Psalms`.** 24 entries do this, and
  it's correct English, so don't "fix" the pool — favorites are keyed by
  reference and rewriting them would orphan every kept Psalm. `citationBook()` /
  `canonBook()` in `structure.ts` translate, `parseReference()` normalizes on the
  way in, and `verseReference()` emits the citation form so a verse kept from the
  Bible has the *same key* as one kept from a recap. `npm run check:structure`
  fails the build if any pool reference stops landing in a real slot.
- **The verse-count table is 1,189 hand-entered numbers.** A typo there is
  invisible (the app renders fine; the percentages are just quietly wrong
  forever), so `scripts/check-structure.mjs` checks every book's chapter count
  and verse total against independently-entered published figures plus the 31,102
  grand total. It caught a 10-verse error in Joshua on its first run. If you edit
  the table, don't derive the expected values from it.
- **Marks are cumulative and never removed.** Opening a chapter is a footprint,
  not a claim to have understood it. Nothing here is scored, ranked, or shown to
  another player — same rule as the Study tab.

**Inside the book is paper, not app chrome.** Every Bible surface renders through
`BookPage` (cream page, spine gutter, stacked page edges) using the local tokens
in `features/bible/paper.ts` — *not* the `:root` variables. Don't reach for
`var(--card)` or `var(--gold)` in there; they're tuned for the dark arcade and
they fight the page. Tier colors were measured, not eyeballed: ink clears 11:1 on
every tier, and neighbouring tiers clear ΔE 10 under deutan and protan. The one
exception is `read` vs `unread`, which is separated by shape (a left rule) rather
than by wash, on purpose — `read` is the most common state and a loud wash makes
every chapter you've opened noisy. In the chapter reader `read` isn't painted at
all: opening the chapter marked every verse in it read, so shading them all would
say nothing and turn the page into stripes.

Tapping the book on the profile doesn't navigate — `BookOpening` lifts it from
its own `getBoundingClientRect()`, swings the cover, and only changes the route
once the open page already fills the screen, so the arrival is invisible. It's
portalled to `document.body` because the cover sets `perspective`, and a
perspective is a containing block for `position: fixed`. Phases run on a short
clock rather than `onAnimationComplete`: springs that soft take over a second to
settle, which made opening the book a two-second wait.

Persistence follows the usual two-mode shape: `bible_marks` + `mark_bible_progress`
(0048) online, `va.bible.*` for guests (`store/bible.ts`). Marks are written from
the two choke points — `QuizRunner` for studied, `ChapterReader` /
`BibleChapterScreen` for read — so every mode counts without five call sites.

The old `/favorites` shelf is now `/bible/highlights` (the route redirects), and
the profile tab carries the book itself. The two testaments fold (66 books is a
lot of thumb) and a folded section still reports what's inside it, so closing one
never hides progress; the choice is remembered in `va.bible.open`.

## Supabase

Migrations live in `supabase/migrations/`, numbered, and are **applied by hand**
against project `visuppaucpzzigwtqmdd` (`verse-arcade`). Nothing applies them on
deploy, so a merged PR whose migration hasn't been run means online accounts hit
a missing table. Apply the schema *before* merging the client.

Numbering has scars: `0034` is used twice (`promo_codes`, `skin_purchases`), and
`0038_focus_practice_xp.sql` is a re-add of a file that shipped as `0036` and was
lost when PR #58 landed from a stale branch. Take the next free number and write
migrations idempotently (`create table if not exists`, `drop policy if exists`,
`create or replace function`) so a re-run is a no-op.

House pattern for writes: a `security definer` function with
`set search_path = public`, `auth.uid()` for identity, validated inputs, and
`grant execute ... to authenticated`. Note that Postgres also grants EXECUTE to
PUBLIC by default, and most of these functions are therefore `anon`-executable,
which the Supabase linter flags. Each one guards itself with `if uid is null
then raise`. Don't tighten one function in isolation; either leave the pattern
alone or fix all of them deliberately.

It is **not** universal, though — `grant_skins` and `fulfill_skin` are
`postgres`/`service_role` only, which is what lets the IAP Edge Function grant
entitlements no client can forge. Check the real ACL before assuming either way:

```sql
select proname, proacl from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and proname = '<fn>';
```

**Dates are the user's local date.** The client sends `todayLocalDate()` and the
server clamps it to ±1 day rather than trusting it (see `submit_focus_practice`,
`record_book_accuracy`). Streaks and daily caps roll over at the player's
midnight, not UTC.

## `supabase.rpc(...)` must be awaited — `void` sends nothing

A postgrest-js builder is **lazy**: the HTTP request is made inside its
`then()`. So `void supabase.rpc(...)` builds a request object, throws it away,
and never talks to the server — silently, with no error anywhere.

This shipped. Keep decorating looked like it worked (the store updates
optimistically) and `keep_placements` sat at **zero rows in production** while
the churchyard, which awaits, saved fine. It also broke the keep's Give button
downstream, because an offering requires a Grand piece to actually be in the
table.

- **Await it, and check `error`.** On failure, re-read from the server rather
  than leaving an optimistic lie on screen — `store/churchYard.ts` is the
  shape to copy.
- `void supabase....then(cb)` **is** fine — `.then()` is what sends it. That's
  the pattern in `store/auth.ts`, and it's why those four calls work.

If you want to check whether a write path is real, count rows: `select count(*)
from <table>` against the live project answers in one query what reading the
client cannot.

## Client mirrors server rules — both sides, every time

Reward math exists twice on purpose: once in SQL for online accounts, once in TS
for guests. `lib/practice.ts` ↔ `submit_practice` (0014, uncapped by 0057), `store/focus.ts` ↔
`submit_focus_practice` (0038, uncapped by 0056). Change one, change the other,
and say so in the comment — they already carry "keep in sync with the SQL" notes.

## Study drops: a reward that can't rank anybody

Finishing a study run (CPU race, focus drill, replay, "keep it" review) rolls
once for a relic — the Study tab's reason to come back. It pays **no XP, no
points and no standing**, which is what lets it exist at all next to the
rank-free rule above: the only thing a find is good for is `donate_collectible`,
giving it to your church. The incentive to study is an offering, not a score.

Three things to know before touching it:

- **The roll is opt-in, and only Study opts in.** It lives in `QuizRunner`
  behind a `studyDrop` prop (off by default) so every study mode counts from one
  call site, and so the daily drop and real battles — which are ranked — can't
  start dropping relics by accident. `ReviewScreen` is the one study surface
  that doesn't go through `QuizRunner`, so it calls `useDrops().roll()` itself.
- **The reveal is app-wide on purpose.** A study run navigates the instant it
  finishes, so a banner rendered inside the run would unmount before anyone saw
  it. The find parks in `store/drops.ts` and `StudyDropToast` (mounted once in
  `App`) shows it wherever the player lands. It's a slim bar at the *top*:
  every screen here anchors its primary action to the bottom, and a toast that
  covers the button someone is reaching for is a trap.
- **Odds and the daily cap exist twice**, like all reward math here —
  `lib/drops.ts` for guests, `roll_study_drop` (0055) for accounts. The cap
  counts finds, never attempts, so a dry run costs nothing. As everywhere, the
  client sends `todayLocalDate()` and the server clamps it to ±1 day; that
  ±1 is the house pattern and it does mean a lying client can reach three
  buckets, which is bounded and buys nothing rankable.

## The soundtrack: synthesized, area-based, unmissable

Every room has a looping instrumental, RuneScape-style: the track crossfades
when you change tabs, and the first time a room's tune plays it unlocks into
the music player in Settings. Walking in is the only way to get a track and
cannot be missed — the one collectible with no loser, which is why it can exist
next to the rank-free rule.

- **Every note is generated at runtime** (`juice/music.ts`), same bargain as
  the SFX in `juice/sound.ts`: no files to ship, cache or license. The tunes
  live as note data in `data/music.ts` — two are real public-domain hymns
  (Amazing Grace, Ode to Joy), the rest are originals named for places, because
  naming a track after a hymn it isn't would be a lie in the music player.
  `checkTrackData()` asserts melody/chords agree on loop length and that every
  track is reachable from some route; it runs at import in dev.
- **One AudioContext for the whole app.** Music renders into the context that
  `sound.ts` owns (`audioContext()`), on its own gain bus — a second context is
  a second thing for iOS to suspend, and the two drift in and out of silence
  independently. Music volume/mute are separate settings from SFX on purpose;
  neither mirrors to the profile (same as `volume`).
- **iPhones on silent hear nothing unless the app claims a playback session.**
  The hardware ring/silent switch mutes the entire Web Audio API in Safari and
  home-screen installs — this shipped, announced "Music is on", and played
  nothing on the first real phone. `applyAudioSession()` in `juice/music.ts`
  sets iOS 17's `navigator.audioSession.type` to `'playback'` (plays through
  the switch, like any game with a score) while music is enabled, and back to
  `'ambient'` when it's muted so SFX mix politely with the user's own audio.
  Pre-17 iOS still obeys the switch; there is no sanctioned way around that.
- **It must fail to silence, not to a white screen.** `ensure()` wraps graph
  construction in try/catch and latches `broken` — the director runs on every
  route change, and a browser with Web Audio stubbed or blocked took the whole
  app down in testing before that guard existed. Two more scars in there: a
  `BufferSource.stop()` before `start()` is an `InvalidStateError` (one bad
  hi-hat killed a whole scheduler tick), and `AudioContext.resume()` is async —
  playing before it settles silently drops the track.
- **Unlocks are deliberately device-local** (`va.music`), both modes — see the
  header comment in `store/music.ts` for why that breaks the usual two-mode
  invariant on purpose. If unlocks ever should follow the account, that store
  names the shape to use.
- `MusicDirector` (mounted once in `App`) is the only thing that tells the
  engine what to play; the route→track map is `trackForPath()` in
  `data/music.ts`. Screens never touch `Music` directly — same choke-point rule
  as `QuizRunner` and `useJuice`.
- The unlock banner (`NowPlaying`) fires **eight times ever** — once per new
  track, plus the very first note carrying the mute button — never on ordinary
  tab switches. It yields the top slot to `StudyDropToast` when both show.

## The keep: six halls, merging, moving, offerings

### The room grows with the faction's wins

Pooled battle wins move the hall up a six-rung ladder (`keepLevelForWins`,
`KEEP_LEVEL_NAMES`), and the ladder is **visible**: `HALL_TIERS` in `KeepArt`
changes the room's silhouette, not just its palette — timber boarding becomes
stone coursing, then pillars, then windows, then a vault, then gilding. Same
split as church levels: earned by playing, and nothing buys it.

Each tier is a Nano Banana painting over that drawn fallback
(`art/keep-halls.json`; hall 1 is the existing `hall.jpg`). **The prompts say
"bare" three times on purpose** — every hall is a room the player furnishes, so
anything the generator hangs on the wall is a decoration nobody earned.

### Duplicates merge

Putting a keep decoration out a second time doesn't stand two of it in the room
— the two **merge** into one finer piece (plain → Fine → Grand, three tiers
max), the spare anchor stays free, and a chime plays. `planPlacement`
(`data/keep.ts`) is the only thing that decides what a duplicate means, so the
guest path and the RPC path can't disagree; `store/keep.ts:place` just writes
what the planner returned, and returns whether it was a merge so the sheet can
chime and pulse the spot that actually changed.

Three things to know before touching it:

- **A tier is a look, not a count.** That's what keeps it inside the hall's
  "presence, not quantity" rule (`data/keep.ts` header): a Grand rug is not a
  bigger rug, exactly as a skinned church is not a bigger church. Nothing is
  spent and nothing is destroyed — ownership is still derived from the six
  counters, so clearing a merged prop starts it again at plain.
- **The tier rides on the placement value as a suffix** — `keep_woven_rug.2` —
  which was the whole schema change (0060 relaxes one regex). Every row and
  every `va.keep.*` blob written before merging existed still reads as tier 1,
  and `my_keep`/`keep_json` pass the string through. `packDecor`/`unpackDecor`
  are the only two places that know the format.
- **Tapping a maxed decoration on its own anchor must be a no-op.** It used to
  write a plain `decorId` there, which silently demoted a Grand piece back to
  nothing — invisible in the diff, found by driving the real app. The planner
  returns `noop` for it now.

### The picker is a shelf of pictures

Both worlds are furnished the same way, and neither has a list of names any
more: a grid of the actual objects, and **tapping one puts it where it
belongs** — the first free anchor of its mount, or the first free plot.

- **Tapping something already out MERGES it** a tier finer (`planPick` in
  `data/keep.ts`). That is the whole "duplicates just become the better thing"
  rule, with no second anchor to hunt down — the old flow made you find another
  floor spot to make a Fine rug.
- **A full mount refuses and says so.** It never overwrites, because the hall's
  rule is that nothing you placed silently disappears.
- **The ✕ on a placed tile is the only way to clear one**, now that the
  per-anchor rows are gone, so it stays on the tile rather than behind a
  long-press.

`DecorThumb` (KeepArt) draws each piece for its tile. The viewBox is chosen per
mount because props are drawn around their GROUND POINT rather than centred — a
banner hangs down from it, a wall piece straddles it, a rug sits on it, and one
box for all three crops two of them.

### Anything placed can be moved

Tap a piece to lift it, tap a spot to set it down — no drag, because the hall is
a 300-unit viewBox inside a scrolling sheet and a drag there fights the scroll.
`planMove` (`data/keep.ts`) is the choke point and the churchyard copies its
rules exactly: a piece only lands on an anchor of **its own mount** (the targets
drawn while carrying are that constraint made visible), an empty target takes
it, the **same** decoration merges, and anything else **trades places**. Nothing
is ever overwritten — "I dropped it on the wrong spot and my tapestry vanished"
is the one way this can genuinely hurt.

### A Grand piece can be given to your church

A decoration merged to the top has nowhere left to go, so it can be offered:
the Grand one leaves the hall, the church banks the points, and the player keeps
the plain decoration (the counters never moved). Once ever per decoration.

**The values are small on purpose, and this is the one place the keep touches
something that ranks.** 0059 clamps rather than verifies because a forged
counter bought wall furniture; church XP ranks congregations, so `0062` mirrors
the challenge ladder into SQL to verify ownership, and bounds the exposure three
ways: once per decoration, a fixed ladder totalling 3,100 points (under three
church levels at the bottom of the curve), and the piece must actually be placed
at Grand. A determined client can still fake counters and collect the 3,100 —
that's accepted, it's written down in the migration, and **if the ladder ever
grows past this size the counters have to become verifiable first.**

## The You tab opens with you in it

`ProfileHero` is the top of `/you`: the full-body figure at the size the skin
was actually drawn for, your pet beside it, on the card background you equipped,
under the words "This is you". Everywhere else in the app your character is a
44px circle with the face cropped in (`Character` does that on purpose — a full
figure in a small circle throws away the face), so this is the one place the
whole thing is visible.

It is a **portrait, not a card**: no stats, no level, no numbers at all. The
player card sits directly underneath and carries every number, and keeping them
apart is what makes the hero a picture of a person rather than a second
scoreboard. It uses the same `cardBgStyle` + `CardBg` pair as the card, so
equipping a background changes both and they can't drift.

### Pets

A companion, **earned and never sold** — a level plus, past the first, one more
lifetime number (`data/pets.ts` ↔ `pet_requirements_met` in 0064). Every
requirement only goes up, so a pet can't be taken back by a bad week; putting one
down is always allowed, because a companion you can't take off is a commitment.

**Two tiers, and the split is the design.** The common pets (lamb, dove) are
company and nothing else. The rarer ones each do one small thing, and *what a
pet does is tied to how hard it was to get*.

**Where an effect is allowed to reach is the load-bearing rule:**

- `xp` touches the one number here that actually ranks people, so every XP pet
  is gated on a column **the server wrote itself** (level, longest streak, total
  plays — all written by `submit_play`) and the bonus is applied *inside*
  `submit_play`, never sent by a client. 3–5% of one daily drop.
- `glow` is decoration, so it can be gated on anything, including the keep's
  counters — 0059 clamps those, and a forged counter is worth a halo, not
  standing.
- `luck` moves study-drop **odds only**, never the daily cap, and a study drop
  pays nothing rankable (its one use is giving a relic to a church).

The honest caveat, written down rather than glossed: an XP pet compounds a
little — you need level 33 to get the thing that levels you slightly faster.
It's bounded at 5% of one play a day, which is why it's tolerable. **If these
numbers ever grow, that argument stops holding** and the effect needs rethinking
rather than raising.

Pets still don't appear on *other* players' cards. That would mean widening
`get_player_card` and the leaderboard RPCs, and it's a decision rather than an
oversight — a pet visible to strangers is one step from being compared.

`lib/petProgress.ts` gathers the requirement numbers, and it's a function rather
than a hook for an import-graph reason: `data/pets.ts` can't import stores (the
reward math depends on it) and `store/auth.ts` can't import the bible and keep
stores (they already import auth). The screen that shows the picker has to
`load()` both of those stores or it quietly reports 0 for two requirements.

Art follows the house rule: drawn SVG in `components/Pet.tsx` today, with
`art/pets.json` ready to generate and `RASTER_PETS` as the slot the renders drop
into.

## The little worlds go where the section lives

Four places in this app are places, not screens — the Harvest Road, the keep's
hall, the churchyard, and you. Each one **opens its section**, at the top or
directly under its primary action, rather than sitting behind a row that
describes it:

| World | Where it renders | Component |
|---|---|---|
| Harvest Road | top of `/season` | `RoadScene` |
| The hall | under "Start a new battle", and in the sheet | `KeepScene` |
| The churchyard | hero of `/church`, and on any church's page | `ChurchScene` |
| You | top of `/you` | `ProfileHero` |

Two rules fall out of that:

- **One component per world, used by every surface that shows it.** `KeepScene`
  was extracted from the sheet the moment the Battle tab wanted it — a hall
  drawn twice would drift, and the whole point is that the room on the tab and
  the room in the sheet are the same room. Same rule as `QuizRunner` and
  `CrowdLife`.
- **Editing belongs to exactly one surface.** The scene takes an optional
  `editing`/`floraEditing` prop and is inert without it. Two editable copies of
  the same world on one screen means you can't tell which one you're touching —
  that's why the church tab's hero is the editable yard and the Landscaping
  section below it is only a picker.

And when the world is showing, the row that used to link to it goes. The Battle
tab lost its "Your Keep →" card, and the profile's player card lost its identity
block (`statsOnly`) because `ProfileHero` is already showing you at full size
directly above it. Everywhere the card stands alone — the pop-up, another
player's profile — it keeps its identity, because there it *is* the identity.

A player with no faction gets the invitation instead of the hall: a room with
nobody's colours in it is the one version of that world that says nothing. It
offers non-denominational in one tap and scrolls to the full list, and it never
appears again once a team is picked.

## Shared choke points

`QuizRunner` (`features/daily/QuizRunner.tsx`) owns quiz gameplay and scoring for
*every* mode — daily drop, practice replay, focus drill, CPU race, real battle.
The caller decides what "done" means via `onComplete`. Anything that should
count for all modes belongs here, once, rather than in five screens.

Same idea elsewhere: `CpuVersusQuiz` for anything racing a simulated opponent,
`Page`/`Button`/`Avatar` for chrome, `useJuice()` for sound + haptics + confetti
(respecting the user's reduce-motion and sound settings — always go through it).

## UI conventions

Design tokens live at the top of `src/index.css` — use the CSS variables, never
raw hexes. Numbers and headings wear `var(--font-display)`; that's the brand.
Motion is springy `framer-motion`, mobile-first, max width 520px.

The Study tab is explicitly rank-free: practice there awards small per-session XP
at most and never touches standing. The rank-free rule is the invariant, not the
size of the reward — as of 0056 focus practice has no daily ceiling and as of
0057 replay has no weekly per-verse cooldown, so studying more keeps paying, and
that's fine precisely because none of it ranks anybody. Replay still only pays
for beating your own best, and that bar only rises, so it self-limits without a
gate.
Points, streak and standing still stay out of Study. Keep it that way.

For charts, check colorblind separation rather than eyeballing it. The Study
accuracy chart uses mint/gold/coral because green↔amber fails deutan separation
against the card surface (ΔE 5.7); mint↔gold clears it at 17.5. Tiers are also
spelled out in text, so meaning never rides on color alone.

## Deploy

Netlify builds and publishes every push to `main` through its own GitHub
integration, which also posts a deploy preview on every PR. Deploying is *not*
part of CI: `.github/workflows/deploy.yml` was removed because it never had a
`NETLIFY_AUTH_TOKEN` and skipped every step of all 30 runs while reporting
green. Merges to `main` use a **merge commit** titled `<PR title> (#NN)` —
match the existing history.

## Store versions: 1.0 is live, so the version must move every release

`package.json` `"version"` is the source of truth for the *store* version, and it is
not decoration. Once App Store Connect approves a version, that version's train
closes — every later upload must carry a strictly higher `CFBundleShortVersionString`
or the upload is rejected (`90062` + `90186`) *after* a full signed archive, about
20 minutes in. Builds 22 and 23 died that way with a perfectly good Admin API key.

`ios/` is not committed; `cap add ios` regenerates it every build and the Capacitor
template default (`MARKETING_VERSION = 1.0`) comes back each time. So the version is
patched into `project.pbxproj` in `codemagic.yaml` from `package.json`, with an
assertion that it landed in both build configurations. Bump `package.json` and
`android/app/build.gradle`'s `versionName` together — same string, both stores.

The build number is separate and handled: Codemagic's `$BUILD_NUMBER` is monotonic.
Don't reach for `get-latest-app-store-build-number`; it returns 0 until a build is on
the actual App Store and has already caused a 409 duplicate here.

## Verify by running it, not by reading it

The build passing means very little here — the bugs in this codebase have been
state and persistence bugs that only appear when you actually play. Chromium is
available (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`); drive the real app,
seed `localStorage` with a profile to skip onboarding, play a full run, reload,
and check what survived. Both of the last two real bugs were caught that way and
neither was visible in the diff.
