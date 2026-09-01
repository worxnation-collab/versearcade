import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useJuice } from '@/juice/useJuice'
import { useAuth } from '@/store/auth'
import { useAccountLocked } from '@/components/AccountWall'
import { MAP_AREAS, placesIn, type MapPlace } from '@/data/map'
import { useInvitations } from './invitations'

// The map — every place in this app, on one screen, one tap from anywhere.
//
// Two halves, and the order matters. "Open right now" is the reason to open
// this on an ordinary day; the map underneath is the reason to open it the
// first week. Read `invitations.ts` before touching the top half: it is
// deliberately not a checklist, and the absence of a count in it is load-bearing
// rather than an oversight.
//
// It is a SHEET at the app's 100 tier rather than a screen, because a map that
// is a route has a back button and a history entry, and half of what makes a
// directory useful is that closing it puts you exactly back where you were.
export function MapSheet({ onClose }: { onClose: () => void }) {
  const juice = useJuice()
  const navigate = useNavigate()
  const locked = useAccountLocked()
  const isAdmin = useAuth((s) => s.profile?.isAdmin ?? false)
  const invites = useInvitations()
  const [query, setQuery] = useState('')

  // Close on Escape and freeze the page behind the sheet — the house pattern
  // every other sheet here follows.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const go = (to: string) => {
    juice.select?.()
    onClose()
    navigate(to)
  }

  // Filtering is over the label AND the line, so "relic", "prayer" or "friends"
  // find the row even when the name doesn't contain the word somebody thought
  // of. It searches nothing else: there is no history and no ranking by use,
  // because a map that reorders itself is a map you have to re-learn.
  const q = query.trim().toLowerCase()
  const areas = useMemo(
    () =>
      MAP_AREAS.map((a) => ({
        ...a,
        places: placesIn(a.id, { admin: isAdmin }).filter(
          (p) => !q || p.label.toLowerCase().includes(q) || p.line.toLowerCase().includes(q),
        ),
      })).filter((a) => a.places.length > 0),
    [q, isAdmin],
  )

  const nothingFound = q.length > 0 && areas.length === 0

  return (
    <AnimatePresence>
      <motion.div
        key="map-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          // The app's sheet tier — opened from the nav rather than from the
          // player card, so 100 like the keep, church and library sheets.
          zIndex: 100,
          background: 'rgba(8,3,24,0.78)',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
        }}
      >
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Find your way around"
          style={{
            width: '100%',
            maxWidth: 520,
            maxHeight: '88dvh',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            background: 'var(--bg-1)',
            borderRadius: 'var(--r-lg) var(--r-lg) 0 0',
            border: '1px solid var(--stroke)',
            borderBottom: 'none',
            padding: '14px 14px calc(var(--safe-bottom) + 20px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 18, flex: 1, minWidth: 0 }}>
              🧭 Find your way around
            </b>
            <button className="pill" onClick={() => { juice.select?.(); onClose() }} aria-label="Close">✕</button>
          </div>

          {/* ── Open right now ───────────────────────────────────────────────
              Invitations, never a checklist. No count, no denominator, nothing
              that says what you skipped. See invitations.ts. */}
          {invites.length > 0 ? (
            <>
              <SectionLabel>Open right now</SectionLabel>
              <div style={{ display: 'grid', gap: 8, marginBottom: 18 }}>
                {invites.map((inv) => (
                  <motion.button
                    key={inv.id}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => go(inv.to)}
                    className="card"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      width: '100%',
                      textAlign: 'left',
                      padding: '12px 14px',
                      cursor: 'pointer',
                      borderColor: 'var(--gold)',
                      background: 'rgba(255,210,63,0.08)',
                    }}
                  >
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{inv.icon}</span>
                    <span style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: 14 }}>{inv.label}</span>
                    <span style={{ color: 'var(--gold)', flexShrink: 0 }}>›</span>
                  </motion.button>
                ))}
              </div>
            </>
          ) : (
            // Empty is a good state, not a zero. It says the day is done and
            // points at the one thing that asks nothing — never "0 of 6".
            <div
              className="card"
              style={{ marginBottom: 18, textAlign: 'center', padding: '16px 14px' }}
            >
              <div style={{ fontSize: 26 }}>🌙</div>
              <p style={{ margin: '8px 0 0', fontWeight: 800, fontFamily: 'var(--font-display)', fontSize: 16 }}>
                You’ve done today.
              </p>
              <p className="dim" style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.5 }}>
                Everything below is still open if you feel like wandering.
              </p>
            </div>
          )}

          {/* ── The map ─────────────────────────────────────────────────────
              Every destination, grouped by the tab it lives under, so the map
              teaches the nav rather than replacing it. */}
          <SectionLabel>Everywhere</SectionLabel>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for anything…"
            aria-label="Search the map"
            style={{
              width: '100%',
              padding: '11px 14px',
              marginBottom: 14,
              borderRadius: 'var(--r-pill)',
              border: '1px solid var(--stroke)',
              background: 'rgba(0,0,0,0.25)',
              color: 'var(--ink)',
              fontFamily: 'inherit',
              fontSize: 14,
            }}
          />

          {nothingFound && (
            <p className="dim" style={{ fontSize: 13, textAlign: 'center', padding: '10px 0 18px' }}>
              Nothing here by that name. Try “verse”, “church”, “relic” or “pray”.
            </p>
          )}

          {areas.map((area) => (
            <div key={area.id} style={{ marginBottom: 16 }}>
              <SectionLabel>
                {area.icon} {area.title}
              </SectionLabel>
              <div style={{ display: 'grid', gap: 7 }}>
                {area.places.map((p) => (
                  <PlaceRow key={p.id} place={p} locked={locked} onGo={go} />
                ))}
              </div>
            </div>
          ))}

          <p className="faint" style={{ fontSize: 11, lineHeight: 1.5, textAlign: 'center', marginTop: 4 }}>
            Everything in this app, in one place. Nothing here is scored.
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="faint"
      style={{
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.09em',
        margin: '0 0 8px',
        fontWeight: 800,
      }}
    >
      {children}
    </h3>
  )
}

// One destination. The padlock is drawn where a guest would meet the account
// wall — same convention, and the same reason, as the bottom nav's: the row
// stays tappable, because a locked door you can look through is the pitch.
function PlaceRow({
  place,
  locked,
  onGo,
}: {
  place: MapPlace
  locked: boolean
  onGo: (to: string) => void
}) {
  const isLocked = locked && !!place.wall
  return (
    <motion.button
      whileTap={{ scale: 0.985 }}
      onClick={() => onGo(place.to)}
      className="card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        textAlign: 'left',
        padding: '11px 13px',
        cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: 19, flexShrink: 0, width: 24, textAlign: 'center', opacity: isLocked ? 0.7 : 1 }}>
        {place.icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <b style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {place.label}
          </b>
          {isLocked && <span aria-label="Needs an account" style={{ fontSize: 10, opacity: 0.85 }}>🔒</span>}
        </span>
        <span className="faint" style={{ display: 'block', fontSize: 12, lineHeight: 1.35, marginTop: 1 }}>
          {place.line}
        </span>
      </span>
      <span style={{ color: 'var(--gold)', flexShrink: 0 }}>›</span>
    </motion.button>
  )
}
