# Church packages

What a **verified** church can put in front of its own members: a scheduled
verse with a pastor's note, and short announcements. Migration `0116`, types in
`src/types/churchPackages.ts`. Free discovery — the church row, its public page,
the manually-granted claim (`church_admins`, 0079) — is unchanged.

## The data model, and where it differs from the ask

| Asked for | What shipped | Why |
|---|---|---|
| `churches` table | existing `churches` (0040) + `verified`, `logo_url` | The table exists and 600k places hang off it. `description` is `church_profiles.about`, `location` is `lat/lng/address/city/region`. |
| `churches.stripe_subscription_id` | `church_billing` table, no policies | `churches` is `select using (true)` to **anon**. A billing id on it is public. |
| `church_members` table | `church_members` **view** over `profiles.church_id` + `church_admins` | Membership already lives in two places every RPC reads. A third copy drifts. |
| `church_verses`, `church_announcements` | as asked, plus length/shape checks | — |
| participation view | `church_participation_7d(church, date)` RPC, superseded by `church_leader_insights` (0128) | Needs a caller check, which a view can't do cleanly. The small-count floor it carried was dropped for leadership in 0128 — see below. |

## Access rules (all enforced by RLS or the RPC, not the client)

- **Public:** `churches` incl. `verified` and `logo_url`.
- **Members** (`profiles.church_id`) **and admins:** read their church's verses
  and announcements.
- **Church admins:** write verses/announcements **only while the church is
  verified**. Un-verifying freezes writes and blanks `my_church_today`.
- **Leadership-only:** `church_members` (rows only for churches you lead) and
  `church_leader_insights` (0128: the roster by name, verified leadership of
  THAT church only). `church_participation_7d` (0116) is revoked.
- **Operator:** `admin_set_church_package(church, verified, logo, stripe_sub)`.
  A future Stripe webhook should call the same thing with the service role.

## What leadership sees: members by name (0128)

**This section used to say the opposite, and the reversal was the owner's
call (2026-10-21): "this is a tool for church leaders, names are important".**
`church_participation_7d` (0116) and then `get_church_participation` (0119)
returned floored totals and never a person, on the argument that "who played
and who lapsed" is the ranking-a-person problem with authority attached. Since
`0128`, verified leadership of a church sees `church_leader_insights` instead:

- **The roster by name**, in join order: when each member last played, their
  current streak, and their drop and church-verse plays this week.
- **Exact totals** (members, active this week, fourteen days of plays, series
  completion, streak buckets). There is **no small-count floor** for leadership.
- **The congregation feed** (`church_feed`): who played, gave or joined, with
  scores, over fourteen days.

What still holds, and what the sales page promises:

- **Nobody is ranked.** The roster is in join order in both groups; nothing
  sorts members by what they did, and there is no member leaderboard.
- **No "who skipped" front page.** Members with no play in seven days sit in
  ONE folded section ("Not active this week") the leader opens on purpose, and
  the only thing offered there is a check-in note the leader writes and sends
  by hand (0137/0138).
- **Leadership of THAT church only.** Not other members, not other churches,
  not a board, not the public. A FREE claim (an unverified church, 0137) sees
  three totals and nothing per person (`church_leader_summary`).
- **Members keep the floor.** What a member sees of their congregation's week
  (`church_week_summary`, 0130) is still church totals with any count under
  five withheld.

Full history and rules: `docs/CHURCH-CLAIM.md` → "What a claim buys".
`ChurchesScreen` and the `/churches/try` demo must say the same thing.

## The shared verse and the leadership numbers: see CHURCH-SHARED-VERSE.md

**0119 replaced** the windowed verse model described in earlier drafts of this
doc (`starts_on`/`ends_on`, pool-only) with one verse per church per day,
including five questions. It also replaced the participation RPCs and the opt-in
check-in list with `get_church_participation` (aggregates only), which 0128 in
turn replaced on the dashboard with `church_leader_insights` (names, above).
Everything about either one now lives in `docs/CHURCH-SHARED-VERSE.md`.

## The discovery and membership surfaces (0117)

| Surface | Free | Verified |
|---|---|---|
| `/churches/find` (public directory, map: "Find a church") | listed, tagline | same row: **no badge, never sorted first** (0119) |
| `/church/:id` profile | announcement, Join button, share link | + logo, giving link, invite QR |
| Play tab (`ChurchWindow`) | — | "chosen by your church", banner, giving link |
| Daily drop | global verse | global verse — the church's verse is a separate box on the church card (0127) |

