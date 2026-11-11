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
- **We are at the bottom of that band**: Verified $29/mo ($290/yr) + Content
  Generation $19/mo = $48/mo for the suite.
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
- The engine can say "search Verse Arcade" in the end card for free.
- Status: waiting on the owner for the YouTube Studio steps; the end-card
  line is ours to do.

### 2. Make the church plan self-serve and sell it to churches that play
34 players sit in 5 active churches. Billing, claim and drafting all exist.
- A 14-day trial with no call, said plainly on the plans page; annual at a
  discount (already: $290 vs $348).
- A "send this to another pastor" link for verified leaders, a free month per
  church that joins (needs a Stripe coupon: the owner's call).
- Price: the market supports $39–59 entry. **Owner decision**, not ours.
- Status: open.

### 3. A classroom license (schools, homeschool co-ops, youth groups)
Reuses the church dashboard: a teacher assigns a book's trivia round and sees
the class's progress, never a ranking. Market: $5–10 a student a year or
$99–299 a class, well under what curricula charge.
- Status: idea; a proposal for the owner when the church plan is selling.

### 4. 28% of accounts never play once
53 accounts never finished a verse; every later stage starts from a player.
- Next: check the first-stop redirect (`lib/firstStop.ts`) on today's build;
  a welcome email that is the verse itself.
- Status: open.

### 5. "Keep it free" support beside the founding patron
Optional monthly support labelled as covering servers and AI, the reward a
look and never an edge (YouVersion's model at our scale: ~$50–300/mo).
- Status: idea; needs the owner's yes before anything is priced.

**Not doing**: ads, consumer paywalls, sponsored placements.

## Done
- 2026-11-11 — measured the baseline above; found the attribution gap is a
  traffic problem, not a code bug; researched the market (sources in the PR).
