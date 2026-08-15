-- Tighten the grants 0040 left open.
--
-- Postgres grants EXECUTE to PUBLIC on every newly created function, and PUBLIC
-- includes anon. So the "grant execute ... to authenticated" lines at the end of
-- 0040 did not, on their own, keep anon out — they only added a second, redundant
-- grant on top of one that was already there for everybody.
--
-- Most of these were harmless in practice: every auth-required RPC starts with
-- `if auth.uid() is null then raise exception`, so an anonymous call got an error
-- rather than data. The exception was church_points_available(uuid), which takes
-- an arbitrary user id and has no such guard, because it is only ever meant to be
-- called from inside the other definer functions. Left as-is, anon could have
-- asked it for any player's remaining giveable points. It loses its API surface
-- entirely here; the internal calls are unaffected, since those run as the
-- function owner rather than as the caller.

revoke execute on function public.church_points_available(uuid) from public, anon, authenticated;

revoke execute on function public.join_church(text, text, double precision, double precision, text, text, text, uuid) from public, anon;
revoke execute on function public.leave_church() from public, anon;
revoke execute on function public.contribute_to_church(integer) from public, anon;
revoke execute on function public.get_my_church(integer) from public, anon;
revoke execute on function public.church_leaderboard(numeric, integer) from public, anon;

-- Re-assert the intended grants: revoking from PUBLIC also removes the access
-- authenticated inherited through it, so be explicit about what stays.
grant execute on function public.join_church(text, text, double precision, double precision, text, text, text, uuid) to authenticated;
grant execute on function public.leave_church() to authenticated;
grant execute on function public.contribute_to_church(integer) to authenticated;
grant execute on function public.get_my_church(integer) to authenticated;
grant execute on function public.church_leaderboard(numeric, integer) to authenticated;

-- miles_between, church_level_from_xp, church_json and search_churches stay
-- readable by anon on purpose: a church's name, level and position are public
-- (they are map data plus a pooled score), and the picker searches before a
-- player has necessarily signed in.

-- Pure arithmetic over its argument with no table access, so the search_path
-- never mattered — pin it anyway so it stops showing up as a linter advisory.
alter function public.church_level_from_xp(bigint) set search_path = pg_catalog;

notify pgrst, 'reload schema';
