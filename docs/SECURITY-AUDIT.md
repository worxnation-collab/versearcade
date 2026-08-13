# Verse Arcade — Security Audit

_Date: 2026-08-13 · Scope: Supabase backend (schema, RLS, RPCs), client auth
flow, secret handling, CI/CD config. Live project checked with Supabase
security & performance advisors (`visuppaucpzzigwtqmdd`)._

## TL;DR

The good news for the "getting sued over user data" worry: **there is no leak of
sensitive PII.** No email addresses, passwords, payment data, real names, or
precise location are exposed anywhere. Emails live only in Supabase's `auth`
schema, which is never exposed through the API. Row Level Security is enabled on
every table, all scoring goes through `SECURITY DEFINER` functions, account
deletion is implemented correctly (Apple requirement), and the anon key that's
committed to the repo is a **public** key by design (RLS-protected) — that's not
a secret and its exposure is fine. No service-role key or private key is
committed.

The real issues are **abuse / data-integrity** vectors reachable by untrusted
callers, plus a few least-privilege and privacy hardening gaps. None are a
five-alarm breach, but two are worth fixing right away because they're reachable
by **anonymous** (not-signed-in) users and affect content shown to everyone.

Severity legend: 🔴 fix now · 🟠 fix soon · 🟡 hardening · 🟢 by design / info

---

## 🔴 Fix now

### 1. `ensure_daily_verse` was anonymously callable and had no auth check
The daily verse + quiz shown to **every** player is seeded by the client via
this RPC, "insert-if-absent." Because PostgREST grants `EXECUTE` to `PUBLIC` by
default and this function never checked `auth.uid()`, **anyone on the internet**
could pre-seed the shared `daily_verses` row for any future date with arbitrary
verse text, questions, and "facts" — poisoning the shared drop for the whole
user base (offensive text, wrong answers, etc.). First-writer-wins meant an
attacker just had to beat the legitimate seed.

**Fixed in `0016`:** requires a signed-in caller and refuses to seed dates beyond
tomorrow. **Durable fix (recommended):** move daily-verse generation to a
scheduled Edge Function / cron and revoke client write access entirely, so the
shared content is server-curated rather than client-supplied.

### 2. Anonymous leaderboard / feed poisoning via `record_guest_open`
Guests (unauthenticated) legitimately report their play through this RPC, which
writes into the **world-readable presence feed** and the **public leaderboard**.
The inputs were under-validated:
- `username` was only length-trimmed — an anonymous caller could inject arbitrary
  text or spoof another player's handle into everyone's feed.
- `xp` had no upper bound — a guest could claim billions of XP and permanently
  top the worldwide leaderboard.

**Fixed in `0016`:** username is restricted to the same safe charset/length as
real handles; XP is capped; level is derived server-side, never trusted. (React
escapes output, so this was not an XSS vector — the risk is impersonation, spam,
and board integrity.)

> Note: React's JSX escaping means none of the user-controlled strings are an
> XSS risk in the app today. Keep it that way — never render feed/username text
> with `dangerouslySetInnerHTML`.

---

## 🟠 Fix soon

