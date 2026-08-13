import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useJuice } from '@/juice/useJuice'

const tabs = [
  { to: '/play', label: 'Play', icon: '🎮' },
  { to: '/battle', label: 'Battle', icon: '⚔️' },
  { to: '/leaderboard', label: 'Ranks', icon: '🏆' },
  { to: '/buddies', label: 'Buddies', icon: '🤝' },
  { to: '/collection', label: 'Cards', icon: '🃏' },
  { to: '/you', label: 'You', icon: '⭐' },
]

// Native-feeling tab bar pinned above the home indicator. Springy icon pop on
// the active tab. Tapping fires a light select sound/haptic.
export function BottomNav() {
  const juice = useJuice()
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
          gap: 4,
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
                  padding: '8px 9px',
                  borderRadius: 999,
                  background: isActive
                    ? 'linear-gradient(180deg, var(--grape), var(--grape-deep))'
                    : 'transparent',
                  color: isActive ? '#fff' : 'var(--ink-faint)',
                  boxShadow: isActive ? '0 4px 14px rgba(122,63,242,0.5)' : 'none',
                }}
              >
                <span style={{ fontSize: 20 }}>{t.icon}</span>
                <span style={{ fontSize: 10, fontWeight: 800 }}>{t.label}</span>
              </motion.div>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
