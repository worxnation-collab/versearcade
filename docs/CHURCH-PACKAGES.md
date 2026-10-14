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
| Play tab (`ChurchTodayStrip`) | — | "chosen by your church", banner, giving link |
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
