-- The Study tab's library: the first book you open each day is worth 5 XP.
--
-- Numbering note: this was written, and APPLIED TO PRODUCTION, as
-- `0081_library_card` before 0081_first_light landed on main from another
-- branch. Renumbered to 0083 here so the tree doesn't gain a fourth
-- duplicate number (see the 0034, 0038, 0059 and 0074 scars in CLAUDE.md);
-- the supabase migration ledger still carries the row under the old name.
-- Nothing needs re-running — the two touch entirely different objects
-- (daily_opens vs library_checkouts) and both are already live. Same shape
-- of renumber as 0057_sonshine_skin.
--
-- The Study tab IS a library now — a room with a librarian in it rather than a
-- grid of book tiles — and the first book she hands you on any given day pays a
-- small welcome. Coming back for a second, or a fifth, still works and simply
-- isn't paid for.
--
-- THE SAFETY ARGUMENT IS THE PRAYER ONE (0073) AND THE WASH_FEET ONE (0068),
-- because `xp` IS the worldwide leaderboard (0006) and it is the one number in
-- this app that ranks people:
--
--   THE SERVER COUNTS AND THE SERVER PAYS. The client says "she handed me a
--   book"; this function decides whether that is worth anything. No amount is
--   ever sent by a client, so no client can grant itself XP.
--
--   THE CAP IS IN SQL, NOT IN THE BUTTON, and it is held by the PRIMARY KEY
--   rather than by a count: (user_id, borrowed_on) means the second checkout of
--   a day inserts nothing and pays nothing, and two taps racing each other
--   settle themselves without this function having to count first.
--
--   THE CLIENT SENDS todayLocalDate() AND THE SERVER CLAMPS +-1, the house
--   pattern. A lying client can reach three buckets — 15 XP — which is bounded
--   and buys nothing that isn't already reachable by playing.
--
-- WHAT IT IS WORTH, stated plainly so a future session can weigh it: 5 XP a day
-- against a daily drop's 30-60. That is smaller than the Basin's 12 and much
-- smaller than praying's 30, and it is the smallest payout in the app. What
-- keeps it honest is that it is capped and server-granted, not that it is
-- small.
--
-- WHY A DAY AND NOT A LIFETIME. This shipped for about an hour as a once-ever
-- Easter egg, on the reasoning that a reward arriving every morning becomes a
-- chore-tap. The call was reversed by the app's owner: it is a small welcome
-- for opening a book, and the thing that keeps it from becoming an obligation
-- is that it is 5 XP and that NOTHING anywhere counts how many days in a row
-- you have collected it. There is no streak on this table and no rung in the
-- Journal for it — a daily reward you can fall behind on is the version that
-- would be wrong, and that is a property of what we DON'T store here.
--
-- NOTHING ELSE IS RECORDED. A user id and a date. Not which book, not how many
-- times you came back, and there is deliberately no RPC that asks whether
-- somebody ELSE has been to the library today.

create table if not exists public.library_checkouts (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  borrowed_on date not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, borrowed_on)
);

alter table public.library_checkouts enable row level security;

-- Yours and only yours. No policy lets anyone read anybody else's, and there is
-- no aggregate RPC over this table.
drop policy if exists "library_checkouts self-select" on public.library_checkouts;
create policy "library_checkouts self-select" on public.library_checkouts
  for select using (auth.uid() = user_id);
-- No write policy: checkout_library_book is the only way a row appears.

create or replace function public.checkout_library_book(p_local_date date default null)
returns jsonb
language plpgsql
security definer set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  pay constant int := 5;  -- KEEP IN SYNC with LIBRARY_XP in data/library.ts
  d date;
  v_rows int;
  v_old_level int;
  v_new_xp int;
  v_new_level int;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  -- Trust the client's local date, but only just.
  d := coalesce(p_local_date, current_date);
  if d < current_date - 1 then d := current_date - 1; end if;
  if d > current_date + 1 then d := current_date + 1; end if;

  -- The primary key IS the cap. A second checkout today — or two taps racing
  -- each other — inserts nothing and pays nothing.
  insert into public.library_checkouts (user_id, borrowed_on)
  values (uid, d)
  on conflict (user_id, borrowed_on) do nothing;

  get diagnostics v_rows = row_count;

  -- Already borrowed today. Still a success: she hands the book over, it just
  -- isn't worth anything the second time. Returned as ok:true with awarded 0
  -- rather than as a refusal, so the sheet never draws an error at somebody for
  -- coming back to the library.
  if v_rows = 0 then
    return jsonb_build_object('ok', true, 'awarded', 0, 'first_today', false);
  end if;

  select level into v_old_level from public.profiles where id = uid;

  update public.profiles
     set xp = xp + pay,
         level = public.level_from_xp(xp + pay)
   where id = uid
   returning xp, level into v_new_xp, v_new_level;

  return jsonb_build_object(
    'ok', true,
    'awarded', pay,
    'first_today', true,
    'xp', v_new_xp,
    'level', v_new_level,
    'leveled_up', v_new_level > coalesce(v_old_level, v_new_level)
  );
end;
$$;

grant execute on function public.checkout_library_book(date) to authenticated;

-- Whether the caller has already borrowed today, so the room knows whether
-- there is still a welcome to give. Answers about the caller and nobody else.
--
-- Deliberately NOT "how many days you have visited": that number is a streak
-- wearing a different hat, and this feature must not have one.
create or replace function public.my_library_card(p_local_date date default null)
returns jsonb
language plpgsql
stable security definer set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  d date;
  v_has boolean;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  d := coalesce(p_local_date, current_date);
  if d < current_date - 1 then d := current_date - 1; end if;
  if d > current_date + 1 then d := current_date + 1; end if;

  select exists(
    select 1 from public.library_checkouts where user_id = uid and borrowed_on = d
  ) into v_has;

  return jsonb_build_object('borrowed_today', v_has);
end;
$$;

grant execute on function public.my_library_card(date) to authenticated;

notify pgrst, 'reload schema';
