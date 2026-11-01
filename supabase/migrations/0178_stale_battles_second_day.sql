-- 0178: two cleanups found in production on 2026-11-01.
--
-- 1. STALE BATTLES. 228 async battles had sat 'pending' for more than seven
--    days — challenges nobody was ever going to play — and every one of them
--    filled somebody's "Waiting on their play" list for good. There is no
--    'expired' status on purpose: approved iOS builds read anything that is
--    not 'complete' as pending, so a new status would draw as a live battle in
--    every installed copy. Instead list_my_battles stops RETURNING a pending
--    battle older than seven days. Nothing is written, nobody loses anything,
--    no score is touched, and a stale battle opened by its own link still
--    plays and, once played, is listed again as complete. Restated from the
--    live body (the 0030 welcome rule kept word for word) with one predicate.
--
-- 2. THE SECOND DAY. 53 of 187 accounts played exactly once. A player whose
--    first verse was YESTERDAY and who has not opened today's gets one email,
--    once ever, at the hour they played: today's reference and one link. It is
--    the come-back email's shape (0169) and obeys its every rule — its switch
--    (email_prefs.comeback), the suppression list (0171), a deleted account,
--    an empty address — and adds nothing countable: no streak, no "don't lose
--    it", no number about anybody. email_second_day is the once-ever guard AND
--    the record of who got it, written by the claim itself; it is its own
--    table rather than a new kind on email_sends because widening that table's
--    kind check means replacing a constraint, which the MCP cannot apply.

create or replace function public.list_my_battles()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(public.battle_json(b) order by b.created_at desc), '[]'::jsonb)
  from public.battles b
  where b.broadcast = false
    and not (b.status = 'pending' and b.created_at < now() - interval '7 days')
    and (
      b.opponent_id = auth.uid()
      or b.invited_id = auth.uid()
      or (b.challenger_id = auth.uid() and not (b.is_welcome and b.status = 'pending'))
    );
$$;

create table if not exists public.email_second_day (
  user_id uuid primary key,
  local_day date not null,
  sent_at timestamptz not null default now()
);
alter table public.email_second_day enable row level security;
revoke all on table public.email_second_day from public, anon, authenticated;

create or replace function public.second_day_email_claim(p_limit integer)
returns table(recipient uuid, email text, local_day date, token uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n int := 0;
  cap int := greatest(1, least(coalesce(p_limit, 200), 500));
begin
  for r in
    select p.id, u.email as addr, p.email_token,
           (now() at time zone coalesce(p.week_push->>'tz', 'America/New_York'))::date as today
      from profiles p join auth.users u on u.id = p.id
     where coalesce(p.total_plays, 0) = 1
       and p.last_played_on = (now() at time zone coalesce(p.week_push->>'tz', 'America/New_York'))::date - 1
       and coalesce((p.email_prefs->>'comeback')::boolean, true)
       and extract(hour from now() at time zone coalesce(p.week_push->>'tz', 'America/New_York'))
           = coalesce((p.week_push->>'hour')::int, 10)
       and coalesce(u.email, '') <> '' and u.deleted_at is null
       and p.email_token is not null
       and not exists (select 1 from email_second_day s where s.user_id = p.id)
       and not exists (select 1 from email_suppressions x where x.email_hash = public.email_hash(u.email))
     for update of p skip locked
  loop
    exit when n >= cap;
    insert into email_second_day (user_id, local_day) values (r.id, r.today)
    on conflict (user_id) do nothing;
    if not found then continue; end if;
    recipient := r.id; email := r.addr; local_day := r.today; token := r.email_token;
    n := n + 1;
    return next;
  end loop;
end $$;

revoke all on function public.second_day_email_claim(integer) from public, anon, authenticated;
grant execute on function public.second_day_email_claim(integer) to service_role;
