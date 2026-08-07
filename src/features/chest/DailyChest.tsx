import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/Button'
import { useGame } from '@/store/game'
import { useCollection } from '@/store/collection'
import { collectibleByKey, rarityColor } from '@/data/collectibles'
import { useJuice } from '@/juice/useJuice'

// A once-a-day reward that reinforces the daily loop: it unlocks only after you
// play today's verse, then gives a random relic (common / uncommon / rare) —
// one more reason to keep the streak alive and come back tomorrow.
export function DailyChest() {
  const todayDate = useGame((s) => s.todayDate)
  const playedToday = useGame((s) => s.playedToday)
  const load = useCollection((s) => s.load)
  const chestOpenedOn = useCollection((s) => s.chestOpenedOn)
  const openChest = useCollection((s) => s.openChest)
  const juice = useJuice()
  const [revealed, setRevealed] = useState<{ key: string; rarity?: string } | null>(null)
  const [opening, setOpening] = useState(false)

  useEffect(() => {
    load()
  }, [load])

  const openedToday = chestOpenedOn(todayDate)

  const open = async () => {
    if (opening) return
    setOpening(true)
    const res = await openChest(todayDate)
    setOpening(false)
    if (!res.alreadyOpened && res.key) {
      setRevealed({ key: res.key, rarity: res.rarity })
      juice.celebrate()
    }
  }

  const relic = revealed ? collectibleByKey(revealed.key) : null
  const rarity = relic?.rarity ?? 'common'
  const glow = rarityColor[rarity]

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        marginTop: 16,
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
        borderColor: revealed ? glow : 'var(--stroke)',
        boxShadow: revealed ? `0 0 26px ${glow}55` : undefined,
      }}
    >
      <AnimatePresence mode="wait">
        {relic ? (
          // ——— Reveal ———
          <motion.div key="reveal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div
              initial={{ scale: 0.3, rotate: -12, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 240, damping: 12 }}
              style={{ fontSize: 56 }}
            >
              {relic.emoji}
            </motion.div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, marginTop: 6 }}>{relic.name}</div>
            <div style={{ fontSize: 11, color: glow, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>
              {rarity} relic
            </div>
            <p className="faint" style={{ fontSize: 13, marginTop: 8 }}>{relic.description}</p>
            <p className="faint" style={{ fontSize: 12, marginTop: 10 }}>Come back tomorrow for another.</p>
          </motion.div>
        ) : openedToday ? (
          // ——— Already opened today ———
          <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div style={{ fontSize: 40, opacity: 0.5 }}>🎁</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, marginTop: 6 }}>Chest opened</div>
            <p className="faint" style={{ fontSize: 13, marginTop: 4 }}>Come back tomorrow for a new relic.</p>
          </motion.div>
        ) : playedToday ? (
          // ——— Ready to open ———
          <motion.div key="ready" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                background: 'radial-gradient(300px 160px at 50% 0%, rgba(255,210,63,0.16), transparent 70%)',
              }}
            />
            <motion.div
              animate={{ rotate: [0, -6, 6, -6, 0], y: [0, -3, 0] }}
              transition={{ repeat: Infinity, repeatDelay: 1.4, duration: 0.7 }}
              style={{ fontSize: 48 }}
            >
              🎁
            </motion.div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, marginTop: 6 }}>Daily Chest</div>
            <p className="dim" style={{ fontSize: 13, marginTop: 4 }}>A relic is waiting inside.</p>
            <div style={{ marginTop: 14 }}>
              <Button variant="gold" full disabled={opening} onClick={open}>
                {opening ? '…' : 'Open today’s chest ✨'}
              </Button>
            </div>
          </motion.div>
        ) : (
          // ——— Locked until they play ———
          <motion.div key="locked" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div style={{ fontSize: 40, opacity: 0.5 }}>🎁</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, marginTop: 6 }}>Daily Chest</div>
            <p className="faint" style={{ fontSize: 13, marginTop: 4 }}>Play today’s verse to unlock your chest.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
