-- Include the composable character avatar in leaderboard rows so the rankings
-- render characters (e.g. King Baldwin's regalia), not just the emoji fallback.
-- Guests have no character, so they return null and fall back to their emoji.
create or replace function public.get_leaderboard(p_limit integer default 100)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  with guests as (
    select distinct on (guest_id)
      guest_id, username, avatar_emoji, xp, level
    from public.guest_opens
    where xp > 0
    order by guest_id, xp desc, level desc, created_at desc
  ),
  combined as (
    select
      p.id            as profile_id,
      p.username,
      p.avatar_emoji,
      p.avatar_border,
      p.avatar_badge,
      p.avatar_character,
      p.xp,
      p.level,
      p.longest_streak,
      p.total_plays,
      0               as is_guest
    from public.profiles p
    union all
    select
      null::uuid      as profile_id,
      g.username,
      g.avatar_emoji,
      'default'::text as avatar_border,
      null::text      as avatar_badge,
      null::jsonb     as avatar_character,
      g.xp,
      g.level,
      0               as longest_streak,
      0               as total_plays,
      1               as is_guest
    from guests g
  ),
  ranked as (
    select
      c.*,
      row_number() over (
        order by c.xp desc, c.longest_streak desc, c.total_plays desc, c.is_guest, c.username
      ) as rank
    from combined c
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
            'avatar_character', avatar_character,
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
        'avatar_character', avatar_character,
        'xp', xp,
        'level', level
      )
      from ranked
      where profile_id = auth.uid()
    ),
    'total', (select count(*) from combined)
  );
$function$;
