-- The Keep — a denomination's hall on the Battle tab. See docs/FORTRESS.md and
-- src/data/keep.ts for the design; the load-bearing rules:
--
--   PRESENCE, NOT QUANTITY. keep_json returns which decorations fill which
--   anchors — never how many members own one, never who placed it, never a
--   per-faction total. A counted hall is a tally of faction size on a topic
--   with real sore spots, so the counting is made impossible here, at the one
--   place the data could leak.
--
--   OWNERSHIP IS DERIVED. Six lifetime battle counters per player; a
--   decoration is owned iff its challenge's counter cleared its goal (the
--   ladder lives in src/data/keep.ts). No grant rows, nothing to revoke.
--
--   NOTHING HERE RANKS. Counters feed a cosmetic ladder only. Like 0058, the
--   server clamps rather than verifies: an inflated counter is worth wall
--   furniture, not standing — battle wins that DO rank pool through the
--   existing battles tables, untouched by any of this.
--
--   NO PLAYER-AUTHORED TEXT. Placements are (anchor id, decor id) against
--   fixed catalogs. There is deliberately nowhere to write a string.

-- ── Lifetime battle counters ────────────────────────────────────────────────
create table if not exists public.keep_progress (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  cpu_played     integer not null default 0 check (cpu_played >= 0),
  cpu_won        integer not null default 0 check (cpu_won >= 0),
  battle_played  integer not null default 0 check (battle_played >= 0),
  battle_won     integer not null default 0 check (battle_won >= 0),
  battle_perfect integer not null default 0 check (battle_perfect >= 0),
  battle_combo   integer not null default 0 check (battle_combo >= 0),
  updated_at     timestamptz not null default now()
);

alter table public.keep_progress enable row level security;
drop policy if exists "keep progress self-select" on public.keep_progress;
create policy "keep progress self-select" on public.keep_progress
  for select using (auth.uid() = user_id);
-- No write policy: bump_keep_counter is the only way a row moves.

-- ── Placements ──────────────────────────────────────────────────────────────
-- Which of MY decorations sits on which anchor. Follows the player between
-- factions on purpose — furniture is yours, not the faction's.
create table if not exists public.keep_placements (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  anchor   text not null,
  decor_id text not null,
  primary key (user_id, anchor)
);

create index if not exists keep_placements_anchor_idx on public.keep_placements (anchor);

alter table public.keep_placements enable row level security;
drop policy if exists "keep placements self-select" on public.keep_placements;
create policy "keep placements self-select" on public.keep_placements
  for select using (auth.uid() = user_id);

-- ── Bump a counter ──────────────────────────────────────────────────────────
create or replace function public.bump_keep_counter(p_counter text, p_delta integer)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_delta integer;
  r public.keep_progress;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_counter not in ('cpu_played','cpu_won','battle_played','battle_won','battle_perfect','battle_combo') then
    raise exception 'bad counter';
  end if;
  -- One event moves a counter by one. Clamped, not verified: the ladder is
  -- cosmetic and bounded, same doctrine as 0058's per-source caps.
  v_delta := greatest(0, least(coalesce(p_delta, 1), 1));

  insert into public.keep_progress (user_id) values (uid)
  on conflict (user_id) do nothing;

  execute format(
    'update public.keep_progress set %I = %I + $1, updated_at = now() where user_id = $2',
    p_counter, p_counter
  ) using v_delta, uid;

  select * into r from public.keep_progress where user_id = uid;
  return json_build_object('counters', json_build_object(
    'cpu_played', r.cpu_played, 'cpu_won', r.cpu_won,
    'battle_played', r.battle_played, 'battle_won', r.battle_won,
    'battle_perfect', r.battle_perfect, 'battle_combo', r.battle_combo
  ));
end;
$$;

grant execute on function public.bump_keep_counter(text, integer) to authenticated;

-- ── Place a decoration ──────────────────────────────────────────────────────
create or replace function public.set_keep_placement(p_anchor text, p_decor text)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  -- The anchor set is fixed (src/data/keep.ts ANCHORS). Validating against it
  -- bounds rows per player and keeps free text out of the table entirely.
  if p_anchor !~ '^(banner_[lr]|wall_[123]|rafters_[12]|table_[12]|floor_[12]|stable_1)$' then
    raise exception 'bad anchor';
  end if;

  if p_decor is null then
    delete from public.keep_placements where user_id = uid and anchor = p_anchor;
    return json_build_object('ok', true);
  end if;

  if p_decor !~ '^keep_[a-z_]{1,40}$' then raise exception 'bad decor'; end if;

  insert into public.keep_placements (user_id, anchor, decor_id)
  values (uid, p_anchor, p_decor)
  on conflict (user_id, anchor) do update set decor_id = excluded.decor_id;
  return json_build_object('ok', true);
end;
$$;

grant execute on function public.set_keep_placement(text, text) to authenticated;

-- ── My counters + placements, one read ──────────────────────────────────────
create or replace function public.my_keep()
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.keep_progress;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into r from public.keep_progress where user_id = uid;
  return json_build_object(
    'counters', json_build_object(
      'cpu_played', coalesce(r.cpu_played, 0), 'cpu_won', coalesce(r.cpu_won, 0),
      'battle_played', coalesce(r.battle_played, 0), 'battle_won', coalesce(r.battle_won, 0),
      'battle_perfect', coalesce(r.battle_perfect, 0), 'battle_combo', coalesce(r.battle_combo, 0)
    ),
    'placements', coalesce((
      select json_object_agg(anchor, decor_id) from public.keep_placements where user_id = uid
    ), '{}'::json)
  );
end;
$$;

grant execute on function public.my_keep() to authenticated;

-- ── A faction's hall ────────────────────────────────────────────────────────
-- One read for the whole sheet, so the board and the hall can't drift apart
-- (the church_json argument). Returns:
--   wins        — the faction's pooled completed-battle wins (drives level)
--   members     — up to 11, ordered by join date; a crowd, not a census
--   member_total— the head count the board already shows
--   placements  — anchor -> decor. The caller's OWN placements where set,
--                 backfilled per-anchor with a deterministic sample of other
--                 members' — seeded by the viewer, so it varies by visitor and
--                 ranks nobody. NO totals, NO owners, NO names attached.
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
        'is_me', id = uid
      ))
      from (
        select id, username, avatar_emoji, avatar_character
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
        -- The viewer's own placement wins its anchor; other members fill the
        -- rest, sampled stably per viewer. md5 keeps it deterministic without
        -- exposing whose placement was chosen.
        order by kp.anchor,
                 (kp.user_id = uid) desc,
                 md5(uid::text || kp.user_id::text || kp.anchor)
      ) s
    ), '{}'::json)
  );
end;
$$;

grant execute on function public.keep_json(text) to authenticated;

notify pgrst, 'reload schema';
