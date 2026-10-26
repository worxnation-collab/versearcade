-- 0150 — is a series landing? Totals for the church's leadership.
--
-- A pastor plans by the SERIES ("Fruit of the Spirit", seven days), and the
-- dashboard could say who played this week but not whether a series was
-- reaching the congregation. `church_series_landing(church)` answers that in
-- counts and percentages about the congregation, and nothing else.
--
-- DEFINITIONS (also in docs/CHURCH-PACKAGES.md → "Series numbers"):
--   * A SERIES is the church's APPROVED days (not drafts, not discarded)
--     carrying the same series name, compared case-insensitively and with
--     surrounding space trimmed, inside the last 365 days.
--   * A LIVE day is one whose date has come (drop_date <= the leader's today).
--     Days still ahead count toward `days` but not toward anything measured.
--   * The base is the church's CURRENT members (`profiles.church_id`), and
--     only plays of THIS church's verse (`church_verse_plays`, 0128) count.
--     Someone who left is not in the base and their plays are not counted, so
--     every percentage is out of the people who are here now.
--   * ENGAGED = a current member who played at least one live day of it.
--   * COMPLETED = a current member who played EVERY live day of it. While the
--     series is still running that means "kept up so far" (the client says
--     so); once its last day has passed it is the finished number.
--   * status: 'upcoming' (no live day yet), 'running' (some live, some ahead),
--     'finished' (every day live).
--
-- What it never returns: a name, a user id, a per-person count, an order of
-- people by anything. The roster with names is `church_leader_insights`
-- (verified leadership, 0128) and stays exactly as it was; this is the
-- congregation as a whole. So any leadership of the church may read it
-- (`is_church_admin`), a free claim (0137) included — it is the same shape for
-- both, and a free claim cannot schedule a verse (set_church_verse needs a
-- verified church), so in practice it reads an empty list there.
--
-- Members and strangers are refused (`not_leadership`). Read-only; no table.

create or replace function public.church_series_landing(p_church_id uuid, p_local_date date default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_today date := least(greatest(coalesce(p_local_date, current_date), current_date - 1), current_date + 1);
  v_members int;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'not_authenticated'); end if;
  if not public.is_church_admin(p_church_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_leadership');
  end if;

  select count(*) into v_members from public.profiles where church_id = p_church_id;

  return jsonb_build_object(
    'ok', true,
    'today', v_today,
    'members', v_members,
    'series', coalesce((
      with days as (
        -- The church's approved, named days in the last year.
        select v.drop_date, btrim(v.series) as series_name, lower(btrim(v.series)) as series_key
          from public.church_verses v
         where v.church_id = p_church_id
           and v.status = 'approved'
           and v.discarded_at is null
           and nullif(btrim(coalesce(v.series, '')), '') is not null
           and v.drop_date > v_today - 365
      ),
      series as (
        select series_key,
               min(series_name) as name,
               min(drop_date) as start_date,
               max(drop_date) as end_date,
               count(*) as days,
               count(*) filter (where drop_date <= v_today) as live_days
          from days group by series_key
      ),
      -- Each current member's count of live days played, per series.
      per_member as (
        select d.series_key, pl.user_id, count(distinct pl.drop_date) as played
          from days d
          join public.church_verse_plays pl on pl.church_id = p_church_id and pl.drop_date = d.drop_date
          join public.profiles pr on pr.id = pl.user_id and pr.church_id = p_church_id
         where d.drop_date <= v_today
         group by d.series_key, pl.user_id
      ),
      landed as (
        select s.*,
               case when s.live_days = 0 then 'upcoming'
                    when s.end_date <= v_today then 'finished'
                    else 'running' end as status,
               (select count(*) from per_member m where m.series_key = s.series_key) as engaged,
               (select count(*) from per_member m where m.series_key = s.series_key and m.played = s.live_days and s.live_days > 0) as completed
          from series s
         order by s.start_date desc
         limit 8
      )
      select jsonb_agg(jsonb_build_object(
               'name', l.name,
               'start_date', l.start_date,
               'end_date', l.end_date,
               'days', l.days,
               'live_days', l.live_days,
               'status', l.status,
               'engaged', l.engaged,
               'completed', l.completed,
               'engaged_pct', case when v_members > 0 and l.live_days > 0 then round(100.0 * l.engaged / v_members) end,
               'completed_pct', case when v_members > 0 and l.live_days > 0 then round(100.0 * l.completed / v_members) end
             ) order by l.start_date desc)
        from landed l
    ), '[]'::jsonb));
end;
$$;
revoke all on function public.church_series_landing(uuid, date) from public, anon;
grant execute on function public.church_series_landing(uuid, date) to authenticated;

notify pgrst, 'reload schema';