**About the giving link:**
- It is decided by `givingLinkVisible()` in `lib/commerce.ts`, and is **hidden in
  the App Store build**. Guideline 3.2.2(iv) allows non-nonprofit donation links
  only "outside of the app, such as via Safari", and the in-app browser is
  SFSafariViewController.
- It opens with `rel="noopener noreferrer"`.
- The URL is https-only twice: once by the column constraint, and once again in
  `safeHttps` on the client.

## Production state

0116, 0117, 0118 and 0119 are all applied. They went in as small pieces because
the Supabase MCP hangs on `DROP`/`DELETE`/`CREATE POLICY`.

The only thing never applied is the policy block for `church_announcements`.
Every read and write the app makes goes through `security definer` RPCs, so it
is **optional**: without it the table is RLS-on with no policy, i.e. locked to
direct access, which fails closed. Paste it only if something will read the
table directly:

```sql
create policy church_announcements_member_read on public.church_announcements
  for select to authenticated using (public.is_church_member(church_id));
create policy church_announcements_admin_insert on public.church_announcements
  for insert to authenticated with check (public.is_church_admin(church_id));
create policy church_announcements_admin_update on public.church_announcements
  for update to authenticated using (public.is_church_admin(church_id))
  with check (public.is_church_admin(church_id));
create policy church_announcements_admin_delete on public.church_announcements
  for delete to authenticated using (public.is_church_admin(church_id));
```

`church_verses` (0119) deliberately has no policies at all.

## The admin dashboard

`/church/:id/admin` (`features/church/admin/`) is reached from "⛪ Leadership
tools" on your own church card and on the church's page. It is drawn only for
someone `church_admin_settings` says leads THIS church, and every RPC re-checks
that on the server.

| Panel | Who | What |
|---|---|---|
| Overview | verified | `OverviewPanel`: exact totals, fourteen days, series completion, streak buckets, the live notice (0128) |
| Schedule | verified | `TodayVerseForm`: the planner, drafts and approval (0119, 0127, 0129) |
| People | verified | `PeoplePanel`: the roster by name in join order; "Not active this week" folded, with a hand-sent check-in (0128, 0137, 0138) |
| Activity | verified | `ActivityPanel`: the congregation feed (`church_feed`, 0128) |
| Overview | free claim (unverified) | `SummaryPanel`: three totals and the notice, nobody's name (0137) |
| Notices | any claimed church | ONE live notice. Giving link: verified only, https only, hidden in the App Store build. |
| Share | any claimed church | `SharePanel`: the invite link and QR |

## The offer page (`/churches`)

`/churches` is the page sent to a pastor, and it sells the verified layer as a
**Founding Church** pilot: free through Easter 2027, set up by hand. It shows
**no price and no checkout**, so it is identical on web and in the App Store
build and stays out of `lib/commerce.ts`. Its rules:

- **Only claim what ships.**
- **The giving link is described as "on the web".** That matches
  `givingLinkVisible()`.
- **The privacy promise is stated outright, and it describes the real
  dashboard.** Leadership sees members by name with exact totals (0128); the
  promise is that nobody is ranked, the quiet ones are folded away with only a
  check-in offered, and nobody but that church's leadership sees it. It said
  "floored at five, never a name" until 2026-10-23, two days after that had
  stopped being true.
- **Nothing competitive.** No rank, rivalry or badge.

The role a person picks rides at the top of the inquiry message
(`Role: Youth pastor`), so `submit_church_inquiry` (0025) is unchanged.
`netlify/edge-functions/churches-og.ts` gives the link its own preview card.

Turning a church on after the call is **Admin → Churches → Founding
Churches**: find the church, Turn on, optionally paste an https logo. It calls
`admin_set_church_package` and reads `verified` off the public `churches` table,
so it needed no migration. It only does anything for a church whose leadership
has been granted a claim (the panel below it).

## The demo (`/churches/try`)

A public page where a pastor uses the **real** leadership tools before their
church exists here, then plays what they wrote. It's linked from `/churches` as
"Try the leadership tools — no sign-up".

- **The verse form and week planner are the leadership components themselves.**
  They're given `memoryVerseBackend()` instead of the server, so validation is
  the same `cleanQuestions` and the planner, copy and mix work exactly as they
  do for real.
