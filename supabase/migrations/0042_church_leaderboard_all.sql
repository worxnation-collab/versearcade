-- Add a worldwide scope to the church board.
--
-- The local radii are still the point of the feature — a small congregation
-- competing with the ones across town — but people want to see the whole ladder
-- too, so the board grows an "All" chip alongside 10/20/30/50 miles.
--
-- Signalled by passing p_radius_miles => null, i.e. "no distance limit". This
-- deliberately keeps the existing (numeric, integer) signature rather than
-- adding a scope argument: a new argument would create a second overload and
-- PostgREST would have to disambiguate, and every already-deployed client sends
-- a real number here, so their behaviour is untouched.
--
-- "Active" means a church someone actually plays for or has given to. A row
-- that was created by a pick and then abandoned has nothing to rank, but a
-- church whose members haven't given yet still belongs on the board — otherwise
-- you couldn't find yourself on it the day you join.

create or replace function public.church_leaderboard(
  p_radius_miles numeric default 25,
  p_limit        integer default 25
)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_mine public.churches%rowtype;
  v_has_mine boolean := false;
  v_radius numeric;
  v_limit integer;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  v_limit := least(greatest(coalesce(p_limit, 25), 1), 50);

  select c.* into v_mine
  from public.churches c
  join public.profiles p on p.church_id = c.id
  where p.id = uid;
  v_has_mine := found;

  -- ---------------------------------------------------------------------
  -- Worldwide
  -- ---------------------------------------------------------------------
  if p_radius_miles is null then
    return (
      with active as (
        select c,
               (select count(*) from public.profiles pr where pr.church_id = c.id) as members
        from public.churches c
      ),
      kept as (
        select a.c, a.members from active a where (a.c).xp > 0 or a.members > 0
      ),
      ranked as (
        select k.c as church,
               row_number() over (order by (k.c).xp desc, (k.c).created_at) as rank,
               -- Still show how far away each one is, when we know where the
               -- viewer's church is. Null for a viewer without one.
               case when v_has_mine
                    then round(public.miles_between(v_mine.lat, v_mine.lng, (k.c).lat, (k.c).lng)::numeric, 1)
               end as miles
        from kept k
      )
      select jsonb_build_object(
        'scope', 'all',
        'radius_miles', null,
        'total', (select count(*) from ranked),
        'rows', coalesce((
          select jsonb_agg(
            public.church_json(r.church) || jsonb_build_object(
              'rank', r.rank,
              'miles', r.miles,
              'is_mine', v_has_mine and (r.church).id = v_mine.id
            ) order by r.rank
          )
          from (select * from ranked order by rank limit v_limit) r
        ), '[]'::jsonb),
        'me', (
          select public.church_json(r.church) || jsonb_build_object(
            'rank', r.rank, 'miles', 0, 'is_mine', true
          )
          from ranked r where v_has_mine and (r.church).id = v_mine.id
        )
      )
    );
  end if;

  -- ---------------------------------------------------------------------
  -- Within a radius of my church
  -- ---------------------------------------------------------------------
  if not v_has_mine then
    return jsonb_build_object('scope', 'radius', 'rows', '[]'::jsonb, 'me', null, 'total', 0, 'radius_miles', p_radius_miles);
  end if;

  v_radius := least(greatest(p_radius_miles, 1), 100);

  return (
    with near as (
      select c as church, public.miles_between(v_mine.lat, v_mine.lng, c.lat, c.lng) as miles
      from public.churches c
      -- Degrees-of-latitude prebox so the index does the coarse work; 1.5° is
      -- ~103 miles, comfortably wider than the 100-mile cap above.
      where c.lat between v_mine.lat - 1.5 and v_mine.lat + 1.5
        and c.lng between v_mine.lng - 1.5 and v_mine.lng + 1.5
    ),
    inside as (
      -- Same "active" rule as the worldwide scope, so a church that was picked
      -- once and then abandoned doesn't sit on the local board with nothing on it.
      select n.* from near n
      where n.miles <= v_radius
        and (
          (n.church).xp > 0
          or exists (select 1 from public.profiles pr where pr.church_id = (n.church).id)
        )
    ),
    ranked as (
      select i.church, i.miles,
             row_number() over (order by (i.church).xp desc, (i.church).created_at) as rank
      from inside i
    )
    select jsonb_build_object(
      'scope', 'radius',
      'radius_miles', v_radius,
      'total', (select count(*) from ranked),
      'rows', coalesce((
        select jsonb_agg(
          public.church_json(r.church) || jsonb_build_object(
            'rank', r.rank,
            'miles', round(r.miles::numeric, 1),
            'is_mine', (r.church).id = v_mine.id
          ) order by r.rank
        )
        from (select * from ranked order by rank limit v_limit) r
      ), '[]'::jsonb),
      'me', (
        select public.church_json(r.church) || jsonb_build_object(
          'rank', r.rank, 'miles', 0, 'is_mine', true
        )
        from ranked r where (r.church).id = v_mine.id
      )
    )
  );
end;
$$;

notify pgrst, 'reload schema';
