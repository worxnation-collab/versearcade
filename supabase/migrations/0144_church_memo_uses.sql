-- 0144 — Voice memos for the content engine: an allowance of their own.
--
-- `church-draft` can now take a recorded sermon (`mode: 'memo_url'` hands back
-- a signed upload into the private `church-memos` bucket, `mode: 'transcribe'`
-- turns the upload into a transcript the leader edits before drafting). A
-- transcription is NOT a draft: it spends none of the church's 30 daily draft
-- units, and the draft made from it afterwards spends exactly what a pasted
-- transcript would. But it is a real model call over up to an hour of audio,
-- so it gets its own small cap rather than none.
--
--   * `church_memo_uses` — (church, day) → how many transcriptions were started.
--     It holds a COUNT and nothing else: no audio, no transcript, no who. RLS is
--     on with no rule and the client roles are revoked, like church_draft_runs.
--   * `use_church_memo(church)` — the gate AND the spend, as the caller: the
--     Content Generation gate (`church_gen_can`, 0127), then one of 10 a day.
--     Returns `day` so the release below lands on the same row across midnight.
--   * `release_church_memo(church, day)` — service_role ONLY. The function calls
--     it when a transcription fails (a format the model refused, a timeout, an
--     unreadable upload), so a leader who retries is not charged twice for a
--     memo that never came back. Never below zero.
--
-- Additive only: a new table and three functions; the cascading foreign key is
-- in 0144_church_memo_uses_b, kept apart for the MCP. Idempotent.

create table if not exists public.church_memo_uses (
  church_id uuid not null,  -- foreign key in 0144_church_memo_uses_b
  used_on   date not null,
  uses      integer not null default 0 check (uses >= 0),
  primary key (church_id, used_on)
);

alter table public.church_memo_uses enable row level security;
revoke all on table public.church_memo_uses from public, anon, authenticated;
grant select, insert, update on table public.church_memo_uses to service_role;

create or replace function public.use_church_memo(p_church_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_gate text := public.church_gen_can(p_church_id);
  v_cap  constant integer := 10;
  v_day  date := current_date;
  v_used integer;
begin
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;

  insert into public.church_memo_uses as m (church_id, used_on, uses)
  values (p_church_id, v_day, 1)
  on conflict (church_id, used_on) do update
    set uses = m.uses + 1
    where m.uses + 1 <= v_cap
  returning m.uses into v_used;

  if v_used is null then
    return jsonb_build_object('ok', false, 'reason', 'memo_limit');
  end if;
  return jsonb_build_object('ok', true, 'left', v_cap - v_used, 'day', v_day);
end;
$$;
revoke all on function public.use_church_memo(uuid) from public, anon;
grant execute on function public.use_church_memo(uuid) to authenticated;

-- The pre-upload check: may this caller send a memo at all? Same gate, spends
-- nothing, so a refused leader is told before uploading an hour of audio.
create or replace function public.church_memo_can(p_church_id uuid)
returns jsonb
language plpgsql stable
security definer set search_path = public
as $$
declare
  v_gate text := public.church_gen_can(p_church_id);
  v_used integer;
begin
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  select uses into v_used from public.church_memo_uses where church_id = p_church_id and used_on = current_date;
  if coalesce(v_used, 0) >= 10 then return jsonb_build_object('ok', false, 'reason', 'memo_limit'); end if;
  return jsonb_build_object('ok', true, 'left', 10 - coalesce(v_used, 0));
end;
$$;
revoke all on function public.church_memo_can(uuid) from public, anon;
grant execute on function public.church_memo_can(uuid) to authenticated;

create or replace function public.release_church_memo(p_church_id uuid, p_day date)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_left integer;
begin
  update public.church_memo_uses
     set uses = greatest(uses - 1, 0)
   where church_id = p_church_id and used_on = p_day
  returning 10 - uses into v_left;
  if v_left is null then return jsonb_build_object('ok', false, 'reason', 'no_row'); end if;
  return jsonb_build_object('ok', true, 'left', v_left);
end;
$$;
revoke all on function public.release_church_memo(uuid, date) from public, anon, authenticated;
grant execute on function public.release_church_memo(uuid, date) to service_role;
