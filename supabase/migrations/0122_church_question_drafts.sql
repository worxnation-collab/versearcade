-- 0122 — A daily ceiling on question DRAFTS for a church's leadership.
--
-- Leadership of a verified church can ask the `church-draft` Edge Function to
-- draft the five questions for a passage (Gemini, the key server-side only).
-- Every draft is a paid model call, so the function spends one unit of a
-- per-church daily allowance BEFORE it calls the model, through
-- `use_church_draft` here. The function calls it with the CALLER'S token, so
-- `auth.uid()` is the pastor and the gate is the same `church_admin_can` every
-- write in the verified layer uses (0118): leadership of THIS church, and the
-- church verified. Anybody else is refused before a single token is spent.
--
-- What this is NOT:
--   * Not a count anybody sees. It is a cost ceiling for the operator, never
--     drawn, never returned except as "limit reached".
--   * Not about a person. It counts per CHURCH, so two leaders of one church
--     share it, and nothing records which of them drafted.
--   * Not the user's local day. A player's streak rolls at their midnight; this
--     is a billing ceiling on one operator's API key, so it is UTC
--     (`current_date`), the same choice the rivalry's week makes for an
--     institution rather than a person.
--
-- A draft fills the form and saves nothing; `set_church_verse` is still the
-- only writer of a church's verse, with every check it always had.
--
-- No DROP, DELETE or CREATE POLICY. Idempotent.

create table if not exists public.church_question_drafts (
  church_id  uuid not null references public.churches(id) on delete cascade,
  drafted_on date not null,
  drafts     integer not null default 0 check (drafts >= 0),
  primary key (church_id, drafted_on)
);

alter table public.church_question_drafts enable row level security;
revoke all on table public.church_question_drafts from anon, authenticated;

create or replace function public.use_church_draft(p_church_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_gate text := public.church_admin_can(p_church_id);
  v_cap constant integer := 30;
  v_used integer;
begin
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;

  insert into public.church_question_drafts as d (church_id, drafted_on, drafts)
  values (p_church_id, current_date, 1)
  on conflict (church_id, drafted_on) do update
    set drafts = d.drafts + 1
    where d.drafts < v_cap
  returning d.drafts into v_used;

  if v_used is null then
    return jsonb_build_object('ok', false, 'reason', 'limit');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.use_church_draft(uuid) from public, anon;
grant execute on function public.use_church_draft(uuid) to authenticated;

notify pgrst, 'reload schema';
