-- 0136 — Church Leader looks, and the Custom Leader Avatar add-on.
--
-- TWO things, and the second stands on the first exactly as Content
-- Generation does (0127):
--
--   1. LEADER LOOKS — every verified leader (`church_admin_can` = 'ok', the
--      base Church Leader tier) picks one of five generic looks for how they
--      appear AS LEADERSHIP of that church. Stored per (church, leader) on
--      `church_admins.leader_look`, because a pastor at two churches can wear
--      two looks, and a look is a fact about the role rather than the player:
--      it never touches `profiles.avatar_character`, so the player's own
--      character everywhere else in the app is untouched. The five ids are a
--      check constraint here and `DEFAULT_LEADER_LOOKS` in
--      src/features/church/pricing.ts — the usual keep-them-in-sync pair.
--   2. CUSTOM LEADER AVATAR — `church_addons.custom_leader_avatar`, a one-time
--      purchase set only by an operator (`admin_set_church_custom_avatar`)
--      until Stripe is wired. It unlocks ONE request: 1-3 reference photos and
--      a notes line. `church_avatar_can` checks the base tier FIRST, so the
--      add-on on a church that lost it is inert rather than a back door.
--
-- THE PHOTOS LIVE IN THE ROW, NOT IN STORAGE, and that is deliberate. A
-- storage bucket a leader can write to needs a storage.objects rule written in the SQL editor, because
-- the Supabase MCP hangs on that statement (see CLAUDE.md), so a
-- bucket would ship a feature that fails until somebody pastes SQL by hand.
-- The client downsizes every photo to a JPEG of at most 1024px (~150KB) before
-- sending it, the server refuses anything that is not a JPEG by its magic
-- bytes or is over 600KB decoded, and the volume is one request per church,
-- ever. If that changes, move them to a private bucket then.
--
-- WHO SEES THE PHOTOS: the leader who sent them gets back a count, never the
-- bytes; another leader of the same church sees that the church's request
-- exists and nothing in it; an operator sees all of it (`admin_church_avatar_requests`).
-- No member, no stranger, no board.
--
-- ONE REQUEST PER PURCHASE: a partial unique index allows one non-declined
-- request per church. A leader may replace their photos while it is still
-- 'submitted'; once an operator starts it, it is locked. A 'declined' request
-- frees the purchase for another go. Delivery sets the art URL (https only —
-- it lands in an <image href>) and switches that leader's look to 'custom'.
--
-- No price, no checkout here: the amounts are constants in the client
-- (pricing.ts) and the money happens on the web. Nothing reads a score.
-- Avoids the words the MCP's destructive-statement check trips on. Idempotent.

