-- 0133 — The church-billing function's Stripe key, read out of Vault.
--
-- 0132's shape exactly. The key is a RESTRICTED one (rk_live_…: Customers,
-- Subscriptions and Checkout Sessions, write), written with
-- vault.create_secret('…', 'stripe_church_secret_key') and in no file; a
-- leaked copy can open a checkout and nothing else — it cannot refund, pay
-- out or read the rest of the account. service_role only, revoked from
-- public, anon AND authenticated (the 0052 lesson).

create or replace function public.stripe_church_secret_key()
returns text
language sql
security definer set search_path = public
as $$
  select s.decrypted_secret
  from vault.decrypted_secrets s
  where s.name = 'stripe_church_secret_key'
  order by s.created_at desc
  limit 1
$$;

revoke all on function public.stripe_church_secret_key() from public, anon, authenticated;
grant execute on function public.stripe_church_secret_key() to service_role;
