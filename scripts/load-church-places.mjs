// Load `church_places` from the Overture Maps places theme.
//
//   node scripts/load-church-places.mjs --release 2026-08-19.0
//   node scripts/load-church-places.mjs --bbox -81.75,28.35,-81.45,28.65   # one town
//
// Why this exists: see the header of supabase/migrations/0089_church_places.sql.
// The short version is that OpenStreetMap was a year and a half stale on a real
// congregation, and Overture — which merges Meta, Microsoft and Foursquare —
// had the current name. Overture's licence (Apache-2.0 / CDLA-Permissive-2.0)
// is also the only one of the candidates that lets us keep a name in our own
// table, which is not optional: a church row is permanent.
//
// Needs the DuckDB CLI on PATH (https://install.duckdb.org). Nothing else — no
// key, no account, no AWS credentials. The bucket is public, which is why every
// request is forced UNSIGNED below.
//
// Output is chunked SQL under `supabase/seed/church-places/`, applied by hand
// like every migration in this project (there is no cron here, by design). The
// runbook is docs/CHURCH-PLACES.md.

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

// Overture publishes monthly and keeps roughly two releases live at a time, so
// a hardcoded default goes stale; --release is the escape hatch and the error
// from S3 when one has been retired is loud rather than silent.
const RELEASE = flag('release', '2026-08-19.0')
// Continental US + Alaska + Hawaii. Overture is worldwide; this is only where
// the app has players today, and the bbox is the one knob that changes that.
const BBOX = flag('bbox', '-180,18,-66,72').split(',').map(Number)
const OUT_DIR = flag('out', 'supabase/seed/church-places')
// Rows per INSERT, and INSERTs per file. 618k US rows lands as ~25 files that
// each apply in a second or two — small enough to paste into the SQL editor,
// and small enough that a failure half way through is cheap to resume.
const ROWS_PER_STATEMENT = 1000
const ROWS_PER_FILE = 25000

if (BBOX.length !== 4 || BBOX.some((n) => !Number.isFinite(n))) {
  console.error('--bbox wants minLng,minLat,maxLng,maxLat')
  process.exit(1)
}
const [minLng, minLat, maxLng, maxLat] = BBOX

// What counts as a church.
//
// Overture's category vocabulary splits by tradition, and the list below is
// every Christian one plus the two generic buckets that hold most small
// congregations. It is an ALLOWLIST rather than the exclude-list the OSM path
// used (src/lib/churchSearch.ts), and that is the safer way round here: OSM
// left most rural churches untagged, so excluding non-Christian religions was
// the only way to keep them, whereas Overture categorises nearly everything.
// A tradition missing from this list shows up as a church nobody can find, so
// add generously.
const CATEGORIES = [
  'church_cathedral',
  'religious_organization',
  'baptist_church',
  'pentecostal_church',
  'evangelical_church',
  'catholic_church',
  'anglican_church',
  'orthodox_church',
  'methodist_church',
  'lutheran_church',
  'presbyterian_church',
  'episcopal_church',
  'mormon_church',
  'adventist_church',
  'christian_church',
  'non_denominational_church',
  'congregational_church',
  'reformed_church',
  'quaker_church',
  'unitarian_church',
  'nondenominational_church',
]

// Overture's confidence is 0..1 across every source that contributed a place.
// 0.3 is low, deliberately: a small country church with one thin source is
// exactly the congregation this app most wants to be findable, and the score
// rides along on the row so the picker can rank rather than exclude.
const MIN_CONFIDENCE = Number(flag('min-confidence', '0.3'))

const S3 = `s3://overturemaps-us-west-2/release/${RELEASE}/theme=places/type=place/*`
const tmpJson = join(process.cwd(), '.overture-places.json')

const sql = `
INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;
-- The bucket is public. Without an explicit empty-credential secret, DuckDB
-- signs with whatever AWS_* happens to be in the environment and S3 answers
-- 403 InvalidAccessKeyId -- which reads like a permissions problem and is not.
CREATE OR REPLACE SECRET ovt (TYPE s3, PROVIDER config, KEY_ID '', SECRET '', REGION 'us-west-2');
SET lambda_syntax='ENABLE_SINGLE_ARROW';

COPY (
  SELECT
    'ovt:' || id                                AS place_key,
    -- Overture's places theme carries no OpenStreetMap record ids today, so
    -- this is null in practice. It is extracted anyway: the day OSM appears in
    -- the sources array, a re-run starts filling it and the id bridge in
    -- refresh_church_names() begins working with no schema change.
    (
      SELECT 'osm:' || s.record_id FROM UNNEST(sources) AS t(s)
      WHERE lower(s.dataset) IN ('openstreetmap', 'osm') AND s.record_id IS NOT NULL
      LIMIT 1
    )                                           AS osm_key,
    names.primary                               AS name,
    addresses[1].freeform                       AS address,
    addresses[1].locality                       AS city,
    addresses[1].region                         AS region,
    ROUND(ST_Y(geometry)::DOUBLE, 6)            AS lat,
    ROUND(ST_X(geometry)::DOUBLE, 6)            AS lng,
    ROUND(COALESCE(confidence, 0)::DOUBLE, 4)   AS confidence
  FROM read_parquet('${S3}')
  WHERE bbox.xmin BETWEEN ${minLng} AND ${maxLng}
    AND bbox.ymin BETWEEN ${minLat} AND ${maxLat}
    AND categories.primary IN (${CATEGORIES.map((c) => "'" + c + "'").join(',')})
    AND names.primary IS NOT NULL
    AND trim(names.primary) <> ''
    AND COALESCE(confidence, 0) >= ${MIN_CONFIDENCE}
) TO '${tmpJson}' (FORMAT JSON);
`

