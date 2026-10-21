-- 0123 — A series and a pastor's note on the church's shared verse.
--
-- docs/CHURCH-SHARED-VERSE.md → "Series and notes" is the long version.
--
--   * `church_verses` gains two OPTIONAL, length-capped, plain-text columns:
--     `series` (60, e.g. "John 15–17" or "Advent") and `note` (280, a line
--     from the pastor shown with that day's verse). Both are about the
--     SCHEDULE — nothing here is about a person, and nothing is counted.
--   * `set_church_verse_extras` writes them for a day that already has a
--     verse. `set_church_verse` (0119) is deliberately NOT touched: it stays
--     the one verse write, its signature does not change, and an older client
--     that never sends extras keeps working exactly as before. NULL means
--     "leave it", '' clears it — the 0120 `p_this_week` convention.
--   * `church_verses_range` reads up to 42 days in one call, so the planner's
--     three-week strip is one round trip rather than twenty-one.
--   * `church_verse_for` and `get_effective_verse` are restated with the same
--     signatures and two more keys. A member sees series + note only for their
--     own verified church's verse, on the ±1 day `get_effective_verse` already
--     allowed — nobody reads tomorrow's note today.
--   * `set_church_this_week` writes ONLY the church page's "This week" line
--     (0120). `update_my_church_profile` cannot be used for that: every other
--     field it takes is overwritten with whatever is sent, so a call carrying
--     just the line would wipe the tagline, about, services and contact.
--
-- No drop, delete or create policy (CLAUDE.md: the MCP hangs on them).
-- Idempotent: a re-run is a no-op.

-- ---------------------------------------------------------------------------
-- 1. Two optional columns.
-- ---------------------------------------------------------------------------
alter table public.church_verses
  add column if not exists series text check (series is null or char_length(series) between 1 and 60);
alter table public.church_verses
  add column if not exists note text check (note is null or char_length(note) between 1 and 280);

-- One line of plain text: control characters become a space, trimmed, capped.
-- '' after cleaning is NULL. Keep in sync with `cleanLine` in
-- src/store/churchAdmin.ts.
create or replace function public.church_clean_line(p text, p_max int)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(btrim(left(btrim(regexp_replace(coalesce(p, ''), '[[:cntrl:]]+', ' ', 'g')), p_max)), '');
$$;

revoke all on function public.church_clean_line(text, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. set_church_verse_extras — verified leadership, a day that has a verse.
-- ---------------------------------------------------------------------------
create or replace function public.set_church_verse_extras(
  p_church_id uuid,
  p_drop_date date,
  p_series text default null,
  p_note text default null
)
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
   where church_id = p_church_id and drop_date = p_drop_date;
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('ok', false, 'reason', 'no_verse'); end if;

  return jsonb_build_object('ok', true, 'drop_date', p_drop_date);
end;
$$;

revoke all on function public.set_church_verse_extras(uuid, date, text, text) from public, anon;
grant execute on function public.set_church_verse_extras(uuid, date, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. church_verses_range — the planner's window in one read. Set days only.
-- ---------------------------------------------------------------------------
create or replace function public.church_verses_range(p_church_id uuid, p_from date, p_days int default 21)
returns jsonb
language plpgsql
stable
security definer set search_path = public
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
             'questions', cv.questions, 'series', cv.series, 'note', cv.note)
           order by cv.drop_date)
      from public.church_verses cv
     where cv.church_id = p_church_id
       and cv.drop_date between p_from and p_from + (v_days - 1)
  ), '[]'::jsonb));
end;
$$;

revoke all on function public.church_verses_range(uuid, date, int) from public, anon;
grant execute on function public.church_verses_range(uuid, date, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. church_verse_for — restated from 0119 with series + note.
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
                            'text', cv.text, 'questions', cv.questions,
                            'series', cv.series, 'note', cv.note)
    into v
    from public.church_verses cv
   where cv.church_id = p_church_id and cv.drop_date = p_drop_date;
  return jsonb_build_object('ok', true, 'verse', v);
end;
$$;

revoke all on function public.church_verse_for(uuid, date) from public, anon;
grant execute on function public.church_verse_for(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. get_effective_verse — restated from 0119 with series + note.
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
           'questions',   cv.questions,
           'series',      cv.series,
           'note',        cv.note)
    from public.profiles p
    join public.churches c       on c.id = p.church_id and c.verified
    join public.church_verses cv on cv.church_id = c.id and cv.drop_date = p_drop_date
   where p.id = auth.uid()
     and p_drop_date between current_date - 1 and current_date + 1;
$$;

revoke all on function public.get_effective_verse(date) from public, anon;
grant execute on function public.get_effective_verse(date) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. set_church_this_week — the page's "This week" line and nothing else.
--    Same gate and cleaning as 0120's writer; '' clears it.
-- ---------------------------------------------------------------------------
create or replace function public.set_church_this_week(p_church_id uuid, p_this_week text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_week text := public.church_clean_line(p_this_week, 140);
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not public.is_church_admin(p_church_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_leadership');
  end if;

  insert into public.church_profiles (church_id, this_week, published, updated_at, updated_by)
  values (p_church_id, v_week, true, now(), uid)
  on conflict (church_id) do update set
    this_week  = excluded.this_week,
    updated_at = now(),
    updated_by = uid;

  return jsonb_build_object('ok', true, 'this_week', v_week);
end;
$$;

revoke all on function public.set_church_this_week(uuid, text) from public, anon;
grant execute on function public.set_church_this_week(uuid, text) to authenticated;
