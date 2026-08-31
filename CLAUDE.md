# Verse Arcade — working notes

Read this before changing anything. It's the stuff that isn't obvious from the
files and that has bitten previous sessions.

**Mission constraint, not a slogan:** stickiness without shame. Wrong answers
teach (every answer reveals a fact), and nothing ranks a *player* against a
friend. If a feature idea needs a person to lose, it's the wrong feature.

**One narrow exception, added deliberately: a CHURCH may lose a week.** The
weekly rivalry (`docs/CHURCH-RIVALRY.md`) matches your congregation against
another one its own size, and the one that gives more wins a statue for its
yard. The distinction that keeps the rule intact is that a church is an
institution, not a person — and it is enforced in the *shape of the data*, not
in copy: a matchup carries two totals and one church name, there is no losses
column anywhere in the schema, and no RPC will tell you a per-member weekly
number. Read that doc before extending anything competitive. **The exception
stops at churches**: the Study tab, the Journal, the Basin, the crowd scenes and
every player-facing surface are unchanged, and widening it needs its own
argument rather than following from this one.

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

**This invariant is about the code, not about who we let in.** A guest no longer
*reaches* most of these features (see the next section) — but every store still
has both paths, and must. The gate is a route wrapper that can be deleted in one
edit; a store that only works online can't be un-broken that cheaply.

## What a guest gets: today's verse, and their own profile

The front door sells the account, and everything past those two things asks for
one. This is a product decision layered on top of the invariant above, not a
replacement for it — so if a future session finds a "half-built" guest path
behind a wall, the answer is that it's deliberate, and both halves stay.

- **Open to a guest:** `/` (Landing), `/welcome`, `/auth`, `/play` and its run +
  result, `/you`, and the two genuinely public pages (`/churches`, and a battle
  invite at `/battle/:id`, which handles its own gate + signup resume).
- **Behind the wall:** everything else — Battle, the keep, Study, the Bible, the
  church, the Harvest Road, ranks, cards, buddies, reviews and past-day replays.

`WALL` + `RequireAccount` in `App.tsx` is the whole list and the only gate;
`components/AccountWall.tsx` draws it. Screens that already had their own guest
branch (`BattleHub`, `ChurchScreen`, `LeaderboardScreen`, `InventorySection`)
keep it untouched, so lifting a wall restores the old behaviour by deleting one
wrapper rather than by rewriting a screen.

Two things about it that are load-bearing:

- **It only bites when an account is obtainable.** The condition is
  `isSupabaseConfigured && mode === 'local'` (`useAccountLocked()`), so a keyless
  LOCAL build — `npm run dev` with no `.env.local`, the documented way to work on
  this app — is never walled. Gating on `mode === 'local'` alone would hand a
  developer five padlocked tabs and no backend to sign up to. Landing flips for
  the same reason: with no keys it leads with guest play again.
- **The locked tabs stay visible, and tapping one is not a dead end.** A padlock
  in the nav, a wall that says what's inside and offers the account — that's the
  pitch. Hiding the tabs would make the app look smaller than it is, and this is
  still the app with no losers in it: the wall never scolds anyone for playing as
  a guest, and it says plainly that the streak and character come with them.

Every "create an account" call to action goes to `/auth?mode=signup`, which opens
the sign-up form rather than "Welcome back" with a password field.

## Content is data: seasons ship without a submission

The App Store build runs a copy of `dist` baked into the IPA (`webDir`, no
`server.url`), so anything compiled into the bundle is frozen until the next
review. That's right for mechanics and wrong for content — a Christmas road is a
reward table, five hex codes and an emoji.

So the bundled catalog is the **floor** and a fetched overlay merges over it by
id: `data/catalog.ts` (shapes + sanitisers + the overlay), `store/catalog.ts`
(fetch + cache), `content_catalog` / `admin_publish_catalog` (0066). Every
existing accessor — `confettiById`, `flameById`, `activeRoad`, `rewardLabel`,
`skinById`, `skinArtUrl` — reads the **merged** view, so no call site knows or
cares where its content came from. Full runbook: `docs/CONTENT-CATALOG.md`.

Three rules, and they're the whole design:

- **Merge, never replace.** An overlay entry overrides one id, a new id is
  appended, a bundled entry is *never* removed — so an old binary still renders
  everything it shipped with and an equipped cosmetic can't vanish. Bundled
  entries keep their positions so the equip grids don't reshuffle mid-tap.
- **Fail closed, per entry.** Every sanitiser drops what it can't read and keeps
  going. There is no state where the season screen renders empty because a fetch
  failed — no keys, no network, a 500 and bad JSON all land on the bundled
  catalog, which is a complete app.
- **Code is not content.** `art` URLs land in `<image href>`, so only `https:`
  or a root-relative path is accepted (`javascript:`, `data:`, `http:` and
  `//host` are rejected). And a catalog can never invent a **price**:
  `CatalogSkin` has no sku/pack/price and its `source` union excludes `'paid'`,
  because that decision lives in `commerce.ts` and nowhere else.

**Verbs are the prepack, and they're why this works.** A quest names a verb;
only `deltaFor` (`store/season.ts`) can score one. A catalog quest naming a verb
this build lacks is DROPPED (`KNOWN_VERBS` + `sanitizeQuestDefs`) rather than
shown as a bar nobody can fill. Thirteen verbs currently have live emit sites and
no bundled quest using them, on purpose — adding a verb is the one part of a
season that still costs a release, so add them generously and early.
`checkQuestVerbs()` asserts the two lists agree at import in dev, because
drifting apart is otherwise invisible.

**A road brings its own painting.** `RoadDef.scene` is an art id resolved by
`roadBackground()` (`features/season/roadArt.ts`) through the same
overlay → `GENERATED_ART` chain skins use, so a December road isn't drawn over a
wheat field. Generate them with `kind: 'road'` (`art/road-scenes.json` →
`public/road/`), keeping the bottom third walkable — `CrowdLife` stands figures
on it.

**Items are still code, and that's a known gap.** `item_*` are drawn as
hardcoded SVG per id in `Character.tsx`, so a catalog can't add one. Roads can
hand out skins, cosmetics, boosts, freezes and mementos — not items.

**A road's quest pools freeze when it starts.** `pick()` shuffles the whole pool
from a day seed, so adding one entry re-draws every remaining day and two app
versions show different dailies on the same date. The bundled `DAILY_QUESTS`
belongs to the Harvest Road now; a new road carries its own `daily`/`weekly`.
Overlapping road windows resolve to the road that **starts latest**, so a short
holiday road inside a long one wins.

And the free trick that needs no infrastructure at all: `activeRoad()` is a pure
function of the clock against hard ISO windows, so a road can be **pre-shipped**
in today's binary months early and switch itself on at its `start`. Do both —
the bundled road is what an offline phone falls back to.

## Two checkouts, never the wrong one

**Cosmetics are no longer sold.** Moses, Esther and Elijah are `free`, the
angels (Gabriel, Michael, Seraph) are `pass` — road rewards — and `BUNDLES` is
empty. What still has a price is the founding-patron whale, and the promo-code
exclusives (`eden`, `shades`, `sonshine`) are still free redemptions. Everything
below still holds for that one product, and for the machinery, which is kept
rather than deleted so selling something again is a row rather than a rebuild.

Two things about the de-monetisation that are load-bearing:

