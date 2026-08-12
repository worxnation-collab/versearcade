-- Verse Arcade — include guest players on the worldwide leaderboard.
-- ---------------------------------------------------------------------------
-- The ambient home-screen pulse already counts EVERYONE who plays (signed-in
-- plays + guest_opens), but the ranks page ranked public.profiles only — so the
-- large guest population (the default onboarding path) played every day yet
-- never appeared on the leaderboard. Players saw people "playing today" on home
-- but a much shorter ranks list. This closes that gap.
--
-- The leaderboard is "all-time, by XP", so we need each guest's CUMULATIVE XP,
-- not just a daily score. guest_opens previously stored only the day's score;
-- we add xp/level, have record_guest_open persist them (the client already knows
-- its running totals), and union the guests into get_leaderboard.
--
-- Dedup: a guest is one device (guest_id). Their all-time standing is the row
-- with their highest XP. When a guest converts to a real account, their progress
-- is folded into the profile by claim_guest_progress — so that call now also
-- deletes the device's guest_opens rows to avoid counting the same player twice.
-- ---------------------------------------------------------------------------

-- 1) Carry the guest's cumulative XP + level alongside the daily score.
alter table public.guest_opens add column if not exists xp    integer not null default 0;
alter table public.guest_opens add column if not exists level integer not null default 1;

-- 2) record_guest_open now also stores XP/level. Adding parameters changes the
--    signature, so drop the old overload first (its 5-arg named calls resolve to
--    the new one via the p_xp/p_level defaults — old clients keep working).
drop function if exists public.record_guest_open(date, uuid, text, text, integer);

create or replace function public.record_guest_open(
  p_drop_date date,
  p_guest_id uuid,
  p_username text,
  p_emoji text,
  p_score integer,
  p_xp integer default 0,
  p_level integer default 1
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_name  text := left(coalesce(nullif(trim(p_username), ''), 'guest'), 24);
  v_emoji text := coalesce(nullif(p_emoji, ''), '📖');
  v_score integer := greatest(0, least(coalesce(p_score, 0), 100000));
  v_xp    integer := greatest(0, coalesce(p_xp, 0));
  v_level integer := greatest(1, coalesce(p_level, 1));
  v_is_new boolean;
begin
  if p_guest_id is null then return; end if;
  insert into public.guest_opens (drop_date, guest_id, username, avatar_emoji, score, xp, level)
  values (p_drop_date, p_guest_id, v_name, v_emoji, v_score, v_xp, v_level)
  on conflict (drop_date, guest_id)
  do update set score = greatest(public.guest_opens.score, excluded.score),
                xp = greatest(public.guest_opens.xp, excluded.xp),
                level = greatest(public.guest_opens.level, excluded.level),
                username = excluded.username,
                avatar_emoji = excluded.avatar_emoji
  returning (xmax = 0) into v_is_new; -- xmax = 0 means a fresh insert
  if v_is_new then
    insert into public.presence_events (drop_date, username, avatar_emoji, points, kind)
    values (p_drop_date, v_name, v_emoji, v_score, 'scored');
  end if;
end;
$$;
grant execute on function public.record_guest_open(date, uuid, text, text, integer, integer, integer) to anon, authenticated;

-- 3) The leaderboard now ranks signed-in profiles AND guests together by XP.
--    Guests are deduped to their best (highest-XP) row per device, and rows with
--    zero XP are excluded so legacy guest_opens (recorded before this migration,
--    xp defaulting to 0) and no-progress placeholders don't clutter the board.
create or replace function public.get_leaderboard(p_limit int default 100)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with guests as (
    select distinct on (guest_id)
      guest_id,
      username,
      avatar_emoji,
      xp,
      level
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
        -- Ties: longer streak, then more plays, then accounts before guests,
        -- then username — deterministic and stable across calls.
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
      where profile_id = auth.uid()
    ),
    'total', (select count(*) from combined)
  );
$$;

