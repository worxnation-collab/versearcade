-- Account deletion has to reach the DENORMALISED copies of a username too.
--
-- `delete_my_account` (0003) deletes the auth user and lets foreign keys do the
-- rest, and that part is sound — every user-referencing FK in this schema is
-- CASCADE or SET NULL, so no row is orphaned and nothing blocks the delete.
--
-- What a foreign key cannot reach is a username that was COPIED into a row
-- rather than joined to. Three tables do that on purpose:
--
--   * `presence_events` — the ambient pulse stores `username` inline "so the
--     feed needs no join" (0001). There is no user_id on the table at all, so
--     there is no key to cascade along;
--   * `guest_opens` — a guest's chosen name, keyed on a client-generated device
--     id, which by design is not an account;
--   * `skin_purchases` — `user_id` goes SET NULL, and the username beside it
--     stayed behind.
--
-- So before 0085 a deleted account left its name in up to three places. Nothing
-- READS most of it (the pulse only ever selects today's `drop_date`, limit 40),
-- which is exactly why it went unnoticed — it is invisible in the app and
-- visible in the table.
--
-- The fix is to scrub rather than delete. These rows are not the person's data
-- to take with them: a pulse row is a fact about a day, and a purchase row is
-- an accounting record with its own retention basis. Removing the NAME is what
-- erasure asks for; removing the row would silently rewrite a day's feed and
-- destroy a financial record.
--
-- `[deleted]` rather than NULL because `presence_events.username` and
-- `guest_opens.username` are both `not null`, and widening them would push the
-- decision onto every reader instead. `skin_purchases.username` IS nullable,
-- but it is scrubbed the same way so the three paths read alike.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer set search_path = public, auth
as $$
declare
  uid   uuid := auth.uid();
  uname text;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select username into uname from public.profiles where id = uid;

  -- Scrub the inline copies first. Done BEFORE the delete because `profiles`
  -- is where the name is read from, and the cascade is about to take it.
  if uname is not null then
    update public.presence_events set username = '[deleted]' where username = uname;
    update public.guest_opens     set username = '[deleted]' where username = uname;
    update public.skin_purchases  set username = '[deleted]' where username = uname;
  end if;

  delete from auth.users where id = uid;   -- cascades to profiles + all data
end;
$$;

grant execute on function public.delete_my_account() to authenticated;

-- Retention for the pulse, which is the one table here that grows with traffic
-- and is never read once its day is over.
--
-- `get_daily_pulse` selects a single `drop_date`, so a row is unreadable by the
-- app the day after it is written and then accumulates forever — one row per
-- play, per open, per level-up, per player, with a name on each. Keeping a name
-- in a table nothing can read is the shape of problem 0085 exists to fix.
--
-- NOT hooked into a write path, and deliberately: `submit_play` is the obvious
-- host and it carries a scar warning that hand-retyping it once already lost
-- its presence_events writes (see 0064). A pruning DELETE is not worth
-- reopening that file for. This project has no cron either (see the rivalry's
-- lazy settling), so this is an operator function for now — run it, or call it
-- from a scheduled job if this project ever grows one.
--
-- 30 days keeps a month of history for debugging while bounding the table.

create or replace function public.prune_presence_events(p_keep_days integer default 30)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare n integer;
begin
  perform public.require_admin();
  if p_keep_days is null or p_keep_days < 1 then
    raise exception 'keep_days must be >= 1';
  end if;

  delete from public.presence_events
   where drop_date < (current_date - p_keep_days);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.prune_presence_events(integer) from public, anon, authenticated;
