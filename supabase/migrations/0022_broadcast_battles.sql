-- Reusable "broadcast" battle challenges: a shared link ANY number of people can
-- accept. Each opener plays the same seeded quiz and spawns their own 1v1 result
-- against the challenger's stored score. The template row stays open and never
-- completes.
alter table public.battles add column if not exists broadcast boolean not null default false;
alter table public.battles add column if not exists source_id uuid references public.battles(id) on delete set null;
create index if not exists battles_source_idx on public.battles(source_id);
create unique index if not exists battles_broadcast_once on public.battles(source_id, opponent_id) where source_id is not null;

drop function if exists public.create_battle(bigint, int, int, text);
create or replace function public.create_battle(p_seed bigint, p_score int, p_time_ms int, p_invited text default null, p_broadcast boolean default false)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_invited uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_invited is not null and p_invited <> '' then
    select id into v_invited from public.profiles where lower(username) = lower(p_invited);
    if v_invited = auth.uid() then v_invited := null; end if;
  end if;
  insert into public.battles(challenger_id, invited_id, seed, challenger_score, challenger_time_ms, broadcast)
  values (auth.uid(), v_invited, p_seed, p_score, p_time_ms, coalesce(p_broadcast, false)) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.battle_json(b public.battles)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'id', b.id, 'seed', b.seed, 'status', b.status, 'winner', b.winner, 'created_at', b.created_at,
    'broadcast', b.broadcast,
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

create or replace function public.get_battle(p_id uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (select public.battle_json(r) from public.battles r where r.source_id = p_id and r.opponent_id = auth.uid() limit 1),
    (select public.battle_json(b) from public.battles b where b.id = p_id)
  );
$$;

create or replace function public.submit_battle(p_id uuid, p_score int, p_time_ms int)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare b public.battles; r public.battles; v_winner text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into b from public.battles where id = p_id for update;
  if not found then raise exception 'battle not found'; end if;
  if b.challenger_id = auth.uid() then raise exception 'cannot battle yourself'; end if;

  v_winner := case
    when p_score > b.challenger_score then 'opponent'
    when p_score < b.challenger_score then 'challenger'
    when p_time_ms < b.challenger_time_ms then 'opponent'
    when p_time_ms > b.challenger_time_ms then 'challenger'
    else 'tie' end;

  if b.broadcast then
    select * into r from public.battles where source_id = b.id and opponent_id = auth.uid() limit 1;
    if found then return public.battle_json(r); end if;
    begin
      insert into public.battles(challenger_id, opponent_id, seed, challenger_score, challenger_time_ms,
        opponent_score, opponent_time_ms, status, winner, completed_at, source_id)
      values (b.challenger_id, auth.uid(), b.seed, b.challenger_score, b.challenger_time_ms,
        p_score, p_time_ms, 'complete', v_winner, now(), b.id)
      returning * into r;
    exception when unique_violation then
      select * into r from public.battles where source_id = b.id and opponent_id = auth.uid() limit 1;
    end;
    return public.battle_json(r);
  end if;

  if b.invited_id is not null and b.invited_id <> auth.uid() then raise exception 'this challenge is for someone else'; end if;
  if b.status = 'complete' then return public.battle_json(b); end if;
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
  where b.broadcast = false
    and (b.challenger_id = auth.uid() or b.opponent_id = auth.uid() or b.invited_id = auth.uid());
$$;
