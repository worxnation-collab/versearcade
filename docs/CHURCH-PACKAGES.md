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

## How the daily loop uses the church verse (built, 0117)

**The owner's call, made after the recommendation against it:** a verified
church's scheduled verse REPLACES the global drop for its members. It is built
so that nothing else in the app can tell:

- **`dropDate` stays the real date.** Everything keyed on the date is unchanged:
  the streak, `plays`, first light, the run lock (`daily:<date>`), `submit_play`.
- **`ensure_daily_verse` still writes the GLOBAL verse.** That row is the day's
  shared record, and one congregation must not overwrite it.
- **Only a verse the pool carries can be a drop.** The question generator needs
  the seed's metadata. `aboutVerseSeed` resolves the reference, and anything it
  can't resolve leaves the drop global. The church's verse is then shown to READ
  in the Play-tab strip instead.
- **Questions are seeded on church + date** (`churchVerseForDate`), so everyone
  in one congregation gets the same five that day.
- **2.5 second deadline.** `useChurchToday` gives up after 2.5s, and a slow call
  means the global verse. A church can make the drop different but never late.
- **What the player sees:** the drop box says "Chosen by {church} for its
  members" instead of "Same verse everyone's playing", the run wears a
  `⛪ {church}` pill, and the strip under the boxes carries the pastor's note.
- **Mid-day edits:** if an admin changes the verse mid-day, a parked run is
  discarded rather than mixed, because `runProgress` pins a run to its reference.

## The discovery and membership surfaces (0117)

| Surface | Free | Verified |
|---|---|---|
| `/churches/find` (public directory, map: "Find a church") | listed, tagline | + badge. **Never sorted first.** |
| `/church/:id` profile | announcement, Join button, share link | + badge, logo, giving link, invite QR |
| Play tab (`ChurchTodayStrip`) | — | church verse + note, banner, giving link |
| Daily drop | global verse | church verse (if in the pool) |

**About the giving link:**
- It is decided by `givingLinkVisible()` in `lib/commerce.ts`, and is **hidden in
  the App Store build**. Guideline 3.2.2(iv) allows non-nonprofit donation links
  only "outside of the app, such as via Safari", and the in-app browser is
  SFSafariViewController.
- It opens with `rel="noopener noreferrer"`.
- The URL is https-only twice: once by the column constraint, and once again in
  `safeHttps` on the client.

## Production state (2026-10-13)

Applied in four parts: `0116_church_packages_a_columns`, `_b_billing`, and
`_c_verses` (the table only). The Supabase MCP's `apply_migration` hung on every
payload containing `CREATE POLICY`. The same SQL runs instantly when probed
directly, so the MCP transport is the problem, not the database.

**Update, same day:** the announcements table, the `church_members` view,
`church_participation_7d`, and all of 0117 except its policies applied fine in
smaller pieces. Every app read goes through `security definer` functions, so the
app works without the policies. **Only the RLS policies are still missing**;
the admin dashboard's direct table writes need them. Paste this once into the
SQL editor:

```sql
create policy church_verses_member_read on public.church_verses
  for select to authenticated using (public.is_church_member(church_id));
create policy church_verses_admin_insert on public.church_verses
  for insert to authenticated
  with check (public.is_church_admin(church_id) and public.church_is_verified(church_id));
create policy church_verses_admin_update on public.church_verses
  for update to authenticated using (public.is_church_admin(church_id))
  with check (public.is_church_admin(church_id) and public.church_is_verified(church_id));
create policy church_verses_admin_delete on public.church_verses
  for delete to authenticated using (public.is_church_admin(church_id));
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

The original list, for the record:
- the `church_verses` policies
- `church_announcements`
- `my_church_today`
- `church_members`
- `church_participation_7d`

The repo file is idempotent. **Paste all of `0116_church_packages.sql` into the
Supabase SQL editor once** and it completes. Until then, `church_verses` has RLS
on with no policies, which is fully locked, so the partial state fails closed.

## The admin dashboard (0118)

`/church/:id/admin` (`features/church/admin/`). It's reached from "⛪ Leadership
tools" on your own church card and on the church's page, and drawn only for
someone `church_admin_settings` says leads THIS church. Every RPC re-checks
leadership server-side, so the route is a door, not a lock.

| Panel | Who | What |
|---|---|---|
| Verse | verified | Schedule a verse (pick from the library or type one), an optional note, start/end dates, and a live preview of the member's Play tab. It says up front whether members will PLAY it (in the pool) or READ it. |
| How we're doing | verified | Members, played at least once this week, and live-streak buckets (1–3, 4–6, 7–29, 30+, none). **All floored at 5 members.** Plus the opt-in check-in list, with Copy (and CSV download on the web). |
| Notices | any claimed church | ONE live notice; a new one replaces the last. Giving link: verified only, https only, and hidden in the App Store build. |

**The check-in list is opt-in** (`profiles.church_care_optin`, off by default,
set only by the member through `set_church_care_optin`). A member shows up only
if they said yes AND haven't played in 3+ days. The list gives a name and a
last-active date and nothing else. That was the owner's choice of the three
options offered, and it is why the list may exist next to CLAUDE.md's "no
per-member data for leadership".

A streak counts as **live** only if its owner played today or yesterday.
`current_streak` is only rewritten on the next play, so a stale 40 belongs to
somebody who has already stopped and is counted as "not on a run".

**Still to paste** (the MCP can't apply destructive statements from this
session). Add this beneath the policy block above:

```sql
create or replace function public.delete_church_verse(p_verse_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_church uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select church_id into v_church from public.church_verses where id = p_verse_id;
  if v_church is null then return jsonb_build_object('ok', true); end if;
  if not public.is_church_admin(v_church) then
    return jsonb_build_object('ok', false, 'reason', 'not_leadership');
  end if;
  delete from public.church_verses where id = p_verse_id;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.delete_church_verse(uuid) to authenticated;
```

Until it is pasted, "Remove" on a scheduled verse says it couldn't be removed;
nothing else is affected.
