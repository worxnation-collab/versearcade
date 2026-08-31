import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/Button'
import { supabase } from '@/lib/supabase'
import { useJuice } from '@/juice/useJuice'
import { useChurch } from '@/store/church'
import { formatMiles, getPosition, geoErrorMessage, LocationError, milesBetween, type Coords } from '@/lib/geo'
import {
  matchesQuery,
  mergePlaces,
  nearbyChurches,
  searchChurchesByName,
  type ChurchPlace,
} from '@/lib/churchSearch'

// Find your church: share your location once, type its name, tap it.
//
// The nearby list is fetched ONCE per location and filtered as you type, so
// typing is instant and we're gentle on the free map endpoints. Only when the
// local list comes up empty do we go back out for a wider name search.
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

type Phase = 'idle' | 'locating' | 'ready'

export function ChurchPicker() {
  const juice = useJuice()
  const join = useChurch((s) => s.join)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [coords, setCoords] = useState<Coords | null>(null)
  const [places, setPlaces] = useState<ChurchPlace[]>([])
  const [nearbyBusy, setNearbyBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [joining, setJoining] = useState<string | null>(null)
  const [wide, setWide] = useState<ChurchPlace[]>([])
  const [wideBusy, setWideBusy] = useState(false)
  const [sponsored, setSponsored] = useState<ChurchPlace | null>(null)
  const [manual, setManual] = useState(false)
  const [manualName, setManualName] = useState('')
  const searchRef = useRef<AbortController | null>(null)
  const nearbyRef = useRef<AbortController | null>(null)

  useEffect(
    () => () => {
      searchRef.current?.abort()
      nearbyRef.current?.abort()
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
      const mapped = nearbyChurches(at, SEARCH_RADIUS_MILES, ctl.signal).then(
        (rows) => {
          // Our own rows keep priority: they're already in `prev`.
          if (!ctl.signal.aborted && rows.length) setPlaces((prev) => mergePlaces(prev, rows))
          return rows
        },
        () => null,
      )

      const [knownRows, mappedRows] = await Promise.all([known, mapped])
      if (ctl.signal.aborted) return
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
    let at: Coords
    try {
      at = await getPosition()
    } catch (e) {
      // No location is not a dead end — name search still works, it just can't
      // be sorted by distance.
      setCoords(null)
      setLocationError(
        e instanceof LocationError ? geoErrorMessage(e.kind) : geoErrorMessage('unavailable'),
      )
      setPhase('ready')
      return
    }
    setCoords(at)
    setPhase('ready')
    void loadPlaces(at)
  }, [loadPlaces])

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
  const promoted = browsing ? sponsored : null
  const suggested = browsing ? matches.slice(0, SUGGEST_COUNT - (promoted ? 1 : 0)) : []
  const rest = browsing ? matches.slice(suggested.length) : matches

  // Nothing nearby matched what they typed — go back out and search by name.
  // Works without coordinates too, just unbounded by distance.
  const searchWider = useCallback(async () => {
    if (query.trim().length < 3) return
    searchRef.current?.abort()
    const ctl = new AbortController()
    searchRef.current = ctl
    setWideBusy(true)
    try {
      const found = await searchChurchesByName(query, coords, 60, ctl.signal)
      if (!ctl.signal.aborted) setWide(found)
    } catch {
      if (!ctl.signal.aborted) setWide([])
    } finally {
      if (!ctl.signal.aborted) setWideBusy(false)
    }
  }, [coords, query])

  useEffect(() => {
    setWide([])
  }, [query])

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

  const addManually = async () => {
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

  return (
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div className="card">
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>
          {phase === 'ready' ? 'Churches near you' : 'Find your church'}
        </b>
        <p className="dim" style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.5 }}>
          {phase === 'ready'
            ? "Tap yours and the points you earn pool with everyone else who goes there. Not sure it's listed? Search by name, or add it by hand at the bottom."
            : "Share your location once and we'll suggest the churches around you. Type the name to narrow it down, then tap yours."}
        </p>
        <p className="faint" style={{ margin: '8px 0 0', fontSize: 12 }}>
          Your location is only used to search — we never save it. Only the church you pick is stored.
        </p>
      </div>

      {phase === 'idle' && (
        <Button variant="gold" full onClick={locate}>
          📍 Use my location
        </Button>
      )}

      {phase === 'locating' && (
        <div className="card center" style={{ padding: 28 }}>
          <div className="floaty" style={{ fontSize: 34 }}>⛪</div>
          <p className="dim" style={{ marginTop: 10, fontSize: 14 }}>Finding you…</p>
        </div>
      )}

      {phase === 'ready' && (
        <>
          {locationError && (
            <div className="card">
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{locationError}</p>
              <div style={{ marginTop: 12 }}>
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
              <SectionLabel>Suggested for you</SectionLabel>
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
              {browsing && <SectionLabel>More churches nearby</SectionLabel>}
              {rest.map((p) => (
                <PlaceRow key={p.placeKey} place={p} busy={joining === p.placeKey} onPick={() => pick(p)} />
              ))}
            </div>
          )}

          {matches.length === 0 && !nearbyBusy && (
            <div className="card center" style={{ padding: 20 }}>
              <div style={{ fontSize: 30 }}>🔎</div>
              <p className="dim" style={{ margin: '8px 0 0', fontSize: 14 }}>
                {!coords
                  ? 'Type your church name, then search.'
                  : query.trim()
                    ? `Nothing within ${SEARCH_RADIUS_MILES} miles matches “${query.trim()}”.`
                    : `We didn't find any churches within ${SEARCH_RADIUS_MILES} miles.`}
              </p>
              {query.trim().length >= 3 && (
                <div style={{ marginTop: 12 }}>
                  <Button variant="secondary" disabled={wideBusy} onClick={searchWider}>
                    {wideBusy ? 'Searching…' : coords ? 'Search a wider area' : 'Search by name'}
                  </Button>
                </div>
              )}
            </div>
          )}

          {wide.length > 0 && (
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
              <SectionLabel>{coords ? 'Further out' : 'Name matches'}</SectionLabel>
              {wide.map((p) => (
                <PlaceRow key={p.placeKey} place={p} busy={joining === p.placeKey} onPick={() => pick(p)} />
              ))}
            </div>
          )}

          {/* Plenty of congregations meet in a school gym or a living room and
              aren't on any map. They should still get a building — but we can
              only pin one where the player is, so it needs a location. */}
          <div className="card">
            {!coords ? (
              <p className="dim" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
                Adding a church by hand pins it where you are, so it needs your location. Turn it on
                and tap <b>Try again</b> — or find yours by name above.
              </p>
            ) : manual ? (
              <div style={{ display: 'grid', gap: 10 }}>
                <b style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>Add your church</b>
                <input
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Church name"
                  maxLength={80}
                  autoCapitalize="words"
                />
                <p className="faint" style={{ fontSize: 12, margin: 0 }}>
                  We'll pin it where you are now, so the people around you can find and join it too.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="gold" disabled={manualName.trim().length < 2 || !!joining} onClick={addManually}>
                    {joining ? 'Adding…' : 'Add & join'}
                  </Button>
                  <Button variant="ghost" onClick={() => setManual(false)}>Cancel</Button>
                </div>
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
