-- Mark starter battles as "welcome" so the UI can give them a special first-run
-- banner, and backfill one for every existing user. Also keeps the official
-- account's own battle list clean (it doesn't need to see hundreds of pending
-- welcome challenges — only completed ones, once a user has played).

alter table public.battles add column if not exists is_welcome boolean not null default false;

-- Trigger now flags the starter battle as a welcome.
create or replace function public.create_starter_battle()
returns trigger language plpgsql security definer set search_path = public as $$
declare official uuid;
begin
  begin
    select id into official from public.profiles where official_buddy and id <> new.id limit 1;
    if official is not null and not exists (
      select 1 from public.battles where challenger_id = official and invited_id = new.id
    ) then
      insert into public.battles(challenger_id, invited_id, seed, challenger_score, challenger_time_ms, status, is_welcome)
      values (official, new.id, (floor(random() * 2147483647))::bigint, 900, 38000, 'pending', true);
    end if;
  exception when others then
    null;
  end;
  return new;
end; $$;

-- battle_json now surfaces is_welcome.
create or replace function public.battle_json(b public.battles)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'id', b.id, 'seed', b.seed, 'status', b.status, 'winner', b.winner, 'created_at', b.created_at,
    'broadcast', b.broadcast, 'is_welcome', b.is_welcome,
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

-- Keep the official account's list clean: hide its own PENDING welcome
-- challenges (there can be hundreds). It still sees them once completed.
create or replace function public.list_my_battles()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(public.battle_json(b) order by b.created_at desc), '[]'::jsonb)
  from public.battles b
  where b.broadcast = false
    and (
      b.opponent_id = auth.uid()
      or b.invited_id = auth.uid()
      or (b.challenger_id = auth.uid() and not (b.is_welcome and b.status = 'pending'))
    );
$$;

-- Backfill: one welcome challenge for every existing non-official user who
-- doesn't already have one.
insert into public.battles(challenger_id, invited_id, seed, challenger_score, challenger_time_ms, status, is_welcome)
select official.id, p.id, (floor(random() * 2147483647))::bigint, 900, 38000, 'pending', true
from public.profiles p
cross join (select id from public.profiles where official_buddy limit 1) official
where not p.official_buddy
  and p.id <> official.id
  and not exists (
    select 1 from public.battles b where b.challenger_id = official.id and b.invited_id = p.id
  );

notify pgrst, 'reload schema';
