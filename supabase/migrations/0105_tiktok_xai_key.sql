-- 0105: the xAI (Grok) key for the tiktok-gen Edge Function's comment
-- replier, read out of Vault.
--
-- The `replies` action reads the comments under a challenge post through
-- Ayrshare, has Grok draft a one-line reply to each ANSWER-shaped comment
-- (whether they got it, the right answer, the teach line), and posts it
-- through Ayrshare. Grok rather than Gemini because the operator holds xAI
-- credits; same key shape as 0097/0101/0104: the function prefers the
-- XAI_API_KEY function secret and falls back to this. The secret itself is
-- NOT in this migration — written once with vault.create_secret(...) and
-- never in the tree.
--
-- ACL is the locked-down `grant_skins` shape: service_role only, both named
-- roles revoked explicitly (the 0052 scar). Verify with:
--   select proname, proacl from pg_proc where proname = 'tiktok_xai_key';
-- which must read {postgres=X/postgres,service_role=X/postgres} and nothing else.

create extension if not exists supabase_vault;

create or replace function public.tiktok_xai_key()
returns text
language sql
security definer
set search_path = public
as $$
  select s.decrypted_secret
  from vault.decrypted_secrets s
  where s.name = 'XAI_API_KEY'
  order by s.created_at desc
  limit 1
$$;

revoke all on function public.tiktok_xai_key() from public, anon, authenticated;
grant execute on function public.tiktok_xai_key() to service_role;
