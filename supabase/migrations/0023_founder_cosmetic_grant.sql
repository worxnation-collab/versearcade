-- Verse Arcade — a "founder" grant that unlocks the streak cosmetics.
-- ---------------------------------------------------------------------------
-- Some accounts earn their flair a different way — e.g. driving all the app's
-- promotion. Rather than fake a 1000-day streak (which would lie on the
-- leaderboard and in stats), a per-profile `founder` flag lets set_cosmetics()
-- bypass the streak gate for that account, so they can equip any border/badge
-- including the animated Halo of Light (the "spinning emblem", req 1000 days).
--
-- The flag is server-authoritative and cannot be set by clients — there's no
-- RLS write path to it; it's toggled here (and by the operator) directly.
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists founder boolean not null default false;

-- set_cosmetics(), founder-aware: a founder skips the longest_streak gate but
-- still can't equip a cosmetic key that doesn't exist (no spoofing junk keys).
create or replace function public.set_cosmetics(p_border text, p_badge text)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_long integer;
  v_founder boolean;
  v_border text := coalesce(nullif(p_border, ''), 'default');
  v_badge text := nullif(p_badge, '');
  req_b integer;
  req_bd integer;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select longest_streak, founder into v_long, v_founder from public.profiles where id = uid;
  if v_long is null then return json_build_object('ok', false, 'reason', 'no_profile'); end if;

  select req_streak into req_b from public.cosmetics where kind = 'border' and key = v_border;
  if req_b is null then return json_build_object('ok', false, 'reason', 'unknown_border'); end if;
  if not v_founder and v_long < req_b then return json_build_object('ok', false, 'reason', 'locked_border'); end if;

  if v_badge is not null and v_badge <> 'none' then
    select req_streak into req_bd from public.cosmetics where kind = 'badge' and key = v_badge;
    if req_bd is null then return json_build_object('ok', false, 'reason', 'unknown_badge'); end if;
    if not v_founder and v_long < req_bd then return json_build_object('ok', false, 'reason', 'locked_badge'); end if;
  else
    v_badge := null;
  end if;

  update public.profiles set avatar_border = v_border, avatar_badge = v_badge where id = uid;
  return json_build_object('ok', true, 'border', v_border, 'badge', v_badge);
end;
$$;

grant execute on function public.set_cosmetics(text, text) to authenticated;

-- Grant the founder flair to the promoter account.
update public.profiles set founder = true where username = 'sharkbait';

notify pgrst, 'reload schema';
