// Finding your church on the map.
//
// The source of record is `church_places` — our own table, loaded from the
// Overture Maps places theme (see supabase/migrations/0091_church_places.sql
// and scripts/load-church-places.mjs). It replaced live OpenStreetMap, which
// this app shipped on until a real congregation in Windermere, Florida proved
// the problem: the building had been renamed to Quay Church over a year
// earlier, OSM still said "Lifebridge Church", and the picker kept offering
// the old name to people trying to add the new one. Overture — which merges
// Meta, Microsoft and Foursquare — had the rename three weeks after it
// happened.
//
// Three sources, in this order:
//   • `search_church_places` — the Overture index. One request per location,
//     filtered locally as you type, so typing is instant. This is a bounding
//     box query on an indexed table, so it is also the fastest of the three by
//     a wide margin.
//   • Overpass (OSM) — ONLY where the index has nothing. The index is loaded a
//     region at a time, so somewhere we haven't loaded yet must still find its
//     churches rather than showing an empty screen. Stale names there are the
//     accepted cost of not having a dead picker abroad.
//   • Nominatim (OSM) — the same fallback rule for the by-name search.
// Anything none of them knows can still be added by hand (see ChurchScreen).
//
// Results are merged with churches already in our own database (search_churches)
// so a congregation another player added always shows up, even offline-ish.

import { supabase } from './supabase'
import { milesBetween, type Coords } from './geo'

export interface ChurchPlace {
  /**
   * Stable identity: 'ovt:<gers id>' for a place from the Overture index,
   * 'osm:node/123' for one that came from the OSM fallback, 'geo:…' when typed
   * in by hand. `join_church` only trusts the first two.
   */
  placeKey: string
  name: string
  address?: string | null
  city?: string | null
  region?: string | null
  lat: number
  lng: number
  miles: number
  /** Set when this church already exists in Verse Arcade. */
  churchId?: string
  /**
   * The one paid slot on the suggestion list (`sponsored_church`, 0077). Set
   * only on a row the server chose; the client can never mark one itself, and
   * every surface that renders it must label it — see `docs/CHURCH-PROMOTION.md`.
   */
  sponsored?: boolean
  promotionId?: string
  xp?: number
  level?: number
  members?: number
  /**
   * Overture's own 0..1 score for the place, on rows that came from the index.
   * Carried so a thin record can be ranked below a solid one — never to hide
   * one, because a small country church with a single source is exactly the
   * congregation this app most wants to be findable.
   */
  confidence?: number
}

/** Our own index is Postgres; if it's slow we carry on with what we have. */
const PLACES_TIMEOUT_MS = 10000

interface PlaceRow {
  place_key?: string
  name?: string
  address?: string | null
  city?: string | null
  region?: string | null
  lat?: number
  lng?: number
  confidence?: number
  miles?: number
}

function fromIndex(row: PlaceRow, from: Coords | null): ChurchPlace | null {
  const name = (row.name || '').trim()
  const lat = Number(row.lat)
  const lng = Number(row.lng)
  if (!row.place_key || !name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return {
    placeKey: row.place_key,
    name,
    address: row.address ?? null,
    city: row.city ?? null,
    region: row.region ?? null,
    lat,
    lng,
    miles: Number.isFinite(Number(row.miles))
      ? Number(row.miles)
      : from
        ? milesBetween(from, { lat, lng })
        : NaN,
    confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : undefined,
  }
}

/**
 * The Overture index: every church within `radiusMiles`, nearest first, or an
 * optional name filter. Swallows its own failures — no keys, a server without
 * 0091, a network blip and "nothing loaded for this region yet" all land on an
 * empty list, and the caller falls back to OSM.
 */
export async function nearbyChurchPlaces(
  from: Coords,
  radiusMiles = 30,
  q: string | null = null,
  limit = 60,
): Promise<ChurchPlace[]> {
  if (!supabase) return []
  try {
    const res = await Promise.race([
      supabase.rpc('search_church_places', {
        p_lat: from.lat,
        p_lng: from.lng,
        p_q: q,
        p_radius_miles: radiusMiles,
        p_limit: limit,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), PLACES_TIMEOUT_MS)),
    ])
    if (!res || res.error || !Array.isArray(res.data)) return []
    return (res.data as PlaceRow[])
      .map((r) => fromIndex(r, from))
      .filter((p): p is ChurchPlace => p !== null)
      .sort((a, b) => a.miles - b.miles)
  } catch {
    return []
  }
}

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

