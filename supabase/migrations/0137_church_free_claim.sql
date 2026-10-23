-- 0137 — A FREE claim for a church that already has a congregation here, and a
-- dashboard of totals for the leader who makes one.
--
-- 0134 let a church nobody leads claim itself by PAYING (card checkout, the
-- Founding trial). This adds the free door beside it, the owner's call
-- (2026-10-23): once a church page has at least THREE members, somebody on its
-- staff can claim it for nothing, proving who they are one of two ways —
--
--   • CARD ON FILE. A Stripe Checkout in SETUP mode (a SetupIntent, $0, nothing
--     charged, no subscription). The church-billing webhook calls
--     `billing_activate_free_claim` when the card is saved. Same identity
--     signal 0134 leans on, without a plan.
--   • MANUAL. Role, name, email and a phone number go to the operator's queue;
--     `admin_review_church_claim(id, 'approve')` makes them leadership. An email
--     whose domain matches the church's own website is FLAGGED for the
--     reviewer (`domain_match`) and is still reviewed — a flag, not a grant.
--
-- A free claim makes the claimant leadership (`church_admins`) and leaves the
-- church UNVERIFIED. That split already exists: an unverified church's leaders
-- have always had the notice (0117/0118 — one live line, shown on the church's
-- page) and nothing else; every per-member reader is gated on VERIFIED
-- leadership (`church_admin_can`). What is new for them is
-- `church_leader_summary`: members, active this week and the average current
-- streak — totals only, no names, no list of anybody.
--
-- Two hard rules, enforced in the shape of what the functions return rather
-- than in copy:
--
--   • NOBODY IS RANKED AGAINST ANYBODY. Neither reader here, nor the restated
--     `church_leader_insights`, orders members by anything they did.
--   • NO LIST OF WHO HAS NOT PLAYED. `church_leader_summary` returns no rows of
--     people at all. `church_leader_insights` (verified leadership only) keeps
--     its roster — names are the owner's 0128 call — but is restated here to
--     order it by JOIN DATE instead of by last play (which put everyone who had
--     stopped at the bottom, a list of the lapsed by construction) and to stop
--     tagging rows `active`, which the client turned into an "Active / Quiet"
--     filter. Per-member engagement (last play, streak, plays this week) still
--     reaches verified leadership of THAT church and nobody else.
--
-- Everything 0134 guarded still holds: only an unled church, first one to
-- finish wins and a later one is a 'conflict', five new claims per account per
-- day, every claim listed for the operator with one-tap revoke.
--
-- No foreign keys, no constraint rewrites, nothing removed: new columns with
-- defaults, so every 0134 row reads as tier 'paid', method 'card'.

alter table public.church_claims add column if not exists tier text not null default 'paid'
  check (tier in ('paid', 'free'));
alter table public.church_claims add column if not exists method text not null default 'card'
  check (method in ('card', 'manual'));
alter table public.church_claims add column if not exists phone text
  check (phone is null or char_length(phone) between 7 and 40);
alter table public.church_claims add column if not exists domain_match boolean not null default false;
alter table public.church_claims add column if not exists stripe_setup_intent_id text;

-- The free door opens at this many members. Mirrored by FREE_CLAIM_MIN_MEMBERS
-- in src/store/churchClaim.ts — the usual keep-them-in-sync pair.
create or replace function public.church_free_claim_min_members()
returns integer
language sql immutable
as $$ select 3 $$;

-- A bare host from whatever was typed into a church's website field:
-- 'https://www.Grace.org/about' → 'grace.org'.
create or replace function public.church_host_of(p_url text)
returns text
language sql immutable
as $$
  select nullif(regexp_replace(regexp_replace(regexp_replace(lower(btrim(coalesce(p_url, ''))),
    '^[a-z]+://', ''), '[/?#:].*$', ''), '^www\.', ''), '')
$$;

