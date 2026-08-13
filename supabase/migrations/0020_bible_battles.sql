-- Bible Battle: async 1v1. The challenger plays a seeded random-verse quiz, then
-- shares an invite; the opponent plays the SAME seed and a winner is declared.
-- Separate from the (encouragement-first) main leaderboard. No daily cap.
-- All access flows through the SECURITY DEFINER RPCs below.

create table if not exists public.battles (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.profiles(id) on delete cascade,
  opponent_id uuid references public.profiles(id) on delete set null,
  seed bigint not null,
  challenger_score int not null,
  challenger_time_ms int not null,
  opponent_score int,
  opponent_time_ms int,
  status text not null default 'pending' check (status in ('pending','complete')),
  winner text check (winner in ('challenger','opponent','tie')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists battles_challenger_idx on public.battles(challenger_id);
create index if not exists battles_opponent_idx on public.battles(opponent_id);
alter table public.battles enable row level security;

create or replace function public.battle_json(b public.battles)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'id', b.id, 'seed', b.seed, 'status', b.status, 'winner', b.winner, 'created_at', b.created_at,
    'is_challenger', b.challenger_id = auth.uid(),
    'is_opponent', b.opponent_id is not null and b.opponent_id = auth.uid(),
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

create or replace function public.create_battle(p_seed bigint, p_score int, p_time_ms int)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.battles(challenger_id, seed, challenger_score, challenger_time_ms)
  values (auth.uid(), p_seed, p_score, p_time_ms) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.get_battle(p_id uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select public.battle_json(b) from public.battles b where b.id = p_id;
$$;

create or replace function public.submit_battle(p_id uuid, p_score int, p_time_ms int)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare b public.battles; v_winner text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into b from public.battles where id = p_id for update;
  if not found then raise exception 'battle not found'; end if;
  if b.challenger_id = auth.uid() then raise exception 'cannot battle yourself'; end if;
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
  where b.challenger_id = auth.uid() or b.opponent_id = auth.uid();
$$;

create or replace function public.battle_leaderboard(p_limit int default 50)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with done as (
    select case winner when 'challenger' then challenger_id when 'opponent' then opponent_id end as winner_id,
           challenger_id, opponent_id
    from public.battles where status = 'complete'
  ),
  players as (
    select challenger_id as pid from done union all select opponent_id from done
  ),
  agg as (
    select p.pid, count(*) as battles,
      (select count(*) from done d where d.winner_id = p.pid) as wins
    from players p where p.pid is not null group by p.pid
  ),
  ranked as (
    select a.pid, a.battles, a.wins,
      row_number() over (order by a.wins desc, a.battles desc) as rank
    from agg a
  )
  select jsonb_build_object(
    'top', coalesce((
      select jsonb_agg(jsonb_build_object('rank', r.rank, 'username', pr.username,
        'avatar_emoji', pr.avatar_emoji, 'avatar_character', pr.avatar_character,
        'wins', r.wins, 'battles', r.battles) order by r.rank)
      from (select * from ranked order by rank limit greatest(p_limit,1)) r
      join public.profiles pr on pr.id = r.pid
    ), '[]'::jsonb),
    'me', (select jsonb_build_object('rank', r.rank, 'wins', r.wins, 'battles', r.battles)
           from ranked r where r.pid = auth.uid())
  );
$$;
