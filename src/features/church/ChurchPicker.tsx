import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/Button'
import { supabase } from '@/lib/supabase'
import { useJuice } from '@/juice/useJuice'
import { useChurch } from '@/store/church'
import { formatMiles, getPosition, geoErrorMessage, LocationError, milesBetween, type Coords } from '@/lib/geo'
import {
  churchesInCity,
  cityLabel,
  matchesQuery,
  mergePlaces,
  nearbyChurches,
  nearbyChurchPlaces,
  searchChurchCities,
  searchChurchesByName,
  searchChurchPlacesByName,
  type ChurchCity,
  type ChurchPlace,
} from '@/lib/churchSearch'

// Find your church: share your location once, type its name, tap it.
//
// The nearby list is fetched ONCE per location and filtered as you type, so
// typing is instant. Only when the local list comes up empty do we go back out
// for a wider name search.
//
// Where the churches come from changed in 0091: our own Overture-loaded index
// (`search_church_places`) leads, and live OpenStreetMap is now only the
// fallback for a region we haven't loaded yet. See src/lib/churchSearch.ts for
// why — the short version is that OSM was a year and a half stale on a real
// congregation and kept offering its old name to the people adding its new one.
//
// Your church is NOT necessarily near you, and that assumption was this
// screen's worst bug (0113). The nearby list is 30 miles because that is the
// right default; the way PAST it has to be reachable at every moment, not only
// when the nearby list happens to come back empty. A student at college, anyone
// who moved, anyone travelling has a hometown church hundreds of miles away,
// and the old screen answered them by offering the add-by-hand card — which
// pins a church AT THE PLAYER'S CURRENT POSITION. That is how a real
// congregation became a Chipotle 155 miles from itself. Two things follow, and
// both are load-bearing:
//   • "Search everywhere by name" is offered whenever anything is typed, never
//     gated on the local list being empty. A partial local match used to hide
//     the only way out.
//   • Adding by hand LOOKS FIRST (see `addManually`). The name a player types
//     is usually in the index already; offering those rows before creating a
//     pin is the difference between joining a church and inventing one.
//
// And the front door is TWO doors now (0114), which is the other half of that
// same bug rather than a separate feature. Sharing a location was mandatory to
// get past the first screen, so the app asked everybody the one question —
// "where are you standing?" — whose answer is irrelevant to a player whose
// church is in their hometown. "Which town?" is the question they can actually
// answer, and it is strictly more capable than a name search: somebody who
// knows where their church is but not exactly what it is called has nothing to
// type into a name box, and "every church in Appleton" answers them.
//
// Three things about the city door are load-bearing:
//   • It is an EQUAL door, not a fallback. It stands beside "Use my location"
//     on the first screen rather than behind a "can't share?" link, because for
//     a whole class of player it is the RIGHT answer and not a consolation.
//   • A city carries no distances, and the list says so by simply not showing
//     any — `miles` is null on every row and the address takes its place. A
//     distance measured from a town centre would be a number about nothing.
//   • The town's centre is used for exactly two things: pinning a church added
//     by hand (the right town, which is the whole complaint this fixes) and
//     asking about the sponsored slot. It is never shown as a location and
//     never called "you".
//
// The hard rule here, learned from a TestFlight build that sat on "Looking up
// churches nearby…" forever: the map lookup NEVER blocks the screen. The moment
// we have coordinates — or fail to get any — the search box, the list and the
// add-by-hand card are on screen and usable. Results fill in behind them, and
// every network call has a deadline, so there is no state this screen can get
// stuck in.

const SEARCH_RADIUS_MILES = 30
/**
 * How many churches lead the screen as suggestions.
 *
 * Three, because the point of the strip is that it can be read without
 * scrolling or typing — a "suggestion" you have to scan twenty of is a search
 * result with a nicer heading. Everything else is still right below it.
 */
const SUGGEST_COUNT = 3
/** Our own churches come from Postgres; if that's slow, we carry on without it. */
const KNOWN_TIMEOUT_MS = 10000
/**
 * How many a nationwide name search returns.
 *
 * Deliberately not large. "St Josephs" matches hundreds of real churches and
 * the server hands them back nearest-first, so the useful ones are at the top
 * and everything past the first screen is a wall of the same name at
 * increasing distances — which reads as "it isn't here" rather than as more
 * choice. Somebody looking for a specific distant church types its town too,
 * and the copy under a full list says so.
 */
const WIDE_LIMIT = 25

type Phase = 'idle' | 'choosing' | 'locating' | 'ready'

/**
 * WHERE the screen is looking, and the reason this is one value rather than a
 * nullable `coords` plus a nullable city.
 *
 * Every downstream decision — which list to load, whether a row has a distance,
 * where a hand-added church is pinned, what the copy says — depends on the
 * ANSWER TO THE SAME QUESTION, and the two ways of answering it must not be
 * able to be half-set at once. A city always carries coordinates (its centre)
 * so the two paths that genuinely need a point never have to branch; nothing
 * else may read `coords` off a city and call it the player's position.
 */
