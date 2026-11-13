-- 0179 — Autopilot that never needs the leader: a week it can always draft,
-- and a skipped week that can be run after all.
--
-- Found in production (2026-11-13): a church with Autopilot on and no backup
-- plan had its week settled as `no_source` at the Monday cutoff, three weeks
-- running (21 empty days). The leader then saved a backup plan ("Prayer") on
-- the Friday and nothing happened: `church_autopilot_claim` (0152) records one
-- row per church per week by its primary key, and that row said `no_source`.
-- The owner's call (2026-11-13): Autopilot must work for a leader who never
-- sets a backup plan and never signs in for weeks.
--
-- 1. VERSE ARCADE PICKS THE WEEK. With no memo by the cutoff and no backup
--    plan, the claim no longer records `no_source`: it drafts the week from a
--    default plan instead, through the SAME 0148 job (`source = 'fallback'`)
--    and the same `church-draft` week call — the units, refunds, blind answer
--    check, drafts only. The plan (`church_autopilot_default_plan`):
--      * CONTINUE the church's last series when every one of its recent days
--        sits in one book: the next verses of that book (up to 25, inside one
--        chapter), under the same series name;
--      * otherwise the next entry of a fixed rotation of evergreen passages
--        (`church_autopilot_rotation`), the one this church has had least
--        recently. Every entry is a curated topic of src/data/studyTopics.ts
--        with the same passages (each inside one chapter, ≤ 40 verses in all),
--        which scripts/check-study-topics.mjs asserts in the build.
--    The job's passages carry references and where to read them (`usfm`,
--    `chapter`, `start`, `end`) but no words: `church-draft` fetches the BSB
--    text when the job runs (the same helloao source the app reads), so the
--    claim works from the hourly cron alone. A saved backup plan still wins.
--    Churches with Autopilot ON and no backup plan get this from their next
--    due week; churches with it off are untouched.
--
-- 2. A SKIPPED WEEK CAN STILL RUN. A week already settled as `no_source` is
--    re-opened — its row cleared, so `church_autopilot_state` reads `due`
--    again and the unchanged claim runs it — when Autopilot is on, the week
--    is not skipped, no memo came in, and the claim's window (never before
--    today) still has at least two empty days (the claim's own `covered`
--    rule). Two doors to one helper (`church_autopilot_reopen`):
--      * a trigger on `church_autopilot`: saving or changing the backup plan,
--        or switching Autopilot on, re-opens it inside the same
--        `set_church_autopilot` call, which already answers the state; the
--        client ticks on `due`, so the week drafts right after Save;
--      * `church_autopilot_rescue`, behind `church_gen_can`: the "Draft this
--        week now" button on Home and Plan.
--
-- Nothing here approves anything. Only auto-publish (0176), where a leader
-- switched it on, puts a draft live, and it still never publishes a day with
-- a flagged question (the 5-question constraint means a flagged question
-- can't be left out cleanly, so that day waits and Home says so).
--
-- No existing setting row is changed by this file. The hourly cron (0158)
-- still names the leader each church runs as (`church_autopilot_due`: whoever
-- last set Autopilot if they still pass Content Generation, else the
-- longest-standing leader who does), and the claim makes that leader the
-- job's owner. Restated here: `church_autopilot_claim` (from 0152, one branch
-- changed). New: the five functions and the trigger below.

