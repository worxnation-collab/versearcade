-- The librarian's desk: a library card, stamped once, worth 5 XP.
--
-- The Study tab now has a lending library in front of its shelf, with an NPC
-- librarian standing in it. Tapping her and checking a book out is a second way
-- to reach a study surface you could already reach by tapping the book — the
-- long way round, for players who want the room rather than the menu. Taking it
-- the first time pays 5 XP as an Easter egg.
--
-- THE SAFETY ARGUMENT IS THE PRAYER ONE (0073) AND THE WASH_FEET ONE (0068),
-- because `xp` IS the worldwide leaderboard (0006) and it is the one number in
-- this app that ranks people:
--
--   THE SERVER COUNTS AND THE SERVER PAYS. The client says "she checked a book
--   out to me"; this function decides whether that is worth anything. No amount
--   is ever sent by a client, so no client can grant itself XP.
--
--   THE CAP IS IN SQL, NOT IN THE BUTTON. One stamp per account, ever, held by
--   the PRIMARY KEY rather than by a count — an insert that loses a race simply
--   does nothing. Total lifetime exposure is 5 XP, which is a sixth of one
--   daily drop, so there is nothing here to farm and no date to lie about.
--
-- ONCE EVER, NOT ONCE A DAY, and that is a design decision rather than a
-- limitation. An Easter egg that pays every morning stops being an Easter egg
-- and becomes a chore-tap the player feels behind on for missing — which is the
-- exact feeling this app is built not to produce. The librarian keeps working
-- forever; only the surprise is spent. Making it daily would be a one-line
-- change here (count rows for a date, the way record_prayer does), and it would
-- need its own argument.
--
-- NOTHING ELSE IS RECORDED. A user id and when they were issued a card. Not
-- which book, not how many times they have been back, and there is deliberately
-- no RPC that asks whether somebody ELSE has a library card — a count of who
-- found the Easter egg is a leaderboard for finding Easter eggs.

create table if not exists public.library_cards (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  issued_at  timestamptz not null default now()
);

alter table public.library_cards enable row level security;

-- Yours and only yours. No policy lets anyone read anybody else's, and there is
-- no aggregate RPC over this table.
drop policy if exists "library_cards self-select" on public.library_cards;
create policy "library_cards self-select" on public.library_cards
  for select using (auth.uid() = user_id);
-- No write policy: checkout_library_book is the only way a row appears.

create or replace function public.checkout_library_book()
returns jsonb
language plpgsql
security definer set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  pay constant int := 5;  -- KEEP IN SYNC with LIBRARY_XP in data/library.ts
  v_rows int;
  v_old_level int;
  v_new_xp int;
  v_new_level int;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  -- The primary key IS the cap. `on conflict do nothing` means a second
  -- checkout — or two taps racing each other — inserts nothing and pays
  -- nothing, without this function having to count anything first.
  insert into public.library_cards (user_id)
  values (uid)
  on conflict (user_id) do nothing;

  get diagnostics v_rows = row_count;

  -- Already had a card. Still a success: she still hands the book over, it just
  -- isn't worth anything the second time. Returned as ok:true with awarded 0
  -- rather than as a refusal, so the sheet never draws an error at somebody for
  -- coming back to the library.
  if v_rows = 0 then
    return jsonb_build_object('ok', true, 'awarded', 0, 'first_time', false);
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
    'first_time', true,
    'xp', v_new_xp,
    'level', v_new_level,
    'leveled_up', v_new_level > coalesce(v_old_level, v_new_level)
  );
end;
$$;

grant execute on function public.checkout_library_book() to authenticated;

-- Whether the caller has been issued a card, so the sheet knows whether there
-- is still a surprise to give. Answers about the caller and nobody else.
create or replace function public.my_library_card()
returns jsonb
language plpgsql
stable security definer set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  v_has boolean;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select exists(select 1 from public.library_cards where user_id = uid) into v_has;
  return jsonb_build_object('has_card', v_has);
end;
$$;

grant execute on function public.my_library_card() to authenticated;

notify pgrst, 'reload schema';
