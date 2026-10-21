-- 0127 — The Content Generation package: a second, separate church entitlement.
--
-- TWO LEVELS, and the second can only stand on the first:
--
--   1. BASE CHURCH LEADER — what already existed. Leadership of a church
--      (`church_admins`, 0079) AND the church verified (`admin_set_church_package`,
--      0116). `church_admin_can` (0118) is that check, unchanged. It gates every
--      leadership tool: the verse, questions, series, notes, participation,
--      and — new here — approving a draft.
--   2. CONTENT GENERATION — `church_addons.content_generation`, set only by an
--      operator (`admin_set_church_content_generation`). It gates the content
--      engine: `use_church_draft` (the `church-draft` Edge Function's gate and
--      spend) and `save_church_verse_draft`. `church_gen_can` checks BOTH, base
--      first, so the add-on on a church that lost its base tier is inert rather
--      than a back door, and the operator writer refuses to switch it on for a
--      church that is not verified.
--
-- No price, no checkout, either mode — billing is stubbed, the money happens
-- off the device exactly as it does for the verified layer.
--
-- GENERATED CONTENT IS A DRAFT UNTIL A LEADER APPROVES IT. `church_verses` gains
-- the audit columns: `status`, `generated`, `visibility`, `approved_by`,
-- `approved_at`, `updated_at` (`created_by` / `created_at` were there).
--
--   * `status` is STORED as 'draft' or 'approved'. 'published' is what a reader
--     reports for an approved day whose date has arrived (`church_verse_status`)
--     — derived rather than stored because nothing here runs on a clock, and a
--     stored 'published' would need a cron this project doesn't have.
--   * `save_church_verse_draft` writes 'draft' + generated. Members never see
--     a draft: `church_verse_today` skips them.
--   * `approve_church_verse` is the explicit step that makes one live.
--   * A leader's own save (`set_church_verse`) is an approval by construction —
--     they typed it — so it writes 'approved' with `approved_by` = themselves,
--     and keeps `generated` as it was, because editing a generated day by hand
--     does not un-generate it.
--   * `visibility` is 'congregation' and the check allows nothing else. Public
--     sharing is out of scope; widening it is a migration, on purpose.
--
-- AND A CHURCH'S VERSE NO LONGER REPLACES THE GLOBAL DAILY DROP. Since 0119
-- `get_effective_verse` handed members their church's verse AS the drop. It is
-- restated here to return NULL, always, so every build that still calls it —
-- including the baked `dist` in approved iOS builds — plays the global verse.
-- The church's verse is now ADDITIVE: `church_verse_today` returns it for a
-- separate box on the Play tab. Enforced on the server, not in a component.
--
-- No DROP, DELETE or CREATE POLICY (the Supabase MCP hangs on them). Idempotent.

-- ---------------------------------------------------------------------------
-- The add-on. RLS on, no policies, no client grants: read through the RPCs.
-- ---------------------------------------------------------------------------
create table if not exists public.church_addons (
  church_id          uuid primary key references public.churches(id) on delete cascade,
  content_generation boolean not null default false,
  updated_at         timestamptz not null default now(),
  updated_by         uuid references public.profiles(id) on delete set null
);
alter table public.church_addons enable row level security;
revoke all on table public.church_addons from anon, authenticated;

create or replace function public.church_has_content_generation(p_church_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select content_generation from public.church_addons where church_id = p_church_id), false);
$$;
revoke all on function public.church_has_content_generation(uuid) from public, anon, authenticated;

