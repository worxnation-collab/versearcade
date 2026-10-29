-- 0160 — "We'll tell you when they answer": a push to the player who SENT a
-- buddy request when it is accepted.
--
-- The client that just accepted (respond_buddy_request, or a send that met a
-- request already waiting the other way) asks push-send for
-- `{ action: 'buddy_accepted', username }`. This claim is the whole gate: it
-- hands back the row only if the CALLER is the addressee, the request was
-- accepted in the last fifteen minutes, and nobody has pushed for it yet. It
-- stamps `requester_pushed_at` in the same statement, so a retry pushes once.
-- A declined request pushes nothing — nobody is told they were turned down.
--
-- service_role only: push-send calls it after verifying the caller's JWT.

alter table public.buddies add column if not exists requester_pushed_at timestamptz;

create or replace function public.buddy_accepted_push_claim(p_sender uuid, p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  requester uuid;
  hit uuid;
  from_name text;
begin
  if p_sender is null or p_username is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_input');
  end if;

  select id into requester from public.profiles where username = lower(trim(p_username));
  if requester is null or requester = p_sender then
    return jsonb_build_object('ok', false, 'reason', 'nothing_to_push');
  end if;

  update public.buddies
     set requester_pushed_at = now()
   where requester_id = requester
     and addressee_id = p_sender
     and status = 'accepted'
     and responded_at > now() - interval '15 minutes'
     and requester_pushed_at is null
  returning requester_id into hit;

  if hit is null then
    return jsonb_build_object('ok', false, 'reason', 'nothing_to_push');
  end if;

  select username into from_name from public.profiles where id = p_sender;

  return jsonb_build_object(
    'ok', true,
    'recipient_id', hit,
    'from_username', coalesce(from_name, 'Your friend')
  );
end;
$$;

revoke all on function public.buddy_accepted_push_claim(uuid, text) from public, anon, authenticated;
grant execute on function public.buddy_accepted_push_claim(uuid, text) to service_role;
