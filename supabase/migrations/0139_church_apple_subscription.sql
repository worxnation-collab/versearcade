-- 0139 — The Verified Church plan through Apple in-app purchase, beside Stripe.
--
-- Apple's multiplatform rule (3.1.3(b)) lets the App Store build use a plan
-- bought on the web only if the same plan can ALSO be bought in the app. So the
-- Verified Church plan gets two auto-renewable subscriptions in one App Store
-- subscription group — com.versearcade.app.church_verified_monthly and
-- _yearly — and this migration is the server half. It is additive: the Stripe
-- path (0131, 0134, 0135) is untouched except for the two lines below that
-- keep the two sources from switching each other off.
--
-- WHO PAYS, AND FOR WHICH CHURCH. An Apple subscription belongs to an Apple ID,
-- which RevenueCat files under the Supabase user id (lib/iap.ts logs in with
-- it). A church is not an Apple concept, so the BINDING is ours: one row per
-- church, and at most one ACTIVE row per user, so one Apple subscription
-- verifies exactly one church. Without that, one $29 subscription could
-- verify every church its buyer leads. A leader of two churches is told so
-- rather than silently verifying both.
--
-- NOTHING HERE BELIEVES THE CLIENT. The only writer is `billing_apply_apple`,
-- service_role only (the grant_skins / billing_apply_subscription shape,
-- revoked from public, anon AND authenticated — the 0052 lesson). It is called
-- by the iap-fulfill Edge Function after it has asked RevenueCat, with the
-- secret key, whether the subscription is live, and by the revenuecat-webhook
-- function, which re-asks RevenueCat rather than trusting the event body.
--
-- THE RULES, mirroring 0131's:
--   • Live (in its period, or in Apple's billing grace period) ⇒ verified. The
--     caller must be leadership of THAT church (`church_admins` — a free claim
--     counts, which is the upgrade this exists for).
--   • Expired, refunded or revoked ⇒ NOT verified — but only if Apple is what
--     turned it on (`granted_verified`) and no live Stripe subscription is
--     holding it on. A church an operator verified by hand, or that pays by
--     card as well, is never switched off by an Apple lapse. Same "billing only
--     turns OFF what billing turned ON" rule 0131 applies to the add-on.
--   • The plan through Apple is Verified Church only. The Content Generation
--     add-on (Church Suite) stays a web purchase, and nothing here touches
--     church_addons.
--
-- And the other direction: `billing_apply_subscription` is restated WHOLESALE
-- from 0131 (checked byte-identical to production before the restate) with
-- TWO lines changed — a dead Stripe subscription sets `verified` to whether an
-- Apple subscription is live, rather than to false, and reports that value.
-- Without it a church that moved from card to Apple would be switched off by
-- its old card subscription's cancellation. `my_church_billing` is restated
-- from 0135 likewise, gaining an `apple` key; every key it already returned is
-- unchanged, so `subscribed` still means "a live Stripe subscription" and the
-- web portal row is unmoved.

create table if not exists public.church_apple_subscriptions (
  church_id        uuid primary key,
  user_id          uuid not null,
  product_id       text not null,
  plan_interval    text check (plan_interval in ('month', 'year')),
  status           text not null check (status in ('active', 'expired')),
  expires_at       timestamptz,
  granted_verified boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- One ACTIVE binding per Apple ID. A lapsed one stays as history and a new
-- subscription may bind elsewhere.
create unique index if not exists church_apple_subscriptions_active_user
  on public.church_apple_subscriptions (user_id) where status = 'active';

-- No client reads this table directly: `my_church_billing` is the read.
alter table public.church_apple_subscriptions enable row level security;
revoke all on table public.church_apple_subscriptions from anon, authenticated;

-- Is an Apple subscription holding this church verified right now?
create or replace function public.church_apple_live(p_church_id uuid)
returns boolean
language sql
stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.church_apple_subscriptions
     where church_id = p_church_id and status = 'active'
  );
$$;

revoke all on function public.church_apple_live(uuid) from public, anon, authenticated;

-- Is a Stripe subscription holding this church verified right now? 0131's own
-- live set, read off the row the Stripe webhook keeps.
create or replace function public.church_stripe_live(p_church_id uuid)
returns boolean
language sql
stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.church_billing
     where church_id = p_church_id
       and stripe_subscription_id is not null
       and status in ('active', 'trialing', 'past_due')
  );
