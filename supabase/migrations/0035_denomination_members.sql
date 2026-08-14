-- Per-player standings inside a single denomination — powers the collapsible
-- member table on the Battle tab's Denomination ranks. Everyone who chose the
-- denomination is listed (even with zero battles), ordered by wins.

create or replace function public.battle_denomination_members(p_denom text, p_limit int default 100)
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
  members as (
    select pr.id, pr.username, pr.avatar_emoji, pr.avatar_character,
      coalesce(pu.wins, 0) as wins, coalesce(pu.battles, 0) as battles
    from public.profiles pr
    left join peruser pu on pu.pid = pr.id
    where pr.denomination = p_denom
  ),
  ranked as (
    select id, username, avatar_emoji, avatar_character, wins, battles,
      row_number() over (order by wins desc, battles desc, username) as rank
    from members
  )
  select coalesce((
    select jsonb_agg(jsonb_build_object('rank', rank, 'username', username,
      'avatar_emoji', avatar_emoji, 'avatar_character', avatar_character,
      'wins', wins, 'battles', battles) order by rank)
    from (select * from ranked order by rank limit greatest(p_limit, 1)) r
  ), '[]'::jsonb);
$$;

grant execute on function public.battle_denomination_members(text, int) to authenticated;

notify pgrst, 'reload schema';
