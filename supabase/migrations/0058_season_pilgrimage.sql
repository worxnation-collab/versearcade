-- The Pilgrimage — the free seasonal track ("battle pass"). See
-- docs/BATTLE-PASS.md for the design of record and src/lib/season.ts for the
-- guest mirror of everything below.
--
-- Two things about this feature drive the whole schema:
--
--   1. It is FREE. Every reward, both columns, every road. There is no price,
--      no premium track and no checkout, so nothing here touches entitlements,
--      IAP or lib/commerce. `has_pass` exists and defaults TRUE purely as a
--      seam: if a paid tier ever comes back it is a change to how one boolean
--      gets set, not a rebuild. Do NOT build a grant path for it.
--
--   2. Miles are not XP. profiles.xp IS the worldwide leaderboard (0006), so
--      miles are kept in their own table, feed no level, and are never ranked
--      or compared. That separation is what lets the Study tab pay miles at all
--      while staying rank-free (see 0055 for the same argument about relics).
--
-- ON QUESTS: the server deliberately does NOT generate the quest list. It is a
-- pure function of (road, day) in src/lib/season.ts, and mirroring a seeded
-- PRNG in plpgsql would be fragile in exactly the way that hands a player two
-- different quest lists on two devices. The server stays authoritative over the
-- thing that matters — it clamps what a quest may pay from the quest id's own
-- prefix, so no client can mint miles. A client completing a quest it was never
-- issued reaches a cosmetic it would have reached by playing anyway: bounded,
-- and it buys nothing rankable.

-- ── Progress ────────────────────────────────────────────────────────────────
create table if not exists public.season_progress (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  road_id    text not null,
  miles      integer not null default 0 check (miles >= 0),
  waystation integer not null default 0 check (waystation >= 0),
  -- The seam. Everyone has it; nothing grants or revokes it.
  has_pass   boolean not null default true,
  -- Reward ids already handed out, so a re-award can't double-grant.
  granted    text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, road_id)
);

create index if not exists season_progress_user_idx
  on public.season_progress (user_id);

alter table public.season_progress enable row level security;
drop policy if exists "season progress self-select" on public.season_progress;
create policy "season progress self-select" on public.season_progress
  for select using (auth.uid() = user_id);
-- No write policy: the functions below are the only way a row moves.

-- ── Quest progress ──────────────────────────────────────────────────────────
create table if not exists public.season_quest_progress (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  road_id  text not null,
  quest_id text not null,
  progress integer not null default 0 check (progress >= 0),
  done_at  timestamptz,
  primary key (user_id, road_id, quest_id)
);

create index if not exists season_quests_user_idx
  on public.season_quest_progress (user_id, road_id);

alter table public.season_quest_progress enable row level security;
drop policy if exists "season quests self-select" on public.season_quest_progress;
create policy "season quests self-select" on public.season_quest_progress
  for select using (auth.uid() = user_id);

-- ── Durable unlocks ─────────────────────────────────────────────────────────
-- Miles reset at season end; what they bought never does. Unlocks live here
-- rather than in season_progress.granted so a cosmetic outlives its road.
create table if not exists public.season_unlocks (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  reward_id  text not null,
  road_id    text not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, reward_id)
);

alter table public.season_unlocks enable row level security;
drop policy if exists "season unlocks self-select" on public.season_unlocks;
create policy "season unlocks self-select" on public.season_unlocks
  for select using (auth.uid() = user_id);

-- ── Equipped seasonal cosmetics ─────────────────────────────────────────────
-- One jsonb rather than a column per kind: titles, confetti, flames and chest
-- skins are the first four of a longer list (ribbons, pedestals, emotes), and a
-- migration per reward type is not a thing anyone should sign up for. Shape:
--   { "title": "title_gleaner", "confetti": "confetti_chaff", ... }
alter table public.profiles
  add column if not exists equipped_cosmetics jsonb not null default '{}'::jsonb;