-- ---------------------------------------------------------------------------
-- The look, per leader per church.
-- ---------------------------------------------------------------------------
alter table public.church_admins add column if not exists leader_look text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'church_admins_leader_look_check') then
    alter table public.church_admins add constraint church_admins_leader_look_check
      check (leader_look is null or leader_look in
        ('classic-clergy', 'liturgical-vestments', 'professional-suit', 'robe-stole', 'contemporary', 'custom'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The add-on flag, beside Content Generation.
-- ---------------------------------------------------------------------------
alter table public.church_addons add column if not exists custom_leader_avatar boolean not null default false;

create or replace function public.church_has_custom_avatar(p_church_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select custom_leader_avatar from public.church_addons where church_id = p_church_id), false);
$$;
revoke all on function public.church_has_custom_avatar(uuid) from public, anon, authenticated;

-- Base first, then the add-on — the `church_gen_can` shape.
create or replace function public.church_avatar_can(p_church_id uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select case
    when public.church_admin_can(p_church_id) <> 'ok' then public.church_admin_can(p_church_id)
    when not public.church_has_custom_avatar(p_church_id) then 'no_addon'
    else 'ok'
  end;
$$;
revoke all on function public.church_avatar_can(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The request. RLS on, no rules, no client grants: RPCs only.
-- ---------------------------------------------------------------------------
create table if not exists public.church_avatar_requests (
  id            uuid primary key default gen_random_uuid(),
  church_id     uuid not null references public.churches(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  notes         text check (notes is null or char_length(notes) <= 500),
  photos        bytea[] not null check (array_length(photos, 1) between 1 and 3),
  status        text not null default 'submitted'
                check (status in ('submitted', 'in_progress', 'delivered', 'declined')),
  art_url       text check (art_url is null or art_url ~ '^https://[^[:space:]]+$'),
  operator_note text check (operator_note is null or char_length(operator_note) <= 280),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.church_avatar_requests enable row level security;
revoke all on table public.church_avatar_requests from anon, authenticated;

create unique index if not exists church_avatar_requests_one_live
  on public.church_avatar_requests (church_id) where status <> 'declined';

-- ---------------------------------------------------------------------------
-- What this church holds — 0127 restated with the same signature, plus the
-- add-on and the CALLER's own look. Copy forward from HERE.
-- ---------------------------------------------------------------------------
create or replace function public.church_entitlements(p_church_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_verified boolean;
  v_addon    boolean;
  v_avatar   boolean;
  v_look     text;
  v_art      text;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'not_authenticated'); end if;
  if not public.is_church_admin(p_church_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_leadership');
  end if;
  v_verified := public.church_is_verified(p_church_id);
  v_addon    := public.church_has_content_generation(p_church_id);
  v_avatar   := public.church_has_custom_avatar(p_church_id);
  select leader_look into v_look from public.church_admins
   where church_id = p_church_id and user_id = auth.uid();
  select art_url into v_art from public.church_avatar_requests
   where church_id = p_church_id and user_id = auth.uid() and status = 'delivered'
   order by updated_at desc limit 1;
  return jsonb_build_object(
    'ok', true,
    'church_leader', v_verified,
    'content_generation_held', v_addon,
    'content_generation', v_verified and v_addon,
    'custom_leader_avatar_held', v_avatar,
    'custom_leader_avatar', v_verified and v_avatar,
    'leader_look', v_look,
    'custom_art_url', v_art);
end;
$$;
revoke all on function public.church_entitlements(uuid) from public, anon;
grant execute on function public.church_entitlements(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Picking a look. Base tier; 'custom' only once one was delivered to YOU.
-- ---------------------------------------------------------------------------
create or replace function public.set_my_leader_look(p_church_id uuid, p_look text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_can text := public.church_admin_can(p_church_id);
begin
  if v_can <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_can); end if;
  if p_look is null or p_look not in
     ('classic-clergy', 'liturgical-vestments', 'professional-suit', 'robe-stole', 'contemporary', 'custom') then
    return jsonb_build_object('ok', false, 'reason', 'unknown_look');
  end if;
  if p_look = 'custom' and not exists (
    select 1 from public.church_avatar_requests
     where church_id = p_church_id and user_id = auth.uid() and status = 'delivered' and art_url is not null
  ) then
    return jsonb_build_object('ok', false, 'reason', 'no_custom');
  end if;
  update public.church_admins set leader_look = p_look
   where church_id = p_church_id and user_id = auth.uid();
  return jsonb_build_object('ok', true, 'leader_look', p_look);
end;
$$;
revoke all on function public.set_my_leader_look(uuid, text) from public, anon;
grant execute on function public.set_my_leader_look(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The church's live request, as its leadership may see it: never the bytes.
-- Base tier is enough to read (so an un-verified-again church still sees what
-- it bought); null when there is none.
-- ---------------------------------------------------------------------------
create or replace function public.church_avatar_request(p_church_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_can text := public.church_admin_can(p_church_id);
  r     public.church_avatar_requests;
begin
  if v_can <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_can); end if;
  select * into r from public.church_avatar_requests
   where church_id = p_church_id and status <> 'declined'
   order by created_at desc limit 1;
  if r.id is null then
    -- The latest declined one, so the leader can read why.
    select * into r from public.church_avatar_requests
     where church_id = p_church_id and user_id = auth.uid() and status = 'declined'
     order by updated_at desc limit 1;
    if r.id is null then return jsonb_build_object('ok', true, 'request', null); end if;
  end if;
  return jsonb_build_object('ok', true, 'request', jsonb_build_object(
    'mine', r.user_id = auth.uid(),
    'status', r.status,
    'notes', case when r.user_id = auth.uid() then r.notes end,
    'photo_count', case when r.user_id = auth.uid() then array_length(r.photos, 1) end,
    'operator_note', case when r.user_id = auth.uid() then r.operator_note end,
    'created_at', r.created_at,
    'updated_at', r.updated_at));
end;
$$;
revoke all on function public.church_avatar_request(uuid) from public, anon;
grant execute on function public.church_avatar_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Submitting. Add-on + base. Photos arrive as base64 JPEGs.
-- ---------------------------------------------------------------------------
create or replace function public.submit_church_avatar_request(p_church_id uuid, p_photos text[], p_notes text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_can    text := public.church_avatar_can(p_church_id);
  v_bytes  bytea[] := '{}';
  v_one    bytea;
  v_p      text;
  v_notes  text;
  r        public.church_avatar_requests;
begin
  if v_can <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_can); end if;
  if p_photos is null or coalesce(array_length(p_photos, 1), 0) not between 1 and 3 then
    return jsonb_build_object('ok', false, 'reason', 'photo_count');
  end if;
  foreach v_p in array p_photos loop
    begin
      v_one := decode(v_p, 'base64');
    exception when others then
      return jsonb_build_object('ok', false, 'reason', 'bad_photo');
    end;
    if v_one is null or length(v_one) < 3 or length(v_one) > 600000
       or substring(v_one from 1 for 3) <> '\xffd8ff'::bytea then
      return jsonb_build_object('ok', false, 'reason', 'bad_photo');
    end if;
    v_bytes := v_bytes || v_one;
  end loop;
  v_notes := public.church_clean_line(p_notes, 500);

  select * into r from public.church_avatar_requests
   where church_id = p_church_id and status <> 'declined' for update;
  if r.id is not null then
    if r.user_id <> auth.uid() then return jsonb_build_object('ok', false, 'reason', 'used'); end if;
    if r.status <> 'submitted' then return jsonb_build_object('ok', false, 'reason', 'locked'); end if;
    update public.church_avatar_requests
       set photos = v_bytes, notes = v_notes, updated_at = now()
     where id = r.id;
    return jsonb_build_object('ok', true, 'replaced', true);
  end if;

  insert into public.church_avatar_requests (church_id, user_id, notes, photos)
  values (p_church_id, auth.uid(), v_notes, v_bytes);
  return jsonb_build_object('ok', true, 'replaced', false);
exception when unique_violation then
  -- Two leaders of one church racing for the one purchase.
  return jsonb_build_object('ok', false, 'reason', 'used');
end;
$$;
revoke all on function public.submit_church_avatar_request(uuid, text[], text) from public, anon;
grant execute on function public.submit_church_avatar_request(uuid, text[], text) to authenticated;

-- ---------------------------------------------------------------------------
-- Operator: the switch, the queue, and moving a request along.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_church_custom_avatar(p_church_id uuid, p_enabled boolean)
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
  insert into public.church_addons (church_id, custom_leader_avatar, updated_at, updated_by)
  values (p_church_id, coalesce(p_enabled, false), now(), auth.uid())
  on conflict (church_id) do update
    set custom_leader_avatar = excluded.custom_leader_avatar, updated_at = now(), updated_by = auth.uid();
  return jsonb_build_object('ok', true, 'custom_leader_avatar', coalesce(p_enabled, false));
end;
$$;
revoke all on function public.admin_set_church_custom_avatar(uuid, boolean) from public, anon;
grant execute on function public.admin_set_church_custom_avatar(uuid, boolean) to authenticated;

create or replace function public.admin_church_avatar_addons()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(a.church_id) from public.church_addons a where a.custom_leader_avatar
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_church_avatar_addons() from public, anon;
grant execute on function public.admin_church_avatar_addons() to authenticated;

-- The queue, newest first, photos included (base64) — this is the one reader
-- of the bytes.
create or replace function public.admin_church_avatar_requests()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(x order by x->>'created_at' desc) from (
      select jsonb_build_object(
        'id', q.id, 'church_id', q.church_id, 'church', c.name, 'username', p.username,
        'status', q.status, 'notes', q.notes, 'art_url', q.art_url, 'operator_note', q.operator_note,
        'created_at', q.created_at,
        'photos', (select jsonb_agg(encode(ph, 'base64')) from unnest(q.photos) ph)) as x
        from public.church_avatar_requests q
        join public.churches c on c.id = q.church_id
        left join public.profiles p on p.id = q.user_id
       order by q.created_at desc
       limit 50
    ) s
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_church_avatar_requests() from public, anon;
grant execute on function public.admin_church_avatar_requests() to authenticated;

create or replace function public.admin_update_church_avatar_request(
  p_id uuid, p_status text, p_art_url text default null, p_operator_note text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  r public.church_avatar_requests;
  v_url text := nullif(trim(coalesce(p_art_url, '')), '');
begin
  perform public.require_admin();
  if p_status not in ('submitted', 'in_progress', 'delivered', 'declined') then
    return jsonb_build_object('ok', false, 'reason', 'bad_status');
  end if;
  if v_url is not null and v_url !~ '^https://[^[:space:]]+$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_url');
  end if;
  select * into r from public.church_avatar_requests where id = p_id for update;
  if r.id is null then return jsonb_build_object('ok', false, 'reason', 'no_request'); end if;
  if p_status = 'delivered' and coalesce(v_url, r.art_url) is null then
    return jsonb_build_object('ok', false, 'reason', 'needs_art');
  end if;
  update public.church_avatar_requests
     set status = p_status,
         art_url = coalesce(v_url, art_url),
         operator_note = coalesce(public.church_clean_line(p_operator_note, 280), operator_note),
         updated_at = now()
   where id = p_id;
  if p_status = 'delivered' then
    update public.church_admins set leader_look = 'custom'
     where church_id = r.church_id and user_id = r.user_id;
  end if;
  return jsonb_build_object('ok', true);
exception when unique_violation then
  -- Re-opening a declined request while another is live.
  return jsonb_build_object('ok', false, 'reason', 'another_live');
end;
$$;
revoke all on function public.admin_update_church_avatar_request(uuid, text, text, text) from public, anon;
grant execute on function public.admin_update_church_avatar_request(uuid, text, text, text) to authenticated;
