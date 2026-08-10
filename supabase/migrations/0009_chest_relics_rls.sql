-- Lock down the relic catalog. `chest_relics` shipped with RLS disabled, so
-- anyone holding the public anon key could read AND modify the rarity/weight
-- rows that drive the daily-chest draw. The catalog is meant to be public
-- *read-only* reference data: clients may list relics, but only server-side
-- roles (service_role / the SECURITY DEFINER chest function) may write it.
alter table public.chest_relics enable row level security;

-- Public read: the app needs to render the relic catalog for everyone,
-- guests included.
drop policy if exists "relics readable by all" on public.chest_relics;
create policy "relics readable by all" on public.chest_relics
  for select using (true);

-- No insert/update/delete policy is defined on purpose: with RLS enabled and
-- no write policy, the anon and authenticated roles cannot mutate the catalog.
-- service_role bypasses RLS, and open_daily_chest() only reads this table, so
-- the daily chest keeps working unchanged.
