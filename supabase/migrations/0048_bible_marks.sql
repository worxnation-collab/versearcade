-- Your Bible — where each player has been in the text.
--
-- The app draws the whole Bible from a local structure table (31,102 verse
-- slots, no network) and shades each verse by what the player has done with it:
-- saved, studied, read, or not yet opened. This table stores the middle two.
--
--   kind = 'read'    -> key is `Book|chapter`, e.g. 'Genesis|1'. Written when a
--                       chapter is opened in a reader.
--   kind = 'studied' -> key is a verse reference, e.g. 'John 3:16'. Written when
--                       a challenge on that verse finishes, in any mode.
--
-- Saved verses live in favorite_verses (0045) and are unchanged — the Bible view
-- reads them as the brightest tier, so every verse anyone has ever kept is
-- already highlighted the first time they open this.
--
-- Deliberately inert: marks award no XP, cost none, touch no streak and are never
-- shown to another player. A footprint, not a score — nothing here to farm and
-- nothing to rank. Marks are cumulative and are never deleted by the client.
--
-- LOCAL/guest play mirrors this in localStorage (va.bible.*) — see
-- src/store/bible.ts.

create table if not exists public.bible_marks (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('read', 'studied')),
  key        text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, key)
);

-- The Bible view loads every mark for one player at once.
create index if not exists bible_marks_user_idx
  on public.bible_marks (user_id, kind);

alter table public.bible_marks enable row level security;
drop policy if exists "bible marks self-select" on public.bible_marks;
drop policy if exists "bible marks self-write"  on public.bible_marks;
create policy "bible marks self-select" on public.bible_marks
  for select using (auth.uid() = user_id);
-- Writes go through mark_bible_progress (security definer); still scope any
-- direct write to the owner as defense in depth.
create policy "bible marks self-write" on public.bible_marks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Record one footprint. Idempotent: re-opening a chapter or replaying a verse
-- keeps the first timestamp rather than churning the row.
--
-- The cap is a ceiling no real reader approaches — the Bible has 1,189 chapters
-- and the quiz pool a few hundred verses, so a legitimate player tops out around
-- 2,000 rows. It exists so a stuck client can't write unbounded rows. Keep in
-- sync with BIBLE_MARKS_CAP in src/lib/bibleProgress.ts.
create or replace function public.mark_bible_progress(
  p_kind text,
  p_key  text
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_kind text := btrim(coalesce(p_kind, ''));
  v_key  text := btrim(coalesce(p_key, ''));
  v_cap  integer := 40000;
  v_count integer;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if v_kind not in ('read', 'studied') then raise exception 'invalid kind'; end if;
  if v_key = '' or length(v_key) > 64 then raise exception 'invalid key'; end if;

  -- An existing mark re-sent is a no-op, so the cap only blocks growth.
  if not exists (select 1 from public.bible_marks
                  where user_id = uid and kind = v_kind and key = v_key) then
    select count(*) into v_count from public.bible_marks where user_id = uid;
    if v_count >= v_cap then raise exception 'bible mark limit reached'; end if;
  end if;

  insert into public.bible_marks (user_id, kind, key)
  values (uid, v_kind, v_key)
  on conflict (user_id, kind, key) do nothing;

  select count(*) into v_count from public.bible_marks where user_id = uid;
  return json_build_object('kind', v_kind, 'key', v_key, 'count', v_count, 'cap', v_cap);
end;
$$;

grant execute on function public.mark_bible_progress(text, text) to authenticated;

notify pgrst, 'reload schema';
