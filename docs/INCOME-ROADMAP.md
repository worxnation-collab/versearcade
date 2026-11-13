# Income roadmap

The working list the recurring research pass reads and updates (the owner's
standing request, 2026-11-11). One rule above every idea here: **Verse Arcade
does not make money out of religion.** No paywalled scripture or faith
content, no ads that trade on faith, no pay-to-win, and nobody ranked so that
a person loses. Income comes from tools organisations pay for, looks people
choose to buy as a thank-you, and the reach the content earns.

Each pass: pick the top open lead, work it with real data, ship what is small
and safe (merge when green), propose what is big, and record the result here.

## Where we stand (measured 2026-11-11, production)

| | |
|---|---|
| Accounts | 192 (8 new in 30 days, 2 in 7) |
| Active | 18 this week, 27 this month |
| Never played once | 53 (28%) |
| Daily-verse plays | 45 this week, 44 the week before |
| Players in a church | 34, in 5 churches active this week |
| Churches | 26, 2 verified |
| Church subscriptions | 1 active, 1 trialing, 1 cancelled |
| Founding patron | 1 buyer |
| Come-back emails | 81 sent, 3 clicked (3.7%) |
| Sign-ups attributed to a social network | **0, ever** |

**The church side is the business**, and it is the side the rule above is
comfortable with: a pastor buys a tool that saves them hours a week, and no
player pays anything. One paying church is worth more than every patron
purchase to date.

## The market (researched 2026-11-11)

- **Church content tools sell at $39–129/mo, self-serve.** Pulpit AI
  (Subsplash) $39/$59/$129 by sermons a month; Gloo Content Studio ~$65/$100;
  Sermon Shots $49; all with a 14-day trial and no sales call. RightNow Media
  prices by attendance ($155/mo for 101–200 people). None has a game the
  congregation plays all week, which is ours alone.
- **Our Church Suite is $39/mo ($390/yr)** — the bottom of that band — and
  every church that signs up before Easter 2027 is a Founding Church, free
  until 2027-03-29, then billed automatically (`church-billing`). (An earlier
  note here said $48: that is the old two-line base + add-on, not the plan
  the billing page sells.)
- **Consumer subscriptions can't be the engine at our size**: freemium
  converts ~2% (RevenueCat 2026); 2% of 8 sign-ups a month is nothing.
  Ethical faith-app models that work: YouVersion (free, donations), Hallow
  ($69.99/yr), Dwell ($59.99/yr). Trivia apps live on ads; we will not.
- **Adjacent buyers pay per seat**: Christian school Bible courses $149–169
  per seat per semester (CSI), homeschool $99.95/yr per course (Monarch),
  youth curriculum ~$469/yr for 50 users (Lifeway).
- **Shorts links**: only the "Related video" link under a Short is tappable
  (to your own long-form video, whose description link IS clickable), plus
  channel-banner links. One creator measured ~10% tap-through on it.

## Leads, highest value first

### 1. Turn Shorts views into sign-ups — needs the owner (≈1 hour)
~900 views a Short, zero sign-ups ever (attribution verified working
2026-11-11: nobody follows the link, because Shorts links are not tappable).
- One 2–4 minute long-form "How to play today's verse" video with
  `versearcade.org/play?src=yt-related` first in its description.
- Set every Short's **Related video** to it (YouTube Studio, desktop).
- Banner link `versearcade.org/play?src=yt-banner`.
- The video end cards already say "Play today's verse" over
  `versearcade.org` on every layout (checked 2026-11-11), so the engine is not
  the leak; the missing piece is a tappable path, which only Studio can add.
  The Data API cannot set a Short's related video or banner links.
- Status: **waiting on the owner** — step-by-step with a ready script in
  `docs/YOUTUBE-FUNNEL.md`.

### 2. Make the church plan self-serve and sell it to churches that play
34 players sit in 5 active churches. Billing, claim and drafting all exist.
- A 14-day trial with no call, said plainly on the plans page; annual at a
  discount (already: $290 vs $348).
- **Shipped 2026-11-11: "Know another pastor?"** on the leader dashboard's
  Home — one tap sends /churches with the leader's referral code and
  `?src=pastor-ref`, so the channel is measurable. Read
  `select count(*) from profiles where signup_source='pastor-ref'`.
- Price: kept at $39 (inside the market band; nobody is billed before Easter
  2027 anyway). A referral "free month" is meaningless while every new church
  is free until Easter — revisit in March 2027.
- **Warmest leads (measured 2026-11-11 20:55 UTC):** Real Life On The
  Palouse (4 members, 3 active in 14 days) and Connect Church in Opelika, AL
  (2 members, both active). Nobody leads either. Palouse's revoked free claim
  of 2026-10-23 was the OPERATOR'S OWN TEST (checked 2026-11-12) — no real
  pastor was turned away, so the lead is the congregation, not a claimant.
