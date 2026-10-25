-- 0145 — the Custom Leader Avatar is bought on Stripe, not only granted by hand.
--
-- 0136 made `church_addons.custom_leader_avatar` the one flag that says a
-- church holds the add-on, set by the operator toggle. This adds the second
-- writer: the church-billing webhook, after Stripe says a one-time $79
-- Checkout Session (mode 'payment', price "Custom Leader Avatar",
-- prod_VVGkrkRfTdTZCo) is PAID. Same flag, so `church_entitlements` reads one
-- answer however it was granted.
--
-- The client never reaches this. It is service_role only — the
-- `billing_apply_subscription` (0131) shape — and the webhook only calls it
-- after verifying Stripe's signature. The session id is kept on the row so an
-- operator can find the payment to refund, and a webhook retry of the same
-- session is a no-op.
--
-- It does NOT require the church to be verified at grant time: the checkout
-- already required verified leadership, and refusing here would take the money
-- and give nothing if verification lapsed in between. `church_entitlements`
-- still reports the add-on as live only on a verified church (0136), and as
-- "held" otherwise, exactly like an operator grant.

alter table public.church_addons add column if not exists custom_avatar_session text;

create or replace function public.billing_grant_custom_avatar(p_church_id uuid, p_session_id text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_had boolean;
  v_session text;
begin
  if p_church_id is null or p_session_id is null or p_session_id !~ '^cs_[A-Za-z0-9_]{8,200}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_input');
  end if;
  if not exists (select 1 from public.churches where id = p_church_id) then
    return jsonb_build_object('ok', false, 'reason', 'no_church');
  end if;

  select custom_leader_avatar, custom_avatar_session into v_had, v_session
    from public.church_addons where church_id = p_church_id for update;
  if coalesce(v_session, '') = p_session_id then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  insert into public.church_addons (church_id, custom_leader_avatar, custom_avatar_session, updated_at, updated_by)
  values (p_church_id, true, p_session_id, now(), null)
  on conflict (church_id) do update
    set custom_leader_avatar = true,
        custom_avatar_session = excluded.custom_avatar_session,
        updated_at = now(),
        updated_by = null;
  -- `had` true means the church already held it (an operator grant, or a
  -- second payment): the operator queue should look at a refund.
  return jsonb_build_object('ok', true, 'had', coalesce(v_had, false));
end;
$$;
revoke all on function public.billing_grant_custom_avatar(uuid, text) from public, anon, authenticated;
grant execute on function public.billing_grant_custom_avatar(uuid, text) to service_role;