const MILES_TO_M = 1609.34

// Every map call gets a deadline. Overpass in particular can queue a request
// for minutes when it's busy, and a request the phone never gets an answer to
// is indistinguishable from a frozen screen — so we give up and let the caller
// fall back to what it already has.
const OVERPASS_TIMEOUT_MS = 15000
const NOMINATIM_TIMEOUT_MS = 12000

/**
 * A signal that aborts on the caller's signal *or* after `ms`, whichever comes
 * first. Call `done()` when the request settles so the timer doesn't outlive it.
 */
function deadline(ms: number, signal?: AbortSignal) {
  const ctl = new AbortController()
  const bail = () => ctl.abort()
  const timer = setTimeout(bail, ms)
  if (signal) {
    if (signal.aborted) bail()
    else signal.addEventListener('abort', bail, { once: true })
  }
  return {
    signal: ctl.signal,
    done() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', bail)
    },
  }
}

// Denominations we surface. OSM tags most churches religion=christian, but
// plenty of small congregations are only tagged amenity=place_of_worship — so
// we take untagged ones too and exclude the religions that are clearly not a
// church, rather than requiring a tag most rural entries don't have.
const NON_CHRISTIAN = new Set([
  'jewish',
  'muslim',
  'buddhist',
  'hindu',
  'sikh',
  'taoist',
  'shinto',
  'jain',
  'bahai',
  'pagan',
  'scientologist',
])

interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

function addressOf(tags: Record<string, string>): string | null {
  const house = tags['addr:housenumber']
  const street = tags['addr:street']
  if (street) return [house, street].filter(Boolean).join(' ')
  return null
}

function fromOverpass(el: OverpassElement, from: Coords): ChurchPlace | null {
  const tags = el.tags || {}
  const name = (tags.name || '').trim()
  if (!name) return null // an unnamed building is not something a player can pick
  const religion = (tags.religion || '').toLowerCase()
  if (religion && NON_CHRISTIAN.has(religion)) return null

  const lat = el.lat ?? el.center?.lat
  const lng = el.lon ?? el.center?.lon
  if (typeof lat !== 'number' || typeof lng !== 'number') return null

  return {
    placeKey: `osm:${el.type}/${el.id}`,
    name,
    address: addressOf(tags),
    city: tags['addr:city'] || null,
    region: tags['addr:state'] || null,
    lat,
    lng,
    miles: milesBetween(from, { lat, lng }),
  }
}

async function overpass(query: string, signal?: AbortSignal): Promise<OverpassElement[]> {
  let lastErr: unknown = null
  for (const url of OVERPASS_ENDPOINTS) {
    // Per endpoint, so a mirror that hangs still leaves time for the other one.
    const limit = deadline(OVERPASS_TIMEOUT_MS, signal)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: limit.signal,
      })
      if (!res.ok) throw new Error(`Overpass ${res.status}`)
      const json = (await res.json()) as { elements?: OverpassElement[] }
      return json.elements ?? []
    } catch (e) {
      // The caller walking away ends it; our own deadline just moves us on.
      if (signal?.aborted) throw e
      lastErr = e
    } finally {
      limit.done()
    }
  }
  throw lastErr ?? new Error('Overpass unreachable')
}

/**
 * Every named church within `radiusMiles` of a point, nearest first. One call
 * covers the whole session's typing — the caller filters this list by name.
 */
export async function nearbyChurches(
  from: Coords,
  radiusMiles = 30,
  signal?: AbortSignal,
): Promise<ChurchPlace[]> {
  const r = Math.round(Math.min(Math.max(radiusMiles, 1), 60) * MILES_TO_M)
  const at = `${from.lat.toFixed(5)},${from.lng.toFixed(5)}`
  const query = `[out:json][timeout:25];
(
  node["amenity"="place_of_worship"](around:${r},${at});
  way["amenity"="place_of_worship"](around:${r},${at});
  relation["amenity"="place_of_worship"](around:${r},${at});
);
out center tags 400;`

  const elements = await overpass(query, signal)
  const seen = new Set<string>()
  const places: ChurchPlace[] = []
  for (const el of elements) {
    const place = fromOverpass(el, from)
    if (!place) continue
    // A church mapped as both a node and a building way shows up twice; keep
    // whichever we see first at that name+spot.
    const dedupe = `${place.name.toLowerCase()}|${place.lat.toFixed(3)},${place.lng.toFixed(3)}`
    if (seen.has(dedupe)) continue
    seen.add(dedupe)
    places.push(place)
  }
  return places.sort((a, b) => a.miles - b.miles)
}