- The in-app asks are not producing on their own: 0 claims and 0 join
  inquiries in 14 days, and `pastor-ref` has no sign-ups yet (it shipped
  today). Pilots will come from the owner's own outreach first
  (`docs/PILOT-CHURCH.md` §1A), not from the funnel.

### 3. A classroom license (schools, homeschool co-ops, youth groups)
Reuses the church dashboard: a teacher assigns a book's trivia round and sees
the class's progress, never a ranking. Market: $5–10 a student a year or
$99–299 a class, well under what curricula charge.
- Status: idea; a proposal for the owner when the church plan is selling.

### 4. 28% of accounts never play once — CLOSED
All 53 were created before the first-stop fix (`lib/firstStop.ts`,
2026-10-30); both accounts made since have played. Deliberately NOT emailing
the 53: cold mail to accounts that never engaged is how a sending domain gets
marked as spam for every email this app sends.

### 5. "Keep it free" support beside the founding patron
Optional monthly support labelled as covering servers and AI, the reward a
look and never an edge (YouVersion's model at our scale: ~$50–300/mo).
- Status: idea; needs the owner's yes before anything is priced.

**Not doing**: ads, consumer paywalls, sponsored placements.

## Done
- 2026-11-13 (12:52 UTC) — research pass: unchanged (192 accounts, 0 new in a day,
  19 active this week, 0 attributed sign-ups, 0 inquiries, 0 plan taps; the two
  church claims are October's, both revoked). No new lead is worth building
  until the three waiting on the owner land: church addresses + Resend key, the
  long-form YouTube video, and the Claude in Chrome Studio run.
- 2026-11-13 (08:52 UTC) — research pass: unchanged (192 accounts, 19 active
  this week, 0 from any tracked funnel). Two leads moved today:
  **Lead 2 outreach:** neither warm church has a public email. Real Life On
  The Palouse is a campus of Real Life Ministries (site liferotp.com; the
  ministry's only public inbox is pastoral care, not for this); Connect
  Church, Opelika (2900 Waverly Pkwy) points people to Facebook. A draft
  email is ready; it waits on a real address from the owner and a Resend key
  this side. **Lead 1:** the Studio steps were handed to Claude in Chrome as
  a prompt; the long-form explainer video still has to be recorded by the
  owner. Check `yt-related` / `yt-banner` a week after it is live.
- 2026-11-13 (00:52 and 04:52 UTC) — research passes: unchanged. 192 accounts, 0 new in
  a day, 18 active this week (from 20), 0 `pastor-ref`, 0 claims, 0 join
  inquiries, 0 plan-page taps in 14 days. Nothing to ship.
- 2026-11-12 (16:52 and 20:52 UTC) — research passes: unchanged for the
  fourth pass running. 192 accounts, 0 new in a day, 20 active this week, 0 `pastor-ref`,
  0 claims, 0 join inquiries, 0 plan-page taps in 14 days. Nothing to ship;
  both owner actions (lead 1 Studio links, lead 2 outreach) still gate it.
- 2026-11-12 (08:52 UTC) — research pass: unchanged. 192 accounts, 0 new
  in a day, 19 active this week, 0 `pastor-ref`, 0 claims, 0 join inquiries,
  0 plan-page taps. Nothing to ship.
- 2026-11-12 (04:52 UTC) — research pass: unchanged. 192 accounts (2 new in
  2 days, neither attributed), 20 active this week, 0 `pastor-ref`, 0 claims,
  0 join inquiries, 0 plan-page taps in 14 days. Nothing to ship; the two
  owner actions (lead 1 Studio links, lead 2 outreach) are still the whole
  bottleneck.
- 2026-11-12 — research pass: the funnel is still at zero (no `pastor-ref`
  sign-ups, no claims or join inquiries in 2 days, no plan-page taps in 14
  days, no new accounts in a day); the Palouse claim was an operator test. The
  plans page already says "Free through Easter 2027". No code change: the
  bottleneck is traffic (lead 1, YouTube Studio) and the owner's outreach to
  the two warm churches (lead 2), not the product.
- 2026-11-11 — research pass: named the two warmest pilot churches and the
  revoked Palouse claim (lead 2); no code change, nothing safe to ship.
- 2026-11-11 — "Know another pastor?" on the leader Home (lead 2); confirmed
  the never-played leak is already closed (lead 4); kept the suite at $39.
- 2026-11-11 — measured the baseline above; found the attribution gap is a
  traffic problem, not a code bug; researched the market (sources in the PR).