type Origin =
  | { kind: 'here'; coords: Coords }
  | { kind: 'city'; city: ChurchCity }

const originCoords = (o: Origin | null): Coords | null =>
  o === null ? null : o.kind === 'here' ? o.coords : o.city.coords

export function ChurchPicker() {
  const juice = useJuice()
  const join = useChurch((s) => s.join)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [origin, setOrigin] = useState<Origin | null>(null)
  // The city door's own typeahead, live only while `phase === 'choosing'`.
  const [cityQuery, setCityQuery] = useState('')
  const [cityHits, setCityHits] = useState<ChurchCity[]>([])
  const [cityBusy, setCityBusy] = useState(false)
  const [citySearched, setCitySearched] = useState(false)
  const [places, setPlaces] = useState<ChurchPlace[]>([])
  const [nearbyBusy, setNearbyBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [joining, setJoining] = useState<string | null>(null)
  const [wide, setWide] = useState<ChurchPlace[]>([])
  const [wideBusy, setWideBusy] = useState(false)
  /** Have we actually been everywhere for this query? Drives the empty copy. */
  const [wideDone, setWideDone] = useState(false)
  const [sponsored, setSponsored] = useState<ChurchPlace | null>(null)
  const [manual, setManual] = useState(false)
  const [manualName, setManualName] = useState('')
  // The "look before you pin" step. `null` = haven't looked; an array = these
  // are what the index knows by that name, and the player picks one or says
  // plainly that none of them is it.
  const [manualFound, setManualFound] = useState<ChurchPlace[] | null>(null)
  const [manualBusy, setManualBusy] = useState(false)
  const searchRef = useRef<AbortController | null>(null)
  const nearbyRef = useRef<AbortController | null>(null)
  const cityRef = useRef<AbortController | null>(null)

  const coords = originCoords(origin)
  const city = origin?.kind === 'city' ? origin.city : null

  useEffect(
    () => () => {
      searchRef.current?.abort()
      nearbyRef.current?.abort()
      cityRef.current?.abort()
    },
    [],
  )

  // Churches already in Verse Arcade near this point. These are the good ones —
  // they carry a level and a congregation already — so they lead the list.
  // Bounded and swallowing its own failures: an empty list is a fine answer.
  const loadKnown = useCallback(async (at: Coords): Promise<ChurchPlace[]> => {
    if (!supabase) return []
    const call = supabase.rpc('search_churches', {
      p_lat: at.lat,
      p_lng: at.lng,
      p_q: null,
      p_radius_miles: SEARCH_RADIUS_MILES,
      p_limit: 50,
    })
    let data: unknown = null
    try {
      // supabase-js reports network trouble as `error`, but a stalled auth
      // token refresh can leave the promise pending — hence the race.
      const res = await Promise.race([
        call,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), KNOWN_TIMEOUT_MS)),
      ])
      if (!res || res.error) return []
      data = res.data
    } catch {
      return []
    }
    if (!Array.isArray(data)) return []
    return (data as any[]).map((c) => ({
      placeKey: `known:${c.id}`,
      churchId: c.id as string,
      name: c.name as string,
      address: c.address ?? null,
      city: c.city ?? null,
      region: c.region ?? null,
      lat: Number(c.lat),
      lng: Number(c.lng),
      miles: Number(c.miles ?? milesBetween(at, { lat: Number(c.lat), lng: Number(c.lng) })),
      xp: Number(c.xp ?? 0),
      level: Number(c.level ?? 1),
      members: Number(c.members ?? 0),
    }))
  }, [])

  // The one paid slot, if this spot has one (0077). Everything about this call
  // fails to `null`: no keys, a server that predates the migration, a network
  // blip, or simply no promotion in this area — all four land on "no sponsored
  // row", and the picker renders exactly as it did before the feature existed.
  const loadSponsored = useCallback(async (at: Coords): Promise<ChurchPlace | null> => {
    if (!supabase) return null
    try {
      const res = await Promise.race([
        supabase.rpc('sponsored_church', { p_lat: at.lat, p_lng: at.lng }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), KNOWN_TIMEOUT_MS)),
      ])
      if (!res || res.error || !res.data) return null
      const c = res.data as any
      if (!c.id || !c.promotion_id) return null
      return {
        placeKey: `known:${c.id}`,
        churchId: c.id as string,
        promotionId: c.promotion_id as string,
        sponsored: true,
        name: c.name as string,
        address: c.address ?? null,
        city: c.city ?? null,
        region: c.region ?? null,
        lat: Number(c.lat),
        lng: Number(c.lng),
        miles: Number(c.miles ?? milesBetween(at, { lat: Number(c.lat), lng: Number(c.lng) })),
        xp: Number(c.xp ?? 0),
        level: Number(c.level ?? 1),
        members: Number(c.members ?? 0),
      }
    } catch {
      return null
    }
  }, [])

  // Both sources run at once and each renders the moment it lands, so a slow
  // map endpoint can't hide the churches we already know about.
  const loadPlaces = useCallback(
    async (at: Coords) => {
      nearbyRef.current?.abort()
      const ctl = new AbortController()
      nearbyRef.current = ctl
      setNearbyBusy(true)

      void loadSponsored(at).then((row) => {
        if (!ctl.signal.aborted) setSponsored(row)
      })

      const known = loadKnown(at).then((rows) => {
        if (!ctl.signal.aborted && rows.length) setPlaces((prev) => mergePlaces(rows, prev))
        return rows
      })

      // The index first. It's a bounding-box query on an indexed table, so it
      // lands long before anything on the network could, and its names are the
      // current ones.
      const indexed = nearbyChurchPlaces(at, SEARCH_RADIUS_MILES).then((rows) => {
        // Our own rows keep priority: they're already in `prev`.
        if (!ctl.signal.aborted && rows.length) setPlaces((prev) => mergePlaces(prev, rows))
        return rows
      })

      const [knownRows, indexRows] = await Promise.all([known, indexed])
      if (ctl.signal.aborted) return

      // OSM only where the index came back empty — a region nobody has loaded
      // yet, or a server that predates 0091. An empty picker is a dead end, and
      // a stale name is better than no church at all; anywhere the index has
      // rows, Overpass is never called and its slowness never seen.
      let mappedRows: ChurchPlace[] | null = indexRows
      if (indexRows.length === 0) {
        mappedRows = await nearbyChurches(at, SEARCH_RADIUS_MILES, ctl.signal).then(
          (rows) => {
            if (!ctl.signal.aborted && rows.length) setPlaces((prev) => mergePlaces(prev, rows))
            return rows
          },
          () => null,
        )
        if (ctl.signal.aborted) return
      }

      setNearbyBusy(false)
      if (mappedRows === null && knownRows.length === 0) {
        setError("We couldn't reach the map just now. Search by name, or add your church by hand below.")
      }
    },
    [loadKnown, loadSponsored],
  )

  const locate = useCallback(async () => {
    setPhase('locating')
    setError(null)
    setLocationError(null)
    setPlaces([])
    let at: Coords
    try {
      at = await getPosition()
    } catch (e) {
      // No location is not a dead end — the city door and the name search both
      // still work, and the refusal copy now points at the city door rather
      // than leaving somebody on a screen that can only be typed into.
      setOrigin(null)
      setLocationError(
        e instanceof LocationError ? geoErrorMessage(e.kind) : geoErrorMessage('unavailable'),
      )
      setPhase('ready')
      return
    }
    setOrigin({ kind: 'here', coords: at })
    setPhase('ready')
    void loadPlaces(at)
  }, [loadPlaces])

  /** Everything the index holds for one town. The city door's equivalent of
   *  `loadPlaces`, and deliberately much simpler: one source, no map fallback
   *  and no merge, because a town is a filter on our own index rather than a
   *  circle that several sources can each answer differently. */
  const loadCity = useCallback(async (picked: ChurchCity) => {
    nearbyRef.current?.abort()
    const ctl = new AbortController()
    nearbyRef.current = ctl
    setNearbyBusy(true)
    setError(null)

    void loadSponsored(picked.coords).then((row) => {
      if (!ctl.signal.aborted) setSponsored(row)
    })

    // Our own churches in that town come from the same `search_churches` the
    // nearby path uses, so a congregation already playing keeps its level and
    // its member count here too.
    // Our own churches near that town, narrowed to the town itself — and with
    // their DISTANCES STRIPPED. `loadKnown` measures from the point it is given,
    // which here is the town centre, so leaving them would print "3.0 mi"
    // against a church in the town you are already looking at: a number
    // measured from nowhere the player is, beside rows that correctly show
    // none. A town's list has no distances at all.
    const known = loadKnown(picked.coords).then((rows) =>
      rows
        .filter((r) => (r.city ?? '').trim().toLowerCase() === picked.city.trim().toLowerCase())
        .map((r) => ({ ...r, miles: NaN })),
    )
    const [knownRows, cityRows] = await Promise.all([known, churchesInCity(picked.cityKey, null, 60)])
    if (ctl.signal.aborted) return

    setPlaces(mergePlaces(knownRows, cityRows))
    setNearbyBusy(false)
    if (knownRows.length === 0 && cityRows.length === 0) {
      setError(`We don't have any churches listed in ${cityLabel(picked)} yet — search by name, or add yours by hand below.`)
    }
  }, [loadKnown, loadSponsored])

  const pickCity = useCallback((picked: ChurchCity) => {
    juice.select()
    setOrigin({ kind: 'city', city: picked })
    setLocationError(null)
    setQuery('')
    setPlaces([])
    setWide([])
    setWideDone(false)
    setPhase('ready')
    void loadCity(picked)
  }, [juice, loadCity])

  /** Back to the front door, keeping nothing — a new origin is a new search. */
  const startOver = useCallback(() => {
    nearbyRef.current?.abort()
    searchRef.current?.abort()
    setOrigin(null)
    setPlaces([])
    setSponsored(null)
    setQuery('')
    setWide([])
    setWideDone(false)
    setError(null)
    setLocationError(null)
    setManual(false)
    setManualFound(null)
    setCityQuery('')
    setCityHits([])
    setCitySearched(false)
    setPhase('idle')
  }, [])

  // Before anyone types, the screen leads with a short list rather than a long
  // one: the top few are what we'd pick for them, the remainder is the honest
  // "everything within 30 miles" list underneath. The moment a query exists the
  // split disappears — someone typing a name wants matches, not our opinion,
  // and the sponsored row goes with it (see below).
  const browsing = !query.trim()

  const matches = useMemo(() => {
    const found = places.filter(
      (p) =>
        matchesQuery(p, query) &&
        // While browsing, the sponsored church is drawn once, at the top, with
        // its label — not twice. Once someone types, it's back to being an
        // ordinary row that has to earn its place by matching what they wrote.
        !(browsing && sponsored?.churchId && p.churchId === sponsored.churchId),
    )
    // Churches already playing first (they have a level to climb), then by
    // distance — a 4-mile neighbour matters more than one 25 miles out.
    return found
      .slice()
      .sort((a, b) => (b.churchId ? 1 : 0) - (a.churchId ? 1 : 0) || a.miles - b.miles)
      .slice(0, 40)
  }, [places, query, browsing, sponsored])

  // The sponsored church takes one of the three suggestion slots rather than
  // being added on top of them: a paid row lengthens nobody's list, and the
  // strip stays the same size whether or not anybody bought it.
  // "Suggested for you" is a DISTANCE idea — the nearest few, read without
  // scrolling. A town has no distances, so in city mode there is nothing to
  // suggest and the list is simply the town's, with the sponsored row (which
  // is still geographically honest: its radius is measured from the church's
  // own position, and the town centre is inside it) kept at the top and
  // labelled. Splitting it there would promote three arbitrary rows.
  const promoted = browsing ? sponsored : null
  const splitting = browsing && !city
  const suggested = splitting ? matches.slice(0, SUGGEST_COUNT - (promoted ? 1 : 0)) : []
  const rest = splitting ? matches.slice(suggested.length) : matches

  // Nothing nearby matched what they typed — go back out and search by name.
  // Works without coordinates too, just unbounded by distance.
  const searchWider = useCallback(async () => {
    if (query.trim().length < 3) return
    searchRef.current?.abort()
    const ctl = new AbortController()
    searchRef.current = ctl
    setWideBusy(true)
    setWideDone(false)
    try {
      // In a town, look INSIDE it first. The loaded list is capped at 60 and a
      // city like Houston holds thousands, so "not in the list" is usually the
      // cap talking rather than the town — asking the server about the whole
      // town before leaving it is the difference between finding a church and
      // being told to go and look somewhere else.
      if (city) {
        const inTown = await churchesInCity(city.cityKey, query, WIDE_LIMIT)
        if (ctl.signal.aborted) return
        if (inTown.length) {
          setWide(inTown)
          return
        }
      }

      // NO RADIUS. This used to be `nearbyChurchPlaces(coords, 60, …)` — a
      // sixty-mile box, which is not "a wider area" to anyone whose church is
      // in another part of the state, and which asked the server for a single
      // contiguous substring match so "Appleton Alliance" could never find
      // "Alliance Church - Appleton" at any distance. Both are fixed in 0113.
      const indexed = await searchChurchPlacesByName(query, coords, WIDE_LIMIT)
      if (ctl.signal.aborted) return
      if (indexed.length) {
        setWide(indexed)
        return
      }
      // OSM only where our own index has nothing — a region nobody has loaded,
      // or a server that predates 0113. Unbounded when we have no location.
      const found = await searchChurchesByName(query, coords, 60, ctl.signal)
      if (!ctl.signal.aborted) setWide(found)
    } catch {
      if (!ctl.signal.aborted) setWide([])
    } finally {
      if (!ctl.signal.aborted) {
        setWideBusy(false)
        setWideDone(true)
      }
    }
  }, [coords, city, query])

  // The city typeahead. Debounced because it fires per keystroke, and aborted
  // on the next one so a slow answer can never overwrite a newer query's.
  useEffect(() => {
    if (phase !== 'choosing') return
    const q = cityQuery.trim()
    if (q.length < 2) {
      setCityHits([])
      setCitySearched(false)
      setCityBusy(false)
      return
    }
    cityRef.current?.abort()
    const ctl = new AbortController()
    cityRef.current = ctl
    setCityBusy(true)
    const t = setTimeout(() => {
      void searchChurchCities(q, 12).then((rows) => {
        if (ctl.signal.aborted) return
        setCityHits(rows)
        setCitySearched(true)
        setCityBusy(false)
      })
    }, 250)
    return () => { clearTimeout(t); ctl.abort() }
  }, [cityQuery, phase])

  useEffect(() => {
    setWide([])
    setWideDone(false)
  }, [query])

  // A typed query that matches nothing nearby goes to the server BY ITSELF,
  // because "nothing nearby" is usually a lie told by a cap rather than a fact
  // about the map. `loadPlaces` fetches the 60 NEAREST churches once and the
  // box filters that list as you type — and 60 nearest in a town is not 30
  // miles, it is 2.2 (measured, Eau Claire). So St Joseph's Chapel at 2.7 miles
  // was not in the list at all, could not be matched by any amount of client
  // filtering, and the screen said "nothing within 30 miles matches" about a
  // church a five-minute drive away.
  //
  // Only when the local answer is genuinely empty, only once per query, and
  // only after the nearby fetch has finished — otherwise this races the list it
  // is meant to be a fallback for. The button below still exists for the other
  // case: local matches that simply aren't the right church.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 3 || nearbyBusy || matches.length > 0) return
    if (wide.length > 0 || wideBusy || wideDone) return
    const t = setTimeout(() => { void searchWider() }, 350)
    return () => clearTimeout(t)
  }, [query, nearbyBusy, matches.length, wide.length, wideBusy, wideDone, searchWider])

  const pick = async (place: ChurchPlace) => {
    setJoining(place.placeKey)
    juice.coin()
    const church = await join(place)
    setJoining(null)
    if (church) {
      juice.celebrate()
      // What the slot actually delivered, so it can be sold again honestly.
      // Verified rather than asserted — `note_promotion_join` checks the caller
      // really does play for that church before it counts anything — and
      // best-effort: nothing about this may cost somebody the church they just
      // joined. `.then()` rather than a bare `void`, because a postgrest
      // builder only sends its request inside then() (see CLAUDE.md).
      if (place.promotionId && supabase) {
        void supabase.rpc('note_promotion_join', { p_promotion: place.promotionId }).then(() => {})
      }
    } else {
      setError("We couldn't save that pick — check your connection and try again.")
    }
  }

  // Look before you pin. The name somebody types is usually IN the index
  // already — under a different word order, or with the punctuation they left
  // out — and a hand-added church is pinned at wherever they happen to be
  // standing, permanently, for everybody. So the name goes to the nationwide
  // search first and the matches are offered; only once the player has seen
  // them and said none is theirs does `addHere` create one.
  const lookBeforeAdding = async () => {
    const name = manualName.trim()
    if (name.length < 2) return
    setManualBusy(true)
    try {
      const found = await searchChurchPlacesByName(name, coords, 8)
      setManualFound(found)
    } catch {
      // A failed look must never block adding — that would make a network blip
      // the reason somebody can't join their church.
      setManualFound([])
    } finally {
      setManualBusy(false)
    }
  }

  // `coords` is the ORIGIN's point: the player's position in location mode, the
  // town's centre in city mode. That one substitution is what stops a church
  // being pinned 155 miles from itself.
  const addHere = async () => {
    if (!coords || manualName.trim().length < 2) return
    await pick({
      // No place key: the server turns name + position into a stable one, so
      // the next person who adds the same church lands on this exact row.
      placeKey: '',
      name: manualName.trim(),
      lat: coords.lat,
      lng: coords.lng,
      miles: 0,
    })
  }

  const resetManual = () => {
    setManual(false)
    setManualFound(null)
  }

  return (
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div className="card">
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>
          {phase !== 'ready'
            ? 'Find your church'
            : city
              ? `Churches in ${cityLabel(city)}`
              : coords
                ? 'Churches near you'
                : 'Find your church'}
        </b>
        <p className="dim" style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.5 }}>
          {phase === 'ready'
            ? "Tap yours and the points you earn pool with everyone else who goes there. Not sure it's listed? Search by name, or add it by hand at the bottom."
            : phase === 'choosing'
              ? "Pick the town your church is in and we'll show you what's there — no location needed."
              : "Use your location, or pick the town your church is in. Then type the name to narrow it down and tap yours."}
        </p>
        {/* The privacy line is about a location, so it only makes a claim when
            one was actually shared. In city mode there is no location at all,
            which is a stronger statement and worth making plainly. */}
        <p className="faint" style={{ margin: '8px 0 0', fontSize: 12 }}>
          {city
            ? 'We never asked for your location, and we never save one. Only the church you pick is stored.'
            : 'Your location is only used to search — we never save it. Only the church you pick is stored.'}
        </p>
        {phase === 'ready' && (
          <div style={{ marginTop: 10 }}>
            <button
              onClick={startOver}
              style={{ padding: 0, color: 'var(--gold)', fontWeight: 800, fontSize: 13 }}
            >
              {city ? 'Look somewhere else →' : 'Search a different town →'}
            </button>
          </div>
        )}
      </div>

      {/* TWO DOORS, side by side and equal (0114). The city is not a "can't
          share your location?" fallback tucked under a link — for a student, or
          anybody whose church is back home, it is the RIGHT answer, and the
          location button is the one that cannot help them. */}
      {phase === 'idle' && (
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
          <Button variant="gold" full onClick={locate}>
            📍 Use my location
          </Button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ flex: 1, height: 1, background: 'var(--edge)' }} />
            <span className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              or
            </span>
            <span style={{ flex: 1, height: 1, background: 'var(--edge)' }} />
          </div>
          <Button variant="secondary" full onClick={() => { juice.select(); setPhase('choosing') }}>
            🏙️ Choose a city
          </Button>
          <p className="faint" style={{ margin: 0, fontSize: 12, lineHeight: 1.5, textAlign: 'center' }}>
            Your church doesn't have to be near you — pick the town it's in.
          </p>
        </div>
      )}

      {phase === 'choosing' && (
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
          <input
            value={cityQuery}
            onChange={(e) => setCityQuery(e.target.value)}
            placeholder="Town or city — e.g. Appleton, WI"
            maxLength={60}
            autoCapitalize="words"
            autoCorrect="off"
            autoFocus
            aria-label="Search for a town or city"
          />

          {cityQuery.trim().length < 2 ? (
            <p className="faint" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
              Start typing a town. Add the state if there's more than one — “Springfield IL”.
            </p>
          ) : cityBusy ? (
            <p className="faint" style={{ margin: 0, fontSize: 13 }} aria-live="polite">Looking…</p>
          ) : cityHits.length === 0 && citySearched ? (
            <p className="dim" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
              No town by that name. Check the spelling, or use your location instead.
            </p>
          ) : null}

          {cityHits.map((c) => (
            <motion.button
              key={c.cityKey}
              whileTap={{ scale: 0.98 }}
              onClick={() => pickCity(c)}
              className="card"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                minWidth: 0,
                textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 22, flexShrink: 0 }}>🏙️</span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontWeight: 800, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {cityLabel(c)}
                </span>
                {/* A count of CHURCHES, which is a fact about a town — never a
                    number about a person, and nothing here is ranked by it. */}
                <span className="faint" style={{ display: 'block', fontSize: 12 }}>
                  {c.churches.toLocaleString()} {c.churches === 1 ? 'church' : 'churches'} listed
                </span>
              </span>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--gold)', flexShrink: 0 }}>Pick</span>
            </motion.button>
          ))}

          <Button variant="ghost" full onClick={startOver}>Back</Button>
        </div>
      )}

      {phase === 'locating' && (
        <div className="card center" style={{ padding: 28 }}>
          <div className="floaty" style={{ fontSize: 34 }}>⛪</div>
          <p className="dim" style={{ marginTop: 10, fontSize: 14 }}>Finding you…</p>
        </div>
      )}

      {phase === 'ready' && (
        <>
          {/* A refused location is no longer a dead end with a retry button on
              it: the city door answers this case completely, so it is offered
              first and the retry stands beside it. */}
          {locationError && (
            <div className="card">
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{locationError}</p>
              <p className="dim" style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5 }}>
                You don't need it — pick the town your church is in instead.
              </p>
              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button variant="gold" onClick={() => { juice.select(); setPhase('choosing') }}>
                  🏙️ Choose a city
                </Button>
                <Button variant="secondary" onClick={locate}>Try again</Button>
              </div>
            </div>
          )}

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name — e.g. Grace Baptist"
            maxLength={80}
            autoCapitalize="words"
            autoCorrect="off"
            aria-label="Search churches by name"
          />

          {error && <p style={{ color: 'var(--coral)', fontSize: 13, margin: 0 }}>{error}</p>}

          {nearbyBusy && (
            <p className="faint" style={{ fontSize: 12, margin: 0 }} aria-live="polite">
              Still checking the map around you… you can start typing.
            </p>
          )}

          {(promoted || suggested.length > 0) && (
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
              <SectionLabel>{city ? `In ${cityLabel(city)}` : 'Suggested for you'}</SectionLabel>
              {promoted && (
                <PlaceRow
                  key={promoted.placeKey}
                  place={promoted}
                  featured
                  busy={joining === promoted.placeKey}
                  onPick={() => pick(promoted)}
                />
              )}
              {suggested.map((p) => (
                <PlaceRow
                  key={p.placeKey}
                  place={p}
                  featured
                  busy={joining === p.placeKey}
                  onPick={() => pick(p)}
                />
              ))}
            </div>
          )}

          {rest.length > 0 && (
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
              {browsing && (
                <SectionLabel>
                  {city ? `In ${cityLabel(city)}` : 'More churches nearby'}
                </SectionLabel>
              )}
              {/* The cap, stated. The old screen's equivalent silently showed
                  the 60 nearest and called it 30 miles; a town that holds more
                  than we loaded says so and says what to do about it, because
                  a list that quietly stops is the bug this whole round fixed. */}
              {browsing && city && city.churches > places.length && (
                <p className="faint" style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                  Showing {places.length} of {city.churches.toLocaleString()} in{' '}
                  {cityLabel(city)} — type a name to search the rest.
                </p>
              )}
              {rest.map((p) => (
                <PlaceRow key={p.placeKey} place={p} busy={joining === p.placeKey} onPick={() => pick(p)} />
              ))}
            </div>
          )}

          {/* `wide.length === 0` is load-bearing: the auto-search fires the
              moment the LOCAL list misses, so without it this card printed
              "Nothing in Appleton, WI matches 'sacred heart'" directly above a
              Sacred Heart Parish in Appleton that the city search had just
              found. The local list is a cache, not the answer — it may not
              speak for the town. Found by driving it. */}
          {matches.length === 0 && wide.length === 0 && !nearbyBusy && (
            <div className="card center" style={{ padding: 20 }}>
              <div style={{ fontSize: 30 }}>🔎</div>
              {/* Deliberately NOT "nothing within 30 miles": the list this
                  filtered is the 60 nearest churches, which is about two miles
                  in a town, so that sentence was false about anything just
                  outside it. Say what is true — none of the ones near you —
                  and let the everywhere search say the rest. */}
              <p className="dim" style={{ margin: '8px 0 0', fontSize: 14 }}>
                {!coords
                  ? 'Type your church name, then search.'
                  : query.trim()
                    ? wideBusy
                      ? `Looking everywhere for “${query.trim()}”…`
                      : city
                        ? `Nothing in ${cityLabel(city)} matches “${query.trim()}”.`
                        : `None of the churches near you matches “${query.trim()}”.`
                    : city
                      ? `We don't have any churches listed in ${cityLabel(city)} yet.`
                      : `We didn't find any churches within ${SEARCH_RADIUS_MILES} miles.`}
              </p>
            </div>
          )}

          {/* The way past the 30-mile list, and it is offered WHENEVER anything
              is typed — never only when the nearby list came back empty. A
              church three hours away is the ordinary case for a student or
              anyone who moved, and gating this on "no local matches" meant one
              unrelated match nearby hid the only door. It sits under the
              results rather than above them, because the nearby list is still
              the right first answer for most people. */}
          {query.trim().length >= 3 && wide.length === 0 && (
            <div className="card" style={{ padding: 14 }}>
              <p className="dim" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
                {city
                  ? matches.length > 0
                    ? `Not one of these? We can search all of ${cityLabel(city)}, then everywhere.`
                    : `We can search all of ${cityLabel(city)}, then everywhere.`
                  : matches.length > 0
                    ? 'Not one of these? Your church doesn’t have to be near you.'
                    : 'Your church doesn’t have to be near you — we can look everywhere.'}
              </p>
              <div style={{ marginTop: 10 }}>
                <Button variant="secondary" full disabled={wideBusy} onClick={searchWider}>
                  {wideBusy ? 'Looking everywhere…' : `🔎 Search everywhere for “${query.trim()}”`}
                </Button>
              </div>
              {wideDone && !wideBusy && (
                <p className="faint" style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.5 }}>
                  No church by that name anywhere we know of. Check the spelling, try fewer
                  words, or add it by hand below.
                </p>
              )}
            </div>
          )}

          {wide.length > 0 && (
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
              {/* Not "Further out": these come from a search with no radius at
                  all, and the nearest may well be the furthest away. */}
              <SectionLabel>Found by name</SectionLabel>
              {wide.length >= WIDE_LIMIT && (
                <p className="faint" style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                  Lots of churches share that name. Add your town to narrow it down — try
                  “{query.trim()} {wide[0]?.city ?? 'your town'}”.
                </p>
              )}
              {wide.map((p) => (
                <PlaceRow key={p.placeKey} place={p} busy={joining === p.placeKey} onPick={() => pick(p)} />
              ))}
            </div>
          )}

          {/* Plenty of congregations meet in a school gym or a living room and
              aren't on any map. They should still get a building — but we can
              only pin one WHERE THE PLAYER IS, which is the sharp edge on this
              card and the reason it now has two steps. Somebody 155 miles from
              home typed a church that was already in the index and got a pin on
              a Chipotle, permanently, because the card took the name and made a
              row out of it without ever looking. So: look first, say plainly
              where the pin lands, and let "it's not here" be a deliberate tap
              rather than the default path. */}
          <div className="card">
            {!coords ? (
              <p className="dim" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
                Adding a church by hand needs somewhere to pin it. Pick the town it's in with{' '}
                <b>Choose a city</b> above, turn your location on and tap <b>Try again</b>, or find
                yours by name.
              </p>
            ) : manual ? (
              <div style={{ display: 'grid', gap: 10 }}>
                <b style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>Add your church</b>
                <input
                  value={manualName}
                  onChange={(e) => { setManualName(e.target.value); setManualFound(null) }}
                  placeholder="Church name"
                  maxLength={80}
                  autoCapitalize="words"
                />

                {manualFound === null ? (
                  <>
                    <p className="faint" style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                      We'll check whether it's already on the map first — most churches are.
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button
                        variant="gold"
                        disabled={manualName.trim().length < 2 || manualBusy}
                        onClick={lookBeforeAdding}
                      >
                        {manualBusy ? 'Checking…' : 'Continue'}
                      </Button>
                      <Button variant="ghost" onClick={resetManual}>Cancel</Button>
                    </div>
                  </>
                ) : (
                  <>
                    {manualFound.length > 0 && (
                      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
                        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
                          {manualFound.length === 1
                            ? 'We found this one. Is it yours?'
                            : 'We found these. Is one of them yours?'}
                        </p>
                        {manualFound.map((p) => (
                          <PlaceRow
                            key={p.placeKey}
                            place={p}
                            busy={joining === p.placeKey}
                            onPick={() => pick(p)}
                          />
                        ))}
                      </div>
                    )}

                    {/* The consequence, stated where the decision is made and in
                        ink rather than faint. It is the one thing on this screen
                        a player cannot undo themselves. */}
                    {/* Where the pin lands, stated where the decision is made.
                        In city mode it is the TOWN's centre, which is the whole
                        repair: the old screen pinned at the player's position
                        whatever they were looking at, and a church added while
                        browsing Appleton from Eau Claire landed in Eau Claire. */}
                    <p className="dim" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
                      {manualFound.length > 0 ? 'If none of those is it, we’ll' : 'We’ll'} add{' '}
                      <b>{manualName.trim()}</b> and pin it{' '}
                      {city ? (
                        <>
                          <b>in {cityLabel(city)}</b> — so only add a church that meets there.
                          Looking in the wrong town? Change it above.
                        </>
                      ) : (
                        <>
                          <b>at your current location</b> — so only add one you're actually at. If
                          your church is somewhere else, search for it by name above instead.
                        </>
                      )}
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Button
                        variant={manualFound.length > 0 ? 'secondary' : 'gold'}
                        disabled={manualName.trim().length < 2 || !!joining}
                        onClick={addHere}
                      >
                        {joining
                          ? 'Adding…'
                          // "here" is a place the player is standing, which in
                          // city mode they are not — the whole point is that
                          // they are looking at a town from somewhere else.
                          : city
                            ? `Add it in ${cityLabel(city)}`
                            : 'Add it here anyway'}
                      </Button>
                      <Button variant="ghost" onClick={resetManual}>Cancel</Button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button
                onClick={() => { juice.select(); setManual(true) }}
                style={{ width: '100%', textAlign: 'left', padding: 0, color: 'var(--ink-dim)', fontSize: 14 }}
              >
                Can't find it? <b style={{ color: 'var(--gold)' }}>Add your church by hand →</b>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p
      className="faint"
      style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}
    >
      {children}
    </p>
  )
}

function PlaceRow({
  place,
  busy,
  featured,
  onPick,
}: {
  place: ChurchPlace
  busy: boolean
  /** A suggestion rather than a row in the long list: bigger, with more air. */
  featured?: boolean
  onPick: () => void
}) {
  const where = [place.address, place.city, place.region].filter(Boolean).join(', ')
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onPick}
      disabled={busy}
      className="card"
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: featured ? '14px 14px' : '12px 14px',
        minWidth: 0,
        textAlign: 'left',
        opacity: busy ? 0.6 : 1,
        borderColor: place.churchId ? 'var(--gold)' : 'var(--stroke)',
      }}
    >
      <span style={{ fontSize: featured ? 28 : 24, flexShrink: 0 }}>⛪</span>
      <span style={{ minWidth: 0, flex: 1 }}>
        {/* The disclosure, and it is not decoration: a paid row on a list of
            churches has to say it is paid, above the name where it can't be
            missed, in ink-dim rather than faint so it reads at a glance. */}
        {place.sponsored && (
          <span
            style={{
              display: 'block',
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              color: 'var(--ink-dim)',
              marginBottom: 2,
            }}
          >
            Sponsored
          </span>
        )}
        <span style={{ display: 'block', fontWeight: 800, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {place.name}
        </span>
        <span className="faint" style={{ display: 'block', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {[formatMiles(place.miles), where].filter(Boolean).join(' · ') || 'Nearby'}
        </span>
        {place.churchId && (
          <span style={{ display: 'block', fontSize: 11, color: 'var(--gold)', fontWeight: 800, marginTop: 2 }}>
            LVL {place.level} · {place.members} {place.members === 1 ? 'player' : 'players'} already here
          </span>
        )}
      </span>
      <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--gold)', flexShrink: 0 }}>{busy ? '…' : 'Pick'}</span>
    </motion.button>
  )
}
