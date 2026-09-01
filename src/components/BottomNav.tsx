import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useJuice } from '@/juice/useJuice'
import { MapSheet } from '@/features/map/MapSheet'
import { useBuddies } from '@/store/buddies'
import { useGifts } from '@/store/gifts'
import { useReviews } from '@/store/reviews'
import { useSettings } from '@/store/settings'
import { useAccountLocked } from '@/components/AccountWall'

// Five tabs, one per thing you actually come here to do. Ranks folded into
// Play; Buddies and Cards folded into You — each still a full screen at its own
// URL, just no longer competing for a slot down here.
//
// `guest: false` means the tab shows an account wall to a guest (App.tsx's WALL
// table is the authority; this flag only decides whether the little padlock is
// drawn). The tabs stay VISIBLE and tappable for guests on purpose — a locked
// tab you can look into is the pitch, and hiding half the nav would make the
// app look smaller than it is.
const tabs = [
  { to: '/play', label: 'Play', icon: '🎮', guest: true },
  { to: '/battle', label: 'Battle', icon: '⚔️', guest: false },
  { to: '/study', label: 'Study', icon: '📚', guest: false },
  { to: '/church', label: 'Church', icon: '⛪', guest: false },
  { to: '/you', label: 'You', icon: '⭐', guest: true },
]

// A pending buddy request lives two taps deep on the You tab, so nothing out
// here said it existed. One dot — no count, no red, no badge that demands
// clearing. It marks that someone is waiting on you, which is the one thing
// in this app another person can be blocked by.
//
// The Study tab wears the same dot when verses are due for review. That used to
// be a whole card on the Play tab pointing down here, which is a signpost to a
// tab that is already on screen — the dot says it in no space at all. It is
// deliberately the SAME dot: no count, because "15 verses overdue" is a backlog
// to feel behind on, and this app doesn't do those. It is an invitation.
function NavDot() {
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        top: 5,
        right: 5,
        width: 9,
        height: 9,
        borderRadius: 999,
        background: 'var(--gold)',
        border: '2px solid rgba(20,10,52,0.95)',
        boxSizing: 'content-box',
      }}
    />
  )
}

// A padlock, same corner as the buddy dot. Quiet on purpose: it marks what an
// account opens, it doesn't scold anyone for not having one.
function NavLock() {
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        top: 2,
        right: 2,
        fontSize: 9,
        lineHeight: 1,
        opacity: 0.85,
      }}
    >
      🔒
    </span>
  )
}

// The compass has been opened at least once on this device.
//
// Device-local in both modes, and deliberately so — the same break with the
// two-mode invariant `store/looks.ts` and `store/music.ts` make. Whether this
// phone has been shown where the map is is a fact about the phone, not a
// possession: it grants nothing, and syncing it would mean a table and an RPC
// to remember that somebody once tapped a button.
const MAP_SEEN_KEY = 'va.map.seen'

function readMapSeen(): boolean {
  try {
    return localStorage.getItem(MAP_SEEN_KEY) === '1'
  } catch {
    // Private mode / storage full: treat it as seen rather than pulsing at
    // somebody forever. A hint that can never be dismissed is a nag.
    return true
  }
}

function markMapSeen() {
  try {
    localStorage.setItem(MAP_SEEN_KEY, '1')
  } catch {
    /* ignore */
  }
}

