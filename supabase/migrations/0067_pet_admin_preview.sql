-- The operator account previews every pet, the way it already previews every
-- skin.
--
-- Skins have had this since 0031: `enforce_skin_entitlement` lets an
-- `is_admin` profile through, and `skinOwned` mirrors it client-side with
-- `if (ctx.admin) return true`. Pets had no such door, so the one account that
-- has to screenshot a companion, check its scale against a skin, or answer
-- "what does the camel look like" would have had to grind a 30-day streak
-- first.
--
-- Why this is safe where a real unlock would not be:
--
--   * `is_admin` is server-authoritative. It is set by hand in 0026 and no
--     client-callable RPC writes it (see `require_admin`), so this is not a
--     flag anybody can give themselves. Compare the keep's counters, which 0059
--     clamps rather than verifies precisely because a client CAN move them.
--   * It grants no standing. The two XP pets are worth 3-5% of one daily drop
--     and the operator account is not on a board anybody competes with; the
--     rest is a halo and study-drop odds, and a study drop pays nothing
--     rankable (0055).
--   * It is a preview, not a grant. Nothing is written to the profile beyond
--     the equipped `pet` that set_pet already writes, so revoking is a matter
--     of clearing `is_admin` — there is no entitlement row left behind.
--
-- KEEP IN SYNC with src/data/pets.ts (`petUnlocked`'s `admin` argument). The
-- grid and this function have to agree about who may equip what, or the picker
-- offers an admin six pets and set_pet refuses five of them.
--
-- Idempotent: `create or replace`, and the body is 0064's with one branch
-- added, so re-running it is a no-op.

create or replace function public.pet_requirements_met(p_user uuid, p_pet text)
returns boolean
language plpgsql
stable
security definer set search_path = public
as $$
declare
  prof public.profiles%rowtype;
  v_need integer := public.pet_min_level(p_pet);
begin
  if v_need is null then return false; end if;
  select * into prof from public.profiles where id = p_user;
  if not found then return false; end if;

  -- NEW in 0067: the operator preview. Placed after the `pet_min_level` check
  -- so an unknown pet id is still rejected for everybody — an admin may skip
  -- the requirements, not invent a pet the client can't draw.
  if coalesce(prof.is_admin, false) then return true; end if;

  if coalesce(prof.level, 1) < v_need then return false; end if;

  -- The coalesce around the whole case is not decoration. A player with no
  -- keep_progress row makes that subquery NULL, the case NULL, and `if not
  -- NULL` is not true — so set_pet would fall straight past its "locked"
  -- return and equip the pet. Anything that can be NULL here has to become
  -- false before it leaves this function.
  return coalesce(
    case p_pet
      when 'pet_lamb' then true
      when 'pet_dove' then coalesce(prof.longest_streak, 0) >= 7
      when 'pet_raven' then (
        select count(*) from public.bible_marks
        where user_id = p_user and kind = 'studied'
      ) >= 250
      when 'pet_lion_cub' then
        coalesce((select cpu_won from public.keep_progress where user_id = p_user), 0) >= 25
      when 'pet_donkey' then coalesce(prof.total_plays, 0) >= 150
      when 'pet_camel' then coalesce(prof.longest_streak, 0) >= 30
      else false
    end,
    false
  );
end;
$$;

grant execute on function public.pet_requirements_met(uuid, text) to authenticated;

notify pgrst, 'reload schema';