- **The quiz is `QuizRunner` with `demo`.** It records no book accuracy, no
  Bible mark, no road miles, no drop and no library borrow, and gets no
  `runId`. Driven signed out against a logging mock backend, a full
  build-save-copy-play run made **zero** backend requests.
- **The Overview and People tabs are the real leadership panels over a SAMPLE
  congregation**, labelled in their first line: eleven invented members by
  name, one folded section of quiet ones, a check-in that explains itself and
  sends nothing (`PeoplePanel`'s `demo`, which also keeps a made-up name from
  opening a player card). No real church's people or numbers ever appear here.
- **"Want this for your church?" opens `/churches` with a line about the verse
  they tried in the inquiry message**, scrolled to the form.

## Billing (0131, `church-billing`)

The verified tier is paid for **on the web only**: a stable per-church link
(Admin → Churches → **Copy billing link**) opens `versearcade.org/church-billing/?t=…`,
a static page outside the SPA that no app route links to. It carries the prices;
the app carries none.

- **Plans** (2026-10-23) — the **Church Suite**, $39/month or $390/year
  (`prod_VUaHXSAxvbhT5z`: `price_1UTb6qHlxD9PZQmbVvypDKKU` monthly,
  `price_1UTb6tHlxD9PZQmbP6YBOfU9` yearly), is Verified Church + Content
  Generation as ONE price and the billing page's default; it is shown against
  the separate $48/$480 so the saving is plain. **Verified Church** alone is
  $29/month or $290/year. The page sends `plan: 'suite' | 'verified'`. The
  standalone add-on ($19/$190, a second line item) is no longer offered on the
  page, but `addon: true` from an older page still builds base + add-on, and
  every existing add-on subscription keeps working.
- **The webhook reads Content Generation as ON for an add-on price OR a suite
  price.** A suite subscription carries no add-on line item, so leaving the
  suite ids out of that set would sell the add-on and never switch it on. The
  amounts live in Stripe; the billing page's `PRICES` and the `/churches`
  plans card (`PlansCard`, web only via `churchPlansVisible()`) must be changed
  with them.
- **Upgrading is self-serve in the portal** (`bpc_1UTNfWHlxD9PZQmbI9MV6O7Q`,
  2026-10-23). The only plans a church can switch between are Verified Church
  and Church Suite, monthly or yearly. An upgrade applies now and is prorated
  on the next invoice. A downgrade, or a move from yearly to monthly, waits
  for renewal. **`trial_update_behavior` is `continue_trial`**; the Stripe
  default ends a Founding trial the moment a plan changes. A subscription with
  the old base + add-on pair can't be switched in the portal, because Stripe
  only switches single-item subscriptions. Those churches already have
  everything, so it doesn't matter. **An INVOICED subscription can't be switched in
  the portal at all** (Stripe refuses any collection method but
  `charge_automatically`), so the dashboard points an invoiced church at its
  invoice email instead, and the operator changes the price in the Stripe
  dashboard. Checked live on 2026-10-23, along with two more facts: the portal
  allows ONE copy of a plan (quantity editing was on by default and is off),
  and switching a trialing subscription to the Suite shows **$0.00 due today**
  with the first charge still on 29 March 2027. Stripe asks for a card at
  confirm when none is on file; every card-checkout church already has one.
- **"Unlock with Church Suite" on the dashboard** (web only, the locked
  Content Generation row; `action: 'upgrade'`, the leader's own session checked
  against `church_admins` like `portal`). The church's billing row decides the
  door: a live CARD subscription without the add-on gets a portal session on
  `subscription_update_confirm` (its one item → the Suite price at the same
  interval, so `continue_trial` above keeps a Founding trial); no live
  subscription (a free claim) gets a Suite Checkout Session, reusing the Stripe
  customer the free claim's SetupIntent saved a card on, with the Founding
  trial; an invoiced one is refused (`invoiced`) and the card says to reply to
  an invoice email. Both return to `/church/:id/admin?upgraded=1`, which
  re-reads entitlements every 3s (up to 30s) until the webhook's grant lands.
  There is no separate Content Generation product: the Suite price is the
  add-on. **"Manage plan"** is `portal` with `flow: 'plan'` — the portal's
  `subscription_update` picker, for a downgrade or monthly ↔ yearly — and is
  not drawn for an invoiced church.
