-- 0135 — A church's own leadership can see its plan and open Stripe's billing
-- portal, so a church that claimed itself (0134) can cancel or change its card
-- without emailing anybody.
--
-- `my_church_billing` is the dashboard's one read: whether the church has a
-- live Stripe subscription, its status, interval, whether the add-on rides on
-- it, how it is collected and when the period (or the Founding trial) ends.
-- Never the customer id or the subscription id — those stay server-side, and
-- the portal session is opened by the church-billing Edge Function, which looks
-- the customer up itself with the service role.
--
-- Gated on a `church_admins` row for THAT church, not on `church_admin_can`:
-- that check also wants the church verified, and a church whose card failed
-- (past_due, still verified) or whose payment lapsed is exactly the church that
-- most needs to reach its billing. A member, a stranger or another church's
-- leadership gets `not_leadership`.
--
-- `subscribed` is true only for a live subscription WITH a Stripe customer, so
-- a church verified by hand (an operator grant, a manual invoice outside
-- Stripe) reads false and its dashboard shows nothing new.

create or replace function public.my_church_billing(p_church_id uuid)
returns jsonb
language plpgsql
stable security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  b public.church_billing%rowtype;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.church_admins where church_id = p_church_id and user_id = uid) then
    return jsonb_build_object('ok', false, 'reason', 'not_leadership');
  end if;
  select * into b from public.church_billing where church_id = p_church_id;
  if not found then
    return jsonb_build_object('ok', true, 'subscribed', false);
  end if;
  return jsonb_build_object(
    'ok', true,
    'subscribed', b.stripe_customer_id is not null and b.status in ('active', 'trialing', 'past_due'),
    'status', b.status,
    'interval', b.plan_interval,
    'addon', b.content_addon,
    'collection_method', b.collection_method,
    'period_end', b.current_period_end
  );
end;
$$;

revoke all on function public.my_church_billing(uuid) from public, anon;
grant execute on function public.my_church_billing(uuid) to authenticated;

notify pgrst, 'reload schema';
