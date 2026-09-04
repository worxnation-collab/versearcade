-- 0102: the headless runner's token for the tiktok-gen Edge Function, read
-- out of Vault.
--
-- scripts/tiktok-daily.mjs makes the day's three posts from GitHub Actions
-- with nobody signed in. It needed SOME credential the function would take
-- as the admin, and the obvious one — the service-role key — is the key that
-- can do anything to this project, which is far too much to hand a CI
-- secret whose whole job is posting videos. So the runner carries a token
-- of its own: a random string written once with vault.create_secret(...)
-- under the name TIKTOK_RUNNER_TOKEN, sent as the `x-runner-token` header
-- (the Authorization header stays the anon key so the gateway's JWT check
-- passes), and compared by the function against this. A leaked token can
-- make TikTok posts and nothing else, and rotating it is a new Vault row —
-- the function reads the newest.
--
-- Same shape as 0097 and 0101: service_role only, both named roles revoked
-- explicitly (the 0052 scar). The secret itself is NOT in this migration.
-- Verify with:
--   select proacl from pg_proc where proname = 'tiktok_runner_token';
-- which must read {postgres=X/postgres,service_role=X/postgres} and nothing else.

create extension if not exists supabase_vault;

create or replace function public.tiktok_runner_token()
returns text
language sql
security definer
set search_path = public
as $$
  select s.decrypted_secret
  from vault.decrypted_secrets s
  where s.name = 'TIKTOK_RUNNER_TOKEN'
  order by s.created_at desc
  limit 1
$$;

revoke all on function public.tiktok_runner_token() from public, anon, authenticated;
grant execute on function public.tiktok_runner_token() to service_role;
