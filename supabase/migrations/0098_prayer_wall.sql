-- The Prayer Wall — leave a note, or hold a candle for somebody else's.
--
-- A player tucks ONE request into the wall (a category, an optional line, and
-- whether to sign it with their face). Anybody else who comes to the wall is
-- DEALT a note — the wall hands one out, they never browse — and kneeling for
-- it (a held candle on the client, one row here) pays the person who knelt
-- 1 XP. The requester learns only that somebody knelt today, and how many have
-- over the note's life, and that number is theirs alone.
--
-- THIS IS THE FIRST PLAYER-AUTHORED TEXT IN THE APP, and the shape of the data
-- is what keeps that small:
--
--   • THE CATEGORY IS WHAT TRAVELS. Every note carries one of eight fixed
--     tokens, and that token is all a stranger is shown. The optional LINE
--     (120 chars, control characters stripped) is returned ONLY to members of
--     the requester's own church and to accepted buddies — people who already
--     know the requester by name. Global reach, no global moderation surface.
--   • ANONYMOUS BY DEFAULT. A note shows its category and nothing about who
--     left it unless they chose `signed`. Health and grief are the reasons
--     people leave these.
--   • ONE OPEN NOTE PER PERSON, and it expires in seven days (renewable once).
--     The wall stays fresh, nothing accumulates, and no archive of anybody's
--     hard week is kept for longer than it takes to pray over it.
--   • REPORTED IS HIDDEN. One report takes a note off the wall pending an
--     operator's look (admin_prayer_reports); the operator either hides it for
--     good or puts it back. The requester is never told who reported it.
--
-- THE XP IS THE BASIN'S (0068), EXACTLY. `xp` is the worldwide leaderboard
-- (0006), so: the server counts the rows and pays, the client never sends an
-- amount, ONE XP, TWELVE A DAY, once per note per day by the primary key,
-- never for your own note. THE REQUESTER IS PAID NOTHING — not one point, not
-- a rung — or people would post notes to farm sympathy. Dates are the player's
-- local date clamped +/-1, the house pattern.
--
-- NO NUMBER ON ANY NOTE, EVER. `draw_prayer_request` returns no count of how
-- many have prayed over a note, and neither does the wall's public shape: a
-- wall where one note blazes and one is dark is a ladder of who is loved.
-- The only counts that exist are (a) YOUR OWN note's tally, returned to you
-- and nobody else (the my_washings rule), and (b) how many notes are in the
-- wall tonight — a number about the room, not about a person.
--
-- KEEP IN SYNC with src/data/prayerWall.ts (the category list, the cap, the
-- line length, the expiry) — the usual client/server mirror.

create table if not exists public.prayer_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  category     text not null check (category in (
                 'healing', 'work', 'decision', 'grief', 'family', 'journey', 'peace', 'thanks')),
  line         text check (line is null or char_length(line) <= 120),
  signed       boolean not null default false,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '7 days',
  renewed      boolean not null default false,
  answered_at  timestamptz,
  withdrawn_at timestamptz,
  reported_at  timestamptz,
  reported_by  uuid references public.profiles(id) on delete set null,
  -- An operator's decision. A hidden note is gone from the wall for good; its
  -- owner still sees it as theirs, so nothing vanishes without explanation.
  hidden       boolean not null default false
);

create index if not exists prayer_requests_user_idx
  on public.prayer_requests (user_id, created_at desc);
-- The draw: open notes only.
create index if not exists prayer_requests_open_idx
  on public.prayer_requests (expires_at)
  where answered_at is null and withdrawn_at is null and reported_at is null and not hidden;
create index if not exists prayer_requests_answered_idx
  on public.prayer_requests (answered_at desc)
  where answered_at is not null;

