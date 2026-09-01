# Where churches come from

`church_places` is the app's own index of real-world churches, loaded from the
[Overture Maps](https://overturemaps.org) places theme. It replaced live
OpenStreetMap in `0091`.

> **Numbering note.** These shipped as `0091` / `0092` in the tree but were
> applied to production while they were still numbered `0089` / `0090`, because
> another branch took `0089` the same day. Production's `schema_migrations`
> therefore reads `0089_church_places_*` and `0090_church_name_locks*`. That is
> expected — do not re-apply them to "fix" the numbers.

## Why we moved off OpenStreetMap

A real congregation found the bug. Quay Church in Windermere, Florida was
renamed more than a year ago. OpenStreetMap still had the building as
**"Lifebridge Church"** (`way/553118418`, last indexed 2026-04-28), so the
picker kept offering the old name to the very people trying to add the new one
— and once somebody picked it, `churches.name` froze that name forever.

Overture's record of the same address, `12120 Chase Rd`, said **"Quay Church"**,
updated 2026-08-10 — three weeks old, from Meta. Overture merges Meta,
Microsoft, Foursquare and others, which is why it carried a rename that OSM's
volunteers hadn't reached.

Two halves of the bug, and both had to be fixed:

1. **The source was stale.** → the index below.
2. **A name was written once at join time and never looked at again.** → so
   even a perfect source would have gone stale the day after somebody joined.
   `refresh_church_names()` is that half, and it is the one people forget.

## Why not Google or Foursquare

Both are fresher than OSM, and neither can legally back this table. Their terms
permit storing their own opaque id indefinitely and **nothing else** — not the
name, not the address, not the coordinates. A `churches` row is permanent: a
congregation banks XP against it for years, it is drawn in the churchyard and
named on the local board. Complying with those terms would mean re-fetching a
name every time a leaderboard rendered, which puts a per-call price on a screen
people open all day.

Overture is published under Apache-2.0 / CDLA-Permissive-2.0, which permits
exactly what this app needs. It is also $0, needs no key in a baked `dist`, and
turns the slowest network call in the app into a bounding-box query on an
indexed local table.

Sources, for the next person who re-opens this decision:
[Google's caching policy](https://developers.google.com/maps/documentation/places/web-service/policies),
[Foursquare's](https://docs.foursquare.com/developer/reference/upcoming-changes),
[Overture's licence](https://docs.overturemaps.org/guides/places/).

## Loading it

Needs the [DuckDB CLI](https://install.duckdb.org) on PATH. Nothing else — no
key, no account, no AWS credentials; the bucket is public and the loader forces
unsigned requests. (If you see `403 InvalidAccessKeyId`, that is stray `AWS_*`
environment variables being signed with, not a permissions problem.)

```bash
node scripts/load-church-places.mjs --release 2026-08-19.0   # US, ~618k places
node scripts/load-church-places.mjs --bbox -81.75,28.35,-81.45,28.65   # one town
```

It writes chunked SQL to `supabase/seed/church-places/` (gitignored — the US set
is ~90MB of INSERTs). Apply the files in order, then:

```sql
select public.link_church_places();    -- once, after the first load
select public.refresh_church_names();  -- after EVERY load. This is the half people forget.
```

Overture publishes monthly and keeps roughly two releases live, so `--release`
goes stale; a retired one fails loudly at S3 rather than quietly. There is no
cron here on purpose — same as the rivalry, this project has none.

## The three things worth knowing before changing it

**Overture places carries no OpenStreetMap ids.** The `sources` array is Meta,
Microsoft, Foursquare, BrightQuery, AllThePlaces — no OSM at all (checked
against the 2026-08-19 release). So there is no id to match a church joined
under `0040` against, and `churches.place_ref` holds a **positional** link
instead, resolved once by `link_church_places()` and inspectable afterwards.
The `osm_key` column is kept and the loader fills it, so the day OSM appears in
`sources` the id bridge starts working with no schema change — but nothing may
depend on it being populated.

**Linking refuses to guess, and that is not timidity.** A church campus
routinely has several Overture entries at one address. Windermere has four at
12120 Chase Rd:

| Name | Confidence | Distance |
|---|---|---|
| Quay Church | 0.97 | 0.0038 mi |
| Harvest Bible Chapel Of Orlando Inc | 0.66 | 0.0086 mi |
| **Lifebridge Men** | **0.99** | 0.0098 mi |
| Wake Students | 0.92 | 0.0140 mi |

Highest-confidence picks the *wrong* one. That is why `link_church_places()`
links only where there is exactly one candidate, and
`church_link_candidates()` lists the rest for a person to resolve with one
`update ... set place_ref = …`. There is no automatic rule here that is not
sometimes a wrong rename, and a wrong rename lands on somebody's congregation.

**A single WRONG candidate is not the same as an ambiguous one, and only a
person can tell.** This bit us on the first production run. Lighthouse
Charlottesville linked perfectly — one Overture row, its own address, 0.012
miles, no competition — to a row named "Hyphen Lighthouse", which the
congregation uses nowhere. An ambiguity guard has nothing to say about that,
and no positional rule can: the building is right and the name is wrong.

So there is an override, and it is the thing to reach for when a source is
wrong about a church:

```sql
select public.set_church_name('<church id>', 'Lighthouse Charlottesville', true);
```

`name_locked` survives every future `refresh_church_names()` and every
`join_church`. It locks only the NAME — address, city and region still fill in,
because the lock says the source is wrong about what the church is *called*, not
about which building it is.

**Renames fire on names, not spellings.** `church_name_key()` collapses case,
punctuation, `St.`/`Saint`, `&`/`and` and a leading `The`, and a refresh only
moves a name when those keys differ. Without it the first run renamed the app's
largest congregation from "Saint Thomas Aquinas Catholic Church" to "St. Thomas
Aquinas Catholic Church" — not wrong, just churn on 21,000 XP worth of
congregation.

**A hand-added `geo:` church is never touched.** Somebody typed that name in
themselves, and a hand-added church is pinned at the *player's* position rather
than the building's — so proximity means nothing for it. (That is also why the
Windermere row sits 5.4 miles from the building it names.)

## The OSM fallback is still there

`search_church_places` only knows the regions somebody has loaded. Outside them
the picker falls back to Overpass and Nominatim exactly as it did before, because
an empty picker is a dead end and a stale name beats no church at all. Anywhere
the index has rows, OSM is never called. Loading a new region is a `--bbox` run.

**So load whole regions, not small boxes.** The fallback triggers on the index
returning *zero* rows, which is the right rule at the edge of the world and the
wrong one at the edge of a partial load: somebody standing 20 miles outside a
loaded box gets the handful of churches that happen to fall inside their radius,
and because that isn't zero, OSM is never consulted — a shorter list than they
would have had before the index existed. A country-sized load makes this moot
inside that country. A city-sized one puts a ring of degraded results around it.

If a partial load is ever genuinely wanted, the fallback needs to become a
question about COVERAGE rather than about row count — "does the index know this
area at all", answered from the loaded bboxes — and that is a schema change
(`church_place_regions`, or similar), not a tweak to the client's `=== 0`.
