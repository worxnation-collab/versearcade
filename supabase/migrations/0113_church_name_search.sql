-- 0113 — Finding a church that is NOT near you.
--
-- The picker has always assumed your church is where you are: the nearby list
-- is 30 miles, "Search a wider area" was 60, and `search_church_places` (0091)
-- can only ever answer inside a bounding box. That assumption is wrong for an
-- entire class of player — a student at college, somebody who moved, anybody
-- travelling — whose church is their HOMETOWN's, and it fails in the worst
-- possible way: not with "we couldn't find it", but by pushing them into the
-- add-by-hand card, which pins the church AT THEIR CURRENT POSITION.
--
-- That is not hypothetical. On 2026-09-16 a player 155 miles from home added
-- "Appleton Alliance Church" and it was pinned at a Chipotle in Eau Claire —
-- while the real building sat in this very table, as
-- `ovt:a432f2d0-9edb-4049-8487-4c4f701cd482`, with an address and a 0.97
-- confidence. Every ingredient of the right answer was already loaded; there
-- was simply no query that could reach past the box to it.
--
-- So: a name search with NO radius at all. The index is nationwide already
-- (606,272 US places); this is the function that lets a player say which one
-- they mean instead of being asked where they are standing.
--
-- Three things about it are load-bearing.
--
--   • It matches PER WORD, and that is a fix rather than a nicety.
--     `search_church_places` filters with one `name ilike '%' || p_q || '%'`,
--     so the query has to be a contiguous substring of the name. The player
--     above typed "Appleton Alliance"; Overture calls the place "Alliance
--     Church - Appleton". A single substring match cannot find it — from ANY
--     distance, standing in the car park included. Every word must appear
--     somewhere in name + city + region instead, which is exactly what the
--     client's `matchesQuery` already does to the nearby list. That is why
--     browsing found churches the by-name search could not: the two halves of
--     the same screen disagreed about what "matches" means. KEEP THEM IN SYNC
--     (src/lib/churchSearch.ts → matchesQuery) — the usual pair.
--
--   • It ranks a NAME match above a CITY match. Typing "Appleton" should lead
--     with churches called Appleton-something, not with all 200 churches that
--     happen to be in Appleton. Then nearest-first when we know where the
--     player is, because a name is often ambiguous and distance is the best
--     tiebreak we have; then Overture's confidence when we don't.
--
--   • It adds NO promotion, NO distance claim and NO new column. The sponsored
--     slot (0077) is untouched and still capped at 30 miles — a paid row must
--     not be able to reach nationwide through this door, so this function
--     returns plain index rows and does not know promotions exist.
--
-- What it does NOT do is grant anything: a place is still only a place.
-- `join_church` (0092) is unchanged and already does the right thing with an
-- `ovt:` key — it copies the PLACE's own lat/lng, address, city and region and
-- ignores whatever the client sent. So a church found this way lands at its
-- real building, which is the whole point.

-- ---------------------------------------------------------------------------
-- The index that makes it affordable
-- ---------------------------------------------------------------------------
create extension if not exists pg_trgm with schema extensions;

