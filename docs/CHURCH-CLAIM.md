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
