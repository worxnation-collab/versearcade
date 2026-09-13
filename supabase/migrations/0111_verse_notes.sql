-- Highlight colours and private notes, on a verse in your own Bible.
--
-- The reader has shaded verses by four DERIVED states since 0048 — saved,
-- studied, read, unread — and a player could not mark one themselves. Both
-- apps this one is measured against lead with exactly that: a colour swatch
-- row and a note field on a verse. It is the most "real Bible app" thing
-- missing here.
--
-- ── WHY THIS NEEDS NO MODERATION SURFACE, WHICH IS THE WHOLE ARGUMENT ──────
--
-- This is the app's SECOND player-authored text, and it is a different shape
-- from the first. The Prayer Wall's line (0099) is shown to the requester's
-- church-mates and buddies, so it needed a report path, an admin queue and a
-- visibility function to exist at all.
--
-- A verse note is shown to NOBODY. Not to a buddy, not to a church-mate, not
-- to leadership, not on a card, not on a board, not in a crowd scene. There is
-- therefore nothing to moderate — and that is enforced in the SHAPE OF THE
-- DATA rather than in care:
--
--   * every function here derives the owner from auth.uid() and none of them
--     takes a user id, so there is no signature that could return somebody
--     else's note even by mistake;
--   * RLS is self-only for select as well as write;
--   * no existing payload is touched. get_player_card, room_json,
--     get_church_page, every leaderboard and every crowd scene are untouched,
--     so a note cannot leak through a surface that already exists.
--
-- If a future session wants shared notes, understand it is not an extension of
-- this: it is opening the moderation problem this design does not have, and it
-- needs the Prayer Wall's whole apparatus rather than a policy change here.
--
-- ── And it ranks nobody ────────────────────────────────────────────────────
--
-- No XP, no points, no standing, no streak, no Journal rung, and deliberately
-- no count anywhere — not "12 verses highlighted", not a bar toward the 31,102.
-- A note is a fact about one person's own Bible, like the marks in 0048 and for
-- the same reason. There is no RPC that counts them.
--
-- LOCAL/guest play mirrors this in localStorage (va.bible.notes.*) — see
-- src/store/verseNotes.ts. Both halves, like every store here.

create table if not exists public.verse_notes (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  -- The pool's citation form ('Psalm 23:1'), the same key favourites and
  -- studied marks use, so one verse is one key everywhere in the app.
  reference  text not null,
  -- One of a fixed list, or null for "a note with no colour". Checked here as
  -- well as in the RPC: the column is the thing that cannot be talked round.
  colour     text check (colour is null or colour in
                ('amber', 'rose', 'mint', 'sky', 'violet', 'peach')),
  note       text,
  updated_at timestamptz not null default now(),
  primary key (user_id, reference),
  -- A row with neither a colour nor a note is nothing; the RPC deletes instead.
  constraint verse_notes_not_empty check (colour is not null or note is not null),
  constraint verse_notes_len check (note is null or char_length(note) <= 500)
);

alter table public.verse_notes enable row level security;
drop policy if exists "verse notes self-select" on public.verse_notes;
drop policy if exists "verse notes self-write"  on public.verse_notes;
-- Self-only for SELECT too, not just write. On bible_marks that is defence in
-- depth; here it is the feature.
create policy "verse notes self-select" on public.verse_notes
  for select using (auth.uid() = user_id);
create policy "verse notes self-write" on public.verse_notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- A ceiling no real reader approaches (the Bible has 31,102 verses and a
-- person highlights a few hundred), so a stuck client cannot write unbounded
-- rows. Keep in sync with VERSE_NOTES_CAP in src/store/verseNotes.ts.
create or replace function public.set_verse_note(
  p_reference text,
  p_colour    text default null,
  p_note      text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  clean text;
  col   text;
  n     int;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  if p_reference is null or char_length(trim(p_reference)) = 0
     or char_length(p_reference) > 100 then
    return jsonb_build_object('ok', false, 'reason', 'bad_reference');
  end if;

  -- The colour is a pick from a list, never a string somebody sends. Same rule
  -- the room skin, the card's About field and the church skin all follow.
  col := nullif(trim(coalesce(p_colour, '')), '');
  if col is not null and col not in ('amber', 'rose', 'mint', 'sky', 'violet', 'peach') then
    return jsonb_build_object('ok', false, 'reason', 'bad_colour');
  end if;

  -- The note is the one free string. Control characters out, whitespace
  -- collapsed, length capped. It is never rendered to anybody else, so this is
  -- hygiene rather than moderation.
  clean := nullif(trim(regexp_replace(coalesce(p_note, ''), '[\r\n\t]+', ' ', 'g')), '');
  if clean is not null then
    clean := left(clean, 500);
  end if;

  -- Nothing on either axis is a deletion, not an empty row.
  if col is null and clean is null then
    delete from public.verse_notes where user_id = uid and reference = p_reference;
    return jsonb_build_object('ok', true, 'cleared', true);
  end if;

  select count(*) into n from public.verse_notes where user_id = uid;
  if n >= 5000 and not exists (
    select 1 from public.verse_notes where user_id = uid and reference = p_reference
  ) then
    return jsonb_build_object('ok', false, 'reason', 'full');
  end if;

  insert into public.verse_notes (user_id, reference, colour, note, updated_at)
  values (uid, p_reference, col, clean, now())
  on conflict (user_id, reference)
  do update set colour = excluded.colour, note = excluded.note, updated_at = now();

  return jsonb_build_object('ok', true, 'colour', col, 'note', clean);
end;
$$;

-- Every note this player has. Takes NO user id, by design: there is no
-- signature here that could be pointed at somebody else.
create or replace function public.my_verse_notes()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  return coalesce((
    select jsonb_object_agg(reference, jsonb_build_object('colour', colour, 'note', note))
    from public.verse_notes
    where user_id = uid
  ), '{}'::jsonb);
end;
$$;

grant execute on function public.set_verse_note(text, text, text) to authenticated;
grant execute on function public.my_verse_notes() to authenticated;
