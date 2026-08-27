import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useInventory, seedGuestInventoryFromCollection } from '@/store/inventory'
import { useSettings } from '@/store/settings'
import { useJuice } from '@/juice/useJuice'

/**
 * The one-time pointer at the bag.
 *
 * Relics arrive from the chest and then just sit there: the Inventory lives
 * folded inside the You tab, so a player can hold a shelf of spares for weeks
 * and never find out that giving one to their church is a thing they can do.
 * This says so once, on the screen everyone opens, and then never again.
 *
 * Shown only when there's actually something in hand and the section has never
 * been open (`inventorySeen`, set by InventorySection itself). Tapping it deep
 * links straight into the open section — arriving on the profile with the bag
 * still folded shut would be the same miss again.
 *
 * It's an offer, not a nag: inline rather than floating, one ✕ retires it for
 * good, and the copy never implies you *should* have given something away.
 * Works the same in both modes — the count comes from the inventory store,
 * which reads the table online and localStorage for a guest, and the section it
 * points at handles "you don't have a church yet" on its own.
 */
export function InventoryNudge() {
  const navigate = useNavigate()
  const juice = useJuice()
  const load = useInventory((s) => s.load)
  const inHand = useInventory((s) =>
    Object.values(s.items).reduce((n, q) => n + (q > 0 ? q : 0), 0),
  )
  const seen = useSettings((s) => s.inventorySeen)
  const dismissed = useSettings((s) => s.inventoryNudgeDismissed)
  const setSettings = useSettings((s) => s.set)

  const retired = seen || dismissed

  useEffect(() => {
    // Nothing else on this screen reads the inventory, so the count has to be
    // fetched here or it's always zero. Skipped once the nudge is retired —
    // no reason to hit the table for a card that will never render.
    if (retired) return
    void load()
    // Guests who collected relics before the inventory existed hold nothing
    // until this backfills them, exactly as the section does on open.
    seedGuestInventoryFromCollection()
  }, [retired, load])

  if (retired || inHand < 1) return null

  const open = () => {
    juice.select?.()
    navigate('/you?inventory=1')
  }

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        marginTop: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderColor: 'var(--gold)',
      }}
    >
      <button
        onClick={open}
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          background: 'none',
          border: 'none',
          padding: 0,
          textAlign: 'left',
          color: 'inherit',
          cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 30, flexShrink: 0 }}>🎒</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <b style={{ display: 'block', fontFamily: 'var(--font-display)', fontSize: 17 }}>
            {inHand} relic{inHand === 1 ? '' : 's'} in hand
          </b>
          <span className="faint" style={{ display: 'block', fontSize: 13, lineHeight: 1.4 }}>
            You can give one to your church — the stamp stays in your Bible and the artwork
            stays yours.
          </span>
        </span>
        <span style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)', fontSize: 20, flexShrink: 0 }}>
          →
        </span>
      </button>
      <button
        aria-label="Not now"
        onClick={() => setSettings({ inventoryNudgeDismissed: true })}
        className="faint"
        style={{
          background: 'none',
          border: 'none',
          fontSize: 16,
          padding: 4,
          cursor: 'pointer',
          flexShrink: 0,
          alignSelf: 'flex-start',
        }}
      >
        ✕
      </button>
    </motion.div>
  )
}
