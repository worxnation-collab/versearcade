-- Inventory + offerings: the things you hold, and giving them to your church.
--
-- Until now a collectible was a single boolean — it's in user_unlocks or it
-- isn't — which had two consequences. Owning every relic made the Daily Chest
-- grant literally nothing (the draw doesn't exclude what you own, so once a
-- player held the 11 commons, ~74% of their chests were a no-op that still
-- played the celebration). And a reward had no use beyond sitting in a grid.
--
-- So a collectible is now two separate things:
--
--   the STAMP  — user_unlocks, unchanged. Granted once, the first time you ever
--                get that collectible, and never removed. It drives card
--                backgrounds and set completion, and it's what the Bible shows.
--   the ITEM   — user_inventory, new. The copy you actually hold. Duplicates
--                stack. This is what you can give away.
--
-- Donating hands the ITEM to your church and leaves the STAMP alone. So giving
-- costs you the object but never the record, never a cosmetic you unlocked, and
-- never set progress — and every duplicate pull becomes something worth having.

-- ————————————————————————————— what you hold —————————————————————————————
create table if not exists public.user_inventory (
  user_id         uuid not null references public.profiles(id) on delete cascade,
  collectible_key text not null,
  qty             integer not null default 1,
  updated_at      timestamptz not null default now(),
  primary key (user_id, collectible_key),
  constraint user_inventory_qty_positive check (qty > 0)
);

create index if not exists user_inventory_user_idx on public.user_inventory (user_id);

alter table public.user_inventory enable row level security;
drop policy if exists "inventory self-select" on public.user_inventory;
drop policy if exists "inventory self-write"  on public.user_inventory;
create policy "inventory self-select" on public.user_inventory
  for select using (auth.uid() = user_id);
-- Writes go through the security-definer functions below; scope any direct
-- write to the owner as defense in depth.
create policy "inventory self-write" on public.user_inventory
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Everyone who already collected something starts holding one of each, so the
-- Inventory has something in it the moment this ships rather than being empty
-- until the next chest. Idempotent: re-running adds nothing.
insert into public.user_inventory (user_id, collectible_key, qty)
select user_id, collectible_key, 1 from public.user_unlocks
on conflict (user_id, collectible_key) do nothing;

-- ————————————————————————— what an offering is worth —————————————————————————
-- Server-authoritative on purpose: the client asks to donate a key, never names
-- a value, so a scripted client can't mint church XP. Keep in sync with the
-- rarities in src/data/collectibles.ts.
create table if not exists public.collectible_offerings (
  collectible_key text primary key,
  rarity          text not null,
  points          integer not null check (points > 0)
);

insert into public.collectible_offerings (collectible_key, rarity, points) values
  ('first_light', 'common', 60),
  ('night_owl', 'common', 60),
  ('early_bird', 'common', 60),
  ('saved_by_grace', 'common', 60),
  ('flawless', 'rare', 500),
  ('combo_king', 'rare', 500),
  ('high_scorer', 'rare', 500),
  ('week_warrior', 'rare', 500),
  ('co_op_climber', 'rare', 500),
  ('speed_seraph', 'epic', 900),
  ('fortnight', 'epic', 900),
  ('month_mountain', 'epic', 900),
  ('devoted', 'epic', 900),
  ('half_century', 'legendary', 1500),
  ('centurion', 'legendary', 1500),
  ('leper_king', 'mythic', 3000),
  ('olive_branch', 'common', 60),
  ('clay_lamp', 'common', 60),
  ('palm_frond', 'common', 60),
  ('water_jar', 'common', 60),
  ('scroll_fragment', 'common', 60),
  ('mustard_seed', 'common', 60),
  ('anointing_oil', 'uncommon', 200),
  ('illuminated_icon', 'uncommon', 200),
  ('pilgrim_medallion', 'uncommon', 200),
  ('ancient_menorah', 'uncommon', 200),
  ('golden_chalice', 'rare', 500),
  ('alabaster_jar', 'rare', 500),
  ('star_of_bethlehem', 'rare', 500),
  ('widows_mite', 'common', 60),
  ('manna', 'common', 60),
  ('loaves_fish', 'common', 60),
  ('shepherds_crook', 'common', 60),
  ('descending_dove', 'common', 60),
  ('jubilee_trumpet', 'uncommon', 200),
  ('davids_harp', 'uncommon', 200),
  ('jordan_water', 'uncommon', 200),
  ('apostles_letter', 'uncommon', 200),
  ('covenant_rainbow', 'rare', 500),
  ('tablets_law', 'rare', 500),
  ('kingdom_keys', 'rare', 500),
  ('pearl_price', 'rare', 500)
on conflict (collectible_key) do update set rarity = excluded.rarity, points = excluded.points;

-- ————————————————————————————— the offering ledger —————————————————————————
-- Deliberately NOT church_contributions. That table feeds the "Top givers"
-- board, and if offerings ranked members against each other, keeping a relic
-- for your own Bible would visibly cost you standing in your church. Offerings
-- are counted for the congregation as a whole, never as a table of who gave
-- most — same rule as everywhere else here: if it needs a loser, it's wrong.
create table if not exists public.church_offerings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  church_id       uuid not null references public.churches(id) on delete cascade,
  collectible_key text not null,
  points          integer not null check (points > 0),
  created_at      timestamptz not null default now()
);

create index if not exists church_offerings_church_idx on public.church_offerings (church_id, created_at desc);
create index if not exists church_offerings_user_idx on public.church_offerings (user_id);

