-- Leaderboard curation: a `hidden` flag (to keep the app-review seed account off
-- the public board) and a `featured` flag (a curated spotlight player shown above
-- the ranks, not competing for #1). get_leaderboard excludes hidden accounts,
-- pulls featured players into their own list, and ranks everyone else.

alter table public.profiles add column if not exists hidden boolean not null default false;
alter table public.profiles add column if not exists featured boolean not null default false;

update public.profiles set hidden = true where username = 'appreview';

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
      p.avatar_character, p.xp, p.level, p.longest_streak, p.total_plays,
      coalesce(p.featured, false) as featured, 0 as is_guest
    from public.profiles p
    where not coalesce(p.hidden, false)
    union all
    select
      null::uuid, g.username, g.avatar_emoji, 'default'::text, null::text,
      null::jsonb, g.xp, g.level, 0, 0, false, 1
    from guests g
  ),
  ranked as (
    select c.*, row_number() over (
      order by c.xp desc, c.longest_streak desc, c.total_plays desc, c.is_guest, c.username
    ) as rank
    from combined c
    where c.featured = false
  )
  select jsonb_build_object(
    'featured', coalesce((
      select jsonb_agg(jsonb_build_object(
        'username', username, 'avatar_emoji', avatar_emoji, 'avatar_border', avatar_border,
        'avatar_badge', avatar_badge, 'avatar_character', avatar_character, 'xp', xp, 'level', level
      ) order by xp desc)
      from combined where featured
    ), '[]'::jsonb),
    'top', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rank', rank, 'username', username, 'avatar_emoji', avatar_emoji, 'avatar_border', avatar_border,
        'avatar_badge', avatar_badge, 'avatar_character', avatar_character, 'xp', xp, 'level', level
      ) order by rank)
      from (select * from ranked order by rank limit greatest(p_limit,1)) t
    ), '[]'::jsonb),
    'me', (
      select jsonb_build_object('rank', rank, 'username', username, 'avatar_emoji', avatar_emoji,
        'avatar_border', avatar_border, 'avatar_badge', avatar_badge, 'avatar_character', avatar_character,
        'xp', xp, 'level', level)
      from ranked where profile_id = auth.uid()
    ),
    'total', (select count(*) from combined where featured = false)
  );
$$;

notify pgrst, 'reload schema';
