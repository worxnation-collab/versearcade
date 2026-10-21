-- 0125 — the API.Bible key for the `bible-text` Edge Function, read out of
-- Vault. Same shape as tiktok_gemini_key() (0097): the function prefers an
-- API_BIBLE_API_KEY function secret and falls back to this.
--
-- The key itself is NOT in this file. It is written once from a SQL console:
--   select vault.create_secret('<key>', 'API_BIBLE_API_KEY');
--
-- service_role only — revoked from the named roles too, because Supabase's
-- default privileges grant anon/authenticated directly (the 0052 lesson).

create extension if not exists supabase_vault;

create or replace function public.api_bible_key()
returns text
language sql
security definer
set search_path = public
as $$
  select s.decrypted_secret
  from vault.decrypted_secrets s
  where s.name = 'API_BIBLE_API_KEY'
  order by s.created_at desc
  limit 1
$$;

revoke all on function public.api_bible_key() from public, anon, authenticated;
grant execute on function public.api_bible_key() to service_role;
