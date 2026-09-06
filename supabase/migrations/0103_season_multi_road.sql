-- 0103 — a second road, and the two things that break when one exists
--
-- The Pilgrimage has had exactly ONE road since 0058 (the Harvest Road), which
-- hid two bugs that only fire the morning a second one opens. Both were found
-- by reading 0058 against the Lamplight/Advent roads rather than by anything
-- going wrong, because nothing can go wrong until 2026-11-11.
--
-- 1. CONSUMABLES WERE PAID ONCE PER ACCOUNT, EVER.
--    `season_unlocks` is keyed (user_id, reward_id), and boost/freeze ride it:
--    claim_season_reward increments profiles.xp_boosts only when the insert is
--    new. The Harvest Road hands out nine freezes and eight boosts, so 46 live
--    accounts already hold a `freeze` row — and every freeze on every FUTURE
--    road would have conflicted against it and paid nothing. A player would
--    walk twelve waystations and receive no consumables at all, silently.
--
--    The fix is to make the unlock road-scoped: (user_id, reward_id, road_id).
--    A cosmetic is still granted once per road (no duplicate reveal), and a
--    consumable is granted once per road, which is what a reward table that
--    lists it on two roads plainly means.
--
-- 2. THE WARDROBE IS READ ACROSS ROADS AND MUST STAY THAT WAY.
--    season_json already returns every unlock for the user regardless of road —
--    that is what makes "miles reset, what they bought never does" true — so
--    widening the key must not narrow the read. `distinct` is added because
--    the wider key can now hold the same reward id under two road ids, and a
--    duplicate in that array would show a player two copies of one skin.
--
-- Additive and idempotent: re-running is a no-op, and an old client is
-- unaffected (it sends the same arguments and reads the same shape).

-- ── The key ─────────────────────────────────────────────────────────────────
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conrelid = 'public.season_unlocks'::regclass and contype = 'p';

  if v_def is distinct from 'PRIMARY KEY (user_id, reward_id, road_id)' then
    if v_def is not null then
      execute 'alter table public.season_unlocks drop constraint season_unlocks_pkey';
    end if;
    execute 'alter table public.season_unlocks add primary key (user_id, reward_id, road_id)';
  end if;
end $$;

-- ── Claim ───────────────────────────────────────────────────────────────────
-- Restated wholesale from 0058. The ONLY change is the conflict target; the
-- consumable branch, the granted array and the return shape are byte-identical,
-- because everything downstream of `v_new` was already right — it was only ever
-- being told the wrong thing.
create or replace function public.claim_season_reward(
  p_road      text,
  p_reward_id text
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_new boolean := false;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_reward_id is null or length(p_reward_id) > 64 then raise exception 'bad reward'; end if;
  if p_road is null or length(p_road) > 40 then raise exception 'bad road'; end if;

  insert into public.season_unlocks (user_id, reward_id, road_id)
  values (uid, p_reward_id, p_road)
  on conflict (user_id, reward_id, road_id) do nothing;
  v_new := found;

  update public.season_progress
    set granted = (
      select array_agg(distinct x) from unnest(granted || p_reward_id) as x
    ), updated_at = now()
    where user_id = uid and road_id = p_road;

  -- Consumables are counters on profiles, not unlocks. Only ever incremented
  -- here, and only the first time the reward id lands ON THIS ROAD.
  if v_new then
    if p_reward_id = 'boost' then
      update public.profiles set xp_boosts = xp_boosts + 1 where id = uid;
    elsif p_reward_id = 'freeze' then
      update public.profiles set streak_freezes = streak_freezes + 1 where id = uid;
    end if;
  end if;

  return json_build_object('granted', v_new);
end;
$$;

grant execute on function public.claim_season_reward(text, text) to authenticated;

-- ── Read ────────────────────────────────────────────────────────────────────
-- Restated wholesale from 0058. The only change is `distinct` on the unlocks
-- aggregate. The cross-road read is deliberate and is the whole point of the
-- table: what miles bought outlives the road that paid for it.
create or replace function public.season_json(p_road text)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;

  return json_build_object(
    'miles', coalesce((select miles from public.season_progress
                        where user_id = uid and road_id = p_road), 0),
    'waystation', coalesce((select waystation from public.season_progress
                        where user_id = uid and road_id = p_road), 0),
    'granted', coalesce((select granted from public.season_progress
                        where user_id = uid and road_id = p_road), '{}'),
    'unlocks', coalesce((select json_agg(distinct reward_id) from public.season_unlocks
                        where user_id = uid), '[]'::json),
    'quests', coalesce((select json_agg(json_build_object(
                          'id', quest_id, 'progress', progress, 'done', done_at is not null))
                        from public.season_quest_progress
                        where user_id = uid and road_id = p_road), '[]'::json),
    'equipped', coalesce((select equipped_cosmetics from public.profiles where id = uid), '{}'::jsonb)
  );
end;
$$;

grant execute on function public.season_json(text) to authenticated;

notify pgrst, 'reload schema';
