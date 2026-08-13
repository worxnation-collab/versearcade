-- Verse Arcade — restrict profile reads to the owner (audit finding #4).
-- ---------------------------------------------------------------------------
-- Before: `profiles readable` granted SELECT on EVERY profile row to any
-- authenticated user, exposing per-user activity (timezone, last_played_on,
-- last_chest_on), preferences, and economy fields (streak_freezes, xp_boosts)
-- to everyone signed in.
--
-- Cross-user public data (leaderboard, ambient pulse) is served by
-- SECURITY DEFINER functions that run as the table owner and bypass RLS, and the
-- client only ever reads its OWN profile directly (`.eq('id', uid)`), so scoping
-- reads to the owner is non-breaking.
--
-- auth.uid() is wrapped in a scalar sub-select so Postgres evaluates it once per
-- query instead of once per row (clears the auth_rls_initplan advisor warning).
-- ---------------------------------------------------------------------------

drop policy if exists "profiles readable" on public.profiles;

create policy "profiles self-read" on public.profiles
  for select using ((select auth.uid()) = id);

drop policy if exists "profiles self-update" on public.profiles;
create policy "profiles self-update" on public.profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "profiles self-insert" on public.profiles;
create policy "profiles self-insert" on public.profiles
  for insert with check ((select auth.uid()) = id);

-- Note: if a future feature needs to read another user's PUBLIC fields directly
-- (not via an RPC), expose only those columns through a view, e.g.:
--   create view public.public_profiles as
--     select id, username, avatar_emoji, level, avatar_border, avatar_badge
--     from public.profiles;
-- rather than widening this policy back to all columns.
