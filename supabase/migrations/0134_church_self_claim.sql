-- 0134 — A church can claim itself: claim → pay → verified, with no operator in
-- the path.
--
-- Until now leadership was granted only by hand (0079, the 0121 invite link),
-- and docs/CHURCH-CLAIM.md said so on purpose: the grant WAS the moderation.
-- The owner reversed that on 2026-10-22 ("so churches can actually buy without
-- manual intervention"), choosing PAY = CLAIM, GUARDED over two alternatives
-- (member tools held for an operator OK; domain-matched email only). This
-- migration is that choice, and the guards are the whole of it:
--
--   • ONLY AN UNLED CHURCH. A church with any row in `church_admins`, or a live
--     subscription on file, cannot be claimed this way — that is the case where
--     a stranger would be taking a congregation away from its real leadership,
--     and it still goes through the queue. Checked when the claim starts, again
--     when checkout opens (in the Edge Function), and a third time, under a row
--     lock, when the payment lands.
--   • PAYMENT IS THE ACT. Starting a claim grants nothing. Leadership is written
--     only by `billing_activate_claim`, which only the church-billing webhook
--     (service_role) can call, and only for a live subscription — so a claimant
--     has put a card on file with Stripe before they hold anything. With the
--     Founding trial that card is not charged until Easter 2027, which is why
--     the claim's checkout is CARD ONLY: the invoice path would create a
--     trialing subscription with no payment method at all.
--   • FIRST PAYMENT WINS, and a second is a CONFLICT, not a second leader. Two
--     people can each open a checkout for the same unled church; whichever
--     webhook lands first becomes leadership and the other claim is marked
--     'conflict' for an operator to refund. Its subscription is NOT applied to
--     the church, so the first payer's billing row is never overwritten.
--   • EVERY CLAIM IS REVIEWABLE. `admin_church_claims` lists them newest first
--     with who, what role, and which email; `admin_review_church_claim` marks
--     one seen, or revokes it (removing the leadership row through 0079's own
--     revoke, so there is one way to take a claim back). Revoking does not
--     cancel the Stripe subscription — refunding is a Stripe dashboard act, and
--     cancelling there un-verifies the church through the webhook as usual.
--
-- The claim token works like 0121's invite code in reverse: the server makes
-- it, hands it to the claimant ONCE, and stores only its sha256. It opens the
-- web billing page in claim mode (`/church-billing/?c=…`), so the prices stay
-- off the app, as CLAUDE.md requires.
--
-- No foreign keys here, deliberately: the cascading ones live in
-- 0134_church_self_claim_b so this file carries none of the words the Supabase
-- MCP pauses on for a confirmation that never reaches a cloud session.

create table if not exists public.church_claims (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null,
  user_id uuid not null,
  role text not null check (char_length(role) between 1 and 60),
  contact_name text not null check (char_length(contact_name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 200),
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'active', 'conflict', 'revoked')),
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid
);

create index if not exists church_claims_church_idx on public.church_claims (church_id);
create index if not exists church_claims_user_idx on public.church_claims (user_id, created_at desc);

-- Locked to direct access; every read and write is a function below.
alter table public.church_claims enable row level security;

-- Is this church open to a self-serve claim? One answer for the page, before
-- anybody signs in — a fact the page already shows (Edit vs Add info), so it
-- reveals nothing new.
create or replace function public.church_self_claim_status(p_church_id uuid)
returns jsonb
language plpgsql
stable security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if not exists (select 1 from public.churches where id = p_church_id) then
    return jsonb_build_object('ok', true, 'status', 'not_found');
  end if;
  if uid is not null and exists (select 1 from public.church_admins where church_id = p_church_id and user_id = uid) then
    return jsonb_build_object('ok', true, 'status', 'you_lead');
  end if;
  if exists (select 1 from public.church_admins where church_id = p_church_id) then
    return jsonb_build_object('ok', true, 'status', 'has_leader');
  end if;
  if exists (select 1 from public.church_billing where church_id = p_church_id
             and status in ('active', 'trialing', 'past_due')) then
    return jsonb_build_object('ok', true, 'status', 'paying');
  end if;
  return jsonb_build_object('ok', true, 'status', 'open');
end;
$$;

grant execute on function public.church_self_claim_status(uuid) to anon, authenticated;

