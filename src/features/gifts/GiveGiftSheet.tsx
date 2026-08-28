import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useInventory } from '@/store/inventory'
import { useGifts, GIFT_DAILY_CAP } from '@/store/gifts'
import { collectibleByKey, rarityColor } from '@/data/collectibles'
import { useJuice } from '@/juice/useJuice'

// Giving a relic to the player whose card you are looking at.
//
// The bag already had exactly one exit — donate it to your church — and the
// player card already had every way to CHALLENGE somebody. This is the pair
// neither of them had: hand an object to a person.
//
// Two things about the surface, both deliberate:
//
//   IT SHOWS WHAT YOU HOLD, not what you have collected. The stamp (your
//   collection record) never moves; the item does. So the grid is the bag, and
//   a relic you own the stamp for but hold none of is simply not in it.
//
//   THERE IS NO MESSAGE FIELD. A gift is (who, what, when) — see 0070. An open
//   text box aimed at a stranger is the moderation problem the churchyard, the
//   keep and the crowd's ten emoji all exist to avoid.
//
// Portalled and pinned at the sheet tier (100) so it opens under the player
// card (110) it was launched from.

export function GiveGiftSheet({ username, onClose }: { username: string; onClose: () => void }) {
  const juice = useJuice()
  const items = useInventory((s) => s.items)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [given, setGiven] = useState<string | null>(null)

  useEffect(() => {
    void useInventory.getState().load()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const held = Object.entries(items)
    .filter(([, qty]) => qty > 0)
    .map(([key, qty]) => ({ key, qty, def: collectibleByKey(key) }))
    .filter((h) => !!h.def)

  const give = async (key: string) => {
    setBusy(key)
    setMsg(null)
    const res = await useGifts.getState().give(username, key)
    setBusy(null)
    if (res.ok) {
      juice.celebrate()
      setGiven(key)
      setMsg(`Given to @${username}. ${res.sentToday ?? 0}/${GIFT_DAILY_CAP} given today.`)
      return
    }
    setMsg(
      res.reason === 'daily_cap'
        ? `That’s ${GIFT_DAILY_CAP} given today — the rest keeps until tomorrow.`
        : res.reason === 'not_held'
          ? 'You’re not holding one of those any more.'
          : res.reason === 'not_found'
            ? `Couldn’t find @${username}.`
            : res.reason === 'offline'
              ? 'Giving needs an account on both ends.'
              : 'That didn’t go through. Try again in a moment.',
    )
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="gift-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100,
          background: 'rgba(8,3,24,0.72)',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
        }}
      >
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 520,
            maxHeight: '88dvh',
            overflowY: 'auto',
            background: 'var(--bg-1)',
            borderRadius: 'var(--r-lg) var(--r-lg) 0 0',
            border: '1px solid var(--stroke)',
            borderBottom: 'none',
            padding: '14px 14px calc(var(--safe-bottom) + 20px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 18, flex: 1, minWidth: 0 }}>
              Give something to @{username}
            </b>
            <button className="pill" onClick={() => { juice.select(); onClose() }} aria-label="Close">✕</button>
          </div>

          <p className="faint" style={{ fontSize: 12, margin: '0 0 12px', lineHeight: 1.5 }}>
            Out of your bag and into theirs. You keep the record of ever having had it — only the
            relic itself moves, so nothing about your collection changes and nothing about theirs
            is rewritten.
          </p>

          {held.length === 0 ? (
            <p className="dim" style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>
              Your bag is empty. Relics come from the Daily Chest and from studying.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))' }}>
              {held.map(({ key, qty, def }) => (
                <button
                  key={key}
                  onClick={() => void give(key)}
                  disabled={!!busy || given === key}
                  style={{
                    borderRadius: 12,
                    border: `1px solid ${given === key ? 'var(--good)' : 'var(--stroke)'}`,
                    background: 'rgba(255,255,255,0.04)',
                    padding: '10px 6px 8px',
                    cursor: busy ? 'default' : 'pointer',
                    textAlign: 'center',
                    opacity: given === key ? 0.55 : 1,
                  }}
                >
                  <span style={{ display: 'block', fontSize: 28, lineHeight: 1 }}>{def!.emoji}</span>
                  <span style={{ display: 'block', fontSize: 11, fontWeight: 800, marginTop: 6, lineHeight: 1.25 }}>
                    {def!.name}
                  </span>
                  <span style={{ display: 'block', fontSize: 10, marginTop: 2, color: rarityColor[def!.rarity] }}>
                    {busy === key ? '…' : given === key ? 'Given ✓' : `${qty} in hand`}
                  </span>
                </button>
              ))}
            </div>
          )}

          {msg && (
            <p className="center" style={{ margin: '12px 0 0', fontSize: 13, fontWeight: 800, color: 'var(--gold)' }}>
              {msg}
            </p>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
