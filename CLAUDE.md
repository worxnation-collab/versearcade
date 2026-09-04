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
empty. What still has a price is the founding patron — `cephas` since `0095`,
the whale before it — and the promo-code
exclusives (`eden`, `shades`, `sonshine`, `porchlight`) are still free
redemptions. Everything
below still holds for that one product, and for the machinery, which is kept
rather than deleted so selling something again is a row rather than a rebuild.

**The founding patron changed skin, and how it was done is the template.** The
whale became `cephas` (Peter with the keys, on the bedrock — Matthew 16:18) plus
a `patron_cornerstone` card background, at the same $9.99. Four things made that
a data change rather than a re-launch, and all four are worth copying if the
product ever changes again:

- **The SKU changed; neither STORE did.** The Apple product id stays
  `com.versearcade.app.patron_founding` — already approved, so the new skin went
  on sale in every build already on a phone, no submission. `APPLE_PRODUCT_IDS`
  is keyed on the sku, so it is one edit. Nothing Apple holds is user-visible
  here: `IapProduct` keeps only sku, product id and `priceString`, and StoreKit's
  display name is dropped at the mapping — every word a player reads comes from
  `data/avatar.ts`. What DOES show Apple's text is its own purchase sheet, so the
  IAP's display name in App Store Connect should read "Founding Patron" — a name
  that outlives whichever skin the patron currently gets. Same on the web: a
  Payment Link is a PRICE, and what it grants comes from `client_reference_id`,
  so the same link now settles as `cephas` and only the product's *name* in the
  Stripe dashboard needs changing by hand.
- **`retired` is not `limitedUntil`, and confusing them takes something from a
  buyer.** A retired skin (the whale) is hidden from everyone who doesn't own
  one, has no price and no checkout, and is excluded from `pricedOnShelf` — but
  its owners keep wearing it forever. An EXPIRED skin vanishes for its owners
  too. Retiring hides the offer; expiring deletes the thing. So the whale's
  `limitedUntil` was dropped in the same change.
- **Nobody is asked to pay twice.** `cephas` carries `supersedes: 'whale'` and
  `skinOwned` honours it, so a patron from before the swap reads as an owner and
  `patronOffer` gives them the thank-you rather than a checkout. `0095` backfills
  the same grant server-side, and `iap-fulfill` maps the product id to `cephas`
  so a Restore does it too. Three paths to the same state, because the failure —
  billing an existing patron again — is the one thing that card must never do.
- **What was added was a LOOK, twice over.** A skin and a card background. No XP,
  no rank, nothing countable; see `PatronCard`'s header and the `Perk` rows,
  which are deliberately all looks and promises about the card's own behaviour.

Two things about the de-monetisation that are load-bearing:

- **Nobody loses what they bought.** `skinOwned`'s `pass` branch falls back to
  `owned_skins`, so an Angel Pack buyer still owns Gabriel with no season
  unlock. And `SKU_BY_PRODUCT_ID` in the `iap-fulfill` Edge Function keeps all
  five product ids while `APPLE_PRODUCT_IDS` in `lib/iap.ts` drops four — they
  look like duplicates and are not. The client list is what the app OFFERS; the
  function's is what an existing purchase is WORTH. Trim the second and a buyer
  who reinstalls and taps Restore gets nothing back. **Add rows there, never
  remove them.**
- **`enforce_skin_entitlement` was deliberately not touched by the
  de-monetisation.** The de-monetised ids stay in its protected list: nothing
  reads `owned_skins` for them now, so guarding them is free, and that list is
  restated *wholesale* by every migration that edits it — a needless rewrite is
  the one way to unlock a paid skin for everybody by accident. The ONE
  legitimate reason to touch it is adding a new protected id, and then the whole
  list is copied forward from the migration that last set it. That chain is
  0031 → 0034 → 0043 → 0044 → 0046 → 0057 → 0082 → 0088 → **0095** (`cephas`);
  read the latest one, never an earlier one.

**A creator-collab skin is a promo code, not a product**, and `sonshine` (0057),
`porchlight` (0082) and `lantern` (0088) are the worked examples. The shape: `source: 'paid'`
+ `exclusive: true` so it reuses the `owned_skins` entitlement, NO
`limitedUntil` (a partnership outlives a launch window — retire it by toggling
the code off in the admin panel, never by expiring the skin), a row in
`promo_codes`, the id added to `enforce_skin_entitlement`, and deliberately NOT
added to `fulfill_skin`'s allowlist, so neither Stripe nor IAP can ever grant
it. Grant it with `grant_skins()` rather than `admin_grant_skin()`: the latter
writes a `skin_purchases` row with `reason='manual'`, which files a free
creator grant in the dashboard's Sales tab as though it were revenue.

**`skinVisible` decides `exclusive` BEFORE the native branch, and the order is
the point.** An exclusive wears `source: 'paid'`, so with StoreKit live it used
to fall through to `skuPurchasable()` and vanish for want of a product that is
never meant to exist — hiding the very thing a creator's audience was sent to
redeem. It is safe to show because it carries no price and no checkout anywhere:
an unowned one opens the redeem prompt, draws `🔒 <packName>` instead of an
amount, and `pricedOnShelf` excludes exclusives by name. Free content, like
`pass` and `earned`.

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

**The founding patron has a card of its own now** (`PatronCard`, at the settled
end of `/you` — after the room and the collection, before the account
controls). It shipped reachable only by opening Customize, choosing Skins,
scrolling to a locked tile and tapping it, which is not a shop; the app has one
product and it was effectively invisible. Its title is **"On this rock"** and it
leads with Matthew 16:18, because a $9.99 ask needs a reason and the whale gave
it none — what the money does IS the pitch, and the skin now says it. Four
things keep it from becoming a
nag, and they are why it can sit on a player-facing tab at all: it is asked
**once** (a patron sees a thank-you and no checkout — `patronOffer` returns
`owned`, and `supersedes` keeps that true across a change of product), it sells
a **thank-you rather than power** (a skin and a card background; no XP, no rank,
nothing a non-patron is behind on — the same rule that makes a paid church skin
"not a bigger church"), it **hides entirely** rather than degrading to a greyed
button or an "opening soon" line, and it is **hidden from guests**. That last
one is delivery, not policy: both fulfilment paths land the skin on a
server-side account (Stripe's webhook splits `client_reference_id`,
`iap-fulfill` asks RevenueCat about a signed-in subscriber), so a guest's money
would arrive with no row to attach it to. It is deliberately NOT
`useAccountLocked()`'s rule — that wall stands down in a keyless LOCAL build,
where this one must not, because a keyless build cannot complete a sale either.

**`lib/checkout.ts` is the one place a sale is STARTED**, as `commerce.ts` is
the one place it is decided. Two surfaces now begin a purchase (the Skins grid
and the patron card) and each writing its own "which store am I in, and what do
I pass it" is the drift the `QuizRunner` rule exists to prevent. The web path's
`client_reference_id` is load-bearing rather than decorative — drop it and the
money arrives with no way to tell whose it was.

**The shop no longer retires itself on a date, and that is a reversal.** It used
to: the whale carried `limitedUntil: LIMITED_UNTIL`, `skinExpired` hides an
expired skin from the grid *for owners too*, and `patronOffer` follows the same
rule — so on 2026-10-12 this app would have had nothing purchasable at all, and
its patrons would have lost the skin they paid for. `cephas` deliberately
carries NO `limitedUntil`: a foundation that disappears out from under the
people who funded it is a bad joke rather than a limited edition. `LIMITED_UNTIL`
still exists and now governs only `shades`, and `patronOffer`'s expiry branch is
kept though nothing reaches it — whether the patron product expires is a decision
that belongs in the catalog, and `commerce.ts` should keep honouring either
answer. Reinstating it is one field in `data/avatar.ts`.

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

**A prop's display box carries its render's aspect ratio, and replacing a
render changes it.** The keep's hall stretches a decoration to whatever box
`RASTER_DECOR` (`data/keepArt.ts`) gives it, so `w` is derived — `h x (png
width / png height)` — and a stale width squashes the picture with nothing
thrown. `npm run check:decor` runs the real table against the real files in
`npm run build` and prints the number to use; the two most recently generated
props were both stretched before it existed. Its sibling trap is reading that
table instead of `decorRaster()`: the map wins over the hand-placed `src`, so a
direct read draws the old art on the shelf and the new art in the hall.

**Generated art layers OVER a drawn fallback, never instead of it.** A tier
whose PNG hasn't been generated still has to render as itself. Wiring is
automatic: the generator writes `src/data/generatedArt.ts` (id → public path)
and every surface looks itself up there, so a render reaches the player the
moment it exists and no id can point at a 404. That file is generated — don't
hand-edit it — and entries merge, so one `--only` never un-wires an earlier
batch.

One class of thing stays drawn, and it isn't laziness: **anything taking a
runtime colour** — the kite shield, the destrier's barding, the gonfalon — is
painted in `denominationColor()`, which is measured for colourblind separation
and isn't knowable at generation time; a baked image can't take a colour. The
church buildings used to be the second holdout ("a kit, because 32 images");
they are painted now — see the church-skins section for what changed and why
the kit still exists.

## The TikTok engine: an operator tool, not a feature

Admin → TikTok makes the daily post for a faceless TikTok account: Cephas
standing on a road scene reading the verse of the day, and an evening Story
time with Tabitha telling the story behind it to a circle of children. Both
are captioned word by word, ending on the site. One click a day, a week at a
time if you like; the human does the upload. Full design:
`docs/TIKTOK-ENGINE.md`. Four things to know:

- **The Gemini key lives in `supabase/functions/tiktok-gen` and nowhere else.**
  Same `sharkbait` gate as `push-send`. It makes the reading (Gemini TTS), the
  reader (a Nano Banana still, optionally a Veo loop) and the caption, and
  parks them in the `tiktok` Storage bucket, which it creates itself — **no
  migration**. Set `GEMINI_API_KEY` in Supabase secrets and deploy the function.
- **The video is assembled in the browser** (`src/lib/tiktokRender.ts`,
  WebCodecs + `mp4-muxer`, WebM fallback), dynamically imported by the panel so
  the muxers never reach the player bundle. Captions are timed by measuring the
  WAV's pauses against the verse's clauses, because TTS returns no word timings.
- **It touches no player data and no player surface.** It reads
  `getVerseForDate` and the app's own art, and it never ranks or names anyone.
  It rides in the baked `dist` harmlessly because `/admin` renders nothing for
  any other account.
- **The only thing moving is the caption, and that is a rule now.** These
  posts had drifting motes, a warm pulse over the frame, a hovering figure
  under a breathing halo, page-turn wipes and Veo loops of Tabitha talking —
  and the sum read as generated rather than painted, which is the one thing a
  faceless account cannot afford. So: paintings held nearly still (a 1.5-2%
  push), a figure with its feet on the ground, no glow, and a painted still
  now beating the Veo loop in `tierFor`. What moves instead is the word being
  spoken, lit gold — `timeWords()` places words inside a phrase by CUMULATIVE
  SPEECH ENERGY rather than elapsed time, so a breath between two words moves
  neither of them. Anything added here has to earn its motion.

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

