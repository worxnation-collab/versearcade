-- Verse Arcade — one-time backfill so EXISTING guests appear on the leaderboard
-- immediately, instead of only after they next play under the new client.
-- ---------------------------------------------------------------------------
-- Guests recorded before 0012 only have a per-day `score` on the server (their
-- true cumulative XP lived on-device). We approximate each guest's all-time XP
-- the same way submit_play pays out — the base XP each recorded score earns,
-- greatest(10, round(score/8)), summed across their days. This deliberately
-- omits the accuracy (+4/correct) and streak-milestone bonuses we never received,
-- so the estimate is a LOWER bound: guests are never over-ranked, and the next
-- time a guest plays, record_guest_open's greatest() merge replaces the estimate
-- with the device's real cumulative XP.
--
-- Guarded to xp = 0 so it only touches un-backfilled rows: safe to re-run and it
-- can never lower a real value written by an actual play.
-- ---------------------------------------------------------------------------

update public.guest_opens g
set xp    = e.xp_est,
    level = public.level_from_xp(e.xp_est)
from (
  select guest_id,
         sum(greatest(10, round(score / 8.0)::int))::int as xp_est
  from public.guest_opens
  where xp = 0
  group by guest_id
) e
where g.guest_id = e.guest_id
  and g.xp = 0;
