-- 0121 — A one-time invite link that makes a pastor their church's leadership.
--
-- Until now a claim (0079, `church_admins`) was granted by the operator typing a
-- USERNAME into Admin: the pastor had to make an account, send their username
-- by email, and wait. This replaces the relay, not the judgement. The operator
-- still decides who leads a church — by choosing whom to send the link to — and
-- the grant still lands in `church_admins`, revocable from the same panel.
--
-- Rules, all enforced here:
--   * ONLY THE OPERATOR MAKES A CODE (`require_admin()`).
--   * A CODE IS STORED HASHED. The table holds sha256(code), so a read of it —
--     by a leaked service key, a backup, a curious query — is not a working
--     link. The plain code exists once, in the response to the operator.
--   * ONE USE, ONE CHURCH, AN EXPIRY. A code names its church, is burned by the
--     first account that redeems it, and dies after 1–60 days (default 14).
--     Redeeming checks the church in the URL against the code's own church, so
--     a code cannot be pointed at a different church.
--   * NOTHING ABOUT A MEMBER. A claim buys exactly what 0079 says it buys.
--
-- The code is two random uuids with the dashes taken out: 64 hex characters,
-- 244 random bits. `church_claim_preview` is anon-callable so the page can say
-- "this link has expired" before asking anybody to sign up; at that size there
-- is nothing to guess, and it answers only valid / used / expired / invalid.
--
-- No client policies on the table, the house shape. No DROP, DELETE or CREATE
-- POLICY anywhere here. Idempotent.

create table if not exists public.church_claim_codes (
  code_hash  text primary key,
  church_id  uuid not null references public.churches(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  note       text,
  used_by    uuid references public.profiles(id) on delete set null,
  used_at    timestamptz
);

create index if not exists church_claim_codes_church_idx on public.church_claim_codes (church_id);

alter table public.church_claim_codes enable row level security;
revoke all on table public.church_claim_codes from anon, authenticated;

create or replace function public.church_claim_hash(p_code text)
returns text
language sql
immutable
set search_path = public
as $$
  select encode(sha256(convert_to(lower(btrim(coalesce(p_code, ''))), 'UTF8')), 'hex');
$$;

revoke all on function public.church_claim_hash(text) from public, anon, authenticated;

-- The operator: make a link for one church.
create or replace function public.admin_create_church_claim_code(
  p_church_id uuid,
  p_note text default null,
  p_days integer default 14
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_code text;
  v_expires timestamptz;
begin
  perform public.require_admin();

  if not exists (select 1 from public.churches where id = p_church_id) then
    return jsonb_build_object('ok', false, 'reason', 'church_not_found');
  end if;

  v_code := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_expires := now() + make_interval(days => least(greatest(coalesce(p_days, 14), 1), 60));

  insert into public.church_claim_codes (code_hash, church_id, created_by, expires_at, note)
  values (public.church_claim_hash(v_code), p_church_id, auth.uid(), v_expires,
          nullif(left(btrim(coalesce(p_note, '')), 200), ''));

  return jsonb_build_object('ok', true, 'code', v_code, 'expires_at', v_expires);
end;
$$;

revoke all on function public.admin_create_church_claim_code(uuid, text, integer) from public, anon;
grant execute on function public.admin_create_church_claim_code(uuid, text, integer) to authenticated;

-- The page, before anybody signs in: is this link still good?
create or replace function public.church_claim_preview(p_church_id uuid, p_code text)
returns jsonb
language plpgsql
stable security definer set search_path = public
as $$
declare
  r public.church_claim_codes%rowtype;
begin
  select * into r from public.church_claim_codes
   where code_hash = public.church_claim_hash(p_code) and church_id = p_church_id;
  if not found then return jsonb_build_object('ok', true, 'status', 'invalid'); end if;
  if r.used_at is not null then return jsonb_build_object('ok', true, 'status', 'used'); end if;
  if r.expires_at < now() then return jsonb_build_object('ok', true, 'status', 'expired'); end if;
  return jsonb_build_object('ok', true, 'status', 'valid');
end;
$$;

grant execute on function public.church_claim_preview(uuid, text) to anon, authenticated;

-- The pastor, signed in: redeem it.
create or replace function public.redeem_church_claim_code(p_church_id uuid, p_code text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.church_claim_codes%rowtype;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select * into r from public.church_claim_codes
   where code_hash = public.church_claim_hash(p_code) and church_id = p_church_id
   for update;

  if not found then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  -- A second tap by the same person is a success, not an error.
  if r.used_by = uid then return jsonb_build_object('ok', true, 'already', true); end if;
  if r.used_at is not null then return jsonb_build_object('ok', false, 'reason', 'used'); end if;
  if r.expires_at < now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;

  insert into public.church_admins (church_id, user_id, granted_by, note)
  values (r.church_id, uid, r.created_by, coalesce('invite link · ' || r.note, 'invite link'))
  on conflict (church_id, user_id) do nothing;

  update public.church_claim_codes
     set used_by = uid, used_at = now()
   where code_hash = r.code_hash;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.redeem_church_claim_code(uuid, text) from public, anon;
grant execute on function public.redeem_church_claim_code(uuid, text) to authenticated;

notify pgrst, 'reload schema';
