-- 0161 — the gestures that give something reach the person they're for.
--
-- When a friend washes your feet (0068) or somebody kneels at your Prayer Wall
-- note (0099), the giver's client asks push-send for
-- `{ action: 'gesture', kind: 'wash' | 'kneel', target }` and this claim is
-- the whole gate:
--
--   · wash  — target is the recipient's username; the CALLER must have washed
--             that person's feet in the last fifteen minutes.
--   · kneel — target is the prayer note's id; the CALLER must have knelt at
--             it in the last fifteen minutes, it is not their own note, and
--             it is still open (not withdrawn, not reported).
--
-- And ONE push per recipient per day, whichever gesture comes first:
-- `profiles.gesture_pushed_on` is stamped in the same statement that claims
-- it, so a second friend, a retry and two devices racing all land on a day
-- already used. A gift that interrupts somebody twelve times a day stops being
-- one. The day is UTC because the server does not know the recipient's clock;
-- "at most one a day" holds either way.
--
-- Nothing countable is returned or sent: no "3 friends", no tally. A washing
-- names the washer (the basin already shows who washed you); a kneeling names
-- NOBODY, because the wall is anonymous for the person who kneels — the push
-- says what the lantern says, "somebody prayed for you today".
--
-- service_role only: push-send calls it after verifying the caller's JWT.

alter table public.profiles add column if not exists gesture_pushed_on date;

create or replace function public.gesture_push_claim(p_sender uuid, p_kind text, p_target text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
  req uuid;
  hit uuid;
  day date := (now() at time zone 'utc')::date;
  from_name text;
begin
  if p_sender is null or p_kind is null or p_target is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_input');
  end if;

  if p_kind = 'wash' then
    select w.washed_id into recipient
      from public.feet_washings w
      join public.profiles p on p.id = w.washed_id
     where w.washer_id = p_sender
       and p.username = lower(trim(p_target))
       and w.created_at > now() - interval '15 minutes'
     limit 1;
  elsif p_kind = 'kneel' then
    begin
      req := p_target::uuid;
    exception when others then
      return jsonb_build_object('ok', false, 'reason', 'bad_input');
    end;
    select r.user_id into recipient
      from public.prayer_intercessions i
      join public.prayer_requests r on r.id = i.request_id
     where i.request_id = req
       and i.user_id = p_sender
       and i.created_at > now() - interval '15 minutes'
       and r.user_id <> p_sender
       and r.withdrawn_at is null
       and r.reported_at is null
     limit 1;
  else
    return jsonb_build_object('ok', false, 'reason', 'bad_input');
  end if;

  if recipient is null or recipient = p_sender then
    return jsonb_build_object('ok', false, 'reason', 'nothing_to_push');
  end if;

  update public.profiles
     set gesture_pushed_on = day
   where id = recipient
     and gesture_pushed_on is distinct from day
  returning id into hit;

  if hit is null then
    return jsonb_build_object('ok', false, 'reason', 'already_today');
  end if;

  if p_kind = 'wash' then
    select username into from_name from public.profiles where id = p_sender;
  end if;

  return jsonb_build_object(
    'ok', true,
    'kind', p_kind,
    'recipient_id', hit,
    'from_username', from_name
  );
end;
$$;

revoke all on function public.gesture_push_claim(uuid, text, text) from public, anon, authenticated;
grant execute on function public.gesture_push_claim(uuid, text, text) to service_role;
