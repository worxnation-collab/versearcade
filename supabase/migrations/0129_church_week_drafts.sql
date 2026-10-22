-- 0129 — Draft a WEEK from one sermon (Content Generation), plus discard and
-- approve-the-set. Builds on 0127; same gates, same draft → approve rule.
--
--   * `use_church_draft_units(church, units)` — the content engine's gate and
--     spend, by the DAY: a week of seven spends seven of the church's 30 daily
--     units, in one atomic statement, BEFORE any model is asked. The add-on is
--     required (`church_gen_can`). `use_church_draft(church)` (0122/0127) stays,
--     same signature, as units = 1, so the deployed function keeps working.
--   * `church_verses.discarded_at` — DISCARDING a draft stamps it instead of
--     deleting the row. Every reader treats a discarded row as absent and every
--     writer clears the stamp, so the day is simply empty again. Two reasons, in
--     order: the Supabase MCP cannot apply a DELETE from a cloud session (see
--     CLAUDE.md), and the audit trail ("generation was used, and the leader
--     threw it away") is worth keeping anyway. Only a DRAFT can be discarded —
--     a live day is replaced by saving, never discarded.
--   * `discard_church_verse_draft(church, date)` and
--     `approve_church_verses(church, dates[])` — base tier, like
--     `approve_church_verse`: a church whose add-on lapsed can still review what
--     it made. The batch approves exactly the dates the leader was SHOWN, and
--     only those still drafts; nothing else in the range is touched.
--   * Members are untouched. 0128's `my_church_verse` (the member lane),
--     `church_feed` and `church_leader_insights` and 0127's `church_verse_today`
--     all skip `status = 'draft'`, and a discarded row is always a draft — so
--     none of them needs restating to ignore a discarded day.
--
-- Restated with the same signatures: use_church_draft, set_church_verse,
-- set_church_verse_extras, save_church_verse_draft, approve_church_verse,
-- church_verse_for, church_verses_range.
--
-- No DROP, DELETE or CREATE POLICY. Idempotent.

alter table public.church_verses add column if not exists discarded_at timestamptz;

-- ---------------------------------------------------------------------------
-- The spend, by the day.
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
  v_used  integer;
begin
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;

  insert into public.church_question_drafts as d (church_id, drafted_on, drafts)
  values (p_church_id, current_date, v_units)
  on conflict (church_id, drafted_on) do update
    set drafts = d.drafts + v_units
    where d.drafts + v_units <= v_cap
  returning d.drafts into v_used;

  if v_used is null then
    return jsonb_build_object('ok', false, 'reason', 'limit');
  end if;
  return jsonb_build_object('ok', true, 'units', v_units, 'left', v_cap - v_used);
end;
$$;
revoke all on function public.use_church_draft_units(uuid, integer) from public, anon;
grant execute on function public.use_church_draft_units(uuid, integer) to authenticated;

create or replace function public.use_church_draft(p_church_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  return public.use_church_draft_units(p_church_id, 1);
end;
$$;
revoke all on function public.use_church_draft(uuid) from public, anon;
grant execute on function public.use_church_draft(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Writers (0127 restated: each clears `discarded_at`).
-- ---------------------------------------------------------------------------
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
                                    status, generated, approved_by, approved_at, updated_at, discarded_at)
  values (p_church_id, p_drop_date, v_ref, v_text, v_q, auth.uid(),
          'approved', false, auth.uid(), now(), now(), null)
  on conflict (church_id, drop_date) do update
    set reference    = excluded.reference,
        text         = excluded.text,
        questions    = excluded.questions,
        created_by   = excluded.created_by,
        status       = 'approved',
        -- A discarded draft's "generated" belonged to the thing thrown away.
        generated    = case when church_verses.discarded_at is null then church_verses.generated else false end,
        approved_by  = auth.uid(),
        approved_at  = now(),
        updated_at   = now(),
        discarded_at = null;
  return jsonb_build_object('ok', true, 'drop_date', p_drop_date, 'status', 'approved');
end;
$$;

create or replace function public.set_church_verse_extras(p_church_id uuid, p_drop_date date, p_series text default null, p_note text default null)
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
  if p_drop_date is null or p_drop_date < current_date - 1 or p_drop_date > current_date + 366 then
    return jsonb_build_object('ok', false, 'reason', 'bad_date');
  end if;

  update public.church_verses
     set series = case when p_series is null then series else public.church_clean_line(p_series, 60) end,
         note   = case when p_note   is null then note   else public.church_clean_line(p_note, 280) end
   where church_id = p_church_id and drop_date = p_drop_date and discarded_at is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('ok', false, 'reason', 'no_verse'); end if;

  return jsonb_build_object('ok', true, 'drop_date', p_drop_date);
end;
$$;

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
   where church_id = p_church_id and drop_date = p_drop_date and discarded_at is null for update;
  if v_cur is not null and v_cur <> 'draft' and not coalesce(p_replace, false) then
    return jsonb_build_object('ok', false, 'reason', 'day_is_set');
  end if;

  insert into public.church_verses (church_id, drop_date, reference, text, questions, created_by,
                                    series, note, status, generated, approved_by, approved_at, updated_at, discarded_at)
  values (p_church_id, p_drop_date, v_ref, v_text, v_q, auth.uid(),
          public.church_clean_line(coalesce(p_series, ''), 60),
          public.church_clean_line(coalesce(p_note, ''), 280),
          'draft', true, null, null, now(), null)
  on conflict (church_id, drop_date) do update
    set reference    = excluded.reference,
        text         = excluded.text,
        questions    = excluded.questions,
        created_by   = excluded.created_by,
        -- Over a discarded row nothing carries forward: NULL means "none" there.
        series       = case when p_series is null and church_verses.discarded_at is null then church_verses.series else excluded.series end,
        note         = case when p_note   is null and church_verses.discarded_at is null then church_verses.note   else excluded.note end,
        status       = 'draft',
        generated    = true,
        approved_by  = null,
        approved_at  = null,
        updated_at   = now(),
        discarded_at = null;
  return jsonb_build_object('ok', true, 'drop_date', p_drop_date, 'status', 'draft');
end;
$$;
revoke all on function public.save_church_verse_draft(uuid, date, text, text, jsonb, text, text, boolean) from public, anon;
grant execute on function public.save_church_verse_draft(uuid, date, text, text, jsonb, text, text, boolean) to authenticated;

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
   where church_id = p_church_id and drop_date = p_drop_date
     and status = 'draft' and discarded_at is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('ok', false, 'reason', 'no_draft'); end if;
  return jsonb_build_object('ok', true, 'drop_date', p_drop_date,
                            'status', public.church_verse_status('approved', p_drop_date));
end;
$$;
revoke all on function public.approve_church_verse(uuid, date) from public, anon;
grant execute on function public.approve_church_verse(uuid, date) to authenticated;

-- The set: exactly the dates the leader was shown, drafts only, at most 42.
create or replace function public.approve_church_verses(p_church_id uuid, p_dates date[])
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_gate text := public.church_admin_can(p_church_id);
  v_done date[];
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  if p_dates is null or cardinality(p_dates) not between 1 and 42 then
    return jsonb_build_object('ok', false, 'reason', 'bad_dates');
  end if;
  with done as (
    update public.church_verses
       set status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_at = now()
     where church_id = p_church_id
       and drop_date = any (p_dates)
       and drop_date >= current_date - 1
       and status = 'draft' and discarded_at is null
    returning drop_date
  )
  select coalesce(array_agg(drop_date order by drop_date), '{}') into v_done from done;
  return jsonb_build_object('ok', true, 'approved', to_jsonb(v_done));
end;
$$;
revoke all on function public.approve_church_verses(uuid, date[]) from public, anon;
grant execute on function public.approve_church_verses(uuid, date[]) to authenticated;

-- Throw a draft away. The row stays (stamped), the day reads as empty.
create or replace function public.discard_church_verse_draft(p_church_id uuid, p_drop_date date)
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
  update public.church_verses
     set discarded_at = now(), updated_at = now()
   where church_id = p_church_id and drop_date = p_drop_date
     and status = 'draft' and discarded_at is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('ok', false, 'reason', 'no_draft'); end if;
  return jsonb_build_object('ok', true, 'drop_date', p_drop_date);
end;
$$;
revoke all on function public.discard_church_verse_draft(uuid, date) from public, anon;
grant execute on function public.discard_church_verse_draft(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Leadership readers (0127 restated): a discarded row is absent.
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
   where cv.church_id = p_church_id and cv.drop_date = p_drop_date and cv.discarded_at is null;
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
       and cv.discarded_at is null
       and cv.drop_date between p_from and p_from + (v_days - 1)
  ), '[]'::jsonb));
end;
$$;

notify pgrst, 'reload schema';