// The compass — every place in this app, one tap from wherever you are.
//
// It sits BESIDE the nav pill rather than inside it, and both halves of that
// are deliberate. Beside, because five tabs already have to clear a 320px
// phone and a sixth would shrink every one of them. In the nav's own row,
// because that band is the only strip of the screen the app shell already
// reserves (96px of bottom padding) — a free-floating button anywhere else
// lands on top of page content, and every screen here anchors its primary
// action to the bottom. A control that covers the button somebody is reaching
// for is the exact trap `StudyDropToast` moved to the top of the screen to
// avoid.
//
// Round and gold-ringed so it reads as a different KIND of thing from the five
// tabs: they are places, this is a directory of them. It is never a tab and
// never shows as "active", because you are never on it.
function CompassPuck({ onOpen, hint }: { onOpen: () => void; hint: boolean }) {
  // The pulse is motion that never stops, which is exactly the kind this
  // setting exists to turn off. The gold RING stays either way — that is the
  // part carrying the meaning, and a hint that only exists as movement is a
  // hint reduce-motion players never get.
  const reduceMotion = useSettings((s) => s.reduceMotion)
  const pulsing = hint && !reduceMotion
  return (
    <motion.button
      onClick={onOpen}
      aria-label="Find your way around"
      whileTap={{ scale: 0.88 }}
      animate={pulsing ? { scale: [1, 1.06, 1] } : { scale: 1 }}
      transition={pulsing ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
      style={{
        pointerEvents: 'auto',
        flexShrink: 0,
        width: 46,
        height: 46,
        borderRadius: 999,
        display: 'grid',
        placeItems: 'center',
        fontSize: 21,
        lineHeight: 1,
        background: 'rgba(20,10,52,0.85)',
        // The one visual difference that carries the meaning: a gold ring on
        // the first run, so the thing that explains the app is itself findable.
        // It stops the moment it is opened once — see MAP_SEEN_KEY above.
        border: `1px solid ${hint ? 'var(--gold)' : 'var(--stroke)'}`,
        boxShadow: hint
          ? '0 10px 30px rgba(0,0,0,0.5), 0 0 0 3px rgba(255,210,63,0.18)'
          : '0 10px 30px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(14px)',
      }}
    >
      🧭
    </motion.button>
  )
}

// Native-feeling tab bar pinned above the home indicator. Springy icon pop on
// the active tab. Tapping fires a light select sound/haptic.
export function BottomNav() {
  const juice = useJuice()
  const buddyRequests = useBuddies((s) => s.requests.length)
  // Anything addressed to you that you have not seen. Still ONE dot with no
  // count — a gift and a buddy request are both "there's something for you",
  // and a number here would turn a letterbox into a queue to be cleared.
  const unseenGifts = useGifts((s) => s.unseen)
  // Read-only, like the two above: HomeScreen calls loadDue() and everybody
  // lands there, so the schedule is loaded by the time this matters. The nav
  // never fetches — a tab bar mounted on every screen must not be a network
  // call on every screen.
  const reviewsDue = useReviews((s) => s.dueRefs.length)
  const locked = useAccountLocked()
  const [mapOpen, setMapOpen] = useState(false)
  // The pulse is read ONCE, at mount, and cleared the first time the compass is
  // opened. Re-reading it per render would be a localStorage hit on every tab
  // change, and the same freeze-at-mount habit the arcade invite uses for its
  // have-they-played decision.
  const [mapSeen, setMapSeen] = useState(readMapSeen)

  const openMap = () => {
    juice.select()
    if (!mapSeen) { markMapSeen(); setMapSeen(true) }
    setMapOpen(true)
  }

  return (
    <>
    <nav
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 40,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      {/* The pill and the compass are centred together as one unit, so the
          five tabs sit very slightly left of centre rather than the compass
          hanging off the edge. 8px of gap and a 46px puck is 54px, which is
          what the row's max-width below leaves room for on a 320px phone. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          maxWidth: 'calc(100vw - 12px)',
          marginBottom: 'calc(var(--safe-bottom) + 10px)',
        }}
      >
      <div
        style={{
          pointerEvents: 'auto',
          display: 'flex',
          // Five tabs have to clear a 320px-wide phone, so the gaps and the pill
          // padding below are as tight as they can be without cramping the taps.
          gap: 2,
          minWidth: 0,
          padding: 6,
          borderRadius: 999,
          background: 'rgba(20,10,52,0.85)',
          border: '1px solid var(--stroke)',
          backdropFilter: 'blur(14px)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
        }}
      >
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            onClick={() => juice.select()}
            style={{ textDecoration: 'none' }}
          >
            {({ isActive }) => (
              <motion.div
                animate={{ scale: isActive ? 1 : 0.92 }}
                whileTap={{ scale: 0.85 }}
                transition={{ type: 'spring', stiffness: 600, damping: 18 }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                  padding: '8px 7px',
                  borderRadius: 999,
                  position: 'relative',
                  background: isActive
                    ? 'linear-gradient(180deg, var(--grape), var(--grape-deep))'
                    : 'transparent',
                  color: isActive ? '#fff' : 'var(--ink-faint)',
                  boxShadow: isActive ? '0 4px 14px rgba(122,63,242,0.5)' : 'none',
                }}
              >
                <span style={{ fontSize: 20 }}>{t.icon}</span>
                <span style={{ fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap' }}>{t.label}</span>
                {t.to === '/you' && buddyRequests + unseenGifts > 0 && <NavDot />}
                {/* Not while the tab is locked: the padlock sits in the same
                    corner, and a guest can't reach the reviews anyway. */}
                {t.to === '/study' && !locked && reviewsDue > 0 && <NavDot />}
                {locked && !t.guest && <NavLock />}
              </motion.div>
            )}
          </NavLink>
        ))}
      </div>
      <CompassPuck onOpen={openMap} hint={!mapSeen} />
      </div>
    </nav>

    {/* Sibling of <nav>, never a child of it. The nav sets z-index 40, which
        creates a stacking context — a sheet nested inside it would paint at 40
        no matter what its own z-index said, and would end up UNDER the player
        card and every other sheet in the app. */}
    <AnimatePresence>
      {mapOpen && <MapSheet key="map" onClose={() => setMapOpen(false)} />}
    </AnimatePresence>
    </>
  )
}
