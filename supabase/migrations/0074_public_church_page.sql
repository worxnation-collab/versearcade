-- The public church page: /church/:id, readable with no account at all.
--
-- WHY A SECOND FUNCTION. `get_church_page` (0050) is viewer-shaped by
-- construction — `is_mine`, `miles`, `is_me` and `my_request_pending` all read
-- `auth.uid()` — and it is deliberately revoked from anon. Widening its grant
-- would be asking it to answer for a viewer who does not exist AND would hand
-- the named roster to anonymous callers in the same edit. So this is a separate,
-- narrower function, and 0050's grants are untouched.
--
-- WHAT IT DELIBERATELY DOES NOT RETURN: a username. `profiles` is readable by
-- the `authenticated` role only (0002, and that phrasing was a choice) — so the
-- signed-in page keeps naming the congregation ("Who plays here") and this one
-- does not. Publishing a list of real usernames against a named physical
-- address, to anyone who follows a link, is a different product from showing
-- that list to a player who is already inside. The public page draws the crowd
-- and counts it; the names arrive with the account.
--
-- The figures still need to differ from each other on screen, and they do:
-- `avatar_emoji`, `avatar_character` and `pet` are a picture, out of a fixed
-- catalog, with no count, no ordering and no identity attached. The client
-- seeds each figure's walk from its index in this list rather than from a name.
--
-- THE ONE BREAK WITH THE HOUSE PATTERN, ON PURPOSE. Every other security
-- definer function here opens with `if uid is null then raise` because every
-- other one answers about the caller. This one takes an id and returns a public
-- record; the guard would not make it safer, it would make it useless. Do not
-- "fix" it. Everything it reads is already anon-readable on its own — `churches`
-- is `for select using (true)` (0040) and `church_profiles` is
-- `for select using (published)` (0050) — so security definer here buys exactly
-- one thing: the roster sample, stripped of names.

create or replace function public.public_church_page(
  p_church_id     uuid,
  p_members_limit integer default 12
)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_church public.churches%rowtype;
  v_limit integer;
begin
  select * into v_church from public.churches where id = p_church_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  v_limit := least(greatest(coalesce(p_members_limit, 12), 1), 24);

  return jsonb_build_object(
    'ok', true,
    -- No `is_mine` and no `miles`: both are answers about a viewer, and there
    -- isn't one. The signed-in path still gets them from get_church_page.
    'church', public.church_json(v_church),
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
      -- Join-date order, same as get_church_page, and ordered on the aggregate
      -- rather than the subselect for the same reason 0050 spells out: jsonb_agg
      -- over an ordered subquery is not promised to come out in order, and the
      -- crowd outside the church would silently reshuffle between loads.
      select jsonb_agg(roster.m order by roster.joined nulls last, roster.username)
      from (
        select pr.church_joined_at as joined,
               pr.username,
               jsonb_build_object(
                 'avatar_emoji', pr.avatar_emoji,
                 'avatar_character', pr.avatar_character,
                 'pet', pr.pet
               ) as m
        from public.profiles pr
        where pr.church_id = v_church.id
        order by pr.church_joined_at nulls last, pr.username
        limit v_limit
      ) roster
    ), '[]'::jsonb),
    -- A head count is a fact about a place, and it is already on the board.
    -- It is not a number on any person.
    'member_total', (select count(*) from public.profiles pr where pr.church_id = v_church.id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Anon on purpose — this is the one church function a stranger may call.
-- 0050's revoke/grant on get_church_page is NOT restated here; leaving it alone
-- is the point.
revoke execute on function public.public_church_page(uuid, integer) from public;
grant execute on function public.public_church_page(uuid, integer) to anon, authenticated;

notify pgrst, 'reload schema';
