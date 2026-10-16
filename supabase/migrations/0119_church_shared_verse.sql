-- 0119 — The shared verse, and the congregation's numbers: the VERIFIED layer.
--
-- docs/CHURCH-SHARED-VERSE.md is the long version. Short version:
--
--   * A verified church's leadership may set the day's verse for its members:
--     a reference, the words, and FIVE questions of their own. One row per
--     (church, date). `get_effective_verse` hands a member that row for the
--     day, or null — and null means the global verse, exactly as before.
--   * Leadership sees `get_church_participation`: congregation TOTALS over a
--     window, every number below five withheld. No usernames, no per-person
--     row, no "who hasn't played". A crowd, not a ladder (docs/CHURCH-CLAIM.md).
--   * "Verified" is the paid distinction and it stays OPERATOR-side
--     (`admin_set_church_package`, 0116). No price, no checkout, no badge.
--
-- This REPLACES the windowed verse model 0116/0118 shipped on the same unmerged
-- branch (starts_on/ends_on, no questions, a pool-only fallback) and RETIRES
-- the opt-in check-in list 0118 added: the brief is now explicit that leadership
-- sees no per-member data at all. Both were empty in production when this was
-- written (0 verses, 0 verified churches), which is the only reason reshaping
-- a table is cheap here.
--
-- Deliberately NO `drop`, `delete` or `create policy` in this file: the
-- Supabase MCP hangs on all three from a cloud session (CLAUDE.md). The old
-- table is RENAMED aside rather than dropped, and the retired functions are
-- revoked from every client role rather than dropped. The new table has RLS on
-- and NO policy — every read and write goes through the definer RPCs below —
-- so it is fully locked to direct access by construction.
--
-- Idempotent: a re-run is a no-op.

-- ---------------------------------------------------------------------------
-- 1. The 0116 table moves aside (only if it still has the 0116 shape).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'church_verses' and column_name = 'starts_on'
  ) and to_regclass('public.church_verses_0116') is null then
    alter table public.church_verses rename to church_verses_0116;
  end if;
  if to_regclass('public.church_verses_0116') is not null then
    revoke all on table public.church_verses_0116 from anon, authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. One verse per church per day.
-- ---------------------------------------------------------------------------
create table if not exists public.church_verses (
  church_id  uuid not null references public.churches(id) on delete cascade,
  drop_date  date not null,
  reference  text not null
             check (reference ~ '^[1-3]? ?[A-Za-z][A-Za-z ]* [0-9]{1,3}:[0-9]{1,3}(-[0-9]{1,3})?$'),
  text       text not null check (char_length(text) between 1 and 1000),
  -- Five normalised questions, the client's `Question` shape:
  -- [{ prompt, options[2..4], answerIndex, teach }]. Written only by
  -- `set_church_verse`, which rebuilds it from validated fields.
  questions  jsonb not null check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) = 5),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (church_id, drop_date)
);

alter table public.church_verses enable row level security;
revoke all on table public.church_verses from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Question validation — the SQL mirror of `Question` in src/types/index.ts.
--    Returns the normalised array, or null for anything it can't read. Keep in
--    sync with `cleanQuestions` in src/store/churchAdmin.ts.
-- ---------------------------------------------------------------------------
create or replace function public.church_clean_questions(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  q jsonb;
  o jsonb;
  s text;
  v_prompt text;
  v_teach text;
  v_opts jsonb;
  v_ai numeric;
  v_out jsonb := '[]'::jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) <> 5 then
    return null;
  end if;

  for q in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(q) <> 'object' then return null; end if;

    v_prompt := btrim(coalesce(q->>'prompt', ''));
    v_teach  := btrim(coalesce(q->>'teach', ''));
    if char_length(v_prompt) not between 1 and 300 then return null; end if;
    if char_length(v_teach)  not between 1 and 400 then return null; end if;

    if jsonb_typeof(q->'options') <> 'array'
       or jsonb_array_length(q->'options') not between 2 and 4 then
      return null;
    end if;
    v_opts := '[]'::jsonb;
    for o in select value from jsonb_array_elements(q->'options') loop
      if jsonb_typeof(o) <> 'string' then return null; end if;
      s := btrim(o #>> '{}');
      if char_length(s) not between 1 and 120 then return null; end if;
      if exists (select 1 from jsonb_array_elements_text(v_opts) x where lower(x) = lower(s)) then
        return null; -- two identical options make the question unanswerable
      end if;
      v_opts := v_opts || jsonb_build_array(s);
    end loop;

    if jsonb_typeof(q->'answerIndex') <> 'number' then return null; end if;
    v_ai := (q->>'answerIndex')::numeric;
    if v_ai <> trunc(v_ai) or v_ai < 0 or v_ai >= jsonb_array_length(v_opts) then
      return null;
    end if;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'prompt', v_prompt, 'options', v_opts, 'answerIndex', v_ai::int, 'teach', v_teach));
  end loop;

  return v_out;