$$;

revoke all on function public.church_stripe_live(uuid) from public, anon, authenticated;

-- The writer. `p_live` is what RevenueCat said, decided by the Edge Function.
create or replace function public.billing_apply_apple(
  p_church_id uuid,
  p_user_id uuid,
  p_product_id text,
  p_interval text,
  p_live boolean,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  cur public.church_apple_subscriptions%rowtype;
  mine public.church_apple_subscriptions%rowtype;
  v_was boolean;
  v_granted boolean;
  v_interval text := case when p_interval in ('month', 'year') then p_interval end;
begin
  if p_church_id is null or p_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_args');
  end if;
  select verified into v_was from public.churches where id = p_church_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_church');
  end if;

  select * into cur from public.church_apple_subscriptions where church_id = p_church_id;

  if p_live then
    if not exists (select 1 from public.church_admins where church_id = p_church_id and user_id = p_user_id) then
      return jsonb_build_object('ok', false, 'reason', 'not_leadership');
    end if;
    -- This Apple ID already verifies a different church.
    select * into mine from public.church_apple_subscriptions where user_id = p_user_id;
    if found and mine.church_id <> p_church_id and mine.status = 'active' then
      return jsonb_build_object('ok', false, 'reason', 'bound_elsewhere');
    end if;
    -- Another leader's Apple ID already pays for this church.
    if cur.church_id is not null and cur.user_id <> p_user_id and cur.status = 'active' then
      return jsonb_build_object('ok', false, 'reason', 'already_subscribed');
    end if;
    -- Keep the flag across renewals; a fresh binding granted the badge only if
    -- the church was not already verified some other way.
    v_granted := case when cur.church_id is not null and cur.user_id = p_user_id and cur.status = 'active'
                      then cur.granted_verified
                      else not coalesce(v_was, false) end;

    insert into public.church_apple_subscriptions
      (church_id, user_id, product_id, plan_interval, status, expires_at, granted_verified, updated_at)
    values (p_church_id, p_user_id, p_product_id, v_interval, 'active', p_expires_at, v_granted, now())
    on conflict (church_id) do update set
      user_id = excluded.user_id,
      product_id = excluded.product_id,
      plan_interval = excluded.plan_interval,
      status = 'active',
      expires_at = excluded.expires_at,
      granted_verified = excluded.granted_verified,
      updated_at = now();
    update public.churches set verified = true where id = p_church_id;
    return jsonb_build_object('ok', true, 'verified', true);
  end if;

  -- Not live: only the binding on file, for this Apple ID, can be ended.
  if cur.church_id is null or cur.user_id <> p_user_id or cur.status <> 'active' then
    return jsonb_build_object('ok', true, 'unchanged', true);
  end if;
  update public.church_apple_subscriptions
     set status = 'expired', expires_at = coalesce(p_expires_at, expires_at),
         granted_verified = false, updated_at = now()
   where church_id = p_church_id;
  if cur.granted_verified and not public.church_stripe_live(p_church_id) then
    update public.churches set verified = false where id = p_church_id;
    return jsonb_build_object('ok', true, 'verified', false);
  end if;
  return jsonb_build_object('ok', true, 'verified', coalesce(v_was, false));
end;
$$;

revoke all on function public.billing_apply_apple(uuid, uuid, text, text, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.billing_apply_apple(uuid, uuid, text, text, boolean, timestamptz) to service_role;

-- The churches an Apple ID is actively verifying, for the Edge Functions'
-- re-sync. Active only: a lapsed binding comes back through a purchase or a
-- restore made FROM that church's screen, never by itself.
create or replace function public.billing_apple_bindings(p_user_id uuid)
returns setof uuid
language sql
stable security definer set search_path = public
as $$
  select church_id from public.church_apple_subscriptions
   where user_id = p_user_id and status = 'active';
$$;

revoke all on function public.billing_apple_bindings(uuid) from public, anon, authenticated;
grant execute on function public.billing_apple_bindings(uuid) to service_role;

-- Restated from 0131 with two lines changed (see the header).
create or replace function public.billing_apply_subscription(
  p_church_id uuid,
  p_subscription_id text,
  p_customer_id text,
  p_status text,
  p_interval text,
  p_content_addon boolean,
  p_collection_method text,
  p_period_end timestamptz
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_on_file text;
  v_prev_addon boolean;
  v_live boolean := p_status in ('active', 'trialing', 'past_due');
  v_dead boolean := p_status in ('canceled', 'unpaid', 'incomplete_expired', 'paused');
begin
  if not exists (select 1 from public.churches where id = p_church_id) then
    return jsonb_build_object('ok', false, 'reason', 'no_church');
  end if;
  select stripe_subscription_id, content_addon into v_on_file, v_prev_addon
    from public.church_billing where church_id = p_church_id;

  if v_live then
    insert into public.church_billing (church_id, stripe_subscription_id, stripe_customer_id, status,
      plan_interval, content_addon, collection_method, current_period_end, updated_at)
    values (p_church_id, p_subscription_id, p_customer_id, p_status,
      p_interval, coalesce(p_content_addon, false), p_collection_method, p_period_end, now())
    on conflict (church_id) do update set
      stripe_subscription_id = excluded.stripe_subscription_id,
      stripe_customer_id = excluded.stripe_customer_id,
      status = excluded.status,
      plan_interval = excluded.plan_interval,
      content_addon = excluded.content_addon,
      collection_method = excluded.collection_method,
      current_period_end = excluded.current_period_end,
      updated_at = now();
    update public.churches set verified = true where id = p_church_id;
    if coalesce(p_content_addon, false) or coalesce(v_prev_addon, false) then
      insert into public.church_addons (church_id, content_generation, updated_at, updated_by)
      values (p_church_id, coalesce(p_content_addon, false), now(), null)
      on conflict (church_id) do update
        set content_generation = excluded.content_generation, updated_at = now(), updated_by = null;
    end if;
    return jsonb_build_object('ok', true, 'verified', true);
  end if;

  if v_dead and v_on_file is not distinct from p_subscription_id then
    update public.church_billing
       set status = p_status, content_addon = false, current_period_end = p_period_end, updated_at = now()
     where church_id = p_church_id;
    -- 0139: a live Apple subscription keeps the church verified on its own.
    update public.churches set verified = public.church_apple_live(p_church_id) where id = p_church_id;
    if coalesce(v_prev_addon, false) then
      update public.church_addons set content_generation = false, updated_at = now(), updated_by = null
       where church_id = p_church_id;
    end if;
    return jsonb_build_object('ok', true, 'verified', public.church_apple_live(p_church_id));
  end if;

  return jsonb_build_object('ok', true, 'unchanged', true);
end;
$$;

revoke all on function public.billing_apply_subscription(uuid, text, text, text, text, boolean, text, timestamptz) from public, anon, authenticated;
grant execute on function public.billing_apply_subscription(uuid, text, text, text, text, boolean, text, timestamptz) to service_role;

-- Restated from 0135 with the `apple` key added (see the header).
create or replace function public.my_church_billing(p_church_id uuid)
returns jsonb
language plpgsql
stable security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  b public.church_billing%rowtype;
  ap public.church_apple_subscriptions%rowtype;
  v_apple jsonb;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.church_admins where church_id = p_church_id and user_id = uid) then
    return jsonb_build_object('ok', false, 'reason', 'not_leadership');
  end if;
  -- 0139: the church's Apple subscription, if one is bound. `mine` says
  -- whether it is the caller's own Apple ID paying, which decides whether the
  -- screen can offer "Manage in the App Store" or must name another leader.
  select * into ap from public.church_apple_subscriptions where church_id = p_church_id;
  if found then
    v_apple := jsonb_build_object(
      'active', ap.status = 'active',
      'interval', ap.plan_interval,
      'expires_at', ap.expires_at,
      'mine', ap.user_id = uid
    );
  end if;
  select * into b from public.church_billing where church_id = p_church_id;
  if not found then
    return jsonb_build_object('ok', true, 'subscribed', false, 'apple', v_apple);
  end if;
  return jsonb_build_object(
    'ok', true,
    'subscribed', b.stripe_customer_id is not null and b.status in ('active', 'trialing', 'past_due'),
    'status', b.status,
    'interval', b.plan_interval,
    'addon', b.content_addon,
    'collection_method', b.collection_method,
    'period_end', b.current_period_end,
    'apple', v_apple
  );
end;
$$;

revoke all on function public.my_church_billing(uuid) from public, anon;
grant execute on function public.my_church_billing(uuid) to authenticated;

notify pgrst, 'reload schema';
