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

## Leads, highest value first

### 1. Social views turn into zero sign-ups — FIX THE FUNNEL
YouTube delivers ~900 views a Short and is the only network with reach, but
no account has ever arrived through a tracked link. The attribution code is
sound (verified 2026-11-11: `captureSource` runs at boot, `set_signup_source`
is live and granted, the `/play?src=` link resolves 200), so the honest
reading is that nobody follows the link. YouTube does not make links in
Shorts descriptions or comments clickable; the link only works from the
channel's own profile.
- Next: put the app on screen and in words in the end card (a spoken
  "search Verse Arcade"), use Shorts' related-video link to a long-form video
  that carries a clickable link, and the channel-header link. Measure with a
  distinct `?src=yt-header` etc.
- Status: open.

### 2. Sell the church plan to churches that already play
34 players sit in churches, and the "ask your pastor" card exists. Verified
church + Content Generation is the product; the free claim exists.
- Next: find the churches with the most active players and give each pastor
  a reason to look (the pilot-church pipeline, `docs/PILOT-CHURCH.md`).
- Status: open.

### 3. 28% of accounts never play once
53 accounts made an account and never finished a verse. Every later stage of
the funnel (church, patron) starts from a player.
- Next: check the first-stop redirect (`lib/firstStop.ts`) on today's build;
  a welcome email that is the verse itself.
- Status: open.

### 4. The patron card sells one look; the wardrobe is now a reason to visit
The layered wardrobe shipped 2026-11-11 (PR #440). A supporter look in the
new art (a cosmetic, earned nothing, thanked publicly nowhere) could sit
beside the founding patron. Constraint: never a gameplay edge, never sold to a
guest, IAP on native.
- Status: idea; needs the owner's yes before anything is priced.

## Done
- 2026-11-11 — measured the baseline above; found the attribution gap is a
  traffic problem, not a code bug.
