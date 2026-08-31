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

## No per-member data. Ever, without a deliberate decision

This is the rule most likely to be broken by someone adding "just a small
dashboard", so it is written here as well as in the migration.

A congregation's roster deliberately carries no per-person numbers — "a crowd,
not a ladder" (`get_church_page`). A pastor-facing view of who played, how
often, and who has lapsed is that exact shape **with authority attached**: the
person who played less becomes visible to their minister as having played less.
That is worse than player-vs-player comparison, in an app whose whole premise is
that no feature needs a loser.

A leader already sees the two aggregates that exist and are public to everyone
anyway: how many people are in the congregation, and what the church has banked.
Anything beyond that must be an aggregate with a small-count floor (suppress
under ~5 members, so a count can never identify one person), and adding one is a
deliberate decision to be argued for — not a convenience that arrives inside a
leadership screen.

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
