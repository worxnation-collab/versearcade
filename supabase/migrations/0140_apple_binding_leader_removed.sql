-- 0140 — A leader who stops being leadership stops verifying the church.
--
-- 0139 binds an Apple subscription to ONE church, for the leader whose Apple
-- ID pays for it. Nothing ended that binding when the leader was removed, so a
-- removed leader's subscription went on verifying a church they no longer
-- lead, renewal after renewal, until it lapsed by itself.
--
-- The rule is now that a binding lives exactly as long as the leadership row
-- it stands on. It is enforced by TRIGGERS rather than inside the one RPC that
-- revokes leadership (`admin_revoke_church_admin`, 0079), because that RPC is
-- not the only way a leadership row goes: erasing an account and erasing a
-- church both take it by cascade, and a trigger is the one place all three
-- paths meet. The triggers themselves are 0140b, kept apart for the MCP.
--
-- What ending a binding does, and deliberately does not do:
--   • It goes through `billing_apply_apple` with `p_live = false` — the SAME
--     branch a lapsed subscription takes — so the two can never disagree: the
--     row is marked expired, and the church is un-verified only if Apple is
--     what verified it (`granted_verified`) and no live Stripe subscription is
--     holding it. An operator-verified or card-paying church stays verified.
--   • It does NOT cancel the Apple subscription. That belongs to the Apple ID
--     and only its owner can cancel it, in Settings. The subscription simply
--     stops verifying anything, and a removed leader cannot re-bind it: the
--     live branch of `billing_apply_apple` refuses anybody not in
--     `church_admins`, and the re-sync in iap-fulfill / revenuecat-webhook
--     reads ACTIVE bindings only.
--   • It keeps the row, as history, exactly as a lapse does.
--
-- And the account-erasure case: 0139b cascades a binding away with its
-- profile, which would have taken `granted_verified` with it and left the
-- church verified for good. The second function applies the same rule to a
-- binding row that disappears while still active.

-- Leadership row gone ⇒ that user's binding to that church ends.
create or replace function public.church_admin_gone_end_apple()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.billing_apply_apple(old.church_id, old.user_id, '', null, false, null);
  return old;
end;
$$;

revoke all on function public.church_admin_gone_end_apple() from public, anon, authenticated;

-- An ACTIVE binding row gone (account or church erased) ⇒ the same rule.
create or replace function public.church_apple_binding_gone()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if old.status = 'active' and old.granted_verified
     and not public.church_stripe_live(old.church_id) then
    update public.churches set verified = false where id = old.church_id;
  end if;
  return old;
end;
$$;

revoke all on function public.church_apple_binding_gone() from public, anon, authenticated;
