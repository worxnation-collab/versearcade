-- Verse Arcade — editable username + streak-unlocked profile cosmetics.
-- ---------------------------------------------------------------------------
-- Two additions:
--  1. set_username() — a validated, uniqueness-safe rename (the username is a
--     UNIQUE column, so a raw client update would throw a raw constraint error).
--  2. Profile cosmetics: an avatar border + an optional badge emblem, unlocked
--     by streak milestones (7d, 30d, 90d, 180d, 365d, 1000d). Unlock eligibility
--     is derived from longest_streak (best ever) so a missed day never strips a
--     cosmetic the player earned. set_cosmetics() gates equipping server-side.
-- ---------------------------------------------------------------------------

-- Equipped cosmetics live on the profile. Borders always resolve to a value
-- ('default' = the classic gold ring); badge is null when none is equipped.
alter table public.profiles add column if not exists avatar_border text not null default 'default';
alter table public.profiles add column if not exists avatar_badge  text;

-- Catalog of cosmetics and the streak each one requires. Keys + thresholds
-- mirror src/data/cosmetics.ts (the client owns the visual styling). Kept
-- server-side so equipping can be validated and can't be spoofed.
create table if not exists public.cosmetics (
  key        text not null,
  kind       text not null,              -- 'border' | 'badge'
  req_streak integer not null default 0, -- longest_streak needed to unlock
  primary key (kind, key)
);

insert into public.cosmetics (key, kind, req_streak) values
  ('default','border',0),
  ('ember','border',7),
  ('silver','border',30),
  ('gold','border',90),
  ('amethyst','border',180),
  ('aurora','border',365),
  ('halo','border',1000),
  ('none','badge',0),
  ('flame','badge',7),
  ('star','badge',30),
  ('medal','badge',90),
  ('gem','badge',180),
  ('crown','badge',365),
  ('halo','badge',1000)
on conflict (kind, key) do nothing;

-- Catalog is public (it's just labels + thresholds).
alter table public.cosmetics enable row level security;
drop policy if exists "cosmetics readable" on public.cosmetics;
create policy "cosmetics readable" on public.cosmetics for select using (true);

-- Rename: normalize, length-check, ensure free, then update. display_name is
-- kept in step with the handle (it's only ever shown as @username in this app).
create or replace function public.set_username(p_username text)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  clean text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  clean := lower(regexp_replace(coalesce(p_username, ''), '[^a-z0-9_]', '', 'g'));
  if length(clean) < 2 or length(clean) > 16 then
    return json_build_object('ok', false, 'reason', 'invalid');
  end if;
  if exists (select 1 from public.profiles where username = clean and id <> uid) then
    return json_build_object('ok', false, 'reason', 'taken');
  end if;
  update public.profiles set username = clean, display_name = clean where id = uid;
  return json_build_object('ok', true, 'username', clean);
exception when unique_violation then
  -- Lost a race between the check and the update.
  return json_build_object('ok', false, 'reason', 'taken');
end;
$$;

grant execute on function public.set_username(text) to authenticated;

-- Equip cosmetics, refusing anything the player's longest streak hasn't unlocked.
-- p_badge may be null / '' / 'none' to clear the badge.
create or replace function public.set_cosmetics(p_border text, p_badge text)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_long integer;
  v_border text := coalesce(nullif(p_border, ''), 'default');
  v_badge text := nullif(p_badge, '');
  req_b integer;
  req_bd integer;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select longest_streak into v_long from public.profiles where id = uid;
  if v_long is null then return json_build_object('ok', false, 'reason', 'no_profile'); end if;

  select req_streak into req_b from public.cosmetics where kind = 'border' and key = v_border;
  if req_b is null then return json_build_object('ok', false, 'reason', 'unknown_border'); end if;
  if v_long < req_b then return json_build_object('ok', false, 'reason', 'locked_border'); end if;

  if v_badge is not null and v_badge <> 'none' then
    select req_streak into req_bd from public.cosmetics where kind = 'badge' and key = v_badge;
    if req_bd is null then return json_build_object('ok', false, 'reason', 'unknown_badge'); end if;
    if v_long < req_bd then return json_build_object('ok', false, 'reason', 'locked_badge'); end if;
  else
    v_badge := null;
  end if;

  update public.profiles set avatar_border = v_border, avatar_badge = v_badge where id = uid;
  return json_build_object('ok', true, 'border', v_border, 'badge', v_badge);
end;
$$;

grant execute on function public.set_cosmetics(text, text) to authenticated;