- **The Custom Leader Avatar is a ONE-TIME $79 Checkout** (2026-10-25, 0145;
  `prod_VVGkrkRfTdTZCo`, `price_1UUGDMHlxD9PZQmbiQYsps27`). "Get a custom
  avatar — $79" on the dashboard's **Your look** tab (web only,
  `churchPricesVisible()`) calls `church-billing` `{ action: 'avatar', church }`
  with the leader's own session: leadership of THAT church (`leaderOf`), a
  verified church (`needs_base` otherwise) and the add-on not held already
  (`already`, because 0136 allows one live request per church). The session is
  `mode: 'payment'`, card only (`payment_method_types` is accepted at the pinned
  `2024-06-20`; newer API versions reject it — without it the account's dashboard
  would also offer Klarna, Link, Cash App and Amazon Pay), `client_reference_id`
  = the church and `metadata.product = 'custom_leader_avatar'`, reusing the
  church's Stripe customer when it has one. The webhook grants on
  `checkout.session.completed` (or `async_payment_succeeded`) with
  `payment_status: 'paid'` through `billing_grant_custom_avatar` (service_role
  only, idempotent per session id, which it keeps on `church_addons` for a
  refund). It sets the same `custom_leader_avatar` flag the operator toggle
  sets; a `had: true` answer means the church already held it and the operator
  should look at a refund. Stripe returns the leader to
  `/church/:id/admin?avatar=1`, which opens on Your look and re-reads
  entitlements every 3s until the photo form appears.
- **Two ways to pay, one webhook.** *Card*: a Stripe Checkout Session
  (`client_reference_id` = the church). *Invoice*: a `send_invoice`
  subscription, due in 30 days, payable by card, ACH, bank transfer or a cheque
  marked paid in the dashboard. Both end in `customer.subscription.*` events,
  and those are all the webhook acts on.
- **Founding Churches** — anyone signing up before Easter 2027 gets
  `trial_end` = 2027-03-29 04:00 UTC (the Monday after Easter, midnight
  Eastern). Nothing is charged until then; the first charge or invoice happens
  by itself at the plan they chose.
- **What a status means is decided in SQL** (`billing_apply_subscription`):
  active / trialing / past_due ⇒ verified; canceled / unpaid /
  incomplete_expired / paused ⇒ not, and only for the subscription on file;
  incomplete ⇒ no change. Billing turns the add-on off only if billing turned
  it on, so a hand-granted pilot add-on survives.
