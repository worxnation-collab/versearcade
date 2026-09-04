-- 0101: the Ayrshare key for the tiktok-gen Edge Function, read out of Vault.
--
-- Ayrshare is the posting service in front of TikTok, YouTube, Facebook and
-- Instagram: the four accounts are connected once in its dashboard, and the
-- function's `post` action hands it a public video URL and per-platform copy.
-- Same shape as 0097 (the Gemini key): the function prefers the
-- AYRSHARE_API_KEY Edge Function secret and falls back to this. The secret
-- itself is NOT in this migration — it is written once with
-- vault.create_secret(...) and never lives in the tree.
--
-- ACL is the locked-down `grant_skins` shape: service_role only. Both named
-- roles are revoked explicitly (the 0052 scar). Verify with:
--   select proacl from pg_proc where proname = 'tiktok_ayrshare_key';
-- which must read {postgres=X/postgres,service_role=X/postgres} and nothing else.

create extension if not exists supabase_vault;

create or replace function public.tiktok_ayrshare_key()
returns text
language sql
security definer
set search_path = public
as $$
  select s.decrypted_secret
  from vault.decrypted_secrets s
  where s.name = 'AYRSHARE_API_KEY'
  order by s.created_at desc
  limit 1
$$;

revoke all on function public.tiktok_ayrshare_key() from public, anon, authenticated;
grant execute on function public.tiktok_ayrshare_key() to service_role;
