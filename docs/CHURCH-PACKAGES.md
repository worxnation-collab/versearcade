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

## How the daily loop should use the church verse

**Recommendation: don't replace the daily drop. Add a third box beside it.**

`getVerseForDate` is the same verse for every player forever, and a lot of things
are keyed off that fact:
- first light (0081)
- `daily_players`
- `submit_play` / `plays(user_id, drop_date)`
- the run lock's `daily:<date>` id
- the shared-link copy
- question seeding

Swapping the verse per church breaks all of them silently. It also makes the
"shared daily drop" a per-congregation thing.

So:

1. **Play tab** — when `my_church_today` returns a verse, render a
   "Your church this week" box next to the two daily boxes. Show the reference,
   the pastor's note, and a "Play it" button.
2. **Playable vs read-only** — the question generator needs `VERSE_POOL`
   metadata (`speaker`, `audience`, `before`, `after`, `facts`). If the
   church's reference resolves to a pool entry (`parseReference` /
   `citationBook`), "Play it" runs it as a **study-style** run through
   `QuizRunner`. That means `studyDrop`, no XP, no standing — the same as a
   replay. If it doesn't resolve, the box is read-only: verse text, note, and
   "Read the chapter" → `/bible`. A pastor picking a verse outside the pool is
   normal, and the box must still work.
3. **Announcements** — render as rows in `/mail`, the existing channel for
   operator text. Not a banner on Play.
4. **Fail closed** — no keys, guest, no church, unverified church, or a server
   without 0116 ⇒ the box renders nothing. Online-only, inherited from every
   other church store.

If the owner later wants it to *count* for the streak, that's a server change to
`submit_play` with its own argument, not a client swap.

## Production state (2026-10-13)

Applied in four parts: `0116_church_packages_a_columns`, `_b_billing`, and
`_c_verses` (the table only). The Supabase MCP's `apply_migration` hung on every
payload containing `CREATE POLICY`. The same SQL runs instantly when probed
directly, so the MCP transport is the problem, not the database.

**Still to apply:**
- the `church_verses` policies
- `church_announcements`
- `my_church_today`
- `church_members`
- `church_participation_7d`

The repo file is idempotent. **Paste all of `0116_church_packages.sql` into the
Supabase SQL editor once** and it completes. Until then, `church_verses` has RLS
on with no policies, which is fully locked, so the partial state fails closed.
