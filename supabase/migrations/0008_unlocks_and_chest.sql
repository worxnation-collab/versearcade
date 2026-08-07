-- Persistent collectible unlocks. Previously cards were saved only on the device
-- (localdb), so a signed-in user's collection reset on a new session/device.
-- Now every unlock (achievement cards AND daily-chest relics) lives on the account.
create table if not exists public.user_unlocks (
  user_id         uuid not null references public.profiles(id) on delete cascade,
  collectible_key text not null,
  source          text not null default 'play', -- play | chest
  unlocked_at     timestamptz not null default now(),
  primary key (user_id, collectible_key)
);
alter table public.user_unlocks enable row level security;
drop policy if exists "unlocks self-select" on public.user_unlocks;
drop policy if exists "unlocks self-insert" on public.user_unlocks;
create policy "unlocks self-select" on public.user_unlocks
  for select using (auth.uid() = user_id);
create policy "unlocks self-insert" on public.user_unlocks
  for insert with check (auth.uid() = user_id);

-- Relic catalog for the daily chest (mirrors the relics in data/collectibles.ts).
-- Kept server-side so the chest draw is authoritative and rarity can't be gamed.
create table if not exists public.chest_relics (
  key    text primary key,
  rarity text not null,          -- common | uncommon | rare
  weight integer not null default 1
);
insert into public.chest_relics (key, rarity, weight) values
  ('olive_branch','common',20),('clay_lamp','common',20),('palm_frond','common',20),
  ('water_jar','common',20),('scroll_fragment','common',20),('mustard_seed','common',20),
  ('anointing_oil','uncommon',8),('illuminated_icon','uncommon',8),
  ('pilgrim_medallion','uncommon',8),('ancient_menorah','uncommon',8),
  ('golden_chalice','rare',2),('alabaster_jar','rare',2),('star_of_bethlehem','rare',2)
on conflict (key) do nothing;

-- Track when a user last opened their chest so it's a once-per-day reward.
alter table public.profiles add column if not exists last_chest_on date;

-- Grant achievement-card unlocks earned during a play (idempotent).
create or replace function public.grant_unlocks(p_keys text[])
returns void
language sql
security definer set search_path = public
as $$
  insert into public.user_unlocks (user_id, collectible_key, source)
  select auth.uid(), k, 'play'
  from unnest(p_keys) as k
  where auth.uid() is not null
  on conflict (user_id, collectible_key) do nothing;
$$;
grant execute on function public.grant_unlocks(text[]) to authenticated;

-- Open today's chest: one weighted-random relic, once per day, persisted.
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
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select last_chest_on into v_last from public.profiles where id = uid;
  if v_last is not null and v_last >= p_drop_date then
    return json_build_object('already_opened', true);
  end if;
  -- Weighted sampling (Efraimidis-Spirakis): highest key of random^(1/weight).
  select key, rarity into v_key, v_rarity
  from public.chest_relics
  order by power(random(), 1.0 / greatest(weight, 1)) desc
  limit 1;
  insert into public.user_unlocks (user_id, collectible_key, source)
  values (uid, v_key, 'chest')
  on conflict (user_id, collectible_key) do nothing;
  update public.profiles set last_chest_on = p_drop_date where id = uid;
  return json_build_object('already_opened', false, 'key', v_key, 'rarity', v_rarity);
end;
$$;
grant execute on function public.open_daily_chest(date) to authenticated;