-- The claimant, signed in: open a claim and get the one-time token that opens
-- the billing page for it. Grants nothing.
create or replace function public.start_church_claim(
  p_church_id uuid,
  p_role text,
  p_name text,
  p_email text
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_role text := left(btrim(regexp_replace(coalesce(p_role, ''), '[[:cntrl:]]+', ' ', 'g')), 60);
  v_name text := left(btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]+', ' ', 'g')), 120);
  v_email text := lower(left(btrim(coalesce(p_email, '')), 200));
  v_token text;
  v_existing uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if v_role = '' or v_name = '' or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_input');
  end if;
  if not exists (select 1 from public.churches where id = p_church_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if exists (select 1 from public.church_admins where church_id = p_church_id and user_id = uid) then
    return jsonb_build_object('ok', false, 'reason', 'you_lead');
  end if;
  if exists (select 1 from public.church_admins where church_id = p_church_id) then
    return jsonb_build_object('ok', false, 'reason', 'has_leader');
  end if;
  if exists (select 1 from public.church_billing where church_id = p_church_id
             and status in ('active', 'trialing', 'past_due')) then
    return jsonb_build_object('ok', false, 'reason', 'paying');
  end if;

  -- A claimant coming back to the same church reuses their pending claim (with
  -- a fresh token, since only the hash was kept). Anything else counts toward
  -- five new claims a day — a pastor claims one church, not a directory.
  select id into v_existing from public.church_claims
   where church_id = p_church_id and user_id = uid and status = 'pending'
   order by created_at desc limit 1;
  if v_existing is null and (
    select count(*) from public.church_claims where user_id = uid and created_at > now() - interval '1 day'
  ) >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  if v_existing is not null then
    update public.church_claims
       set token_hash = encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
           role = v_role, contact_name = v_name, email = v_email
     where id = v_existing;
  else
    insert into public.church_claims (church_id, user_id, role, contact_name, email, token_hash)
    values (p_church_id, uid, v_role, v_name, v_email, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'));
  end if;

  return jsonb_build_object('ok', true, 'token', v_token);
end;
$$;

revoke all on function public.start_church_claim(uuid, text, text, text) from public, anon;
grant execute on function public.start_church_claim(uuid, text, text, text) to authenticated;

-- The webhook: a live subscription carrying a claim id makes the claimant
-- leadership — unless somebody else already is. service_role only.
create or replace function public.billing_activate_claim(p_claim_id uuid, p_church_id uuid, p_subscription_id text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  r public.church_claims%rowtype;
begin
  -- Serialise every activation for one church on its row, so two payments
  -- landing together cannot both find it unled.
  perform 1 from public.churches where id = p_church_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  select * into r from public.church_claims where id = p_claim_id for update;
  if not found or r.church_id <> p_church_id then
    return jsonb_build_object('ok', false, 'reason', 'no_claim');
  end if;
  if r.status = 'active' then return jsonb_build_object('ok', true, 'already', true); end if;
  if r.status <> 'pending' then return jsonb_build_object('ok', false, 'reason', r.status); end if;

  if exists (select 1 from public.church_admins where church_id = p_church_id and user_id <> r.user_id) then
    update public.church_claims set status = 'conflict', stripe_subscription_id = p_subscription_id where id = r.id;
    return jsonb_build_object('ok', false, 'reason', 'conflict');
  end if;

  insert into public.church_admins (church_id, user_id, granted_by, note)
  values (p_church_id, r.user_id, null, 'self-serve claim · paid · ' || r.role)
  on conflict (church_id, user_id) do nothing;

  -- A pastor who doesn't play anywhere yet plays for the church they lead; one
  -- who already plays for a church keeps it.
  update public.profiles set church_id = p_church_id where id = r.user_id and church_id is null;

  update public.church_claims
     set status = 'active', activated_at = now(), stripe_subscription_id = p_subscription_id
   where id = r.id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.billing_activate_claim(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.billing_activate_claim(uuid, uuid, text) to service_role;

-- Operator: every self-serve claim, newest first.
create or replace function public.admin_church_claims(p_limit integer default 100)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.created_at desc)
    from (
      select k.id, k.church_id, c.name as church_name, c.city, c.region, pr.username,
             k.role, k.contact_name, k.email, k.status, k.stripe_subscription_id,
             k.created_at, k.activated_at, k.reviewed_at
        from public.church_claims k
        join public.churches c on c.id = k.church_id
        left join public.profiles pr on pr.id = k.user_id
       order by k.created_at desc
       limit least(greatest(coalesce(p_limit, 100), 1), 500)
    ) x
  ), '[]'::jsonb);
end;
$$;

-- Operator: 'seen' acknowledges a claim; 'revoke' takes the leadership back
-- through 0079's own revoke, so there is exactly one way that happens.
create or replace function public.admin_review_church_claim(p_claim_id uuid, p_action text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  r public.church_claims%rowtype;
  v_username text;
begin
  perform public.require_admin();
  select * into r from public.church_claims where id = p_claim_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_claim'); end if;

  if p_action = 'seen' then
    update public.church_claims set reviewed_at = now(), reviewed_by = auth.uid() where id = r.id;
    return jsonb_build_object('ok', true);
  end if;
  if p_action = 'revoke' then
    select username into v_username from public.profiles where id = r.user_id;
    if v_username is not null then
      perform public.admin_revoke_church_admin(r.church_id, v_username);
    end if;
    update public.church_claims set status = 'revoked', reviewed_at = now(), reviewed_by = auth.uid() where id = r.id;
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'reason', 'bad_action');
end;
$$;

revoke all on function public.admin_church_claims(integer) from public, anon;
grant execute on function public.admin_church_claims(integer) to authenticated;
revoke all on function public.admin_review_church_claim(uuid, text) from public, anon;
grant execute on function public.admin_review_church_claim(uuid, text) to authenticated;

notify pgrst, 'reload schema';