### Where the churches themselves come from

Every church in this app started as a row in `church_places` — our own index,
loaded from the Overture Maps places theme (`0089`, `scripts/load-church-places.mjs`,
`docs/CHURCH-PLACES.md`). It replaced live OpenStreetMap, and the reason is
worth keeping because it is the kind of bug that looks like a typo:

- **A source is only as fresh as its last edit.** Quay Church in Windermere,
  Florida was renamed over a year ago; OSM still said "Lifebridge Church", so
  the picker kept offering the old name to the people trying to add the new
  one. Overture — which merges Meta, Microsoft and Foursquare — had the rename
  three weeks after it happened.
- **And a name was written once and never re-read.** `churches.name` was
  frozen at join time, so even a perfect source would have gone stale the next
  day. `refresh_church_names()` is that second half, and it is the half that
  gets forgotten: applying the migration and loading the data fixes nothing
  until it is called.

Three rules hold it together:

- **A licence that permits a permanent row.** Google and Foursquare both allow
  storing their id and nothing else — no name, no address, no coordinates. A
  church row is permanent (a congregation banks XP against it for years), so
  neither can back this table without re-fetching a name every time a board
  renders. Overture is Apache-2.0 / CDLA-Permissive-2.0. That is the constraint
  that decided the source, not freshness alone.
