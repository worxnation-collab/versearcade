-- 0169: the come-back note by EMAIL, to a lapsed player with no push device.
--
-- 0168 pushes "Today's verse" once per absence; it reaches nobody without a
-- device registered, which today is everybody away a week. So the same note
-- goes by email to exactly the players the push cannot reach — never both:
-- a player with a push device is the push's, and is never emailed.
--
-- Same rules as the push:
--   * the body is today's verse REFERENCE and a link — no count of days, no
--     streak, nothing missed (the words are push-send's, from verseOrder.ts);
--   * ONCE PER ABSENCE: the claim stamps profiles.comeback_emailed_for with
--     last_played_on, so only playing again makes a player due again;
--   * a player who has never played is never asked to come BACK.
-- Two narrowings an inbox needs and a push does not:
--   * an absence of 7 to 60 DAYS only. Somebody gone half a year did not ask
--     for mail, and a burst of it to old addresses is how a sending domain
--     gets marked as spam for everybody.
--   * the player's usual hour and zone when 0166 knows them, else 10:00 in
--     America/New_York (the gathering hour's zone) — an email waits in the
--     inbox, so the hour matters less than for a push.
--
-- Its own switch (profiles.email_prefs.comeback, a missing key ON) in
-- Settings, and an UNSUBSCRIBE link in every email: /unsubscribe?t=<token>
-- calls email_unsubscribe, which needs no session (a link in an inbox has
-- none) and takes only the per-player random token, never an id or an email.
-- The token is a column of its own so it can be rotated without touching the
-- account; it reveals nothing and does nothing but switch mail OFF.

alter table public.profiles
  add column if not exists comeback_emailed_for date,
  add column if not exists email_prefs jsonb,
  add column if not exists email_token uuid default gen_random_uuid();

update public.profiles set email_token = gen_random_uuid() where email_token is null;

create unique index if not exists profiles_email_token_key on public.profiles (email_token);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_email_prefs_object') then
    alter table public.profiles
      add constraint profiles_email_prefs_object
      check (email_prefs is null or jsonb_typeof(email_prefs) = 'object');
  end if;
end $$;

create or replace function public.my_email_prefs()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  p jsonb;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select email_prefs into p from profiles where id = uid;
  return jsonb_build_object(
    'comeback', coalesce((p->>'comeback')::boolean, true),
    'has_email', exists (select 1 from auth.users u where u.id = uid and coalesce(u.email, '') <> ''));
end $$;

create or replace function public.set_email_pref(p_kind text, p_on boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_kind is null or p_kind not in ('comeback') or p_on is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_value');
  end if;
  update profiles set email_prefs = coalesce(email_prefs, '{}'::jsonb) || jsonb_build_object(p_kind, p_on)
   where id = uid;
  return jsonb_build_object('ok', true, 'prefs', public.my_email_prefs());
end $$;

-- The link in the email. No session; the token is the only key, and the only
-- thing it can do is turn a kind of mail OFF. Answers the same whether or not
-- the token matched, so it cannot be used to test tokens.
create or replace function public.email_unsubscribe(p_token uuid, p_kind text default 'comeback')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  k text := coalesce(p_kind, 'comeback');
begin
  if p_token is null or k not in ('comeback') then
    return jsonb_build_object('ok', false, 'reason', 'bad_value');
  end if;
  update profiles set email_prefs = coalesce(email_prefs, '{}'::jsonb) || jsonb_build_object(k, false)
   where email_token = p_token;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.comeback_email_claim(p_limit int)
returns table (recipient uuid, email text, local_day date, token uuid)
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
  cap int := greatest(1, least(coalesce(p_limit, 200), 500));
begin
  for r in
    select p.id, p.last_played_on, u.email as addr, p.email_token,
           (now() at time zone coalesce(p.week_push->>'tz', 'America/New_York'))::date as today
      from profiles p join auth.users u on u.id = p.id
     where p.last_played_on is not null
       and p.last_played_on <= (now() at time zone coalesce(p.week_push->>'tz', 'America/New_York'))::date - 7
       and p.last_played_on >= (now() at time zone coalesce(p.week_push->>'tz', 'America/New_York'))::date - 60
       and p.comeback_emailed_for is distinct from p.last_played_on
       and coalesce((p.email_prefs->>'comeback')::boolean, true)
       and extract(hour from now() at time zone coalesce(p.week_push->>'tz', 'America/New_York'))
           = coalesce((p.week_push->>'hour')::int, 10)
       and coalesce(u.email, '') <> '' and u.deleted_at is null
       and not exists (select 1 from push_subscriptions s where s.profile_id = p.id)
       and not exists (select 1 from device_tokens d where d.profile_id = p.id and d.platform = 'ios')
     for update of p skip locked
  loop
    exit when n >= cap;
    update profiles set comeback_emailed_for = r.last_played_on where id = r.id;
    recipient := r.id; email := r.addr; local_day := r.today; token := r.email_token;
    n := n + 1;
    return next;
  end loop;
end $$;

revoke all on function public.comeback_email_claim(int) from public, anon, authenticated;
grant execute on function public.comeback_email_claim(int) to service_role;
revoke all on function public.my_email_prefs() from public, anon;
revoke all on function public.set_email_pref(text, boolean) from public, anon;
grant execute on function public.my_email_prefs() to authenticated;
grant execute on function public.set_email_pref(text, boolean) to authenticated;
revoke all on function public.email_unsubscribe(uuid, text) from public;
grant execute on function public.email_unsubscribe(uuid, text) to anon, authenticated;
