-- 0139 — the XP leaderboard stops breaking ties on longest_streak.
--
-- RECORD OF A MIGRATION ALREADY IN PRODUCTION. It was applied on 2026-10-23 as
-- `0137_leaderboard_no_streak_tiebreak` (version 20261023052358) and never
-- landed in the tree; 0137 is taken here three times over, so the file takes
-- the next free number. The body below is the recorded statement verbatim and
-- was checked against the live function, so applying it to production again is
-- a no-op. It exists so a fresh database matches production.
--
-- What changed from 0050: `longest_streak` is gone from the select list and from
-- the ranking. Ties on xp now fall to total plays, then members before guests,
-- then username. A streak is one person's ritual and nothing else here ranks
-- people by it, so it should not decide who sits above whom on a tie.
--
-- Idempotent: create or replace with the same signature, and nothing here
-- alters a table. The ACL is unchanged from 0050 (the deliberately public
-- anon + authenticated shape every board has).

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