interface NominatimRow {
  osm_type?: string
  osm_id?: number
  lat: string
  lon: string
  name?: string
  display_name?: string
  address?: Record<string, string>
}

/**
 * Name search, bounded to a box around the player when we know where they are.
 * Used when the local list has nothing for what they typed — e.g. a church that
 * meets in a school, or one the map has under a slightly different name — and
 * unbounded (`from` null) when location is off, which is then the only way in.
 */
export async function searchChurchesByName(
  q: string,
  from: Coords | null,
  radiusMiles = 30,
  signal?: AbortSignal,
): Promise<ChurchPlace[]> {
  const query = q.trim()
  if (query.length < 3) return []
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '20',
  })
  if (from) {
    // Degrees of latitude are ~69 miles everywhere; longitude shrinks with
    // latitude, so widen the box by 1/cos(lat) to keep it square-ish on the ground.
    const dLat = radiusMiles / 69
    const dLng = dLat / Math.max(0.2, Math.cos((from.lat * Math.PI) / 180))
    params.set('viewbox', `${from.lng - dLng},${from.lat + dLat},${from.lng + dLng},${from.lat - dLat}`)
    params.set('bounded', '1')
  }

  // With no location we can't bound the box, so this is a plain worldwide name
  // search — the only way to find a church when location is off or refused.
  const limit = deadline(NOMINATIM_TIMEOUT_MS, signal)
  let rows: NominatimRow[]
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      signal: limit.signal,
    })
    if (!res.ok) throw new Error(`Nominatim ${res.status}`)
    rows = (await res.json()) as NominatimRow[]
  } finally {
    limit.done()
  }

  const found = rows
    .map((r): ChurchPlace | null => {
      const lat = Number(r.lat)
      const lng = Number(r.lon)
      const name = (r.name || r.display_name?.split(',')[0] || '').trim()
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
      const addr = r.address || {}
      return {
        placeKey:
          r.osm_type && r.osm_id
            ? `osm:${r.osm_type}/${r.osm_id}`
            : `geo:${name.toLowerCase()}:${lat.toFixed(3)},${lng.toFixed(3)}`,
        name,
        address: [addr.house_number, addr.road].filter(Boolean).join(' ') || null,
        city: addr.city || addr.town || addr.village || addr.hamlet || null,
        region: addr.state || null,
        lat,
        lng,
        // No origin, no distance: formatMiles() renders nothing for NaN, so the
        // row simply shows its address instead of a bogus "0.0 mi".
        miles: from ? milesBetween(from, { lat, lng }) : NaN,
      }
    })
    .filter((p): p is ChurchPlace => p !== null)

  return from ? found.sort((a, b) => a.miles - b.miles) : found
}

/** Case/punctuation-insensitive "does this church match what they typed". */
export function matchesQuery(place: ChurchPlace, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  const hay = `${place.name} ${place.city ?? ''} ${place.address ?? ''}`.toLowerCase()
  // Every word has to appear somewhere, so "grace baptist" finds
  // "Grace Missionary Baptist Church" without needing the exact phrase.
  return needle.split(/\s+/).every((word) => hay.includes(word))
}

/**
 * Merge map results with churches we already know, preferring our own row (it
 * carries the id, XP and level) whenever the two describe the same building.
 */
export function mergePlaces(known: ChurchPlace[], mapped: ChurchPlace[]): ChurchPlace[] {
  const byKey = new Map<string, ChurchPlace>()
  const spot = (p: ChurchPlace) => `${p.name.toLowerCase()}|${p.lat.toFixed(3)},${p.lng.toFixed(3)}`
  const spots = new Set<string>()

  for (const p of known) {
    byKey.set(p.placeKey, p)
    spots.add(spot(p))
  }
  for (const p of mapped) {
    if (byKey.has(p.placeKey) || spots.has(spot(p))) continue
    byKey.set(p.placeKey, p)
    spots.add(spot(p))
  }
  return [...byKey.values()].sort((a, b) => a.miles - b.miles)
}