### 3. Scoring is client-authoritative (XP can be fabricated)
Despite the code comments ("scoring is server-side so the client can't mint
points"), `submit_play`, `submit_group_play`, and `submit_practice` **trust the
score/XP the client sends.** A signed-in user can call the RPC directly with a
huge `p_score`/`p_correct` and mint unlimited XP — topping the leaderboard and
unlocking cosmetics that gate on progress. `claim_guest_progress` similarly lets
a brand-new account set arbitrary starting XP/level/streak.

This is a **fairness/integrity** problem, not a data breach — but it undermines
the leaderboard and any future monetization tied to progress.

- **Interim mitigation (shipped in `0016`):** `submit_play` now clamps score and
  counts to the maximum the scoring rules can actually produce, so the worst
  abuse (billions of XP) is blocked.
- **Durable fix (recommended):** the correct answers already live server-side in
  `daily_verses.questions`. Have the client submit its raw per-question answers
  (choice index + time), and recompute the score in `submit_play` from the answer
  key. Then the client value is never trusted. This is a real change and needs
  testing before shipping.

### 4. `profiles` table is fully readable by every signed-in user
```sql
create policy "profiles readable" on public.profiles
  for select using (auth.role() = 'authenticated');
```
This grants `SELECT *` on **every** profile row to any authenticated user —
including columns the UI never needs cross-user: `timezone`, `last_played_on`,
`last_chest_on`, notification/prefs flags, `streak_freezes`, `xp_boosts`,
`created_at`. No email or real name is here (low severity), but `timezone` +
activity dates leak per-user activity patterns, and exposing the economy fields
helps cheating.

I verified the client only reads **its own** profile directly (`.eq('id', uid)`);
all cross-user profile data (leaderboard, feed) already flows through
`SECURITY DEFINER` functions that don't rely on this policy. So this policy can
almost certainly be tightened to **owner-only** without breaking the app.

**Recommended:** replace the broad policy with a self-only `SELECT` policy, and —
if any cross-user public fields are ever needed directly — expose just
`(username, avatar_emoji, level, avatar_border, avatar_badge)` through a view.
_Not included in `0016`_ because production has objects not in the repo (see #7)
and I'd want to confirm nothing else reads `profiles` before changing it.

### 5. Enable leaked-password protection (and consider MFA)
Supabase advisor flags that **leaked-password protection is disabled**. For an
app with email/password sign-in and a growing user base, turning on the
HaveIBeenPwned check (Dashboard → Authentication → Policies) is a free, high-value
win. Consider requiring a minimum password strength and offering MFA.
Docs: https://supabase.com/docs/guides/auth/password-security

---

## 🟡 Hardening

### 6. Least privilege on all RPCs (default PUBLIC execute)
PostgREST grants `EXECUTE` to `PUBLIC` on every function by default, so **all**
RPCs — `delete_my_account`, `create_group`, `submit_play`, etc. — were reachable
by the anonymous role. Their internal `auth.uid()` guards meant most just errored
for anon, but least privilege says keep them off the anonymous surface entirely.
**Fixed in `0016`:** revoked PUBLIC/anon execute and re-granted only the intended
surface per role; `handle_new_user` (a trigger fn) removed from the RPC surface.

### 7. Migration drift — repo is not the source of truth ⚠️
The live database contains objects with **no committed migration**: the
`verse_reviews` table, the `is_group_member()` function, and a `group_members`
`SELECT` policy named differently than the repo's. This means (a) a code review of
the repo alone misses production objects, and (b) replaying the repo migrations
onto a fresh environment would **not** reproduce prod. Recommend: dump the live
schema (`supabase db pull`) into a migration so the repo matches production, and
apply all future changes as committed migrations only.

### 8. No rate limiting on anonymous RPCs
`record_guest_open`, `get_daily_pulse`, `get_leaderboard`, and `ensure_daily_verse`
are anon-callable and unthrottled — an attacker can flood `presence_events` /
`guest_opens` (feed spam + DB bloat/cost). Consider Supabase's built-in API rate
limits, a per-`guest_id`/day insert guard, or a periodic cleanup job for old
`presence_events`.

### 9. `function_search_path_mutable` on two functions
`level_from_xp` and `practice_bonus_xp` didn't pin `search_path`. Low risk (pure
math) but flagged by the advisor. **Fixed in `0016`.**

### 10. `join_group` code entropy
Join codes are 6 chars from a reduced alphabet. Fine for the feature's value, but
there's no attempt cap — a determined attacker could brute-force group membership.
Low priority; add a lookup rate limit if groups ever carry anything sensitive.

---

## 🟢 By design / confirmed good

- **No PII exposure.** No email/password/payment/real-name/precise-location data
  is reachable via the API. `auth.users` is never exposed.
- **Committed anon key is public by design** (RLS-protected). Correctly documented
  as such in `codemagic.yaml`. No service-role key or private key is committed;
  the Apple secret script takes secrets as CLI args and stores nothing.
- **RLS enabled on every table**; writes locked to the owner; scoring via
  `SECURITY DEFINER` functions with pinned `search_path`.
- **Account deletion** (`delete_my_account`) is correct and properly scoped.
- **Username login** goes through an Edge Function so the email never reaches the
  browser (the function's own source isn't in this repo — worth a separate review
  to confirm it validates the password server-side and rate-limits attempts).
- `guest_opens` has RLS enabled with no policy (advisor INFO) — intentional; only
  the `SECURITY DEFINER` RPC touches it.

## Performance notes (relevant "as the user base grows")
Not security, but the advisor flagged scale issues worth batching in later:
- RLS policies re-evaluate `auth.uid()` per row — wrap as `(select auth.uid())`.
- Several foreign keys are unindexed (`answers.play_id`, `group_members.user_id`,
  `group_plays.user_id`, `groups.owner_id`, `user_collectibles.collectible_id`).
- Duplicate permissive policies on `practice_plays` (a `for all` + a `for select`).

---

## What's in migration `0016_security_hardening.sql`
Safe, non-breaking, idempotent. Covers findings **#1, #2, #6, #9** and the interim
mitigation for **#3**. **It has NOT been applied to production** — it's a
reviewable migration file. Apply via your normal migration pipeline (or
`supabase db push`) after review.

Still needs a decision / follow-up work: **#3** (server-authoritative scoring),
**#4** (tighten `profiles` read), **#5** (auth dashboard toggles), **#7**
(reconcile migration drift), **#8** (rate limiting).