end;
$$;

revoke all on function public.church_clean_questions(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. set_church_verse — verified leadership only. Idempotent per day.
-- ---------------------------------------------------------------------------
create or replace function public.set_church_verse(
  p_church_id uuid,
  p_drop_date date,
  p_reference text,
  p_text text,
  p_questions jsonb
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_gate text := public.church_admin_can(p_church_id);   -- 0118: ok | not_leadership | not_verified
  v_ref  text := regexp_replace(btrim(coalesce(p_reference, '')), '[[:space:]]+', ' ', 'g');
  v_text text := btrim(coalesce(p_text, ''));
  v_q    jsonb := public.church_clean_questions(p_questions);
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;

  -- Yesterday (a player still in yesterday's local day) up to a year ahead.
  -- Never further back: a past day's verse is what people already played.
  if p_drop_date is null or p_drop_date < current_date - 1 or p_drop_date > current_date + 366 then
    return jsonb_build_object('ok', false, 'reason', 'bad_date');
  end if;
  if v_ref !~ '^[1-3]? ?[A-Za-z][A-Za-z ]* [0-9]{1,3}:[0-9]{1,3}(-[0-9]{1,3})?$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_reference');
  end if;
  if char_length(v_text) not between 1 and 1000 then
    return jsonb_build_object('ok', false, 'reason', 'bad_text');
  end if;
  if v_q is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_questions');
  end if;

  insert into public.church_verses (church_id, drop_date, reference, text, questions, created_by)
  values (p_church_id, p_drop_date, v_ref, v_text, v_q, auth.uid())
  on conflict (church_id, drop_date) do update
    set reference  = excluded.reference,
        text       = excluded.text,
        questions  = excluded.questions,
        created_by = excluded.created_by;

  return jsonb_build_object('ok', true, 'drop_date', p_drop_date);
end;
$$;

revoke all on function public.set_church_verse(uuid, date, text, text, jsonb) from public, anon;
grant execute on function public.set_church_verse(uuid, date, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. church_verse_for — leadership reads back a day it set, to edit it.
-- ---------------------------------------------------------------------------
create or replace function public.church_verse_for(p_church_id uuid, p_drop_date date)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_gate text := public.church_admin_can(p_church_id);
  v jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  select jsonb_build_object('drop_date', cv.drop_date, 'reference', cv.reference,
                            'text', cv.text, 'questions', cv.questions)
    into v
    from public.church_verses cv
   where cv.church_id = p_church_id and cv.drop_date = p_drop_date;
  return jsonb_build_object('ok', true, 'verse', v);
end;
$$;

revoke all on function public.church_verse_for(uuid, date) from public, anon;
grant execute on function public.church_verse_for(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. get_effective_verse — the member's verse for a day, or null.
--
-- Null for: no account, no church, an unverified church, nothing set for the
-- date, or a date outside the caller's ±1 local day (so tomorrow's questions
-- can't be read today). The client takes null to mean the global verse.
-- ---------------------------------------------------------------------------
create or replace function public.get_effective_verse(p_drop_date date)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
           'church_id',   c.id,
           'church_name', c.name,
           'drop_date',   cv.drop_date,
           'reference',   cv.reference,
           'text',        cv.text,
           'questions',   cv.questions)
    from public.profiles p
    join public.churches c       on c.id = p.church_id and c.verified
    join public.church_verses cv on cv.church_id = c.id and cv.drop_date = p_drop_date
   where p.id = auth.uid()
     and p_drop_date between current_date - 1 and current_date + 1;
$$;

revoke all on function public.get_effective_verse(date) from public, anon;
grant execute on function public.get_effective_verse(date) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. get_church_participation — totals only, floored at five.
--
-- Every count under FIVE comes back null, including zero: in a small group a
-- total points at a person. There is no per-day series, no per-member row and
-- nothing about who did NOT play. Keep `floor_n` in sync with
-- PARTICIPATION_FLOOR in src/types/churchPackages.ts.
--
-- Streak buckets count LIVE streaks only (played today or yesterday):
-- `current_streak` is rewritten on the next play, so a stale number belongs to
-- somebody who has already stopped.
-- ---------------------------------------------------------------------------
create or replace function public.get_church_participation(
  p_church_id uuid,
  p_days int default 14,
  p_local_date date default null
)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  floor_n constant int := 5;
  v_gate  text := public.church_admin_can(p_church_id);
  v_days  int  := least(greatest(coalesce(p_days, 14), 1), 60);
  v_today date := least(greatest(coalesce(p_local_date, current_date), current_date - 1), current_date + 1);
  v_from  date := v_today - (v_days - 1);
  v_members int;
  v_players int;
  v_plays   int;
  v_avg     numeric;
  v_today_n int;
  b1 int; b2_6 int; b7 int;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;

  select count(*) into v_members from public.profiles where church_id = p_church_id;

  select count(distinct pl.user_id),
         count(*),
         avg(pl.score),
         count(distinct pl.user_id) filter (where pl.drop_date = v_today)
    into v_players, v_plays, v_avg, v_today_n
    from public.plays pl
    join public.profiles p on p.id = pl.user_id
   where p.church_id = p_church_id
     and pl.drop_date between v_from and v_today;

  select count(*) filter (where p.current_streak = 1),
         count(*) filter (where p.current_streak between 2 and 6),
         count(*) filter (where p.current_streak >= 7)
    into b1, b2_6, b7
    from public.profiles p
   where p.church_id = p_church_id
     and p.last_played_on >= v_today - 1;

  return jsonb_build_object(
    'ok', true,
    'days', v_days,
    'from', v_from,
    'to', v_today,
    'floor', floor_n,
    'members',          case when v_members >= floor_n then v_members end,
    'players',          case when v_players >= floor_n then v_players end,
    'plays',            case when v_plays   >= floor_n then v_plays end,
    'avg_score',        case when v_players >= floor_n and v_plays >= floor_n then round(v_avg) end,
    'pct_played_today', case when v_today_n >= floor_n and v_members > 0
                             then round(100.0 * v_today_n / v_members) end,
    'streaks', jsonb_build_object(
      's1',   case when b1   >= floor_n then b1 end,
      's2_6', case when b2_6 >= floor_n then b2_6 end,
      's7',   case when b7   >= floor_n then b7 end)
  );
end;
$$;

revoke all on function public.get_church_participation(uuid, int, date) from public, anon;
grant execute on function public.get_church_participation(uuid, int, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. my_church_today, restated from 0117 without the verse. The day's verse
--    is `get_effective_verse` now; this keeps the banner and the giving link.
-- ---------------------------------------------------------------------------
create or replace function public.my_church_today(p_local_date date default null)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_church uuid;
  v_name text;
  v_verified boolean;
  v_giving text;
  v_news jsonb;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select p.church_id, c.name, c.verified, c.giving_url
    into v_church, v_name, v_verified, v_giving
    from public.profiles p join public.churches c on c.id = p.church_id
   where p.id = uid;

  if v_church is null then
    return jsonb_build_object('church_id', null, 'verified', false, 'announcements', '[]'::jsonb);
  end if;

  if v_verified then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', a.id, 'message', a.message, 'expires_at', a.expires_at, 'created_at', a.created_at)
             order by a.created_at desc), '[]'::jsonb)
      into v_news
      from (select * from public.church_announcements
             where church_id = v_church and (expires_at is null or expires_at > now())
             order by created_at desc limit 5) a;
  end if;

  return jsonb_build_object(
    'church_id', v_church,
    'church_name', v_name,
    'verified', coalesce(v_verified, false),
    'giving_url', case when v_verified then v_giving end,
    'announcements', coalesce(v_news, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.my_church_today(date) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Retired: the windowed scheduler, the 0116/0118 overviews and the opt-in
--    check-in list. Revoked from every client role (not dropped — see the
--    header), so their ACL reads {postgres,service_role}-only. The column
--    `profiles.church_care_optin` stays, unread by anything.
-- ---------------------------------------------------------------------------
do $$
declare
  sig text;
begin
  foreach sig in array array[
    'public.schedule_church_verse(uuid,text,text,text,date,date)',
    'public.list_church_verses(uuid,date)',
    'public.delete_church_verse(uuid)',
    'public.church_participation_7d(uuid,date)',
    'public.church_admin_overview(uuid,date)',
    'public.church_care_list(uuid,date)',
    'public.set_church_care_optin(boolean)'
  ] loop
    if to_regprocedure(sig) is not null then
      execute format('revoke all on function %s from public, anon, authenticated', sig);
    end if;
  end loop;
end $$;