- **Linking legacy churches refuses to guess.** Overture places carries no OSM
  ids at all, so a church joined under `0040` is matched by POSITION, once, into
  `churches.place_ref` — and only where there is exactly one candidate. A church
  campus routinely has four Overture entries at one address, and at the very
  address that prompted this migration the highest-confidence one is *wrong*
  ("Lifebridge Men", 0.99, against Quay Church's 0.97). `church_link_candidates()`
  hands the ambiguous ones to a person. Don't replace that with a heuristic.
- **And an unambiguous link can still be wrong, which is what `0090` is for.**
  The guard above stops a CHOICE the server can't make; it says nothing about a
  lone candidate that is simply mis-named, and no positional rule can — the
  building is right and the name is not. The first production run renamed
  Lighthouse Charlottesville to "Hyphen Lighthouse" on exactly that shape.
  `set_church_name(id, name, true)` sets `name_locked`, which every refresh and
  every `join_church` honours; it locks the NAME only, so address and city still
  fill in. And `church_name_key()` means a refresh fires on a changed name
  rather than a changed spelling — without it the same run moved the app's
  biggest congregation from "Saint" to "St." for nothing.
- **A hand-added `geo:` church is never touched**, by either function. Somebody
  typed that name themselves, and it is pinned at the *player's* position rather
  than the building's — so proximity means nothing for it.

OSM is still the fallback wherever the index has no rows, because the index is
loaded a region at a time and an empty picker is a dead end. Anywhere the index
answers, Overpass is never called — which also removes the slowest and least
reliable network call in the app.

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

The buildings are Nano Banana paintings now (`art/church-buildings.json`, a
`building` art kind: keyed cut-out at skin resolution, landing in
`public/church/`), reference-chained like the starter set so the four material
languages can't drift — classic grows tier over tier as the master line, and
every other skin leans on its own previous tier for material and on classic's
same tier for architecture and scale. This overturned a written decision, and
both of its reasons died on inspection: 32 images stopped being a cost when
the art pipeline landed, and 44px legibility was CHECKED on the real board row
rather than assumed — all four skins stay separable at a glance at 44px, which
is the fact that made the reversal safe. Two scars from the batch: the very
first render (the only one with no reference to steer it) drifted to a
three-quarter view, and the modern skin's pale walls twice lured a white
backdrop past the magenta instruction — both re-rolled with the instruction
hardened against exactly what came back.

**The drawn Kit is the fallback, not a leftover — do not delete it.**
`ChurchArt` resolves `church_<skin>_<tier>` through `GENERATED_ART` and falls
to the kit for anything missing, and the key goes through `kit.skin.id`, so an
unknown skin, a null and an undrawn `custom` all reach the default's render by
the same road they reached its drawing. The kit's `Ground` ellipse stays under
the render either way (a keyed building floating over a board row reads as a
sticker), and the palettes in `skins.ts` still feed it. Still flat fills and no
`<defs>` in the kit — same reason as ever.

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

Anything planted can be **picked up and dragged anywhere on the lawn**, or
tapped onto another plot (which trades places, so no tap loses a plant), or
taken out with the ✕ on its ring. Only your own church tab passes
`floraEditing`; a bed you can move in somebody else's yard is exactly what the
church-page rule forbids.

**The plot became a row key, exactly as the keep's anchor did in 0083.** A
planting stands wherever its value says and falls back to its plot when the
value carries no position, which is what keeps every bed planted before `0084`
standing where it always did. The wire format is the SAME grammar the two rooms
use — `yard_ivy~x412y188`, written by `packPercent`/`unpackPercent` — with the
integers in **tenths of a percent** (41.2% across, 18.8% up from the bottom),
because the yard is HTML positioned in percent rather than a viewBox and a lawn
that stretches with the phone cannot store pixels. `scripts/check-placement.mjs`
(in `npm run build`) runs the real packers against the real regexes out of
migrations 0083 and 0084, because the failure mode when they disagree is
invisible: the client updates optimistically, so the plant moves on screen and
the RPC quietly raises `bad flora`.

Free movement clamps into `YARD_BAND`, whose top is the line the building's base
sits on — so nothing can be dragged into the sky or onto the roof — and whose
sides stop short of the frame, because the art is cropped tight and centred on
its point (a hedge is half again as wide as it is tall). **A plant is sized by
where it STANDS, not by which plot it is filed under**: drag a sapling to the
front of the lawn and it grows, or the yard stops reading as a yard.

**`draggable={false}` on the plant and statue `<img>`s is load-bearing.** A
plant is a raster where one has been generated, and an `<img>` starts a NATIVE
image drag — the browser cancels the pointer stream to do it, so the first
pointermove of a real drag arrived as a `lostpointercapture` and the plant
simply refused to move. The two rooms never hit this because their props are
SVG. Found by driving the real yard.

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
- **And any member may MOVE one, which is the same rule rather than a new one.**
  `ChurchStatues` refused editing outright until `0084`, on the grounds that two
  members dragging the same trophy around each other's screens is a fight over a
  shared object. What that missed is that any member could already swap or take
  down any statue, so where it stands is a smaller version of a decision the
  congregation already shares — and nothing new is exposed by it: no name, no
  count, no who-moved-it. Only your own church tab passes `statueEditing`; a
  visited yard has no editing prop at all, so it is inert by construction. A
  statue that REPLACES one already standing keeps its spot, the way a finer
  piece upgrades in place in the two rooms.

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

- **Quick match is the queue that landed in front of it, exactly where that was
  predicted to go.** One button on `/battle/live` puts you in a Realtime presence
  roster with everybody else looking; the pair is derived from that roster on
  every device (longest-waiting proposes, one pair at a time) and settled by an
  offer → accept → confirm handshake, then both are handed the same room code —
  so from that second on it IS a room-code match and `store/live.ts` did not
  change. **Still no table and no migration**: nothing outlives the search, and a
  closed tab is a vanished presence, which is the whole of the abandonment
  handling. Three things are load-bearing. The third message is not ceremony —
  with two, an offer crossing another offer strands one player alone in a room
  the other never entered. **It adds no comparison**: no rating, no bracket, no
  queue position, no skill matching, and the only number on screen is how many
  people are looking (a number about the room, never about a person) — a rating
  would rank people and would then want a table to keep it in. And the EMPTY
  lobby is the state that matters, because it is the usual one: the search keeps
  running, and after 20 quiet seconds the screen says so and offers the two doors
  that always work (a room code, and the async battle). `store/liveQueue.ts`.
- **A navigation that states which side you are beats the remembered host flag.**
  `va.live.host.<code>` is a refresh fallback; two tabs of one browser share
  `sessionStorage`, so both halves of a quick match used to arrive as 'host', and
  `store/live.ts` drops every message from a player wearing your own role — two
  people in one room, each told nobody had joined.

Online-only, inherited rather than chosen — the `store/washing.ts` break with the
two-mode invariant. A local live battle is a person racing themselves, which is
what `/battle/cpu` already is. The room code is still the right shape for two
people who already know each other (a code can be read out loud on a stream);
quick match is the door for the case where there is nobody to send one to.

## What a battle pays, and the two skins only a live one gives

Every battle in this app paid **nothing** until `0086` — not the async
challenge, not the room code, not quick match. That was survivable while the
only door was challenging somebody you know; quick match put a stranger one tap
away, and a mode you can play all day for no reward is a mode people try once.

**The grant lives inside `create_battle` and `submit_battle`, and that is the
whole design.** Those two are what every battle path already goes through — an
async challenge, a broadcast link, the welcome battle, a room code and a quick
match all land there — so there is one choke point rather than five call sites,
and the baked `dist` in every already-approved iOS build starts paying the moment
the migration is applied, with no submission. Same argument first light's
`submit_play` write makes.

- **10 XP, three a day**, so 30 against a daily drop's 30-60 — the ceiling
  praying has, and a battle is a whole five-question run. The per-battle half of
  the cap is the PRIMARY KEY `(user_id, battle_id)`, so a resubmit or the guest's
  poll landing twice pays nothing; the per-day half is a count taken under a row
  lock on the profile, so two battles finishing together can't both spend the
  last slot. `todayLocalDate()` clamped +-1, the house pattern.
- **WHAT IS PAID FOR IS TURNING UP, NOT WINNING, and that is the line that
  matters.** `award_battle_xp` never reads a score: the winner and the loser are
  paid the identical 10 XP, and both result screens say so in the same words. If
  a future session pays the winner more, `xp` — the worldwide leaderboard (0006)
  — becomes a battle ladder and losing starts costing something, in an app whose
  whole rule is that it doesn't. Don't.
- `award_battle_xp` is **not client-callable** (revoked from `public`, `anon`
  AND `authenticated` — the 0052 scar) and refuses a battle the caller isn't in,
  so even an undone revoke buys nothing that playing wouldn't.
- Participation is recorded **whether or not it pays**, because `battle_plays` is
  also what the skins below count: a ceiling that stopped counting would freeze a
  player's progress toward a cosmetic on the day they played most.

**Jonathan (3) and Deborah (15) are earned by playing LIVE battles**, counted on
`profiles.live_battles` — server-written, only ever going up, so a bad week can't
take one back. Three things about them are load-bearing:

- **The counter is battles PLAYED, never won.** Somebody who lost all fifteen
  wears Deborah exactly as somebody who won all fifteen, and the locked tile says
  "win or lose, they all count" rather than leaving anyone to guess. A skin you
  can only get by beating people is the trophy this app doesn't hand out.
- **`live` is set once, by the host, on the battle row** (`create_battle`'s
  `p_live`). The guest never sends it — `submit_battle` reads it back off the row
  — so the two devices can't disagree about what kind of match it was, and no
  client can relabel async battles to farm the counter.
- **`live_battles` is on the profile and nowhere else.** Not on
  `get_player_card`, not on any board. It rides there because `skinOwned` can
  already read a profile field the way it reads `shared_days`; a count of matches
  drawn beside somebody else's is one step from the ladder above.

The art is Nano Banana like everything else (`art/skins-live.json`), and both
figures are deliberately un-martial: Jonathan holds his bow **pointing down**
with his other hand out in greeting, Deborah carries a palm branch. They are two
people who went out to MEET somebody — which is what a live battle is — rather
than two people who beat somebody. Jonathan's first render came back an almost
entirely white image (the magenta instruction ignored, the failure the church
skins hit twice); it was re-rolled with the prompt hardened against exactly that
and every pale garment on the figure recoloured.

### Two kinds of round: verse or trivia

Every battle used to be one shape — a verse, four questions about it, a bonus
about its book. Since `0094` the person starting one picks: **verse** as it
always was, or **trivia**, five questions about one book of the Bible read over
a verse from that book (the daily trivia round, dealt from a battle seed).

`battleVerse(seed, mode)` is the whole engine and every path goes through it —
an async challenge, a broadcast link, the welcome battle, a room code, a quick
match and a CPU race. Four things are load-bearing:

- **The mode is a COLUMN, not something folded into the seed.** Encoding it in
  the seed would have shipped no migration at all, and would have silently
  re-dealt EVERY PENDING BATTLE: a challenge sent an hour ago stores only a
  seed, its opponent rebuilds the round from that number when they accept, and a
  client reading the same number differently hands the two players different
  questions under one score column. There is no version on a battle row to tell
  them apart and the failure is silent on both screens. So `mode` defaults to
  `'verse'` everywhere — the column, the RPC argument and `battleVerse`'s second
  parameter — and a one-argument call is byte-identical to what it always was.
  Verified by running the old derivation against the new one over six seeds
  including both ends of the range.
- **Live battles DERIVE their mode from the room** (`modeForRoom`), exactly as
  they derive the seed, and do not use the column for anything but the record
  written afterwards. A live match has no row until it is over and no
  announce-the-deal message by design; a host's choice sent to a guest would be
  one device deciding for two, which is the bug the rematch handshake was
  rewritten to close. It is also the only shape that works for quick match,
  where two strangers arrive with nobody in charge. `ModePicker` is for the
  surfaces where a person chooses; `ModeNote` states it where the room decided.
- **`modeForRoom` avalanches its hash before taking a bit, and that line was
  earned.** FNV-1a's last step is a multiply by an odd constant, so the result's
  LOW bit is just the input's low bit: incrementing the round flipped it every
  time, and every room in the app produced one of exactly TWO sequences
  (verse/trivia/verse… or its inverse) — unbiased across rooms, and still wrong,
  since one round told you every future one. Found by running the real function
  over three hundred room codes, invisible in the diff. murmur3's fmix32 fixed
  it; all 64 six-round patterns now appear.
- **A mode is a flavour, not a difficulty.** It changes which questions are
  asked and nothing else: scoring is untouched, `award_battle_xp` still never
  reads a result and pays winner and loser the identical 10, and no board
  separates a trivia win from a verse win. Two ladders is the thing this app has
  trouble enough with at one.

### The crusades set: the one cosmetic earned by winning

Four figures from 1095–1291 — Francis of Assisi, Hildegard of Bingen, Thomas
Aquinas, Melisende of Jerusalem — earned at **5 / 10 / 15 / 20 battles WON**,
live or async. King Baldwin is from the same century, which is why they sit next
to him rather than on a shelf of their own. `0087`, `profiles.battle_wins`.

**This narrows the rule this file states absolutely**, so the argument is written
down rather than left to be re-derived — and note it is the OPPOSITE call from
Jonathan and Deborah one section up, which count battles played on purpose. It
was made deliberately by the app's owner. What keeps it inside the fence:

- **A battle already has a winner, and this app has ranked people by wins since
  `0020`.** `battle_leaderboard` and `battle_denomination_board` both order by
  wins desc and always have. This hangs a look on a number that has been public
  and ranked for eighty migrations; it does not bring ranking to a clean surface.
- **Nothing is taken from the loser.** `battle_wins` only goes up: no rating to
  fall, no streak to break, no rung to slip down, and still **no losses column
  anywhere in the schema**. A player who never wins is exactly where they began.
- **The XP stays blind to the result.** `award_battle_xp` still never reads a
  score — winner and loser are paid the same 10. `xp` is the number that ranks
  people (0006), and it must stay unmovable by beating anybody. A look is not
  standing, and that distinction is the whole load-bearing line here.
- **The ladder is never drawn.** A locked one shows `🔒 ⚔️` and nothing
  countable — no "3/10 wins" bar to grind against, because a screen where you
  watch yourself being behind is the thing this app doesn't build. The number is
  spoken exactly once, in the toast that says you've earned it.

**The unlock notification diffs rather than being told, and that's forced.** The
winner of an async battle isn't holding their phone when their battle completes
— the opponent's submit is what decides it — so there is no call on their device
to hang a reward off. `store/skinUnlocks.ts` compares what's owned now against
what this device last saw, catching both sides and catching the challenger
whenever they next open the app. **Priming is the trap and it is handled**: a
device seeing an account for the first time records silently, or `0087`'s
backfill would announce four skins at once to every long-time player. Toast is
`SkinUnlockToast`, mounted once in `App` like `StudyDropToast` and for the same
reason.

Every figure is deliberately un-martial — the peacemaker who crossed the lines at
Damietta, the abbess with her psaltery, the scholar with his book, the queen
holding the psalter she commissioned. None carries a weapon and no prompt
mentions a crusade: the era is the setting, not the subject. That is a content
decision worth keeping if the set ever grows.

## Book trivia: rounds of its own, and not a seat in the daily run

`generateQuestions` derives every question from ONE `VerseSeed` — which book,
who spoke, who was addressed, before, after, two fill-in-the-blanks, the theme,
the reference. Nine shapes, all answerable off the card the player just read.
That teaches verse attribution well and **structurally cannot ask what happens
in a story**: a narrative question needs the narrative, and a seed only knows
about itself. So a daily player meets the same nine shapes forever.

`data/bible/trivia.ts` is the second question source: 406 questions about the
BOOKS, keyed by book name, six minimum for every one of the 66.

**It briefly took the last slot of every run, and it has been taken back out.**
The daily drop asks five questions about the verse again — all five — and the
same is true everywhere `generateQuestions` reaches: practice, replays, focus
drills, CPU races and verse-mode battles. The argument for removing it is the
one that put it there, read the other way round: the combo multiplier peaks on
question five, so that slot is the most valuable one in the run, and the daily
drop is the one place in this app that teaches a SPECIFIC VERSE. Spending its
best slot on a fact about the book was spending it on something else. Trivia did
not shrink when it moved — it has two rounds of its own (`/play/trivia` and
`/study/trivia`) and a whole battle mode, all of which are a better home for it
than one seat inside a run about something else.

**Removing it RESTORED the historical deal rather than re-dealing it, and that
was designed in from the start.** The bonus was appended AFTER `verseQuestions`
was already shuffled, so it consumed rng nothing else was waiting on. Dropping
the call therefore leaves questions one to four untouched and puts back, in slot
five, exactly the question the generator produced before trivia existed —
checked by running both derivations over 400 dates rather than reasoned about
(identical Q1–Q4, every Q5 a verse question again, no short runs), and the daily
and library trivia ROUNDS came back byte-identical because they draw before
`buildDailyVerse` runs. **If a bonus question is ever wanted back, it goes on
the END for that reason**, or every run in the app's history re-deals.

`bonusTriviaFor` is still in `trivia.ts`, unwired and labelled as such, because
it is the only thing that builds a single bonus question and putting one back
should stay a line rather than a rewrite.

Three things about the trivia DATA are load-bearing, and none of them changed:

- **A wrong answer still teaches**, the same `teach` line a verse question
  carries. That is the whole reason trivia — a pub-quiz mechanic, the format
  most likely to make somebody feel stupid — can exist in this app at all.
- **Narrative only, inside the shared 66-book canon.** No doctrine, no
  canon-count ("how many books are in the Bible" has two right answers depending
  on who is asking), nothing distinctive to one tradition. Denominations here
  are factions the app deliberately never ranks, and a question a Catholic and a
  Baptist answer differently would quietly make one of them wrong on their own
  church's tab. People, places, events, order, and numbers that are IN the text.
- **It fails closed, per book.** No trivia for a book ⇒ a round falls back to
  drawing across the whole Bible rather than rendering empty. Nothing here can
  leave a run short.

**The failure modes all render perfectly**, so they are a build failure:
`scripts/check-trivia.mjs` (in `npm run build`) checks coverage of all 66 books,
the six-per-book floor, four distinct options, a valid `answerIndex`, a real
teach line, a prompt that asks something, no duplicate id or prompt, and no
prompt containing its own answer. `checkTriviaData()` asserts the same at import
in dev, re-derived rather than shared — and *that* is not academic: the two
disagreed on the first real run, because the in-file one stripped digits and so
read "Psalm 23" as "psalm", flagging five good questions. Found by opening the
app, not by reading the diff. **Keep digits in any normalisation here.**

`MIN_TRIVIA_PER_BOOK` is 6 rather than 4 because the library lends a FIVE-question
round from a single book, and a book with four cannot fill one without repeating
itself inside one round. The checker asserts that relationship rather than the
number, so raising the round size fails the build instead of silently repeating.

**And the day's own round is the second box on the Play tab** (`/play/trivia`,
`features/daily/DailyTriviaScreen.tsx`, `dailyTriviaFor` in
`data/bible/questions.ts`). Five questions about ONE book, the same book and
the same five for every player on a date — what the daily drop's bonus question
grew into, sitting level with the verse rather than inside it.
Nothing in it is invented: the book rotation is `getVerseForDate`'s no-repeat
shuffle under its own seed (`'trivia-order-v1'` — a history seed, so changing
it re-deals every past and future day), the questions come from
`triviaRoundFor`, and it is anchored on a real pool verse from that book, which
`QuizRunner` reads first and the recap hands back.

Three things about it are load-bearing:

- **It pays what a study run pays and nothing else** — a relic roll and a
  `study_run` step on the road, both from `QuizRunner`'s `studyDrop`. **No XP,
  no points, no standing, and no migration.** `xp` is the worldwide leaderboard
  (0006), so a second daily XP source sitting beside the verse is a decision
  that needs a server-counted, server-paid, capped grant and its own argument —
  not a client-side one bolted onto a box. Read the header in
  `store/dailyTrivia.ts` before adding one.
