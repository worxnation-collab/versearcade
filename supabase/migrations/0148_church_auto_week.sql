-- 0148 — "Record Sunday, review Monday": a sermon memo that drafts its own week.
--
-- A leader could already upload a sermon memo (0144), read the transcript and
-- press "Draft N days" (0129/0142). This lets the upload say "and then draft
-- the week for me": the `church-draft` function records a JOB here, answers at
-- once (the phone can be closed), and works through it on the server — the
-- SAME transcription (one of 10 memo uses a day, given back on failure) and the
-- SAME week call (one of 30 draft units a day per day, refunded for every day
-- not saved, scripture from the BSB passages the leader named, answers checked
-- blind, each day saved as a DRAFT on its own date, never over a live day).
-- Nothing is approved: the pastor still reviews every day.
--
-- The table is the job's status and the little it needs to RETRY: the memo's
-- storage path, the transcript once it exists, the passages (references and
-- their BSB verses, fetched by the client exactly as for a hand-drafted week),
-- the series and the window. The transcript is cleared once the week lands or
-- the leader dismisses the job; it is never returned by any reader here.
--
-- Writers: the function only, as service_role (RLS on, no policy, no client
-- grant). Readers: `church_auto_weeks` for the church's verified leadership,
-- and `dismiss_church_auto_week` to clear one from Home and Plan.
-- The foreign keys are part b (the MCP stops on their cascade clause).

create table if not exists public.church_auto_weeks (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null,
  created_by  uuid,
  status      text not null default 'queued'
              check (status in ('queued', 'transcribing', 'drafting', 'done', 'failed')),
  reason      text,
  memo_path   text,
  transcript  text,
  series      text not null,
  passages    jsonb not null,
  guidance    text,
  start_date  date not null,
  days        int not null check (days between 2 and 7),
  saved       date[] not null default '{}',
  flagged     int not null default 0,
  seen_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists church_auto_weeks_church_idx on public.church_auto_weeks (church_id, created_at desc);
alter table public.church_auto_weeks enable row level security;
revoke all on table public.church_auto_weeks from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The church's recent jobs, for its own verified leadership. Never the
-- transcript, the memo path or the verses — status, the references, the
-- window and what landed. `stale` marks a job still "running" after twelve
-- minutes, which means the server lost it; the client offers a retry.
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
        'series', w.series,
        'references', coalesce((select jsonb_agg(p->>'reference') from jsonb_array_elements(w.passages) p), '[]'::jsonb),
        'start_date', w.start_date,
        'days', w.days,
        'saved', to_jsonb(w.saved),
        'flagged', w.flagged,
        'seen', w.seen_at is not null,
        -- Failed, or lost mid-run (stale), and something left to run again from.
        'retryable', (w.status = 'failed'
                      or (w.status in ('queued', 'transcribing', 'drafting') and w.updated_at < now() - interval '12 minutes'))
                     and (w.transcript is not null or w.memo_path is not null),
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

-- ---------------------------------------------------------------------------
-- Clear a job from Home and Plan. A finished or failed one only; its
-- transcript goes with it (a dismissed failure can no longer be retried).
-- ---------------------------------------------------------------------------
create or replace function public.dismiss_church_auto_week(p_job_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_church uuid;
  v_status text;
  v_gate   text;
begin
  select church_id, status into v_church, v_status from public.church_auto_weeks where id = p_job_id;
  if v_church is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  v_gate := public.church_admin_can(v_church);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  update public.church_auto_weeks
     set seen_at = coalesce(seen_at, now()),
         transcript = case when status in ('done', 'failed') then null else transcript end
   where id = p_job_id;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.dismiss_church_auto_week(uuid) from public, anon;
grant execute on function public.dismiss_church_auto_week(uuid) to authenticated;

notify pgrst, 'reload schema';
