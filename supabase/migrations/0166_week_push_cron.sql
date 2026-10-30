-- 0166 part 2: every hour at :05, push-send's `weekly` action sends the
-- Sunday line to whoever's usual hour it now is. Same credentials as 0164's
-- flush: the public anon key for verify_jwt and PUSH_CRON_TOKEN.
select cron.schedule(
  'push-week-hourly',
  '5 * * * *',
  $cron$
    select net.http_post(
      url := 'https://visuppaucpzzigwtqmdd.supabase.co/functions/v1/push-send',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'AUTOPILOT_CRON_ANON_KEY'), ''),
        'x-push-token', (select decrypted_secret from vault.decrypted_secrets where name = 'PUSH_CRON_TOKEN')),
      body := '{"action":"weekly"}'::jsonb,
      timeout_milliseconds := 60000);
  $cron$
);