- **The rotation is over books the VERSE POOL can anchor**, not over all 66. A
  book with trivia but no pool verse would hand the anchor back to "any book"
  and ask about Obadiah over a verse from Luke. Fails closed like everything
  else here: no eligible book at all ⇒ a whole-Bible round.
- **It carries a `runId` (`daily-trivia:<date>`), and that is not decoration.**
  The day's five are the same five for everybody, so walking out of a round
  going badly and restarting it is a retry with the answers known — exactly what
  `QuizRunner`'s lock exists to close. Verified by driving it: a reload mid-run
  comes back to the question it left, with that question's clock still running.

Which day is done is **device-local in both modes** — the deliberate break
`store/crossword.ts` and `store/looks.ts` make, and for the same reason: the
flag grants nothing (everything a round pays is capped elsewhere) and the half
of a round that is really a record — the verse, marked studied — already
follows the account through `store/bible.ts`.

**The flag carries the day's numbers now** (score, correct, total), and the box
on the Play tab shows them exactly as the drop box beside it does — a round that
ends with no record of how it went reads as though it didn't count. It is
**today's round only**: no best, no history, no total, and the entry is written
once, so a replay can't rewrite it into a personal best to beat. A day recorded
before the numbers were kept stores a bare `true` and still reads — don't drop
that shape, the map lives on people's devices. Still no XP and still nothing
rankable; the numbers never leave the device.

**The library round is the same questions, five at a time** (`/study/trivia`,
`features/study/TriviaRoundScreen.tsx`, lent by Tabitha like everything else in
Study). It is **anchored on a real verse** from the chosen book, which
`QuizRunner` reads first and the recap offers to keep — the arcade's rule that a
machine playing a verse hands the verse back, for the same reason: a round of
Bible facts with no scripture on screen is a pub quiz. It pays what a study run
pays (a relic roll, a `study_run` step, the verse marked studied — all inside
`QuizRunner` via `studyDrop`) and **no XP and no standing**, so it inherits
Study's rank-free rule rather than needing an argument of its own.

**The pill naming the bonus is suppressed when EVERY question is one.** It marks
the question that is different from the rest; in the library's all-trivia round
nothing is different, so it was just restating the run's own label on all five
screens. Both that and the read-phase copy are derived from the questions
themselves rather than passed in — a prop would let a caller describe a run it
did not build.

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

## First light: the day belongs to whoever opens it

The first person to open a day's verse holds that day's **first light**, and
every account that opens the same verse after them pays them **1 XP** — minted
by the server, never taken from the follower. Their player card sits under the
daily drop on the Play tab. `0081`, `data/firstLight.ts`, `store/firstLight.ts`,
`features/daily/FirstLight.tsx`. Full design: `docs/FIRST-LIGHT.md`.

A "first" mechanic is the obvious way to break the no-losers rule, so the things
that keep it inside the rule are in the **shape of the data**, not in copy:

- **One person is named and NOBODY has a position.** No second place, no "you
  were 400th", no ordering of a day's openers anywhere. `daily_opens` is read as
  a count and as a primary key — never as a sorted list — and `first_light()`
  returns one holder plus two counts about the day. The data needed to build a
  "who got here first" ladder is never sent to a client, the same guarantee the
  rivalry's payload shape gives.
- **It's a day, not a ladder.** It resets at midnight and nothing accumulates:
  deliberately no lifetime "dawns held" number, no badge, no title, **no Journal
  rung** — the same argument `record_prayer` makes for having no prayer streak.
  A rung you climb by getting up earlier is a rung people would get up earlier
  to climb, and this app should not be handing anybody a reason to set a 4am
  alarm.
- **The XP is bounded the way the Basin's is**, because `xp` is the one number
  here that ranks people (0006): 1 XP per follower, **60 a day** (about one
  daily drop, `FIRST_LIGHT_XP_CAP` ↔ the SQL — the usual keep-them-in-sync
  pair), once per account per day by the primary key, never to yourself, and the
  ceiling is applied inside the same statement that pays under a row lock so two
  followers landing together can't both spend the last point. Followers are
  still counted honestly past the ceiling, so the card can say "1,400 have
  followed you in" while the XP stops at 60.
- **Guests count in the pulse and pay nothing.** `record_guest_open` takes a
  client-generated device id, so paying for guest opens would let a holder mint
  the whole ceiling out of invented uuids. It takes real accounts, which is the
  same natural limit `wash_feet` leans on.

**Opening the verse is opening the screen that shows it** — `QuizScreen` calls
`open_daily_verse` on mount, the only place in the app the day's verse is read.
`submit_play` records an open **too**, and that isn't redundancy: `ios/` ships a
baked `dist`, so every already-approved build finishes a drop without ever
calling the new RPC, and this is what keeps those players counting toward the
day. The primary key makes the second write a no-op and only a *fresh* row pays.

**The timezone caveat is real and is written down rather than glossed.** A
`drop_date` is the player's LOCAL date, so a date begins in Kiritimati ~26 hours
before it begins in Honolulu and the far east reaches each verse first. This
deliberately does NOT follow the rivalry's break to UTC: the rivalry is two
institutions needing one clock, while the daily verse is one person's ritual and
every table around it (`plays`, `guest_opens`, `presence_events`) is keyed on
that local date — a second date system in the daily tables is the exact mistake
0074 had to undo. The ceiling is what keeps the caveat small.

Online-only, inherited rather than chosen — the `store/washing.ts` break with the
two-mode invariant. "First" needs everybody else to be first *of*: offline there
is one player, so the lantern would be claimed every day by the only person
there and the XP would be client-granted, which is the one thing the safety
argument rests on not happening. A guest can still SEE the holder (`first_light`
is granted to `anon`) and that's the pitch for the account. The card **renders
nothing** with no keys or against a server without 0081 — the unclaimed state
would otherwise announce that nobody has opened a verse somebody is holding.

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

The latest is `0099` (the Prayer Wall — `prayer_requests`,
`prayer_intercessions`, and the deal / kneel / report / admin RPCs), APPLIED
on 2026-09-03 through the Supabase MCP as `0099_prayer_wall` and verified: the
four helper functions' ACLs read `{postgres=X}` only (they were `revoke all`ed
from public, anon AND authenticated — the 0052 lesson), and the ten player and
admin RPCs carry `authenticated`. Before it was applied it was run end to end
against a local Postgres 16 with a stub `profiles`/`buddies` schema: the line
is cleaned, church-mates and buddies see it and a stranger does not, the cap
pays twelve and records fourteen, and the report round-trips through
`admin_resolve_prayer_report`. **It took 0099 because `0098` was already
`0098_card_about` on main and in production** — the same-day collision this
file keeps warning about, caught by `list_migrations` before the apply rather
than after.

Before it, `0098` (what the card says about you — `favorite_verse`,
`favorite_book`, `favorite_translation` on `profiles`, `set_card_about`, and
`get_player_card` restated from 0071 to carry the three), APPLIED on 2026-09-03
before the client merged, and verified: production's `get_player_card` was
byte-identical to 0071 before the restate (checked, not assumed), all three
columns exist, exactly ONE `set_card_about` signature, its ACL is the house
`authenticated` shape, `get_player_card` returns seventeen keys including the
three new ones against a live row, and the reference regex matches every
citation form the pool writes and refuses a sentence. It is additive and fails
closed either way: a server without it leaves the card exactly as it was (the
modal reads three keys an old `get_player_card` simply omits). The three
catalogs in it (66 books + the two citation spellings, 14 translation codes)
must match `data/cardAbout.ts` and `BIBLE_BOOKS` name for name.

**Migrations are applied by the session that writes them, not handed back.**
The app's owner asked for this outright ("apply migration automatically every
time"), so the rule is: write the migration, run it against a throwaway local
Postgres if one is available (`/usr/lib/postgresql/16/bin`, as a non-root
user, with a stub of the tables it touches), then `list_migrations` on the
live project to pick the number production will actually record, apply it
through the Supabase MCP (`apply_migration`, project `visuppaucpzzigwtqmdd`)
BEFORE the client is merged, verify the ACLs with the `pg_proc` query below,
and record it here as applied with the date. "Apply the schema before merging
the client" now means the session does it, in the same PR.

Before it, `0097` (`tiktok_gemini_key()` — the TikTok engine's Gemini key
read out of Vault, service_role only), APPLIED on 2026-09-03 and verified: the
ACL reads `{postgres,service_role}` and the function returns the 53-character
key. The key itself was written with `vault.create_secret` from a SQL console
and is in no file; the `tiktok-gen` Edge Function (deployed the same day,
`verify_jwt` on like `push-send`) prefers a `GEMINI_API_KEY` function secret
and falls back to this.

