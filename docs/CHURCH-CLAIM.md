# Claiming a church page

A congregation's own staff, verified by hand, editing their own page without
the operator in the loop. Schema: `0079_church_admins.sql`. Client: the
**Edit page** pill on `ChurchPageBody`, and **Admin → Churches → Church
leadership**.

## Why there is a table for this

`church_profiles` (0050) has always had exactly one writer,
`admin_upsert_church_profile`, because the alternative was an open text field
on somebody else's congregation — a moderation problem, not a feature. That
rule was right and it doesn't scale: every corrected service time went through
the operator.

`church_admins` is the seam that keeps the rule and drops the bottleneck. A row
in it says *this player is verified leadership of this church*. Nothing else in
the app can put one there.

## Verification is manual, and that is the design

> **Reversed in part on 2026-10-22 (0134, the owner's call): a church that
> nobody leads here can now claim itself by paying.** See "Self-serve claim"
> at the end of this file. Everything below still holds for a church that
> already has leadership, which can only be reached through the operator.
>
> **And since 0147 (2026-10-26) a VERIFIED church's leadership adds its own
> co-leaders** — see "Co-leaders" below. The operator still decides who the
> FIRST leader of a church is; after that, the staff team is the church's own
> business.

There is **no self-serve claim**. No domain-email check, no mailed code, nothing
a stranger can drive. An operator reads the request in the "Add info" queue
(role, name, email, note), satisfies themselves the person is who they say — a
phone call to the church, an email from its own domain, whatever convinces them
— and grants the claim by username.

Two consequences worth stating plainly:

- **The grant is the moderation.** There is no automated check standing behind
  it, so the care goes in at grant time. A claim is also revocable in one call,
  and revoking takes effect on the next page load.
- **It doesn't scale to thousands, on purpose.** At the volume this app has,
  a human reading a request is both cheap and better than any heuristic. If it
  ever needs to scale, the honest upgrade is domain-verified email or a code
  posted to the church's address — not loosening this.

## What a claim buys, and what it deliberately doesn't

| | |
|---|---|
| ✅ Tagline, about, service times, website, contact | Their own page, their own facts, published straight through |
| ❌ The skin | The paid axis (`docs/CHURCH-SKINS.md`) — only `admin_upsert_church_profile` grants one, and `update_my_church_profile` doesn't take a skin, so an edit can't drop the look an operator granted |
| ❌ `published` | A church could otherwise unpublish itself into a state only an operator can undo |
| ❌ Anything about a member | See below |
| ❌ Another church's page | `is_church_admin(p_church_id)` is checked per call, not per session |

## The leader's look is what the congregation sees (0146)

Verified leadership picks a look in **Your look** (0136: five defaults, or the
one-time Custom Leader Avatar). Until 0146 that look was drawn only in the
leader's own picker. Now `church_leader_look(church)` — public, read-only —
returns one face per verified church, and three places draw it:

- **beside the pastor's note** on the church verse (`ChurchVerseScreen`);
- **beside the live notice** on a member's church tab (`ChurchLife`);
- **standing by the door of the churchyard** (`ChurchScene`), on the member's
  own tab, the leaderboard sheet and the public `/church/:id` page.

Rules: verified churches only; only a leader who chose a look (a delivered
custom look first, then the longest-standing leader); no name, no user id,
only the look plus the leader's tone, hair and figure; untappable, so it opens
no player card. No look ⇒ nothing is drawn — never a stand-in figure. The
leader's own character (`avatar_character`) is unchanged everywhere else.

## Co-leaders: leadership adds its own team (0147)

Real churches have a staff team, and every associate pastor, youth pastor and
office manager used to be a message to the operator. Since `0147` verified
leadership of a church manages its own leadership from **People → Leaders** on
`/church/:id/admin` (`LeadersSection.tsx`, `store/churchAdmin.ts`).

- **Add**: pick a member from the roster, or type any username (staff often
  have not joined the church in the app — the row then says "not a member in
  the app"). A confirm step says what a grant hands over: every member by
  name, the schedule, the notices, and the power to add or remove leaders.
  `grant_church_co_leader(church, username)`.
- **Remove / step down**: any leader may remove another, or step down
  themselves. `remove_church_co_leader(church, username)`. Stepping down sends
  you back to the church's page.
- **Who can**: `church_admin_can` must answer `ok` for THAT church on every
  call — verified leadership only. A free-claim leader (0137, unverified) is
  refused (`not_verified`) and the section never appears for them, because the
  People tab is verified-only. A leader of another church is refused
  (`not_leadership`).
- **What it grants is one row in `church_admins`, and nothing else.** No skin
  (only `admin_upsert_church_profile` writes it), no billing (Stripe, Apple and
  the add-ons have their own writers), no operator power (`is_admin` is on
  `profiles` and nothing here touches it), no other church.
- **Two refusals, shown before anyone taps.** The LAST leader cannot leave
  (`last_leader` — a church with no leadership needs the operator), and the
  leader whose Apple ID pays for the church cannot be removed (`apple_payer`):
  0140's trigger would end that subscription's hold, which for an Apple-only
  church un-verifies it and takes the dashboard from everybody.
- **Caps**: twelve leaders a church, ten grants a church a day, taken under an
  advisory lock so two grants racing can't both pass.
- **Audit**: `church_admins.granted_by` (0079) records who added whom — the
  list says "Added by …", or "Verified by Verse Arcade" for an operator grant
  or a claim. `church_leader_events` records every grant AND removal (actor,
  target, time) — the half a removed row can't keep. No client reads it; it is
  for the operator, in SQL.
- **Production state**: both parts are APPLIED. Part b
  (`0147_church_co_leaders_b.sql` — the removal function and the events
  table's foreign keys) carries `delete`, which stalls the Supabase MCP, so the
  owner pasted it into the SQL editor; verified live on 2026-10-28.

## Leadership sees members by name (0128)

**This section used to say "no per-member data, ever". The owner reversed it on
2026-10-21: "this is a tool for church leaders, names are important."**

The dashboard at `/church/:id/admin` now has **Overview** (members, active this
week vs quiet 7+ days, fourteen days of drop and church-verse play, series
completion, streak buckets, the live notice), **People** (every member by name:
last play, streak, plays this week, average church-verse score) and **Activity**
(the congregation's feed, scores included). It reads `church_leader_insights` and
`church_feed`, both gated to verified leadership of THAT church.

The argument that used to stand here — a pastor-facing view of who played and who
lapsed is the player-vs-player comparison with authority attached — is kept as
history, not as a rule. What survives of it: **members are never ranked against
each other.** Church competition is church against church, and there is no member
leaderboard anywhere.

## Small groups and group leaders (0151)

Verified leadership can sort members into small groups and mark group leaders
(People → Small groups). A group leader is NOT church leadership: they get one
card on their own church tab with their group's names and the week's approved
discussion questions, and no scores, no dashboard and no write access. Free
claims don't get groups, since they never see names. Full rules:
`docs/CHURCH-GROUPS.md`.

## The website field is validated server-side now

`update_my_church_profile` is the first writer of these columns that isn't us,
so the URL is checked rather than trusted: `https://`, `http://`, or a bare host
that gets `https://` prefixed. Anything carrying a different scheme
(`javascript:`, `data:`) is **refused**, not mangled.

`Detail` in `ChurchPageBody` already coerced a bare domain to `https://` and
therefore neutralised a `javascript:` string on that one render path — but a
second reader of the same column shouldn't have to know that, and
`public_church_page` (0074) is already a second reader.

## Operating it

Admin → Churches → **Church leadership**.

1. Find the church.
2. Enter the player's username and a note saying **how you verified them** —
   that note is the audit trail, and future-you will want it.
3. Grant. The player sees **✏️ Edit page** on that church instead of the
   "Add info" pill, on both the leaderboard sheet and `/church/:id`.
4. **Revoke** removes it. Their edits stay published; the ability to make new
   ones stops.

## The "This week" line (0120)

A claimed church's editor has one more field: **This week**, a single plain-text
line such as "This month we are in John". It appears inside the published
profile, above the about text, for everybody who opens the page, signed in or
not.

- **Who can write it:** only `update_my_church_profile`, which already refuses
  anyone who isn't verified leadership. The suggestion queue does not take it,
  and a stranger never sees an editor.
- **What it can be:** plain text with control characters collapsed, capped at
  140 characters on the server, rendered as text and never as HTML.
- **What it isn't:** there is no expiry and no date, and it earns no XP. Empty
  means the line is absent.
- **Older apps:** an app built before 0120 never sends the field, and a missing
  value means "leave it as it is", so saving the other five fields from an old
  build cannot wipe it.

## The invite link (0121)

The operator no longer needs the pastor's username.

1. In **Admin → Churches → Founding Churches**, choose **Copy leader invite
   link** for the church. You get
   `versearcade.org/church/<id>/claim#<code>`, one use, valid for 14 days.
2. Send it to the person you verified. **Verification is still yours:** the
   link only replaces the username relay.
3. They open it, make an account or sign in (the code is parked and
   `ChurchResume` brings them back once), and tap **Claim leadership**.
   `redeem_church_claim_code` checks the church, the expiry and that the code
   is unused, writes the `church_admins` row with `note = 'invite link · …'`,
   and burns the code. They land in Leadership tools.
4. Revoking is unchanged: Church leadership → Revoke.

How the code is protected:

- **Stored hashed.** The table holds only sha256 of the code, so a read of the
  table is not a working link.
- **Kept out of server logs.** It rides in the URL fragment, so it never
  reaches a server log or a Referer header.
- **Stripped from the address bar** as soon as the claim screen reads it.
- **Guessing is pointless.** `church_claim_preview` is anon-callable so the page
  can say "expired" before asking anybody to sign up, but a code is 244 random
  bits.

## Self-serve claim: claim → pay → verified (0134)

The operator queue was the bottleneck between a church wanting to pay and
being able to. The owner chose **pay = claim, guarded** over two alternatives
(member tools held for an operator OK; domain-matched email only).

**The flow.** `/church/:id` shows "Lead this church? Claim its page" while the
church is claimable → `/church/:id/claim` (no fragment) asks for role, name,
email and an "I'm on the staff or leadership" tick, signing the visitor up
first if needed (`setPendingClaim(id, '')` + `ChurchResume`) →
`start_church_claim` returns a one-time token → the web billing page opens in
**claim mode** (`/church-billing/?c=…`): card only, no invoice → Stripe
Checkout → back to `/church/:id/claim?paid=1`, which polls
`church_self_claim_status` until the webhook has made them leadership and
then opens `/church/:id/admin`.

**The guards, which are the whole design:**

- **Only an unled church.** Any `church_admins` row, or a live subscription,
  and the church is not claimable — checked when the claim starts, when the
  checkout opens (`claimFor` in the function) and under a row lock when the
  payment lands. That is the case where a stranger would take a congregation
  from its real leaders, and it still goes through "Add info".
- **Payment is the act.** Starting a claim grants nothing.
  `billing_activate_claim` (service_role only) writes the leadership row, and
  the webhook calls it only for an `active`/`trialing`/`past_due`
  subscription carrying the claim id.
- **Card required, even on the Founding trial.** An invoiced Founding
  subscription is live with no payment method at all, so claim mode refuses
  the invoice path (`card_required`) and sets
  `payment_method_collection=always`. Nothing is charged until Easter 2027;
  a card on Stripe's file is the identity signal.
- **First payment wins.** Two people may each open a checkout for one unled
  church. The second webhook finds leadership already there, marks its claim
  `conflict` and does **not** apply its subscription, so the first payer's
  billing row is never overwritten. The operator refunds the second in Stripe.
- **Five new claims per account per day.** A returning claimant reuses their
  pending claim with a fresh token (only the sha256 is stored).
- **App Store build: none of it** (`churchSelfClaimVisible` in
  `lib/commerce.ts`). The claim ends on a page with prices.

**The review is the trade.** Admin → Churches → **Self-serve claims** lists
every claim newest first (who, role, name, email, subscription), unreviewed
ones outlined in gold. **Looks right** files one; **Revoke** takes the
leadership back through `admin_revoke_church_admin`. Neither touches Stripe —
refund and cancel there, and the cancellation un-verifies the church through
the webhook. Until it is cancelled the church reads `paying` and nobody else
can self-claim it.

**Cancelling.** A claimant manages the subscription from their own leader
dashboard — **Manage billing →** opens Stripe's customer portal (0135,
`docs/CHURCH-PACKAGES.md` → "Billing"), and the billing page's claim-mode line
says so.

**Upgrading.** Since 2026-10-23 a paying church can switch between Verified
Church and Church Suite itself from **Manage billing**. See
`docs/CHURCH-PACKAGES.md` → "Billing".

## Free claim: three members, card on file or by hand (0137)

The owner added a free door beside the paid one on 2026-10-23. A church that
nobody leads can be claimed **for free once its page has at least three
members** (`church_free_claim_min_members()` ↔ `FREE_CLAIM_MIN_MEMBERS` in
`store/churchClaim.ts` and in `church-billing`, three copies to keep in sync).

**Two ways to prove it**, both chosen on `/church/:id/claim`:

- **Card on file.** `start_church_free_claim(…, 'card', …)` returns a one-time
  token; `church-billing` `{ action: 'setup', f }` creates a Stripe customer
  and a Checkout Session in **setup mode**, which is a $0 SetupIntent with no
  price and no subscription. When `checkout.session.completed` arrives with
  mode `setup`, the webhook calls `billing_activate_free_claim`
  (service_role only). The claimant comes back to `?carded=1`, which polls
  until they lead the church.
- **By hand.** Role, name, email and phone go into the queue under
  Admin → Churches → Self-serve claims, marked **needs review**. An email on
  the church website's own domain is flagged (`domain_match`), but it is still
  reviewed. **Approve** grants the claim through the same writer the card path
  uses (`church_grant_free_claim`); **Decline** closes it. A claimant whose
  request is waiting sees "your request is with us" and can switch to the card
  path to skip the wait.

**What a free claim grants:** leadership of an **unverified** church. That
means the Overview tab (`church_leader_summary`: members, active this week as
a percentage, and the average current streak, with no names attached) and the
one live notice on the church's page (`set_church_announcement`, unchanged).
Everything per member stays with **verified** leadership (`church_admin_can`).
The church stays unverified until it pays.

**What 0137 changed for verified leadership:** `church_leader_insights` now
returns the roster in **join order** rather than by last play, and its rows no
longer carry `active`. The People tab lost its All / Active / Quiet filter and
the coral colour on a lapsed streak. Names and last play stay, per the 0128
call. What is gone is any way to sort or filter the roster into a list of who
hasn't played.

**Guards inherited from 0134:** the church must have no leader and no live
subscription, the first claim to complete wins and a later one becomes a
`conflict`, an account can start five claims a day, and every claim stays
revocable.

**App Store build:** only the by-hand free claim is offered. The card path and
the plan both end on Stripe pages. The church page's "Lead this church?" link
shows there only while the free claim is open.

**Known gaps:** a church claimed for free can't upgrade itself to the paid
plan yet. The operator sends it a billing link (`admin_church_billing_link`).
The card path also needs the restricted Stripe key to be allowed to create
Checkout Sessions in setup mode; this was not tested against live Stripe before
merge.

## On the leader's own player card (0149)

A verified church's leader carries a quiet "Leads {church}" line on their
player card, and tapping it opens the church — Inquire and Join for a player
with no church, Visit for one with a church, the account wall for a guest.
Free claims and unverified churches get no line. Incoming notes appear on the
dashboard (Home and People). Full rules: `docs/CHURCH-DISCOVERY.md`.

