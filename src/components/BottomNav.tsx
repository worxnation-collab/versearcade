import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useJuice } from '@/juice/useJuice'
import { useBuddies } from '@/store/buddies'
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

// Native-feeling tab bar pinned above the home indicator. Springy icon pop on
// the active tab. Tapping fires a light select sound/haptic.
export function BottomNav() {
  const juice = useJuice()
  const buddyRequests = useBuddies((s) => s.requests.length)
  const locked = useAccountLocked()
  return (
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
      <div
        style={{
          pointerEvents: 'auto',
          display: 'flex',
          // Five tabs have to clear a 320px-wide phone, so the gaps and the pill
          // padding below are as tight as they can be without cramping the taps.
          gap: 2,
          maxWidth: 'calc(100vw - 16px)',
          margin: '0 auto',
          marginBottom: 'calc(var(--safe-bottom) + 10px)',
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
                {t.to === '/you' && buddyRequests > 0 && <NavDot />}
                {locked && !t.guest && <NavLock />}
              </motion.div>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