- **Nobody loses what they bought.** `skinOwned`'s `pass` branch falls back to
  `owned_skins`, so an Angel Pack buyer still owns Gabriel with no season
  unlock. And `SKU_BY_PRODUCT_ID` in the `iap-fulfill` Edge Function keeps all
  five product ids while `APPLE_PRODUCT_IDS` in `lib/iap.ts` drops four — they
  look like duplicates and are not. The client list is what the app OFFERS; the
  function's is what an existing purchase is WORTH. Trim the second and a buyer
  who reinstalls and taps Restore gets nothing back. **Add rows there, never
  remove them.**
- **`enforce_skin_entitlement` was deliberately not touched.** The de-monetised
  ids stay in its protected list: nothing reads `owned_skins` for them now, so
  guarding them is free, and that list is restated *wholesale* by every
  migration that edits it — a needless rewrite is the one way to unlock a paid
  skin for everybody by accident.

The web app sells through Stripe Payment Links. The App Store /
Play build sells through in-app purchase (Guideline 3.1.1)
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

**A skin render must be a FULL-LENGTH FIGURE, head to feet.** One PNG serves two
frames: avatar chips crop to a portrait (`xMidYMin slice`), but the little
worlds — the road, the churchyard crowd, `ProfileHero` — render the *same file*
with `fullBody`. So a bust looks perfect in every avatar circle in the app and
becomes a floating torso the moment the character stands somewhere. The skin
manifests say head-to-feet three times for this reason, and `check-art.mjs`
flags any skin squarer than 1.05:1 as `(BUST?)` — all fifteen shipped skins are
1.08 or taller. Seasonal skin art goes to Supabase Storage and into the
catalog's `art` map instead of `public/`, which is what lets it ship without a
binary; `skinArtUrl()` resolves catalog → `GENERATED_ART` → `RASTER_SKINS` →
drawn.

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
path. A scene may add **`"format": "jpg"`** to get the road's JPEG encoding
without moving to the road's folder — nothing full-bleed and opaque needs an
alpha channel, and the Study library came back at 1,008KB as a PNG against
166KB as a JPEG. The keep's halls are still PNG; that's history, not a rule. `art/README.md` has the details and the wiring.

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

### The board reads three windows

Every row on `/church`'s board is a church and a number, and until `0080` that
number could only be lifetime points. That is a ladder a congregation can climb
but not JOIN: a church playing hard for a fortnight still sits under one that
banked 18,000 points two years ago and has been quiet since. Today / This week /
All time makes the week winnable by showing up, which is what the whole church
feature is trying to produce.

Four things about it are load-bearing:

- **"This week" IS the rivalry's week.** `church_window_start('week', …)` is
  derived from `church_rivalry_week_start()`, so the board's weekly number and
  the rivalry card's weekly number are the same number for the same church and
  roll over together. Two weekly totals disagreeing by a few hours would be
  indistinguishable from a bug.
- **So both windows are UTC**, inheriting the rivalry's deliberate break with
  "dates are the user's local date" rather than making a new one. A per-viewer
  local day means two members of the *same* church see different totals for it.
  A person's streak still rolls over at their own midnight — this is an
  institution.
- **It adds no visibility.** A windowed row is a church total, exactly like the
  lifetime one already there. `church_points_since` returns `(church_id, points)`
  and never groups by user; "top giver this week" is the feature this app must
  not have, and the guarantee is that the query is never built. Same rule the
  rivalry's payload shape enforces.
- **`xp` stays lifetime and the row's window number is `points`.** The LEVEL is
  drawn from `xp`, so a church does not shrink to a wooden chapel because it was
  quiet on Tuesday. `points` is undefined on every other RPC that returns a
  church, and the row falls back to `xp` — which is also what an app installed
  before 0080 gets, because **the old two-argument `church_leaderboard` is kept
  as a wrapper.** `ios/` ships a baked `dist`, so dropping that signature the
  way 0074 dropped `admin_overview()` would blank the board in every approved
  build. It is a wrapper, not a second implementation, and must stay one.

The board keeps listing churches that gave nothing inside the window, sitting on
0, rather than dropping them: a congregation vanishing from its own neighbourhood
board at midnight reads as broken. What it does not do is put a **medal** on a
row that gave nothing — with every church on 0 the ranking is only a lifetime
tiebreak, and a gold medal there claims somebody won a day nobody has played.

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

### A church can claim its own page

`church_profiles` had exactly one writer for good reason — an open text field on
somebody else's congregation is a moderation problem — and that meant every
corrected service time went through the operator. `church_admins` (`0079`) is
the seam: a row saying *this player is verified leadership of this church*,
granted only by `admin_grant_church_admin`. Full rules: `docs/CHURCH-CLAIM.md`.

**Verification is MANUAL and stays manual.** There is no self-serve claim — no
domain check, no mailed code, nothing a stranger can drive. An operator reads
the request in the "Add info" queue, satisfies themselves by phone or by an
email from the church's own domain, and grants it by username. So the grant IS
the moderation, and it's revocable in one call. It doesn't scale to thousands,
on purpose; at this volume a human reading a request beats any heuristic, and
the honest upgrade later is domain-verified email, not loosening this.

What a claim buys is narrow, and each exclusion is load-bearing:

- **The five text fields**, published straight through — that's the point.
- **Not the skin.** It's the paid axis, so `update_my_church_profile` doesn't
  take one and an edit can't drop the look an operator granted.
- **Not `published`**, which would let a church hide itself into a state only an
  operator could undo.
- **Nothing about a member**, and this is the rule someone will try to break.

**No per-member data for leadership.** The roster carries no per-person numbers
("a crowd, not a ladder"), and a pastor-facing view of who played and who lapsed
is that shape *with authority attached* — the person who played less becomes
visible to their minister as having played less, which is worse than the
player-vs-player comparison this app already refuses. A leader already sees the
two aggregates that are public anyway: congregation size and banked XP. Anything
more must be an aggregate with a small-count floor and needs its own argument.

**The website is validated server-side now**, because this is the first writer
of those columns that isn't us: https, http, or a bare host that gets prefixed;
any other scheme is refused rather than mangled. `Detail` already neutralised a
`javascript:` string on one render path, but `public_church_page` is a second
reader and shouldn't have to know that.

### The sponsored slot

A player with no church sees "Suggested for you" at the top of `/church` — the
picker has always fetched the churches around you before you type, it just led
with a search box. One church in that strip can be paid for (`0077`,
`sponsored_church`, Admin → Churches). Full rules: `docs/CHURCH-PROMOTION.md`.

It's the only thing here a third party can pay to put in front of a player, and
three rails make that safe:

- **The money never touches the device.** No client-callable way to create or
  buy one exists; `admin_set_church_promotion` is the only writer and the money
  happens off-device, like the custom church skin. A slot sold *inside* the app
  is a storefront `commerce.ts` would have to gate, and a user-bought "boost" in
  the App Store build is an IAP by Apple's reckoning. **No price, either mode.**
- **It cannot lie about distance.** A promotion has no position of its own — it
  carries a radius and the centre is the church's own lat/lng, capped at 30
  miles, which is the picker's own search radius. A congregation can't advertise
  into a town it isn't in, by construction.
- **It's a billboard, not an auction.** Earliest start wins; flat rate, one
  slot. Ranking congregations by what they paid is the ladder this app refuses
  everywhere else — a sponsored church is not a bigger church, exactly as a
  skinned one isn't. Because only one ever shows, selling a second slot in the
  same circle is taking money for a row that won't appear, so
  `admin_set_church_promotion` returns the overlapping live promotions and the
  panel renders them in coral.

