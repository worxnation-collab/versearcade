-- Stripe auto-fulfillment. The webhook edge function calls fulfill_skin() with
-- the parsed checkout session; it records the purchase (idempotent by session
-- id), resolves the buyer (by the client_reference_id username, else email), and
-- grants the paid skin server-side. Only the service role can call it.

create table if not exists public.skin_purchases (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text unique not null,
  user_id uuid references public.profiles(id) on delete set null,
  username text,
  email text,
  skin text,
  granted boolean not null default false,
  reason text,
  created_at timestamptz not null default now()
);
alter table public.skin_purchases enable row level security;

create or replace function public.fulfill_skin(
  p_session text, p_username text, p_skin text, p_email text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  paid text[] := array['moses','esther','elijah','whale','shades'];
begin
  -- Idempotency: a session is fulfilled at most once (Stripe retries webhooks).
  insert into public.skin_purchases(stripe_session_id, username, skin, email)
  values (p_session, nullif(lower(trim(coalesce(p_username,''))),''), p_skin, nullif(lower(trim(coalesce(p_email,''))),''))
  on conflict (stripe_session_id) do nothing;
  if not found then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  if p_skin is null or not (p_skin = any(paid)) then
    update public.skin_purchases set reason = 'bad_skin' where stripe_session_id = p_session;
    return jsonb_build_object('ok', false, 'reason', 'bad_skin');
  end if;

  -- Resolve the buyer: username first (from client_reference_id), else email.
  if length(coalesce(p_username,'')) > 0 then
    select id into v_uid from public.profiles where username = lower(trim(p_username));
  end if;
  if v_uid is null and length(coalesce(p_email,'')) > 0 then
    select p.id into v_uid from public.profiles p
      join auth.users u on u.id = p.id
      where lower(u.email) = lower(trim(p_email)) limit 1;
  end if;

  if v_uid is null then
    update public.skin_purchases set reason = 'user_not_found' where stripe_session_id = p_session;
    return jsonb_build_object('ok', false, 'reason', 'user_not_found');
  end if;

  -- Grant (the entitlement trigger allows paid skins when app.grant_ok is set).
  perform set_config('app.grant_ok', '1', true);
  update public.profiles
     set owned_skins = (select array(select distinct unnest(coalesce(owned_skins, array[]::text[]) || p_skin)))
   where id = v_uid;
  update public.skin_purchases set user_id = v_uid, granted = true, reason = 'granted' where stripe_session_id = p_session;
  return jsonb_build_object('ok', true, 'granted', true);
end $$;

revoke all on function public.fulfill_skin(text, text, text, text) from public, anon, authenticated;
grant execute on function public.fulfill_skin(text, text, text, text) to service_role;

-- Admin: recent purchases, for reconciling sales.
create or replace function public.admin_recent_purchases(p_limit int default 50)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'skin', s.skin, 'username', s.username, 'email', s.email,
      'granted', s.granted, 'reason', s.reason, 'created_at', s.created_at
    ) order by s.created_at desc)
    from (select * from public.skin_purchases order by created_at desc limit greatest(p_limit,1)) s
  ), '[]'::jsonb);
end $$;

grant execute on function public.admin_recent_purchases(int) to authenticated;

notify pgrst, 'reload schema';
