-- Worldwide all-time leaderboard, ranked by XP.
-- SECURITY DEFINER so it can rank across all profiles (usernames + XP are public
-- handles) and still return the caller's own rank even when they're outside the
-- top slice. Ties broken by longest streak, then total plays, then id (stable).
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