-- ── Award miles ─────────────────────────────────────────────────────────────
-- The client says what it did; the server decides what that is worth. Returns
-- the new totals plus any reward ids that just landed, so the caller can reveal
-- them without a second round-trip.
create or replace function public.award_season_miles(
  p_road       text,
  p_source     text,
  p_amount     integer,
  p_local_date date
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_date  date;
  v_cap   integer;
  v_amt   integer;
  v_before integer;
  v_way_before integer;
  v_after integer;
  v_way_after integer;
  v_weekend boolean;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_road is null or length(p_road) > 40 then raise exception 'bad road'; end if;

  -- The player's own local date, clamped rather than trusted — the house
  -- pattern (submit_focus_practice, record_book_accuracy, roll_study_drop).
  v_date := least(greatest(coalesce(p_local_date, current_date), current_date - 1), current_date + 1);

  -- Per-source ceiling. Keep in sync with MILES_CAP in src/lib/season.ts.
  v_cap := case p_source
    when 'quiz'         then 80    -- 40 base + 4 x 10 correct
    when 'daily'        then 100
    when 'chest'        then 60
    when 'chapter'      then 50
    when 'share'        then 75
    when 'donate'       then 50
    when 'quest_daily'  then 250
    when 'quest_weekly' then 1200  -- a gilded weekly pays double
    else 0
  end;

  v_amt := greatest(0, least(coalesce(p_amount, 0), v_cap));

  -- Road weekends: Friday through Sunday pay double. Keep in sync with
  -- isRoadWeekend() in src/lib/season.ts. Uses the clamped local date so the
  -- weekend rolls over at the player's midnight, not UTC's.
  v_weekend := extract(dow from v_date) in (0, 5, 6);
  if v_weekend then v_amt := v_amt * 2; end if;

  if v_amt = 0 then
    select miles, waystation into v_before, v_way_before
      from public.season_progress where user_id = uid and road_id = p_road;
    return json_build_object(
      'miles', coalesce(v_before, 0),
      'waystation', coalesce(v_way_before, 0),
      'granted', '[]'::json
    );
  end if;

  insert into public.season_progress (user_id, road_id) values (uid, p_road)
    on conflict (user_id, road_id) do nothing;

  -- Lock the row before reading it: two devices finishing a run at the same
  -- moment must not both compute the same "before" and both cross a waystation.
  select miles, waystation into v_before, v_way_before
    from public.season_progress
    where user_id = uid and road_id = p_road
    for update;

  v_after := coalesce(v_before, 0) + v_amt;
  v_way_after := floor(v_after / 1000.0)::integer;  -- MILES_PER_WAYSTATION

  update public.season_progress
    set miles = v_after, waystation = v_way_after, updated_at = now()
    where user_id = uid and road_id = p_road;

  return json_build_object(
    'miles', v_after,
    'waystation', v_way_after,
    'from', coalesce(v_way_before, 0),
    'doubled', v_weekend
  );
end;
$$;

grant execute on function public.award_season_miles(text, text, integer, date) to authenticated;

-- ── Record a granted reward ─────────────────────────────────────────────────
-- Called once per reward id the client crossed. Idempotent by primary key, so a
-- retry, a second device or a reload can't double-grant. The client names the
-- reward because the reward TABLE is client data (data/season.ts) — and since
-- the whole track is free and pays nothing rankable, a forged id is worth a
-- cosmetic and nothing else. This is deliberately not the shape used for skins,
-- where forging matters and grant_skins is service_role only.
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
  on conflict (user_id, reward_id) do nothing;
  v_new := found;

  update public.season_progress
    set granted = (
      select array_agg(distinct x) from unnest(granted || p_reward_id) as x
    ), updated_at = now()
    where user_id = uid and road_id = p_road;

  -- Consumables are counters on profiles, not unlocks. Only ever incremented
  -- here, and only the first time the reward id lands.
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

-- ── Quest progress ──────────────────────────────────────────────────────────
-- Advance one quest. Pays its miles exactly once, on the transition to done, so
-- a double-fire can't pay twice.
create or replace function public.track_season_quest(
  p_road       text,
  p_quest_id   text,
  p_delta      integer,
  p_goal       integer,
  p_local_date date
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_progress integer;
  v_done timestamptz;
  v_goal integer;
  v_paid boolean := false;
  v_source text;
  v_award json;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_quest_id is null or length(p_quest_id) > 80 then raise exception 'bad quest'; end if;
  -- The prefix is the only thing trusted about a quest id, and it is what
  -- decides what the quest may pay. Anything else is rejected outright.
  if left(p_quest_id, 2) not in ('d:', 'w:') then raise exception 'bad quest'; end if;

  v_goal := greatest(1, least(coalesce(p_goal, 1), 1000));

  insert into public.season_quest_progress (user_id, road_id, quest_id, progress)
  values (uid, p_road, p_quest_id, 0)
  on conflict (user_id, road_id, quest_id) do nothing;

  select progress, done_at into v_progress, v_done
    from public.season_quest_progress
    where user_id = uid and road_id = p_road and quest_id = p_quest_id
    for update;

  if v_done is not null then
    return json_build_object('progress', v_progress, 'done', true, 'paid', false);
  end if;

  v_progress := coalesce(v_progress, 0) + greatest(0, least(coalesce(p_delta, 0), v_goal));

  if v_progress >= v_goal then
    update public.season_quest_progress
      set progress = v_goal, done_at = now()
      where user_id = uid and road_id = p_road and quest_id = p_quest_id;
    v_source := case when left(p_quest_id, 2) = 'd:' then 'quest_daily' else 'quest_weekly' end;
    v_award := public.award_season_miles(
      p_road,
      v_source,
      case when v_source = 'quest_daily' then 250 else 600 end,
      p_local_date
    );
    v_paid := true;
    return json_build_object('progress', v_goal, 'done', true, 'paid', v_paid, 'award', v_award);
  end if;

  update public.season_quest_progress
    set progress = v_progress
    where user_id = uid and road_id = p_road and quest_id = p_quest_id;

  return json_build_object('progress', v_progress, 'done', false, 'paid', false);
end;
$$;

grant execute on function public.track_season_quest(text, text, integer, integer, date) to authenticated;

-- ── Equip a seasonal cosmetic ───────────────────────────────────────────────
-- Server-checked: you can only wear what you actually unlocked. Passing null
-- clears the slot back to the default.
create or replace function public.set_seasonal_cosmetic(
  p_kind text,
  p_key  text
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_owned boolean;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_kind not in ('title', 'confetti', 'flame', 'chest') then
    raise exception 'bad cosmetic kind';
  end if;

  if p_key is null then
    update public.profiles
      set equipped_cosmetics = equipped_cosmetics - p_kind
      where id = uid;
    return json_build_object('ok', true, 'key', null);
  end if;

  if length(p_key) > 64 then raise exception 'bad cosmetic key'; end if;

  -- The catalog defaults are free to everyone and have no unlock row; anything
  -- else has to have been earned on a road.
  v_owned := p_key in ('confetti_arcade', 'flame_ember', 'chest_classic')
    or exists (select 1 from public.season_unlocks where user_id = uid and reward_id = p_key);

  if not v_owned then raise exception 'not unlocked'; end if;

  update public.profiles
    set equipped_cosmetics = equipped_cosmetics || jsonb_build_object(p_kind, p_key)
    where id = uid;

  return json_build_object('ok', true, 'key', p_key);
end;
$$;

grant execute on function public.set_seasonal_cosmetic(text, text) to authenticated;

-- ── Read everything at once ─────────────────────────────────────────────────
-- One question, one answer — the same reason church_json exists. The road, the
-- quest progress and the unlock set can't drift apart if the strip, the screen
-- and the equip UI all ask this.
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
    'unlocks', coalesce((select json_agg(reward_id) from public.season_unlocks
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
