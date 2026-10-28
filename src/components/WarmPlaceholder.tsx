import { motion } from 'framer-motion'
import { useSettings } from '@/store/settings'

// The one "still arriving" shape for a card that has not loaded yet: the
// card's own surface with a slow lamplit glow breathing across it — never a
// grey spinner and never a blank box. It reserves the card's HEIGHT, so the
// screen doesn't jump when the real card replaces it (Home's church window was
// popping a ~250px card in under the daily boxes). Under reduce-motion the
// glow holds still. An optional line says what is coming, in the app's voice.
export function WarmPlaceholder({ height, line }: { height: number; line?: string }) {
  const reduceMotion = useSettings((s) => s.reduceMotion)
  return (
    <div
      className="card"
      aria-busy="true"
      aria-live="polite"
      style={{ height, position: 'relative', overflow: 'hidden', display: 'grid', placeItems: 'center' }}
    >
      <motion.div
        aria-hidden
        initial={{ opacity: 0.35 }}
        animate={reduceMotion ? { opacity: 0.35 } : { opacity: [0.25, 0.55, 0.25] }}
        transition={reduceMotion ? undefined : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at 50% 60%, rgba(255,209,102,0.16), transparent 70%)',
        }}
      />
      {line && (
        <span className="faint" style={{ position: 'relative', fontSize: 13 }}>
          🕯️ {line}
        </span>
      )}
    </div>
  )
}
