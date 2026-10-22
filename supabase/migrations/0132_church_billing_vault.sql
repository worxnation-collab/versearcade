-- 0132 — The church-billing webhook's signing secret, read out of Vault.
--
-- Same shape as tiktok_ayrshare_key (0101) and the rest: the secret itself was
-- written with vault.create_secret('…', 'stripe_church_webhook_secret') from a
-- SQL console and is in no file; this function hands it to the Edge Function,
-- which prefers a STRIPE_CHURCH_WEBHOOK_SECRET function secret and falls back
-- to it. service_role only — revoked from public, anon AND authenticated (the
-- 0052 lesson), so the anon key that ships in the bundle cannot read it.

create or replace function public.stripe_church_webhook_secret()
returns text
language sql
security definer set search_path = public
as $$
  select s.decrypted_secret
  from vault.decrypted_secrets s
  where s.name = 'stripe_church_webhook_secret'
  order by s.created_at desc
  limit 1
$$;

revoke all on function public.stripe_church_webhook_secret() from public, anon, authenticated;
grant execute on function public.stripe_church_webhook_secret() to service_role;
