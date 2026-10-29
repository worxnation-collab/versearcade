-- 0162 — "your prayer mattered": when a player marks their Prayer Wall note
-- answered (answer_prayer_request, 0099), everybody who knelt at it is pushed,
-- once.
--
-- The requester's client asks push-send for `{ action: 'answered',
-- request_id }` after the answer is saved, and this claim is the whole gate:
-- it answers only the note's OWNER, only within fifteen minutes of the
-- answer, only for a note that is not hidden or reported, and only once —
-- `answered_pushed_at` is stamped in the same statement. It returns the
-- distinct kneelers (never the owner), capped at 500.
--
-- What the push carries is the wall's own rule: NOBODY is named and nothing is
-- counted. The kneeler is not told whose note it was, and is not told how many
-- others knelt — "a prayer you held was answered", and the mailbox line that
-- 0099 already writes says the rest.
--
-- service_role only: push-send calls it after verifying the caller's JWT.

alter table public.prayer_requests add column if not exists answered_pushed_at timestamptz;

create or replace function public.answered_push_claim(p_sender uuid, p_request uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  hit uuid;
  who jsonb;
begin
  if p_sender is null or p_request is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_input');
  end if;

  update public.prayer_requests
     set answered_pushed_at = now()
   where id = p_request
     and user_id = p_sender
     and answered_at > now() - interval '15 minutes'
     and answered_pushed_at is null
     and reported_at is null
     and not coalesce(hidden, false)
  returning id into hit;

  if hit is null then
    return jsonb_build_object('ok', false, 'reason', 'nothing_to_push');
  end if;

  select coalesce(jsonb_agg(k.user_id), '[]'::jsonb) into who
    from (
      select distinct i.user_id
        from public.prayer_intercessions i
       where i.request_id = hit
         and i.user_id <> p_sender
       limit 500
    ) k;

  return jsonb_build_object('ok', true, 'request_id', hit, 'recipients', who);
end;
$$;

revoke all on function public.answered_push_claim(uuid, uuid) from public, anon, authenticated;
grant execute on function public.answered_push_claim(uuid, uuid) to service_role;
