-- Web Push subscriptions. Each row is one browser/device that opted in to
-- notifications, tied to the signed-in profile. The endpoint (a push-service
-- URL) is globally unique, so an upsert keyed on it keeps re-subscribes idempotent.
--
-- Reads/writes for a user's own rows go through RLS + SECURITY DEFINER RPCs.
-- The push-send Edge Function reads every row using the service role (bypasses
-- RLS), so no broad select policy is needed here.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_profile_idx on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;

-- A user can see (and thus manage) only their own subscriptions.
drop policy if exists "own push subs" on public.push_subscriptions;
create policy "own push subs" on public.push_subscriptions
  for select using (profile_id = auth.uid());

-- Upsert a subscription for the current user. Keyed on endpoint so a browser
-- that re-subscribes (or a subscription that migrates between accounts on the
-- same device) updates in place instead of duplicating.
create or replace function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null
) returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update
    set profile_id = excluded.profile_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent;
end;
$$;

-- Remove a subscription (user turned notifications off / browser unsubscribed).
create or replace function public.delete_push_subscription(p_endpoint text)
returns void language sql security definer set search_path to 'public' as $$
  delete from public.push_subscriptions
  where endpoint = p_endpoint and profile_id = auth.uid();
$$;

grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;

notify pgrst, 'reload schema';
