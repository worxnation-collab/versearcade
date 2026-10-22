-- 0131 — Church billing through Stripe: card checkout AND invoicing, one webhook.
--
-- 0116 left `church_billing` as a one-column ledger (the subscription id) and
-- said "a future Stripe webhook should call the same thing". It cannot call the
-- same thing: `admin_set_church_package` opens with `require_admin()`, which
-- reads auth.uid(), and a webhook has no user. So the webhook gets its OWN
-- writer, and it is locked to service_role — the `grant_skins` / `fulfill_skin`
-- shape, revoked from public, anon AND authenticated (the 0052 lesson: revoking
-- public alone leaves Supabase's named grants standing).
--
-- What a church pays for is still ONE boolean, `churches.verified`, which every
-- church-package RPC already reads. Billing is bookkeeping around it. Three
-- rules decide the boolean, and all three live here rather than in the
-- function, so a second caller can never disagree with the first:
--
--   • active / trialing / past_due ⇒ verified. past_due is Stripe still
--     retrying (or an invoice waiting on a church treasurer's cheque); pulling
--     the verse out from under a congregation on the first failed retry is
--     the wrong default.
--   • canceled / unpaid / incomplete_expired / paused ⇒ NOT verified, and only
--     if the subscription that ended is the one on file. An old subscription's
--     late cancellation must never switch off a church that has since paid
--     again under a new one.
--   • incomplete (a checkout that was opened and never finished) ⇒ no change.
--
-- The CONTENT GENERATION add-on is the same switch the operator flips
-- (`church_addons.content_generation`, 0127_church_content_generation), so the
-- feature reads one flag however it was granted. Billing only ever turns OFF
-- an add-on that billing turned ON (`church_billing.content_addon` remembers
-- which), so a Founding Church granted the add-on by hand during the pilot
-- keeps it until an operator says otherwise.
--
-- Un-verifying deletes nothing: the verse and notice tools freeze, the church
-- falls back to the global verse, and paying again turns it all back on.
--
-- The checkout link is a per-church TOKEN rather than the church id, because
-- a link that named a church could be used by anyone to open a checkout for
-- any church. The token is made by an operator (`admin_church_billing_link`),
-- lives only in this table (no client policy), and is read by the function
-- with the service role. It is stable: the same church always gets the same
-- link, so an email sent in October still works in March.

alter table public.church_billing alter column stripe_subscription_id drop not null;
alter table public.church_billing add column if not exists billing_token text unique;
alter table public.church_billing add column if not exists stripe_customer_id text;
alter table public.church_billing add column if not exists status text;
alter table public.church_billing add column if not exists plan_interval text;
alter table public.church_billing add column if not exists content_addon boolean not null default false;
alter table public.church_billing add column if not exists collection_method text;
alter table public.church_billing add column if not exists current_period_end timestamptz;

-- Operator: the church's billing link token, made once and reused.
create or replace function public.admin_church_billing_link(p_church_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_token text;
begin
  perform public.require_admin();
  if not exists (select 1 from public.churches where id = p_church_id) then
    return jsonb_build_object('ok', false, 'reason', 'no_church');
  end if;
  select billing_token into v_token from public.church_billing where church_id = p_church_id;
  if v_token is null then
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    insert into public.church_billing (church_id, billing_token, updated_at)
    values (p_church_id, v_token, now())
    on conflict (church_id) do update set billing_token = excluded.billing_token, updated_at = now();
  end if;
  return jsonb_build_object('ok', true, 'token', v_token);
end;
$$;

grant execute on function public.admin_church_billing_link(uuid) to authenticated;

-- Webhook: record what Stripe says about a church's subscription, and set
-- `verified` from it by the rules in the header.
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
    update public.churches set verified = false where id = p_church_id;
    if coalesce(v_prev_addon, false) then
      update public.church_addons set content_generation = false, updated_at = now(), updated_by = null
       where church_id = p_church_id;
    end if;
    return jsonb_build_object('ok', true, 'verified', false);
  end if;

  return jsonb_build_object('ok', true, 'unchanged', true);
end;
$$;

revoke all on function public.billing_apply_subscription(uuid, text, text, text, text, boolean, text, timestamptz) from public, anon, authenticated;
grant execute on function public.billing_apply_subscription(uuid, text, text, text, text, boolean, text, timestamptz) to service_role;