console.log(`Overture release ${RELEASE}`)
console.log(`bbox ${minLng},${minLat} → ${maxLng},${maxLat}, confidence ≥ ${MIN_CONFIDENCE}`)
console.log('Querying S3 — a US-wide pass reads a lot of parquet and takes several minutes…')

try {
  execFileSync('duckdb', ['-c', sql], { stdio: ['ignore', 'inherit', 'inherit'] })
} catch (e) {
  console.error('\nDuckDB failed. Is the CLI on PATH? https://install.duckdb.org')
  process.exit(1)
}

// NDJSON rather than CSV on purpose: a church name with a comma, a quote or a
// newline in it is a parsing bug waiting to happen, and JSON.parse has no such
// opinions.
const lines = readFileSync(tmpJson, 'utf8').split('\n').filter((l) => l.trim())
rmSync(tmpJson, { force: true })
console.log(`${lines.length.toLocaleString()} places`)
if (!lines.length) {
  console.error('Nothing came back — wrong release, or a bbox with no churches in it.')
  process.exit(1)
}

const q = (v) => (v === null || v === undefined || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`)
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 'null')

if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })

// Dedupe on place_key before writing. One statement carrying the same key twice
// is not a warning, it is an ERROR — "ON CONFLICT DO UPDATE command cannot
// affect row a second time" — and it aborts the whole file.
const seen = new Set()
const rows = []
for (const line of lines) {
  let r
  try { r = JSON.parse(line) } catch { continue }
  if (!r.place_key || !r.name || !Number.isFinite(r.lat) || !Number.isFinite(r.lng)) continue
  if (seen.has(r.place_key)) continue
  seen.add(r.place_key)
  rows.push(r)
}
console.log(`${rows.length.toLocaleString()} after dedupe`)

const HEAD = `-- Generated by scripts/load-church-places.mjs — do not hand-edit.
-- Overture Maps places, release ${RELEASE}. Licence: Apache-2.0 / CDLA-Permissive-2.0.
-- Idempotent: re-running replaces each row by place_key.
`

let fileNo = 0
const files = []
for (let start = 0; start < rows.length; start += ROWS_PER_FILE) {
  const slice = rows.slice(start, start + ROWS_PER_FILE)
  const parts = [HEAD]
  for (let i = 0; i < slice.length; i += ROWS_PER_STATEMENT) {
    const batch = slice.slice(i, i + ROWS_PER_STATEMENT)
    parts.push(
      'insert into public.church_places' +
        ' (place_key, osm_key, name, address, city, region, lat, lng, confidence, release, updated_at) values',
    )
    parts.push(
      batch
        .map(
          (r) =>
            `  (${q(r.place_key)},${q(r.osm_key)},${q(String(r.name).slice(0, 120))},` +
            `${q(r.address && String(r.address).slice(0, 200))},${q(r.city && String(r.city).slice(0, 80))},` +
            `${q(r.region && String(r.region).slice(0, 80))},${num(r.lat)},${num(r.lng)},` +
            `${num(r.confidence)},${q(RELEASE)},now())`,
        )
        .join(',\n') +
        `\non conflict (place_key) do update set
  osm_key = excluded.osm_key, name = excluded.name, address = excluded.address,
  city = excluded.city, region = excluded.region, lat = excluded.lat, lng = excluded.lng,
  confidence = excluded.confidence, release = excluded.release, updated_at = now();\n`,
    )
  }
  const name = `${String(++fileNo).padStart(3, '0')}_places.sql`
  writeFileSync(join(OUT_DIR, name), parts.join('\n'))
  files.push(name)
}

console.log(`\nWrote ${files.length} file(s) to ${OUT_DIR}/`)
console.log('\nApply in order, then link and refresh:')
console.log('  select public.link_church_places();   -- once, after the first load')
console.log('  select public.refresh_church_names(); -- after every load')
