-- The XP leaderboard no longer breaks ties on longest_streak.
--
-- Nothing in this app ranks a player by their streak, and the streak's second
-- sort key here was the one place it still did: two players on equal XP were
-- ordered by who had kept the longer run. Ties now fall to total plays (every
-- finished daily verse counts the same, kept up or not), then accounts before
-- guests, then username, so the order stays deterministic.
--
-- Otherwise byte-identical to 0050, which production was checked to match
-- before this restate. longest_streak is simply left out of the CTE: it is no
-- longer read, and no payload ever carried it.
--
-- Idempotent: create or replace, same signature, nothing here alters a table.
-- 0136 is taken in production (church_leader_looks), hence 0137.

create or replace function public.get_leaderboard(p_limit integer default 100)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with guests as (
    select distinct on (guest_id)
      guest_id, username, avatar_emoji, xp, level
    from public.guest_opens
    where xp > 0
    order by guest_id, xp desc, level desc, created_at desc
  ),
  combined as (
    select
      p.id as profile_id, p.username, p.avatar_emoji, p.avatar_border, p.avatar_badge,
      p.avatar_character, p.card_background, p.xp, p.level, p.total_plays,
      coalesce(p.featured, false) as featured, 0 as is_guest
    from public.profiles p
    where not coalesce(p.hidden, false)
    union all
    select
      null::uuid, g.username, g.avatar_emoji, 'default'::text, null::text,
      null::jsonb, null::text, g.xp, g.level, 0, false, 1
    from guests g
  ),
  ranked as (
    select c.*, row_number() over (
      order by c.xp desc, c.total_plays desc, c.is_guest, c.username
    ) as rank
    from combined c
    where c.featured = false
  )
  select jsonb_build_object(
    'featured', coalesce((
      select jsonb_agg(jsonb_build_object(
        'username', username, 'avatar_emoji', avatar_emoji, 'avatar_border', avatar_border,
        'avatar_badge', avatar_badge, 'avatar_character', avatar_character,
        'card_background', card_background, 'xp', xp, 'level', level
      ) order by xp desc)
      from combined where featured
    ), '[]'::jsonb),
    'top', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rank', rank, 'username', username, 'avatar_emoji', avatar_emoji, 'avatar_border', avatar_border,
        'avatar_badge', avatar_badge, 'avatar_character', avatar_character,
        'card_background', card_background, 'xp', xp, 'level', level
      ) order by rank)
      from (select * from ranked order by rank limit greatest(p_limit,1)) t
    ), '[]'::jsonb),
    'me', (
      select jsonb_build_object('rank', rank, 'username', username, 'avatar_emoji', avatar_emoji,
        'avatar_border', avatar_border, 'avatar_badge', avatar_badge, 'avatar_character', avatar_character,
        'card_background', card_background, 'xp', xp, 'level', level)
      from ranked where profile_id = auth.uid()
    ),
    'total', (select count(*) from combined where featured = false)
  );
$$;

notify pgrst, 'reload schema';
