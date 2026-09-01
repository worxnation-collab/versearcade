-- Battles come in two flavours now: the VERSE round this app has always had,
-- and a TRIVIA round about the book it comes from.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY A COLUMN, when the seed could have carried it
--
-- Every battle in this app is one number: `battles.seed`, which both devices
-- feed to `battleVerse()` to rebuild the identical verse and questions. So the
-- cheap version of this feature is to encode the mode INSIDE the seed — a
-- parity bit, or a reserved range — and ship no migration at all.
--
-- That was rejected, and the reason is worth writing down because it is the
-- kind of bug that only appears in production a day later. Changing how a seed
-- maps to a deal re-deals EVERY PENDING BATTLE: a challenge sent an hour ago
-- stores a seed, its opponent's client rebuilds the round from that seed when
-- they accept, and a client that reads the same number differently hands the
-- two players different questions with the same score column underneath. There
-- is no version on a battle row to tell them apart, and the failure is silent
-- on both screens.
--
-- So the mode is ADDITIVE, exactly as `live` was in 0086: a column with a
-- default, which makes every row written before today a verse battle — which is
-- what they are — and leaves `battleVerse(seed)` byte-identical for a seed it
-- has already seen.
--
-- LIVE BATTLES DO NOT USE THIS COLUMN, and that is deliberate rather than an
-- omission. A live match has no row until it is over, and its verse is DERIVED
-- from the room code rather than sent (`seedForRoom`) precisely so there is no
-- announce-the-deal message to lose or race. The mode is derived the same way,
-- from the same room and round (`modeForRoom`) — so neither device decides for
-- the other, which is the rule the rematch handshake exists to protect. The
-- column is still written for a live battle when the host records the result,
-- because it is a true fact about the match that the result screen and any
-- future list can read.
--
-- WHAT IS NOT HERE: the mode changes which QUESTIONS are asked and nothing
-- else. It is not a difficulty, it is not scored differently, it does not
-- appear on `battle_leaderboard`, and `award_battle_xp` is untouched — winner
-- and loser are still paid the identical 10 XP for turning up, and no board
-- separates a trivia win from a verse win. A mode that ranked differently would
-- be two ladders where this app has trouble enough with one.

alter table public.battles
  add column if not exists mode text not null default 'verse';

-- Constrained rather than free text: the client rebuilds a DEAL from this, so
-- an unknown value is not a cosmetic label, it is a round nobody can play. The
-- check is added separately and idempotently so re-running the file is a no-op.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'battles_mode_check'
  ) then
    alter table public.battles
      add constraint battles_mode_check check (mode in ('verse', 'trivia'));
  end if;
end $$;

-- ── battle_json: one key added ───────────────────────────────────────────────
-- Restated wholesale from 0030, which is the version in production. An older
-- client simply ignores the new key and keeps playing verse battles, which is
-- what its own `battleVerse(seed)` builds anyway — so a baked `dist` in an
-- already-approved iOS build stays correct rather than merely not crashing.
create or replace function public.battle_json(b public.battles)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'id', b.id, 'seed', b.seed, 'status', b.status, 'winner', b.winner, 'created_at', b.created_at,
    'broadcast', b.broadcast, 'is_welcome', b.is_welcome,
    'mode', coalesce(b.mode, 'verse'),
    'is_challenger', b.challenger_id = auth.uid(),
    'is_opponent', b.opponent_id is not null and b.opponent_id = auth.uid(),
    'is_invited', b.invited_id is not null and b.invited_id = auth.uid(),
    'invited', case when b.invited_id is null then null else (select p.username from public.profiles p where p.id = b.invited_id) end,
    'challenger', (
      select jsonb_build_object('username', p.username, 'avatar_emoji', p.avatar_emoji,
        'avatar_character', p.avatar_character, 'score', b.challenger_score, 'time_ms', b.challenger_time_ms)
      from public.profiles p where p.id = b.challenger_id
    ),
    'opponent', case when b.opponent_id is null then null else (
      select jsonb_build_object('username', p.username, 'avatar_emoji', p.avatar_emoji,
        'avatar_character', p.avatar_character, 'score', b.opponent_score, 'time_ms', b.opponent_time_ms)
      from public.profiles p where p.id = b.opponent_id
    ) end
  );
$$;

-- ── create_battle: one argument added, at the end ────────────────────────────
-- DROPPED and recreated rather than overloaded, for 0086's reason restated:
-- leaving the seven-argument signature standing means PostgREST resolves an old
-- client's seven named arguments to the OLD function, and the two would drift
-- apart invisibly. With the old one gone, those same seven arguments resolve
-- here and `p_mode` defaults to 'verse' — which is exactly what that client is
-- playing, since it has no picker.
drop function if exists public.create_battle(bigint, int, int, text, boolean, boolean, date);
create or replace function public.create_battle(
  p_seed bigint,
  p_score int,
  p_time_ms int,
  p_invited text default null,
  p_broadcast boolean default false,
  p_live boolean default false,
  p_local_date date default null,
  p_mode text default 'verse'
)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_invited uuid; v_mode text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  -- Fail CLOSED to the mode this app has always had rather than raising: an
  -- unrecognised value is a client bug, and refusing the insert would throw
  -- away a run the player has already finished.
  v_mode := case when p_mode = 'trivia' then 'trivia' else 'verse' end;
  if p_invited is not null and p_invited <> '' then
    select id into v_invited from public.profiles where lower(username) = lower(p_invited);
    if v_invited = auth.uid() then v_invited := null; end if;
  end if;
  insert into public.battles(challenger_id, invited_id, seed, challenger_score, challenger_time_ms, broadcast, live, mode)
  values (auth.uid(), v_invited, p_seed, p_score, p_time_ms, coalesce(p_broadcast, false), coalesce(p_live, false), v_mode)
  returning id into v_id;

  -- The challenger has played their round by the time this is called (the schema
  -- forces it — the row carries their score), so this is their run being paid
  -- for, not the invitation. Untouched by the mode: what is paid for is turning
  -- up, and a trivia round is a whole run exactly as a verse round is.
  perform public.award_battle_xp(v_id, p_local_date);
  return v_id;
end; $$;

grant execute on function public.create_battle(bigint, int, int, text, boolean, boolean, date, text) to authenticated;
