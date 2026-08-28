-- Companions walk with everybody, not just with you.
--
-- 0071 put a pet on the player card and left the crowd RPCs alone, on the
-- argument that a card is opened one at a time while a board is people side by
-- side. A SCENE is neither: the hall, the churchyard and a visited room are
-- places people stand in, with no order, no rows and no numbers on anybody.
-- Under the rule 0071 established — a pet is a PICTURE, not a number — a
-- companion in a scene is the same kind of thing as the skin and the robe
-- already standing there.
--
-- WHAT THIS ADDS: one nullable `pet` id, out of a fixed catalog (data/pets.ts),
-- to the member rows of the three RPCs that feed CrowdLife.
--
-- WHAT IT STILL DOES NOT ADD, and this is the line that survives: the
-- LEADERBOARD RPCs are untouched. A board is an ordered list — a companion in a
-- ranked row reads as part of the rank, which is the thing this app does not
-- do. Scenes carry no order and no score, which is exactly why they can carry
-- this and a board cannot.
--
-- An unknown id is a figure with no companion, never a crash: petById() drops
-- anything this build doesn't know, so an old client reading a new catalog id
-- simply draws the person.

-- ── The faction's hall ──────────────────────────────────────────────────────
create or replace function public.keep_json(p_denomination text)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_wins bigint;
  v_total bigint;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_denomination is null or length(p_denomination) > 40 then raise exception 'bad denomination'; end if;

  select count(*) into v_wins
  from public.battles b
  join public.profiles w on w.id = case b.winner
    when 'challenger' then b.challenger_id when 'opponent' then b.opponent_id end
  where b.status = 'complete' and w.denomination = p_denomination;

  select count(*) into v_total from public.profiles where denomination = p_denomination;

  return json_build_object(
    'wins', coalesce(v_wins, 0),
    'member_total', coalesce(v_total, 0),
    'members', coalesce((
      select json_agg(json_build_object(
        'username', username,
        'avatar_emoji', avatar_emoji,
        'avatar_character', avatar_character,
        'pet', pet,
        'is_me', id = uid
      ))
      from (
        select id, username, avatar_emoji, avatar_character, pet
        from public.profiles
        where denomination = p_denomination
        order by created_at asc
        limit 11
      ) m
    ), '[]'::json),
    'placements', coalesce((
      select json_object_agg(anchor, decor_id)
      from (
        select distinct on (kp.anchor) kp.anchor, kp.decor_id
        from public.keep_placements kp
        join public.profiles p on p.id = kp.user_id
        where p.denomination = p_denomination
        order by kp.anchor,
                 (kp.user_id = uid) desc,
                 md5(uid::text || kp.user_id::text || kp.anchor)
      ) s
    ), '{}'::json)
  );
end;
$$;

grant execute on function public.keep_json(text) to authenticated;

-- ── The congregation outside a church ───────────────────────────────────────
create or replace function public.get_church_page(p_church_id uuid, p_members_limit integer default 12)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_church public.churches%rowtype;
  v_mine public.churches%rowtype;
  v_has_mine boolean := false;
  v_limit integer;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select * into v_church from public.churches where id = p_church_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  v_limit := least(greatest(coalesce(p_members_limit, 12), 1), 24);

  select c.* into v_mine
  from public.churches c
  join public.profiles p on p.church_id = c.id
  where p.id = uid;
  v_has_mine := found;

  return jsonb_build_object(
    'ok', true,
    'church', public.church_json(v_church) || jsonb_build_object(
      'is_mine', v_has_mine and v_mine.id = v_church.id,
      'miles', case when v_has_mine
                    then round(public.miles_between(v_mine.lat, v_mine.lng, v_church.lat, v_church.lng)::numeric, 1)
               end
    ),
    'info', (
      select jsonb_build_object(
        'tagline', cp.tagline,
        'about', cp.about,
        'serviceTimes', cp.service_times,
        'website', cp.website,
        'contact', cp.contact
      )
      from public.church_profiles cp
      where cp.church_id = v_church.id and cp.published
    ),
    'members', coalesce((
      -- Order the aggregate itself, not just the subquery: jsonb_agg over an
      -- ordered subselect happens to come out in order today but isn't promised
      -- to, and the crowd outside the church would silently reshuffle.
      select jsonb_agg(roster.m order by roster.joined nulls last, roster.username)
      from (
        select pr.church_joined_at as joined,
               pr.username,
               jsonb_build_object(
                 'username', pr.username,
                 'avatar_emoji', pr.avatar_emoji,
                 'avatar_character', pr.avatar_character,
                 'pet', pr.pet,
                 'is_me', pr.id = uid
               ) as m
        from public.profiles pr
        where pr.church_id = v_church.id
        order by pr.church_joined_at nulls last, pr.username
        limit v_limit
      ) roster
    ), '[]'::jsonb),
    'member_total', (select count(*) from public.profiles pr where pr.church_id = v_church.id),
    -- So the pill can say "we've got your note" instead of inviting a duplicate.
    'my_request_pending', exists (
      select 1 from public.church_info_requests r
      where r.church_id = v_church.id and r.user_id = uid and not r.handled
    )
  );
end;
$function$;

grant execute on function public.get_church_page(uuid, integer) to authenticated;

-- ── Somebody else's room ────────────────────────────────────────────────────
-- Still no number of any kind: placements, an architecture tier instead of the
-- owner's level, and now the companion standing beside them.
create or replace function public.room_json(p_username text)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_owner public.profiles;
  v_tier integer;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_username is null or length(p_username) > 40 then raise exception 'bad username'; end if;

  select * into v_owner from public.profiles
  where lower(username) = lower(regexp_replace(p_username, '^@', ''));
  if v_owner.id is null then return null; end if;

  -- KEEP IN SYNC with roomTier() in src/data/room.ts — thresholds 1/5/12/25/40.
  v_tier := case
    when v_owner.level >= 40 then 4
    when v_owner.level >= 25 then 3
    when v_owner.level >= 12 then 2
    when v_owner.level >= 5  then 1
    else 0 end;

  return json_build_object(
    'username', v_owner.username,
    'avatar_emoji', v_owner.avatar_emoji,
    'avatar_character', v_owner.avatar_character,
    'pet', v_owner.pet,
    'is_me', v_owner.id = uid,
    'tier', v_tier,
    'placements', coalesce((
      select json_object_agg(anchor, item_id) from public.room_placements where user_id = v_owner.id
    ), '{}'::json)
  );
end;
$$;

grant execute on function public.room_json(text) to authenticated;

notify pgrst, 'reload schema';