Two more things that are load-bearing. The row is **labelled Sponsored above the
name**, and it takes one of the three suggestion slots rather than sitting on
top of them — a paid row lengthens nobody's list. And **typing removes it**:
search is distance-ordered and unpaid, so the sponsor can only ever raise a
church on the list you didn't ask for, never on the one you did.

**A church asks through the pill that already existed.** The leadership path of
"Add info" carries a `wants_promotion` box (`0078`) that the admin queue flags —
an ask, not a sale: it grants nothing and names no price, so the surface stays
identical in both builds like the `custom` skin. The server drops the flag on
the member path the way it drops the skin. (0076 also fixes a 0051 bug the same
comment predicted: the queue returned the skin a church asked for and the admin
screen never rendered it.)

It records no location (`sponsored_church` takes the coordinates
`search_churches` already takes and stores none of them — the picker promises
"we never save it"), and `note_promotion_join` counts joins the server verified,
which is the one number the slot produces and the only thing to renew on.

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

**Your own congregation stands in your own yard**, not only on the church's page
(`loadCongregation` in `store/church.ts`, the same `get_church_page` roster the
page uses). It used to draw you alone there, on the reasoning that the people
belong on the page — which read as a broken screen on a real phone, and fairly:
the caption said "3 players" and the grass had one. The hall shows you alone
because a faction is thousands of strangers and any crowd it drew would be an
arbitrary sample; a congregation is a handful of named people, so there is
nothing to sample. The rule is untouched — join-date order, no per-person number
— and `is_me` on your own row is what keeps you from being drawn twice.

Anything planted can be **moved by tapping** it and then tapping another plot,
with the keep's rules (an occupied plot trades places, so no tap loses a plant).
Only your own church tab passes `floraEditing`; a bed you can move in somebody
else's yard is exactly what the church-page rule forbids.

This one is **online-only**, inheriting the church store's break with the
two-mode invariant rather than choosing its own: a guest has no church to stand
a flowerpot in front of. `store/churchYard.ts` names the shape to use if that
ever changes. Still no prices, either mode. See `docs/CHURCHYARD.md`.

### The weekly rivalry, and the statues it buys

The one place in this app where something can lose. Every Monday (**UTC** — see
below) your church is matched against another church its own size; whoever gives
more over the week wins a statue for the churchyard. Full design and the whole
safety argument: `docs/CHURCH-RIVALRY.md`. Five things to know before touching
it:

- **The week is UTC, and it is the one deliberate break with "dates are the
  user's local date".** A streak belongs to one person and should roll over at
  their midnight; a rivalry belongs to two congregations that may span time
  zones, and every member of both has to agree whether a gift landed inside the
  week. Two clocks means a point that counts for one member and not another.
  Derived from a fixed epoch on both sides (`weekIndex()` ↔
  `church_rivalry_week()`), never sent.
- **Pairing is banded by congregation size, and that's load-bearing.** A
  four-person church drawn against a two-hundred-person one loses every week
  forever, which teaches the churches this feature exists for that showing up
  was pointless. Banding makes the week winnable by out-recruiting somebody your
  own size — the behaviour the whole thing is trying to produce. The draw is
  `md5(week || id)`, so it is not first-come and opening the app early can't
  steer it.
- **No cron, because this project has none.** Pairing and settling are lazy and
  idempotent, and opening the church tab IS the scheduler: the first member in a
  new week creates the matchup (advisory-locked, both sides in one statement),
  the first after it ends banks the result. A church with nobody to play gets a
  **bye**, which is not a loss and re-tries until somebody's in range; an empty
  church is never paired, because it would be a free win.
- **The score is a sum over the three existing ledgers** (`church_contributions`,
  `church_offerings`, `keep_offerings`), never a stored counter and never a
  number a client sends. A draw pays BOTH churches; a 0-0 pays nobody, so a
  dormant opponent is never a free statue.
- **The prize is a look, and the church picks it.** Eight statues, three plinths,
  the whole catalog open from the first win — deliberately no rarity, no unlock
  ladder and no ordering, or a yard starts saying how well a church has done
  rather than what it chose. Letting the church choose is also how the feature
  avoids telling a congregation which saints its tradition venerates. Any member
  may raise or change one and it carries no name (`set_by` is forensics only and
  never leaves the server) — a statue with a name on it is one member's trophy,
  not the congregation's.

Online-only, inherited rather than chosen — the `store/churchYard.ts` break with
the two-mode invariant. A local weekly matchup is a church playing itself, and a
locally-granted statue is a trophy you awarded yourself.

## Live battles: the one synchronous thing here

Every other battle is asynchronous — you play, they play later. A **live battle**
(`/battle/live`) is a room code, a ready-check and one clock: both players read
the same verse, both tap "I'm ready", the questions start on the second tap, and
a versus bar races the whole way down. Full design: `docs/LIVE-BATTLE.md`.

Four things to know before touching it:

