-- 0173: a welcome-back email when a player confirms a new address.
--
-- 0172's note in Settings lets a player whose address bounced move the
-- account to another one; Supabase mails a confirmation link and changes
-- auth.users.email only when it is tapped. That UPDATE is the moment this
-- listens for: a trigger on auth.users queues ONE row in `email_welcome`, and
-- push-send's 15-minute flush claims it and sends "You're all set" with
-- today's verse reference, one link and the way out — the same shape as the
-- come-back email, no count and no streak.
--
-- Rules:
--   • Only a CHANGE of a confirmed address queues (old and new both set and
--     different). A sign-up is an INSERT and never fires this.
--   • At most one a day per player: changing the address back and forth
--     sends one email, not one per change (`last_sent_at`).
--   • The new address is held to every rule other mail is held to: not on
--     0171's suppression list, not deleted, and the "Today's verse by email"
--     switch (email_prefs.comeback) not off. A player who switched email
--     off does not get mail for changing their address.
--   • A queued row older than two days is never sent — a welcome that
--     arrives a week late is noise.
--
-- The table holds a user id and two times; the address is read from
-- auth.users at claim time, so nothing here goes stale or needs erasing.

create table if not exists public.email_welcome (
  user_id uuid primary key references auth.users (id) on delete cascade,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  last_sent_at timestamptz
);
alter table public.email_welcome enable row level security;
revoke all on table public.email_welcome from public, anon, authenticated;
grant all on table public.email_welcome to service_role;

create or replace function public.email_welcome_queue()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if nullif(btrim(coalesce(old.email, '')), '') is not null
     and nullif(btrim(coalesce(new.email, '')), '') is not null
     and lower(btrim(old.email)) <> lower(btrim(new.email)) then
    insert into public.email_welcome (user_id, queued_at, sent_at)
    values (new.id, now(), null)
    on conflict (user_id) do update set queued_at = now(), sent_at = null;
  end if;
  return new;
end $$;

create or replace trigger email_welcome_on_change
  after update of email on auth.users
  for each row execute function public.email_welcome_queue();

create or replace function public.email_welcome_claim(p_limit int)
returns table (recipient uuid, email text, local_day date, token uuid)
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
  cap int := greatest(1, least(coalesce(p_limit, 100), 500));
begin
  for r in
    select w.user_id, u.email as addr, p.email_token,
           (now() at time zone coalesce(p.week_push->>'tz', 'America/New_York'))::date as today
      from email_welcome w
      join auth.users u on u.id = w.user_id
      join profiles p on p.id = w.user_id
     where w.sent_at is null
       and w.queued_at > now() - interval '2 days'
       and (w.last_sent_at is null or w.last_sent_at < now() - interval '24 hours')
       and coalesce(u.email, '') <> '' and u.deleted_at is null
       and coalesce((p.email_prefs->>'comeback')::boolean, true)
       and not exists (select 1 from email_suppressions x where x.email_hash = public.email_hash(u.email))
     for update of w skip locked
  loop
    exit when n >= cap;
    update email_welcome set sent_at = now(), last_sent_at = now() where user_id = r.user_id;
    recipient := r.user_id; email := r.addr; local_day := r.today; token := r.email_token;
    n := n + 1;
    return next;
  end loop;
end $$;

revoke all on function public.email_welcome_queue() from public, anon, authenticated;
revoke all on function public.email_welcome_claim(int) from public, anon, authenticated;
grant execute on function public.email_welcome_claim(int) to service_role;
