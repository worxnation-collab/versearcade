-- 0163: which kinds of push a player wants.
--
-- Six things can push now (0156 check-ins, 0159 battles, 0160 buddies, 0161
-- gestures, 0162 answered prayers), so a player needs a way to keep the ones
-- they love without switching off all of them. One jsonb column of booleans
-- keyed by kind; a MISSING key means ON, so every account that existed before
-- this keeps hearing exactly what it heard yesterday and nothing is backfilled.
--
-- The setting is read SERVER-SIDE: push-send's deliver() skips a recipient
-- whose key for that kind is false, on both transports. The client toggle is
-- only a writer — a phone that never updates still has its choice honoured.
--
-- Five kinds, fixed. The admin broadcast is not one of them (it is the master
-- switch's business, in Settings above these rows). Nothing here is shown to
-- anybody else and nothing counts anything.

alter table public.profiles
  add column if not exists push_prefs jsonb not null default '{}'::jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_push_prefs_object') then
    alter table public.profiles
      add constraint profiles_push_prefs_object check (jsonb_typeof(push_prefs) = 'object');
  end if;
end $$;

create or replace function public.push_kinds()
returns text[] language sql immutable set search_path = public as $$
  select array['battle', 'buddy', 'gesture', 'answered', 'check_in']::text[]
$$;

-- The caller's five, every key present, true unless switched off.
create or replace function public.my_push_prefs()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  prefs jsonb;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select push_prefs into prefs from profiles where id = uid;
  return (
    select jsonb_object_agg(k, coalesce((prefs ->> k)::boolean, true))
    from unnest(push_kinds()) as k
  );
end $$;

create or replace function public.set_push_pref(p_kind text, p_on boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_kind is null or not (p_kind = any(push_kinds())) then
    return jsonb_build_object('ok', false, 'reason', 'unknown_kind');
  end if;
  if p_on is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_value');
  end if;
  update profiles
     set push_prefs = jsonb_set(coalesce(push_prefs, '{}'::jsonb), array[p_kind], to_jsonb(p_on))
   where id = uid;
  return jsonb_build_object('ok', true, 'prefs', public.my_push_prefs());
end $$;

revoke all on function public.push_kinds() from public, anon, authenticated;
grant execute on function public.push_kinds() to service_role;
revoke all on function public.my_push_prefs() from public, anon;
revoke all on function public.set_push_pref(text, boolean) from public, anon;
grant execute on function public.my_push_prefs() to authenticated;
grant execute on function public.set_push_pref(text, boolean) to authenticated;
