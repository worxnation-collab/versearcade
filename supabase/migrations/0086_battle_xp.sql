-- Battles pay, three a day, and BOTH players get exactly the same.
--
-- Every battle in this app has always paid nothing. That was survivable while
-- the only way into one was to challenge somebody you know; quick match (#188)
-- put a stranger one tap away, and a mode you can play all day for no reward at
-- all is a mode people try once. So this pays for turning up to a battle.
--
-- THE RULE THAT MAKES IT SAFE IS THE ARCADE'S (0084), COPIED DELIBERATELY, and
-- the sentence it turns on is the same one:
--
--   WHAT IS PAID FOR IS TURNING UP, NOT WINNING. This function never reads a
--   score. The winner and the loser of a battle are paid the identical 10 XP,
--   so `xp` — which IS the worldwide leaderboard (0006), the one number here
--   that ranks people — cannot be moved by beating anybody. Losing a battle
--   still costs nothing, which is the whole of this app's no-losers rule and
--   the thing that would break if the winner were paid more. IF A FUTURE
--   SESSION IS TEMPTED TO PAY THE WINNER MORE, THAT IS THE CHANGE THAT TURNS
--   THE LEADERBOARD INTO A BATTLE LADDER. Don't.
--
--   THE SERVER COUNTS AND THE SERVER PAYS. The client says "here is my run"
--   through the two RPCs it already called; no amount is ever sent by a client,
--   and there is deliberately no client-callable grant.
--
--   THE CAP IS IN SQL, NOT IN THE BUTTON: 10 XP x 3 a day = 30, against a daily
--   drop's 30-60. That is the same ceiling praying has (0073) and a battle is a
--   whole five-question run, so it is the right size next to it. The per-battle
--   half of the cap is held by the PRIMARY KEY (user_id, battle_id) — a resubmit
--   or a double-tap inserts nothing — and the per-day half by a count taken
--   under a row lock on the profile, so two battles finishing in the same second
--   cannot both spend the last slot.
--
--   THE CLIENT SENDS todayLocalDate() AND THE SERVER CLAMPS +-1, the house
--   pattern. A lying client can reach three buckets — 90 XP — which is bounded
--   and buys nothing that isn't already reachable by playing three days.
--
-- WHERE IT LIVES IS THE POINT. The grant is inside create_battle and
-- submit_battle rather than in a new RPC, because those two are what EVERY
-- battle path already goes through: an async challenge, a broadcast link, the
-- welcome battle, a room-code live match and a quick match all land there. One
-- choke point, the same habit as QuizRunner. It also means the baked `dist` in
-- every already-approved iOS build starts paying the moment this is applied,
-- without a submission — the same argument first light's submit_play write
-- makes in 0081.
--
-- PARTICIPATION IS RECORDED WHETHER OR NOT IT PAYS. The row goes in first and
-- the cap only decides what it is worth, because battle_plays is also what the
-- live-battle skins count: a ceiling that stopped counting would freeze a
-- player's progress toward a cosmetic on the day they played the most.
--
-- WHAT IS DELIBERATELY NOT STORED: a score, a winner, a streak, a total of days.
-- This table is a user, a battle, a date and what it paid. No RPC asks how many
-- battles anybody else has played, and nothing here can be ordered into a
-- ladder without adding a column and having to argue for it.

-- Which battles were played live, so the skins in 0086's client half can be
-- earned by the live door specifically. Set by create_battle; an old build that
-- doesn't pass it leaves it false, which is honest — it cannot tell us.
alter table public.battles add column if not exists live boolean not null default false;

-- Lifetime live battles played, server-written, only ever going up. It rides on
-- the profile because that is what skinOwned can already read with no extra
-- call, the way shared_days and owned_skins do. It is NOT on get_player_card,
-- no leaderboard selects it, and it must stay that way: a count of matches on
-- somebody else's card is one step from a battle ladder.
alter table public.profiles add column if not exists live_battles int not null default 0;

create table if not exists public.battle_plays (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  battle_id  uuid not null references public.battles(id) on delete cascade,
  played_on  date not null,
  live       boolean not null default false,
  -- What this battle paid: 0 once the day's three are spent. Kept so the cap can
  -- be counted without counting rows that never paid.
  paid       int not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, battle_id)
);

create index if not exists battle_plays_user_day_idx on public.battle_plays (user_id, played_on);

