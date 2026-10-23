-- 0143 — The content engine's answer check, and where its flag may live.
--
-- `church-draft` now reads every drafted question a second time, blind, from
-- the passage alone. Where that second read picks a different option (or can't
-- pick one), the question is FLAGGED for the leader: `check: true` and
-- `checkPick` (the option the second read chose, -1 for "couldn't tell") on the
-- question object itself, so the flag travels with the question through the
-- server-side save, the review list's ↑/↓ swaps and every reload.
--
-- A flag is a note to LEADERSHIP and must never reach a member, so it lives
-- only on a DRAFT, and every way a day goes live removes it:
--
--   * `church_draft_questions(p)` — `church_clean_questions` (0119, unchanged)
--     plus the two keys, kept only when well-formed (`check` exactly true,
--     `checkPick` an integer from -1 to the last option). Used by
--     `save_church_verse_draft` and nothing else.
--   * `save_church_verse_draft` restated from production (0129's logic,
--     byte for byte apart from that one line) to clean with it.
--   * `set_church_verse` is untouched: it still cleans with
--     `church_clean_questions`, which drops unknown keys, so a hand save — which
--     IS an approval — strips every flag.
--   * `approve_church_verse` restated: approving one day strips its flags. The
--     leader approved it with the flags on screen; that is the "not blocking".
--   * `approve_church_verses` (Approve all) restated: a day still carrying a
--     flag is NOT approved — it is skipped and returned in `flagged`, so the
--     set cannot carry an unread warning live even from a client that ignores
--     the flag. The leader opens the day and approves it there.
--   * `church_draft_runs` gains `questions_checked` / `questions_flagged`.
--
-- Members' readers need nothing: they never return a draft, and every approved
-- row has been stripped on its way to approved. Old clients lose the unknown
-- keys when they re-save, which clears a flag — the same as editing it.
--
-- Nothing destructive and no new row-level rules (the Supabase MCP stalls on
-- those). Idempotent.

alter table public.church_draft_runs add column if not exists questions_checked integer not null default 0;
alter table public.church_draft_runs add column if not exists questions_flagged integer not null default 0;

-- ---------------------------------------------------------------------------
-- The draft cleaner: 0119's rules, plus the check flag where it is well-formed.
-- ---------------------------------------------------------------------------
create or replace function public.church_draft_questions(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_clean jsonb := public.church_clean_questions(p);
  v_out   jsonb := '[]'::jsonb;
  v_q     jsonb;
  v_src   jsonb;
  v_pick  numeric;
  i       int;
begin
  if v_clean is null then return null; end if;
  for i in 0 .. jsonb_array_length(v_clean) - 1 loop
    v_q := v_clean -> i;
    v_src := p -> i;
    if v_src -> 'check' = 'true'::jsonb then
      v_q := v_q || jsonb_build_object('check', true);
      if jsonb_typeof(v_src -> 'checkPick') = 'number' then
        v_pick := (v_src ->> 'checkPick')::numeric;
        if v_pick = trunc(v_pick) and v_pick >= -1 and v_pick < jsonb_array_length(v_q -> 'options') then
          v_q := v_q || jsonb_build_object('checkPick', v_pick::int);
        end if;
      end if;
    end if;
    v_out := v_out || jsonb_build_array(v_q);
  end loop;
  return v_out;
end;
$$;
revoke all on function public.church_draft_questions(jsonb) from public, anon, authenticated;

-- The questions with every check flag taken off.
create or replace function public.church_unflag_questions(p jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case when p is null or jsonb_typeof(p) <> 'array' then p
              else coalesce((select jsonb_agg((q - 'check') - 'checkPick' order by ord)
                               from jsonb_array_elements(p) with ordinality t(q, ord)), '[]'::jsonb) end;
$$;
revoke all on function public.church_unflag_questions(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Writers.
-- ---------------------------------------------------------------------------
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
  v_q    jsonb := public.church_draft_questions(p_questions);
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

-- One day: approving it takes its flags off (the leader saw them).
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
     set status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_at = now(),
         questions = public.church_unflag_questions(questions)
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

-- The set: exactly the dates the leader was shown, drafts only, at most 42 —
-- and never a day still carrying a flag. Those come back in `flagged`.
create or replace function public.approve_church_verses(p_church_id uuid, p_dates date[])
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_gate    text := public.church_admin_can(p_church_id);
  v_done    date[];
  v_flagged date[];
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  if p_dates is null or cardinality(p_dates) not between 1 and 42 then
    return jsonb_build_object('ok', false, 'reason', 'bad_dates');
  end if;
  select coalesce(array_agg(drop_date order by drop_date), '{}') into v_flagged
    from public.church_verses
   where church_id = p_church_id
     and drop_date = any (p_dates)
     and status = 'draft' and discarded_at is null
     and jsonb_typeof(questions) = 'array'
     and exists (select 1 from jsonb_array_elements(questions) q where q -> 'check' = 'true'::jsonb);
  with done as (
    update public.church_verses
       set status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_at = now()
     where church_id = p_church_id
       and drop_date = any (p_dates)
       and drop_date <> all (v_flagged)
       and drop_date >= current_date - 1
       and status = 'draft' and discarded_at is null
    returning drop_date
  )
  select coalesce(array_agg(drop_date order by drop_date), '{}') into v_done from done;
  return jsonb_build_object('ok', true, 'approved', to_jsonb(v_done), 'flagged', to_jsonb(v_flagged));
end;
$$;
revoke all on function public.approve_church_verses(uuid, date[]) from public, anon;
grant execute on function public.approve_church_verses(uuid, date[]) to authenticated;
