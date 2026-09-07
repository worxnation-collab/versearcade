import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button } from '@/components/Button'
import type { WeekRecap as Recap, WeekNumbers } from '@/store/weekly'

// "Your week" — the body of the recap sheet on the Play tab.
//
// Your own numbers, each on its own tile, and ONLY the ones that moved: a row
// reading "0 chapters read" is the one shape this app doesn't put in front of
// anybody, and a quiet week gets one warm line instead of seven zeros. Nothing
// here is compared to last week, to anybody else, or to a target. See the
// header in store/weekly.ts.

const ROWS: { key: keyof WeekNumbers; icon: string; one: string; many: string }[] = [
  { key: 'plays', icon: '✦', one: 'daily verse played', many: 'daily verses played' },
  { key: 'studied', icon: '📖', one: 'verse studied', many: 'verses studied' },
  { key: 'chapters', icon: '📚', one: 'chapter read', many: 'chapters read' },
  { key: 'relics', icon: '🏺', one: 'relic found', many: 'relics found' },
  { key: 'battles', icon: '⚔️', one: 'battle or race played', many: 'battles and races played' },
  { key: 'given', icon: '⛪', one: 'point given to your church', many: 'points given to your church' },
  { key: 'xp', icon: '⭐', one: 'XP earned', many: 'XP earned' },
]

function prettyRange(from: string, to: string): string {
  const f = new Date(`${from}T12:00:00`)
  const t = new Date(`${to}T12:00:00`)
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${fmt(f)} – ${fmt(t)}`
}

export function WeekRecapBody({ recap, onClose }: { recap: Recap; onClose: () => void }) {
  const navigate = useNavigate()
  const rows = ROWS.filter((r) => recap.delta[r.key] > 0)

  return (
    <div>
      <p className="faint" style={{ margin: '0 0 12px', fontSize: 12.5 }}>{prettyRange(recap.from, recap.to)}</p>

      {rows.length === 0 ? (
        <>
          <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17 }}>
            A quiet week.
          </p>
          <p className="dim" style={{ margin: '6px 0 16px', fontSize: 14, lineHeight: 1.5 }}>
            That’s allowed. Today’s verse is live whenever you are.
          </p>
        </>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          {rows.map((r, i) => {
            const n = recap.delta[r.key]
            return (
              <motion.div
                key={r.key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i, type: 'spring', stiffness: 300, damping: 24 }}
                className="card"
                style={{ padding: '12px 12px 10px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}
              >
                <span style={{ fontSize: 18, lineHeight: 1 }} aria-hidden>{r.icon}</span>
                <b style={{ fontFamily: 'var(--font-display)', fontSize: 24, lineHeight: 1, color: 'var(--gold)', fontVariantNumeric: 'tabular-nums' }}>
                  {n.toLocaleString()}
                </b>
                <span className="dim" style={{ fontSize: 12, lineHeight: 1.35 }}>{n === 1 ? r.one : r.many}</span>
              </motion.div>
            )
          })}
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        <Button variant="gold" full onClick={() => { onClose(); navigate('/play') }}>
          Start this week with today’s verse →
        </Button>
        <Button variant="ghost" full onClick={() => { onClose(); navigate('/journal') }}>
          Open the Journal
        </Button>
      </div>
      <p className="faint center" style={{ margin: '10px 0 0', fontSize: 11.5, lineHeight: 1.5 }}>
        Your own week, nobody else’s. Nothing here is ranked.
      </p>
    </div>
  )
}
