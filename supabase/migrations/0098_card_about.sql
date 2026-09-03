-- ---------------------------------------------------------------------------
-- 0098 — What a player says about themselves on their card.
--
-- Three optional fields on the profile — a favorite verse, a favorite book and
-- the translation they read — drawn as one slim strip on the player card and
-- set from the customizer (src/data/cardAbout.ts, src/features/profile/
-- CardAboutEditor.tsx).
--
-- EVERY FIELD IS A PICK FROM A FIXED CATALOG, NEVER FREE TEXT. The player card
-- is the one surface here where a stranger's words reach you, and this app has
-- kept it string-free on purpose (the crowd talks in a fixed emoji list, the
-- churchyard has nowhere to write). So:
--
--   * favorite_verse is a REFERENCE — "John 3:16" or "Proverbs 3:5-6" — whose
--     book must be one of the 66 (or the citation spellings the pool uses), with
--     chapter and verse capped at three digits. The client checks the chapter
--     and verse against the real shape of the Bible; the server checks the
--     shape of the string and the book, which is what stops a sentence being
--     stored in the slot. The TEXT is rehydrated client-side from VERSE_POOL,
--     exactly as favorites are, so nothing anybody typed is ever rendered.
--   * favorite_book is one of the 66 names.
--   * favorite_translation is a code from the list below.
--
-- Nothing here is a number, and nothing here is counted anywhere: a favorite is
-- a taste, not standing.
--
-- Idempotent — add-column-if-not-exists and create-or-replace throughout.
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists favorite_verse text;
alter table public.profiles add column if not exists favorite_book text;
alter table public.profiles add column if not exists favorite_translation text;

-- Set all three at once. Null (or '') clears a field; each is validated against
-- its catalog and anything off it is refused rather than mangled.
--
-- Keep the three lists in sync with src/data/cardAbout.ts (CARD_TRANSLATIONS)
-- and src/data/bible/pool.ts (BIBLE_BOOKS).
create or replace function public.set_card_about(
  p_verse text default null,
  p_book text default null,
  p_translation text default null
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_verse text := nullif(btrim(coalesce(p_verse, '')), '');
  v_book text := nullif(btrim(coalesce(p_book, '')), '');
  v_tr text := upper(nullif(btrim(coalesce(p_translation, '')), ''));
  books text[] := array[
    'Genesis','Exodus','Leviticus','Numbers','Deuteronomy',
    'Joshua','Judges','Ruth','1 Samuel','2 Samuel','1 Kings','2 Kings',
    '1 Chronicles','2 Chronicles','Ezra','Nehemiah','Esther',
    'Job','Psalms','Proverbs','Ecclesiastes','Song of Solomon',
    'Isaiah','Jeremiah','Lamentations','Ezekiel','Daniel',
    'Hosea','Joel','Amos','Obadiah','Jonah','Micah','Nahum',
    'Habakkuk','Zephaniah','Haggai','Zechariah','Malachi',
    'Matthew','Mark','Luke','John','Acts',
    'Romans','1 Corinthians','2 Corinthians','Galatians','Ephesians',
    'Philippians','Colossians','1 Thessalonians','2 Thessalonians',
    '1 Timothy','2 Timothy','Titus','Philemon','Hebrews','James',
    '1 Peter','2 Peter','1 John','2 John','3 John','Jude','Revelation'
  ];
  -- The citation spellings the verse pool writes, on top of the canon names.
  cite_books text[] := array['Psalm','Song of Songs'];
  codes text[] := array[
    'KJV','NKJV','NIV','ESV','NLT','NASB','CSB','NRSV','NABRE','AMP','MSG','GNT','BSB','WEB'
  ];
  m text[];
begin
  if uid is null then raise exception 'not authenticated'; end if;

  if v_verse is not null then
    if length(v_verse) > 40 then
      return json_build_object('ok', false, 'error', 'bad verse');
    end if;
    m := regexp_match(v_verse, '^(.+) (\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?$');
    if m is null
       or not (m[1] = any(books) or m[1] = any(cite_books))
       or m[2]::int < 1 or m[3]::int < 1
       or (m[4] is not null and m[4]::int <= m[3]::int) then
      return json_build_object('ok', false, 'error', 'bad verse');
    end if;
  end if;

  if v_book is not null and not (v_book = any(books)) then
    return json_build_object('ok', false, 'error', 'bad book');
  end if;

  if v_tr is not null and not (v_tr = any(codes)) then
    return json_build_object('ok', false, 'error', 'bad translation');
  end if;

  update public.profiles
     set favorite_verse = v_verse,
         favorite_book = v_book,
         favorite_translation = v_tr
   where id = uid;

  return json_build_object('ok', true, 'verse', v_verse, 'book', v_book, 'translation', v_tr);
end;
$$;

grant execute on function public.set_card_about(text, text, text) to authenticated;

-- The public card carries the three fields. Restated wholesale from 0071 (the
-- pet) — every other key is unchanged, and still no number that isn't already
-- there.
create or replace function public.get_player_card(p_username text)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'username', p.username,
    'avatar_emoji', p.avatar_emoji,
    'avatar_character', p.avatar_character,
    'avatar_border', coalesce(p.avatar_border, 'default'),
    'avatar_badge', p.avatar_badge,
    'card_background', p.card_background,
    'pet', p.pet,
    'favorite_verse', p.favorite_verse,
    'favorite_book', p.favorite_book,
    'favorite_translation', p.favorite_translation,
    'xp', p.xp,
    'level', p.level,
    'current_streak', p.current_streak,
    'longest_streak', p.longest_streak,
    'total_plays', p.total_plays,
    'denomination', p.denomination,
    'cards', (select count(*) from public.user_unlocks u where u.user_id = p.id)
  )
  from public.profiles p
  where lower(p.username) = lower(trim(coalesce(p_username, '')))
    and not coalesce(p.hidden, false)
  limit 1;
$function$;

notify pgrst, 'reload schema';
