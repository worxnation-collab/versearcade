-- Verse Arcade — surface avatar cosmetics (border + badge) in the shared feeds.
-- ---------------------------------------------------------------------------
-- The leaderboard already reads from profiles, so it just returns the two new
-- columns. The ambient pulse reads snapshot rows from presence_events; rather
-- than widen that table and touch submit_play's hot path, we left-join back to
-- profiles by username so the feed reflects each player's CURRENT cosmetics.
-- Guest presence rows (no matching profile) simply fall back to the plain look.
-- ---------------------------------------------------------------------------

create or replace function public.get_leaderboard(p_limit int default 100)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select
      id,
      username,
      avatar_emoji,
      avatar_border,
      avatar_badge,
      xp,
      level,
      row_number() over (
        order by xp desc, longest_streak desc, total_plays desc, id
      ) as rank
    from public.profiles
  )
  select jsonb_build_object(
    'top', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'rank', rank,
            'username', username,
            'avatar_emoji', avatar_emoji,
            'avatar_border', avatar_border,
            'avatar_badge', avatar_badge,
            'xp', xp,
            'level', level
          )
          order by rank
        )
        from (select * from ranked order by rank limit greatest(p_limit, 1)) t
      ),
      '[]'::jsonb
    ),
    'me', (
      select jsonb_build_object(
        'rank', rank,
        'username', username,
        'avatar_emoji', avatar_emoji,
        'avatar_border', avatar_border,
        'avatar_badge', avatar_badge,
        'xp', xp,
        'level', level
      )
      from ranked
      where id = auth.uid()
    ),
    'total', (select count(*) from public.profiles)
  );
$$;

grant execute on function public.get_leaderboard(int) to authenticated, anon;

create or replace function public.get_daily_pulse(p_drop_date date)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_opened integer;
  v_feed json;
begin
  select (select count(*) from public.plays where drop_date = p_drop_date)
       + (select count(*) from public.guest_opens where drop_date = p_drop_date)
    into v_opened;
  select coalesce(json_agg(row_to_json(t)), '[]'::json) into v_feed
  from (
    select
      pe.username,
      pe.avatar_emoji,
      pe.points,
      pe.kind,
      pe.created_at,
      coalesce(pr.avatar_border, 'default') as avatar_border,
      pr.avatar_badge as avatar_badge
    from public.presence_events pe
    left join public.profiles pr on pr.username = pe.username
    where pe.drop_date = p_drop_date
    order by pe.created_at desc
    limit 40
  ) t;
  return json_build_object('opened', v_opened, 'feed', v_feed);
end;
$$;

grant execute on function public.get_daily_pulse(date) to anon, authenticated;
