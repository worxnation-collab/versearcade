-- Giving a relic to another player — the app's second gesture that costs the
-- sender and asks nothing back.
--
-- Every other way to act on a person here is a challenge, except washing feet
-- (0068). This is the other one: you hand somebody an object out of your own
-- bag and it is gone from yours.
--
-- WHAT MOVES AND WHAT DOES NOT, and this split is the whole safety argument:
--
--   THE ITEM MOVES. user_inventory — the copy you are holding, the thing
--   donate_collectible spends. The sender loses one, the recipient gains one.
--
--   THE STAMP DOES NOT. user_unlocks — the record that you have EVER had one —
--   is never granted by a gift. It is the number get_player_card publishes as
--   `cards`, and it gates card backgrounds and room furnishings, so granting it
--   would mean a stranger could inflate a number that shows on your card. A
--   gift hands over an object; it does not rewrite anybody's collection record.
--
-- BECAUSE ONLY THE ITEM MOVES, NOTHING IS CREATED. A relic's one use is
-- donate_collectible, which banks points against a church — and church xp ranks
-- congregations. Gifting cannot inflate that: the item existed already and can
-- still only be donated once. It changes WHICH church banks it, and that is a
-- decision two players made on purpose.
--
-- The daily cap is belt-and-braces on top of that: nothing rankable is at
-- stake, but an uncapped write loop pointed at strangers is a spam surface, so
-- ten a day, enforced in SQL rather than in the button.
--
-- NO PLAYER-AUTHORED TEXT. A gift is (who, what, when). There is deliberately
-- no message field — an open text box aimed at a stranger is exactly the
-- moderation problem the churchyard, the keep and the crowd's emoji all avoid.

create table if not exists public.gifts (
  id              bigserial primary key,
  from_user       uuid not null references public.profiles(id) on delete cascade,
  to_user         uuid not null references public.profiles(id) on delete cascade,
  collectible_key text not null,
  local_date      date not null,
  created_at      timestamptz not null default now(),
  seen_at         timestamptz,
  constraint gifts_not_self check (from_user <> to_user)
);

create index if not exists gifts_to_idx on public.gifts (to_user, created_at desc);
create index if not exists gifts_from_day_idx on public.gifts (from_user, local_date);

alter table public.gifts enable row level security;

-- The recipient can read what they were given. There is deliberately NO policy
-- letting anyone read what somebody else has received: a count of who likes you
-- is the feature this app does not have (the my_washings rule).
drop policy if exists "gifts recipient-select" on public.gifts;
create policy "gifts recipient-select" on public.gifts
  for select using (auth.uid() = to_user);
-- No write policy: gift_collectible is the only way a row appears.

-- ── Give one ────────────────────────────────────────────────────────────────
create or replace function public.gift_collectible(
  p_username text,
  p_key text,
  p_local_date date
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_to uuid;
  v_day date;
  v_sent integer;
  v_qty integer;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_key is null or p_key !~ '^[a-z0-9_]{1,60}$' then raise exception 'bad key'; end if;

  -- The client sends its LOCAL date and the server clamps it to +-1 day rather
  -- than trusting it — the house pattern (submit_focus_practice, wash_feet).
  -- A lying client can reach three buckets, which is bounded and buys nothing.
  v_day := coalesce(p_local_date, (now() at time zone 'utc')::date);
  if v_day > ((now() at time zone 'utc')::date + 1) then v_day := (now() at time zone 'utc')::date + 1; end if;
  if v_day < ((now() at time zone 'utc')::date - 1) then v_day := (now() at time zone 'utc')::date - 1; end if;

  select id into v_to from public.profiles
  where lower(username) = lower(regexp_replace(coalesce(p_username, ''), '^@', ''));
  if v_to is null then return json_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_to = uid then return json_build_object('ok', false, 'reason', 'self'); end if;

  select count(*) into v_sent from public.gifts
  where from_user = uid and local_date = v_day;
  if v_sent >= 10 then return json_build_object('ok', false, 'reason', 'daily_cap'); end if;

  -- Must actually be holding one. This is the only ownership check the whole
  -- feature needs: you cannot give what you do not have, and the row you give
  -- comes off your own pile in the same transaction.
  select qty into v_qty from public.user_inventory
  where user_id = uid and collectible_key = p_key
  for update;
  if coalesce(v_qty, 0) <= 0 then return json_build_object('ok', false, 'reason', 'not_held'); end if;

  if v_qty = 1 then
    delete from public.user_inventory where user_id = uid and collectible_key = p_key;
  else
    update public.user_inventory set qty = qty - 1, updated_at = now()
    where user_id = uid and collectible_key = p_key;
  end if;

  insert into public.user_inventory (user_id, collectible_key, qty)
  values (v_to, p_key, 1)
  on conflict (user_id, collectible_key) do update
    set qty = public.user_inventory.qty + 1, updated_at = now();

  -- Deliberately NOT touching user_unlocks. See the header: the stamp is the
  -- recipient's own record and a gift never writes it.

  insert into public.gifts (from_user, to_user, collectible_key, local_date)
  values (uid, v_to, p_key, v_day);

  return json_build_object(
    'ok', true,
    'remaining', greatest(coalesce(v_qty, 1) - 1, 0),
    'sent_today', v_sent + 1
  );
end;
$$;

grant execute on function public.gift_collectible(text, text, date) to authenticated;

-- ── What I have been given ──────────────────────────────────────────────────
-- Recipient-only, like my_washings. There is no RPC that asks how many gifts
-- somebody ELSE has received, and there never should be.
create or replace function public.my_gifts(p_limit integer default 30)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 100));
begin
  if uid is null then raise exception 'not authenticated'; end if;
  return json_build_object(
    'unseen', coalesce((select count(*) from public.gifts where to_user = uid and seen_at is null), 0),
    'gifts', coalesce((
      select json_agg(row_to_json(g)) from (
        select gi.id,
               p.username as from_username,
               p.avatar_emoji as from_avatar,
               gi.collectible_key,
               gi.created_at,
               (gi.seen_at is not null) as seen
        from public.gifts gi
        join public.profiles p on p.id = gi.from_user
        where gi.to_user = uid
        order by gi.created_at desc
        limit v_limit
      ) g
    ), '[]'::json)
  );
end;
$$;

grant execute on function public.my_gifts(integer) to authenticated;

-- ── Mark them read ──────────────────────────────────────────────────────────
create or replace function public.mark_gifts_seen()
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  update public.gifts set seen_at = now() where to_user = uid and seen_at is null;
  return json_build_object('ok', true);
end;
$$;

grant execute on function public.mark_gifts_seen() to authenticated;

notify pgrst, 'reload schema';
