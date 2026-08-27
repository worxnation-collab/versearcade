-- Study drops: finishing a study run can turn up a relic.
--
-- The Study tab was the one loop with nothing to show for itself — deliberately,
-- because it must never touch rank. A drop keeps that promise: it pays no XP, no
-- points and no standing, and the only thing a relic is good for is
-- donate_collectible (0049) — giving it to your church. The reward for studying
-- is an offering rather than a score, so nothing here ranks anyone against
-- anyone. It's also meant to be a surprise, not a task: no counter is shown and
-- there is nothing to "complete".
--
-- Server-authoritative for exactly the reason the chest is: the client asks for
-- a roll and never names a relic, so a scripted client can't mint offerings out
-- of thin air. The daily cap bounds the farm.

-- One row per player per local day. Deliberately NOT a counter column on
-- profiles: this is a per-day fact, and a table lets a row be locked so two
-- devices rolling at once can't both slip past the cap.
--
-- The column is `finds`, not `found` — `FOUND` is a plpgsql special variable and
-- the function below leans on it after an upsert.
create table if not exists public.study_drops (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  drop_date date not null,
  finds     integer not null default 0 check (finds >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, drop_date)
);

create index if not exists study_drops_user_idx on public.study_drops (user_id, drop_date desc);

alter table public.study_drops enable row level security;
drop policy if exists "study drops self-select" on public.study_drops;
create policy "study drops self-select" on public.study_drops
  for select using (auth.uid() = user_id);
-- No write policy on purpose: the security-definer function below is the only
-- way a row moves, so the cap can't be reset by a client.

-- Roll one finished study run. Returns whether anything was found; the caller
-- reveals it and can then donate it.
create or replace function public.roll_study_drop(p_local_date date)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  -- Keep in sync with STUDY_DROP in src/lib/drops.ts (the guest mirror).
  v_cap    constant integer := 3;
  v_chance constant double precision := 0.22;
  v_date date;
  v_finds integer;
  v_key text;
  v_rarity text;
  v_new_stamp boolean := false;
  v_qty integer;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  -- The client sends its own local date so the cap rolls over at the player's
  -- midnight rather than at UTC; clamp it instead of trusting it, exactly as
  -- submit_focus_practice and record_book_accuracy do.
  v_date := least(greatest(coalesce(p_local_date, current_date), current_date - 1), current_date + 1);

  insert into public.study_drops (user_id, drop_date, finds)
  values (uid, v_date, 0)
  on conflict (user_id, drop_date) do nothing;

  -- Lock this player's day before reading it, so two devices finishing a run at
  -- the same moment can't both see the same count and both be granted.
  select finds into v_finds from public.study_drops
    where user_id = uid and drop_date = v_date for update;

  if coalesce(v_finds, 0) >= v_cap then
    return json_build_object('found', false, 'reason', 'capped');
  end if;

  if random() >= v_chance then
    return json_build_object('found', false, 'reason', 'nothing');
  end if;

  -- Same pool and the same weighted draw as the chest (Efraimidis-Spirakis:
  -- highest key of random^(1/weight)), so a relic is a relic wherever it came
  -- from and there's only ever one relic catalog to keep straight.
  select key, rarity into v_key, v_rarity
  from public.chest_relics
  order by power(random(), 1.0 / greatest(weight, 1)) desc
  limit 1;
  if v_key is null then
    return json_build_object('found', false, 'reason', 'nothing');
  end if;

  -- The stamp lands once, ever; the item stacks every time. Same split as the
  -- chest — see the header of 0049.
  insert into public.user_unlocks (user_id, collectible_key, source)
  values (uid, v_key, 'study')
  on conflict (user_id, collectible_key) do nothing;
  v_new_stamp := found;

  insert into public.user_inventory (user_id, collectible_key, qty)
  values (uid, v_key, 1)
  on conflict (user_id, collectible_key)
    do update set qty = user_inventory.qty + 1, updated_at = now()
  returning qty into v_qty;

  update public.study_drops set finds = finds + 1, updated_at = now()
    where user_id = uid and drop_date = v_date
    returning finds into v_finds;

  return json_build_object(
    'found', true,
    'key', v_key,
    'rarity', v_rarity,
    'new_stamp', v_new_stamp,
    'qty', v_qty,
    'today', v_finds
  );
end;
$$;

grant execute on function public.roll_study_drop(date) to authenticated;

notify pgrst, 'reload schema';