grant execute on function public.get_leaderboard(int) to authenticated, anon;

-- 4) When a guest converts to an account, remove their device's guest_opens rows
--    so their XP isn't counted twice (once under the guest, once under the new
--    profile it was folded into). Adds an optional p_guest_id; the old 12-arg
--    named call still resolves via the default.
drop function if exists public.claim_guest_progress(
  text, text, text, integer, integer, integer, integer, integer, date, integer, text[], jsonb
);

create or replace function public.claim_guest_progress(
  p_username       text,
  p_emoji          text,
  p_display_name   text,
  p_xp             integer,
  p_level          integer,
  p_current_streak integer,
  p_longest_streak integer,
  p_streak_freezes integer,
  p_last_played_on date,
  p_total_plays    integer,
  p_cards          text[],
  p_plays          jsonb,
  p_guest_id       uuid default null
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prof public.profiles%rowtype;
  base_name text;
  final_name text;
  n integer := 0;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select * into prof from public.profiles where id = uid for update;
  if not found then
    return json_build_object('claimed', false, 'reason', 'no_profile');
  end if;

  if prof.total_plays > 0 or prof.onboarded then
    return json_build_object('claimed', false, 'reason', 'not_fresh');
  end if;

  base_name := lower(regexp_replace(coalesce(nullif(p_username, ''), 'player'), '[^a-z0-9_]', '', 'g'));
  if base_name = '' then base_name := 'player'; end if;
  final_name := base_name;
  while exists (select 1 from public.profiles where username = final_name and id <> uid) loop
    n := n + 1;
    final_name := base_name || n::text;
  end loop;

  update public.profiles set
    username       = final_name,
    display_name   = coalesce(nullif(p_display_name, ''), final_name),
    avatar_emoji   = coalesce(nullif(p_emoji, ''), avatar_emoji),
    xp             = greatest(xp, coalesce(p_xp, 0)),
    level          = greatest(level, coalesce(p_level, 1)),
    current_streak = greatest(current_streak, coalesce(p_current_streak, 0)),
    longest_streak = greatest(longest_streak, coalesce(p_longest_streak, 0)),
    streak_freezes = coalesce(p_streak_freezes, streak_freezes),
    last_played_on = greatest(last_played_on, p_last_played_on),
    total_plays    = greatest(total_plays, coalesce(p_total_plays, 0)),
    onboarded      = true
  where id = uid;

  if p_cards is not null and array_length(p_cards, 1) is not null then
    insert into public.user_unlocks (user_id, collectible_key, source)
    select uid, k, 'play' from unnest(p_cards) as k
    on conflict (user_id, collectible_key) do nothing;
  end if;

  if p_plays is not null then
    insert into public.plays (user_id, drop_date, score, time_ms, correct_count,
                              total_questions, combo_max, xp_earned)
    select
      uid,
      (e->>'drop_date')::date,
      coalesce((e->>'score')::int, 0),
      coalesce((e->>'time_ms')::int, 0),
      coalesce((e->>'correct_count')::int, 0),
      coalesce((e->>'total_questions')::int, 0),
      coalesce((e->>'combo_max')::int, 0),
      coalesce((e->>'xp_earned')::int, 0)
    from jsonb_array_elements(p_plays) as e
    where (e->>'drop_date') is not null
      and exists (select 1 from public.daily_verses dv where dv.drop_date = (e->>'drop_date')::date)
    on conflict (user_id, drop_date) do nothing;
  end if;

  -- The guest's progress now lives on the profile — drop the device's guest rows
  -- so this player isn't ranked twice on the leaderboard.
  if p_guest_id is not null then
    delete from public.guest_opens where guest_id = p_guest_id;
  end if;

  return json_build_object('claimed', true, 'username', final_name);
end;
$$;

grant execute on function public.claim_guest_progress(
  text, text, text, integer, integer, integer, integer, integer, date, integer, text[], jsonb, uuid
) to authenticated;
