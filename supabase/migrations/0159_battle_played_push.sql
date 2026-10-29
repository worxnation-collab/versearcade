-- 0159 — "You'll hear when they play": a push to the challenger when their
-- opponent finishes an async battle.
--
-- The client that just submitted a battle asks push-send for
-- `{ action: 'battle_played', battle_id }`. This claim is the whole gate: it
-- hands back a battle only if the CALLER is the opponent who played it, it
-- completed in the last fifteen minutes, it is not a live match (both players
-- were at the table) nor the welcome battle, and nobody has pushed for it yet.
-- It stamps `challenger_pushed_at` in the same statement, so a retry or two
-- devices racing push once. Nothing about a score is returned — the push says
-- somebody played, and the battle screen says the rest.
--
-- service_role only: push-send calls it after verifying the caller's JWT.

alter table public.battles add column if not exists challenger_pushed_at timestamptz;

create or replace function public.battle_played_push_claim(p_sender uuid, p_battle uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
  from_name text;
begin
  if p_sender is null or p_battle is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_input');
  end if;

  update public.battles
     set challenger_pushed_at = now()
   where id = (
     select id from public.battles
      where id = p_battle
        and opponent_id = p_sender
        and challenger_id is not null
        and challenger_id <> p_sender
        and status = 'complete'
        and completed_at > now() - interval '15 minutes'
        and challenger_pushed_at is null
        and coalesce(live, false) = false
        and coalesce(is_welcome, false) = false
      for update skip locked
   )
  returning id, challenger_id into b;

  if b.id is null then
    return jsonb_build_object('ok', false, 'reason', 'nothing_to_push');
  end if;

  select username into from_name from public.profiles where id = p_sender;

  return jsonb_build_object(
    'ok', true,
    'battle_id', b.id,
    'recipient_id', b.challenger_id,
    'from_username', coalesce(from_name, 'Your opponent')
  );
end;
$$;

revoke all on function public.battle_played_push_claim(uuid, uuid) from public, anon, authenticated;
grant execute on function public.battle_played_push_claim(uuid, uuid) to service_role;
