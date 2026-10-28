-- 0152 — Autopilot: a church's week drafts itself, and waits for the pastor.
--
-- 0148 let a sermon memo draft its own week when the leader ticked a box on
-- upload. Autopilot is that, standing: one switch on Plan, stored per church,
-- default OFF. docs/CHURCH-SHARED-VERSE.md → "Autopilot".
--
--   * A sermon memo sent through Plan's sermon source while Autopilot is on
--     queues the 0148 job by itself (the client ticks the box for it; the
--     function refuses an Autopilot memo job in a skipped week).
--   * If no memo has arrived by the CUTOFF (Monday 9pm in the church's own
--     time zone unless the pastor sets another), and the pastor has set a
--     FALLBACK (a topic or one passage, resolved to BSB verses when it was
--     saved), the week is drafted from that instead: the SAME 0148 job row
--     with `source = 'fallback'`, run by the SAME `church-draft` week call —
--     the 30-a-day units, the refunds, the blind answer check, drafts only.
--   * No fallback set → the week is recorded as skipped, with nothing drafted.
--     Never a week from nothing.
--   * "Skip this week" pauses Autopilot for the current week only.
--
-- There is no cron in this project, so nothing fires at the cutoff on its
-- own: the first visit by the church's leadership after it (the dashboard or
-- the church tab) asks `church-draft` for `autopilot_tick`, which reads
-- `church_autopilot` as that leader and, when the week is due, claims it here
-- (`church_autopilot_claim`, service_role) — once per church per week, by the
-- primary key of `church_autopilot_weeks`.
--
-- A WEEK runs Sunday to Saturday in the church's time zone (the sermon is
-- Sunday's). The fallback fills the seven days after the cutoff's day (from
-- today, if the first visit after the cutoff comes later), and only the EMPTY ones: a live day or a waiting draft in that window is never
-- touched, and a window with fewer than two empty days is recorded as already
-- planned rather than drafted.
--
-- Nothing here approves anything. Every day the fallback writes is a DRAFT,
-- and approval is the unchanged 0127/0129 path.
--
-- Gates: every client-callable function here is `church_gen_can` — verified
-- leadership of THAT church holding Content Generation — so a free claim, an
-- unverified church or a church without the add-on reads not_verified /
-- not_leadership / no_addon and the toggle is never drawn.

alter table public.church_auto_weeks add column if not exists source text not null default 'memo';
alter table public.church_auto_weeks add column if not exists autopilot boolean not null default false;
alter table public.church_auto_weeks add column if not exists window_end date;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'church_auto_weeks_source_check') then
    alter table public.church_auto_weeks add constraint church_auto_weeks_source_check check (source in ('memo', 'fallback'));
  end if;
end $$;

create table if not exists public.church_autopilot (
  church_id          uuid primary key,
  enabled            boolean not null default false,
  tz                 text not null default 'America/New_York',
  cutoff_dow         int not null default 1 check (cutoff_dow between 0 and 6),
  cutoff_minute      int not null default 1260 check (cutoff_minute between 0 and 1439),
  fallback_kind      text check (fallback_kind in ('topic', 'passage')),
  fallback_label     text check (fallback_label is null or char_length(fallback_label) between 1 and 80),
  fallback_series    text check (fallback_series is null or char_length(fallback_series) between 1 and 60),
  fallback_guidance  text check (fallback_guidance is null or char_length(fallback_guidance) <= 300),
  fallback_passages  jsonb,
  skip_week          date,
  updated_by         uuid,
  updated_at         timestamptz not null default now()
);
alter table public.church_autopilot enable row level security;
revoke all on table public.church_autopilot from anon, authenticated;

create table if not exists public.church_autopilot_weeks (
  church_id   uuid not null,
  week_start  date not null,
  outcome     text not null check (outcome in ('fallback', 'no_source', 'covered')),
  job_id      uuid,
  created_at  timestamptz not null default now(),
  primary key (church_id, week_start)
);
alter table public.church_autopilot_weeks enable row level security;
revoke all on table public.church_autopilot_weeks from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The passages a fallback carries, the shape `church-draft`'s readPassages
-- takes: 1-3 of { reference, verses: [{ n, text }] }, 40 verses each at most,
-- 6,000 characters of scripture in all. Null when anything is off.
-- ---------------------------------------------------------------------------
create or replace function public.church_autopilot_passages(p jsonb)
returns jsonb
language plpgsql immutable
set search_path = public
as $$
declare
  v_p jsonb;
  v_v jsonb;
  v_chars int := 0;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) not between 1 and 3 then return null; end if;
  for v_p in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(v_p) <> 'object'
       or coalesce(char_length(btrim(v_p->>'reference')), 0) not between 3 and 60
       or jsonb_typeof(v_p->'verses') <> 'array'
       or jsonb_array_length(v_p->'verses') not between 1 and 40 then
      return null;
    end if;
    for v_v in select value from jsonb_array_elements(v_p->'verses') loop
      if jsonb_typeof(v_v->'n') <> 'number' or jsonb_typeof(v_v->'text') <> 'string' or char_length(v_v->>'text') < 1 then
        return null;
      end if;
      v_chars := v_chars + char_length(v_v->>'text');
    end loop;
  end loop;
  if v_chars > 6000 then return null; end if;
  return p;