- **No table and no migration.** The transport is a Supabase Realtime *broadcast*
  channel; nothing in a live match outlives the match. Who won is written through
  the existing `create_battle` / `submit_battle` — the host creates the row (the
  schema forces that: `create_battle` takes the challenger's score) and names the
  guest as invited, the guest polls for it and submits. Best-effort on purpose:
  `liveWinner()` has already put the right result on both screens, and it
  **mirrors `submit_battle`'s tiebreak** — the usual keep-them-in-sync pair.
- **The seed is derived, never sent.** `seedForRoom(code, round)` means both
  devices compute the verse from the room, so there is no announce-the-seed
  message to lose or race, and a rematch is `round + 1`.
- **A rematch takes two, and that is the same rule as the ready-check.**
  `rematch()` is an offer: it sets `iWantRematch`, sends the round it proposes,
  and starts only once both sides have asked; both paths go through one
  `startRound()` so the two devices can't reset to different things. It shipped
  the other way — one tap reset the OTHER player outright, sweeping them off
  their result screen (or out of a run they were still playing) into a round
  they never agreed to. One device deciding for two is the bug; the round number
  is `current + 1` computed on both sides for the same reason. `bye` clears a
  pending offer, or you wait forever on somebody who left.
- **The ready-check buys the FEELING of starting together and nothing else, and
  the runs are deliberately not locked in step.** Every question is timed from
  the moment it starts on your own device, so drift costs nothing in fairness —
  which is what lets the feedback screen stay self-paced. It has to: the teach
  line is the point of a wrong answer here, and a live mode that snatched it away
  from whoever was slower would make being slower mean "you don't get to read
  it". The bar says where the other player is instead.
- **The gate lives in `QuizRunner`** (`StartGate`), like every other cross-mode
  concern, rather than in a wrapper that would have to draw its own copy of the
  verse card above the real one.

Online-only, inherited rather than chosen — the `store/washing.ts` break with the
two-mode invariant. A local live battle is a person racing themselves, which is
what `/battle/cpu` already is. And a room code rather than a queue: matchmaking
is a queue table, pairing and timeouts, and two people about to play each other
need none of it. Open matchmaking, if it ever lands, goes in front of this screen
and nothing here changes.

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

The latest is `0081` (the Study library's card); before it, `0080` (today / this
week / all time on the church board), `0079` (a church claiming its own page),
`0078` (a church's ask for a sponsored slot) and `0077` (the slot itself). Before them, `0075` (the weekly church rivalry) and `0074` (the admin
dashboard's dates) — 0074 must be applied before
the client that uses it merges, and that one is not optional: it DROPS the old
`admin_overview()` / `admin_growth(boolean)` signatures to replace them with
timezone-taking ones, so an un-applied 0074 means the dashboard errors rather
than degrades.

**The house "dates are the user's local date" rule applies to the operator too.**
`current_date` on this project is UTC, so `new_today` / `active_today` counted a
UTC day and read **zero every evening** while the operator's own day was still
going — and `last_played_on` is a *local* date column, so comparing it to
`current_date` was mixing two date systems outright. Every admin metric that
says "today" or "7d" now takes a validated IANA zone from the client
(`localTimeZone()` in `lib/date.ts`, falling back to UTC server-side). If you add
one, take the day from `p_tz`, never from `current_date`.

Numbering has scars: `0034` is used twice (`promo_codes`, `skin_purchases`),
`0059` twice (`keep`, `practice_uncapped`) and `0074` twice (`admin_local_dates`,
`public_church_page`) — so the next free number is `0082`, not `0081`, and this
sentence has already gone stale twice: it said "0076" while 0077, 0078 and 0079
were sitting in the folder. `ls supabase/migrations | tail -1` is the answer;
this line is only a record of which numbers were burned twice. And
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
entitlements no client can forge.

**`revoke execute ... from public` does NOT lock a function down here**, and
0052 shipped believing it did. Supabase sets `alter default privileges ... grant
all on functions to anon, authenticated`, so a new function gets those two as
**named** grants; revoking PUBLIC strips only the `=X/postgres` entry and leaves
`anon=X,authenticated=X` standing. `compute_growth_metrics`,
`refresh_growth_snapshot` and `growth_today` were world-callable that way — and
unlike the pattern above they have **no** `require_admin()` of their own, so
that was the whole operator funnel behind the anon key. Revoke from the named
roles too (`revoke all on function ... from public, anon, authenticated`) and
then confirm the ACL reads `{postgres,service_role}`, the way `grant_skins`
does. Check the real ACL before assuming either way:

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

## The arcade: a room with machines, and a lobby in front of them

A cabinet stands in the hall, the churchyard and your own Upper Room (and again
on the home screen's "In the meantime…" card). Tapping any of them opens
`/arcade` — a wall of machines you pick from. Three today: Manna Rush, Word
Catch and the Cross Word. Full design: `docs/ARCADE.md`.

- **The cabinet opens the LOBBY, not a game.** It used to open Manna Rush
  directly, which was right when there was one game; with two, a door that
  always led to the same machine lies about what's behind it, and a second
  cabinet in every scene turns three little worlds into a shopping street. The
  machine's little screen runs an **attract cycle** through the games so it
  can't promise the wrong one (reduce-motion holds the first frame).
- **`features/arcade/games.ts` is the list, and it's the only list.** Adding a
  game is a row there plus a route — the same choke-point habit as `QuizRunner`.
  It's pure data (the id union in it is what makes `gameScreens.ts` compile);
  wear `ArcadeShell` so games can't drift into different headers.
- **A machine that plays a verse hands the verse back.** Word Catch ends on the
  whole verse it just had you rebuild, and the Cross Word on the one its two
  words came out of — the same `VerseCard`/`VerseActions` pair, so the offer
  can't drift between them. Word Catch passes it as `TapGameScreen`'s `finale`,
  a beat after the tallies: "17 words, 1 of 4 lines clean" is a poor last thing
  to leave somebody looking at when scripture is the point. It shows on a free
  go too (it's the payoff, not a reward); the keep/read actions don't.
- **A tap game's pace is measured in READING, not reaction.** Word Catch shipped
  tuned like Manna Rush and was too fast on a real phone: a word lived 2.1s,
  which is enough to see a flake but not to read four words, work out which
  comes next and get a thumb to it. Longer lives with *fewer* arrivals is the
  lever — more words on the paper is more scanning, and scanning isn't what it
  teaches. Its lines are split evenly too (17 words is 5-4-4-4, never 5-5-5-2),
  because a two-word round is over before its title card has been read.
- **Two of the three run on one engine, and the interesting hook is
  `verdictOf`.** `TapRunner` judges a tap AT TAP TIME rather than at spawn,
  because in Word Catch the same word is the wrong answer on the way down and
  the right one the moment the word before it is placed — a table of fixed spawn
  weights can't say that. With `plan`, a game decides what goes on the field
  too. Both default to the old behaviour, so Manna Rush is untouched by either.
  `TapGameScreen` is the gate/run/harvest those two share.
- **Nothing in the arcade may rank anybody, and that's what lets it exist.** A
  game here may be one you get *better* at, but no cabinet carries a score (a
  list of games with your numbers on it is a scoreboard with a coin slot), the
  order is the order they were built, and a result screen shows your own numbers
  against your own bar with no way to set them beside anybody else's. A run pays
  a drop roll and road progress — never XP, points or standing.
- **Guest-open by default**, because a game that persists nothing has nothing an
  account would keep for you tomorrow. The exception is a game that writes to
  the player's own record: the Cross Word marks its verse studied, so it carries
  `needsAccount`, the route wraps it in `RequireAccount` (`WALL.cross`), and the
  lobby draws the padlock on that cabinet — the nav's convention, for the nav's
  reason.
- **Every machine can be shared, and a shared link is one free go.** The button
  is in `ArcadeShell`, so "every game" means every game that will ever exist
  rather than a rule someone has to remember. `/arcade/<game>/invite` is PUBLIC
  — no `RequireProfile`, no wall — because the machine is the pitch and the ask
  comes after the play. That's the opposite order from the battle invite, which
  has to ask first because accepting a battle writes a score against a real
  account. Four things hold it together: the free go **pays nothing** (`demo` on
  the game components — no relic, no road step, no Bible mark, nothing
  recorded), so the one-play limit guards nothing worth farming and a
  device-local tally is enough; **no score is ever in a share** (`shareLine`),
  because "I got 47, beat me" is the comparison this app doesn't build; an
  account **skips the whole thing** and goes straight to the machine; and the
  `?from=` name is somebody else's text in a URL, so it's sanitised before it's
  rendered. Two traps are written into the code: the have-they-played decision
  is **frozen at mount** (re-reading it swaps the screen out at the exact moment
  the result appears), and everything account-shaped is **hidden** on a demo
  rather than left to fail — "Keep this verse" writes to a shelf a visitor
  doesn't have and "Read the chapter" is behind the wall. Full rules:
  `docs/ARCADE.md`.

## The Cross Word: a puzzle that becomes the thing it's about

Two words that share a letter, standing as a cross — one upright, one crossbar —
and finishing it turns the squares into two timbers with the letters chiselled
into them, with the verse both words came from read underneath. Fifty-two of
them ship; `/arcade/cross`, a machine in the arcade above (it stood on the Study
shelf first, and `/study/cross` still redirects). Full design:
`docs/CROSS-WORD.md`.

- **The data has three invisible failure modes, so they're a build failure.**
  A crossbar one row too low still renders — as a plus sign. A word that isn't
  in the verse still solves — and then reveals a verse that doesn't contain it.
  A clue containing its answer just makes the puzzle free. None of that throws,
  so `checkCrossPuzzles()` asserts it at import in dev and
  `scripts/check-cross.mjs` (in `npm run build`) asserts it again, re-deriving
  the rules rather than importing the checker.
- **The verse is the source of truth, not the puzzle.** `reference` must name a
  `VERSE_POOL` entry and BOTH words must appear in its text — the whole payoff
  is "that's where those two words live". `crossForDate()` is the same
  no-repeat rotation as `getVerseForDate` (seed `'cross-order-v1'` — changing
  it reshuffles history), and "Build another" only ever draws from days already
  past, so playing more can't spoil tomorrow's.
- **It pays what a study run pays and nothing else** — a drop roll, a
  `study_run` step on the road (the prepacked verb; no new one needed), and the
  verse marked studied through `store/bible.ts`. What a thing is doesn't change
  with where it stands: no XP, no points, no timer, no "solved in N", no
  shareable result. That rank-free rule is the whole reason it can be a daily
  thing at all.
- **Solved crosses are DEVICE-LOCAL in both modes**, the deliberate break
  `store/looks.ts` makes: the set grants nothing (everything a solve pays is
  capped elsewhere), and the half of a solve that's really a record — the verse
  — already follows the account. `store/crossword.ts` names the table shape to
  use if that ever changes.
- **The wood is drawn, not generated**, for the reason the church kit is: a
  cross is a different shape for every pair of words, and a baked image can't be
  re-cut per puzzle. Two layers over the same geometry and the same cell size —
  HTML buttons while you play, SVG timbers once you're done — so nothing moves
  when it turns to wood. The shelf's *cover* still follows the house rule and
  has a prompt in `scripts/generate-study-covers.mjs`.
- **All the puzzle state is in one reducer, and that's load-bearing.** Typing
  five letters inside one tick put all five in the same square when each handler
  planned against a hook snapshot — the same scar as `KeepSheet`'s double-tap,
  found by driving the real app and invisible in the diff. Two more from the
  same afternoon: turning direction has to carry the cursor into the other word
  (every square but the shared one belongs to one word, so the keys did nothing
  at all), and typing must advance one square rather than skip the filled
  crossing one, or the second word lands silently off by one.

## Washing feet: the poke that costs the sender

Every other way to act on a person in this app is a challenge. `wash_feet`
(0068, `store/washing.ts`, `data/washing.ts`) is the one that asks nothing
back: you tap a player's face anywhere in the app and kneel, they get a warm
line on their own basin, and **you** get the point. It's the app's version of a
poke, built the opposite way round — a poke costs nothing and asks for
attention, this one spends one of your twelve and gives.

**The 1 XP is the whole risk, and the design is about bounding it.** `xp` is
the one number here that ranks people (0006), so the same rule the XP pets
follow applies: the server counts the rows and pays the point, and the client
never sends an amount.

- **One XP.** A daily drop pays 30-60, so a full day of washing is a quarter of
  one run.
- **Twelve a day — one for each disciple.** The cap IS the theme, which is why
  it can be that generous, and it's enforced in SQL, not in the button.
- **Once per person per day**, held by the primary key. Reaching twelve means
  finding twelve different real accounts, which is the actual limit on this.
- The client sends `todayLocalDate()` and the server clamps ±1, the house
  pattern — a lying client can reach three buckets and 36 XP, which is bounded
  and buys nothing rankable.

**Nothing here is ever a comparison, and that's load-bearing.** The count of
washings you've RECEIVED is returned by `my_washings` to the recipient only:
`get_player_card` is untouched, no board reads the table, and there is
deliberately no RPC that asks how many someone *else* has received. A count of
who likes you is the exact feature this app doesn't have. The milestone ladder
(`WASH_MILESTONES`, 1 → 500) is numbers you passed, never a place you hold,
and there is no rung for being washed — receiving isn't an achievement.

**Online-only, inherited rather than chosen** — the same break with the two-mode
invariant `store/churchYard.ts` makes. The gesture needs a second real account
on the other end of it; a local basin would be a person washing their own feet.
The store header names the shape to use if that ever changes, and says why it
shouldn't: offline, the XP would be client-granted, which is the one thing this
feature's safety argument rests on not happening.

`WashFeetButton` is the single control (`pill` in a row, `wide` on a card), so
the rules can't drift between the player card, the buddy rows and the basin —
the same choke-point habit as `QuizRunner`. A road can score the gesture through
the prepacked `wash_feet` verb; no bundled quest uses it yet, which is what
makes "wash 25 players' feet" shippable as content rather than a release.

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

**The same component is the top of the player-card pop-up**, at `size={140}`
with the faction as its caption, and the card underneath goes `statsOnly` there
for exactly the reason it does on `/you` — an avatar chip directly beneath a
portrait of the same person is that person twice on one screen. So tapping
anybody now opens their look at full length with their companion, rather than a
44px crop. Two consequences worth knowing: the faction and title move *up* into
the hero's caption rather than being dropped with the identity block, and the
dialog sets its own `maxHeight` + `overflowY` because hero + six stats + four
action buttons is taller than a 600px phone — the centring grid was clipping
the Close button before that.

### Customizing is one shelf, not six

Everything you can equip — skins, pets, items, card backgrounds, borders,
badges — lives under a single row of pills in `CustomizeSection`
(`TabbedSection`), with the character builder above it. It used to be six
stacked collapsibles, which meant changing your border after your skin was a
scroll past four other sections, and Pets sat so far down that nobody choosing
a look ever saw it. Everything is now one tap from everything else.

Three things about it worth keeping: the pills **are** the header (tapping the
open one folds the section, so there's one control), only the **active tab's
content is mounted** so six grids of avatars and card art never render at once,
and the row **wraps rather than scrolls sideways** — six names fit in two rows
on every phone, where a scrolling chip rail would hide half the wardrobe behind
a swipe nobody is told about. Adding a shelf is one more entry in the `tabs`
array.

### The starter character, and the parked armor

The first thing anyone does — as a guest at `/welcome`, or on the first beat of
`/auth?mode=signup` — is **make a character**, and both screens mount the same
`components/CharacterPicker`. A second copy would drift, and the promise of the
flow is that what you build at the door is what you keep, so the profile's
Customize screen mounts it too (with `showRobe`).

The axes are deliberately three: **male/female**, six **skin tones**, six **hair
colours**. All free, none of them a number. The two figures are the *same*
character — same face, same robe, same palette — parting only at the hem of the
robe and the length of the hair, so switching reads as "that's me" rather than
as picking a different avatar. `hair` and `figure` are new optional fields on
`AvatarSpec`; `avatar_character` is an unconstrained `jsonb` column, so **no
migration is involved** and a spec written before either existed still renders
(`hairHex` and `figureOf` supply the defaults).

**The base character is Nano Banana art, one render per combination.**
`art/starter.json` is the batch — 2 figures × 6 tones × 6 hairs = 72 `skin`-kind
entries, held to ONE character by reference-chaining: each figure's master
render is the ref for its tone bases, and each tone base is the ref for that
tone's hair variants, so drift can't compound across the set. `Character` looks
up `starter_<figure>_<skin>_<hair>` in `GENERATED_ART` whenever no full skin is
equipped and renders it through the same raster path as Moses and Esther; only
the equipped combination ever loads (~60KB), and `CharacterPicker` pre-warms the
variants one tap away so a swatch tap doesn't flash blank.

Three consequences of that, all deliberate:

- **Chest items don't compose onto the raster base** — same trade every raster
  skin already makes (equip Moses and the staff disappears too). If items ever
  need to show on the base again, that's an argument for generating item-on-body
  renders, not for realigning SVG overlays onto a painting.
- **The drawn SVG figure stays, as the fallback.** A combination whose PNG
  hasn't landed (or 404s, or fails to decode) renders the drawn pilgrim exactly
  as before — the batch can ship incomplete and nothing breaks. That fallback
  keeps its own two scars: it stays faceless (the raster has a face, like every
  other skin; a face on the *drawn* figure was the odd art out), and its hair
  never leaves the head circle — sideburns off the widest point read as
  headphones at every size.
- **The reference renders are load-bearing.** `starter_masc_sand.png` and
  `starter_fem_sand.png` (the pilot, `art/starter-pilot.json`) are the refs the
  whole set descends from. Regenerating one combination is fine; regenerating
  the masters restyles everything generated after them, so don't.

**A character exists before the account does.** Web OAuth reloads the page
between the two beats of sign-up, so the pick parks in
`localStorage['va.pendingCharacter']` (`setPendingCharacter`) and lands in
`applyPendingCharacter`, called from `refreshProfile`. It applies **once**, and
only onto an account with no look of its own (`isDefaultAvatar`) — signing in to
an established account on a device where a half-finished sign-up left a pick
behind must not repaint that account's character. `beginGuestClaim` parks the
guest's character the same way, because `claim_guest_progress` doesn't carry
`avatar_character` and a guest who upgraded used to arrive at their new account
wearing the emoji fallback.

**The Armor of God is parked, not deleted.** Six flat gold overlays on top of
the figure read as a costume rather than as armor, and there's no art for it
yet. `ARMOR_ENABLED` in `data/avatar.ts` is the *one* flag: it hides the builder
grid and stops `Character` drawing the pieces. `spec.armor` is still stored and
still round-trips, so flipping it back restores every equipped piece without
touching a profile. When it returns, the likely shape is a **full-look skin**
(the way Baldwin and Michael work) — one earned "Armor of God" figure, drawn as
one figure — rather than six overlays layered over a robe.

### Pets

A companion, **earned and never sold** — a level plus, past the first, one more
lifetime number (`data/pets.ts` ↔ `pet_requirements_met` in 0064). Every
requirement only goes up, so a pet can't be taken back by a bad week; putting one
down is always allowed, because a companion you can't take off is a commitment.

The one bypass is the **operator preview**: an `is_admin` profile has every pet
unlocked, exactly as `skinOwned` gives it every skin. It lives in two places
that have to agree — `petUnlocked`'s `admin` argument and the `is_admin` branch
`0067` adds to `pet_requirements_met` — because a grid that offers six pets over
an RPC that refuses five is worse than no preview at all. It's safe where a real
unlock wouldn't be for the usual reason: `is_admin` is server-written, and no
client-callable RPC sets it.

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

**Companions walk in the little worlds** — the hall, the churchyard, the road
and the Upper Room — because a pet you only see on your own profile is a thing
you own rather than a thing you have. Since `0072` that includes other people's:
see the scenes-vs-boards rule below. It's one change in `CrowdLife`,
which is why all three got it at once, and the pet is read from the auth store
there rather than passed in: every scene that draws you gets the companion
without being asked, and `CrowdMember` has nowhere to put somebody *else's*
pet. Two rules the scenes taught, both written into that file: a companion
stands on the side facing the middle of the frame (tie it to the figure's
facing flip and the outer waypoints hang your camel over the edge, and every
scene clips), and it's drawn at `PetDef.scale` — the profile's own ratio — with
a 9px floor, below which a dove is a speck of dirt on the painting.

**A pet now appears on the player card, and nowhere else it didn't before.**
`get_player_card` carries `pet` (0071) so the pop-up can draw the companion
beside the figure. The old rule here said a pet visible to strangers is one step
from being compared; the narrower version, and the reason it holds, is that **a
pet on a card is a picture, not a number** — one id out of a fixed catalog, with
no count, no rarity label, no "unlocked on" and no ordering. Nothing about it
can be summed or put in a row beside somebody else's, which is what that rule
was actually protecting.

**And a companion walks with everybody in the little worlds** (`0072`):
`keep_json`, `get_church_page` and `room_json` carry `pet`, and `CrowdMember`
has a field for it. `CrowdLife` reads YOUR pet from the auth store and everybody
else's from the member row — not redundancy: equipping a pet has to change the
scene in front of you before any RPC is re-fetched.

**The line that survives is scenes vs. boards, and it is the whole rule.** A
scene has no order, no rows and no number on anybody — a companion standing in a
churchyard is the same kind of thing as the robe standing there. A leaderboard
is an ordered list, where a companion in a ranked row starts reading as part of
the rank. So the leaderboard RPCs are **still untouched**, and widening them
would need its own argument rather than following from this one.

`lib/petProgress.ts` gathers the requirement numbers, and it's a function rather
than a hook for an import-graph reason: `data/pets.ts` can't import stores (the
reward math depends on it) and `store/auth.ts` can't import the bible and keep
stores (they already import auth). The screen that shows the picker has to
`load()` both of those stores or it quietly reports 0 for two requirements.

Art follows the house rule: drawn SVG in `components/Pet.tsx` today, with
`art/pets.json` ready to generate and `RASTER_PETS` as the slot the renders drop
into.

## The little worlds go where the section lives

Five places in this app are places, not screens — the Harvest Road, the keep's
hall, the churchyard, your own Upper Room, and you. Each one **opens its section**, at the top or
directly under its primary action, rather than sitting behind a row that
describes it:

| World | Where it renders | Component |
|---|---|---|
| Harvest Road | top of `/season` | `RoadScene` |
| The hall | under "Start a new battle", and in the sheet | `KeepScene` |
| The churchyard | hero of `/church`, and on any church's page | `ChurchScene` |
| The lending library | top of `/study` | `LibraryWindow` |
| You | top of `/you` | `ProfileHero` |
| Your Upper Room | `/you`, under the card, and in the visit sheet | `RoomScene` |

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

**The crowd talks, in emoji, and that is deliberately all it can do.** Figures
pop a small bubble every 12-30s from a fixed ten-emoji list in `CrowdLife`
(`CHATTER`) — a wave, a heart, a dove. There is no text field, no per-player
message and nothing anybody can author, so the one surface in this app where
players appear to speak to each other cannot carry an insult, a link or a
moderation queue. The list is also uncomparative on purpose: no 💪, no 🥇, no
👎, same rule that keeps figures from carrying points. If a future session
wants real words here, understand that it is opening a user-content problem the
current design doesn't have — the emoji aren't a placeholder for chat.

And when the world is showing, the row that used to link to it goes. The Battle
tab lost its "Your Keep →" card, and the profile's player card lost its identity
block (`statsOnly`) because `ProfileHero` is already showing you at full size
directly above it. Everywhere the card stands alone — the pop-up, another
player's profile — it keeps its identity, because there it *is* the identity.

A player with no faction gets the invitation instead of the hall: a room with
nobody's colours in it is the one version of that world that says nothing. It
offers non-denominational in one tap and scrolls to the full list, and it never
appears again once a team is picked.

## The Upper Room: the one place that is yours

Every other place in this app belongs to a group — the hall to a faction, the
churchyard to a congregation, the road to a season — so the whole decorating
system was attached to a room shared with thousands of strangers and there was
no private space at all. `/you` now opens one: a small chamber under the player
card, eighteen furnishings, five tiers earned by your own level. Full design:
`docs/UPPER-ROOM.md`.

**The placement rules now live in one file, and that is the load-bearing part.**
`planPlacement`, `planMove` and `planPick` were hardcoded against the keep's
`ANCHORS`; they are now `data/placement.ts`, parameterised by a `Surface`
(`{ anchors, mountOf }`), and `data/keep.ts` keeps every one of its exports as a
thin wrapper — **no keep call site changed**. Copying them would have been the
exact drift the `QuizRunner` rule exists to prevent: two rooms disagreeing about
what a duplicate means is a bug nobody finds for months, because both halves look
right on their own. The wire format (`room_reed_mat.2`) moved with them and is
unchanged, so every keep row still reads as before.

Three rules the room adds to the ones it inherits:

- **A visitor can only look, by construction.** `room_json` (0069) returns
  placements, an *architecture tier* instead of the owner's level, and **no
  number at all** — a room you can rank is a scoreboard with a rug on it.
  `RoomScene` takes no `editing` prop on the visit path, so a visited room is
  inert because the scene was never handed the ability to change, not because a
  handler decided to say no. And nothing records the visit: there is no visitor
  log to build "12 people looked at your room" out of later, same rule as
  `my_washings` being recipient-only.
- **Ownership is derived from six lifetime numbers that only go up** (level,
  longest streak, plays, verses studied, chapters read, stamps —
  `lib/roomProgress.ts`, the `petProgress` shape). No grant table, nothing to
  revoke, and **the screen showing the room has to `load()` the bible and
  collection stores** or it quietly reports 0 and locks three earned pieces.
- **Furnishings stay drawn SVG even once the room is painted.** `lib/postcard.ts`
  serialises the scene into an `<img>` and an SVG loaded that way never fetches
  external resources — a room made of `<image href>` exports blank. The chamber
  may become a Nano Banana painting (`art/upper-room.json` → `room-1`…`room-5`,
  wired through `GENERATED_ART` like every other tier ladder); the props may not.

**The postcard has to go through Capacitor on native, and the reason is a whole
class of bug.** `lib/postcard.ts` used to end at an `<a download>` click, which a
WKWebView silently ignores — no share sheet, no file, no error. The click doesn't
throw, so the old boolean came back `true` and the screen didn't even draw its
"couldn't make one" line: tapping the button did *nothing*, invisibly, and it took
a real phone to find. Native now writes the PNG to the cache directory and hands it
to `@capacitor/share`; the download stays as the web path. **A download link is a
web-only affordance** — any future "save a picture" feature needs the same branch.
The button also sits on the room's own title rather than at the bottom of the
Furnish shelf, where it was folded behind a collapsible nobody opened to share.

**Two scars from driving it, both invisible in the diff.** Tapping two shelf
tiles inside one tick planned against the placements the *last render* saw, so
both picked the same free anchor and the second overwrote the first — plan
against `useRoom.getState()`, never the hook's snapshot (`KeepSheet` had the same
latent bug on a fast double-tap and got the same fix). And the window and the
alcove overlapped by 22 viewBox units and drew two arches in one place: three
fixtures own three bands of the back wall (shelf 110..214, window 400..460,
alcove 470..540) and they must not touch.

## Praying: the one thing here that isn't a game

Tap your own figure standing in your Upper Room and it offers to pray with you.
`data/prayers.ts` + `features/prayer/PrayerSheet.tsx`, and it is the only place
in the app where tapping a figure does something other than open a player card
(`CrowdLife`'s `onTapSelf`, passed by the room and nowhere else — somebody
*else's* figure always opens their card, in every scene).

**It generates rather than quotes, and that is the feature.** Somebody nervous
about praying out loud is rarely short of prayers to read — they are short of a
SHAPE, and the fear is of not knowing what comes next. So a prayer is built from
four movements in order (who you're talking to → what you're thankful for →
what you're asking → how you finish), one line drawn per movement from pools
tagged by occasion. "Show the shape" names the movements; it is off by default,
because a first-time reader should meet a prayer rather than a diagram.

**Saying Amen is what records it, and the payout follows the Basin's doctrine.**
Three a day, 10 XP each (`record_prayer`, 0073). `xp` is the worldwide
leaderboard (0006), so: the client says "I prayed", the SERVER counts the rows
and pays, and no client ever sends an amount. The cap is in SQL, not in the
button. The client sends `todayLocalDate()` and the server clamps ±1, the house
pattern. **The fourth prayer of a day is still a prayer** — it returns ok with
`awarded: 0` and the sheet says the warm version of that, never an error.

Worth knowing when weighing any change: 30 XP a day is much bigger than the
Basin's 12, and roughly one daily drop. What keeps it honest is that it is
capped and server-granted, not that it is small.

Two-mode for real, not inherited-online-only: praying needs nobody on the other
end, so `store/prayer.ts` has a guest path with the same cap and payout against
the local profile — which ranks nobody. Its level maths goes through
`levelInfo` (the existing client mirror of `level_from_xp`); do not write a
third copy of that curve.

**Two reading voices, and the honest limit.** `lib/voice.ts` picks a "Softer"
and a "Deeper" voice from the ones the DEVICE ships (Samantha/Daniel on iOS,
the tpf/tpd pair on Android), read at rate 0.84 and pitch 0.92 with a beat
between lines. The app cannot ship a voice of its own: recording one means audio
files, which is the exact thing `juice/music.ts` exists to avoid, and a cloud
TTS would mean sending what somebody is praying to a third party. Three things
that bite here, all handled: `getVoices()` is empty on the first call in Chrome
and Android (wait for `voiceschanged`), gender is not in the API at all (hence a
ranked list of real voice names, then name hints, then any English voice), and
**setting `u.voice` throws synchronously** on a stale reference — unguarded that
takes the whole read-aloud down instead of falling back to the default voice. A
device with no voices gets a line saying so rather than a dead button.

**The lamp is the feedback, and its shape is the argument.** The room's
`room_lampstand` burns when you have prayed today and shows a cold wick when you
haven't (`RoomArt`'s `PropOpts.lit`). It is not a count, not a streak, not a
rung: it resets by itself every day, and the only thing it can ever say is
"today, yes" or nothing. That is "presence, not quantity" applied to the one
feature where a growing tally would change WHY somebody does it — a daily thing
that clears is an invitation, a lifetime number is an accumulation you can fall
behind on.

**`lit` defaults to TRUE, and that default is a privacy decision.** Only your own
room passes the real value; a visited room, the postcard and the shelf thumbnail
all keep the lamp lit exactly as it has always looked, so a visitor can never
read "did they pray today" off somebody else's furniture. The signal exists on
one screen: yours. `RoomSection` also has to `load()` the prayer store, or the
lamp stays dark until you open the sheet — the one screen where you already know
the answer.

**There is deliberately no Journal ladder for it.** Every rung in the Journal is
a number you passed; a rung you climb by praying is a rung you would pray to
climb. The table stores a user and a date and nothing else — no occasion, no
text, no streak — because counting the cap is all it exists to do, and no RPC
asks how much anybody else has prayed.

## Giving, and the mailbox

**A gift moves the ITEM and never the STAMP** (`gift_collectible`, 0070). That
split is the whole safety argument: `user_unlocks` is the number
`get_player_card` publishes as `cards` and it gates card backgrounds and room
furnishings, so granting it would let a stranger inflate a number on your card.
Nothing is created either — the relic already existed and can still only be
donated once, so a gift changes *which* church banks the points, never how many
there are. Ten a day, no message field, and online-only for the reason washing
feet is: the gesture needs a second real account on the other end.

**`/mail` exists mostly for the second thing it carries.** The content catalog
can ship a whole road without a submission — and until now the road switched
itself on in silence, the strip on the season tab quietly becoming a different
strip. `NewsDef` + `activeNews()` (`data/catalog.ts`) is the announcement
channel, published through `admin_publish_catalog` like the rest of the catalog,
so it is operator text and not a moderation surface. It is still length-capped
and sanitised per entry, because a pipeline that can push markup to every phone
at once will eventually be asked to.

The mailbox delivers gifts, buddy requests, washings received and news — and
**nothing that is a comparison**. No "you're 4th", no digest of what your
buddies scored, no count of anything belonging to somebody else. Opening it
marks gifts read; the dot goes because you looked, not because you cleared a
queue. It is a pill on your own card rather than a sixth tab, because five
already have to clear a 320px phone.

## The Journal, and saved looks

`/journal` is the page that says what you have done — five features had milestone
ladders and nothing collected them. It is **purely derived** (no table, no grant,
nothing to migrate) and every rung is **a number you passed, never a place you
hold**, which is the same sentence `data/washing.ts` is built on and the only
reason an achievement screen can exist in an app with no losers. The one total it
shows is rungs passed out of rungs that exist — your own ladder, never a
percentile.

Saved looks (`store/looks.ts`) are **device-local in both modes**, a deliberate
break with the two-mode invariant of the same kind `store/music.ts` makes: a look
is a shortcut for your fingers, not a possession. It grants nothing, and every
piece it names is re-checked by the equip path, so a look naming a skin you no
longer have degrades rather than fails.

## Shared choke points

`QuizRunner` (`features/daily/QuizRunner.tsx`) owns quiz gameplay and scoring for
*every* mode — daily drop, practice replay, focus drill, CPU race, real battle.
The caller decides what "done" means via `onComplete`. Anything that should
count for all modes belongs here, once, rather than in five screens.

Same idea elsewhere: `CpuVersusQuiz` for anything racing a simulated opponent,
`Page`/`Button`/`Avatar` for chrome, `useJuice()` for sound + haptics + confetti
(respecting the user's reduce-motion and sound settings — always go through it).

## UI conventions

**The z-index ladder, written down once** (it was being re-derived from six
files, and both ways of getting it wrong have now shipped):

| z | Layer |
|---|---|
| 40 | bottom nav |
| 90 | `.status-scrim` — the strip the page scrolls behind under the notch |
| 100 | sheets — keep, church detail, settings, bundles |
| 110 | the player card, which opens *out of* a 100 sheet |
| 112 | sheets the player card itself opens — visit a room, give a relic |
| 115 / 120 | `NowPlaying` / `StudyDropToast`, `WaystationToast` |
| 200 | `Tutorial`, `BookOpening` — whole-screen takeovers |

**The tiers encode direction: a surface sits above the one that opened it.** The
keep sheet is at 100 because tapping a figure inside it opens the card; a sheet
the card opens has to be above the card, and putting one at 100 draws the card
over the thing you just asked to see. The toasts stay top: a toast a sheet can
hide is a toast nobody sees.

**A scene's figures must not compete in that ladder.** `CrowdLife` gives each
figure a z-index of ~180-199 to sort itself by depth, and its container sets
`isolation: 'isolate'` so those numbers stay scene-local. Without it the
container is `position: absolute` at `z-index: auto`, which creates no stacking
context at all — so for any scene rendered INLINE on a page (the Battle tab's
hall, the churchyard, the road, the Upper Room) the figures escaped into the
page root and painted a camel over the player card you had just opened by
tapping it. Any future overlay inside a scene needs the same treatment.

Design tokens live at the top of `src/index.css` — use the CSS variables, never
raw hexes. Numbers and headings wear `var(--font-display)`; that's the brand.
Motion is springy `framer-motion`, mobile-first, max width 520px.

### The lending library, and the woman at the desk

The Study tab opens with the room its shelf came out of: a lit library with an
NPC librarian (Tabitha) standing in it, and tapping her is a second way to reach
the same books. Taking her route the first time pays **5 XP, once ever**, as an
Easter egg. Full design: `docs/STUDY-LIBRARY.md`. Four things to know:

- **Every destination she offers is already on the shelf.** She is handed the
  tab's own `ShelfItem[]` and offers the ones carrying a `lend` line, so the
  library is a *route* to Study rather than a second menu that can drift — the
  same choke-point habit `QuizRunner` and `CrowdLife` keep. Your bag and your
  reports have no `lend`: they are yours, not stock.
- **The 5 XP is built like every XP grant here.** `xp` is the worldwide
  leaderboard (0006), so the server counts and the server pays
  (`checkout_library_book`, 0081), the client never sends an amount, and the cap
  is the table's PRIMARY KEY rather than a count — a race inserts nothing.
  Lifetime exposure is 5 XP. **Once ever rather than once a day is deliberate**:
  an Easter egg that pays every morning becomes a chore-tap you feel behind on
  for missing, which is the feeling this app is built not to produce. A daily
  version is one line in 0081 and needs its own argument.
- **A second checkout is a SUCCESS that pays nothing**, never a refusal, and so
  is a failed call — she still hands the book over, because the destination was
  reachable from the shelf without her. And she never measures anybody: no due
  dates, no "it's been a while", no count of visits. A librarian who tuts is the
  one version of this that would be worse than no librarian.
- **The reveal waits.** The sheet stays open on the stamp with an "Open it →"
  button rather than navigating for you — a +5 XP line swept off screen by a
  route change is the exact bug `StudyDropToast` exists to work around, and here
  the sheet owns the moment so it just holds it.

Two-mode for real, not inherited-online-only (`store/library.ts`), because a
keyless LOCAL build reaches this tab and must not find a dead librarian in it.
The shelf's boards came down with her (148 → 108, `BOOK_SCALE` 0.86 → 0.66,
~230px of scroll) so the room and the books share a screen; captions did *not*
shrink with them — they span the full grid column, because the caption is the
only part of a book that says what is inside it.

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

## Store versions: an approved version can never be uploaded again

`package.json` `"version"` is the source of truth for the *store* version, and it is
not decoration. Once App Store Connect approves a version, that version's train
closes — every later upload must carry a strictly higher `CFBundleShortVersionString`
or the upload is rejected (`90062` + `90186`) *after* a full signed archive, about
20 minutes in. Builds 22 and 23 died that way with a perfectly good Admin API key.

**Where we are: 1.2.0 is the approved, live version — its train is CLOSED — and the
repo carries 1.3.0, which has never been uploaded.** 1.2.0 shipped the Upper Room,
praying, gifts and the mailbox, the Journal, saved looks and companions in the crowd
scenes.

**1.3.0's train is OPEN, so keep landing features under that number.** An unuploaded
version can absorb any amount of work: a feature merging today does NOT need a bump,
and bumping per-feature just burns numbers and makes the next one harder to reason
about. The number only has to move when the version it names has been *approved*. So
what a new feature changes is the release NOTES, not the version — the running list
for 1.3.0 lives in `docs/APP-STORE-LISTING.md` under "What's New", and it is a draft
that grows until the day someone uploads. This is the same situation 1.2.0 was in
while the Upper Room, praying, gifts and the Journal all landed on top of it.

The lesson this file has now learned twice: **this paragraph goes stale silently, and
a stale version number costs a full signed archive to discover.** It is a claim about
App Store Connect, not about the repo, and nothing in CI checks it. So do not trust it
— open App Store Connect, read what is actually approved, and pick strictly higher.
Update this paragraph in the same commit as the bump, or the next session inherits the
same trap.

**Codemagic stops at TestFlight; submitting to review is done by hand.**
`submit_to_app_store: false` is a choice, not an unfinished setting — it keeps a real
device between the archive and the reviewer, and crash-on-launch is the top avoidable
rejection. The three keys that hand it to CI are written down in `codemagic.yaml`
along with what they cost: Codemagic would *submit* the version, not fill it in, so
an App Store Connect record missing screenshots, What's New or the demo-account
review notes fails the publishing step after the archive — the same expensive shape
as the version-train rejection above.

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
