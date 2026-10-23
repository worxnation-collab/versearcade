-- 0142 — The content engine's run log and its refund.
--
-- It is 0142 because production already holds 0139-0141 (the Apple church
-- subscription and the plan taps, from other branches) — check
-- `list_migrations`, not the folder.
--
--   * `church_draft_runs` — one row per call of `church-draft` that got past
--     the gate: which church, which mode, units asked and kept, days asked,
--     returned and saved, the outcome, how long it took and which model. It is
--     the operator's only view of how often drafting fails, since the function
--     answered HTTP 200 for every outcome until now. It NEVER holds what the
--     leader sent: no transcript, no focus line, no passage text, no
--     questions. RLS is on with no rule and the client roles are revoked, so
--     only the service role (the Edge Function) writes it and only an
--     operator reads it.
--   * `refund_church_draft_units(church, day, units)` — service_role ONLY. The
--     gate still spends BEFORE any model is asked (0129); this gives back what
--     was spent and not delivered: a failed draft, a topic the model could not
--     anchor, a week that came back short, a day that could not be saved. It
--     takes the DAY the units were spent on, which `use_church_draft_units` now
--     returns, so a run that straddles UTC midnight refunds the right row. It
--     never goes below zero.
--   * `use_church_draft_units` restated with the same signature and body, plus
--     `day` in its answer. It still returns `left`.
--
-- Nothing destructive and no new row-level rules (the Supabase MCP stalls on those);
-- the cascading foreign key is in `0142_church_draft_runs_b` for the same reason.
-- Idempotent.

create table if not exists public.church_draft_runs (
  id            bigserial primary key,
  church_id     uuid not null,  -- foreign key in 0142_church_draft_runs_b
  mode          text not null check (mode in ('one', 'week', 'topic')),
  units_asked   integer not null default 0 check (units_asked >= 0),
  units_used    integer not null default 0 check (units_used >= 0),
  days_asked    integer not null default 0 check (days_asked >= 0),
  days_returned integer not null default 0 check (days_returned >= 0),
  days_saved    integer not null default 0 check (days_saved >= 0),
  outcome       text not null check (char_length(outcome) between 1 and 40),
  ms            integer not null default 0 check (ms >= 0),
  model         text check (char_length(model) <= 80),
  created_at    timestamptz not null default now()
);
create index if not exists church_draft_runs_church_idx on public.church_draft_runs (church_id, created_at desc);
create index if not exists church_draft_runs_created_idx on public.church_draft_runs (created_at desc);

alter table public.church_draft_runs enable row level security;
revoke all on table public.church_draft_runs from public, anon, authenticated;
revoke all on sequence public.church_draft_runs_id_seq from public, anon, authenticated;
grant select, insert on table public.church_draft_runs to service_role;
grant usage on sequence public.church_draft_runs_id_seq to service_role;

-- ---------------------------------------------------------------------------
-- The spend (0129 restated: same signature, same rules, plus `day`).
-- ---------------------------------------------------------------------------
create or replace function public.use_church_draft_units(p_church_id uuid, p_units integer)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_gate  text := public.church_gen_can(p_church_id);
  v_cap   constant integer := 30;
  v_units integer := least(greatest(coalesce(p_units, 1), 1), 7);
  v_day   date := current_date;
  v_used  integer;
begin
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;

  insert into public.church_question_drafts as d (church_id, drafted_on, drafts)
  values (p_church_id, v_day, v_units)
  on conflict (church_id, drafted_on) do update
    set drafts = d.drafts + v_units
    where d.drafts + v_units <= v_cap
  returning d.drafts into v_used;

  if v_used is null then
    return jsonb_build_object('ok', false, 'reason', 'limit');
  end if;
  return jsonb_build_object('ok', true, 'units', v_units, 'left', v_cap - v_used, 'day', v_day);
end;
$$;
revoke all on function public.use_church_draft_units(uuid, integer) from public, anon;
grant execute on function public.use_church_draft_units(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- The refund. Service role only: a client could otherwise refund its own
-- spend and draft without limit.
-- ---------------------------------------------------------------------------
create or replace function public.refund_church_draft_units(p_church_id uuid, p_day date, p_units integer)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_cap   constant integer := 30;
  v_units integer := least(greatest(coalesce(p_units, 0), 0), 7);
  v_was   integer;
  v_used  integer;
begin
  if v_units = 0 or p_day is null then
    select drafts into v_used from public.church_question_drafts
     where church_id = p_church_id and drafted_on = coalesce(p_day, current_date);
    return jsonb_build_object('ok', true, 'refunded', 0, 'left', v_cap - coalesce(v_used, 0));
  end if;
  select drafts into v_was from public.church_question_drafts
   where church_id = p_church_id and drafted_on = p_day for update;
  if v_was is null then
    return jsonb_build_object('ok', false, 'reason', 'no_spend');
  end if;
  v_used := greatest(v_was - v_units, 0);
  update public.church_question_drafts set drafts = v_used
   where church_id = p_church_id and drafted_on = p_day;
  return jsonb_build_object('ok', true, 'refunded', v_was - v_used, 'left', v_cap - v_used);
end;
$$;
revoke all on function public.refund_church_draft_units(uuid, date, integer) from public, anon, authenticated;
grant execute on function public.refund_church_draft_units(uuid, date, integer) to service_role;