end;
$$;
revoke all on function public.church_autopilot_passages(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Where this church's Autopilot stands right now. No gate (the callers gate);
-- service_role only. `state`:
--   off        the switch is off
--   paused     "Skip this week" for the current week
--   memo       a sermon memo job was made this week (any job, any status)
--   waiting    no memo yet, the cutoff hasn't passed
--   due        past the cutoff, nothing recorded for the week yet
--   fallback / no_source / covered  — what the week's claim recorded
-- ---------------------------------------------------------------------------
create or replace function public.church_autopilot_state(p_church_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  s          public.church_autopilot;
  v_local    timestamp;
  v_today    date;
  v_week     date;
  v_week_ts  timestamptz;
  v_cut      timestamp;
  v_cut_ts   timestamptz;
  v_win_from date;
  v_memo     record;
  v_wk       record;
  v_job      record;
  v_state    text;
  v_settings jsonb;
begin
  select * into s from public.church_autopilot where church_id = p_church_id;
  if s.church_id is null then
    s.enabled := false; s.tz := 'America/New_York'; s.cutoff_dow := 1; s.cutoff_minute := 1260;
  end if;
  v_local   := now() at time zone s.tz;
  v_today   := v_local::date;
  v_week    := v_today - extract(dow from v_today)::int;
  v_week_ts := v_week::timestamp at time zone s.tz;
  v_cut     := (v_week + s.cutoff_dow)::timestamp + make_interval(mins => s.cutoff_minute);
  v_cut_ts  := v_cut at time zone s.tz;
  -- The day after the cutoff's day, or today when the first visit comes later:
  -- a fallback never drafts a day that has already gone.
  v_win_from := greatest((v_week + s.cutoff_dow) + 1, v_today);

  v_settings := jsonb_build_object(
    'enabled', s.enabled,
    'tz', s.tz,
    'cutoff_dow', s.cutoff_dow,
    'cutoff_minute', s.cutoff_minute,
    'fallback', case when s.fallback_kind is null then null else jsonb_build_object(
      'kind', s.fallback_kind,
      'label', s.fallback_label,
      'series', s.fallback_series,
      'references', coalesce((select jsonb_agg(p->>'reference') from jsonb_array_elements(s.fallback_passages) p), '[]'::jsonb)
    ) end,
    'skip_week', s.skip_week
  );

  select w.id, w.status into v_memo
    from public.church_auto_weeks w
   where w.church_id = p_church_id and w.source = 'memo' and w.created_at >= v_week_ts
   order by w.created_at desc limit 1;
  select * into v_wk from public.church_autopilot_weeks where church_id = p_church_id and week_start = v_week;
  select w.id, w.status into v_job from public.church_auto_weeks w where w.id = v_wk.job_id;

  v_state := case
    when not s.enabled then 'off'
    when s.skip_week = v_week then 'paused'
    when v_memo.id is not null then 'memo'
    when v_wk.outcome is not null then v_wk.outcome
    when v_local < v_cut then 'waiting'
    else 'due'
  end;

  return jsonb_build_object(
    'settings', v_settings,
    'state', v_state,
    'week_start', v_week,
    'cutoff_at', v_cut_ts,
    'window_from', v_win_from,
    'window_to', v_win_from + 6,
    'job', case
      when v_state = 'memo' then jsonb_build_object('id', v_memo.id, 'status', v_memo.status)
      when v_job.id is not null then jsonb_build_object('id', v_job.id, 'status', v_job.status)
      else null end
  );
end;
$$;
revoke all on function public.church_autopilot_state(uuid) from public, anon, authenticated;

-- Leadership's read: the settings and where the week stands. Changes nothing.
create or replace function public.church_autopilot(p_church_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_gate text := public.church_gen_can(p_church_id);
begin
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  return jsonb_build_object('ok', true) || public.church_autopilot_state(p_church_id);
end;
$$;
revoke all on function public.church_autopilot(uuid) from public, anon;
grant execute on function public.church_autopilot(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The switch, the cutoff, the time zone and the fallback. `p_fallback` null
-- clears it, the JSON string "keep" leaves the saved one as it is; otherwise { kind, label, series, guidance, passages } with the
-- passages already resolved to BSB verses by the client (as every week is).
-- ok | bad_tz | bad_cutoff | bad_fallback
-- ---------------------------------------------------------------------------
create or replace function public.set_church_autopilot(
  p_church_id uuid,
  p_enabled boolean,
  p_tz text,
  p_cutoff_dow int,
  p_cutoff_minute int,
  p_fallback jsonb default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_gate   text := public.church_gen_can(p_church_id);
  v_tz     text := btrim(coalesce(p_tz, ''));
  v_ok     boolean;
  v_kind   text;
  v_label  text;
  v_series text;
  v_guide  text;
  v_pass   jsonb;
begin
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  select exists (select 1 from pg_timezone_names where name = v_tz) into v_ok;
  if not v_ok then return jsonb_build_object('ok', false, 'reason', 'bad_tz'); end if;
  if p_cutoff_dow is null or p_cutoff_dow not between 0 and 6
     or p_cutoff_minute is null or p_cutoff_minute not between 0 and 1439 then
    return jsonb_build_object('ok', false, 'reason', 'bad_cutoff');
  end if;
  if p_fallback = to_jsonb('keep'::text) then
    -- The switch or the cutoff changed; the saved fallback stays as it is.
    select fallback_kind, fallback_label, fallback_series, fallback_guidance, fallback_passages
      into v_kind, v_label, v_series, v_guide, v_pass
      from public.church_autopilot where church_id = p_church_id;
  elsif p_fallback is not null and jsonb_typeof(p_fallback) <> 'null' then
    v_kind   := p_fallback->>'kind';
    v_label  := public.church_clean_line(p_fallback->>'label', 80);
    v_series := public.church_clean_line(p_fallback->>'series', 60);
    v_guide  := public.church_clean_line(p_fallback->>'guidance', 300);
    v_pass   := public.church_autopilot_passages(p_fallback->'passages');
    if v_kind not in ('topic', 'passage') or v_label is null or v_series is null or v_pass is null then
      return jsonb_build_object('ok', false, 'reason', 'bad_fallback');
    end if;
  end if;
  insert into public.church_autopilot (church_id, enabled, tz, cutoff_dow, cutoff_minute,
    fallback_kind, fallback_label, fallback_series, fallback_guidance, fallback_passages, updated_by, updated_at)
  values (p_church_id, coalesce(p_enabled, false), v_tz, p_cutoff_dow, p_cutoff_minute,
    v_kind, v_label, v_series, v_guide, v_pass, auth.uid(), now())
  on conflict (church_id) do update set
    enabled = excluded.enabled, tz = excluded.tz, cutoff_dow = excluded.cutoff_dow,
    cutoff_minute = excluded.cutoff_minute, fallback_kind = excluded.fallback_kind,
    fallback_label = excluded.fallback_label, fallback_series = excluded.fallback_series,
    fallback_guidance = excluded.fallback_guidance, fallback_passages = excluded.fallback_passages,
    updated_by = excluded.updated_by, updated_at = now();
  return jsonb_build_object('ok', true) || public.church_autopilot_state(p_church_id);
end;
$$;
revoke all on function public.set_church_autopilot(uuid, boolean, text, int, int, jsonb) from public, anon;
grant execute on function public.set_church_autopilot(uuid, boolean, text, int, int, jsonb) to authenticated;

-- "Skip this week" (true) or undo it (false). The current week only, in the
-- church's time zone; the switch stays on. ok | not_set_up
create or replace function public.set_church_autopilot_skip(p_church_id uuid, p_skip boolean)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_gate text := public.church_gen_can(p_church_id);
  v_tz   text;
  v_day  date;
begin
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  select tz into v_tz from public.church_autopilot where church_id = p_church_id;
  if v_tz is null then return jsonb_build_object('ok', false, 'reason', 'not_set_up'); end if;
  v_day := (now() at time zone v_tz)::date;
  update public.church_autopilot
     set skip_week = case when p_skip then v_day - extract(dow from v_day)::int else null end,
         updated_by = auth.uid(), updated_at = now()
   where church_id = p_church_id;
  return jsonb_build_object('ok', true) || public.church_autopilot_state(p_church_id);
end;
$$;
revoke all on function public.set_church_autopilot_skip(uuid, boolean) from public, anon;
grant execute on function public.set_church_autopilot_skip(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Claim a DUE week, once (the primary key). Service_role only: `church-draft`
-- calls it after `church_autopilot` answered 'due' to the leader's own token,
-- and passes that leader as the job's owner (their token runs the stages and
-- spends the church's units). Records `no_source` with no fallback, `covered`
-- when the window holds fewer than two empty days, else makes the job.
-- Returns the state after the claim, plus `run: true` when a job was made.
-- ---------------------------------------------------------------------------
create or replace function public.church_autopilot_claim(p_church_id uuid, p_user uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_st    jsonb := public.church_autopilot_state(p_church_id);
  s       public.church_autopilot;
  v_week  date;
  v_from  date;
  v_to    date;
  v_open  int;
  v_job   uuid;
  v_rows  int;
begin
  if v_st->>'state' <> 'due' then return v_st || jsonb_build_object('run', false); end if;
  select * into s from public.church_autopilot where church_id = p_church_id;
  v_week := (v_st->>'week_start')::date;
  v_from := (v_st->>'window_from')::date;
  v_to   := (v_st->>'window_to')::date;

  if s.fallback_passages is null then
    insert into public.church_autopilot_weeks (church_id, week_start, outcome)
    values (p_church_id, v_week, 'no_source') on conflict do nothing;
    return public.church_autopilot_state(p_church_id) || jsonb_build_object('run', false);
  end if;

  select count(*) into v_open
    from generate_series(v_from, v_to, interval '1 day') d
   where not exists (select 1 from public.church_verses v
                      where v.church_id = p_church_id and v.drop_date = d::date and v.discarded_at is null);
  if v_open < 2 then
    insert into public.church_autopilot_weeks (church_id, week_start, outcome)
    values (p_church_id, v_week, 'covered') on conflict do nothing;
    return public.church_autopilot_state(p_church_id) || jsonb_build_object('run', false);
  end if;

  insert into public.church_autopilot_weeks (church_id, week_start, outcome)
  values (p_church_id, v_week, 'fallback') on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return public.church_autopilot_state(p_church_id) || jsonb_build_object('run', false); end if;

  insert into public.church_auto_weeks (church_id, created_by, status, source, autopilot, series, passages, guidance, start_date, days, window_end)
  values (p_church_id, p_user, 'queued', 'fallback', true, s.fallback_series, s.fallback_passages, s.fallback_guidance,
          v_from, least(v_open, 7), v_to)
  returning id into v_job;
  update public.church_autopilot_weeks set job_id = v_job where church_id = p_church_id and week_start = v_week;
  return public.church_autopilot_state(p_church_id) || jsonb_build_object('run', true, 'job_id', v_job);
end;
$$;
revoke all on function public.church_autopilot_claim(uuid, uuid) from public, anon, authenticated;
grant execute on function public.church_autopilot_claim(uuid, uuid) to service_role;

-- Whether an Autopilot memo job should be refused: the switch is on and this
-- week is skipped. Service_role (the function asks before queueing one).
create or replace function public.church_autopilot_paused(p_church_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((public.church_autopilot_state(p_church_id)->>'state') = 'paused', false);
$$;
revoke all on function public.church_autopilot_paused(uuid) from public, anon, authenticated;
grant execute on function public.church_autopilot_paused(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- church_auto_weeks (0148) restated with the same signature: each job says
-- where it came from (`source`, `autopilot`), and a FALLBACK job is
-- retryable on failure (it keeps its passages; it has no memo to lose).
-- ---------------------------------------------------------------------------
create or replace function public.church_auto_weeks(p_church_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_gate text := public.church_admin_can(p_church_id);
begin
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  return jsonb_build_object('ok', true, 'jobs', coalesce((
    select jsonb_agg(j order by j->>'created_at' desc) from (
      select jsonb_build_object(
        'id', w.id,
        'status', w.status,
        'reason', w.reason,
        'source', w.source,
        'autopilot', w.autopilot,
        'series', w.series,
        'references', coalesce((select jsonb_agg(p->>'reference') from jsonb_array_elements(w.passages) p), '[]'::jsonb),
        'start_date', w.start_date,
        'days', w.days,
        'saved', to_jsonb(w.saved),
        'flagged', w.flagged,
        'seen', w.seen_at is not null,
        'retryable', (w.status = 'failed'
                      or (w.status in ('queued', 'transcribing', 'drafting') and w.updated_at < now() - interval '12 minutes'))
                     and (w.source = 'fallback' or w.transcript is not null or w.memo_path is not null),
        'stale', w.status in ('queued', 'transcribing', 'drafting') and w.updated_at < now() - interval '12 minutes',
        'created_at', w.created_at,
        'updated_at', w.updated_at
      ) as j
      from public.church_auto_weeks w
      where w.church_id = p_church_id and w.created_at > now() - interval '14 days'
      order by w.created_at desc
      limit 5
    ) x
  ), '[]'::jsonb));
end;
$$;
revoke all on function public.church_auto_weeks(uuid) from public, anon;
grant execute on function public.church_auto_weeks(uuid) to authenticated;

notify pgrst, 'reload schema';
