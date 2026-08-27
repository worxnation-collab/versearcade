-- The churchyard — landscaping earned by giving.
--
-- See src/features/church/yard.ts for the design of record. The rules that
-- have to hold on this side of the wire:
--
--   EARNED BY GIVING, AND ONLY BY GIVING. A plant is allowed iff the caller's
--   LIFETIME given (every church they've ever given to) clears its threshold.
--   Nothing grants flora, nothing sells it, and there is no revoke: the sum
--   only goes up, so switching churches keeps every flower — the points were a
--   gift, not a deposit (leave_church already says so to the player).
--
--   PLANTINGS ARE PER-PLAYER, THE YARD IS SHARED. Rows are (user, church,
--   plot). `church_yard_json` blends them into one yard per viewer the same
--   way `keep_json` blends a hall: your own planting wins its plot, other
--   members sample-fill the rest, deterministically per viewer.
--
--   PRESENCE, NOT QUANTITY. The yard RPC returns which plots hold what and
--   nothing else — never how many members planted, never who planted a plot,
--   never a per-member total. This is the one place that data could leak, so
--   it's the place the leak is made impossible.
--
--   NO PLAYER-AUTHORED TEXT. Plantings are (plot id, flora id) against fixed
--   catalogs. There is deliberately nowhere to write a string.
--
-- Idempotent throughout: create ... if not exists, drop policy if exists,
-- create or replace function.

-- ── What's planted where ────────────────────────────────────────────────────
-- Per church on purpose, not per player: the yard you planted at the church you
-- used to attend stays that church's yard, and coming back finds it as you left
-- it. `on delete cascade` on both sides, so a deleted church takes its beds.
create table if not exists public.church_yard_placements (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  church_id uuid not null references public.churches(id) on delete cascade,
  plot      text not null,
  flora_id  text not null,
  primary key (user_id, church_id, plot)
);

create index if not exists church_yard_church_idx on public.church_yard_placements (church_id);

alter table public.church_yard_placements enable row level security;
drop policy if exists "church yard self-select" on public.church_yard_placements;
create policy "church yard self-select" on public.church_yard_placements
  for select using (auth.uid() = user_id);
-- No write policy: set_church_yard_placement is the only way a row moves.

-- ── Lifetime given ──────────────────────────────────────────────────────────
-- Across every church, which is what makes the ladder survive a switch.
create or replace function public.church_lifetime_given(p_user uuid)
returns bigint
language sql
stable
security definer set search_path = public
as $$
  select coalesce(sum(points), 0)::bigint
  from public.church_contributions
  where user_id = p_user;
$$;

-- ── The unlock ladder ───────────────────────────────────────────────────────
-- KEEP IN SYNC with FLORA in src/features/church/yard.ts — the client draws the
-- ladder from its copy and greys out what isn't earned; this one decides. An
-- unknown id returns null, which `set_church_yard_placement` rejects, so a new
-- plant is inert until both sides know about it.
create or replace function public.church_flora_min_given(p_flora text)
returns bigint
language sql
immutable
as $$
  select case p_flora
    when 'yard_planters'   then 250
    when 'yard_marigolds'  then 1000
    when 'yard_lilies'     then 3000
    when 'yard_rosebush'   then 7500
    when 'yard_hedge'      then 15000
    when 'yard_lamp'       then 30000
    when 'yard_sunflowers' then 60000
    when 'yard_dogwood'    then 120000
    else null
  end::bigint;
$$;

-- ── Plant something ─────────────────────────────────────────────────────────
create or replace function public.set_church_yard_placement(p_plot text, p_flora text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_church_id uuid;
  v_need bigint;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select church_id into v_church_id from public.profiles where id = uid;
  if v_church_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_church');
  end if;

  -- The plot set is fixed (PLOTS in src/features/church/yard.ts). Validating
  -- against it bounds rows per player and keeps free text out of the table.
  if p_plot !~ '^(bed_[lr]|lawn_[lr]|path_[lr])$' then raise exception 'bad plot'; end if;

  if p_flora is null then
    delete from public.church_yard_placements
     where user_id = uid and church_id = v_church_id and plot = p_plot;
    return jsonb_build_object('ok', true);
  end if;

  v_need := public.church_flora_min_given(p_flora);
  if v_need is null then raise exception 'bad flora'; end if;

  -- Unlike the keep's counters, this one is VERIFIED rather than clamped: the
  -- number it's checked against is a real sum of real rows the server wrote
  -- itself, so there's nothing to trust the client about and no reason not to.
  if public.church_lifetime_given(uid) < v_need then
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;

  insert into public.church_yard_placements (user_id, church_id, plot, flora_id)
  values (uid, v_church_id, p_plot, p_flora)
  on conflict (user_id, church_id, plot) do update set flora_id = excluded.flora_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ── My yard, one read ───────────────────────────────────────────────────────
create or replace function public.my_church_yard()
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_church_id uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select church_id into v_church_id from public.profiles where id = uid;

  return jsonb_build_object(
    -- Lifetime, so the ladder is intact the moment somebody switches churches.
    'given', public.church_lifetime_given(uid),
    'plantings', coalesce((
      select jsonb_object_agg(plot, flora_id)
      from public.church_yard_placements
      where user_id = uid and church_id = v_church_id
    ), '{}'::jsonb)
  );
end;
$$;

-- ── A church's yard ─────────────────────────────────────────────────────────
-- Plot -> flora for the scene behind a leaderboard row. The caller's OWN
-- planting wins its plot; other members fill the rest, sampled stably per
-- viewer, so the yard varies by visitor and ranks nobody. NO totals, NO
-- planters, NO names attached — same shape and the same reasons as keep_json.
create or replace function public.church_yard_json(p_church_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_church_id is null then raise exception 'bad church'; end if;

  return jsonb_build_object(
    'plantings', coalesce((
      select jsonb_object_agg(plot, flora_id)
      from (
        select distinct on (yp.plot) yp.plot, yp.flora_id
        from public.church_yard_placements yp
        where yp.church_id = p_church_id
        -- md5 keeps the sample deterministic per viewer without exposing whose
        -- planting was chosen.
        order by yp.plot,
                 (yp.user_id = uid) desc,
                 md5(uid::text || yp.user_id::text || yp.plot)
      ) s
    ), '{}'::jsonb)
  );
end;
$$;

grant execute on function public.church_lifetime_given(uuid) to authenticated;
grant execute on function public.church_flora_min_given(text) to anon, authenticated;
grant execute on function public.set_church_yard_placement(text, text) to authenticated;
grant execute on function public.my_church_yard() to authenticated;
grant execute on function public.church_yard_json(uuid) to authenticated;

notify pgrst, 'reload schema';