-- Base first, then the add-on: 'not_authenticated' | 'not_leadership' |
-- 'not_verified' | 'no_addon' | 'ok'.
create or replace function public.church_gen_can(p_church_id uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select case
    when public.church_admin_can(p_church_id) <> 'ok' then public.church_admin_can(p_church_id)
    when not public.church_has_content_generation(p_church_id) then 'no_addon'
    else 'ok'
  end;
$$;
revoke all on function public.church_gen_can(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- What this church holds, for its own leadership only.
-- ---------------------------------------------------------------------------
create or replace function public.church_entitlements(p_church_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_verified boolean;
  v_addon    boolean;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'not_authenticated'); end if;
  if not public.is_church_admin(p_church_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_leadership');
  end if;
  v_verified := public.church_is_verified(p_church_id);
  v_addon    := public.church_has_content_generation(p_church_id);
  return jsonb_build_object(
    'ok', true,
    'church_leader', v_verified,
    -- Held but inert without the base tier; the client says so rather than
    -- showing an add-on as on when nothing it unlocks would work.
    'content_generation_held', v_addon,
    'content_generation', v_verified and v_addon);
end;
$$;
revoke all on function public.church_entitlements(uuid) from public, anon;
grant execute on function public.church_entitlements(uuid) to authenticated;

-- The operator's switch. Refuses to turn the add-on on for a church without
-- the base tier, so the add-on can never be the only thing a church holds.
create or replace function public.admin_set_church_content_generation(p_church_id uuid, p_enabled boolean)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  perform public.require_admin();
  if not exists (select 1 from public.churches where id = p_church_id) then
    return jsonb_build_object('ok', false, 'reason', 'no_church');
  end if;
  if coalesce(p_enabled, false) and not public.church_is_verified(p_church_id) then
    return jsonb_build_object('ok', false, 'reason', 'needs_base');
  end if;
  insert into public.church_addons (church_id, content_generation, updated_at, updated_by)
  values (p_church_id, coalesce(p_enabled, false), now(), auth.uid())
  on conflict (church_id) do update
    set content_generation = excluded.content_generation, updated_at = now(), updated_by = auth.uid();
  return jsonb_build_object('ok', true, 'content_generation', coalesce(p_enabled, false));
end;
$$;
revoke all on function public.admin_set_church_content_generation(uuid, boolean) from public, anon;
grant execute on function public.admin_set_church_content_generation(uuid, boolean) to authenticated;

-- Which churches hold it, for the operator panel.
create or replace function public.admin_church_addons()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object('church_id', a.church_id, 'name', c.name,
                                        'verified', c.verified, 'content_generation', a.content_generation)
                     order by c.name)
      from public.church_addons a join public.churches c on c.id = a.church_id
     where a.content_generation
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_church_addons() from public, anon;
grant execute on function public.admin_church_addons() to authenticated;

-- ---------------------------------------------------------------------------
-- The audit columns.
-- ---------------------------------------------------------------------------
alter table public.church_verses
  add column if not exists visibility  text not null default 'congregation',
  add column if not exists status      text not null default 'approved',
  add column if not exists generated   boolean not null default false,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists updated_at  timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'church_verses_visibility_check') then
    alter table public.church_verses add constraint church_verses_visibility_check
      check (visibility = 'congregation');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'church_verses_status_check') then
    alter table public.church_verses add constraint church_verses_status_check
      check (status in ('draft', 'approved', 'published'));
  end if;
end $$;

-- Every row before this was typed by a leader and live: approved by its author.
update public.church_verses
   set approved_by = created_by, approved_at = created_at
 where status <> 'draft' and approved_at is null;

-- What a reader is told. Stored 'draft' | 'approved'; an approved day whose
-- date has come is 'published'.
create or replace function public.church_verse_status(p_status text, p_drop_date date)
returns text
language sql stable
as $$
  select case when p_status = 'draft' then 'draft'
              when p_drop_date <= current_date then 'published'
              else 'approved' end;
$$;

