-- 0181 — Playing your church's verse builds your church (the owner's call,
-- 2026-11-14).
--
-- Until now the church verse (0128) paid nothing: it was the one daily thing a
-- member did FOR their church that the church never felt. Now a finished
-- church verse adds points to the church's building — NEW points, minted for
-- the church, never taken out of the player's own giving budget
-- (`church_points_available` reads xp minus church_contributions, and this
-- touches neither), so Give stays the player's free choice.
--
--   * 50 per member per day, flat. What is paid for is turning up, not doing
--     well — the battle-XP rule — and the score is client-sent, so a flat
--     amount is also what keeps a forged score from growing a building.
--   * +150 once for finishing a SERIES: the play that lands on the series'
--     last live day, when the member played every live day of it (at least
--     three). It rewards following the pastor's whole plan.
--   * Once per day by the existing primary key (user_id, drop_date): a second
--     submit inserts nothing and pays nothing.
--   * The points are stored ON the play row (`church_points`), so the ledger
--     is the play itself, and the board's windows and the weekly rivalry sum
--     it like the other three ledgers. Still a church total: nothing here
--     groups by user.
--
-- Approved iOS builds already call submit_church_verse_play, so every
-- installed app starts building churches the moment this is applied.

alter table public.church_verse_plays
  add column if not exists church_points integer not null default 0;

create or replace function public.submit_church_verse_play(
  p_local_date date, p_score integer, p_correct integer, p_total integer, p_time_ms integer default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  v_date date := least(greatest(coalesce(p_local_date, current_date), current_date - 1), current_date + 1);
  v_church uuid;
  v_series text;
  v_n int;
  v_days int;
  v_played int;
  v_points int := 50;
  v_bonus int := 0;
  v_before int;
  v_row public.churches%rowtype;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select c.id into v_church
    from public.profiles p join public.churches c on c.id = p.church_id and c.verified
   where p.id = uid;
  if v_church is null then return jsonb_build_object('ok', false, 'reason', 'no_church'); end if;
  select cv.series into v_series from public.church_verses cv
   where cv.church_id = v_church and cv.drop_date = v_date
     and cv.status <> 'draft' and cv.visibility = 'congregation' and cv.discarded_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_verse');
  end if;
  if p_total is null or p_total < 1 or p_total > 10
     or p_correct is null or p_correct < 0 or p_correct > p_total
     or p_score is null or p_score < 0 or p_score > 10000 then
    return jsonb_build_object('ok', false, 'reason', 'bad_result');
  end if;

  insert into public.church_verse_plays (user_id, drop_date, church_id, score, correct, total, time_ms)
  values (uid, v_date, v_church, p_score, p_correct, p_total,
          case when p_time_ms between 0 and 3600000 then p_time_ms end)
  on conflict (user_id, drop_date) do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return jsonb_build_object('ok', true, 'already', true, 'church_points', 0);
  end if;

  -- A series finished: today is its last live day and every live day of it
  -- (thirty days back, the 0130 window) was played by this member.
  if v_series is not null and not exists (
       select 1 from public.church_verses cv
        where cv.church_id = v_church and cv.series = v_series
          and cv.status <> 'draft' and cv.visibility = 'congregation' and cv.discarded_at is null
          and cv.drop_date > v_date and cv.drop_date <= v_date + 30) then
    select count(*), count(cvp.user_id) into v_days, v_played
      from public.church_verses cv
      left join public.church_verse_plays cvp
        on cvp.user_id = uid and cvp.drop_date = cv.drop_date and cvp.church_id = cv.church_id
     where cv.church_id = v_church and cv.series = v_series
       and cv.status <> 'draft' and cv.visibility = 'congregation' and cv.discarded_at is null
       and cv.drop_date between v_date - 30 and v_date;
    if v_days >= 3 and v_played = v_days then v_bonus := 150; end if;
  end if;
  v_points := v_points + v_bonus;

  update public.church_verse_plays set church_points = v_points
   where user_id = uid and drop_date = v_date;

  select xp into v_before from public.churches where id = v_church for update;
  update public.churches set xp = xp + v_points where id = v_church returning * into v_row;

  return jsonb_build_object(
    'ok', true, 'already', false,
    'church_points', v_points,
    'series_bonus', v_bonus,
    'leveled_up', public.church_level_from_xp(v_row.xp) > public.church_level_from_xp(v_before),
    'church', public.church_json(v_row));
end;
$$;
revoke all on function public.submit_church_verse_play(date, integer, integer, integer, integer) from public, anon;
grant execute on function public.submit_church_verse_play(date, integer, integer, integer, integer) to authenticated;

-- The week (0075) and the board's windows (0080) gain the fourth ledger.
create or replace function public.church_week_points(p_church_id uuid, p_week integer)
returns bigint
language sql
stable
security definer set search_path = public
as $$
  with w as (
    select public.church_rivalry_week_start(p_week) as s,
           public.church_rivalry_week_start(p_week + 1) as e
  )
  select coalesce((
    select coalesce(sum(cc.points), 0) from public.church_contributions cc, w
     where cc.church_id = p_church_id and cc.created_at >= w.s and cc.created_at < w.e
  ), 0)::bigint
  + coalesce((
    select coalesce(sum(co.points), 0) from public.church_offerings co, w
     where co.church_id = p_church_id and co.created_at >= w.s and co.created_at < w.e
  ), 0)::bigint
  + coalesce((
    select coalesce(sum(ko.points), 0) from public.keep_offerings ko, w
     where ko.church_id = p_church_id and ko.created_at >= w.s and ko.created_at < w.e
  ), 0)::bigint
  + coalesce((
    select coalesce(sum(vp.church_points), 0) from public.church_verse_plays vp, w
     where vp.church_id = p_church_id and vp.created_at >= w.s and vp.created_at < w.e
  ), 0)::bigint;
$$;

create or replace function public.church_points_since(p_since timestamptz)
returns table (church_id uuid, points bigint)
language sql
stable
security definer set search_path = public
as $$
  select l.church_id, sum(l.points)::bigint
  from (
    select cc.church_id, cc.points
      from public.church_contributions cc where cc.created_at >= p_since
    union all
    select co.church_id, co.points
      from public.church_offerings co where co.created_at >= p_since
    union all
    select ko.church_id, ko.points
      from public.keep_offerings ko
     where ko.created_at >= p_since and ko.church_id is not null
    union all
    select vp.church_id, vp.church_points
      from public.church_verse_plays vp
     where vp.created_at >= p_since and vp.church_points > 0
  ) l
  group by l.church_id;
$$;

create index if not exists church_verse_plays_created_idx
  on public.church_verse_plays (created_at);
