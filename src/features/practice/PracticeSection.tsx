import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { usePractice } from '@/store/practice'

// "Study the last five" — replay recently-played verses to reinforce them.
// Replaying is free; beating your best pays scaled XP, every time you beat it.
// Lives on the Study tab, where it opens expanded and explains itself when the
// player has no past plays yet (elsewhere it stays silent rather than clutter).
export function PracticeSection({ defaultOpen = false, showEmpty = false }: { defaultOpen?: boolean; showEmpty?: boolean }) {
  const navigate = useNavigate()
  const list = usePractice((s) => s.list)
  const loadedList = usePractice((s) => s.loadedList)
  const loadList = usePractice((s) => s.loadList)
  const [open, setOpen] = useState(defaultOpen)

  useEffect(() => {
    loadList()
  }, [loadList])

  if (!loadedList || list.length === 0) {
    if (!showEmpty) return null
    return (
      <div className="card" style={{ marginTop: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 30 }}>📚</div>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 16, display: 'block', marginTop: 6 }}>Study the last five</b>
        <p className="faint" style={{ fontSize: 13, marginTop: 6, lineHeight: 1.45 }}>
          {loadedList
            ? 'Play a few daily verses and they’ll land here to replay — beat your best score to earn XP.'
            : 'Loading your recent verses…'}
        </p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ marginTop: 16 }}
    >
      {/* Collapsible (default closed) so it doesn't dominate the homepage. */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: 'transparent', border: 'none', padding: 0, marginBottom: open ? 8 : 0, cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>📚</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17 }}>
              Study the last five <span className="faint" style={{ fontSize: 12 }}>· {list.length}</span>
            </div>
            <div className="faint" style={{ fontSize: 12 }}>Replay to learn — beat your best to earn XP</div>
          </div>
        </div>
        <span style={{ color: 'var(--gold)', fontSize: 16, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>▾</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
      <div style={{ display: 'grid', gap: 8 }}>
        {list.map((item) => {
          return (
            <motion.button
              key={item.dropDate}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate(`/play/practice/${item.dropDate}`)}
              className="card"
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', textAlign: 'left' }}
            >
              <div style={{ fontSize: 22 }}>📖</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.reference}
                </div>
                <div className="faint" style={{ fontSize: 12 }}>
                  Best {item.bestScore.toLocaleString()} ·{' '}
                  <span style={{ color: 'var(--gold)' }}>beat it for XP</span>
                </div>
              </div>
              <div
                className="pill"
                style={{ fontSize: 11, borderColor: 'var(--gold)', color: 'var(--gold)' }}
              >
                ⚡ Beat it
              </div>
            </motion.button>
          )
        })}
      </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
