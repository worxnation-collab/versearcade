-- Denomination "factions" for the Battle tab. Opt-in; only surfaced on the
-- Battle ranks. Each player's battle wins auto-pool into their denomination's
-- total (nobody pushes points). Individual battle ranks also carry the player's
-- denomination so rows can be color-coded.

alter table public.profiles add column if not exists denomination text;

-- Individual battle ranks + the player's denomination (for color-coding).
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
        'denomination', pr.denomination,
        'wins', r.wins, 'battles', r.battles) order by r.rank)
      from (select * from ranked order by rank limit greatest(p_limit,1)) r
      join public.profiles pr on pr.id = r.pid
    ), '[]'::jsonb),
    'me', (select jsonb_build_object('rank', r.rank, 'wins', r.wins, 'battles', r.battles)
           from ranked r where r.pid = auth.uid())
  );
$$;

-- Denomination standings: members (everyone who chose it) + pooled battle wins.
create or replace function public.battle_denomination_board(p_limit int default 20)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with done as (
    select case winner when 'challenger' then challenger_id when 'opponent' then opponent_id end as winner_id,
           challenger_id, opponent_id
    from public.battles where status = 'complete'
  ),
  players as (
    select challenger_id as pid from done union all select opponent_id from done
  ),
  peruser as (
    select p.pid, count(*) as battles,
      (select count(*) from done d where d.winner_id = p.pid) as wins
    from players p where p.pid is not null group by p.pid
  ),
  denom_members as (
    select denomination as denom, count(*) as members
    from public.profiles
    where denomination is not null and denomination <> ''
    group by denomination
  ),
  denom_wins as (
    select pr.denomination as denom,
      coalesce(sum(pu.wins), 0) as wins, coalesce(sum(pu.battles), 0) as battles
    from peruser pu
    join public.profiles pr on pr.id = pu.pid
    where pr.denomination is not null and pr.denomination <> ''
    group by pr.denomination
  ),
  merged as (
    select m.denom, m.members, coalesce(w.wins, 0) as wins, coalesce(w.battles, 0) as battles
    from denom_members m left join denom_wins w on w.denom = m.denom
  ),
  ranked as (
    select denom, members, wins, battles,
      row_number() over (order by wins desc, members desc, denom) as rank
    from merged
  )
  select jsonb_build_object(
    'top', coalesce((
      select jsonb_agg(jsonb_build_object('rank', rank, 'denomination', denom,
        'members', members, 'wins', wins, 'battles', battles) order by rank)
      from (select * from ranked order by rank limit greatest(p_limit, 1)) r
    ), '[]'::jsonb),
    'me', (select jsonb_build_object('rank', r.rank, 'denomination', r.denom,
             'members', r.members, 'wins', r.wins, 'battles', r.battles)
           from ranked r
           join public.profiles me on me.id = auth.uid()
           where me.denomination is not null and r.denom = me.denomination)
  );
$$;

grant execute on function public.battle_denomination_board(int) to authenticated;

notify pgrst, 'reload schema';
