-- Who has played today — a CROWD, not a ladder.
--
-- The Play tab has always carried an ambient count ("N opened today's verse",
-- `get_daily_pulse`), and the count was the whole of it: a number with nothing
-- behind it. This makes the number a door. Tapping it lists the people.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY A NEW FUNCTION RATHER THAN REUSING THE PULSE
--
-- `get_daily_pulse` already returns forty recent rows out of `presence_events`,
-- and reaching for it would have been one line of client code. It is the wrong
-- shape, twice over:
--
--   1. **Every row carries `points`.** The pulse renders them as a drifting
--      ticker where "+430" is ambience — motion, glanced at, gone. The same
--      forty rows held STILL in a scrollable list, one under another, is a
--      score column, and a score column sorted by anything at all is the
--      leaderboard this app deliberately does not put in front of players.
--   2. **It is a feed of EVENTS, not of people.** One player scoring, levelling
--      and hitting a streak is three rows; a list built from it would name the
--      same person three times and silently drop somebody else past the cap.
--
-- So this returns PEOPLE, and it cannot return a score because it never selects
-- one. That is the guarantee, and it is in the shape of the data rather than in
-- the client: there is no `score` in the payload for a future screen to sort
-- by, no rank, no ordinal, and no `count` per person. Exactly the rule the
-- church roster is built on ("a crowd, not a ladder" — `get_church_page`), and
-- the same one that lets `first_light` name one holder without giving anybody a
-- position.
--
-- ORDER IS RECENCY, and that is deliberate too. `plays.created_at desc` is "who
-- turned up most recently", which is a fact about the clock rather than about
-- the people — nobody is above anybody. Ordering by score would need a score,
-- which this does not have; ordering by XP or level would rank them.
--
-- GUESTS ARE COUNTED AND NOT NAMED. The day's number is plays + guest_opens
-- (see `get_daily_pulse`), so a list of accounts alone would be shorter than
-- the number that opened it, which reads as a bug. It returns `guests` as a
-- COUNT so the sheet can say "and N playing as guests" and the arithmetic
-- works. They are not named because `guest_opens.username` is self-chosen,
-- unmoderated text on a row keyed to a device rather than an account — the
-- pulse's drifting ticker is one thing, a list somebody reads is another.
--
-- CAPPED, and the cap is honest. A busy day is thousands of rows and a client
-- has no use for them; `shown` says how many came back so the sheet can say it
-- is showing the most recent rather than pretending to be complete.
--
-- Granted to `anon` like `get_daily_pulse` and `first_light`: a guest seeing
-- that the day is populated is the pitch for an account, and this exposes
-- nothing a player card doesn't already publish.

create or replace function public.daily_players(
  p_drop_date date,
  p_limit int default 100
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_limit    int;
  v_players  json;
  v_guests   int;
  v_accounts int;
begin
  -- Clamp rather than trust: the argument is client-supplied and the only cost
  -- of a silly one is a big payload. Same habit as the ±1 date clamp.
  v_limit := least(greatest(coalesce(p_limit, 100), 1), 200);

  select count(*) into v_accounts from public.plays where drop_date = p_drop_date;
  select count(*) into v_guests   from public.guest_opens where drop_date = p_drop_date;

  select coalesce(json_agg(row_to_json(t)), '[]'::json) into v_players
  from (
    select
      pr.username,
      pr.avatar_emoji,
      pr.avatar_character,
      coalesce(pr.avatar_border, 'default') as avatar_border,
      pr.avatar_badge,
      pr.denomination,
      (pr.id = auth.uid()) as is_me
    from public.plays pl
    join public.profiles pr on pr.id = pl.user_id
    where pl.drop_date = p_drop_date
    order by pl.created_at desc
    limit v_limit
  ) t;

  return json_build_object(
    'players', v_players,
    -- How many are drawn, against how many there are. Never a position.
    'shown',    json_array_length(v_players),
    'accounts', v_accounts,
    'guests',   v_guests,
    'total',    v_accounts + v_guests
  );
end;
$$;

grant execute on function public.daily_players(date, int) to anon, authenticated;