create table if not exists public.prayer_intercessions (
  request_id uuid not null references public.prayer_requests(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  prayed_on  date not null,
  created_at timestamptz not null default now(),
  primary key (request_id, user_id, prayed_on)
);

create index if not exists prayer_intercessions_user_idx
  on public.prayer_intercessions (user_id, prayed_on desc);

alter table public.prayer_requests enable row level security;
alter table public.prayer_intercessions enable row level security;
-- No policies on purpose: every read and write goes through the SECURITY
-- DEFINER functions below, the same as feet_washings (0068).

-- ── helpers ──────────────────────────────────────────────────────────────────

/** Is this note open on the wall right now? */
create or replace function public.prayer_request_open(r public.prayer_requests)
returns boolean language sql stable as $$
  select r.answered_at is null
     and r.withdrawn_at is null
     and r.reported_at is null
     and not r.hidden
     and r.expires_at > now();
$$;

/**
 * May the caller read this note's line? Church-mates and accepted buddies —
 * the people who already know the requester by name. A note with no line
 * reads false either way, so the client can draw one shape.
 */
create or replace function public.prayer_line_visible(r public.prayer_requests, viewer uuid)
returns boolean language sql stable as $$
  select r.line is not null and (
    exists (
      select 1 from public.profiles a join public.profiles b on b.id = r.user_id
      where a.id = viewer and a.church_id is not null and a.church_id = b.church_id
    )
    or exists (
      select 1 from public.buddies bd
      where bd.status = 'accepted'
        and ((bd.requester_id = viewer and bd.addressee_id = r.user_id)
          or (bd.requester_id = r.user_id and bd.addressee_id = viewer))
    )
  );
$$;

/** The shape a stranger is handed. No count, and no name unless signed. */
create or replace function public.prayer_note_json(r public.prayer_requests, viewer uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  p public.profiles;
  out jsonb;
begin
  out := jsonb_build_object(
    'id', r.id,
    'category', r.category,
    'signed', r.signed,
    'created_at', r.created_at,
    'line', case when public.prayer_line_visible(r, viewer) then r.line else null end
  );
  if r.signed then
    select * into p from public.profiles where id = r.user_id;
    out := out || jsonb_build_object(
      'username', p.username,
      'avatar_emoji', p.avatar_emoji,
      'avatar_character', p.avatar_character,
      'denomination', p.denomination
    );
  end if;
  return out;
end; $$;

/** Your own note, as you see it — the ONE place a tally exists. */
create or replace function public.my_prayer_note_json(r public.prayer_requests)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'id', r.id,
    'category', r.category,
    'line', r.line,
    'signed', r.signed,
    'created_at', r.created_at,
    'expires_at', r.expires_at,
    'renewed', r.renewed,
    'answered_at', r.answered_at,
    'withdrawn_at', r.withdrawn_at,
    'reported', r.reported_at is not null or r.hidden,
    'open', public.prayer_request_open(r),
    -- Recipient-only, like my_washings.received. Rows, not people: somebody who
    -- knelt on three days counts three times, which is what "prayed over" means.
    'prayed_total', (select count(*) from public.prayer_intercessions i where i.request_id = r.id),
    -- "Today, yes" or nothing — the lamp's shape. UTC day on the server side
    -- because a note is one row shared by everybody who knelt at it; a
    -- kneeler's own cap is still counted on their local date.
    'lit', exists (
      select 1 from public.prayer_intercessions i
      where i.request_id = r.id and i.created_at > now() - interval '24 hours'
    )
  );
$$;

-- ── leaving a note ───────────────────────────────────────────────────────────

create or replace function public.post_prayer_request(
  p_category text,
  p_line text default null,
  p_signed boolean default false
)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  uid uuid := auth.uid();
  v_line text;
  r public.prayer_requests;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  if p_category is null or p_category not in (
    'healing', 'work', 'decision', 'grief', 'family', 'journey', 'peace', 'thanks'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'bad_category');
  end if;

  -- The line: control characters out, whitespace collapsed, capped, and empty
  -- means none. It is the one free-text field in the app and it never reaches
  -- a stranger (see prayer_line_visible), but it still gets cleaned on the way
  -- in rather than trusted.
  v_line := regexp_replace(coalesce(p_line, ''), '[[:cntrl:]]+', ' ', 'g');
  v_line := btrim(regexp_replace(v_line, '\s+', ' ', 'g'));
  if v_line = '' then v_line := null; end if;
  if v_line is not null and char_length(v_line) > 120 then
    v_line := left(v_line, 120);
  end if;

  -- One open note at a time. Not a refusal to write, just a full wall slot:
  -- the client shows the note that is already there.
  if exists (
    select 1 from public.prayer_requests q
    where q.user_id = uid and public.prayer_request_open(q)
  ) then
    return jsonb_build_object('ok', false, 'reason', 'active');
  end if;

  insert into public.prayer_requests (user_id, category, line, signed)
  values (uid, p_category, v_line, coalesce(p_signed, false))
  returning * into r;

  return jsonb_build_object('ok', true, 'note', public.my_prayer_note_json(r));
end; $$;

create or replace function public.withdraw_prayer_request(p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  update public.prayer_requests
     set withdrawn_at = now()
   where id = p_id and user_id = uid and withdrawn_at is null and answered_at is null;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n > 0);
end; $$;

/**
 * Mark it answered. The note leaves the wall and becomes a star on it for a
 * week (see prayer_wall), and everyone who knelt at it gets a line in their
 * mailbox — the one payout in this feature that arrives days later.
 */
create or replace function public.answer_prayer_request(p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  update public.prayer_requests
     set answered_at = now()
   where id = p_id and user_id = uid and answered_at is null and withdrawn_at is null;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n > 0);
end; $$;

/** Once: another seven days from now. */
create or replace function public.renew_prayer_request(p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  update public.prayer_requests
     set expires_at = now() + interval '7 days', renewed = true
   where id = p_id and user_id = uid and not renewed
     and answered_at is null and withdrawn_at is null and reported_at is null and not hidden
     -- A note that lapsed within the last week can be brought back; older
     -- than that and it is a new note.
     and expires_at > now() - interval '7 days';
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n > 0);
end; $$;

-- ── the wall hands you a note ────────────────────────────────────────────────

/**
 * Deal one note. Never your own, never one you have already knelt at today,
 * never one in p_skip (the ones this sitting has already passed on), and
 * weighted toward the notes with the FEWEST kneelings — so nobody's request is
 * buried and no one has to browse. Random among equals, so two people at the
 * wall at once are not handed the same note.
 *
 * Returns null when the wall has nothing for you. That is a real state and the
 * client says something warm about it rather than "0".
 */
create or replace function public.draw_prayer_request(
  p_local_date date default null,
  p_skip uuid[] default '{}'
)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  uid uuid := auth.uid();
  d date;
  r public.prayer_requests;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  d := coalesce(p_local_date, current_date);
  if d < current_date - 1 then d := current_date - 1; end if;
  if d > current_date + 1 then d := current_date + 1; end if;

  select q.* into r
  from public.prayer_requests q
  where public.prayer_request_open(q)
    and q.user_id <> uid
    and not (q.id = any (coalesce(p_skip, '{}')))
    and not exists (
      select 1 from public.prayer_intercessions i
      where i.request_id = q.id and i.user_id = uid and i.prayed_on = d
    )
  order by (select count(*) from public.prayer_intercessions i where i.request_id = q.id) asc,
           random()
  limit 1;

  if r.id is null then return null; end if;
  return public.prayer_note_json(r, uid);
end; $$;

/**
 * Kneel at a note. The candle was held on the client; this is the row.
 * Pays the KNEELER 1 XP up to twelve a day, and the requester nothing.
 */
create or replace function public.pray_for_request(p_id uuid, p_local_date date default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  uid uuid := auth.uid();
  cap constant int := 12;   -- KEEP IN SYNC with PRAY_FOR_DAILY_CAP in data/prayerWall.ts
  d date;
  r public.prayer_requests;
  v_today int;
  v_inserted int := 0;
  v_old_level int;
  v_new_xp int;
  v_new_level int;
  v_lifetime int;
  v_awarded int := 0;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  d := coalesce(p_local_date, current_date);
  if d < current_date - 1 then d := current_date - 1; end if;
  if d > current_date + 1 then d := current_date + 1; end if;

  select * into r from public.prayer_requests where id = p_id;
  if r.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if r.user_id = uid then return jsonb_build_object('ok', false, 'reason', 'self'); end if;
  if not public.prayer_request_open(r) then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  -- Under a row lock on the profile, so two candles finishing together can't
  -- both spend the twelfth point (the 0086 shape).
  perform 1 from public.profiles where id = uid for update;

  select count(*) into v_today from public.prayer_intercessions
   where user_id = uid and prayed_on = d;

  insert into public.prayer_intercessions (request_id, user_id, prayed_on)
  values (p_id, uid, d)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    -- Already knelt at this one today. Not an error and not a scolding.
    return jsonb_build_object('ok', false, 'reason', 'already', 'today', v_today, 'cap', cap);
  end if;

  select level into v_old_level from public.profiles where id = uid;

  -- Over the cap the kneeling is still recorded (the requester still sees it,
  -- the Journal still counts it) — it just isn't paid. The thirteenth prayer
  -- is still a prayer.
  if v_today < cap then
    v_awarded := 1;
    update public.profiles
       set xp = xp + 1,
           level = public.level_from_xp(xp + 1)
     where id = uid
     returning xp, level into v_new_xp, v_new_level;
  else
    select xp, level into v_new_xp, v_new_level from public.profiles where id = uid;
  end if;

  select count(*) into v_lifetime from public.prayer_intercessions where user_id = uid;

  return jsonb_build_object(
    'ok', true,
    'awarded', v_awarded,
    'xp', v_new_xp,
    'level', v_new_level,
    'leveled_up', v_new_level > coalesce(v_old_level, v_new_level),
    'today', v_today + 1,
    'cap', cap,
    'lifetime', v_lifetime
  );
end; $$;

/** Take a note off the wall pending an operator's look. Grants nothing. */
create or replace function public.report_prayer_request(p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  update public.prayer_requests
     set reported_at = now(), reported_by = uid
   where id = p_id and user_id <> uid and reported_at is null;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n > 0);
end; $$;

-- ── everything the wall screen needs, in one read ────────────────────────────

/**
 * Your side of the wall: your tally and cap for today, your lifetime kneelings
 * (the Journal's number), your own note if you have one that is less than a
 * fortnight old, the notes you knelt at that have since been answered, the
 * recently answered notes shining on the wall (category + face if signed, and
 * NO count), and how many notes are in the wall tonight.
 */
create or replace function public.my_prayer_wall(p_local_date date default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  uid uuid := auth.uid();
  cap constant int := 12;
  d date;
  mine public.prayer_requests;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  d := coalesce(p_local_date, current_date);
  if d < current_date - 1 then d := current_date - 1; end if;
  if d > current_date + 1 then d := current_date + 1; end if;

  select * into mine from public.prayer_requests
   where user_id = uid and created_at > now() - interval '14 days'
   order by created_at desc limit 1;

  return jsonb_build_object(
    'cap', cap,
    'today', (select count(*) from public.prayer_intercessions where user_id = uid and prayed_on = d),
    'lifetime', (select count(*) from public.prayer_intercessions where user_id = uid),
    'mine', case when mine.id is null then null else public.my_prayer_note_json(mine) end,
    'wall_count', (
      select count(*) from public.prayer_requests q where public.prayer_request_open(q)
    ),
    'answered', (
      -- The notes YOU knelt at that were answered in the last fortnight. One
      -- row per note (not per day you knelt), newest first.
      select coalesce(jsonb_agg(public.prayer_note_json(q, uid) || jsonb_build_object('answered_at', q.answered_at)
                                order by q.answered_at desc), '[]'::jsonb)
      from public.prayer_requests q
      where q.answered_at > now() - interval '14 days'
        and q.user_id <> uid
        and exists (select 1 from public.prayer_intercessions i where i.request_id = q.id and i.user_id = uid)
    ),
    'stars', (
      -- Answered this week, for the wall to shine. Deliberately no count of
      -- who knelt; a star is a picture, not a number.
      select coalesce(jsonb_agg(public.prayer_note_json(q, uid) || jsonb_build_object('answered_at', q.answered_at)
                                order by q.answered_at desc), '[]'::jsonb)
      from (
        select * from public.prayer_requests q
        where q.answered_at > now() - interval '7 days' and not q.hidden
        order by q.answered_at desc
        limit 12
      ) q
    )
  );
end; $$;

-- ── operator ─────────────────────────────────────────────────────────────────

create or replace function public.admin_prayer_reports()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  perform public.require_admin();
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', q.id,
      'category', q.category,
      'line', q.line,
      'signed', q.signed,
      'username', p.username,
      'reported_by', rp.username,
      'reported_at', q.reported_at,
      'created_at', q.created_at
    ) order by q.reported_at desc), '[]'::jsonb)
    from public.prayer_requests q
    join public.profiles p on p.id = q.user_id
    left join public.profiles rp on rp.id = q.reported_by
    where q.reported_at is not null and not q.hidden
  );
