-- 0100: the daily drop's answer poll — how everybody answered each question.
--
-- After a player locks an answer on the day's verse, the feedback screen shows
-- how the crowd split across the four options: four bars, the right one marked,
-- the one you picked marked. "61% chose this too" under a wrong answer is the
-- no-shame version of a poll — a common mistake is company, not a rank.
--
-- ── What keeps it inside the no-losers rule is the SHAPE of the data ────────
--
--  * A tally carries NO user. `daily_answer_tallies` is (day, deal, question,
--    option) → a count, and nothing else. There is no row that says who picked
--    what, so a "who got it wrong" list can never be built out of this table
--    later, the same guarantee the rivalry's payload shape and `daily_players`
--    give. Erasure (0085) has nothing to scrub here, by construction.
--  * It is answers only, accounts only. The five choices ride into
--    `submit_play` and are counted inside the same statement that records the
--    play, so a tally is written exactly once per account per day (the
--    `plays` unique key is the guard — the idempotent early return never
--    reaches the count). Guest answers are NOT counted: `record_guest_open`
--    takes a client-made device id, and a device id can stuff a public number.
--    A guest can still SEE the poll (granted to anon) — that is the pitch.
--  * Practice replays of a past day READ the poll and never write it —
--    practice is uncapped, and a replay counting would be one person voting
--    many times.
--  * A floor, and NOTHING below it. `daily_answer_poll` returns a question
--    only once at least POLL_MIN_ANSWERS accounts have answered it; under that
--    the client renders nothing rather than "67%" off three players. The
--    number lives here AND in src/data/poll.ts (the usual keep-in-sync pair).
--    It is 10 against ~20-40 plays a day at the time of writing; raise it as
--    the crowd grows.
--
-- ── The deal fingerprint ────────────────────────────────────────────────────
--
-- The tally keys on OPTION INDEX, which is only meaningful because the day's
-- five questions — and the order of their four options — are seeded off the
-- date and are the same for everybody (getVerseForDate). But two app versions
-- can disagree about a date's deal: distractors are drawn from VERSE_POOL, and
-- the pool grows. A tally keyed on index alone would then show one build's
-- crowd under another build's option text — wrong, and invisible. So the
-- client sends a short fingerprint of the questions it actually showed
-- (`dealFingerprint` in src/data/poll.ts: FNV-1a over prompts + options), the
-- tally is keyed on it, and a build whose deal differs sees NO poll rather
-- than the wrong one. Fail closed, per the catalog's rule.
--
-- ── submit_play ─────────────────────────────────────────────────────────────
--
-- Re-declared WHOLE from 0081 (which re-declared it whole from 0064, which did
-- the same from 0015) with TWO trailing defaulted parameters and ONE call,
-- both marked NEW below. The body between is copied out of 0081 by script,
-- not retyped — that file's header records what hand-retyping cost last time
-- (0064 lost its presence_events writes). Production's copy was checked
-- against 0081 before this was written, not assumed.
--
-- The old seven-argument signature is DROPPED first. Adding defaulted
-- parameters through `create or replace` makes a second overload, and an old
-- client sending seven named arguments then matches BOTH — PostgREST refuses
-- the ambiguity with a 300 and every already-approved iOS build stops being
-- able to finish a daily drop. That is the 0086 scar. With the old one gone, a
-- seven-argument call resolves to this one with the two new parameters null,
-- and a baked build simply doesn't count toward the poll.
--
-- A timed-out question arrives as choice -1 and is skipped: "no answer" is not
-- an answer. Anything out of range (a choice past 3, more than 8 questions, a
-- fingerprint that isn't 8 hex chars) is skipped rather than raised — the poll
-- is a garnish on a play that has already paid, and must never fail one.

create table if not exists public.daily_answer_tallies (
  drop_date date     not null,
  deal      text     not null,
  question  smallint not null,
  option    smallint not null,
  answers   integer  not null default 0,
  primary key (drop_date, deal, question, option),
  constraint daily_answer_tallies_deal_check check (deal ~ '^[0-9a-f]{8}$'),
  constraint daily_answer_tallies_question_check check (question between 0 and 7),
  constraint daily_answer_tallies_option_check check (option between 0 and 3)
);

alter table public.daily_answer_tallies enable row level security;
-- No policies on purpose: read through daily_answer_poll, written only inside
-- submit_play. Nothing here is selectable by a client role directly.

-- The write half. Takes no user and is not client-callable: it is only ever
-- reached from inside submit_play, after the play's own unique key has already
-- proven this is the account's first submission for the day.
create or replace function public.record_answer_tallies(
  p_drop_date date,
  p_deal text,
  p_choices integer[]
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  i integer;
  c integer;
begin
  if p_deal is null or p_deal !~ '^[0-9a-f]{8}$' then
    return;
  end if;
  if p_choices is null or coalesce(array_length(p_choices, 1), 0) = 0
     or array_length(p_choices, 1) > 8 then
    return;
  end if;
  for i in 1 .. array_length(p_choices, 1) loop
    c := p_choices[i];
    if c is null or c < 0 or c > 3 then
      continue;  -- -1 is a timeout: no answer, no vote
    end if;
    insert into public.daily_answer_tallies (drop_date, deal, question, option, answers)
    values (p_drop_date, p_deal, i - 1, c, 1)
    on conflict (drop_date, deal, question, option)
    do update set answers = public.daily_answer_tallies.answers + 1;
  end loop;
end;
$$;

revoke all on function public.record_answer_tallies(date, text, integer[]) from public, anon, authenticated;

-- The read half. Public — a guest sees the crowd, and that is the pitch.
-- Returns {"floor": 10, "questions": {"0": [a,b,c,d], "2": [...]}} with a
-- question present ONLY once its four counts sum to at least the floor.
-- Nothing in the payload is about a person.
create or replace function public.daily_answer_poll(p_drop_date date, p_deal text)
returns json
language plpgsql
stable
security definer set search_path = public
as $$
declare
  poll_min constant integer := 10;  -- ↔ POLL_MIN_ANSWERS in src/data/poll.ts
  qs json;
begin
  if p_deal is null or p_deal !~ '^[0-9a-f]{8}$' then
    return json_build_object('floor', poll_min, 'questions', '{}'::json);
  end if;

  select coalesce(json_object_agg(q.question::text, q.counts), '{}'::json)
    into qs
  from (
    select t.question,
           json_build_array(
             coalesce(sum(t.answers) filter (where t.option = 0), 0),
             coalesce(sum(t.answers) filter (where t.option = 1), 0),
             coalesce(sum(t.answers) filter (where t.option = 2), 0),
             coalesce(sum(t.answers) filter (where t.option = 3), 0)
           ) as counts
    from public.daily_answer_tallies t
    where t.drop_date = p_drop_date and t.deal = p_deal
    group by t.question
    having sum(t.answers) >= poll_min
  ) q;

  return json_build_object('floor', poll_min, 'questions', qs);
end;
$$;

grant execute on function public.daily_answer_poll(date, text) to anon, authenticated;

-- ── submit_play, whole, from 0081 ───────────────────────────────────────────

drop function if exists public.submit_play(date, integer, integer, integer, integer, integer, boolean);

create or replace function public.submit_play(
  p_drop_date date,
  p_score integer,
  p_time_ms integer,
  p_correct integer,
  p_total integer,
  p_combo_max integer,
  p_use_boost boolean default false,
  -- NEW in 0100: the run's choices, one per question (-1 for a timeout), and
  -- the fingerprint of the deal they were made against. Both default null so
  -- a baked build's seven-argument call still resolves here.
  p_choices integer[] default null,
  p_deal text default null
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prof public.profiles%rowtype;
  v_xp_earned integer;
  v_new_xp integer;
  v_new_level integer;
  v_leveled_up boolean := false;
  v_missed integer;
  v_new_streak integer;
  v_freezes integer;
  v_used_freeze boolean := false;
  v_boost_used boolean := false;
  v_boosts_left integer;
  v_play_id uuid;
  v_pet_bonus numeric;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select * into prof from public.profiles where id = uid for update;
  v_boosts_left := coalesce(prof.xp_boosts, 0);

  -- Idempotent: if they already played this drop, just return current state.
  if exists (select 1 from public.plays where user_id = uid and drop_date = p_drop_date) then
    return json_build_object(
      'already_played', true,
      'xp', prof.xp, 'level', prof.level,
      'current_streak', prof.current_streak, 'leveled_up', false,
      'xp_boosts', v_boosts_left
    );
  end if;

  -- XP: score is speed+accuracy; convert to XP with a floor so every play pays.
  v_xp_earned := greatest(10, round(p_score / 8.0)::int) + (p_correct * 4);

  -- Streak advance -----------------------------------------------------------
  v_freezes := prof.streak_freezes;
  if prof.last_played_on is null then
    v_new_streak := 1;
  elsif prof.last_played_on = p_drop_date - 1 then
    v_new_streak := prof.current_streak + 1;         -- perfect continuation
  elsif prof.last_played_on >= p_drop_date then
    v_new_streak := prof.current_streak;             -- playing a back-day; no change
  else
    v_missed := (p_drop_date - prof.last_played_on) - 1;
    if v_freezes >= v_missed and v_missed > 0 then
      v_freezes := v_freezes - v_missed;             -- absorb the gap kindly
      v_new_streak := prof.current_streak + 1;
      v_used_freeze := true;
    else
      v_new_streak := 1;                             -- gentle reset, no shaming copy
    end if;
  end if;

  -- Streak milestone bonus XP (3/7/30/100).
  if v_new_streak in (3, 7, 30, 100) then
    v_xp_earned := v_xp_earned + (v_new_streak * 5);
  end if;

  -- XP Boost: +50% on this play's total XP, then consume one.
  if p_use_boost and v_boosts_left > 0 then
    v_xp_earned := round(v_xp_earned * 1.5)::int;
    v_boost_used := true;
    v_boosts_left := v_boosts_left - 1;
  end if;

  -- NEW in 0064: the equipped pet's slice. Read from the profile rather than
  -- sent by the client, and applied AFTER the consumable so the two don't
  -- multiply into something surprising. Mirrored in src/lib/progress.ts —
  -- same order, same rounding.
  v_pet_bonus := public.pet_xp_bonus(prof.pet);
  if v_pet_bonus > 0 then
    v_xp_earned := round(v_xp_earned * (1 + v_pet_bonus))::int;
  end if;

  v_new_xp := prof.xp + v_xp_earned;
  v_new_level := public.level_from_xp(v_new_xp);
  v_leveled_up := v_new_level > prof.level;

  insert into public.plays (user_id, drop_date, score, time_ms, correct_count,
                            total_questions, combo_max, xp_earned)
  values (uid, p_drop_date, p_score, p_time_ms, p_correct, p_total, p_combo_max, v_xp_earned)
  returning id into v_play_id;

  update public.profiles set
    xp = v_new_xp,
    level = v_new_level,
    current_streak = v_new_streak,
    longest_streak = greatest(longest_streak, v_new_streak),
    streak_freezes = v_freezes,
    xp_boosts = v_boosts_left,
    last_played_on = greatest(coalesce(last_played_on, p_drop_date), p_drop_date),
    total_plays = total_plays + 1
  where id = uid;

  -- NEW in 0081: finishing today's drop is also an OPEN of it. Idempotent per
  -- (day, account) and it never pays the player calling it — see
  -- record_daily_open.
  perform public.record_daily_open(uid, p_drop_date);

  -- NEW in 0100: the poll. Counted only on THIS path — the already-played
  -- return above never reaches it — so one account is one vote per question
  -- per day. Skips anything it can't read rather than failing the play.
  if p_choices is not null and p_deal is not null then
    perform public.record_answer_tallies(p_drop_date, p_deal, p_choices);
  end if;

  -- Ambient presence: warm, non-competitive signal that others are here too.
  insert into public.presence_events (drop_date, username, avatar_emoji, points, kind)
  values (p_drop_date, prof.username, prof.avatar_emoji, p_score, 'scored');
  if v_leveled_up then
    insert into public.presence_events (drop_date, username, avatar_emoji, points, kind)
    values (p_drop_date, prof.username, prof.avatar_emoji, v_new_level, 'levelup');
  end if;

  return json_build_object(
    'already_played', false,
    'play_id', v_play_id,
    'xp_earned', v_xp_earned,
    'xp', v_new_xp,
    'level', v_new_level,
    'leveled_up', v_leveled_up,
    'current_streak', v_new_streak,
    'used_freeze', v_used_freeze,
    'streak_freezes', v_freezes,
    'boost_used', v_boost_used,
    'xp_boosts', v_boosts_left
  );
end;
$$;

grant execute on function public.submit_play(date, integer, integer, integer, integer, integer, boolean, integer[], text) to authenticated;

notify pgrst, 'reload schema';
