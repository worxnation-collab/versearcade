-- 0154 part 2 — the Monday digest's clock. docs/CHURCH-DIGEST.md.
--
-- pg_cron is already on this project; pg_net is what lets it call a function.
-- The job posts to `church-digest` every hour from Sunday to Tuesday UTC — a
-- church's Monday 08:00 falls somewhere in that span in every time zone — and
-- the function's `church_digest_due` decides who is actually owed one, once a
-- week each. A quiet hour is one cheap read that sends nothing.
--
-- The token the job sends is made here at random and lives only in Vault
-- (DIGEST_CRON_TOKEN); the function compares it as a digest. Nothing secret
-- is in this file. Re-running is a no-op: the secret is created once and
-- `cron.schedule` replaces a job of the same name.

create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'DIGEST_CRON_TOKEN') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'DIGEST_CRON_TOKEN',
                                'church-digest weekly run (0154)');
  end if;
end $$;

select cron.schedule(
  'church-digest-monday',
  '7 * * * 0,1,2',
  $cron$
    select net.http_post(
      url := 'https://visuppaucpzzigwtqmdd.supabase.co/functions/v1/church-digest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-digest-token', (select decrypted_secret from vault.decrypted_secrets where name = 'DIGEST_CRON_TOKEN')),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000);
  $cron$
);
