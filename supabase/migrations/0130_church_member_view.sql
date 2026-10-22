-- 0130 — The member's church: a series as an ARC, and "this week in our church".
--
-- Two readers for members (and leadership) of a VERIFIED church. Nothing is
-- written, nothing is stored, and no existing function is restated.
--
-- 1. `my_church_series(p_local_date)` — the days of the series the member's
--    church is in right now, so a series reads as one connected run rather than
--    isolated drops. 0128's `my_church_verse` only answers on a day that HAS a
--    church verse, and only with counts; a member could not see the arc on a
--    gap day, could not see a series that starts tomorrow, and could not see
--    WHICH days they played. Members cannot read `church_verses_range`
--    (leadership only), hence this.
--
--    Which series: today's verse's, else one running across today (days before
--    AND after it), else the next one starting within seven days, else one that
--    ended in the last three. Series names repeat across years ("Advent"), so a
--    series is that name's approved days within thirty days either side.
--
--    A FUTURE day carries its date and nothing else — no reference, no text, no
--    questions. Leadership can still edit an approved day before it comes, and
--    the run is the place a verse is met.
--
-- 2. `church_week_summary(p_church_id)` — church TOTALS for the current week
--    (the rivalry's UTC week, so it agrees with the board's "This week"):
--    members, members who played the church verse, members who played the daily verse,
--    and how many church-verse days the week has had. Player counts under
--    FIVE come back null, the 0119 floor (`get_church_participation`), so a
--    small congregation never gets a number that points at two people. It never
--    groups by member: there is no "most plays this week" here, and the
--    guarantee is that the query is never built.
--
-- Both skip drafts and anything not visible to the congregation, exactly as
-- 0127's `church_verse_today` and 0128's readers do. Purely additive: two new
-- functions, nothing removed, no policies. Idempotent.

create or replace function public.my_church_series(p_local_date date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_date   date := least(greatest(coalesce(p_local_date, current_date), current_date - 1), current_date + 1);
  v_church public.churches%rowtype;
  v_series text;
  v_days   jsonb;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select c.* into v_church
    from public.profiles p join public.churches c on c.id = p.church_id and c.verified
   where p.id = uid;
  if not found then return null; end if;

  with live as (
    select drop_date, series from public.church_verses
     where church_id = v_church.id and series is not null
       and status <> 'draft' and visibility = 'congregation'
       and drop_date between v_date - 30 and v_date + 30
  )
  select l.series into v_series
    from live l
   where l.drop_date between v_date - 3 and v_date + 7
   order by
     case
       when l.drop_date = v_date then 0
       when exists (select 1 from live a where a.series = l.series and a.drop_date < v_date)
        and exists (select 1 from live b where b.series = l.series and b.drop_date > v_date) then 1
       when l.drop_date > v_date then 2
       else 3
     end,
     case when l.drop_date > v_date then l.drop_date - v_date else v_date - l.drop_date end
   limit 1;
  if v_series is null then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'date',      cv.drop_date,
           'reference', case when cv.drop_date <= v_date then cv.reference end,
           'played',    cvp.user_id is not null,
           'today',     cv.drop_date = v_date) order by cv.drop_date), '[]'::jsonb)
    into v_days
    from (select * from public.church_verses
           where church_id = v_church.id and series = v_series
             and status <> 'draft' and visibility = 'congregation'
             and drop_date between v_date - 30 and v_date + 30
           order by drop_date limit 21) cv
    left join public.church_verse_plays cvp
      on cvp.user_id = uid and cvp.drop_date = cv.drop_date and cvp.church_id = cv.church_id;

  return jsonb_build_object(
    'church_id',   v_church.id,
    'church_name', v_church.name,
    'series',      v_series,
    'today',       v_date,
    'days',        v_days);
end;
$$;
revoke all on function public.my_church_series(date) from public, anon;
grant execute on function public.my_church_series(date) to authenticated;

create or replace function public.church_week_summary(p_church_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  floor_n   constant int := 5;   -- keep in sync with get_church_participation (0119)
  v_start   timestamptz := public.church_rivalry_week_start(public.church_rivalry_week());
  v_members int;
  v_verse   int;
  v_drop    int;
  v_days    int;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public.church_insider(p_church_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;

  select count(*) into v_members from public.profiles where church_id = p_church_id;

  select count(distinct cvp.user_id) into v_verse
    from public.church_verse_plays cvp
    join public.profiles m on m.id = cvp.user_id and m.church_id = p_church_id
   where cvp.church_id = p_church_id and cvp.created_at >= v_start;

  select count(distinct pl.user_id) into v_drop
    from public.plays pl
    join public.profiles m on m.id = pl.user_id and m.church_id = p_church_id
   where pl.created_at >= v_start;

  select count(*) into v_days
    from public.church_verses
   where church_id = p_church_id and status <> 'draft' and visibility = 'congregation'
     and drop_date between (v_start at time zone 'UTC')::date and current_date;

  return jsonb_build_object(
    'ok',            true,
    'week_start',    v_start,
    'floor',         floor_n,
    'members',       v_members,
    'verse_players', case when v_verse >= floor_n then v_verse end,
    'drop_players',  case when v_drop  >= floor_n then v_drop end,
    'verse_days',    v_days);
end;
$$;
revoke all on function public.church_week_summary(uuid) from public, anon;
grant execute on function public.church_week_summary(uuid) to authenticated;