-- ---------------------------------------------------------------------------
-- The content engine's gate now needs the add-on (0122 restated: same
-- signature, same ceiling, `church_gen_can` instead of `church_admin_can`).
-- ---------------------------------------------------------------------------
create or replace function public.use_church_draft(p_church_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_gate text := public.church_gen_can(p_church_id);
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

-- ---------------------------------------------------------------------------
-- Writers.
-- ---------------------------------------------------------------------------

-- 0119 restated: a leader's save is the approval. Same signature, same checks.
create or replace function public.set_church_verse(p_church_id uuid, p_drop_date date, p_reference text, p_text text, p_questions jsonb)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_gate text := public.church_admin_can(p_church_id);
  v_ref  text := regexp_replace(btrim(coalesce(p_reference, '')), '[[:space:]]+', ' ', 'g');
  v_text text := btrim(coalesce(p_text, ''));
  v_q    jsonb := public.church_clean_questions(p_questions);
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
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
  insert into public.church_verses (church_id, drop_date, reference, text, questions, created_by,
                                    status, generated, approved_by, approved_at, updated_at)
  values (p_church_id, p_drop_date, v_ref, v_text, v_q, auth.uid(),
          'approved', false, auth.uid(), now(), now())
  on conflict (church_id, drop_date) do update
    set reference   = excluded.reference,
        text        = excluded.text,
        questions   = excluded.questions,
        created_by  = excluded.created_by,
        status      = 'approved',
        approved_by = auth.uid(),
        approved_at = now(),
        updated_at  = now();
  return jsonb_build_object('ok', true, 'drop_date', p_drop_date, 'status', 'approved');
end;
$$;

-- A generated day, saved for review. Needs the add-on. Never live: a member
-- read skips it until `approve_church_verse`. Over a day that is already
-- approved it refuses (`day_is_set`) unless `p_replace` — replacing takes that
-- day off members' screens until the new draft is approved, so the leader has
-- to say so.
create or replace function public.save_church_verse_draft(
  p_church_id uuid, p_drop_date date, p_reference text, p_text text, p_questions jsonb,
  p_series text default null, p_note text default null, p_replace boolean default false)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_gate text := public.church_gen_can(p_church_id);
  v_ref  text := regexp_replace(btrim(coalesce(p_reference, '')), '[[:space:]]+', ' ', 'g');
  v_text text := btrim(coalesce(p_text, ''));
  v_q    jsonb := public.church_clean_questions(p_questions);
  v_cur  text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
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

  select status into v_cur from public.church_verses
   where church_id = p_church_id and drop_date = p_drop_date for update;
  if v_cur is not null and v_cur <> 'draft' and not coalesce(p_replace, false) then
    return jsonb_build_object('ok', false, 'reason', 'day_is_set');
  end if;

  insert into public.church_verses (church_id, drop_date, reference, text, questions, created_by,
                                    series, note, status, generated, approved_by, approved_at, updated_at)
  values (p_church_id, p_drop_date, v_ref, v_text, v_q, auth.uid(),
          public.church_clean_line(coalesce(p_series, ''), 60),
          public.church_clean_line(coalesce(p_note, ''), 280),
          'draft', true, null, null, now())
  on conflict (church_id, drop_date) do update
    set reference   = excluded.reference,
        text        = excluded.text,
        questions   = excluded.questions,
        created_by  = excluded.created_by,
        series      = case when p_series is null then church_verses.series else excluded.series end,
        note        = case when p_note   is null then church_verses.note   else excluded.note end,
        status      = 'draft',
        generated   = true,
        approved_by = null,
        approved_at = null,
        updated_at  = now();
  return jsonb_build_object('ok', true, 'drop_date', p_drop_date, 'status', 'draft');
end;
$$;
revoke all on function public.save_church_verse_draft(uuid, date, text, text, jsonb, text, text, boolean) from public, anon;
grant execute on function public.save_church_verse_draft(uuid, date, text, text, jsonb, text, text, boolean) to authenticated;

-- The explicit approval. Base tier only — the add-on is for MAKING drafts, so a
-- church whose add-on lapsed can still review what it already made.
create or replace function public.approve_church_verse(p_church_id uuid, p_drop_date date)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_gate text := public.church_admin_can(p_church_id);
  v_n int;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  if p_drop_date is null or p_drop_date < current_date - 1 then
    return jsonb_build_object('ok', false, 'reason', 'bad_date');
  end if;
  update public.church_verses
     set status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_at = now()
   where church_id = p_church_id and drop_date = p_drop_date and status = 'draft';
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('ok', false, 'reason', 'no_draft'); end if;
  return jsonb_build_object('ok', true, 'drop_date', p_drop_date,
                            'status', public.church_verse_status('approved', p_drop_date));
end;
$$;
revoke all on function public.approve_church_verse(uuid, date) from public, anon;
grant execute on function public.approve_church_verse(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Leadership readers (0119/0123 restated, same signatures) — now carrying the
-- audit fields, drafts included.
-- ---------------------------------------------------------------------------
create or replace function public.church_verse_for(p_church_id uuid, p_drop_date date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_gate text := public.church_admin_can(p_church_id);
  v jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  select jsonb_build_object('drop_date', cv.drop_date, 'reference', cv.reference,
                            'text', cv.text, 'questions', cv.questions,
                            'series', cv.series, 'note', cv.note,
                            'status', public.church_verse_status(cv.status, cv.drop_date),
                            'generated', cv.generated, 'visibility', cv.visibility,
                            'created_at', cv.created_at, 'approved_at', cv.approved_at)
    into v
    from public.church_verses cv
   where cv.church_id = p_church_id and cv.drop_date = p_drop_date;
  return jsonb_build_object('ok', true, 'verse', v);
end;
$$;

create or replace function public.church_verses_range(p_church_id uuid, p_from date, p_days integer default 21)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_gate text := public.church_admin_can(p_church_id);
  v_days int  := least(greatest(coalesce(p_days, 21), 1), 42);
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  if p_from is null then return jsonb_build_object('ok', false, 'reason', 'bad_date'); end if;

  return jsonb_build_object('ok', true, 'days', coalesce((
    select jsonb_agg(jsonb_build_object(
             'drop_date', cv.drop_date, 'reference', cv.reference, 'text', cv.text,
             'questions', cv.questions, 'series', cv.series, 'note', cv.note,
             'status', public.church_verse_status(cv.status, cv.drop_date),
             'generated', cv.generated, 'visibility', cv.visibility,
             'created_at', cv.created_at, 'approved_at', cv.approved_at)
           order by cv.drop_date)
      from public.church_verses cv
     where cv.church_id = p_church_id
       and cv.drop_date between p_from and p_from + (v_days - 1)
  ), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Members.
-- ---------------------------------------------------------------------------

-- The church's verse for a day, ALONGSIDE the global drop: the caller's own
-- verified church, approved days only, congregation visibility, ±1 day so
-- nobody reads tomorrow's questions today. Null otherwise.
create or replace function public.church_verse_today(p_drop_date date)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
           'church_id',   c.id,
           'church_name', c.name,
           'drop_date',   cv.drop_date,
           'reference',   cv.reference,
           'text',        cv.text,
           'questions',   cv.questions,
           'series',      cv.series,
           'note',        cv.note)
    from public.profiles p
    join public.churches c       on c.id = p.church_id and c.verified
    join public.church_verses cv on cv.church_id = c.id and cv.drop_date = p_drop_date
   where p.id = auth.uid()
     and cv.status <> 'draft'
     and cv.visibility = 'congregation'
     and p_drop_date between current_date - 1 and current_date + 1;
$$;
revoke all on function public.church_verse_today(date) from public, anon;
grant execute on function public.church_verse_today(date) to authenticated;

-- 0119 restated to NEVER answer: this is what made a church's verse stand in
-- for the global drop, and every build that still calls it now plays the
-- global verse. Kept (not dropped) because approved builds call it, and a
-- missing function is an error where null is "no override".
create or replace function public.get_effective_verse(p_drop_date date)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select null::jsonb;
$$;

notify pgrst, 'reload schema';