-- ---------------------------------------------------------------------------
-- The 66 books: name, USFM code (src/lib/translations.ts) and verses per
-- chapter (src/data/bible/structure.ts). "Psalm" and "Song of Songs" match too.
-- ---------------------------------------------------------------------------
create or replace function public.church_bible_book(p_name text)
returns table (ord int, name text, usfm text, verses int[])
language sql immutable set search_path = public
as $$
  select b.ord, b.name, b.usfm, b.verses from (values
    (1, 'Genesis', 'GEN', '{31,25,24,26,32,22,24,22,29,32,32,20,18,24,21,16,27,33,38,18,34,24,20,67,34,35,46,22,35,43,55,32,20,31,29,43,36,30,23,23,57,38,34,34,28,34,31,22,33,26}'::int[]),
    (2, 'Exodus', 'EXO', '{22,25,22,31,23,30,25,32,35,29,10,51,22,31,27,36,16,27,25,26,36,31,33,18,40,37,21,43,46,38,18,35,23,35,35,38,29,31,43,38}'::int[]),
    (3, 'Leviticus', 'LEV', '{17,16,17,35,19,30,38,36,24,20,47,8,59,57,33,34,16,30,37,27,24,33,44,23,55,46,34}'::int[]),
    (4, 'Numbers', 'NUM', '{54,34,51,49,31,27,89,26,23,36,35,16,33,45,41,50,13,32,22,29,35,41,30,25,18,65,23,31,40,16,54,42,56,29,34,13}'::int[]),
    (5, 'Deuteronomy', 'DEU', '{46,37,29,49,33,25,26,20,29,22,32,32,18,29,23,22,20,22,21,20,23,30,25,22,19,19,26,68,29,20,30,52,29,12}'::int[]),
    (6, 'Joshua', 'JOS', '{18,24,17,24,15,27,26,35,27,43,23,24,33,15,63,10,18,28,51,9,45,34,16,33}'::int[]),
    (7, 'Judges', 'JDG', '{36,23,31,24,31,40,25,35,57,18,40,15,25,20,20,31,13,31,30,48,25}'::int[]),
    (8, 'Ruth', 'RUT', '{22,23,18,22}'::int[]),
    (9, '1 Samuel', '1SA', '{28,36,21,22,12,21,17,22,27,27,15,25,23,52,35,23,58,30,24,42,15,23,29,22,44,25,12,25,11,31,13}'::int[]),
    (10, '2 Samuel', '2SA', '{27,32,39,12,25,23,29,18,13,19,27,31,39,33,37,23,29,33,43,26,22,51,39,25}'::int[]),
    (11, '1 Kings', '1KI', '{53,46,28,34,18,38,51,66,28,29,43,33,34,31,34,34,24,46,21,43,29,53}'::int[]),
    (12, '2 Kings', '2KI', '{18,25,27,44,27,33,20,29,37,36,21,21,25,29,38,20,41,37,37,21,26,20,37,20,30}'::int[]),
    (13, '1 Chronicles', '1CH', '{54,55,24,43,26,81,40,40,44,14,47,40,14,17,29,43,27,17,19,8,30,19,32,31,31,32,34,21,30}'::int[]),
    (14, '2 Chronicles', '2CH', '{17,18,17,22,14,42,22,18,31,19,23,16,22,15,19,14,19,34,11,37,20,12,21,27,28,23,9,27,36,27,21,33,25,33,27,23}'::int[]),
    (15, 'Ezra', 'EZR', '{11,70,13,24,17,22,28,36,15,44}'::int[]),
    (16, 'Nehemiah', 'NEH', '{11,20,32,23,19,19,73,18,38,39,36,47,31}'::int[]),
    (17, 'Esther', 'EST', '{22,23,15,17,14,14,10,17,32,3}'::int[]),
    (18, 'Job', 'JOB', '{22,13,26,21,27,30,21,22,35,22,20,25,28,22,35,22,16,21,29,29,34,30,17,25,6,14,23,28,25,31,40,22,33,37,16,33,24,41,30,24,34,17}'::int[]),
    (19, 'Psalms', 'PSA', '{6,12,8,8,12,10,17,9,20,18,7,8,6,7,5,11,15,50,14,9,13,31,6,10,22,12,14,9,11,12,24,11,22,22,28,12,40,22,13,17,13,11,5,26,17,11,9,14,20,23,19,9,6,7,23,13,11,11,17,12,8,12,11,10,13,20,7,35,36,5,24,20,28,23,10,12,20,72,13,19,16,8,18,12,13,17,7,18,52,17,16,15,5,23,11,13,12,9,9,5,8,28,22,35,45,48,43,13,31,7,10,10,9,8,18,19,2,29,176,7,8,9,4,8,5,6,5,6,8,8,3,18,3,3,21,26,9,8,24,13,10,7,12,15,21,10,20,14,9,6}'::int[]),
    (20, 'Proverbs', 'PRO', '{33,22,35,27,23,35,27,36,18,32,31,28,25,35,33,33,28,24,29,30,31,29,35,34,28,28,27,28,27,33,31}'::int[]),
    (21, 'Ecclesiastes', 'ECC', '{18,26,22,16,20,12,29,17,18,20,10,14}'::int[]),
    (22, 'Song of Solomon', 'SNG', '{17,17,11,16,16,13,13,14}'::int[]),
    (23, 'Isaiah', 'ISA', '{31,22,26,6,30,13,25,22,21,34,16,6,22,32,9,14,14,7,25,6,17,25,18,23,12,21,13,29,24,33,9,20,24,17,10,22,38,22,8,31,29,25,28,28,25,13,15,22,26,11,23,15,12,17,13,12,21,14,21,22,11,12,19,12,25,24}'::int[]),
    (24, 'Jeremiah', 'JER', '{19,37,25,31,31,30,34,22,26,25,23,17,27,22,21,21,27,23,15,18,14,30,40,10,38,24,22,17,32,24,40,44,26,22,19,32,21,28,18,16,18,22,13,30,5,28,7,47,39,46,64,34}'::int[]),
    (25, 'Lamentations', 'LAM', '{22,22,66,22,22}'::int[]),
    (26, 'Ezekiel', 'EZK', '{28,10,27,17,17,14,27,18,11,22,25,28,23,23,8,63,24,32,14,49,32,31,49,27,17,21,36,26,21,26,18,32,33,31,15,38,28,23,29,49,26,20,27,31,25,24,23,35}'::int[]),
    (27, 'Daniel', 'DAN', '{21,49,30,37,31,28,28,27,27,21,45,13}'::int[]),
    (28, 'Hosea', 'HOS', '{11,23,5,19,15,11,16,14,17,15,12,14,16,9}'::int[]),
    (29, 'Joel', 'JOL', '{20,32,21}'::int[]),
    (30, 'Amos', 'AMO', '{15,16,15,13,27,14,17,14,15}'::int[]),
    (31, 'Obadiah', 'OBA', '{21}'::int[]),
    (32, 'Jonah', 'JON', '{17,10,10,11}'::int[]),
    (33, 'Micah', 'MIC', '{16,13,12,13,15,16,20}'::int[]),
    (34, 'Nahum', 'NAM', '{15,13,19}'::int[]),
    (35, 'Habakkuk', 'HAB', '{17,20,19}'::int[]),
    (36, 'Zephaniah', 'ZEP', '{18,15,20}'::int[]),
    (37, 'Haggai', 'HAG', '{15,23}'::int[]),
    (38, 'Zechariah', 'ZEC', '{21,13,10,14,11,15,14,23,17,12,17,14,9,21}'::int[]),
    (39, 'Malachi', 'MAL', '{14,17,18,6}'::int[]),
    (40, 'Matthew', 'MAT', '{25,23,17,25,48,34,29,34,38,42,30,50,58,36,39,28,27,35,30,34,46,46,39,51,46,75,66,20}'::int[]),
    (41, 'Mark', 'MRK', '{45,28,35,41,43,56,37,38,50,52,33,44,37,72,47,20}'::int[]),
    (42, 'Luke', 'LUK', '{80,52,38,44,39,49,50,56,62,42,54,59,35,35,32,31,37,43,48,47,38,71,56,53}'::int[]),
    (43, 'John', 'JHN', '{51,25,36,54,47,71,53,59,41,42,57,50,38,31,27,33,26,40,42,31,25}'::int[]),
    (44, 'Acts', 'ACT', '{26,47,26,37,42,15,60,40,43,48,30,25,52,28,41,40,34,28,41,38,40,30,35,27,27,32,44,31}'::int[]),
    (45, 'Romans', 'ROM', '{32,29,31,25,21,23,25,39,33,21,36,21,14,23,33,27}'::int[]),
    (46, '1 Corinthians', '1CO', '{31,16,23,21,13,20,40,13,27,33,34,31,13,40,58,24}'::int[]),
    (47, '2 Corinthians', '2CO', '{24,17,18,18,21,18,16,24,15,18,33,21,14}'::int[]),
    (48, 'Galatians', 'GAL', '{24,21,29,31,26,18}'::int[]),
    (49, 'Ephesians', 'EPH', '{23,22,21,32,33,24}'::int[]),
    (50, 'Philippians', 'PHP', '{30,30,21,23}'::int[]),
    (51, 'Colossians', 'COL', '{29,23,25,18}'::int[]),
    (52, '1 Thessalonians', '1TH', '{10,20,13,18,28}'::int[]),
    (53, '2 Thessalonians', '2TH', '{12,17,18}'::int[]),
    (54, '1 Timothy', '1TI', '{20,15,16,16,25,21}'::int[]),
    (55, '2 Timothy', '2TI', '{18,26,17,22}'::int[]),
    (56, 'Titus', 'TIT', '{16,15,15}'::int[]),
    (57, 'Philemon', 'PHM', '{25}'::int[]),
    (58, 'Hebrews', 'HEB', '{14,18,19,16,14,20,28,13,28,39,40,29,25}'::int[]),
    (59, 'James', 'JAS', '{27,26,18,17,20}'::int[]),
    (60, '1 Peter', '1PE', '{25,25,22,19,14}'::int[]),
    (61, '2 Peter', '2PE', '{21,22,18}'::int[]),
    (62, '1 John', '1JN', '{10,29,24,21,21}'::int[]),
    (63, '2 John', '2JN', '{13}'::int[]),
    (64, '3 John', '3JN', '{14}'::int[]),
    (65, 'Jude', 'JUD', '{25}'::int[]),
    (66, 'Revelation', 'REV', '{20,29,22,11,14,17,17,13,21,11,19,17,18,20,8,21,18,24,21,15,27,21}'::int[])
  ) as b(ord, name, usfm, verses)
  where lower(b.name) = case lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'))
                          when 'psalm' then 'psalms'
                          when 'song of songs' then 'song of solomon'
                          else lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g')) end;
