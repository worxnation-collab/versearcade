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
| participation view | `church_participation_7d(church, date)` RPC | Needs a caller check and a small-count floor; a view can't do either cleanly. |

## Access rules (all enforced by RLS or the RPC, not the client)

- **Public:** `churches` incl. `verified` and `logo_url`.
- **Members** (`profiles.church_id`) **and admins:** read their church's verses
  and announcements.
- **Church admins:** write verses/announcements **only while the church is
  verified**. Un-verifying freezes writes and blanks `my_church_today`.
- **Leadership-only:** `church_members` (rows only for churches you lead) and
  `church_participation_7d`.
- **Operator:** `admin_set_church_package(church, verified, logo, stripe_sub)`.
  A future Stripe webhook should call the same thing with the service role.

## Participation is a floored aggregate, on purpose

`church_participation_7d` returns members, distinct active players and daily-drop
completions over the last 7 local days. Below **5** active players the counts are
`null` and `floored: true`. There is no per-day breakdown and no per-member row.
CLAUDE.md is explicit: a pastor-facing "who played and who lapsed" is the
ranking-a-person problem with authority attached. At four people, a weekly total
names who skipped.

## The shared verse and the leadership numbers: see CHURCH-SHARED-VERSE.md

**0119 replaced** the windowed verse model described in earlier drafts of this
doc (`starts_on`/`ends_on`, pool-only) with one verse per church per day,
including five questions. It also replaced the participation RPCs and the opt-in
check-in list with `get_church_participation`, which returns aggregates only.
Everything about either one now lives in `docs/CHURCH-SHARED-VERSE.md`.

## The discovery and membership surfaces (0117)

| Surface | Free | Verified |
|---|---|---|
| `/churches/find` (public directory, map: "Find a church") | listed, tagline | same row: **no badge, never sorted first** (0119) |
| `/church/:id` profile | announcement, Join button, share link | + logo, giving link, invite QR |
| Play tab (`ChurchWindow`) | — | "chosen by your church", banner, giving link |
| Daily drop | global verse | the church's verse, on days leadership set one |

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
| Today's verse | verified | `TodayVerseForm`, 0119 |
| Congregation | verified | `ParticipationPanel`: totals floored at 5, private to leadership (0119) |
| Notices | any claimed church | ONE live notice. Giving link: verified only, https only, hidden in the App Store build. |

An unverified church sees only Notices, and nothing on the screen says why.

## The offer page (`/churches`)

`/churches` is the page sent to a pastor, and it sells the verified layer as a
**Founding Church** pilot: free through Easter 2027, set up by hand. It shows
**no price and no checkout**, so it is identical on web and in the App Store
build and stays out of `lib/commerce.ts`. Its rules:

- **Only claim what ships.**
- **The giving link is described as "on the web".** That matches
  `givingLinkVisible()`.
- **The privacy promise is stated outright.** It quotes
  `get_church_participation`: floored at five, never a name.
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
- **The Congregation tab shows SAMPLE totals, labelled in its first line.** One
  streak bucket is under five, so the floor is shown rather than claimed. No
  real church's numbers ever appear here.
- **"Want this for your church?" opens `/churches` with a line about the verse
  they tried in the inquiry message**, scrolled to the form.

## Billing (0131, `church-billing`)

The verified tier is paid for **on the web only**: a stable per-church link
(Admin → Churches → **Copy billing link**) opens `versearcade.org/church-billing/?t=…`,
a static page outside the SPA that no app route links to. It carries the prices;
the app carries none.

- **Plans** — Verified Church $29/month or $290/year; Content Generation add-on
  $19/month or $190/year, a second line item on the SAME subscription (one
  cancellation ends both). The amounts live in Stripe; the page's copy must be
  changed with them.
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
function secret would win). `STRIPE_SECRET_KEY` is a function secret, ideally
a RESTRICTED key (Customers, Subscriptions and Checkout Sessions: write).
Either missing ⇒ 503, nothing created.