end; $$;

/** hide=true takes it down for good; hide=false clears the report and puts it back. */
create or replace function public.admin_resolve_prayer_report(p_id uuid, p_hide boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.require_admin();
  if p_hide then
    update public.prayer_requests set hidden = true where id = p_id;
  else
    update public.prayer_requests set reported_at = null, reported_by = null where id = p_id;
  end if;
  return jsonb_build_object('ok', true);
end; $$;

grant execute on function public.post_prayer_request(text, text, boolean) to authenticated;
grant execute on function public.withdraw_prayer_request(uuid) to authenticated;
grant execute on function public.answer_prayer_request(uuid) to authenticated;
grant execute on function public.renew_prayer_request(uuid) to authenticated;
grant execute on function public.draw_prayer_request(date, uuid[]) to authenticated;
grant execute on function public.pray_for_request(uuid, date) to authenticated;
grant execute on function public.report_prayer_request(uuid) to authenticated;
grant execute on function public.my_prayer_wall(date) to authenticated;
grant execute on function public.admin_prayer_reports() to authenticated;
grant execute on function public.admin_resolve_prayer_report(uuid, boolean) to authenticated;

-- The helpers are internal. Lock them to the shape grant_skins has, so nothing
-- client-side can ask prayer_note_json about a note it was never dealt.
revoke all on function public.prayer_request_open(public.prayer_requests) from public, anon, authenticated;
revoke all on function public.prayer_line_visible(public.prayer_requests, uuid) from public, anon, authenticated;
revoke all on function public.prayer_note_json(public.prayer_requests, uuid) from public, anon, authenticated;
revoke all on function public.my_prayer_note_json(public.prayer_requests) from public, anon, authenticated;

notify pgrst, 'reload schema';
