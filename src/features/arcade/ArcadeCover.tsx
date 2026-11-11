import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useAccountLocked } from '@/components/AccountWall'
import { PaintedIcon } from '@/components/PaintedIcon'
import { useJuice } from '@/juice/useJuice'
import type { ArcadeGame } from './games'

// A machine, drawn as its cover painting rather than as a cabinet.
//
// The lobby used to be a wall of hand-drawn SVG cabinets, each with a tiny
// cartoon on its screen, and it read as clip art beside every painted surface
// around it. A game is now a painting of what the game IS — the wilderness
// with manna on the sand, a book with its words lifting off, a cross on a
// carpenter's bench — with the title on the calm lower third the prompts
// leave for it (art/arcade-covers.flux.json). Two shapes: `wide` for the
// lobby's list and `poster` for the Study tab's row.
//
// Still no score on a cover, and the order is still the order they were built.

export function ArcadeCover({
  game,
  shape,
  delay = 0,
  onTap,
}: {
  game: ArcadeGame
  shape: 'wide' | 'poster'
  delay?: number
  /** Overrides the default, which is to open the machine. */
  onTap?: () => void
}) {
  const navigate = useNavigate()
  const juice = useJuice()
  // The padlock is the nav's convention: a locked machine still stands in the
  // room, and tapping it explains itself rather than doing nothing.
  const locked = useAccountLocked() && !!game.needsAccount
  const wide = shape === 'wide'

  return (
    <motion.button
      onClick={() => {
        juice.select()
        if (onTap) onTap()
        else navigate(game.to)
      }}
      aria-label={`${game.title} — ${game.tagline}${locked ? ' (needs an account)' : ''}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26, delay }}
      whileTap={{ scale: 0.98 }}
      style={{
        position: 'relative',
        display: 'block',
        width: '100%',
        aspectRatio: wide ? '16 / 9' : '3 / 4',
        padding: 0,
        border: '1px solid var(--edge)',
        borderRadius: wide ? 20 : 16,
        overflow: 'hidden',
        background: `var(--card) url(${game.cover}) center ${wide ? '42%' : '30%'} / cover no-repeat`,
        boxShadow: '0 10px 24px rgba(0,0,0,0.38)',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0) 38%, rgba(14,9,12,0.55) 64%, rgba(14,9,12,0.92) 100%)',
        }}
      />
      {locked && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 26,
            height: 26,
            borderRadius: 999,
            display: 'grid',
            placeItems: 'center',
            fontSize: 13,
            background: 'rgba(14,9,12,0.7)',
            border: '1px solid var(--stroke)',
          }}
        >
          <PaintedIcon id="lock" />
        </span>
      )}
      <span
        style={{
          position: 'absolute',
          left: wide ? 16 : 10,
          right: wide ? 16 : 10,
          bottom: wide ? 14 : 10,
          display: 'grid',
          gap: 3,
          color: '#fff',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: wide ? 21 : 14,
            lineHeight: 1.1,
            textShadow: '0 2px 8px rgba(0,0,0,0.6)',
          }}
        >
          {game.title}
        </span>
        {wide && (
          <span style={{ fontSize: 12.5, lineHeight: 1.35, color: 'rgba(255,255,255,0.84)' }}>{game.tagline}</span>
        )}
      </span>
    </motion.button>
  )
}
