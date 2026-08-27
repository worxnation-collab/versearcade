-- Two fixes surfaced while building the growth dashboard (0052).

-- ———————————————————— 1. collectible_offerings had RLS off ————————————————————
--
-- It shipped in 0049 as the only table in `public` without row level security,
-- which meant anyone holding the anon key could rewrite the offering price list
-- — the exact table that exists so the client CANNOT name a point value when
-- donating. Setting golden_chalice to 999999 was a single PATCH away.
--
-- Turning RLS on cannot break anything: nothing in src/ reads this table, and
-- the one server-side reader is donate_collectible(), which is security definer
-- and therefore bypasses RLS entirely. The select policy below is not needed
-- today; it is here so a future "this relic is worth N" label in the UI works
-- without anyone reaching for a policy-free table again.
--
-- No insert/update/delete policy, deliberately. Writes are for migrations and
-- service_role only. That is the whole point of the table.

alter table public.collectible_offerings enable row level security;

drop policy if exists "offerings price list readable" on public.collectible_offerings;
create policy "offerings price list readable" on public.collectible_offerings
  for select to authenticated using (true);

-- ————————————————————— 2. `onboarded` was never being set —————————————————————
--
-- The flag was only ever written on the guest-claim path (claim_guest, 0009 /
-- 0012) and by an explicit client patch. An account created by signing up
-- normally played the daily drop and stayed onboarded = false forever, so the
-- column reported 30 onboarded against 42 accounts that had demonstrably played.
-- Any activation funnel built on it understated activation by more than half.
--
-- Fix at the choke point rather than the call site: a trigger on plays. Every
-- mode's play lands there (submit_play inserts the row), so this catches daily,
-- practice replay, focus and battle without touching five functions — and it
-- keeps working for call sites that do not exist yet.
--
-- "Activated" therefore means "has recorded at least one play", which is the
-- same definition the growth dashboard counts players by. One meaning, one
-- number.

create or replace function public.mark_onboarded_on_play()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set onboarded = true
    where id = new.user_id and not onboarded;
  return new;
end;
$$;

drop trigger if exists plays_mark_onboarded on public.plays;
create trigger plays_mark_onboarded
  after insert on public.plays
  for each row execute function public.mark_onboarded_on_play();

-- Backfill every account that already played before the trigger existed.
update public.profiles p set onboarded = true
where not p.onboarded
  and exists (select 1 from public.plays pl where pl.user_id = p.id);

-- The snapshot's health.onboarded_gap counts exactly what this repaired, so
-- recompute it now — otherwise the dashboard shows the pre-fix number until the
-- next 12-hour refresh.
select public.refresh_growth_snapshot();

notify pgrst, 'reload schema';