alter table public.church_offerings enable row level security;
drop policy if exists "offerings self-select" on public.church_offerings;
drop policy if exists "offerings church-select" on public.church_offerings;
-- A member can see their own giving, and the congregation-wide total is read
-- through the function below rather than by reading rows.
create policy "offerings self-select" on public.church_offerings
  for select using (auth.uid() = user_id);

-- ————————————————————————————————— donate —————————————————————————————————
-- Give one held item to the church you've picked. The stamp in user_unlocks is
-- untouched, so nothing you unlocked with it is ever revoked.
create or replace function public.donate_collectible(p_key text)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_key text := btrim(coalesce(p_key, ''));
  v_church_id uuid;
  v_points integer;
  v_qty integer;
  v_before bigint;
  v_after bigint;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if v_key = '' or length(v_key) > 64 then raise exception 'invalid key'; end if;

  select church_id into v_church_id from public.profiles where id = uid;
  if v_church_id is null then
    return json_build_object('ok', false, 'reason', 'no_church');
  end if;

  select points into v_points from public.collectible_offerings where collectible_key = v_key;
  if v_points is null then
    return json_build_object('ok', false, 'reason', 'not_donatable');
  end if;

  -- Lock the row so two devices donating the last copy can't both succeed.
  select qty into v_qty from public.user_inventory
    where user_id = uid and collectible_key = v_key for update;
  if coalesce(v_qty, 0) <= 0 then
    return json_build_object('ok', false, 'reason', 'not_held');
  end if;

  if v_qty = 1 then
    delete from public.user_inventory where user_id = uid and collectible_key = v_key;
  else
    update public.user_inventory set qty = qty - 1, updated_at = now()
      where user_id = uid and collectible_key = v_key;
  end if;

  select xp into v_before from public.churches where id = v_church_id for update;
  update public.churches set xp = xp + v_points where id = v_church_id
    returning xp into v_after;

  insert into public.church_offerings (user_id, church_id, collectible_key, points)
  values (uid, v_church_id, v_key, v_points);

  return json_build_object(
    'ok', true,
    'key', v_key,
    'points', v_points,
    'remaining', greatest(coalesce(v_qty, 1) - 1, 0),
    'church_xp', v_after,
    'leveled_up', public.church_level_from_xp(v_after) > public.church_level_from_xp(v_before),
    'level', public.church_level_from_xp(v_after)
  );
end;
$$;

grant execute on function public.donate_collectible(text) to authenticated;

-- How much the congregation has gathered together — a shared pile, not a
-- ranking of who carried the most.
create or replace function public.church_offering_summary()
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_church_id uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select church_id into v_church_id from public.profiles where id = uid;
  if v_church_id is null then return json_build_object('church', null); end if;

  return json_build_object(
    'church', v_church_id,
    'items', (select count(*) from public.church_offerings where church_id = v_church_id),
    'points', coalesce((select sum(points) from public.church_offerings where church_id = v_church_id), 0),
    'mine', (select count(*) from public.church_offerings where church_id = v_church_id and user_id = uid)
  );
end;
$$;

grant execute on function public.church_offering_summary() to authenticated;

notify pgrst, 'reload schema';

-- ————————————————— feeding the inventory from the two sources —————————————————
-- The chest, now stacking duplicates. This is the fix for the dead pull: before
-- this, drawing a relic you already owned inserted nothing and you got a
-- celebration over an empty reward. The stamp still only lands once; the item
-- stacks every time.
create or replace function public.open_daily_chest(p_drop_date date)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_last date;
  v_key text;
  v_rarity text;
  v_new_stamp boolean := false;
  v_qty integer;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select last_chest_on into v_last from public.profiles where id = uid;
  if v_last is not null and v_last >= p_drop_date then
    return json_build_object('already_opened', true);
  end if;

  -- ~4% of chests yield a rare XP Boost instead of a relic.
  if random() < 0.04 then
    update public.profiles
      set xp_boosts = coalesce(xp_boosts, 0) + 1, last_chest_on = p_drop_date
      where id = uid;
    return json_build_object('already_opened', false, 'kind', 'boost');
  end if;

  -- Weighted sampling (Efraimidis-Spirakis): highest key of random^(1/weight).
  select key, rarity into v_key, v_rarity
  from public.chest_relics
  order by power(random(), 1.0 / greatest(weight, 1)) desc
  limit 1;

  -- The stamp: once, ever.
  insert into public.user_unlocks (user_id, collectible_key, source)
  values (uid, v_key, 'chest')
  on conflict (user_id, collectible_key) do nothing;
  v_new_stamp := found;

  -- The item: every time.
  insert into public.user_inventory (user_id, collectible_key, qty)
  values (uid, v_key, 1)
  on conflict (user_id, collectible_key)
    do update set qty = user_inventory.qty + 1, updated_at = now()
  returning qty into v_qty;

  update public.profiles set last_chest_on = p_drop_date where id = uid;
  return json_build_object(
    'already_opened', false, 'kind', 'relic', 'key', v_key, 'rarity', v_rarity,
    'new_stamp', v_new_stamp, 'qty', v_qty
  );
end;
$$;
grant execute on function public.open_daily_chest(date) to authenticated;

-- Achievement cards. A card is earned once, so unlike the chest this never
-- stacks — the insert is do-nothing on both tables.
create or replace function public.grant_unlocks(p_keys text[])
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then return; end if;

  insert into public.user_unlocks (user_id, collectible_key)
  select uid, k from unnest(p_keys) as k
  on conflict (user_id, collectible_key) do nothing;

  insert into public.user_inventory (user_id, collectible_key, qty)
  select uid, k, 1 from unnest(p_keys) as k
  on conflict (user_id, collectible_key) do nothing;
end;
$$;
grant execute on function public.grant_unlocks(text[]) to authenticated;

notify pgrst, 'reload schema';