-- Does this email's domain belong to the church's own website? Exactly the
-- host or a subdomain of it (pastor@mail.grace.org for grace.org).
create or replace function public.church_email_domain_match(p_church_id uuid, p_email text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v_host text;
  v_dom text := lower(split_part(coalesce(p_email, ''), '@', 2));
begin
  select public.church_host_of(cp.website) into v_host from public.church_profiles cp where cp.church_id = p_church_id;
  if v_host is null or v_dom = '' then return false; end if;
  return v_dom = v_host or v_dom like '%.' || v_host;
end;
$$;

revoke all on function public.church_email_domain_match(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- What the claim screen asks first. 0134's keys unchanged; three added:
-- `members`, `free_ok` (the free door is open), and `my_pending` ('manual' when
-- the caller already has a manual claim waiting on review for this church).
-- ---------------------------------------------------------------------------
create or replace function public.church_self_claim_status(p_church_id uuid)
returns jsonb
language plpgsql
stable security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_members int;
  v_status text;
  v_pending text;
begin
  if not exists (select 1 from public.churches where id = p_church_id) then
    return jsonb_build_object('ok', true, 'status', 'not_found');
  end if;
  select count(*) into v_members from public.profiles where church_id = p_church_id;

  if uid is not null and exists (select 1 from public.church_admins where church_id = p_church_id and user_id = uid) then
    v_status := 'you_lead';
  elsif exists (select 1 from public.church_admins where church_id = p_church_id) then
    v_status := 'has_leader';
  elsif exists (select 1 from public.church_billing where church_id = p_church_id
                and status in ('active', 'trialing', 'past_due')) then
    v_status := 'paying';
  else
    v_status := 'open';
  end if;

  if uid is not null then
    select method into v_pending from public.church_claims
     where church_id = p_church_id and user_id = uid and tier = 'free' and method = 'manual' and status = 'pending'
     order by created_at desc limit 1;
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', v_status,
    'members', v_members,
    'free_ok', v_status = 'open' and v_members >= public.church_free_claim_min_members(),
    'my_pending', v_pending);
end;
$$;

grant execute on function public.church_self_claim_status(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The claimant, signed in: open a FREE claim. Grants nothing.
--   method 'card'   → a one-time token for the church-billing setup checkout
--   method 'manual' → waits on the operator; phone required
-- ---------------------------------------------------------------------------
create or replace function public.start_church_free_claim(
  p_church_id uuid,
  p_method text,
  p_role text,
  p_name text,
  p_email text,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_method text := lower(coalesce(p_method, ''));
  v_role text := left(btrim(regexp_replace(coalesce(p_role, ''), '[[:cntrl:]]+', ' ', 'g')), 60);
  v_name text := left(btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]+', ' ', 'g')), 120);
  v_email text := lower(left(btrim(coalesce(p_email, '')), 200));
  v_phone text := nullif(left(btrim(regexp_replace(coalesce(p_phone, ''), '[^0-9+()\-. x]', '', 'g')), 40), '');
  v_match boolean;
  v_token text;
  v_existing uuid;
  v_members int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if v_method not in ('card', 'manual') then
    return jsonb_build_object('ok', false, 'reason', 'bad_method');
  end if;
  if v_role = '' or v_name = '' or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_input');
  end if;
  if v_method = 'manual' and (v_phone is null or length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 7) then
    return jsonb_build_object('ok', false, 'reason', 'bad_phone');
  end if;
  if not exists (select 1 from public.churches where id = p_church_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if exists (select 1 from public.church_admins where church_id = p_church_id and user_id = uid) then
    return jsonb_build_object('ok', false, 'reason', 'you_lead');
  end if;
  if exists (select 1 from public.church_admins where church_id = p_church_id) then
    return jsonb_build_object('ok', false, 'reason', 'has_leader');
  end if;
  if exists (select 1 from public.church_billing where church_id = p_church_id
             and status in ('active', 'trialing', 'past_due')) then
    return jsonb_build_object('ok', false, 'reason', 'paying');
  end if;
  select count(*) into v_members from public.profiles where church_id = p_church_id;
  if v_members < public.church_free_claim_min_members() then
    return jsonb_build_object('ok', false, 'reason', 'too_few_members', 'members', v_members,
                              'needed', public.church_free_claim_min_members());
  end if;

  -- One pending free claim per person per church per method, reused; anything
  -- new counts toward 0134's five a day.
  select id into v_existing from public.church_claims
   where church_id = p_church_id and user_id = uid and status = 'pending' and tier = 'free' and method = v_method
   order by created_at desc limit 1;
  if v_existing is null and (
    select count(*) from public.church_claims where user_id = uid and created_at > now() - interval '1 day'
  ) >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  v_match := public.church_email_domain_match(p_church_id, v_email);
  -- A manual claim never hands out its token; the hash is only there to fill
  -- the unique column.
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  if v_existing is not null then
    update public.church_claims
       set token_hash = encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
           role = v_role, contact_name = v_name, email = v_email, phone = v_phone, domain_match = v_match
     where id = v_existing;
  else
    insert into public.church_claims (church_id, user_id, role, contact_name, email, phone, token_hash, tier, method, domain_match)
    values (p_church_id, uid, v_role, v_name, v_email, v_phone,
            encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), 'free', v_method, v_match);
  end if;

  if v_method = 'card' then
    return jsonb_build_object('ok', true, 'method', 'card', 'token', v_token);
  end if;
  return jsonb_build_object('ok', true, 'method', 'manual', 'domain_match', v_match);
end;
$$;

revoke all on function public.start_church_free_claim(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.start_church_free_claim(uuid, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The one writer both free paths share: make a pending free claim leadership,
-- unless somebody else already is. Not callable by any client.
-- ---------------------------------------------------------------------------
create or replace function public.church_grant_free_claim(p_claim_id uuid, p_church_id uuid, p_setup_intent_id text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  r public.church_claims%rowtype;
begin
  perform 1 from public.churches where id = p_church_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  select * into r from public.church_claims where id = p_claim_id for update;
  if not found or r.church_id <> p_church_id or r.tier <> 'free' then
    return jsonb_build_object('ok', false, 'reason', 'no_claim');
  end if;
  if r.status = 'active' then return jsonb_build_object('ok', true, 'already', true); end if;
  if r.status <> 'pending' then return jsonb_build_object('ok', false, 'reason', r.status); end if;

  if exists (select 1 from public.church_admins where church_id = p_church_id and user_id <> r.user_id) then
    update public.church_claims set status = 'conflict', stripe_setup_intent_id = p_setup_intent_id where id = r.id;
    return jsonb_build_object('ok', false, 'reason', 'conflict');
  end if;

  insert into public.church_admins (church_id, user_id, granted_by, note)
  values (p_church_id, r.user_id, case when r.method = 'manual' then auth.uid() end,
          'self-serve claim · free · ' || case when r.method = 'card' then 'card on file' else 'manual review' end || ' · ' || r.role)
  on conflict (church_id, user_id) do nothing;

  update public.profiles set church_id = p_church_id where id = r.user_id and church_id is null;

  update public.church_claims
     set status = 'active', activated_at = now(), stripe_setup_intent_id = p_setup_intent_id
   where id = r.id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.church_grant_free_claim(uuid, uuid, text) from public, anon, authenticated;

-- The webhook: a card saved by a setup checkout carrying a free CARD claim.
create or replace function public.billing_activate_free_claim(p_claim_id uuid, p_church_id uuid, p_setup_intent_id text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.church_claims where id = p_claim_id and tier = 'free' and method = 'card') then
    return jsonb_build_object('ok', false, 'reason', 'no_claim');
  end if;
  return public.church_grant_free_claim(p_claim_id, p_church_id, p_setup_intent_id);
end;
$$;

revoke all on function public.billing_activate_free_claim(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.billing_activate_free_claim(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Operator: every claim, with what the review needs. 0134's columns plus tier,
-- method, phone, the domain flag and how many members the church has now.
-- ---------------------------------------------------------------------------
create or replace function public.admin_church_claims(p_limit integer default 100)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.created_at desc)
    from (
      select k.id, k.church_id, c.name as church_name, c.city, c.region, pr.username,
             k.role, k.contact_name, k.email, k.status, k.stripe_subscription_id,
             k.created_at, k.activated_at, k.reviewed_at,
             k.tier, k.method, k.phone, k.domain_match, k.stripe_setup_intent_id,
             (select public.church_host_of(cp.website) from public.church_profiles cp where cp.church_id = k.church_id) as church_host,
             (select count(*) from public.profiles m where m.church_id = k.church_id) as members
        from public.church_claims k
        join public.churches c on c.id = k.church_id
        left join public.profiles pr on pr.id = k.user_id
       order by k.created_at desc
       limit least(greatest(coalesce(p_limit, 100), 1), 500)
    ) x
  ), '[]'::jsonb);
end;
$$;

-- Operator: 0134's 'seen' and 'revoke', plus 'approve' and 'reject' for a
-- MANUAL free claim waiting on review. Approving goes through the same writer
-- as the card path, so the two can never disagree about what a claim grants.
create or replace function public.admin_review_church_claim(p_claim_id uuid, p_action text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  r public.church_claims%rowtype;
  v_username text;
  v_res jsonb;
begin
  perform public.require_admin();
  select * into r from public.church_claims where id = p_claim_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_claim'); end if;

  if p_action = 'seen' then
    update public.church_claims set reviewed_at = now(), reviewed_by = auth.uid() where id = r.id;
    return jsonb_build_object('ok', true);
  end if;
  if p_action = 'approve' then
    if r.tier <> 'free' or r.method <> 'manual' or r.status <> 'pending' then
      return jsonb_build_object('ok', false, 'reason', 'not_reviewable');
    end if;
    v_res := public.church_grant_free_claim(r.id, r.church_id, null);
    if coalesce((v_res->>'ok')::boolean, false) then
      update public.church_claims set reviewed_at = now(), reviewed_by = auth.uid() where id = r.id;
    end if;
    return v_res;
  end if;
  if p_action = 'reject' then
    if r.status <> 'pending' then return jsonb_build_object('ok', false, 'reason', 'not_reviewable'); end if;
    update public.church_claims set status = 'revoked', reviewed_at = now(), reviewed_by = auth.uid() where id = r.id;
    return jsonb_build_object('ok', true);
  end if;
  if p_action = 'revoke' then
    select username into v_username from public.profiles where id = r.user_id;
    if v_username is not null then
      perform public.admin_revoke_church_admin(r.church_id, v_username);
    end if;
    update public.church_claims set status = 'revoked', reviewed_at = now(), reviewed_by = auth.uid() where id = r.id;
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'reason', 'bad_action');
end;
$$;

revoke all on function public.admin_church_claims(integer) from public, anon;
grant execute on function public.admin_church_claims(integer) to authenticated;
revoke all on function public.admin_review_church_claim(uuid, text) from public, anon;
grant execute on function public.admin_review_church_claim(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The free leader's dashboard: ANY leadership of this church, verified or not.
-- Three totals and the live notice. No names, no rows of people, no floor
-- (the free door already needs three members). A streak counts only while it
-- is live — played today or yesterday — since `current_streak` is not reset
-- until the next play; members on no streak count as 0 in the average.
-- ---------------------------------------------------------------------------
create or replace function public.church_leader_summary(p_church_id uuid, p_local_date date default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_today date := least(greatest(coalesce(p_local_date, current_date), current_date - 1), current_date + 1);
  v_week  date := v_today - 6;
  v_members int;
  v_active int;
  v_avg numeric;
  v_notice jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public.is_church_admin(p_church_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_leadership');
  end if;

  select count(*),
         count(*) filter (where greatest(p.last_played_on,
           (select max(c.drop_date) from public.church_verse_plays c where c.user_id = p.id)) >= v_week),
         round(avg(case when p.last_played_on >= v_today - 1 then coalesce(p.current_streak, 0) else 0 end), 1)
    into v_members, v_active, v_avg
    from public.profiles p where p.church_id = p_church_id;

  select jsonb_build_object('message', a.message, 'created_at', a.created_at, 'expires_at', a.expires_at)
    into v_notice
    from public.church_announcements a
   where a.church_id = p_church_id and (a.expires_at is null or a.expires_at > now())
   order by a.created_at desc limit 1;

  return jsonb_build_object(
    'ok', true,
    'today', v_today,
    'verified', public.church_is_verified(p_church_id),
    'members', v_members,
    'active_7d', coalesce(v_active, 0),
    'active_pct', case when v_members > 0 then round(100.0 * coalesce(v_active, 0) / v_members) end,
    'avg_streak', coalesce(v_avg, 0),
    'notice', v_notice);
end;
$$;

revoke all on function public.church_leader_summary(uuid, date) from public, anon;
grant execute on function public.church_leader_summary(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 0128's leadership insights, restated WHOLESALE with two changes and nothing
-- else: the roster is ordered by join date (never by last play), and rows no
-- longer carry `active`. `quiet` stays as a total for older clients.
-- ---------------------------------------------------------------------------
create or replace function public.church_leader_insights(p_church_id uuid, p_local_date date default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_gate  text := public.church_admin_can(p_church_id);
  v_today date := least(greatest(coalesce(p_local_date, current_date), current_date - 1), current_date + 1);
  v_week  date := v_today - 6;
  v_from  date := v_today - 13;
  v_members int;
  v_active  int;
  v_days    jsonb;
  v_series  jsonb;
  v_roster  jsonb;
  v_streaks jsonb;
  v_notice  jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;

  select count(*) into v_members from public.profiles where church_id = p_church_id;

  with m as (
    select p.id, p.username, p.avatar_emoji, p.avatar_character, p.church_joined_at,
           p.current_streak, p.last_played_on
      from public.profiles p where p.church_id = p_church_id
  ), r as (
    select m.*,
      (select count(*) from public.plays pl where pl.user_id = m.id and pl.drop_date between v_week and v_today) as drop_7d,
      (select count(*) from public.church_verse_plays c where c.user_id = m.id and c.church_id = p_church_id
          and c.drop_date between v_week and v_today) as church_7d,
      greatest(m.last_played_on,
               (select max(c.drop_date) from public.church_verse_plays c where c.user_id = m.id)) as last_on,
      (select round(avg(c.score)) from public.church_verse_plays c where c.user_id = m.id and c.church_id = p_church_id) as church_avg,
      public.is_church_admin_of(p_church_id, m.id) as leader
    from m
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'username', username, 'avatar_emoji', avatar_emoji, 'avatar_character', avatar_character,
           'joined_at', church_joined_at, 'streak', coalesce(current_streak, 0),
           'last_played_on', last_on, 'drop_7d', drop_7d, 'church_7d', church_7d,
           'church_avg', church_avg, 'leader', leader)
           order by church_joined_at nulls last, username), '[]'::jsonb),
         count(*) filter (where last_on >= v_week)
    into v_roster, v_active
    from r;

  select jsonb_agg(jsonb_build_object(
           'date', d::date,
           'drop', (select count(distinct pl.user_id) from public.plays pl
                      join public.profiles p on p.id = pl.user_id and p.church_id = p_church_id
                     where pl.drop_date = d::date),
           'church', (select count(*) from public.church_verse_plays c
                       where c.church_id = p_church_id and c.drop_date = d::date),
           'scheduled', exists (select 1 from public.church_verses cv
                                 where cv.church_id = p_church_id and cv.drop_date = d::date
                                   and cv.status <> 'draft'))
           order by d)
    into v_days
    from generate_series(v_from, v_today, interval '1 day') d;

  select coalesce(jsonb_agg(s order by s->>'starts'), '[]'::jsonb) into v_series
    from (
      select jsonb_build_object(
               'series', cv.series,
               'starts', min(cv.drop_date),
               'ends', max(cv.drop_date),
               'days', count(*),
               'so_far', count(*) filter (where cv.drop_date <= v_today),
               'plays', count(c.user_id),
               'players', count(distinct c.user_id),
               'completion', case when v_members > 0 and count(*) filter (where cv.drop_date <= v_today) > 0
                 then round(100.0 * count(c.user_id)
                            / (v_members * count(*) filter (where cv.drop_date <= v_today))) end) as s
        from public.church_verses cv
        left join public.church_verse_plays c on c.church_id = cv.church_id and c.drop_date = cv.drop_date
       where cv.church_id = p_church_id and cv.series is not null
         and cv.status <> 'draft'
         and cv.drop_date >= v_today - 60
       group by cv.series
    ) x;

  select jsonb_build_object(
           's0',   count(*) filter (where coalesce(current_streak, 0) = 0 or last_played_on < v_today - 1),
           's1',   count(*) filter (where current_streak = 1 and last_played_on >= v_today - 1),
           's2_6', count(*) filter (where current_streak between 2 and 6 and last_played_on >= v_today - 1),
           's7',   count(*) filter (where current_streak >= 7 and last_played_on >= v_today - 1))
    into v_streaks
    from public.profiles where church_id = p_church_id;

  select jsonb_build_object('message', a.message, 'created_at', a.created_at, 'expires_at', a.expires_at)
    into v_notice
    from public.church_announcements a
   where a.church_id = p_church_id and (a.expires_at is null or a.expires_at > now())
   order by a.created_at desc limit 1;

  return jsonb_build_object(
    'ok', true,
    'today', v_today,
    'members', v_members,
    'active_7d', coalesce(v_active, 0),
    'quiet', v_members - coalesce(v_active, 0),
    'days', coalesce(v_days, '[]'::jsonb),
    'series', v_series,
    'streaks', v_streaks,
    'notice', v_notice,
    'roster', v_roster);
end;
$$;
revoke all on function public.church_leader_insights(uuid, date) from public, anon;
grant execute on function public.church_leader_insights(uuid, date) to authenticated;

revoke all on function public.church_free_claim_min_members() from public, anon;
grant execute on function public.church_free_claim_min_members() to authenticated, service_role;

notify pgrst, 'reload schema';
