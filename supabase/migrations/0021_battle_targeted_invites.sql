-- Targeted Bible Battle invites: challenge a specific player from a list, so it
-- lands as a pending challenge for them (in addition to open share links).
alter table public.battles add column if not exists invited_id uuid references public.profiles(id) on delete set null;
create index if not exists battles_invited_idx on public.battles(invited_id);

-- create_battle takes an optional invited username (resolved to an id server-side).
drop function if exists public.create_battle(bigint, int, int);
create or replace function public.create_battle(p_seed bigint, p_score int, p_time_ms int, p_invited text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_invited uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_invited is not null and p_invited <> '' then
    select id into v_invited from public.profiles where lower(username) = lower(p_invited);
    if v_invited = auth.uid() then v_invited := null; end if;
  end if;
  insert into public.battles(challenger_id, invited_id, seed, challenger_score, challenger_time_ms)
  values (auth.uid(), v_invited, p_seed, p_score, p_time_ms) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.battle_json(b public.battles)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'id', b.id, 'seed', b.seed, 'status', b.status, 'winner', b.winner, 'created_at', b.created_at,
    'is_challenger', b.challenger_id = auth.uid(),
    'is_opponent', b.opponent_id is not null and b.opponent_id = auth.uid(),
    'is_invited', b.invited_id is not null and b.invited_id = auth.uid(),
    'invited', case when b.invited_id is null then null else (select p.username from public.profiles p where p.id = b.invited_id) end,
    'challenger', (
      select jsonb_build_object('username', p.username, 'avatar_emoji', p.avatar_emoji,
        'avatar_character', p.avatar_character, 'score', b.challenger_score, 'time_ms', b.challenger_time_ms)
      from public.profiles p where p.id = b.challenger_id
    ),
    'opponent', case when b.opponent_id is null then null else (
      select jsonb_build_object('username', p.username, 'avatar_emoji', p.avatar_emoji,
        'avatar_character', p.avatar_character, 'score', b.opponent_score, 'time_ms', b.opponent_time_ms)
      from public.profiles p where p.id = b.opponent_id
    ) end
  );
$$;

create or replace function public.submit_battle(p_id uuid, p_score int, p_time_ms int)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare b public.battles; v_winner text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into b from public.battles where id = p_id for update;
  if not found then raise exception 'battle not found'; end if;
  if b.challenger_id = auth.uid() then raise exception 'cannot battle yourself'; end if;
  if b.invited_id is not null and b.invited_id <> auth.uid() then raise exception 'this challenge is for someone else'; end if;
  if b.status = 'complete' then return public.battle_json(b); end if;
  if p_score > b.challenger_score then v_winner := 'opponent';
  elsif p_score < b.challenger_score then v_winner := 'challenger';
  elsif p_time_ms < b.challenger_time_ms then v_winner := 'opponent';
  elsif p_time_ms > b.challenger_time_ms then v_winner := 'challenger';
  else v_winner := 'tie'; end if;
  update public.battles
  set opponent_id = auth.uid(), opponent_score = p_score, opponent_time_ms = p_time_ms,
      status = 'complete', winner = v_winner, completed_at = now()
  where id = p_id returning * into b;
  return public.battle_json(b);
end; $$;

create or replace function public.list_my_battles()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(public.battle_json(b) order by b.created_at desc), '[]'::jsonb)
  from public.battles b
  where b.challenger_id = auth.uid() or b.opponent_id = auth.uid() or b.invited_id = auth.uid();
$$;

-- The pool of players you can challenge: most-recently-active first, then XP.
create or replace function public.battle_user_pool(p_search text default null, p_limit int default 100)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'username', username, 'avatar_emoji', avatar_emoji, 'avatar_character', avatar_character, 'level', level
    ) order by rn), '[]'::jsonb)
  from (
    select username, avatar_emoji, avatar_character, level,
      row_number() over (order by (last_played_on is null), last_played_on desc, xp desc) as rn
    from public.profiles
    where id <> auth.uid()
      and (p_search is null or p_search = '' or username ilike '%' || p_search || '%')
    order by (last_played_on is null), last_played_on desc, xp desc
    limit greatest(p_limit, 1)
  ) t;
$$;
