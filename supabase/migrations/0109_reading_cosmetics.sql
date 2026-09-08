-- Verse Arcade — the reading cosmetics: four borders and four badges earned by
-- opening chapters of the Bible.
-- ---------------------------------------------------------------------------
-- Until this, NOTHING in this app's wardrobe unlocked from reading scripture.
-- Every gate was streak, share, referral, live battles, battle wins, level or
-- money — in an app whose whole subject is the text. A player could open forty
-- chapters and nothing anywhere would say so.
--
-- The number this hangs on is chapters opened, ever: `bible_marks` rows of
-- kind='read' (0048). Three things make it the right one:
--
--   * It ONLY GOES UP. Marks are cumulative and the client never deletes them,
--     so a cosmetic earned here can never be taken back — the same promise
--     `longest_streak` makes for the streak ladder.
--   * The SERVER can verify it in one count. The client-side collection this
--     ships alongside (66 per-book "seals", src/data/seals.ts) cannot be
--     checked here: a seal means every chapter of one book, and that needs the
--     1,189-number structure table, which belongs in the client and should not
--     be grown here. So the collection stays derived on the client and the
--     EQUIPPABLES ride a number SQL can see.
--   * It fills the hole in the ladder. Borders and badges went 7 → 30 → 90 →
--     180 → 365 → 1000 days, so a player between their first week and their
--     first month had nothing at all to earn. Ten chapters is a first week.
--
-- These are LOOKS. No XP, no rank, nothing countable, nothing a non-reader is
-- behind on — the line every cosmetic in this app holds.
--
-- The chapter gate is checked BEFORE the streak gate and instead of it: these
-- rows carry req_streak 0 and must NOT be reachable by showing up alone. That
-- is the same trap 0096's pack gate closes, in the same order, for the same
-- reason. `founder` bypasses it, exactly as it bypasses the streak gate; the
-- operator's `is_admin` deliberately does NOT, because the client's isUnlocked
-- doesn't either — a grid that offers less than the RPC allows is harmless, and
-- the two disagreeing in the other direction is the 0067 trap.
--
-- set_cosmetics is restated WHOLESALE from 0096 (the last migration to set it),
-- plus the one branch and the count. A future migration editing it copies
-- forward from HERE, not from 0096 or 0023.
--
-- KEEP IN SYNC with BORDERS / BADGES / READING_COSMETICS in
-- src/data/cosmetics.ts — the keys and the thresholds are stated twice, the
-- usual house pair.
--
-- Idempotent — re-running is a no-op.
-- ---------------------------------------------------------------------------

insert into public.cosmetics (key, kind, req_streak) values
  ('vellum',       'border', 0),
  ('ink',          'border', 0),
  ('illumination', 'border', 0),
  ('codex',        'border', 0),
  ('bookmark',     'badge',  0),
  ('quill',        'badge',  0),
  ('scroll',       'badge',  0),
  ('codex',        'badge',  0)
on conflict (kind, key) do nothing;

create or replace function public.set_cosmetics(p_border text, p_badge text)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_long integer;
  v_founder boolean;
  v_admin boolean;
  v_owned text[];
  v_border text := coalesce(nullif(p_border, ''), 'default');
  v_badge text := nullif(p_badge, '');
  req_b integer;
  req_bd integer;
  v_chapters integer;
  -- Pack-gated borders → the skins that unlock them. Keep in sync with
  -- BORDERS in src/data/cosmetics.ts and the packs in src/data/avatar.ts.
  patron_borders text[] := array['cornerstone'];
  patron_skins text[] := array['cephas','whale'];
  -- Chapter-gated cosmetics → chapters of the Bible that must have been
  -- opened. Keep in sync with `requiredChapters` in src/data/cosmetics.ts.
  reading_borders text[] := array['vellum','ink','illumination','codex'];
  reading_border_reqs integer[] := array[10, 60, 250, 1189];
  reading_badges text[] := array['bookmark','quill','scroll','codex'];
  reading_badge_reqs integer[] := array[10, 60, 250, 1189];
  v_idx integer;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select longest_streak, founder, coalesce(is_admin, false), coalesce(owned_skins, '{}'::text[])
    into v_long, v_founder, v_admin, v_owned
    from public.profiles where id = uid;
  if v_long is null then return json_build_object('ok', false, 'reason', 'no_profile'); end if;

  select req_streak into req_b from public.cosmetics where kind = 'border' and key = v_border;
  if req_b is null then return json_build_object('ok', false, 'reason', 'unknown_border'); end if;

  -- The pack gate, before the streak gate: a patron border's req_streak is 0
  -- and must not be reachable by streak alone.
  if v_border = any(patron_borders)
     and not (v_owned && patron_skins or v_admin or v_founder) then
    return json_build_object('ok', false, 'reason', 'locked_border');
  end if;

  -- The reading gate, likewise before the streak gate and INSTEAD of it. The
  -- count is taken once and only when a reading cosmetic is actually asked
  -- for, so the ordinary equip stays a single-row read.
  v_idx := array_position(reading_borders, v_border);
  if v_idx is not null then
    if not v_founder then
      select count(*) into v_chapters
        from public.bible_marks where user_id = uid and kind = 'read';
      if v_chapters < reading_border_reqs[v_idx] then
        return json_build_object('ok', false, 'reason', 'locked_border');
      end if;
    end if;
  elsif not v_founder and v_long < req_b then
    return json_build_object('ok', false, 'reason', 'locked_border');
  end if;

  if v_badge is not null and v_badge <> 'none' then
    select req_streak into req_bd from public.cosmetics where kind = 'badge' and key = v_badge;
    if req_bd is null then return json_build_object('ok', false, 'reason', 'unknown_badge'); end if;
    v_idx := array_position(reading_badges, v_badge);
    if v_idx is not null then
      if not v_founder then
        if v_chapters is null then
          select count(*) into v_chapters
            from public.bible_marks where user_id = uid and kind = 'read';
        end if;
        if v_chapters < reading_badge_reqs[v_idx] then
          return json_build_object('ok', false, 'reason', 'locked_badge');
        end if;
      end if;
    elsif not v_founder and v_long < req_bd then
      return json_build_object('ok', false, 'reason', 'locked_badge');
    end if;
  else
    v_badge := null;
  end if;

  update public.profiles set avatar_border = v_border, avatar_badge = v_badge where id = uid;
  return json_build_object('ok', true, 'border', v_border, 'badge', v_badge);
end;
$$;

grant execute on function public.set_cosmetics(text, text) to authenticated;

notify pgrst, 'reload schema';
