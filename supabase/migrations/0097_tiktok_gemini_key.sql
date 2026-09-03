-- 0097: the Gemini key for the tiktok-gen Edge Function, read out of Vault.
--
-- The function prefers the GEMINI_API_KEY Edge Function secret. When that is
-- not set it asks for this instead, which lets the key be stored from a SQL
-- console (Vault, encrypted at rest) rather than only from the dashboard's
-- secrets page. The secret itself is NOT in this migration — it is written
-- once with vault.create_secret(...) and never lives in the tree.
--
-- ACL is the locked-down `grant_skins` shape: service_role only. Revoking
-- from PUBLIC alone leaves the anon/authenticated default grants standing
-- (the 0052 scar), so both named roles are revoked explicitly. Verify with:
--   select proacl from pg_proc where proname = 'tiktok_gemini_key';
-- which must read {postgres=X/postgres,service_role=X/postgres} and nothing else.

create extension if not exists supabase_vault;

create or replace function public.tiktok_gemini_key()
returns text
language sql
security definer
set search_path = public
as $$
  select s.decrypted_secret
  from vault.decrypted_secrets s
  where s.name = 'GEMINI_API_KEY'
  order by s.created_at desc
  limit 1
$$;

revoke all on function public.tiktok_gemini_key() from public, anon, authenticated;
grant execute on function public.tiktok_gemini_key() to service_role;