-- ONE normaliser, used for the index, for the haystack and for what the player
-- typed — so the three can never drift apart. That is not tidiness: an
-- expression index is used only when the query's expression matches it
-- EXACTLY, and when it stops matching nothing breaks, the function just goes
-- back to seq-scanning 606k rows. Writing the expression out three times is
-- three chances to lose the index silently.
--
-- What it does, and why each half is needed:
--   • An apostrophe is DELETED, so "St. Mark's" and "St Marks" both become
--     "st marks". Deleting rather than spacing is the point — spacing gives
--     "mark s", which "marks" still does not match. Half the saints in this
--     table carry one, so a player typing the obvious thing must find them.
--   • Every other run of punctuation becomes ONE SPACE, so "Alliance Church -
--     Appleton" and "alliance church appleton" are the same string.
-- IMMUTABLE because an index expression requires it; `search_path` pinned
-- because an index expression must not be able to mean something else later.
create or replace function public.church_place_haystack(
  p_name   text,
  p_city   text default null,
  p_region text default null
)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select regexp_replace(
           replace(
             lower(coalesce(p_name, '') || ' ' || coalesce(p_city, '') || ' ' || coalesce(p_region, '')),
             '''', ''
           ),
           '[^a-z0-9]+', ' ', 'g'
         );
$$;

grant execute on function public.church_place_haystack(text, text, text) to anon, authenticated;

-- Measured before this existed: two ANDed `ilike '%word%'` over the 606k rows
-- was a parallel seq scan, 838ms, 14,001 buffers — for ONE row. `authenticated`
-- has an 8s statement_timeout, so that is not an outage, just slow enough that
-- a player types another letter before it lands. Trigrams make it an index probe.
create index if not exists church_places_search_trgm_idx
  on public.church_places
  using gin (public.church_place_haystack(name, city, region) extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- The search
-- ---------------------------------------------------------------------------
-- Same row envelope as `search_church_places` (0091) so the picker can render
-- both lists with one mapper and never has to know which came from where.
-- `p_lat`/`p_lng` are OPTIONAL: with no location this is a plain nationwide
-- name lookup, which is also the only way in when location is refused.
create or replace function public.search_church_places_named(
  p_q     text,
  p_lat   double precision default null,
  p_lng   double precision default null,
  p_limit integer default 40
)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_q      text := btrim(coalesce(p_q, ''));
  v_raw    text[];
  v_words  text[];
  v_driver text;
  v_limit  integer := least(greatest(coalesce(p_limit, 40), 1), 60);
  v_rows   jsonb;
begin
  -- The same floor the client uses before it offers the button. Two letters
  -- against a nationwide index is a scan that can only return noise.
  if length(v_q) < 3 then return '[]'::jsonb; end if;

  -- Every word, as its own `%word%` pattern. Punctuation is not stripped: the
  -- patterns are substrings, so "st." still finds "St. Mark's" and a hyphen in
  -- "Alliance Church - Appleton" is simply never looked at.
  --
  -- LIKE's own metacharacters ARE stripped, and that is not paranoia about
  -- injection (these are parameters, never concatenated SQL) — it is that a
  -- player types a search box, not a pattern. Unescaped, "Gr_ce" silently
  -- matches "Grace" and a lone "%" matches all 606,272 rows and sorts them by
  -- confidence, which is a nationwide directory dump dressed as a search
  -- result. Backslash first, or the escapes escape each other.
  -- The needle goes through the SAME normaliser as the haystack, so "St. Mark's",
  -- "St Marks" and "st marks" are one query. LIKE's own metacharacters survive
  -- it (they are not punctuation to a regex class that keeps only a-z0-9), so
  -- they are escaped after — backslash first, or the escapes escape each other.
  -- A trailing "s" is dropped from each word, NEEDLE ONLY, and that is a real
  -- gap rather than polish: this table holds "St. Joseph Parish" AND "St
  -- Joseph's Church", a person types whichever they say, and "josephs" is not
  -- a substring of "st joseph parish". Because these are SUBSTRING patterns the
  -- stem is always a prefix of the word it came from, so asking for "joseph"
  -- finds both spellings and can never find less than the full word would —
  -- which is why it is safe one-sidedly and needs no change to the index.
  -- Four characters or more only, so "is"/"us" are left alone and every word
  -- keeps a trigram for pg_trgm to look up.
  -- KEEP IN SYNC with `searchWords` in src/lib/churchSearch.ts.
  select array_agg(replace(replace(replace(
           case when length(w) >= 4 and w like '%s' then left(w, -1) else w end,
           '\', '\\'), '%', '\%'), '_', '\_'))
    into v_raw
    from unnest(regexp_split_to_array(btrim(public.church_place_haystack(v_q)), '\s+')) as w
   where w <> '';

  if v_raw is null or array_length(v_raw, 1) = 0 then return '[]'::jsonb; end if;

  -- A word longer than this is almost certainly a paste rather than a search,
  -- and a very long trigram pattern is the one shape that degrades badly here.
  if exists (select 1 from unnest(v_raw) w where length(w) > 60) then
    return '[]'::jsonb;
  end if;

  select array_agg('%' || w || '%') into v_words from unnest(v_raw) as w;

  -- THE DRIVER, and it is the whole reason this query is affordable.
  --
  -- `haystack like all (v_words)` is correct and CANNOT USE THE INDEX: the
  -- planner does not decompose a ScalarArrayOp over LIKE into per-pattern
  -- index conditions, so it plans a parallel seq scan — 760ms and 13,998
  -- buffers over the 606k rows, measured against production with the trigram
  -- index sitting right there unused. That is the silent-slowness failure this
  -- file warns about, and it was found by reading a plan, not the diff.
  --
  -- So ONE word is restated as a plain `like`, which the GIN trigram index does
  -- answer, and the `all (...)` stays as the filter over the handful of rows it
  -- returns. Same result, 1.8ms — a redundant predicate that is load-bearing.
  -- The longest word drives it because it carries the most trigrams and so is
  -- the most selective; a word under 3 characters has NO trigram for pg_trgm to
  -- look up, which is why a query made only of those is refused rather than
  -- quietly seq-scanning.
  select w into v_driver from unnest(v_raw) as w order by length(w) desc, w limit 1;
  if v_driver is null or length(v_driver) < 3 then return '[]'::jsonb; end if;
  v_driver := '%' || v_driver || '%';

  with matched as (
    select p.place_key,
           p.name,
           p.address,
           p.city,
           p.region,
           p.lat,
           p.lng,
           p.confidence,
           case
             when p_lat is null or p_lng is null then null
             else round(public.miles_between(p_lat, p_lng, p.lat, p.lng)::numeric, 1)
           end as miles,
           -- 0 when the NAME alone carries every word, 1 when the city or
           -- region had to help. A church called Appleton-something beats one
           -- that is merely in Appleton.
           case
             when public.church_place_haystack(p.name) like all (v_words) then 0
             else 1
           end as rank
      from public.church_places p
     -- The indexed predicate first, then the full per-word test. See v_driver.
     where public.church_place_haystack(p.name, p.city, p.region) like v_driver
       and public.church_place_haystack(p.name, p.city, p.region) like all (v_words)
     -- Bounded before ordering: a common word ("grace") matches thousands, and
     -- nothing past the first screen of a name search is ever read.
     limit 400
  )
  select coalesce(jsonb_agg(row_json order by rank, miles nulls last, confidence desc nulls last), '[]'::jsonb)
    into v_rows
    from (
      select m.rank,
             m.miles,
             m.confidence,
             jsonb_build_object(
               'place_key',  m.place_key,
               'name',       m.name,
               'address',    m.address,
               'city',       m.city,
               'region',     m.region,
               'lat',        m.lat,
               'lng',        m.lng,
               'confidence', m.confidence,
               'miles',      m.miles
             ) as row_json
        from matched m
       order by m.rank, m.miles nulls last, m.confidence desc nulls last
       limit v_limit
    ) top;

  return coalesce(v_rows, '[]'::jsonb);
end;
$$;

-- Same reach as `search_church_places`: this is public place data and the
-- public church pages read it without an account.
grant execute on function public.search_church_places_named(text, double precision, double precision, integer)
  to anon, authenticated;
