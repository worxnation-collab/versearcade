import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useFavorites } from '@/store/favorites'
import { useJuice } from '@/juice/useJuice'
import { FAVORITES_CAP } from '@/lib/favorites'

// The one gesture that keeps a verse: a heart shown wherever a verse challenge
// ends. Deliberately quiet — it costs nothing, awards nothing and is private, so
// it never turns the recap into another thing to win.
//
// `variant="icon"` is the compact heart for a card corner; the default pill
// carries its own label for recaps where the action needs naming.
export function FavoriteButton({
  reference,
  variant = 'pill',
  label = 'Save verse',
  savedLabel = 'Saved',
}: {
  reference: string
  variant?: 'pill' | 'icon'
  label?: string
  savedLabel?: string
}) {
  const juice = useJuice()
  const saved = useFavorites((s) => !!s.map[reference])
  const loaded = useFavorites((s) => s.loaded)
  const load = useFavorites((s) => s.load)
  const toggle = useFavorites((s) => s.toggle)
  const [full, setFull] = useState(false)

  // A recap can be the first screen of a session (deep link, reload), so pull
  // the shelf in rather than assuming a tab already did.
  useEffect(() => {
    if (!loaded) load()
  }, [loaded, load])

  const onClick = () => {
    const r = toggle(reference)
    if (r === 'full') {
      setFull(true)
      setTimeout(() => setFull(false), 3200)
      return
    }
    r === 'added' ? juice.coin() : juice.select()
  }

  const heart = (
    <motion.span
      key={saved ? 'on' : 'off'}
      initial={{ scale: 0.6 }}
      animate={{ scale: saved ? [0.6, 1.35, 1] : 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 14 }}
      style={{ display: 'inline-block', lineHeight: 1 }}
    >
      {saved ? '❤️' : '🤍'}
    </motion.span>
  )

  if (variant === 'icon') {
    return (
      <motion.button
        whileTap={{ scale: 0.88 }}
        onClick={onClick}
        aria-pressed={saved}
        aria-label={saved ? `${savedLabel} — remove ${reference} from favorites` : `${label} — ${reference}`}
        title={saved ? savedLabel : label}
        style={{
          width: 38,
          height: 38,
          flexShrink: 0,
          borderRadius: '50%',
          border: `1px solid ${saved ? 'var(--coral)' : 'var(--stroke)'}`,
          background: saved ? 'rgba(255,107,107,0.14)' : 'var(--card)',
          fontSize: 18,
          cursor: 'pointer',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {heart}
      </motion.button>
    )
  }

  return (
    <div>
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={onClick}
        aria-pressed={saved}
        style={{
          width: '100%',
          padding: '11px 14px',
          borderRadius: 'var(--r-pill)',
          border: `1px solid ${saved ? 'var(--coral)' : 'var(--stroke)'}`,
          background: saved ? 'rgba(255,107,107,0.12)' : 'var(--card)',
          color: saved ? 'var(--coral)' : 'var(--ink)',
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: 14,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        {heart}
        <span>{saved ? savedLabel : label}</span>
      </motion.button>
      <AnimatePresence>
        {full && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="faint"
            style={{ fontSize: 12, marginTop: 6, textAlign: 'center' }}
          >
            Your favorites are full ({FAVORITES_CAP}). Remove one to keep another.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
