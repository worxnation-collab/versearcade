-- 0147 part b — the cascading foreign keys on `church_leader_events`, and the
-- removal of a co-leader. Kept apart from part a because both carry the word
-- the Supabase MCP stops on (CLAUDE.md, "Why some Supabase MCP applies hang").

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'church_leader_events_church_fk') then
    alter table public.church_leader_events
      add constraint church_leader_events_church_fk
      foreign key (church_id) references public.churches(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'church_leader_events_actor_fk') then
    alter table public.church_leader_events
      add constraint church_leader_events_actor_fk
      foreign key (actor_id) references public.profiles(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'church_leader_events_target_fk') then
    alter table public.church_leader_events
      add constraint church_leader_events_target_fk
      foreign key (target_id) references public.profiles(id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Remove a leader of THIS church. Verified leadership only; a leader may
-- remove another leader, or step down themselves, but never the LAST one —
-- a church with no leadership can only be recovered by the operator.
--
-- And never the leader whose Apple ID is paying for the church (0139): the
-- 0140 trigger would end that subscription's hold, which for an Apple-only
-- church un-verifies it and takes the dashboard away from everybody,
-- including whoever pressed the button. They cancel through Apple, or the
-- operator steps in. Removing a leader grants nothing and refunds nothing.
-- ---------------------------------------------------------------------------
create or replace function public.remove_church_co_leader(p_church_id uuid, p_username text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  v_gate text := public.church_admin_can(p_church_id);
  v_user uuid;
begin
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;

  select id into v_user from public.profiles
   where lower(username) = lower(btrim(coalesce(p_username, ''))) limit 1;
  if v_user is null
     or not exists (select 1 from public.church_admins where church_id = p_church_id and user_id = v_user) then
    return jsonb_build_object('ok', false, 'reason', 'not_leader');
  end if;

  perform pg_advisory_xact_lock(hashtext('church_leaders:' || p_church_id::text));

  if (select count(*) from public.church_admins where church_id = p_church_id) <= 1 then
    return jsonb_build_object('ok', false, 'reason', 'last_leader');
  end if;
  if exists (select 1 from public.church_apple_subscriptions
              where church_id = p_church_id and user_id = v_user and status = 'active') then
    return jsonb_build_object('ok', false, 'reason', 'apple_payer');
  end if;

  delete from public.church_admins where church_id = p_church_id and user_id = v_user;
  insert into public.church_leader_events (church_id, actor_id, target_id, action)
  values (p_church_id, uid, v_user, 'remove');

  return jsonb_build_object('ok', true, 'self', v_user = uid);
end;
$$;
revoke all on function public.remove_church_co_leader(uuid, text) from public, anon;
grant execute on function public.remove_church_co_leader(uuid, text) to authenticated;

notify pgrst, 'reload schema';
