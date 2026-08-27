-- APNs/FCM device tokens — the native half of push.
--
-- push_subscriptions (0037) is Web-Push shaped: an endpoint URL plus p256dh/auth
-- keys, which is what a browser's PushManager hands you. A native device gives
-- you a single opaque token string and nothing else, so it does not fit that
-- table and gets its own rather than three nullable columns bolted onto one.
--
-- This is groundwork, not a live feature. Delivery still needs the Apple-side
-- pieces listed in docs/NATIVE-PUSH.md — an APNs key, the Push Notifications
-- capability on the App ID, and the aps-environment entitlement — none of which
-- can be done from a repo. Until those exist nothing writes here, which is why
-- registerPush() is deliberately not called on startup: firing the OS
-- permission prompt for notifications that cannot be delivered would burn the
-- one chance iOS gives you to ask.

create table if not exists public.device_tokens (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  token       text not null unique,
  platform    text not null check (platform in ('ios', 'android')),
  -- 'development' (sandbox) or 'production'. APNs routes to a different host
  -- per environment and a sandbox token 400s against the production one, so the
  -- sender has to know which build produced this token.
  environment text not null default 'production'
                check (environment in ('development', 'production')),
  app_version text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists device_tokens_profile_idx on public.device_tokens (profile_id);

alter table public.device_tokens enable row level security;

-- Same shape as push_subscriptions: a user can see their own rows; the sender
-- reads every row with the service role and so needs no policy of its own.
drop policy if exists "own device tokens" on public.device_tokens;
create policy "own device tokens" on public.device_tokens
  for select using (profile_id = auth.uid());

-- Upsert keyed on the token. iOS reissues a token on reinstall and can move it
-- between accounts on a shared device, so claiming it for the current user is
-- correct — the previous owner's row would be dead anyway.
create or replace function public.save_device_token(
  p_token text,
  p_platform text,
  p_environment text default 'production',
  p_app_version text default null
) returns void language plpgsql security definer set search_path to 'public' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if coalesce(btrim(p_token), '') = '' or length(p_token) > 512 then
    raise exception 'invalid token';
  end if;
  if p_platform not in ('ios', 'android') then raise exception 'invalid platform'; end if;
  if coalesce(p_environment, 'production') not in ('development', 'production') then
    raise exception 'invalid environment';
  end if;

  insert into public.device_tokens (profile_id, token, platform, environment, app_version)
  values (uid, btrim(p_token), p_platform, coalesce(p_environment, 'production'),
          left(coalesce(p_app_version, ''), 32))
  on conflict (token) do update
    set profile_id  = excluded.profile_id,
        platform    = excluded.platform,
        environment = excluded.environment,
        app_version = excluded.app_version,
        updated_at  = now();
end;
$$;

create or replace function public.delete_device_token(p_token text)
returns void language sql security definer set search_path to 'public' as $$
  delete from public.device_tokens
  where token = p_token and profile_id = auth.uid();
$$;

grant execute on function public.save_device_token(text, text, text, text) to authenticated;
grant execute on function public.delete_device_token(text) to authenticated;

notify pgrst, 'reload schema';
