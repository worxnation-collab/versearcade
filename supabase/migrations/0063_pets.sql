-- Pets — a companion beside you on your own profile.
--
-- See src/data/pets.ts for the design. What matters on this side:
--
--   IT IS NOT A STAT. A pet touches no XP, no points, no streak, no standing
--   and no board. There is nothing here for anyone to be beaten by, which is
--   the only reason a collectible gets to exist next to the rank-free rule.
--
--   EARNED BY LEVEL, AND ONLY BY LEVEL. Player level is already the server's
--   own number, written by the play RPCs — so unlike the keep's counters there
--   is nothing to clamp or take on trust here, and the gate is a real check
--   against a real column.
--
--   NOTHING SELLS ONE. No price, no promo code, no drop, no trade. So the
--   surface is identical on the web and in the App Store build and
--   `commerce.ts` never has to know it exists.
--
-- Idempotent: add column if not exists, create or replace function.

alter table public.profiles add column if not exists pet text;

-- ── The ladder ──────────────────────────────────────────────────────────────
-- KEEP IN SYNC with PETS in src/data/pets.ts. An unknown id returns null, which
-- set_pet rejects, so a new pet is inert until both sides know about it.
create or replace function public.pet_min_level(p_pet text)
returns integer
language sql
immutable
as $$
  select case p_pet
    when 'pet_lamb'     then 10
    when 'pet_dove'     then 15
    when 'pet_raven'    then 20
    when 'pet_lion_cub' then 26
    when 'pet_donkey'   then 33
    when 'pet_camel'    then 40
    else null
  end::integer;
$$;

-- ── Equip one ───────────────────────────────────────────────────────────────
create or replace function public.set_pet(p_pet text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_level integer;
  v_need integer;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  -- null clears it. Taking a pet off is always allowed: nothing about this is
  -- a commitment.
  if p_pet is null then
    update public.profiles set pet = null where id = uid;
    return jsonb_build_object('ok', true, 'pet', null);
  end if;

  v_need := public.pet_min_level(p_pet);
  if v_need is null then raise exception 'bad pet'; end if;

  select level into v_level from public.profiles where id = uid;
  if coalesce(v_level, 1) < v_need then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'need', v_need);
  end if;

  update public.profiles set pet = p_pet where id = uid;
  return jsonb_build_object('ok', true, 'pet', p_pet);
end;
$$;

grant execute on function public.pet_min_level(text) to anon, authenticated;
grant execute on function public.set_pet(text) to authenticated;

notify pgrst, 'reload schema';
