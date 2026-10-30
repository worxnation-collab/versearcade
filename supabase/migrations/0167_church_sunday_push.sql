-- 0167: "Your church" — a Saturday-evening push naming TOMORROW's approved
-- church verse and the series day it belongs to:
--
--   "Tomorrow at St Mark's: Galatians 5:22, day 3 of Fruit of the Spirit"
--
-- Who: members of a VERIFIED church whose church has an APPROVED (never a
-- draft, never discarded) congregation verse for the member's own local
-- Sunday. No approved verse ⇒ nothing is sent, and nothing about the church
-- is said at all. The line names a verse, a series and a POSITION in that
-- series — never a count of people, plays or anything else.
--
-- When: Saturday evening at the member's usual play hour (0166's
-- profiles.week_push, which the device reports), held inside 17:00-21:00 so
-- a morning player hears it in the evening rather than at breakfast the day
-- before. No rhythm reported yet ⇒ no zone to be sure of ⇒ not sent.
--
-- Through push-send's deliver() as the kind 'church', so its own switch
-- (push_prefs.church) and quiet hours (0164) apply. Once a week by
-- construction: the claim stamps profiles.church_pushed_on with the local
-- Saturday in the same pass that hands the row out. Rides 0166's hourly
-- push-week-hourly job (push-send's `weekly` action runs both claims), so
-- there is no new cron.

alter table public.profiles
  add column if not exists church_pushed_on date;

create or replace function public.push_kinds()
returns text[] language sql immutable set search_path = public as $$
  select array['battle', 'buddy', 'gesture', 'answered', 'check_in', 'week', 'church']::text[]
$$;

-- The line for one member on one local Saturday, or null.
create or replace function public.church_push_line(p_user uuid, p_saturday date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_sunday date := p_saturday + 1;
  v_name text;
  v_church uuid;
  v_ref text;
  v_series text;
  v_day int;
begin
  select c.id, c.name into v_church, v_name
    from profiles p join churches c on c.id = p.church_id and c.verified
   where p.id = p_user;
  if v_church is null then return null; end if;

  select cv.reference, nullif(btrim(cv.series), '') into v_ref, v_series
    from church_verses cv
   where cv.church_id = v_church and cv.drop_date = v_sunday
     and cv.status <> 'draft' and cv.discarded_at is null
     and cv.visibility = 'congregation';
  if v_ref is null then return null; end if;

  if v_series is null then
    return jsonb_build_object('line', 'Tomorrow at ' || v_name || ': ' || v_ref || '.', 'url', '/church');
  end if;

  -- Its place in the series run, the 0130 window (thirty days back).
  select count(*) into v_day
    from church_verses cv
   where cv.church_id = v_church and cv.series = v_series
     and cv.status <> 'draft' and cv.discarded_at is null
     and cv.visibility = 'congregation'
     and cv.drop_date between v_sunday - 30 and v_sunday;

  return jsonb_build_object(
    'line', 'Tomorrow at ' || v_name || ': ' || v_ref || ', day ' || v_day || ' of ' || v_series || '.',
    'url', '/church');
end $$;

create or replace function public.church_push_claim(p_limit int)
returns table (recipient uuid, line text, url text, saturday date)
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
  cap int := greatest(1, least(coalesce(p_limit, 300), 1000));
  said jsonb;
begin
  for r in
    select p.id, (now() at time zone (p.week_push->>'tz'))::date as local_day
      from profiles p join churches c on c.id = p.church_id and c.verified
     where p.week_push is not null
       and extract(isodow from now() at time zone (p.week_push->>'tz')) = 6
       and extract(hour from now() at time zone (p.week_push->>'tz'))
           = greatest(17, least(21, (p.week_push->>'hour')::int))
       and p.church_pushed_on is distinct from (now() at time zone (p.week_push->>'tz'))::date
       and (exists (select 1 from push_subscriptions s where s.profile_id = p.id)
            or exists (select 1 from device_tokens d where d.profile_id = p.id and d.platform = 'ios'))
     for update of p skip locked
  loop
    exit when n >= cap;
    update profiles set church_pushed_on = r.local_day where id = r.id;
    said := public.church_push_line(r.id, r.local_day);
    if said is not null then
      recipient := r.id; line := said->>'line'; url := said->>'url'; saturday := r.local_day;
      n := n + 1;
      return next;
    end if;
  end loop;
end $$;

revoke all on function public.push_kinds() from public, anon, authenticated;
grant execute on function public.push_kinds() to service_role;
revoke all on function public.church_push_line(uuid, date) from public, anon, authenticated;
revoke all on function public.church_push_claim(int) from public, anon, authenticated;
grant execute on function public.church_push_line(uuid, date) to service_role;
grant execute on function public.church_push_claim(int) to service_role;
