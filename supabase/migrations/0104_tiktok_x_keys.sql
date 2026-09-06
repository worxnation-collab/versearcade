-- 0104: the X developer app's consumer key and secret for the tiktok-gen
-- Edge Function, read out of Vault.
--
-- Since 2026-03-31 Ayrshare no longer posts to X with keys of its own: every
-- account registers its own X developer app, and the app's API Key and API
-- Secret travel as two headers (X-Twitter-OAuth1-Api-Key /
-- X-Twitter-OAuth1-Api-Secret) on EVERY Ayrshare request that targets X —
-- a post, a status read, an analytics read. Ayrshare stores neither, so the
-- function has to carry them, and it carries them the way it carries the
-- Ayrshare key itself (0101): preferring the X_API_KEY / X_API_SECRET
-- function secrets and falling back to these. The secrets are NOT in this
-- migration — written once with vault.create_secret(...) and never in the
-- tree.
--
-- ACL is the locked-down `grant_skins` shape: service_role only, both named
-- roles revoked explicitly (the 0052 scar). Verify with:
--   select proname, proacl from pg_proc where proname like 'tiktok_x_%';
-- which must read {postgres=X/postgres,service_role=X/postgres} and nothing else.

create extension if not exists supabase_vault;

create or replace function public.tiktok_x_api_key()
returns text
language sql
security definer
set search_path = public
as $$
  select s.decrypted_secret
  from vault.decrypted_secrets s
  where s.name = 'X_API_KEY'
  order by s.created_at desc
  limit 1
$$;

create or replace function public.tiktok_x_api_secret()
returns text
language sql
security definer
set search_path = public
as $$
  select s.decrypted_secret
  from vault.decrypted_secrets s
  where s.name = 'X_API_SECRET'
  order by s.created_at desc
  limit 1
$$;

revoke all on function public.tiktok_x_api_key() from public, anon, authenticated;
revoke all on function public.tiktok_x_api_secret() from public, anon, authenticated;
grant execute on function public.tiktok_x_api_key() to service_role;
grant execute on function public.tiktok_x_api_secret() to service_role;
