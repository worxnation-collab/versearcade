-- 0158 — Autopilot runs on a clock. docs/CHURCH-SHARED-VERSE.md → "Autopilot".
--
-- Until now the cutoff was noticed by the next visit from a church's
-- leadership (0152: "there is no cron"). A pastor who didn't open the app by
-- Monday night got nothing drafted, and the Tuesday digest (0154/0157) told
-- them so. pg_cron has existed since 0154, so the week now settles itself:
-- every hour the job below asks `church-draft` to run `autopilot_cron`, which
-- reads `church_autopilot_due()` and settles each due church exactly as a
-- leader's own visit would — the same claim (once per church per week, by a
-- primary key), the same fallback job, the same allowances and refunds, the
-- same blind answer check, drafts only. Nothing goes live without a person.
--
-- The one new idea is acting AS a leader with no session. The drafting path
-- calls five leadership RPCs as the caller; a clock has no caller. So
-- `church_rpc_as` runs exactly those five as a named leader — the
-- `church_digest_build` impersonation (0154), narrowed to an allowlist — and
-- every one of them still applies its own gate as that leader. It is
-- service_role only, and `church-draft` only ever names the leader that
-- `church_autopilot_due()` chose: one who currently passes the Content
-- Generation gate for that church.
--
-- Secrets: AUTOPILOT_CRON_TOKEN is made here at random and lives only in
-- Vault. The job also needs a JWT for the platform's verify_jwt gate; it sends
-- the project's PUBLIC legacy anon key (the same one shipped in every client
-- bundle), read from Vault as AUTOPILOT_CRON_ANON_KEY, which is written at
-- apply time rather than in this file. Without it the job sends nothing
-- useful and the visit-driven tick (0152) still works, so a fresh deploy
-- degrades to exactly the old behaviour. Re-running is a no-op.

-- ---------------------------------------------------------------------------
-- Run one allowlisted leadership RPC as p_user. Service role only.
-- ---------------------------------------------------------------------------
create or replace function public.church_rpc_as(p_user uuid, p_fn text, p_args jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_prev_sub    text := current_setting('request.jwt.claim.sub', true);
  v_prev_claims text := current_setting('request.jwt.claims', true);
  a   jsonb := coalesce(p_args, '{}'::jsonb);
  c   uuid;
  v   jsonb;
begin
  if p_user is null or p_fn is null then return jsonb_build_object('ok', false, 'reason', 'bad_input'); end if;
  c := (a->>'p_church_id')::uuid;
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);

  if p_fn = 'church_autopilot' then
    v := public.church_autopilot(c);
  elsif p_fn = 'church_verses_range' then
    v := public.church_verses_range(c, (a->>'p_from')::date, (a->>'p_days')::int);
  elsif p_fn = 'use_church_draft' then
    v := public.use_church_draft(c);
  elsif p_fn = 'use_church_draft_units' then
    v := public.use_church_draft_units(c, (a->>'p_units')::int);
  elsif p_fn = 'save_church_verse_draft' then
    v := public.save_church_verse_draft(c, (a->>'p_drop_date')::date, a->>'p_reference', a->>'p_text',
                                        a->'p_questions', a->>'p_series', a->>'p_note',
                                        coalesce((a->>'p_replace')::boolean, false));
  elsif p_fn = 'set_church_discussion' then
    v := public.set_church_discussion(c, (a->>'p_drop_date')::date, a->'p_questions',
                                      coalesce((a->>'p_generated')::boolean, false));
  else
    v := jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;

  perform set_config('request.jwt.claim.sub', coalesce(v_prev_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(v_prev_claims, ''), true);
  return v;
end; $$;
revoke all on function public.church_rpc_as(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.church_rpc_as(uuid, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- The churches whose week is due now, each with the leader it runs as: the
-- one who last set Autopilot if they still pass the Content Generation gate,
-- else the longest-standing leader who does. A church with no such leader is
-- left out (its add-on lapsed, or nobody leads it). Service role only.
-- ---------------------------------------------------------------------------
create or replace function public.church_autopilot_due()
returns table (church_id uuid, user_id uuid)
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_prev_sub    text := current_setting('request.jwt.claim.sub', true);
  v_prev_claims text := current_setting('request.jwt.claims', true);
  r   record;
  u   uuid;
  cand uuid;
begin
  for r in
    select a.church_id, a.updated_by from public.church_autopilot a
     where a.enabled and public.church_autopilot_state(a.church_id)->>'state' = 'due'
  loop
    u := null;
    for cand in
      select x.uid from (
        select r.updated_by as uid, 0 as ord, null::timestamptz as since where r.updated_by is not null
        union all
        select ca.user_id, 1, ca.granted_at from public.church_admins ca where ca.church_id = r.church_id
      ) x order by x.ord, x.since nulls first
    loop
      perform set_config('request.jwt.claim.sub', cand::text, true);
      perform set_config('request.jwt.claims', json_build_object('sub', cand, 'role', 'authenticated')::text, true);
      if public.church_gen_can(r.church_id) = 'ok' then u := cand; exit; end if;
    end loop;
    perform set_config('request.jwt.claim.sub', coalesce(v_prev_sub, ''), true);
    perform set_config('request.jwt.claims', coalesce(v_prev_claims, ''), true);
    if u is not null then
      church_id := r.church_id; user_id := u;
      return next;
    end if;
  end loop;
end; $$;
revoke all on function public.church_autopilot_due() from public, anon, authenticated;
grant execute on function public.church_autopilot_due() to service_role;

-- The cron's two Vault values, read by church-draft (the token) and by the
-- job itself (the anon key). Service role only.
create or replace function public.church_autopilot_secret(p_name text)
returns text
language sql stable security definer set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets
   where name = p_name and p_name = 'AUTOPILOT_CRON_TOKEN'
   limit 1;
$$;
revoke all on function public.church_autopilot_secret(text) from public, anon, authenticated;
grant execute on function public.church_autopilot_secret(text) to service_role;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'AUTOPILOT_CRON_TOKEN') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'AUTOPILOT_CRON_TOKEN',
                                'church-draft autopilot_cron run (0158)');
  end if;
end $$;

-- Every hour at :23 (a church's cutoff is on the minute it chose, and 0152's
-- default is 21:00, so a due week waits at most an hour). A quiet hour is one
-- cheap read in the function that drafts nothing.
select cron.schedule(
  'church-autopilot-hourly',
  '23 * * * *',
  $cron$
    select net.http_post(
      url := 'https://visuppaucpzzigwtqmdd.supabase.co/functions/v1/church-draft',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'AUTOPILOT_CRON_ANON_KEY'), ''),
        'x-autopilot-token', (select decrypted_secret from vault.decrypted_secrets where name = 'AUTOPILOT_CRON_TOKEN')),
      body := '{"mode":"autopilot_cron"}'::jsonb,
      timeout_milliseconds := 60000);
  $cron$
);