$$;
revoke all on function public.church_bible_book(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The rotation, in order. Each passages array is the job's shape: a
-- reference, the book as written, its USFM code and the verse span.
-- ---------------------------------------------------------------------------
create or replace function public.church_autopilot_rotation()
returns table (ord int, id text, series text, passages jsonb)
language sql immutable set search_path = public
as $$
  select r.ord, r.id, r.series, r.passages from (values
    (1, 'psalms-of-trust', 'Psalms of Trust', '[{"reference":"Psalm 23:1-6","book":"Psalm","usfm":"PSA","chapter":23,"start":1,"end":6},{"reference":"Psalm 46:1-11","book":"Psalm","usfm":"PSA","chapter":46,"start":1,"end":11},{"reference":"Psalm 121:1-8","book":"Psalm","usfm":"PSA","chapter":121,"start":1,"end":8}]'::jsonb),
    (2, 'sermon-on-the-mount', 'The Sermon on the Mount', '[{"reference":"Matthew 5:1-16","book":"Matthew","usfm":"MAT","chapter":5,"start":1,"end":16},{"reference":"Matthew 6:25-34","book":"Matthew","usfm":"MAT","chapter":6,"start":25,"end":34},{"reference":"Matthew 7:24-29","book":"Matthew","usfm":"MAT","chapter":7,"start":24,"end":29}]'::jsonb),
    (3, 'fruit-of-the-spirit', 'The Fruit of the Spirit', '[{"reference":"Galatians 5:16-26","book":"Galatians","usfm":"GAL","chapter":5,"start":16,"end":26}]'::jsonb),
    (4, 'prayer', 'Prayer', '[{"reference":"Matthew 6:5-15","book":"Matthew","usfm":"MAT","chapter":6,"start":5,"end":15},{"reference":"Philippians 4:4-9","book":"Philippians","usfm":"PHP","chapter":4,"start":4,"end":9},{"reference":"James 5:13-18","book":"James","usfm":"JAS","chapter":5,"start":13,"end":18}]'::jsonb),
    (5, 'parables', 'The Parables of Jesus', '[{"reference":"Matthew 13:1-9","book":"Matthew","usfm":"MAT","chapter":13,"start":1,"end":9},{"reference":"Matthew 13:18-23","book":"Matthew","usfm":"MAT","chapter":13,"start":18,"end":23},{"reference":"Luke 10:25-37","book":"Luke","usfm":"LUK","chapter":10,"start":25,"end":37}]'::jsonb),
    (6, 'new-life', 'New Life in Christ', '[{"reference":"2 Corinthians 5:14-21","book":"2 Corinthians","usfm":"2CO","chapter":5,"start":14,"end":21},{"reference":"Romans 6:1-11","book":"Romans","usfm":"ROM","chapter":6,"start":1,"end":11},{"reference":"Romans 8:1-11","book":"Romans","usfm":"ROM","chapter":8,"start":1,"end":11}]'::jsonb),
    (7, 'joseph', 'The Life of Joseph', '[{"reference":"Genesis 37:3-11","book":"Genesis","usfm":"GEN","chapter":37,"start":3,"end":11},{"reference":"Genesis 45:1-8","book":"Genesis","usfm":"GEN","chapter":45,"start":1,"end":8},{"reference":"Genesis 50:15-21","book":"Genesis","usfm":"GEN","chapter":50,"start":15,"end":21}]'::jsonb),
    (8, 'beatitudes', 'The Beatitudes', '[{"reference":"Matthew 5:1-16","book":"Matthew","usfm":"MAT","chapter":5,"start":1,"end":16}]'::jsonb),
    (9, 'grace', 'Grace', '[{"reference":"Ephesians 2:1-10","book":"Ephesians","usfm":"EPH","chapter":2,"start":1,"end":10},{"reference":"Romans 5:1-11","book":"Romans","usfm":"ROM","chapter":5,"start":1,"end":11}]'::jsonb),
    (10, 'good-shepherd', 'The Good Shepherd', '[{"reference":"Psalm 23:1-6","book":"Psalm","usfm":"PSA","chapter":23,"start":1,"end":6},{"reference":"John 10:1-18","book":"John","usfm":"JHN","chapter":10,"start":1,"end":18}]'::jsonb),
    (11, 'abiding', 'Abiding (John 15)', '[{"reference":"John 15:1-17","book":"John","usfm":"JHN","chapter":15,"start":1,"end":17}]'::jsonb),
    (12, 'hope', 'Hope', '[{"reference":"Romans 8:18-28","book":"Romans","usfm":"ROM","chapter":8,"start":18,"end":28},{"reference":"Lamentations 3:19-26","book":"Lamentations","usfm":"LAM","chapter":3,"start":19,"end":26},{"reference":"1 Peter 1:3-9","book":"1 Peter","usfm":"1PE","chapter":1,"start":3,"end":9}]'::jsonb),
    (13, 'forgiveness', 'Forgiveness', '[{"reference":"Matthew 18:21-35","book":"Matthew","usfm":"MAT","chapter":18,"start":21,"end":35},{"reference":"Colossians 3:12-17","book":"Colossians","usfm":"COL","chapter":3,"start":12,"end":17}]'::jsonb),
    (14, 'lost-and-found', 'Lost and Found (Luke 15)', '[{"reference":"Luke 15:1-10","book":"Luke","usfm":"LUK","chapter":15,"start":1,"end":10},{"reference":"Luke 15:11-32","book":"Luke","usfm":"LUK","chapter":15,"start":11,"end":32}]'::jsonb),
    (15, 'armor-of-god', 'The Armor of God', '[{"reference":"Ephesians 6:10-20","book":"Ephesians","usfm":"EPH","chapter":6,"start":10,"end":20}]'::jsonb),
    (16, 'serving', 'Serving Others', '[{"reference":"John 13:1-17","book":"John","usfm":"JHN","chapter":13,"start":1,"end":17},{"reference":"Philippians 2:1-11","book":"Philippians","usfm":"PHP","chapter":2,"start":1,"end":11}]'::jsonb)
  ) as r(ord, id, series, passages);
$$;
revoke all on function public.church_autopilot_rotation() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The week Verse Arcade picks for a church whose window opens on p_from:
-- { kind: 'continue' | 'rotation', series, guidance, passages }.
-- ---------------------------------------------------------------------------
create or replace function public.church_autopilot_default_plan(p_church_id uuid, p_from date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_series text;
  v_n      int;
  v_ok     int;
  v_books  int;
  v_book   text;
  v_ch     int;
  v_end    int;
  b        record;
  v_start  int;
  v_last   int;
  v_name   text;
  r        record;
begin
  -- The most recent live day with a series, in the three weeks before the window.
  select v.series into v_series
    from public.church_verses v
   where v.church_id = p_church_id and v.discarded_at is null and v.status <> 'draft'
     and v.series is not null and v.drop_date < p_from and v.drop_date >= p_from - 21
   order by v.drop_date desc limit 1;

  if v_series is not null and not exists (select 1 from public.church_autopilot_rotation() x where x.series = v_series) then
    with refs as (
      select regexp_match(regexp_replace(btrim(v.reference), '\s+', ' ', 'g'),
                          '^(.+?) ([0-9]{1,3}):([0-9]{1,3})(?:-([0-9]{1,3}))?$') as m
        from public.church_verses v
       where v.church_id = p_church_id and v.discarded_at is null and v.series = v_series
         and v.drop_date < p_from and v.drop_date >= p_from - 42
    )
    select count(*), count(m), count(distinct lower(m[1])), min(m[1]),
           (array_agg(m[2]::int order by m[2]::int desc, coalesce(m[4], m[3])::int desc))[1],
           (array_agg(coalesce(m[4], m[3])::int order by m[2]::int desc, coalesce(m[4], m[3])::int desc))[1]
      into v_n, v_ok, v_books, v_book, v_ch, v_end
      from refs;
    if v_n > 0 and v_ok = v_n and v_books = 1 then
      select * into b from public.church_bible_book(v_book) limit 1;
      if found and v_ch between 1 and array_length(b.verses, 1) then
        if v_end < b.verses[v_ch] then
          v_start := v_end + 1;
        elsif v_ch < array_length(b.verses, 1) then
          v_ch := v_ch + 1; v_start := 1;
        else
          v_start := null;  -- the book is finished: the rotation picks instead
        end if;
        if v_start is not null then
          v_last := least(v_start + 24, b.verses[v_ch]);
          v_name := case when b.name = 'Psalms' then 'Psalm' else b.name end;
          return jsonb_build_object(
            'kind', 'continue',
            'series', v_series,
            'guidance', left(format('Continue the series “%s” with the next passage of %s.', v_series, b.name), 300),
            'passages', jsonb_build_array(jsonb_build_object(
              'reference', format('%s %s:%s-%s', v_name, v_ch, v_start, v_last),
              'book', v_name, 'usfm', b.usfm, 'chapter', v_ch, 'start', v_start, 'end', v_last)));
        end if;
      end if;
    end if;
  end if;

  -- The rotation entry this church has had least recently (never, first).
  select x.ord, x.series, x.passages into r
    from public.church_autopilot_rotation() x
    left join lateral (
      select max(v.drop_date) as last_on from public.church_verses v
       where v.church_id = p_church_id and v.series = x.series and v.discarded_at is null
    ) u on true
   order by u.last_on nulls first, x.ord
   limit 1;
  return jsonb_build_object('kind', 'rotation', 'series', r.series, 'guidance', null, 'passages', r.passages);
end;
$$;
revoke all on function public.church_autopilot_default_plan(uuid, date) from public, anon, authenticated;
grant execute on function public.church_autopilot_default_plan(uuid, date) to service_role;

-- ---------------------------------------------------------------------------
-- Claim a DUE week, once (the primary key). Restated from 0152 with ONE
-- change: no backup plan saved → the default plan above instead of
-- `no_source` (still recorded if the plan somehow comes back empty).
-- ---------------------------------------------------------------------------
create or replace function public.church_autopilot_claim(p_church_id uuid, p_user uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_st     jsonb := public.church_autopilot_state(p_church_id);
  s        public.church_autopilot;
  v_week   date;
  v_from   date;
  v_to     date;
  v_open   int;
  v_job    uuid;
  v_rows   int;
  v_plan   jsonb;
  v_series text;
  v_pass   jsonb;
  v_guide  text;
begin
  if v_st->>'state' <> 'due' then return v_st || jsonb_build_object('run', false); end if;
  select * into s from public.church_autopilot where church_id = p_church_id;
  v_week := (v_st->>'week_start')::date;
  v_from := (v_st->>'window_from')::date;
  v_to   := (v_st->>'window_to')::date;

  if s.fallback_passages is not null then
    v_series := s.fallback_series; v_pass := s.fallback_passages; v_guide := s.fallback_guidance;
  else
    v_plan   := public.church_autopilot_default_plan(p_church_id, v_from);
    v_series := v_plan->>'series'; v_pass := v_plan->'passages'; v_guide := v_plan->>'guidance';
  end if;

  if v_series is null or v_pass is null or jsonb_typeof(v_pass) <> 'array' or jsonb_array_length(v_pass) = 0 then
    insert into public.church_autopilot_weeks (church_id, week_start, outcome)
    values (p_church_id, v_week, 'no_source') on conflict do nothing;
    return public.church_autopilot_state(p_church_id) || jsonb_build_object('run', false);
  end if;

  select count(*) into v_open
    from generate_series(v_from, v_to, interval '1 day') d
   where not exists (select 1 from public.church_verses v
                      where v.church_id = p_church_id and v.drop_date = d::date and v.discarded_at is null);
  if v_open < 2 then
    insert into public.church_autopilot_weeks (church_id, week_start, outcome)
    values (p_church_id, v_week, 'covered') on conflict do nothing;
    return public.church_autopilot_state(p_church_id) || jsonb_build_object('run', false);
  end if;

  insert into public.church_autopilot_weeks (church_id, week_start, outcome)
  values (p_church_id, v_week, 'fallback') on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return public.church_autopilot_state(p_church_id) || jsonb_build_object('run', false); end if;

  insert into public.church_auto_weeks (church_id, created_by, status, source, autopilot, series, passages, guidance, start_date, days, window_end)
  values (p_church_id, p_user, 'queued', 'fallback', true, v_series, v_pass, v_guide,
          v_from, least(v_open, 7), v_to)
  returning id into v_job;
  update public.church_autopilot_weeks set job_id = v_job where church_id = p_church_id and week_start = v_week;
  return public.church_autopilot_state(p_church_id) || jsonb_build_object('run', true, 'job_id', v_job);
end;
$$;
revoke all on function public.church_autopilot_claim(uuid, uuid) from public, anon, authenticated;
grant execute on function public.church_autopilot_claim(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Re-open this week when it settled as `no_source` and can still be drafted.
-- True when it was re-opened (the state then reads `due`). Service role.
-- ---------------------------------------------------------------------------
create or replace function public.church_autopilot_reopen(p_church_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_st   jsonb := public.church_autopilot_state(p_church_id);
  v_from date;
  v_to   date;
  v_open int;
begin
  if v_st->>'state' is distinct from 'no_source' then return false; end if;
  v_from := (v_st->>'window_from')::date;
  v_to   := (v_st->>'window_to')::date;
  -- The claim's own count of empty days (0152).
  select count(*) into v_open
    from generate_series(v_from, v_to, interval '1 day') d
   where not exists (select 1 from public.church_verses v
                      where v.church_id = p_church_id and v.drop_date = d::date and v.discarded_at is null);
  if v_open < 2 then return false; end if;
  delete from public.church_autopilot_weeks
   where church_id = p_church_id
     and week_start = (v_st->>'week_start')::date
     and outcome = 'no_source'
     and job_id is null;
  return found;
end;
$$;
revoke all on function public.church_autopilot_reopen(uuid) from public, anon, authenticated;
grant execute on function public.church_autopilot_reopen(uuid) to service_role;

-- Door 1: the backup plan was saved, changed or cleared, or Autopilot was switched on.
create or replace function public.church_autopilot_reopen_on_save()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.enabled
     and (tg_op = 'INSERT'
          or new.fallback_passages is distinct from old.fallback_passages
          or not old.enabled) then
    perform public.church_autopilot_reopen(new.church_id);
  end if;
  return null;
end;
$$;
revoke all on function public.church_autopilot_reopen_on_save() from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'church_autopilot_reopen_on_save'
                   and tgrelid = 'public.church_autopilot'::regclass) then
    create trigger church_autopilot_reopen_on_save
      after insert or update of fallback_passages, enabled on public.church_autopilot
      for each row execute function public.church_autopilot_reopen_on_save();
  end if;
end $$;

-- Door 2: "Draft this week now". ok + the state after (`due` when the week was
-- re-opened), or ok:false with not_skipped | no_open_days and the state.
create or replace function public.church_autopilot_rescue(p_church_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_gate text := public.church_gen_can(p_church_id);
  v_st   jsonb;
begin
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  if public.church_autopilot_reopen(p_church_id) then
    return jsonb_build_object('ok', true) || public.church_autopilot_state(p_church_id);
  end if;
  v_st := public.church_autopilot_state(p_church_id);
  return jsonb_build_object('ok', false, 'reason',
           case when v_st->>'state' = 'no_source' then 'no_open_days' else 'not_skipped' end) || v_st;
end;
$$;
revoke all on function public.church_autopilot_rescue(uuid) from public, anon;
grant execute on function public.church_autopilot_rescue(uuid) to authenticated;
