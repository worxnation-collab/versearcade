-- 0133 — Visual assets for the Content Generation add-on: verse cards, series
-- headers and announcement cards, on the same draft → approve path as text.
--
-- WHAT IS STORED IS DATA, NOT AN IMAGE. A row carries a `template_id` and a
-- `payload` (the words to draw: reference, verse text, series name, dates, the
-- announcement) and the client renders it through its template registry
-- (`src/data/churchAssetTemplates.ts`). So the real art — backgrounds, fonts,
-- layouts — drops in later as client files and every existing card picks it up
-- without regeneration, migration or storage bucket. See
-- docs/CHURCH-VISUAL-ASSETS.md.
--
-- GENERATION IS COMPOSITION ON THE SERVER, NOT A MODEL. `generate_church_asset`
-- builds the payload itself from the church's own rows: a verse card copies the
-- reference and text of that day's `church_verses` row (which, for a drafted
-- day, was assembled from the BSB verses by `church-draft`; for a hand-typed
-- day, is what the leader typed and saved), a series header reads that series'
-- days, an announcement card copies the live `church_announcements` message.
-- The client sends a KIND, a SOURCE and a TEMPLATE id — never words — so no
-- client and no model can put text on a card. There are no free-form prompts.
--
-- Rules, each mirroring the text drafts (0127 / 0129):
--   * Generating needs the add-on (`church_gen_can`); approving and discarding
--     need only base leadership (`church_admin_can`), so a church whose add-on
--     lapsed can still clear what it made.
--   * A new asset is 'draft'. Regenerating over a DRAFT replaces it; over an
--     APPROVED one it refuses (`asset_is_set`) unless `p_replace`, which puts
--     the slot back to draft until approved again.
--   * Visibility is 'congregation' and the check constraint allows nothing
--     else. Widening it is a migration.
--   * Discard stamps `discarded_at` (no row deletion — the MCP cannot apply one).
--   * STALE: a card whose source has changed since it was made (the verse's
--     reference or text edited, the series renamed, the announcement replaced)
--     is reported `stale` to leadership and NEVER returned to members — a card
--     must never contradict the verse beside it.
--   * Members get an asset only when it is approved, not discarded, not stale,
--     its church is verified and they belong to it, and — for a verse card —
--     the verse itself is approved (never a draft).
--
-- Purely additive: one table, five functions, nothing restated, no policies.
-- Idempotent.

create table if not exists public.church_assets (
  id                 uuid primary key default gen_random_uuid(),
  church_id          uuid not null references public.churches(id) on delete cascade,
  kind               text not null check (kind in ('verse_card', 'series_header', 'announcement')),
  template_id        text not null check (template_id ~ '^[a-z0-9_]{2,40}$'),
  status             text not null default 'draft' check (status in ('draft', 'approved')),
  visibility         text not null default 'congregation' check (visibility = 'congregation'),
  -- What the card was made from. Exactly one of the three is set, by kind.
  source_drop_date   date,
  source_series      text,
  source_announcement_id uuid,
  -- A single key per (kind, source), for the one-live-asset rule.
  source_key         text not null check (char_length(source_key) between 3 and 120),
  payload            jsonb not null default '{}'::jsonb,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  approved_by        uuid,
  approved_at        timestamptz,
  discarded_at       timestamptz,
  constraint church_assets_source check (
    (kind = 'verse_card'    and source_drop_date is not null) or
    (kind = 'series_header' and source_series is not null) or
    (kind = 'announcement'  and source_announcement_id is not null))
);
create unique index if not exists church_assets_live_key
  on public.church_assets (church_id, kind, source_key) where discarded_at is null;
create index if not exists church_assets_church_idx
  on public.church_assets (church_id, created_at desc);
alter table public.church_assets enable row level security;
-- No policies: read and written only through the functions below.

