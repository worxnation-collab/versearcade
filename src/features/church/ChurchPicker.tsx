import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

const SEARCH_RADIUS_MILES = 30

type Phase = 'idle' | 'locating' | 'loading' | 'ready' | 'error'

export function ChurchPicker() {
  const juice = useJuice()
  const join = useChurch((s) => s.join)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [coords, setCoords] = useState<Coords | null>(null)
  const [places, setPlaces] = useState<ChurchPlace[]>([])
  const [query, setQuery] = useState('')
  const [joining, setJoining] = useState<string | null>(null)
  const [wide, setWide] = useState<ChurchPlace[]>([])
  const [wideBusy, setWideBusy] = useState(false)
  const [manual, setManual] = useState(false)
  const [manualName, setManualName] = useState('')
  const searchRef = useRef<AbortController | null>(null)

  useEffect(() => () => searchRef.current?.abort(), [])

  // Churches already in Verse Arcade near this point. These are the good ones —
  // they carry a level and a congregation already — so they lead the list.
  const loadKnown = useCallback(async (at: Coords): Promise<ChurchPlace[]> => {
    if (!supabase) return []
    const { data, error: err } = await supabase.rpc('search_churches', {
      p_lat: at.lat,
      p_lng: at.lng,
      p_q: null,
      p_radius_miles: SEARCH_RADIUS_MILES,
      p_limit: 50,
    })
    if (err || !Array.isArray(data)) return []
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

  const locate = useCallback(async () => {
    setPhase('locating')
    setError(null)
    let at: Coords
    try {
      at = await getPosition()
    } catch (e) {
      setPhase('error')
      setError(e instanceof LocationError ? geoErrorMessage(e.kind) : geoErrorMessage('unavailable'))
      return
    }
    setCoords(at)
    setPhase('loading')

    // Our own churches are the important half of the list, so never let a slow
    // or blocked map endpoint stop them from rendering.
    const known = await loadKnown(at)
    try {
      const mapped = await nearbyChurches(at, SEARCH_RADIUS_MILES)
      setPlaces(mergePlaces(known, mapped))
    } catch {
      setPlaces(known)
      if (known.length === 0) {
        setError("We couldn't reach the map just now. Search by name, or add your church by hand below.")
      }
    }
    setPhase('ready')
  }, [loadKnown])

  const matches = useMemo(() => {
    const found = places.filter((p) => matchesQuery(p, query))
    // Churches already playing first (they have a level to climb), then by
    // distance — a 4-mile neighbour matters more than one 25 miles out.
    return found
      .slice()
      .sort((a, b) => (b.churchId ? 1 : 0) - (a.churchId ? 1 : 0) || a.miles - b.miles)
      .slice(0, 40)
  }, [places, query])

  // Nothing nearby matched what they typed — go back out and search by name.
  const searchWider = useCallback(async () => {
    if (!coords || query.trim().length < 3) return
    searchRef.current?.abort()
    const ctl = new AbortController()
    searchRef.current = ctl
    setWideBusy(true)
    try {
      const found = await searchChurchesByName(query, coords, 60, ctl.signal)
      setWide(found)
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
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="card">
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>Find your church</b>
        <p className="dim" style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.5 }}>
          Share your location once and we'll look up the churches around you. Type the name to
          narrow it down, then tap yours.
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

      {(phase === 'locating' || phase === 'loading') && (
        <div className="card center" style={{ padding: 28 }}>
          <div className="floaty" style={{ fontSize: 34 }}>⛪</div>
          <p className="dim" style={{ marginTop: 10, fontSize: 14 }}>
            {phase === 'locating' ? 'Finding you…' : 'Looking up churches nearby…'}
          </p>
        </div>
      )}

      {phase === 'error' && (
        <div className="card">
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{error}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button variant="secondary" onClick={locate}>Try again</Button>
            <Button variant="ghost" onClick={() => { setPhase('ready'); setManual(true) }}>Add by hand</Button>
          </div>
        </div>
      )}

      {phase === 'ready' && (
        <>
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

          {matches.length > 0 && (
            <div style={{ display: 'grid', gap: 8 }}>
              {matches.map((p) => (
                <PlaceRow key={p.placeKey} place={p} busy={joining === p.placeKey} onPick={() => pick(p)} />
              ))}
            </div>
          )}

          {matches.length === 0 && (
            <div className="card center" style={{ padding: 20 }}>
              <div style={{ fontSize: 30 }}>🔎</div>
              <p className="dim" style={{ margin: '8px 0 0', fontSize: 14 }}>
                {query.trim()
                  ? `Nothing within ${SEARCH_RADIUS_MILES} miles matches “${query.trim()}”.`
                  : `We didn't find any churches within ${SEARCH_RADIUS_MILES} miles.`}
              </p>
              {query.trim().length >= 3 && (
                <div style={{ marginTop: 12 }}>
                  <Button variant="secondary" disabled={wideBusy} onClick={searchWider}>
                    {wideBusy ? 'Searching…' : 'Search a wider area'}
                  </Button>
                </div>
              )}
            </div>
          )}

          {wide.length > 0 && (
            <div style={{ display: 'grid', gap: 8 }}>
              <p className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                Further out
              </p>
              {wide.map((p) => (
                <PlaceRow key={p.placeKey} place={p} busy={joining === p.placeKey} onPick={() => pick(p)} />
              ))}
            </div>
          )}

          {/* Plenty of congregations meet in a school gym or a living room and
              aren't on any map. They should still get a building. */}
          <div className="card">
            {manual ? (
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
                  <Button variant="gold" disabled={manualName.trim().length < 2 || !coords || !!joining} onClick={addManually}>
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

function PlaceRow({ place, busy, onPick }: { place: ChurchPlace; busy: boolean; onPick: () => void }) {
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
        padding: '12px 14px',
        textAlign: 'left',
        opacity: busy ? 0.6 : 1,
        borderColor: place.churchId ? 'var(--gold)' : 'var(--stroke)',
      }}
    >
      <span style={{ fontSize: 24, flexShrink: 0 }}>⛪</span>
      <span style={{ minWidth: 0, flex: 1 }}>
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
