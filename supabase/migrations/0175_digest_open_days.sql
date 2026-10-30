-- 0175: the Tuesday digest names the days ahead with no church verse.
--
-- `church_digest_build` restated from 0154 (production's body checked equal to
-- the file, comments aside, before this was written) with ONE more key,
-- `scheduled`: the dates in the next six days that carry a live verse. The
-- digest's builder (`openDaysRow` in church-digest/home.ts, which Home imports
-- too) turns that into "Nothing scheduled for tomorrow" / "3 days this week
-- have no church verse", so the email and the dashboard can never disagree
-- about which days are empty. Same signature, same grants; idempotent.

create or replace function public.church_digest_build(p_church_id uuid, p_user_id uuid, p_local_date date default null)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_prev_sub    text := current_setting('request.jwt.claim.sub', true);
  v_prev_claims text := current_setting('request.jwt.claims', true);
  v_today date;
  v_gate  text;
  v_gen   boolean;
  v_jobs  jsonb := '[]'::jsonb;
  v_ap    jsonb;
  v_range jsonb;
  v_inq   jsonb;
  v_ins   jsonb;
  v_drafts jsonb := '[]'::jsonb;
  v_scheduled jsonb := '[]'::jsonb;
  v_quiet int := 0;
  v_name  text;
  v_out   jsonb;
begin
  if p_church_id is null or p_user_id is null then return jsonb_build_object('ok', false, 'reason', 'bad_input'); end if;
  v_today := coalesce(p_local_date, (now() at time zone public.church_digest_tz(p_church_id))::date);
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);

  v_gate := public.church_admin_can(p_church_id);
  if v_gate <> 'ok' then
    v_out := jsonb_build_object('ok', false, 'reason', v_gate);
  else
    select name into v_name from public.churches where id = p_church_id;
    -- Home reads the sermon weeks and Autopilot only with Content Generation.
    v_gen := public.church_gen_can(p_church_id) = 'ok';
    if v_gen then
      v_jobs := coalesce(public.church_auto_weeks(p_church_id) -> 'jobs', '[]'::jsonb);
      v_ap := public.church_autopilot(p_church_id);
    end if;
    -- The planner's window: three weeks from today (Home's `fetchDays`).
    v_range := public.church_verses_range(p_church_id, v_today, 21);
    select coalesce(jsonb_agg(jsonb_build_object(
             'date', d ->> 'drop_date',
             'flagged', (select count(*) from jsonb_array_elements(coalesce(d -> 'questions', '[]'::jsonb)) q
                          where q ->> 'check' = 'true'))
             order by d ->> 'drop_date'), '[]'::jsonb)
      into v_drafts
      from jsonb_array_elements(coalesce(v_range -> 'days', '[]'::jsonb)) d
     where d ->> 'status' = 'draft';
    -- 0175: the next six days that have a LIVE verse (approved or published —
    -- never a draft). The open days are worked out by the builder, which also
    -- words Home's row, so the email and the dashboard name the same days.
    select coalesce(jsonb_agg(d ->> 'drop_date' order by d ->> 'drop_date'), '[]'::jsonb)
      into v_scheduled
      from jsonb_array_elements(coalesce(v_range -> 'days', '[]'::jsonb)) d
     where d ->> 'status' <> 'draft'
       and (d ->> 'drop_date')::date > v_today
       and (d ->> 'drop_date')::date <= v_today + 6;
    v_inq := public.church_join_inquiry_list(p_church_id);
    v_ins := public.church_leader_insights(p_church_id, v_today);
    -- Home's quiet row: members (never leaders) whose last play is over six days back.
    select count(*) into v_quiet
      from jsonb_array_elements(coalesce(v_ins -> 'roster', '[]'::jsonb)) m
     where coalesce((m ->> 'leader')::boolean, false) = false
       and (m ->> 'last_played_on' is null or (m ->> 'last_played_on')::date < v_today - 6);

    v_out := jsonb_build_object(
      'ok', true,
      'church_name', v_name,
      'today', v_today,
      -- The jobs as church_auto_weeks returns them; the function picks the current one.
      'jobs', v_jobs,
      'autopilot_skipped', coalesce((v_ap ->> 'ok')::boolean, false)
                           and coalesce((v_ap ->> 'enabled')::boolean, false)
                           and v_ap ->> 'state' = 'no_source',
      'drafts', v_drafts,
      'scheduled', v_scheduled,
      'inquiries', jsonb_array_length(coalesce(v_inq -> 'inquiries', '[]'::jsonb)),
      'quiet', v_quiet);
  end if;

  perform set_config('request.jwt.claim.sub', coalesce(v_prev_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(v_prev_claims, ''), true);
  return v_out;
end; $$;

revoke all on function public.church_digest_build(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.church_digest_build(uuid, uuid, date) to service_role;
