-- 0168: "Come back" — one push to a player who has not played in seven days,
-- naming TODAY's verse reference and nothing else.
--
--   title "Today's verse"   body "Jonah 2:1"
--
-- No guilt, no streak, no count of days away: the push says what is waiting,
-- not what was missed. The words are not chosen here at all — push-send looks
-- the reference up in its generated copy of the app's rotation
-- (push-send/verseOrder.ts, checked against getVerseForDate in `npm run
-- build`), for the player's own local date.
--
-- ONCE PER ABSENCE, by construction: the claim stamps
-- profiles.comeback_pushed_for with the player's last_played_on, and only a
-- player whose stamp differs from their last_played_on is due. Playing moves
-- last_played_on, which is what makes them due again after their NEXT seven
-- quiet days — and nothing else does. A second week away sends nothing.
--
-- When: the player's usual play hour in their own zone (0166's
-- profiles.week_push); no rhythm reported ⇒ no zone to be sure of ⇒ not sent.
-- A player who has never played (last_played_on null) is never asked to come
-- BACK. Through push-send's deliver() as kind 'comeback', so its own switch
-- (push_prefs.comeback) and quiet hours (0164) apply. Rides 0166's hourly
-- push-week-hourly job: no new cron.

alter table public.profiles
  add column if not exists comeback_pushed_for date;

create or replace function public.push_kinds()
returns text[] language sql immutable set search_path = public as $$
  select array['battle', 'buddy', 'gesture', 'answered', 'check_in', 'week', 'church', 'comeback']::text[]
$$;

create or replace function public.comeback_push_claim(p_limit int)
returns table (recipient uuid, local_day date)
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
  cap int := greatest(1, least(coalesce(p_limit, 300), 1000));
begin
  for r in
    select p.id, p.last_played_on, (now() at time zone (p.week_push->>'tz'))::date as today
      from profiles p
     where p.week_push is not null
       and p.last_played_on is not null
       and p.last_played_on <= (now() at time zone (p.week_push->>'tz'))::date - 7
       and p.comeback_pushed_for is distinct from p.last_played_on
       and extract(hour from now() at time zone (p.week_push->>'tz')) = (p.week_push->>'hour')::int
       and (exists (select 1 from push_subscriptions s where s.profile_id = p.id)
            or exists (select 1 from device_tokens d where d.profile_id = p.id and d.platform = 'ios'))
     for update of p skip locked
  loop
    exit when n >= cap;
    update profiles set comeback_pushed_for = r.last_played_on where id = r.id;
    recipient := r.id; local_day := r.today;
    n := n + 1;
    return next;
  end loop;
end $$;

revoke all on function public.push_kinds() from public, anon, authenticated;
grant execute on function public.push_kinds() to service_role;
revoke all on function public.comeback_push_claim(int) from public, anon, authenticated;
grant execute on function public.comeback_push_claim(int) to service_role;