- **Leadership manages its own subscription** (0135). The leader dashboard
  shows a Billing line (Founding trial, interval, renewal date, or "the last
  payment didn't go through") and a **Manage billing →** pill that opens
  Stripe's customer portal — change the card, see invoices, cancel. Portal
  config `bpc_1UTNfWHlxD9PZQmbI9MV6O7Q` (live, default): cancel at period end
  with no proration, plan switching OFF (changing tier or adding the add-on
  still goes through us), return URL the church's dashboard. The session is
  opened by `church-billing` `{ action: 'portal', church }` with the leader's
  own JWT, checked against `church_admins` for that church — the one door that
  takes a church id, safe because of that check; the Stripe customer id never
  reaches a client (`my_church_billing` doesn't return it). Drawn only for a
  live subscription WITH a Stripe customer, so a church an operator verified by
  hand sees nothing new, and only on the web (`churchBillingPortalVisible()`).
  A cancellation arrives through the webhook like any other status change.
- **The link is a token, never the church id**, so it cannot open a checkout
  for a church it was not sent to. It is stable — the same church always gets
  the same link.
- **A church verified by hand with no subscription is never touched** by the
  webhook. Founding Churches verified during the pilot stay on until an
  operator turns them off or they subscribe.

Stripe (live, created 2026-10-22): products `prod_VU9LiqvsmVNmUa` (Verified
Church) and `prod_VU9LodsgFJ5Xir` (Content Generation), their monthly and
annual prices named in the function, and webhook `we_1UTB3nHlxD9PZQmbjy4PiBb9`
pinned to API version 2024-06-20. Its signing secret is in Vault
(`stripe_church_webhook_secret()`, 0132; a `STRIPE_CHURCH_WEBHOOK_SECRET`
function secret would win), and so is the RESTRICTED Stripe key
(`stripe_church_secret_key()`, 0133 — Customers, Subscriptions and Checkout
Sessions: write; a `STRIPE_SECRET_KEY` function secret would win). Either
missing ⇒ 503, nothing created.

### The App Store path: the Verified Church plan through Apple (0139–0141)

The web path above is unchanged. The App Store build adds a second way to buy
the **Verified Church** plan, because Apple's multiplatform rule (3.1.3(b))
only lets the app honour a plan bought on the web if the same plan can also be
bought in the app. Full mechanics: `docs/APPLE-IAP.md` → "Church plan".

- **Where it shows.** On `/church/:id/admin`, under the plan card, the
  "For Churches" card (`ChurchPlansEntry`) offers **Subscribe with Apple · {Apple's
  price} / month|year** — only in the App Store build, only for a church that
  is not verified yet, only signed in, and only once StoreKit has returned the
  products (`churchApplePlansVisible()` in `lib/commerce.ts`). The price is
  Apple's localized string, never the USD numbers in `pricing.ts` — those stay
  behind `churchPricesVisible()`, which is still false on native. The card also
  carries Restore purchase, Apple's EULA and our privacy link (3.1.2).
- **Products.** `com.versearcade.app.church_verified_monthly` and
  `com.versearcade.app.church_verified_yearly`, one subscription group
  (`CHURCH_PLAN_PRODUCT_IDS` in `lib/iap.ts` ↔ `CHURCH_PLAN_PRODUCTS` in
  `supabase/functions/_shared/churchApple.ts`). They are deliberately NOT in
  `APPLE_PRODUCT_IDS`, so a church plan loading never switches the skins shop on.
- **Purchase → verified.** Apple's sheet → `iap-fulfill { church_id }`, which
  asks RevenueCat itself whether the subscription is live and calls
  `billing_apply_apple` (service_role); that checks the caller leads the church
  and flips the same `verified` flag Stripe and the operator use, so
  `church_entitlements` reads one answer however the church paid. One Apple
  subscription verifies one church.
- **Renewal, lapse, refund** arrive by `revenuecat-webhook` (verify_jwt off,
  shared Authorization value), which re-asks RevenueCat rather than trusting
  the event. An Apple lapse only switches off what Apple switched on; a church
  verified by an operator or by Stripe is never turned off by it, and a dead
  Stripe subscription leaves a church verified while Apple is paying (0139).
  Removing the paying leader ends the binding (0140).
- **On the web**, a church billed through Apple shows "Billing · Verified
  Church through Apple" on its dashboard, and the "Unlock with Church Suite"
  offer is replaced by a line asking the leader to cancel the Apple
  subscription first, so nobody is billed twice. Church Suite (Content
  Generation) stays a web purchase.
- **Outside the US, and in every storefront until the storefront can be read**,
  the same card's second half points at the inquiry form. The US-only link out
  to the web plans (`churchPlansLink()`) is behind `VITE_CHURCH_PLANS_US_LINK=on`,
  OFF by default, and needs RevenueCat's `getStorefront()` (Capacitor 7) before
  it can ever turn on.
- **Counting.** Every tap on Subscribe with Apple or the web link is a row in
  `church_plan_taps` (0141), read in Admin → Churches → Plan taps.

**Manual steps still required** (nothing in the repo can do these). Until step 1
is approved, StoreKit returns nothing and the app shows no Apple button — the
merged code is inert, which is the fail-closed answer.

1. **App Store Connect → Subscriptions**: create a group "Verified Church" with
   the two products above (1 month, 1 year), priced at the nearest Apple price
   point to $29 / $290, display name "Verified Church", the leadership screen's
   For Churches card as the review screenshot, then submit them with the next
   binary.
2. **RevenueCat**: import both products (no entitlement or offering needed — the
   server reads `subscriber.subscriptions` by product id).
3. **RevenueCat → Integrations → Webhooks**: URL
   `https://visuppaucpzzigwtqmdd.supabase.co/functions/v1/revenuecat-webhook`,
   Authorization = a long random value.
4. **Supabase secret** `REVENUECAT_WEBHOOK_AUTH` = that same value (Edge
   Functions → Secrets). Without it the webhook answers 503 and does nothing;
   renewals and lapses then only settle when a leader's app calls `iap-fulfill`.
   `REVENUECAT_SECRET_KEY` already exists for the skins.
5. **A new App Store build** carrying this client (the plan card is in the
   baked `dist`), with the two subscriptions attached to its review.