Before it, `0096` (the Cornerstone avatar border — the third piece of the
patron look, gated on the PACK rather than a streak), APPLIED on 2026-09-03
before the client merged, and verified: the `cosmetics` row exists, exactly ONE
`set_cosmetics` signature carries the pack gate (checked BEFORE the streak gate,
since the row's `req_streak` is 0 and must not be reachable by streak alone),
and the ACL is the house `authenticated` shape. `set_cosmetics` is restated
wholesale from 0023 there; the next migration that edits it copies forward from
0096, not 0023.

Before it, `0095` (the founding patron becomes the rock — `cephas` replaces
the whale, plus the Cornerstone card), APPLIED on 2026-09-02 before the client
merged, and verified rather than assumed: the protected list in
`enforce_skin_entitlement` reads THIRTEEN names (0088's twelve plus `cephas`,
checked name by name — the wholesale-restate trap this file warns about);
`fulfill_skin`'s ACL still reads `{postgres,service_role}` after the replace,
with `whale` kept in its allowlist so a late webhook retry still settles;
`set_card_background` gates `patron_cornerstone` on owning EITHER patron skin;
and the backfill granted `cephas` to every `whale` holder (one account, no
`whale` left without it) through `grant_skins`, so the Sales tab shows no
`manual` row for it.

Before it, `0094` (battle modes — verse or trivia), APPLIED on 2026-09-01
and verified: exactly ONE `create_battle` signature after the drop-and-recreate,
so no stale seven-argument overload survives for PostgREST to resolve an old
client's call to (the 0086 scar, checked rather than assumed); all 409 existing
battle rows read `mode = 'verse'` with none null; the check constraint is
present; and `battle_json` returns the key for a historic row.

Before it, `0093` (`daily_players` — who has played today), APPLIED on
2026-09-01 and verified rather than assumed: exactly ONE signature, so no stale
overload survives for PostgREST to resolve an old client's call to; `prosecdef`
true and the ACL reads `{=X,postgres,anon,authenticated,service_role}` — the
deliberately-public shape `get_daily_pulse` and `first_light` have, not the
locked-down `grant_skins` one, because a guest seeing the day is populated IS
the pitch. And the part worth checking by running it: against live data the
payload's player keys are exactly `username, avatar_emoji, avatar_character,
avatar_border, avatar_badge, denomination, is_me` — **no score, no xp, no rank,
no per-person count**, so the "a crowd, not a ladder" guarantee is a fact about
the deployed function rather than a claim in its header. The client fails closed
either way: an unapplied 0093 makes the Play tab's count a plain line instead of
a button, never an error.

Before it, `0092` (church name locks) and `0091` (the church places index —
churches now come from our own Overture-loaded table instead of live
OpenStreetMap), both APPLIED on 2026-09-01. **606,272 US places are loaded**
from Overture release `2026-08-19.0`, and `link_church_places()` +
`refresh_church_names()` have been run. Runbook: `docs/CHURCH-PLACES.md`.

**Production knows those two by the numbers 0089 and 0090**, because two
branches were in flight the same day and both took 0089; the tree side was
renumbered to 0091/0092 when they met, which is the only cheap moment to do it.
So `schema_migrations` reads `0089_church_places_*` and `0090_church_name_locks*`
while the files say 0091/0092. That is expected — don't re-apply to "fix" it.

0092 exists because 0091 was verified against production and two of its renames
were wrong — read its header before touching the refresh, since both failures
look like successes from the code. The live state to know: Lighthouse
Charlottesville is `name_locked` (Overture calls it "Hyphen Lighthouse"), and
Quay Church in Windermere is still a hand-added `geo:` row, deliberately
untouched by either function.

Before them, `0089` (the growth tab's timezone lookup, resolved once instead of
per row), APPLIED on 2026-09-01 and verified: `admin_growth` read is 114ms where
it was ~13,900ms, so it clears `authenticated`'s 8s `statement_timeout` instead
of dying to it; `growth_today` and `admin_report_tz` are both plpgsql now, which
is the part that matters — a `language sql` function gets INLINED into the
caller's expression tree, and that is how a ~50ms `pg_timezone_names` scan ended
up in a per-row `Filter` on `profiles` (134 accounts x 2 scans = 14s). The
returned JSON is byte-identical, checked against hand-computed counts across
five zones including a bogus one and a day-ahead one, and `growth_today`'s ACL
still reads `{postgres,service_role}` after the `create or replace`.

**The lesson generalises past this function: never let `admin_report_tz` (or
anything else that scans a catalog SRF) land in a query predicate.** Take the
zone into a local variable at the top of a plpgsql function, the way
`compute_growth_metrics` and `admin_overview` already do. The failure is
invisible in the source and in the diff — it only shows in a query plan, and it
scales with row count, so it arrives as "the dashboard broke" long after the
commit that caused it.

Before it, `0088` (the "Light in the Darkness" creator-collab skin for Tyler
Talks 2 U), APPLIED on 2026-08-31 and verified: all TWELVE names survive in
`enforce_skin_entitlement`'s protected list — the wholesale-restate trap this
section warns about, checked name by name rather than assumed — the
`TYLERTALKS2U` code row is live, and `lantern` is deliberately absent from
`fulfill_skin`, so neither Stripe nor IAP can ever grant it.

Before it, `0086` (battle XP + the live-battle skins) and `0087` (battle wins
+ the crusades skins), both APPLIED to the live project on 2026-08-31, in that
order, and verified. **The order is not optional if they are ever re-run**: 0087
redefines `submit_battle` on top of 0086's version and calls `award_battle_xp`,
so running it alone leaves a function referring to something that doesn't exist.

What the verification actually checked, because "applied" is not the same as
"right": `award_battle_xp`'s ACL reads `{postgres,service_role}` — the locked-down
shape `grant_skins` has, not the `revoke from public` 0052 wrongly believed was
enough; there is exactly ONE signature each for `create_battle`, `submit_battle`
and `my_battle_xp`, so no stale overload survived the drop-and-recreate for
PostgREST to resolve an old client's call to; and 0087's backfill gave 28
accounts a win count off 225 completed battles, topping out at 62. A real player
finished an async battle four minutes after 0086 landed and was paid 10 XP from
an already-deployed client that sends no `p_local_date` — the "approved builds
start paying without a submission" claim, confirmed in production rather than
argued.

Before it, `0085` (erasure hardening — scrubbing the denormalised copies of
a username that no foreign key can reach, plus a prune for the pulse table),
APPLIED on 2026-08-31 and verified: the scrub clears a probe name from
`presence_events` and `guest_opens` in one statement, and
`prune_presence_events`'s ACL reads `{postgres,service_role}` — the locked-down
shape `grant_skins` has, not the `revoke from public` that 0052 wrongly believed
was enough.

Before it, `0084` (free placement in the churchyard — plants and monuments
stand where you drag them), APPLIED to the live project on 2026-08-31 and
verified: the shared value grammar parses every form the client writes, refuses
every malformed one, and all 18 existing planting rows still validate.

**Both 0083s and both 0082s exist**, because two branches landed the same week
and git merged four files silently on differing names: `0083` is BOTH free
placement in the two rooms (+ tiers as their own unlocks) and the Study
library's card; `0082` is BOTH six more churchyard plants and the Porchlight
creator-collab skin. All four are applied. Before them, `0081` (first light —
who opened the day's verse first) and `0080` (today / this week / all time on
the church board), both also applied; then `0079` (a church claiming its own
page), `0078` (a church's ask for a sponsored slot) and `0077` (the slot
itself). Before them, `0075` (the weekly church rivalry) and `0074` (the admin
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
`0059` twice (`keep`, `practice_uncapped`), `0074` twice (`admin_local_dates`,
`public_church_page`), `0081` twice (`first_light`, and the Study library's
card, which was applied to production under that number and renumbered to
`0083` in the tree when the two branches met), and — from that same collision —
`0082` and `0083` twice each — and now `0089` twice as well (the growth tab's
timezone fix landed on main while the church places index was in flight on a
branch; the branch side became 0091, and its follow-up burned 0090 in
production only). So the next free number is `0100` (0099 is taken by the Prayer Wall, 0098 by the card's About field on main, 0097 by the TikTok engine's Vault key, 0096 by the Cornerstone border, 0085 is taken by erasure
hardening, 0086 by battle XP, 0087 by battle wins, 0088 by the lantern skin,
0089 by the growth timezone fix AND by church places as production recorded it,
0090 by the name locks as production recorded them, 0091 by church places in the
tree, 0092 by the name locks in the tree, above, 0093 by `daily_players` — who has played
today — 0094 by the battle mode, and 0095 by the founding-patron rock),
and this
sentence has already gone stale twice: it said "0076" while 0077, 0078 and 0079
were sitting in the folder. `ls supabase/migrations | tail -1` is the answer — on ORIGIN/MAIN, not your
working tree: two branches in flight both took 0080 and 0081, and git merged
the four files silently because the names differed. The unmerged side was
renumbered 0082/0083 at merge time, which is the only cheap moment to do it —
and doing it in the TREE rather than in production is why a number can be
burned twice: this line is only a record of which ones were. And
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

A cabinet stands in your own Upper Room, and the home screen's "In the meantime…"
card is the same machine again — offered only once the day's verse is done.
Tapping either opens `/arcade` — a wall of machines you pick from. Three today:
Manna Rush, Word Catch and the Cross Word. Full design: `docs/ARCADE.md`.

- **The doors are counted deliberately, and the count is the design.** The
  cabinet stood in the keep's hall and the churchyard too, and both were
  removed: those are the FACTION'S room and the CONGREGATION'S yard, and a
  games machine wheeled into somebody else's shared space reads as an
  advertisement standing in it. `KeepScene` and `ChurchScene` no longer take an
  `onArcade` prop at all, so a future surface can't quietly grow one back by
  passing a callback. What remains is the cabinet in the Upper Room — the room
  that belongs to the player alone — and **the compass's invitation list**,
  which is where the Play tab's old "In the meantime…" card went when that tab
  was cut back to four things (see the header in `features/home/HomeScreen.tsx`).
  The offer did not get quieter: the compass sits on the Play tab, glows gold
  while anything is open, and "The arcade is open" is the last row in it —
  which is the same "when there is nothing else to do" placement the card had,
  made once instead of twice.
- **The cabinet opens the LOBBY, not a game.** It used to open Manna Rush
  directly, which was right when there was one game; with two, a door that
  always led to the same machine lies about what's behind it, and a second
  cabinet in every scene turns a little world into a shopping street — the same
  instinct that took it out of the other two. The machine's little screen runs
  an **attract cycle** through the games so it can't promise the wrong one
  (reduce-motion holds the first frame).
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
- **Word Catch's first run is today's verse and every run after it is a
  different one.** `TapGameScreen`'s `onDeal(run)` is the seam — it fires as a
  run begins, BEFORE `playing` flips, so the new `game` and `surface` are on the
  component by the time `TapRunner` remounts on `runs`. Run 1 stays the day's
  shared verse, because that is what makes a share link mean anything; "Play
  again" draws from the whole 726-verse pool, because re-reciting the verse you
  have just finished reciting is the least this machine can teach. It is called
  from a ref rather than inside the `setRuns` updater: a state updater is not a
  safe place for a side effect, and StrictMode invoking it twice would deal two
  verses and show the second.
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
  against your own bar with no way to set them beside anybody else's.
- **A run pays a drop roll, road progress, and — since `0084` — 5 XP for the
  day's FIRST run on each machine.** That last one narrows a rule this file used
  to state absolutely ("never XP"), so the argument is written down in
  `docs/ARCADE.md` and in the migration rather than left to be re-derived. The
  part that was doing the work is untouched: **what is paid for is turning up,
  not doing well** — forty flakes and four are worth the same 5 XP, nothing on
  the paying path sees a score, and no run can be behind another. The rest is
  the library's own safety argument (0083) copied deliberately, because `xp` is
  the worldwide leaderboard (0006): the server counts and pays, the client never
  sends an amount, and the cap is the PRIMARY KEY `(user_id, game_id,
  played_on)` rather than a count. **The SQL's fixed list of paid game ids IS
  the ceiling** — three machines × 5 XP = 15 a day against a daily drop's 30–60
  — so a new machine that should pay needs a migration, on purpose. A free go
  from a shared link still pays nothing, and nothing anywhere counts runs or
  days: no streak, no total, no rung.
- **The paintings are backdrops; everything live stays drawn.** `art/arcade.json`
  is a scene per machine — the wilderness under Manna Rush, the blank page under
  Word Catch, the workshop wall behind the Cross Word — laid OVER the drawn
  field, so an ungenerated build is the app exactly as it was. What must NOT be
  painted is the rule: a manna flake carries its meaning in motion (and a
  painted one couldn't be tapped), a word has to be placed, and the cross is
  re-cut per puzzle. Every prompt therefore says the ground/page/wall is empty
  twice over, because whatever the model puts there gets drawn over.
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
into them, with the verse both words came from read underneath. Fifty-two
AUTHORED ones ship and one of them is the daily; behind them `data/crossGen.ts`
cuts ~10,900 more out of the pool on demand, which is what you get once you have
built today's. `/arcade/cross`, a machine in the arcade above (it stood on the
Study shelf first, and `/study/cross` still redirects). Full design:
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
  it reshuffles history).
- **The daily is authored; everything after it is CUT ON DEMAND.**
  `data/crossGen.ts` takes any pool verse and finds every pair of its words that
  will stand as a cross, clued as a window of the verse with the answer blanked
  — ~10,900 of them against fifty-two written ones. The first visit on a date
  still gets `crossForDate()`, the same cross everybody else is building; once
  you have built it, both "Build another" and simply re-opening the screen deal
  a fresh one. **The screen used to reset to today's puzzle on every arrival**,
  which is what made a machine holding fifty-two crosses feel like it held one.
  The old rule that "Build another" may only draw from days already past was
  right when the authored set was the whole supply — drawing from days to come
  would have spoiled tomorrow's daily — and is now moot: there is no tomorrow to
  spoil. `pastCrosses()` stays as the fallback, so the button can never do
  nothing.
- **A generated cross is held to the AUTHORED rules and two more, and both extra
  ones came from playing it.** A clue window may hold exactly ONE of the two
  answers — blanking both gave two adjacent words the identical clue "… have
  ____ from the ____ that you must walk …" with no way to tell which blank was
  being asked for, so a pair standing too close together in the verse is simply
  not a pair. And neither clue may leak the other answer as a SUBSTRING ("a
  ransom for many" under an upright of MAN, "perfected" under PERFECT), which is
  the same strictness `checkCrossPuzzles` already applies to a clue's own
  answer. `checkCrossGen()` runs EVERY cross the pool can make through the real
  predicate at import in dev, and asserts 80% verse coverage — a generator gets
  one checker rather than the authored data's two on purpose, because
  re-deriving a *generator* in a build script is just a second copy of it to
  keep in sync. Its ids carry an `x:` prefix so the solved map can tell the two
  apart.
- **`built` has no denominator any more.** It read "3 of 52 built" when
  fifty-two was the supply; with crosses cut on demand a denominator is a bar
  that cannot be filled, which is the one shape this app doesn't put in front of
  anybody.
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

**The compass invites it once a day** — "Kneel and wash a friend's feet", open
until you have knelt for ONE person today, never "until your twelve are done":
a line that stays lit for a thing few people can finish is a quota, and the
compass going dark in the evening is meant to mean a finished day. Online-only
like the gesture (`mode === 'online'`), so a keyless build never invites it.

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

### Tiers are their own unlocks (merging is gone)

Fine and Grand used to be made by stacking duplicates. Since 0083 they are
their own rungs on the same challenge ladders — the same counter at 2.5× and
5× the base goal (`tierGoal` in `data/keep.ts`, `furnishingTierGoal` in
`data/room.ts`) — so a finer piece is still earned by playing and ownership
stays a pure function of the counters. The shelf offers the finest tier you
have earned; if a lesser copy is already out, the tap upgrades it IN PLACE,
keeping its position and size.

Three things to know before touching it:

- **The wire format did not change, and that is what kept 0062 intact.** The
  tier still rides the placement value as a suffix (`keep_woven_rug.3`), so
  the church offering's gate — "placed at Grand", read off that suffix — needed
  no migration, and every row written under the merge era still reads. Only how
  a player REACHES a tier changed.
- **A tier is a look, not a count**, still: nothing is spent, nothing granted,
  clearing a Grand piece and re-placing it gives Grand back (you earned it).
- **One copy per decoration.** The shelf refuses to stand a second copy;
  `planPickOn` returns `already` where it used to merge.

### Placement is free, inside a mount's band

A placement value may carry a position and size: `keep_woven_rug.2~x412y188s120`
(scene units; s is scale×100, clamped 0.7–1.4). The two halves are independent
— `~s120` alone, `~x412y188` alone — and entangling them shipped for about a
minute: a resize on a never-moved piece defaulted x/y to 0 and teleported the
mat to the corner. Found by driving the real app; the grammar lives ONLY in
`packDecor`/`unpackDecor` and is fuzzed against 0083's regexes.

The ANCHOR became a row key, not a location: it still bounds rows per player
and is still validated server-side, but a piece stands wherever its value says,
falling back to its anchor when the value carries no position — which is what
keeps every pre-0081 row rendering exactly where it always did. Free movement
clamps into per-mount BANDS (`Surface.bands`), so "put it where you like"
never becomes "hang the brazier from the ceiling". Resizing is deliberately
bounded: a rug scaled to fill the hall stops being furniture.

**0083 is applied** (2026-08-31, before the client merged — the order the
Supabase section demands). It relaxes both value regexes (`set_keep_placement`,
`set_room_placement`); against the 0060/0069 versions every reposition is
rejected as 'bad decor'.

### The picker is a shelf of pictures

Both worlds are furnished the same way, and neither has a list of names any
more: a grid of the actual objects, and **tapping one puts it where it
belongs** — the first free anchor of its mount, or the first free plot.

- **Tapping something already out at a lesser tier UPGRADES it in place**
  (`planPick` with the best owned tier). Already out at that tier → the tap is
  refused with a note, never a duplicate.
- **A full mount refuses and says so.** It never overwrites, because the hall's
  rule is that nothing you placed silently disappears.
- **The ✕ on a placed tile is the only way to clear one**, now that the
  per-anchor rows are gone, so it stays on the tile rather than behind a
  long-press.

`DecorThumb` (KeepArt) draws each piece for its tile. The viewBox is chosen per
mount because props are drawn around their GROUND POINT rather than centred — a
banner hangs down from it, a wall piece straddles it, a rug sits on it, and one
box for all three crops two of them.

### Anything placed can be moved, anywhere in its band — and resized

Tap a piece to lift it, then **drag it wherever you like** (clamped to its
mount's band; it stays held, so a nudge can follow a nudge), or tap an anchor
target to trade places. **Tapping anywhere else puts it down** — it stays where
it stands and stops being held. While held, a small bar under the scene resizes
it in 0.1 steps. `planMoveOn`, `planMoveToPointOn` and `planResizeOn` in
`data/placement.ts` are the choke points and the room copies them exactly.
Nothing is ever overwritten.

**A tap on open ground used to MOVE the piece there, and giving that gesture
back is the point.** It was how you positioned something before dragging
existed; once you could drag, it left the worlds with no way to let go by
tapping at all — you had to find the piece again or reach the Done button under
the scene, which is not what a selection anywhere else does. `onDropAt` is now
the drag's commit only, and `onCancel` is the tap.

**The crowd goes INERT while a piece is held** (`CrowdLife`'s `inert`, and the
churchyard also passes it whenever the Landscaping shelf is open). Figures are
27-42px, they wander on their own schedule, and one standing in front of the
thing you are arranging turned the tap meant for it into somebody's player
card — not a rare miss but most of the scene, most of the time. Inertness
rather than a second behaviour: a figure that answered an arranging tap would
be inventing a gesture, and a crowd is a picture of the place rather than a
control surface. The cards come back the moment you put the piece down.

**Dragging is only ever available on the piece you have already LIFTED, and that
is the whole reason it is safe.** These halls are 300-unit viewBoxes inside
scrolling surfaces, and for a long time that ruled dragging out entirely — a
grab anywhere on the picture fights the scroll. Selecting first is what makes
the two gestures separable: one tap says which object you are holding, and only
that object's pointer stream is taken. Every other pixel of every scene — the
floor, the walls, an unselected piece — still scrolls exactly as before, and
tapping is untouched (a drag inside a 4px slop radius is still a tap).

`lib/sceneDrag.ts` is the one copy of the mechanics, bound by both scenes. Three
things in it were learned by driving the real app and are invisible in a diff:

- **`touch-action: none` does NOT work on an SVG child** — it was set, read back
  empty, and the page scrolled out from under the piece. What actually cancels
  the scroll is a hand-registered NON-PASSIVE `touchmove` listener on the
  scene's `<svg>` that preventDefaults only while a drag is in flight (React
  attaches its own touch listeners passively, so it can't be done through JSX).
  Putting `touch-action` on the wrapper instead would kill scrolling over the
  whole picture for as long as anything is selected.
- **A finished drag fires a click**, which would otherwise read as "tap the
  piece" and put down what you just dragged. `consumeClick()` latches that one
  click; a drag that never left the slop radius does not latch it, so a tap
  still toggles.
- **The commit is one write, on release** (through `onDropAt`, the same planner
  the tap path uses). The position mid-drag is local preview state — writing on
  every pointer move would be an RPC per frame.

### The ✕ on a lifted piece takes it back out

A selected piece wears a small ✕ on its ring (`components/SceneRemoveBadge`),
and it clears that one placement. The shelf tile's ✕ still exists and still
clears every copy; this one is for the thought you have while looking at the
room, rather than making you find the piece again in a grid of eighteen.

Two things about it are load-bearing. It is drawn as the scene's LAST layer,
NOT inside the piece's own `<g>` — the move targets are drawn after the pieces,
so a ✕ inside the group sat under the target ring of the next spot along and
tapping it moved the piece there instead of removing it. And it marks itself
`data-scene-edit`, which `lib/postcard.ts` strips along with the dashed rings:
a ✕ on a picture somebody sends is a stray dark blob, and its `var(--gold)`
doesn't resolve in a detached document anyway.

Nothing is lost by it, which is why it can be one tap with no confirmation:
ownership is derived from lifetime counters that only go up, so a piece taken
out is back on the shelf at the same tier before the note fades. In a FACTION
hall the placements are a blend, so the ✕ refuses somebody else's piece and says
so rather than reporting a removal that didn't happen.

### A Grand piece can be given to your church

A decoration at Grand has nowhere finer to go, so it can be offered:
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

### What the card says about you

The player card carries three optional facts now — a favorite verse, a favorite
book and the translation you read (`0098`, `data/cardAbout.ts`,
`features/profile/CardAboutEditor.tsx`, the customizer's **About** pill). They
draw as ONE slim tile between the level bar and the six stats (`AboutStrip` in
`PlayerCard.tsx`): the reference on the eyebrow's own line, the verse under it
clamped to three lines, and the two short facts side by side under a hairline.
A card with nothing set is byte-identical to the card before this existed.

Three rules, and they are the whole reason a stranger's "about" can sit on the
one surface in this app where a stranger's words reach you:

- **Every field is a pick from a fixed catalog, never a string.** A verse is a
  REFERENCE — the text is rehydrated from `VERSE_POOL` exactly as favorites are,
  and a reference the arcade doesn't carry shows the reference alone — a book is
  one of the 66, and a translation is a code from `CARD_TRANSLATIONS`. The
  client normalises against the real shape of the Bible (`structure.ts`, so
  verse 40 of a 31-verse chapter is refused) and `set_card_about` re-checks the
  string's shape, the book and the code server-side, so no client can widen
  any of them. The three lists exist twice on purpose (the usual
  keep-them-in-sync pair); the migration header says which.
- **`CARD_TRANSLATIONS` is a DECLARATION, not a data source.** It deliberately
  lists the licensed versions people read at church (NIV, ESV, NLT…) that the
  app cannot show a word of, because "the translation you read" is a fact about
  a person. The chapter reader's `READING_TRANSLATIONS` stays what bible-api
  serves; don't merge the two lists.
- **None of it is a number, and none of it is counted anywhere.** No "12 verses
  kept", no rank of favorite books, nothing on a board. A favorite is a taste,
  and tastes don't rank — which is what lets this be public at all.

Two-mode for real: `setCardAbout` in `store/auth.ts` validates first (so a
guest gets exactly the refusal an account would), applies optimistically,
saves to `localdb` as a guest and rolls back on a server no online. The picker
searches the pool and pins the player's own shelf (`store/favorites.ts`) at the
top; the one escape hatch is a typed reference that IS a real verse but isn't
in the pool, offered as a row that says the reference alone goes on the card.
Verified by driving it: set all three as a guest, reload, all three survive on
the card and the page never scrolls sideways (the picker's rows hit the
grid-item `min-width: auto` trap first time out).

### Customizing is one shelf, not six

**A worn full skin hides the WHOLE "Your Character" section on the profile.** A
skin REPLACES the figure (`Character.tsx` renders its art instead of the starter
render), so while one is on, Figure / Skin tone / Hair are three controls you
can tap and watch do nothing — you change the tone and Moses doesn't move. It
used to hide only the rows and keep a header reading "always free" over the
worn skin; now `CustomizeSection` drops the section entirely: the hero above
already shows what you're wearing, and the Skins shelf says how to take it off.
`CharacterPicker` still has its own covered state (the "You're wearing X" line
and `onRemoveSkin`) for any surface that mounts it while a skin is on. Two
things about it: an **overlay** skin — the carried cross — layers onto your own
character rather than replacing it, so it keeps the section; and nothing is
dimmed or padlocked, because nothing here is locked — the character underneath
is untouched and comes straight back with the section the moment the skin comes
off.

**The front door picks a PERSON, not two colour charts.** `CharacterPicker`
takes `layout`: `'swatches'` (the profile — two rows of dots, for nudging a
character you already know) or `'tiles'` (both sign-up doors — the figure
toggle, then ONE swipeable row of all 36 tone × hair combinations drawn as the
actual figure, grouped by tone). The tiles are plain `<img loading="lazy">`
straight from `GENERATED_ART`, not `<Character>`: an SVG `<image>` loads whether
or not it is on screen, and 36 renders on the sign-up screen is two megabytes.
One scar: the row's wrapper needs `minWidth: 0` — a grid item's min-width is
`auto`, so the overflowing row widened the item to 2,596px and the whole page
scrolled sideways. Found by measuring, invisible in the diff.


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

**`TabbedSection` lives in `components/` now, not inside the customizer**, and
three surfaces use it: the customizer, the profile's "Your people" / "Your
things" rows, and the church tab's board / givers / buildings. The argument
above generalised exactly — a column of identical closed rows means the one you
want is always the last one — so it moved out rather than being copied, the same
choke-point rule `QuizRunner` and the little worlds follow. A pill may carry a
**dot** (somebody is waiting on you) and may never carry a **count**: the same
single, countless signal the bottom nav uses, because a number there turns a
wardrobe into a queue to be cleared.

Two applications of it are worth knowing before changing them. On the profile
the split into **two** rows is deliberate — people and things are different
kinds of thing, and one undifferentiated row of five would undo the very
distinction those headings were added to draw. On the church tab the **board is
the default panel**, so that tab opens looking exactly as it did: nothing was
folded away, two things were promoted to sit level with it. The board is why a
church can *join* the week rather than only climb it (see the three-windows
note above), so hiding it behind a pill by default would be a real change to
what the tab is for, not a tidy-up.

And the two page titles that used to head `/battle` and `/church` are gone: a
44px floating sword over the words "Bible Battle", on a tab you reach by tapping
a nav button labelled Battle, was ~130px of the first screen spent restating the
tap — and it pushed the gold primary action most of the way down a 390px phone.
Play and Study never had one. Church keeps its header only for the guest card
and the picker, where there is no hero to name the screen.

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
| The hall | its own section on `/battle`, and in the sheet | `KeepScene` |
| The churchyard | hero of `/church`, and on any church's page | `ChurchScene` |
| The lending library | the whole of `/study` | `LibraryScene` |
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
  shelf under it is only a picker.
- **The shelf lives on the same card as the world it fills.** All three worlds
  now read the same way — scene, then what it is, then a folded shelf: the keep
  in its sheet, the Upper Room in its section, and the churchyard on the church
  card. Landscaping was its own card two scrolls down, past the matchup and the
  Give card, so tapping a plant changed a yard that was no longer on screen.
  On the church card it is **bled to the card's edges** (`margin: 0 -18px`, the
  `.card` padding) and carries **no `meta` on its header**, both measured rather
  than chosen: the collapsible's header is itself a `.card`, and nested inside
  another one's padding its label had 141px on a 320px phone — enough to
  truncate the word "Landscaping" itself. The bleed buys 36px, and the tally
  moved to the first line inside, where a sentence fits.

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

## The Prayer Wall: the first thing here one player writes for another

`/pray`, on the map under You and in the compass. A player tucks ONE note into
an old stone wall (a category, an optional line, signed or not); anybody else
taps "Pray for someone", the wall DEALS them a note, and they HOLD the candle
until the wick catches. `data/prayerWall.ts`, `store/prayerWall.ts`,
`features/prayer/PrayerWallScreen.tsx`, `0099`. Full design and the whole
safety argument: `docs/PRAYER-WALL.md`. Four things to know before touching it:

- **The category is what travels; the line is for people who already know
  you.** A stranger sees one of eight fixed tokens and nothing else. The line
  (120 chars, cleaned on the way in) is returned by `prayer_line_visible` only
  to the requester's church-mates and accepted buddies. That is what lets the
  app's first player-authored text exist without a global moderation surface:
  one report hides a note by itself, and Admin → Prayers puts it back or takes
  it down. Anonymous by default.
- **The wall deals; nobody browses.** `draw_prayer_request` hands out the open
  note with the fewest kneelings, random among equals, never yours, never one
  you knelt at today. The buried ones surface on their own, which is what lets
  the wall be fair with **no number on any note** — `prayer_note_json` carries
  no count, and every slip in `WallScene` is drawn identical. A wall where one
  note blazes is a ladder of who is loved.
- **The XP is the Basin's, exactly, and THE REQUESTER IS PAID NOTHING.** 1 XP
  to the kneeler, twelve a day, once per note per day by the primary key,
  server-counted under a row lock, local date clamped ±1. Give the requester a
  point, a rung or a streak and people post notes to farm sympathy. What they
  get is a lantern ("somebody knelt today" — the lamp's binary shape), a tally
  only they see (`my_washings.received`'s rule), and a mailbox line for
  everybody who knelt when they mark it answered. Over the cap the kneeling is
  still recorded and not paid — the thirteenth prayer is still a prayer.
- **Online-only, inherited** from washing feet: a note needs a stranger. The
  screen fails closed (keyless build → account card; server without 0099 →
  "isn't open on this server yet", and `available` keeps the compass from
  inviting it). The Journal's "Candles held" ladder counts kneelings, and there
  is deliberately no rung for being prayed for.

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
(respecting the user's reduce-motion and sound settings — always go through it),
and `TabbedSection` wherever three or more foldable panels would otherwise stack
down a screen.

## The Play tab is four things

`/play` accreted for a year: every card on it was individually right — the chest
is the verse's reward, first light is a fact about today's verse, the worldwide
ranks belong *somewhere* — and the sum was a column you had to scroll to reach
the one thing the app is for. It is now four things and deliberately nothing
else (`features/home/HomeScreen.tsx`, whose header is the long version):

1. **The two daily boxes, side by side.** Today's verse and today's trivia round
   are both "new today, gone tomorrow", so they sit level with each other rather
   than one being buried under the other. The verse keeps the gold; the trivia
   box is deliberately cooler, because the verse is still what this app is for.
2. **The Harvest Road**, under them, unchanged.
3. **The compass at full size** (`features/map/MapCompass.tsx`) — the same door
   as the 46px puck beside the nav, made big on the one screen everybody lands
   on, because the map is what answers "what now?".
4. **A row of pills**, for what is genuinely there: first light, and a guest's
   account offer. Each opens its own content in a `QuickSheet` rather than
   spending a card on it — First Light's own gesture (a row, tapped, opening the
   player card) generalised rather than three screens each inventing a sheet.

Plus **one line, not a card**: how many people have played today, directly under
the two boxes (`features/presence/PlayedToday.tsx`). It is what survived of the
drifting presence ticker, which is now deleted — the COUNT was the part doing
the work ("others are doing this with me today"), and the scrolling "@name +430"
rows were the part that put one player's number beside another's on the screen
everybody lands on. Tapping the number opens the PEOPLE and never the scores:
`daily_players` (`0093`) returns faces and names with **no score in the payload
at all**, ordered by who turned up most recently — a fact about the clock rather
than about them. It is the church roster's "a crowd, not a ladder" applied to
the day, and the guarantee is that the query is never built, the same shape the
rivalry's payload and `first_light`'s take. Read the migration header before
adding a number to a row there.

Three states, and none of them is broken: no count ⇒ nothing renders (there is
no "0 played today", which on a quiet morning would open the app by telling
somebody they are alone); a count with no roster behind it ⇒ a plain line rather
than a button, which is what a keyless LOCAL build and a server without 0093
both get — the count there is `synthPulse()`'s ambience, and a list to go with
it would have to invent NAMES, which is the "a named player who doesn't exist is
a lie you can tap" rule `FirstLight` already follows; a count with a roster ⇒ a
button. Guests are **counted and not named**: the day's number is plays +
guest_opens, so a list of accounts alone would be shorter than the number beside
it, and `guest_opens.username` is unmoderated text on a row keyed to a device.

Four rules fall out of it, and each is the thing a future session will want to
break first:

- **The test for a new card here is "is it NEW TODAY?"** If it isn't, it wants a
  pill and a sheet, or a row on the map. That is what the presence strip and the
  worldwide-ranks collapsible failed; ranks still have their own map row
  (`/leaderboard`), so nothing was deleted, only moved.
- **The chest lives INSIDE the drop box**, because it is the drop's reward — it
  unlocks only once the verse is played, and it belongs next to the thing that
  unlocked it. `DailyChest` is mounted unchanged inside the sheet; the reveal,
  the duplicate line and the item drop are all still its own.
- **The compass glows and does not count.** The gold is `useInvitations().length
  > 0` and nothing else reaches the button — no badge, no "three open", no ring
  that fills. Read `features/map/invitations.ts` before touching it: that panel
  is deliberately not a checklist, and the button is the same single, countless
  signal the nav's dot carries. Nothing marks it done; the list shortens on its
  own and the glow stops, so a dark compass in the evening is a finished day and
  never a failed one.
- **A store that only loads behind a button can never turn that button on.**
  `FirstLight` used to call `useFirstLight().load()` in its own effect; with the
  card behind a pill gated on `available`, the pill never appeared. HomeScreen
  owns that load now (and the re-read when `playedToday` flips, since
  `submit_play` can have claimed the day). Found by driving the real app —
  invisible in the diff, and the shape of bug any future move-a-card-into-a-sheet
  will hit.

## The Battle tab leads with the turn you owe

Every card on that tab was individually right and the sum of it opened on the
one thing a player can do nothing about: the hall filled the first screen, and
under it "Your battles" defaulted to whichever bucket had rows in it — so
somebody with nothing to play and 23 battles out landed on 23 full-size
"Waiting on their play" cards, with the boards and the team below the fold.
The order is now: the two battle buttons, your battles, where you stand, the
boards, then the hall and its ladder. Four rules fall out of it:

- **The turn tabs default to Your turn, always**, never to whatever is
  populated. An empty Your turn is one short line and the other two tabs are one
  tap away with their counts on them — the counts were always the point of the
  split.
- **Only your move is a card.** `BattleRow` draws a slim single line for the
  other two buckets (same facts, a third of the height, three at a time against
  Your turn's six — `VISIBLE_ROWS` is per bucket now). A battle waiting on
  somebody else is a fact to glance at, not a task. The slim row deliberately
  does NOT pass `username` to its `Avatar`: that turns the avatar into its own
  button for the player card, and a 26px second target inside a slim row is a
  mis-tap.
- **`RankStrip` is where you stand, above the fold.** Two tiles — your rank and
  your team's — lifted out of `board.me` / `denomBoard.me`, which the boards
  already ended with. It publishes **nothing new**: battle wins have been ranked
  since `0020`, both tiles are your own row, and there is no losses column here
  for the same reason there isn't one in the schema. The board behind it is
  **open by default** now, reversing the earlier "a board is something you look
  up occasionally" call — what makes that affordable is the strip, which keeps
  both numbers on screen whether the fold is open or shut.
- **The hall moved DOWN, and only the position moved.** The rule is that the
  room itself is on the tab rather than a link to it; where on the tab is not
  part of it. It stands with `KeepChallenges` now — a ~230px painting between
  "Start a new battle" and the battle waiting on you is the one thing here that
  can wait. `MyKeepScene` names its own faction and tier underneath, so the
  section heading above it stays the plain "The Keep" rather than saying it
  twice.

**The two daily boxes point at each other now.** Finishing the verse puts a line
about today's trivia directly under the score, and the trivia recap does the
same for the verse — each rendered only while the other is genuinely unplayed,
so a finished day says nothing rather than showing a tick (the invitations
panel's rule). The trivia screen reads the drop's own state before it claims
one is waiting: a deep link straight to `/play/trivia` never touched the Play
tab, so `playedToday` is still its `false` default and the nudge would announce
a verse the player finished this morning.

## The map: five tabs, twenty-six places

The compass beside the bottom nav opens a directory of the whole app.
`data/map.ts` is the one list, `features/map/MapSheet.tsx` draws it,
`features/map/invitations.ts` is the panel at the top.

It exists because every placement in this app is individually right and the sum
of them was an app you had to already know: praying was behind tapping your own
figure inside a room halfway down a tab, the arcade only advertised itself once
the day's verse was done, the Journal and mailbox were pills on a card two
screens down. The map does not move any of them — it adds a second way in.

Four things about it are load-bearing:

- **The map may never count anything.** A place carries an icon, a name and a
  line saying what it *is*. No "12 cards", no "3 due", no completion state, no
  ordering by how much you have used it — a map with counts on it is a progress
  screen, and a progress screen is a list of the places you are behind on.
  `scripts/check-map.mjs` fails the build on a digit in a place's copy.
- **The invitations panel is not a checklist, and the distinction is the whole
  design.** It lists only what is genuinely OPEN, so it gets shorter through the
  day rather than filling with ticks; there is no denominator, nothing
  remembered about a day that has passed, and no strikethrough state. Empty is a
  warm line, never a zero. Read the header in `invitations.ts` before adding
  anything to it: a completion number there is the thing the review dot, the
  prayer lamp and the library's `borrowed_today` boolean were each deliberately
  built without.
- **The puck sits BESIDE the nav pill, in the nav's own row.** Five tabs already
  have to clear a 320px phone, so a sixth would shrink every one of them; and
  that band is the only strip the app shell already reserves, so a free-floating
  button anywhere else lands on the bottom-anchored primary action — the trap
  `StudyDropToast` moved to the top of the screen to avoid. Measured: pill 248 +
  gap 8 + puck 47 = 303 of 320.
- **The sheet is a SIBLING of `<nav>`, never a child.** The nav sets `z-index:
  40`, which creates a stacking context, so a sheet nested inside it paints at
  40 regardless of its own z-index — under the player card and every other
  sheet. Same family of bug as the `backdrop-filter` note on `ChurchDetailSheet`
  and the `perspective` one in `BookOpening`.

`scripts/check-map.mjs` (in `npm run build`) asserts every `to` against the real
`<Route>` table in `App.tsx`, re-derived by text rather than imported. A
mistyped route does not throw and does not fail to compile — it falls through
the catch-all to Landing, silently signing somebody out of their own app, on the
one row nobody happened to tap.

Two deep links exist so the map has somewhere honest to point: `?pray=1` on
`/you` opens the prayer sheet and `?customize=1` opens the customizer. Both are
frozen at mount and stripped from the URL immediately, or a reload re-opens them
over whatever the player moved on to.

### A started run is locked, and can't be re-dealt

Reading the verse is free — the ✕ is a real ✕ right up until the clock starts.
From its first tick the run is committed: the ✕ becomes a 🔒 that says how many
questions are left, Back is caught and put back, and a reload gets the browser's
own "leave site?" prompt. It lives in `QuizRunner` for the reason everything
cross-mode does, so the daily drop, a replay, a drill, a CPU race, a battle and
a live match all got it from one edit.

**The point is the RE-DEAL, not the exit.** The day's five questions are the
same five for everybody forever, a replay is the same past verse and an accepted
battle is a fixed seed — so walking out of a run going badly and starting it
again was a retry with the answers known, and the daily drop's `playedToday`
guard never saw it because nothing had been submitted. Locking the screen is
only half of that; the other half is `runId`, which parks the run
(`lib/runProgress.ts`) so a reload or a killed app comes back to the question it
left. Three callers pass one — `daily:<dropDate>`, `practice:<date>`,
`battle:<id>`. The modes that don't are deliberate: a vs-CPU race, a focus drill
and a new battle deal a fresh RANDOM verse every time, so there is nothing to
re-deal, and a live match is not allowed to outlive itself
(`docs/LIVE-BATTLE.md`). They are still locked; they just have nothing to come
back to.

Two things about the parked run are load-bearing:

- **The clock never stops.** A snapshot stores when the current question's
  window opened as WALL time, and resuming computes what is left of it from
  there — so stepping out to think (or to look the answer up) costs exactly what
  sitting there costs, and a question whose window has passed lands on its teach
  card the moment you come back. Without that, "resume" would be a pause button
  on a timed question, which is a smaller version of the thing being closed
  rather than a fix for it. It is also why `handleAnswer` clamps a question's
  recorded time to the answer window: a backgrounded tab throttles timers too,
  and `PlayResult.timeMs` feeds a battle's tiebreak.
- **It grants nothing, so it is safe to keep on the device.** Every reward in
  this app is paid by `onComplete`, which only fires when a run ends, so there is
  nothing here to farm by clearing it — clearing it costs you your progress and
  buys you nothing. That is what lets it be device-local in both modes, the same
  deliberate break with the two-mode invariant `store/looks.ts` makes.

There is no "leave anyway" door, and a run is five questions with a hard
per-question window, so what it closes is measured in seconds. It never scolds:
the lock says what is left and that the banked score is safe. If a door is ever
wanted, the honest shape is one that keeps the park — leave, come back to the
same question — never one that deals again.

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

### The Study tab IS a library

`/study` is one room filling the tab — a lit library with an NPC librarian
(Tabitha) at the desk. It used to be a grid of book tiles; the tiles are gone
(`StudyShelf`/`StudyBookArt` deleted) and everything Study can do is now
something in the room. Full design: `docs/STUDY-LIBRARY.md`. Five things:

- **Three hotspots, and the ceiling is deliberate.** Tabitha lends the five
  practice surfaces, the ledger on her desk is `/study/reports`, the satchel on
  the floor is `/study/bag`. Nothing else is tappable: a room with a hotspot on
  every object is a menu with a painting behind it, so anything new in Study
  belongs in her offer rather than as a fourth glowing thing on the floor. Every
  marker is always labelled — this is a tab, not a puzzle.
- **One list, two surfaces.** `StudyBook[]` is built once in `StudyScreen` and
  handed BOTH to the room (hotspot badges) and to Tabitha (what she lends). A
  `lend` line makes an entry stock; without one it is yours and stands in the
  room as itself. Same choke-point habit as `QuizRunner` and `CrowdLife`.
- **The first book of the DAY pays 5 XP**, and it is built like every XP grant
  here: `xp` is the worldwide leaderboard (0006), so the server counts and the
  server pays (`checkout_library_book`, 0083), the client never sends an amount,
  and the cap is the PRIMARY KEY `(user_id, borrowed_on)` rather than a count —
  the day's second checkout inserts nothing and two taps racing settle
  themselves. `todayLocalDate()` clamped ±1, the house pattern. 5/day is the
  smallest payout in the app (the Basin pays 12, praying 30).
- **Nothing counts the days.** No streak on the table, no Journal rung, no RPC
  asking how many times anybody has visited, and `borrowedToday` is a boolean on
  both paths. A daily reward you can fall BEHIND on is the version that would be
  wrong, and the guarantee is in what isn't stored.
- **A study run IS borrowing the day's book.** `QuizRunner`'s `studyDrop` path
  calls `useLibrary.borrowIfNeeded()` when a run finishes, so the trivia rounds,
  a replay, a drill and the Cross Word all clear the compass's "Borrow today's
  book from Tabitha" line — it used to clear only from her desk, and people who
  reached Study by any other door watched it stay all day. `borrowIfNeeded`
  no-ops once borrowed (loading the store first, since a run can finish before
  anything called `load()`), so the desk's checkout is never paid twice and the
  `book_borrowed` verb fires once.
- **She never measures anybody**, and the reveal waits. No due dates, no "it's
  been a while", no count of visits. Every checkout after the day's first is a
  SUCCESS that pays nothing — never a refusal, and neither is a failed call,
  because Study has no other door. The sheet holds the stamp behind an "Open
  it →" button rather than navigating for you: a +5 XP line swept off screen by
  a route change is the exact bug `StudyDropToast` exists to work around.

Two-mode for real (`store/library.ts`), because a keyless LOCAL build IS this
tab and a dead librarian there would be a dead tab; the guest day rolls over on
READ, so nothing has to fire at midnight. The room's painting is a **5:8
portrait because the frame is one** — it was re-prompted twice to get there —
and it's bled past the shell's 18px gutter, since it isn't a card on the tab,
it's the tab.

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
