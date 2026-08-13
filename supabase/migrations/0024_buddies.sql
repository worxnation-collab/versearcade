-- Bible Buddies — a personal friends layer. A buddy request goes from requester
-- to addressee; once accepted it's a symmetric friendship. Drives the Buddies
-- screen and the Battle invite list (you challenge buddies + a few suggested
-- active players). All access flows through the SECURITY DEFINER RPCs below.

create table if not exists public.buddies (
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
create index if not exists buddies_addressee_idx on public.buddies(addressee_id);
create index if not exists buddies_requester_idx on public.buddies(requester_id);
alter table public.buddies enable row level security;

-- A compact profile card used across the buddy/suggestion lists.
create or replace function public.buddy_card(p public.profiles)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'username', p.username,
    'avatar_emoji', p.avatar_emoji,
    'avatar_character', p.avatar_character,
    'level', p.level,
    'current_streak', p.current_streak,
    'last_played_on', p.last_played_on
  );
$$;

-- Send (or auto-accept) a buddy request by @username. If the target has already
-- requested me, the two requests resolve into an accepted friendship.
create or replace function public.send_buddy_request(p_username text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  uid uuid := auth.uid();
  target uuid;
  existing public.buddies;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select id into target from public.profiles where username = lower(trim(p_username));
  if target is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if target = uid then return jsonb_build_object('ok', false, 'reason', 'self'); end if;

  -- Already connected either direction?
  select * into existing from public.buddies
   where (requester_id = uid and addressee_id = target)
      or (requester_id = target and addressee_id = uid);

  if found then
    if existing.status = 'accepted' then
      return jsonb_build_object('ok', true, 'status', 'accepted');
    end if;
    -- A pending request already exists. If THEY requested ME, accept it.
    if existing.requester_id = target then
      update public.buddies set status = 'accepted', responded_at = now()
       where requester_id = target and addressee_id = uid;
      return jsonb_build_object('ok', true, 'status', 'accepted');
    end if;
    -- I already requested them.
    return jsonb_build_object('ok', true, 'status', 'pending');
  end if;

  insert into public.buddies(requester_id, addressee_id, status)
  values (uid, target, 'pending');
  return jsonb_build_object('ok', true, 'status', 'pending');
end; $$;

-- Accept or decline an incoming request (identified by the requester's username).
create or replace function public.respond_buddy_request(p_username text, p_accept boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  uid uuid := auth.uid();
  requester uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select id into requester from public.profiles where username = lower(trim(p_username));
  if requester is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  if p_accept then
    update public.buddies set status = 'accepted', responded_at = now()
     where requester_id = requester and addressee_id = uid and status = 'pending';
  else
    delete from public.buddies
     where requester_id = requester and addressee_id = uid and status = 'pending';
  end if;
  return jsonb_build_object('ok', true);
end; $$;

-- Remove a buddy (or cancel a request I sent), either direction.
create or replace function public.remove_buddy(p_username text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  uid uuid := auth.uid();
  other uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select id into other from public.profiles where username = lower(trim(p_username));
  if other is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  delete from public.buddies
   where (requester_id = uid and addressee_id = other)
      or (requester_id = other and addressee_id = uid);
  return jsonb_build_object('ok', true);
end; $$;

-- My accepted buddies (the other party's card), most recently active first.
create or replace function public.list_buddies()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(card order by (card->>'last_played_on') desc nulls last), '[]'::jsonb)
  from (
    select public.buddy_card(p) as card
    from public.buddies b
    join public.profiles p
      on p.id = case when b.requester_id = auth.uid() then b.addressee_id else b.requester_id end
    where b.status = 'accepted'
      and (b.requester_id = auth.uid() or b.addressee_id = auth.uid())
  ) s;
$$;

-- Incoming pending requests (people who want to be my buddy).
create or replace function public.list_buddy_requests()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(public.buddy_card(p) order by b.created_at desc), '[]'::jsonb)
  from public.buddies b
  join public.profiles p on p.id = b.requester_id
  where b.addressee_id = auth.uid() and b.status = 'pending';
$$;

-- A handful of active players I'm not connected to yet — ranked by recent
-- activity so a friendless user still gets an opponent likely to battle back.
create or replace function public.suggested_buddies(p_limit int default 3)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(public.buddy_card(p) order by p.last_played_on desc nulls last, p.level desc), '[]'::jsonb)
  from (
    select p.* from public.profiles p
    where p.id <> auth.uid()
      and not exists (
        select 1 from public.buddies b
        where (b.requester_id = auth.uid() and b.addressee_id = p.id)
           or (b.requester_id = p.id and b.addressee_id = auth.uid())
      )
    order by p.last_played_on desc nulls last, p.level desc
    limit greatest(p_limit, 1)
  ) p;
$$;

grant execute on function public.send_buddy_request(text) to authenticated;
grant execute on function public.respond_buddy_request(text, boolean) to authenticated;
grant execute on function public.remove_buddy(text) to authenticated;
grant execute on function public.list_buddies() to authenticated;
grant execute on function public.list_buddy_requests() to authenticated;
grant execute on function public.suggested_buddies(int) to authenticated;

notify pgrst, 'reload schema';