-- ---------------------------------------------------------------------------
-- The payload a source would produce NOW. Used to build a card and to tell
-- whether a stored card is stale (its payload's words no longer match).
-- Internal only.
-- ---------------------------------------------------------------------------
create or replace function public.church_asset_source_payload(
  p_church_id uuid, p_kind text, p_drop_date date, p_series text, p_announcement_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_name text;
  v jsonb;
begin
  select name into v_name from public.churches where id = p_church_id;
  if p_kind = 'verse_card' then
    select jsonb_build_object(
             'church_name', v_name, 'date', cv.drop_date, 'reference', cv.reference,
             'text', cv.text, 'series', cv.series, 'note', cv.note)
      into v
      from public.church_verses cv
     where cv.church_id = p_church_id and cv.drop_date = p_drop_date and cv.discarded_at is null;
  elsif p_kind = 'series_header' then
    select case when count(*) = 0 then null else jsonb_build_object(
             'church_name', v_name, 'series', p_series,
             'start_date', min(cv.drop_date), 'end_date', max(cv.drop_date), 'days', count(*),
             'references', (select coalesce(jsonb_agg(x.reference order by x.drop_date), '[]'::jsonb)
                              from (select reference, drop_date from public.church_verses
                                     where church_id = p_church_id and series = p_series and discarded_at is null
                                       and drop_date between current_date - 60 and current_date + 120
                                     order by drop_date limit 7) x)) end
      into v
      from public.church_verses cv
     where cv.church_id = p_church_id and cv.series = p_series and cv.discarded_at is null
       and cv.drop_date between current_date - 60 and current_date + 120;
  elsif p_kind = 'announcement' then
    select jsonb_build_object('church_name', v_name, 'message', a.message,
                              'posted_at', a.created_at, 'expires_at', a.expires_at)
      into v
      from public.church_announcements a
     where a.church_id = p_church_id and a.id = p_announcement_id;
  end if;
  return v;
end;
$$;
revoke all on function public.church_asset_source_payload(uuid, text, date, text, uuid) from public, anon, authenticated;

-- The words on a card, for comparing a stored payload with its source now.
create or replace function public.church_asset_words(p jsonb)
returns jsonb
language sql immutable set search_path = public
as $$
  select jsonb_build_object(
    'reference', p->'reference', 'text', p->'text', 'series', p->'series',
    'message', p->'message', 'start_date', p->'start_date', 'end_date', p->'end_date',
    'days', p->'days');
$$;
revoke all on function public.church_asset_words(jsonb) from public, anon, authenticated;

create or replace function public.church_asset_json(a public.church_assets)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_now jsonb := public.church_asset_source_payload(a.church_id, a.kind, a.source_drop_date, a.source_series, a.source_announcement_id);
  v_verse_status text;
begin
  if a.kind = 'verse_card' then
    select status into v_verse_status from public.church_verses
     where church_id = a.church_id and drop_date = a.source_drop_date and discarded_at is null;
  end if;
  return jsonb_build_object(
    'id', a.id, 'kind', a.kind, 'template_id', a.template_id, 'status', a.status,
    'visibility', a.visibility, 'payload', a.payload,
    'source_drop_date', a.source_drop_date, 'source_series', a.source_series,
    'source_announcement_id', a.source_announcement_id,
    'stale', v_now is null or public.church_asset_words(v_now) <> public.church_asset_words(a.payload),
    'source_status', v_verse_status,
    'created_at', a.created_at, 'approved_at', a.approved_at);
end;
$$;
revoke all on function public.church_asset_json(public.church_assets) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Generate (add-on). The client names a kind, a source and a template.
--   verse_card    → p_source is the verse's date, 'YYYY-MM-DD'
--   series_header → p_source is the series name
--   announcement  → p_source is ignored; the church's live announcement is used
-- ---------------------------------------------------------------------------
create or replace function public.generate_church_asset(
  p_church_id uuid, p_kind text, p_source text, p_template_id text, p_replace boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_gate text := public.church_gen_can(p_church_id);
  v_tpl  text := btrim(coalesce(p_template_id, ''));
  v_date date;
  v_series text;
  v_ann uuid;
  v_key text;
  v_payload jsonb;
  v_cur public.church_assets%rowtype;
  v_row public.church_assets%rowtype;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  if p_kind not in ('verse_card', 'series_header', 'announcement') then
    return jsonb_build_object('ok', false, 'reason', 'bad_kind');
  end if;
  -- A template belongs to one kind, by prefix: verse_*, series_*, notice_*.
  if v_tpl !~ '^[a-z0-9_]{2,40}$' or v_tpl not like
     (case p_kind when 'verse_card' then 'verse\_%' when 'series_header' then 'series\_%' else 'notice\_%' end) then
    return jsonb_build_object('ok', false, 'reason', 'bad_template');
  end if;

  if p_kind = 'verse_card' then
    begin v_date := p_source::date; exception when others then v_date := null; end;
    if v_date is null or v_date < current_date - 1 or v_date > current_date + 366 then
      return jsonb_build_object('ok', false, 'reason', 'bad_date');
    end if;
    v_key := 'verse:' || v_date::text;
  elsif p_kind = 'series_header' then
    v_series := public.church_clean_line(coalesce(p_source, ''), 60);
    if v_series is null then return jsonb_build_object('ok', false, 'reason', 'bad_series'); end if;
    v_key := 'series:' || lower(v_series);
  else
    select id into v_ann from public.church_announcements
     where church_id = p_church_id and (expires_at is null or expires_at > now())
     order by created_at desc limit 1;
    if v_ann is null then return jsonb_build_object('ok', false, 'reason', 'no_announcement'); end if;
    v_key := 'announcement:' || v_ann::text;
  end if;

  v_payload := public.church_asset_source_payload(p_church_id, p_kind, v_date, v_series, v_ann);
  if v_payload is null then return jsonb_build_object('ok', false, 'reason', 'no_source'); end if;

  select * into v_cur from public.church_assets
   where church_id = p_church_id and kind = p_kind and source_key = v_key and discarded_at is null
   for update;
  if found and v_cur.status = 'approved' and not coalesce(p_replace, false) then
    return jsonb_build_object('ok', false, 'reason', 'asset_is_set');
  end if;

  if found then
    update public.church_assets
       set template_id = v_tpl, payload = v_payload, status = 'draft',
           created_by = auth.uid(), updated_at = now(), approved_by = null, approved_at = null
     where id = v_cur.id
    returning * into v_row;
  else
    insert into public.church_assets (church_id, kind, template_id, status, source_drop_date, source_series,
                                      source_announcement_id, source_key, payload, created_by)
    values (p_church_id, p_kind, v_tpl, 'draft', v_date, v_series, v_ann, v_key, v_payload, auth.uid())
    returning * into v_row;
  end if;
  return jsonb_build_object('ok', true, 'asset', public.church_asset_json(v_row));
end;
$$;
revoke all on function public.generate_church_asset(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.generate_church_asset(uuid, text, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Leadership: list, approve, discard (base tier).
-- ---------------------------------------------------------------------------
create or replace function public.church_assets_for(p_church_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_gate text := public.church_admin_can(p_church_id);
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  return jsonb_build_object('ok', true, 'assets', coalesce((
    select jsonb_agg(public.church_asset_json(a) order by a.created_at desc)
      from (select * from public.church_assets
             where church_id = p_church_id and discarded_at is null
               and (source_drop_date is null or source_drop_date >= current_date - 14)
             order by created_at desc limit 80) a
  ), '[]'::jsonb));
end;
$$;
revoke all on function public.church_assets_for(uuid) from public, anon;
grant execute on function public.church_assets_for(uuid) to authenticated;

create or replace function public.approve_church_asset(p_church_id uuid, p_asset_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_gate text := public.church_admin_can(p_church_id);
  v_row public.church_assets%rowtype;
  v_json jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  select * into v_row from public.church_assets
   where id = p_asset_id and church_id = p_church_id and discarded_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_asset'); end if;
  v_json := public.church_asset_json(v_row);
  -- A stale card would show words that no longer match its verse; regenerate it.
  if (v_json->>'stale')::boolean then return jsonb_build_object('ok', false, 'reason', 'stale'); end if;
  update public.church_assets
     set status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_at = now()
   where id = v_row.id
  returning * into v_row;
  return jsonb_build_object('ok', true, 'asset', public.church_asset_json(v_row));
end;
$$;
revoke all on function public.approve_church_asset(uuid, uuid) from public, anon;
grant execute on function public.approve_church_asset(uuid, uuid) to authenticated;

create or replace function public.discard_church_asset(p_church_id uuid, p_asset_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_gate text := public.church_admin_can(p_church_id);
  v_n int;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  update public.church_assets set discarded_at = now(), updated_at = now()
   where id = p_asset_id and church_id = p_church_id and discarded_at is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('ok', false, 'reason', 'no_asset'); end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.discard_church_asset(uuid, uuid) from public, anon;
grant execute on function public.discard_church_asset(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Members: today's approved, fresh cards for their own verified church.
--   verse_card    → for today's church verse (which must itself be approved)
--   series_header → for the series today's church verse belongs to
--   announcement  → for the church's live announcement
-- ---------------------------------------------------------------------------
create or replace function public.my_church_assets(p_local_date date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  v_date date := least(greatest(coalesce(p_local_date, current_date), current_date - 1), current_date + 1);
  v_church uuid;
  v_series text;
  v_ann uuid;
  v_out jsonb := '[]'::jsonb;
  a public.church_assets%rowtype;
  j jsonb;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select c.id into v_church
    from public.profiles p join public.churches c on c.id = p.church_id and c.verified
   where p.id = uid;
  if v_church is null then return v_out; end if;

  select series into v_series from public.church_verses
   where church_id = v_church and drop_date = v_date and discarded_at is null
     and status <> 'draft' and visibility = 'congregation';
  select id into v_ann from public.church_announcements
   where church_id = v_church and (expires_at is null or expires_at > now())
   order by created_at desc limit 1;

  for a in
    select * from public.church_assets
     where church_id = v_church and status = 'approved' and discarded_at is null
       and visibility = 'congregation'
       and ((kind = 'verse_card' and source_drop_date = v_date)
         or (kind = 'series_header' and v_series is not null and source_key = 'series:' || lower(v_series))
         or (kind = 'announcement' and v_ann is not null and source_announcement_id = v_ann))
  loop
    j := public.church_asset_json(a);
    if (j->>'stale')::boolean then continue; end if;
    if a.kind = 'verse_card' and coalesce(j->>'source_status', 'draft') = 'draft' then continue; end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', a.id, 'kind', a.kind, 'template_id', a.template_id, 'payload', a.payload));
  end loop;
  return v_out;
end;
$$;
revoke all on function public.my_church_assets(date) from public, anon;
grant execute on function public.my_church_assets(date) to authenticated;
