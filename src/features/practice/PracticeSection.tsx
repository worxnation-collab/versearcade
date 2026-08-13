import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { usePractice } from '@/store/practice'
import { todayLocalDate } from '@/lib/date'
import { daysBetween } from '@/lib/practice'

// "Study the last five" — replay recently-played verses to reinforce them.
// Replaying is free; beating your best pays scaled XP, once per week per verse.
// Only shows once you have past plays, so it's never empty clutter.
export function PracticeSection() {
  const navigate = useNavigate()
  const list = usePractice((s) => s.list)
  const loadedList = usePractice((s) => s.loadedList)
  const loadList = usePractice((s) => s.loadList)

  useEffect(() => {
    loadList()
  }, [loadList])

  if (!loadedList || list.length === 0) return null
  const today = todayLocalDate()

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ marginTop: 16 }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>📚</span>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17 }}>Study the last five</div>
            <div className="faint" style={{ fontSize: 12 }}>Replay to learn — beat your best to earn XP</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {list.map((item) => {
          const locked = !item.rewardable
          const days = item.nextRewardOn ? Math.max(0, daysBetween(today, item.nextRewardOn)) : 0
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
                  {locked ? (
                    <span>bonus back in {days} day{days === 1 ? '' : 's'}</span>
                  ) : (
                    <span style={{ color: 'var(--gold)' }}>beat it for XP</span>
                  )}
                </div>
              </div>
              <div
                className="pill"
                style={{
                  fontSize: 11,
                  opacity: locked ? 0.6 : 1,
                  borderColor: locked ? undefined : 'var(--gold)',
                  color: locked ? undefined : 'var(--gold)',
                }}
              >
                {locked ? '🔁 Study' : '⚡ Beat it'}
              </div>
            </motion.button>
          )
        })}
      </div>
    </motion.div>
  )
}
