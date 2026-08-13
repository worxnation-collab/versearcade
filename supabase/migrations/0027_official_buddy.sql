-- Official buddy — a "MySpace Tom" default friend. Any profile flagged
-- official_buddy is injected into every other user's buddies list automatically
-- (existing + future users, no backfill), always appears first, and can't be
-- removed. Set for the promoter account so everyone can battle/reach them.

alter table public.profiles add column if not exists official_buddy boolean not null default false;
update public.profiles set official_buddy = true where username = 'sharkbait';

-- buddy_card now carries the official flag so the client can badge/pin it.
create or replace function public.buddy_card(p public.profiles)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'username', p.username,
    'avatar_emoji', p.avatar_emoji,
    'avatar_character', p.avatar_character,
    'level', p.level,
    'current_streak', p.current_streak,
    'last_played_on', p.last_played_on,
    'official', p.official_buddy
  );
$$;

-- Buddies list = my accepted buddies UNION any official accounts I'm not already
-- connected to. Officials sort first, then most-recently-active.
create or replace function public.list_buddies()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with mine as (
    select public.buddy_card(p) as card
    from public.buddies b
    join public.profiles p
      on p.id = case when b.requester_id = auth.uid() then b.addressee_id else b.requester_id end
    where b.status = 'accepted'
      and (b.requester_id = auth.uid() or b.addressee_id = auth.uid())
  ),
  officials as (
    select public.buddy_card(p) as card
    from public.profiles p
    where p.official_buddy and p.id <> auth.uid()
      and not exists (
        select 1 from public.buddies b
        where (b.requester_id = auth.uid() and b.addressee_id = p.id)
           or (b.requester_id = p.id and b.addressee_id = auth.uid())
      )
  ),
  everyone as (select card from officials union all select card from mine)
  select coalesce(
    jsonb_agg(card order by (card->>'official') desc, (card->>'last_played_on') desc nulls last),
    '[]'::jsonb
  ) from everyone;
$$;

-- Suggestions never include an official account (it's already everyone's buddy).
create or replace function public.suggested_buddies(p_limit int default 3)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(public.buddy_card(p) order by p.last_played_on desc nulls last, p.level desc), '[]'::jsonb)
  from (
    select p.* from public.profiles p
    where p.id <> auth.uid()
      and not p.official_buddy
      and not exists (
        select 1 from public.buddies b
        where (b.requester_id = auth.uid() and b.addressee_id = p.id)
           or (b.requester_id = p.id and b.addressee_id = auth.uid())
      )
    order by p.last_played_on desc nulls last, p.level desc
    limit greatest(p_limit, 1)
  ) p;
$$;

-- Requesting an official account is a no-op success — they're already your buddy.
create or replace function public.send_buddy_request(p_username text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  uid uuid := auth.uid();
  target uuid;
  target_official boolean;
  existing public.buddies;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select id, official_buddy into target, target_official from public.profiles where username = lower(trim(p_username));
  if target is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if target = uid then return jsonb_build_object('ok', false, 'reason', 'self'); end if;
  if target_official then return jsonb_build_object('ok', true, 'status', 'accepted'); end if;

  select * into existing from public.buddies
   where (requester_id = uid and addressee_id = target)
      or (requester_id = target and addressee_id = uid);

  if found then
    if existing.status = 'accepted' then
      return jsonb_build_object('ok', true, 'status', 'accepted');
    end if;
    if existing.requester_id = target then
      update public.buddies set status = 'accepted', responded_at = now()
       where requester_id = target and addressee_id = uid;
      return jsonb_build_object('ok', true, 'status', 'accepted');
    end if;
    return jsonb_build_object('ok', true, 'status', 'pending');
  end if;

  insert into public.buddies(requester_id, addressee_id, status)
  values (uid, target, 'pending');
  return jsonb_build_object('ok', true, 'status', 'pending');
end; $$;

notify pgrst, 'reload schema';
