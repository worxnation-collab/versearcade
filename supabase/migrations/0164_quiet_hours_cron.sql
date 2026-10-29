-- 0164 part 2: the morning run. Every fifteen minutes push-send's `flush`
-- action sends what quiet hours held back. Same shape as 0158: the request
-- carries the public anon key for verify_jwt (Vault AUTOPILOT_CRON_ANON_KEY,
-- already there) and a random PUSH_CRON_TOKEN made here, which push-send
-- compares before it claims anything.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'PUSH_CRON_TOKEN') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'PUSH_CRON_TOKEN',
                                'push-send deferred flush (0164)');
  end if;
end $$;

-- cron.schedule replaces a job of the same name, so a re-run is a no-op.
select cron.schedule(
  'push-deferred-flush',
  '*/15 * * * *',
  $cron$
    select net.http_post(
      url := 'https://visuppaucpzzigwtqmdd.supabase.co/functions/v1/push-send',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'AUTOPILOT_CRON_ANON_KEY'), ''),
        'x-push-token', (select decrypted_secret from vault.decrypted_secrets where name = 'PUSH_CRON_TOKEN')),
      body := '{"action":"flush"}'::jsonb,
      timeout_milliseconds := 60000);
  $cron$
);
