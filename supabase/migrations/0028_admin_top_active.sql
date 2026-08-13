-- Admin — "most active players" ranking for the dashboard. Activity = daily
-- quiz plays + battles (+ practice days), ranked by number played, with the
-- time actually spent in quizzes/battles alongside and a play-type breakdown.
-- NOTE: "time" is active quiz/battle time (per-play time_ms), not total time in
-- the app — the app has no session tracking, so this is the meaningful proxy.

create or replace function public.admin_top_active(p_limit int default 5)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.require_admin();
  return coalesce((
    with dp as (
      select user_id, count(*) as plays, coalesce(sum(time_ms), 0) as ms, max(created_at) as last_at
      from public.plays group by user_id
    ),
    bt as (
      select uid, count(*) as battles, coalesce(sum(ms), 0) as ms, max(at) as last_at
      from (
        select challenger_id as uid, challenger_time_ms as ms, created_at as at from public.battles
        union all
        select opponent_id as uid, opponent_time_ms as ms, completed_at as at
          from public.battles where opponent_id is not null
      ) x
      group by uid
    ),
    pr as (
      select user_id, count(*) as practice_days, max(updated_at) as last_at
      from public.practice_plays group by user_id
    ),
    agg as (
      select p.id, p.username, p.avatar_emoji, p.avatar_character, p.level,
        coalesce(dp.plays, 0) as daily_plays,
        coalesce(bt.battles, 0) as battles,
        coalesce(pr.practice_days, 0) as practice_days,
        coalesce(dp.ms, 0) + coalesce(bt.ms, 0) as total_ms,
        greatest(
          coalesce(dp.last_at, 'epoch'::timestamptz),
          coalesce(bt.last_at, 'epoch'::timestamptz),
          coalesce(pr.last_at, 'epoch'::timestamptz)
        ) as last_active
      from public.profiles p
      left join dp on dp.user_id = p.id
      left join bt on bt.uid = p.id
      left join pr on pr.user_id = p.id
    )
    select jsonb_agg(jsonb_build_object(
      'rank', row_number() over (order by (t.daily_plays + t.battles) desc, t.total_ms desc),
      'username', t.username, 'avatar_emoji', t.avatar_emoji, 'avatar_character', t.avatar_character,
      'level', t.level, 'daily_plays', t.daily_plays, 'battles', t.battles,
      'practice_days', t.practice_days, 'total_ms', t.total_ms, 'last_active', t.last_active
    ) order by (t.daily_plays + t.battles) desc, t.total_ms desc)
    from (
      select * from agg
      where (daily_plays + battles + practice_days) > 0
      order by (daily_plays + battles) desc, total_ms desc
      limit greatest(p_limit, 1)
    ) t
  ), '[]'::jsonb);
end; $$;

grant execute on function public.admin_top_active(int) to authenticated;

notify pgrst, 'reload schema';