alter table public.battle_plays enable row level security;

-- Yours and only yours. No policy lets anyone read anybody else's, and there is
-- no aggregate RPC over this table.
drop policy if exists "battle_plays self-select" on public.battle_plays;
create policy "battle_plays self-select" on public.battle_plays
  for select using (auth.uid() = user_id);
-- No write policy: the two battle RPCs are the only way a row appears.

/**
 * Record that the CALLER played a battle, and pay for it if the day has room.
 * Returns the XP actually awarded (0 is a normal, successful outcome).
 *
 * It pays auth.uid() and nobody else — there is no p_user, so there is no shape
 * of call that grants XP to another account. It also refuses a battle the caller
 * is not in, which means that even if the revoke below were ever undone, the
 * worst a client could do by calling it directly is claim battles it genuinely
 * played, capped at the same three a day.
 */
create or replace function public.award_battle_xp(p_battle uuid, p_local_date date default null)
returns int
language plpgsql
security definer set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  cap constant int := 3;   -- KEEP IN SYNC with BATTLE_XP_CAP in data/battleXp.ts
  pay constant int := 10;  -- KEEP IN SYNC with BATTLE_XP     in data/battleXp.ts
  d date;
  v_live boolean;
  v_rows int;
  v_today int;
begin
  if uid is null or p_battle is null then return 0; end if;

  -- Only a battle you are actually in. A stranger's id is worth nothing.
  select b.live into v_live from public.battles b
   where b.id = p_battle
     and (b.challenger_id = uid or b.opponent_id = uid or b.invited_id = uid);
  if not found then return 0; end if;

  -- Trust the client's local date, but only just.
  d := coalesce(p_local_date, current_date);
  if d < current_date - 1 then d := current_date - 1; end if;
  if d > current_date + 1 then d := current_date + 1; end if;

  -- The primary key is the per-battle cap: a resubmit, a double-tap, or the
  -- guest's poll landing twice inserts nothing and pays nothing.
  insert into public.battle_plays (user_id, battle_id, played_on, live)
  values (uid, p_battle, d, coalesce(v_live, false))
  on conflict (user_id, battle_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return 0; end if;

  -- Counted honestly whatever the day's ceiling says (see the header).
  if coalesce(v_live, false) then
    update public.profiles set live_battles = live_battles + 1 where id = uid;
  end if;

  -- The row lock is what makes the daily count safe: two battles finishing in
  -- the same second would otherwise both read two-of-three and both pay.
  perform 1 from public.profiles where id = uid for update;

  select count(*) into v_today from public.battle_plays
   where user_id = uid and played_on = d and paid > 0;
  if v_today >= cap then return 0; end if;

  update public.battle_plays set paid = pay
   where user_id = uid and battle_id = p_battle;

  update public.profiles
     set xp = xp + pay,
         level = public.level_from_xp(xp + pay)
   where id = uid;

  return pay;
end;
$$;

-- NOT client-callable. Supabase's default privileges hand `anon` and
-- `authenticated` a NAMED grant on every new function, so revoking PUBLIC alone
-- leaves them standing — the scar 0052 shipped and CLAUDE.md writes down. Revoke
-- the named roles too; the two battle RPCs below are security definer and reach
-- it as their owner.
revoke all on function public.award_battle_xp(uuid, date) from public, anon, authenticated;

-- ── create_battle: the challenger's side of every battle ──────────────────────
-- Dropped and recreated rather than overloaded: a second signature would leave
-- PostgREST resolving an old client's five named arguments to the OLD function,
-- which pays nothing — the bug would be invisible and would land on exactly the
-- players who cannot update.
drop function if exists public.create_battle(bigint, int, int, text, boolean);
create or replace function public.create_battle(
  p_seed bigint,
  p_score int,
  p_time_ms int,
  p_invited text default null,
  p_broadcast boolean default false,
  p_live boolean default false,
  p_local_date date default null
)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_invited uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_invited is not null and p_invited <> '' then
    select id into v_invited from public.profiles where lower(username) = lower(p_invited);
    if v_invited = auth.uid() then v_invited := null; end if;
  end if;
  insert into public.battles(challenger_id, invited_id, seed, challenger_score, challenger_time_ms, broadcast, live)
  values (auth.uid(), v_invited, p_seed, p_score, p_time_ms, coalesce(p_broadcast, false), coalesce(p_live, false))
  returning id into v_id;

  -- The challenger has played their round by the time this is called (the schema
  -- forces it — the row carries their score), so this is their run being paid
  -- for, not the invitation.
  perform public.award_battle_xp(v_id, p_local_date);
  return v_id;
end; $$;

grant execute on function public.create_battle(bigint, int, int, text, boolean, boolean, date) to authenticated;

-- ── submit_battle: the opponent's side ───────────────────────────────────────
-- Same drop-and-recreate reasoning. The return is the SAME battle_json object
-- with one key added, which an older client simply ignores.
drop function if exists public.submit_battle(uuid, int, int);
create or replace function public.submit_battle(
  p_id uuid,
  p_score int,
  p_time_ms int,
  p_local_date date default null
)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare b public.battles; r public.battles; v_winner text; v_paid int := 0;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into b from public.battles where id = p_id for update;
  if not found then raise exception 'battle not found'; end if;
  if b.challenger_id = auth.uid() then raise exception 'cannot battle yourself'; end if;

  v_winner := case
    when p_score > b.challenger_score then 'opponent'
    when p_score < b.challenger_score then 'challenger'
    when p_time_ms < b.challenger_time_ms then 'opponent'
    when p_time_ms > b.challenger_time_ms then 'challenger'
    else 'tie' end;

  if b.broadcast then
    -- one result per opener; spawn a fresh 1v1 from the template
    select * into r from public.battles where source_id = b.id and opponent_id = auth.uid() limit 1;
    if found then return public.battle_json(r) || jsonb_build_object('xp_awarded', 0); end if;
    begin
      insert into public.battles(challenger_id, opponent_id, seed, challenger_score, challenger_time_ms,
        opponent_score, opponent_time_ms, status, winner, completed_at, source_id, live)
      values (b.challenger_id, auth.uid(), b.seed, b.challenger_score, b.challenger_time_ms,
        p_score, p_time_ms, 'complete', v_winner, now(), b.id, b.live)
      returning * into r;
    exception when unique_violation then
      select * into r from public.battles where source_id = b.id and opponent_id = auth.uid() limit 1;
    end;
    -- The opener's own spawned row is the one they played, so that is what pays.
    v_paid := public.award_battle_xp(r.id, p_local_date);
    return public.battle_json(r) || jsonb_build_object('xp_awarded', v_paid);
  end if;

  -- normal targeted/open battle
  if b.invited_id is not null and b.invited_id <> auth.uid() then raise exception 'this challenge is for someone else'; end if;
  -- Already complete: still returns the battle, and still pays if this player's
  -- row hasn't been counted yet. The primary key decides, not this branch.
  if b.status = 'complete' then
    v_paid := public.award_battle_xp(b.id, p_local_date);
    return public.battle_json(b) || jsonb_build_object('xp_awarded', v_paid);
  end if;
  update public.battles
  set opponent_id = auth.uid(), opponent_score = p_score, opponent_time_ms = p_time_ms,
      status = 'complete', winner = v_winner, completed_at = now()
  where id = p_id returning * into b;
  v_paid := public.award_battle_xp(b.id, p_local_date);
  return public.battle_json(b) || jsonb_build_object('xp_awarded', v_paid);
end; $$;

grant execute on function public.submit_battle(uuid, int, int, date) to authenticated;

-- Where the player is against today's ceiling, for the one line the result
-- screens draw. It answers about the CALLER and nobody else — the same
-- recipient-only shape as my_prayers and my_washings.
create or replace function public.my_battle_xp(p_local_date date default null)
returns jsonb
language plpgsql
stable security definer set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  cap constant int := 3;
  pay constant int := 10;
  d date;
  v_today int;
  v_live int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  d := coalesce(p_local_date, current_date);
  if d < current_date - 1 then d := current_date - 1; end if;
  if d > current_date + 1 then d := current_date + 1; end if;

  select count(*) into v_today from public.battle_plays
   where user_id = uid and played_on = d and paid > 0;
  select live_battles into v_live from public.profiles where id = uid;

  return jsonb_build_object('today', v_today, 'cap', cap, 'pay', pay, 'live_battles', coalesce(v_live, 0));
end;
$$;

grant execute on function public.my_battle_xp(date) to authenticated;

notify pgrst, 'reload schema';
