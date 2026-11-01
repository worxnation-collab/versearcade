-- 0177: the churches the caller leads.
--
-- A leader's dashboard lives at /church/:id/admin, and every door to it —
-- the church tab's "Leadership tools", the map's Leadership row (/church/lead)
-- — resolves through the church the caller BELONGS to. A pastor who leads two
-- campuses belongs to one of them, so the second had no door in the app at
-- all: the only way in was that church's own page, which nothing links to once
-- you already have a church. The dashboard now lists "You also lead" from this.
--
-- Read-only, the caller's own rows only (identity from auth.uid(), no user id
-- taken), and it returns nothing a leader can't already see on each church's
-- own leader screen: id, name, verified. Free claims are listed too, because a
-- free-claim leader has a dashboard (totals only) and a way to verify there.

create or replace function public.my_led_churches()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'verified', coalesce(c.verified, false))
                     order by a.granted_at nulls last, c.name)
    from church_admins a
    join churches c on c.id = a.church_id
    where a.user_id = uid
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.my_led_churches() from public, anon;
grant execute on function public.my_led_churches() to authenticated;
