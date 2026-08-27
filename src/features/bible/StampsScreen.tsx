import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BookHeader, BookPage } from './BookPage'
import { PaperCard } from './tiers'
import { PAPER } from './paper'
import { useCollection } from '@/store/collection'
import { useInventory } from '@/store/inventory'
import { CARDS, RELICS, type Collectible } from '@/data/collectibles'

// The stamps: a permanent record, pressed into the front of the book, of every
// collectible the player has ever held.
//
// This is what makes giving something away safe. Donating a relic to your church
// hands over the ITEM, but the stamp stays here forever — so the artwork it
// unlocked is still yours, the set still counts it, and what you gave is the
// object rather than the memory of it. A stamp is only ever pressed once, the
// first time you get that collectible; a second copy adds nothing here, which is
// exactly why a duplicate is worth giving away.
export default function StampsScreen() {
  const navigate = useNavigate()
  const owned = useCollection((s) => s.owned)
  const loadCollection = useCollection((s) => s.load)
  const items = useInventory((s) => s.items)
  const loadInventory = useInventory((s) => s.load)

  useEffect(() => {
    loadCollection()
    loadInventory()
  }, [loadCollection, loadInventory])

  const ownedSet = useMemo(() => new Set(owned), [owned])
  const stamped = useMemo(
    () => [...CARDS, ...RELICS].filter((c) => ownedSet.has(c.key)),
    [ownedSet],
  )
  const total = CARDS.length + RELICS.length
  const given = stamped.filter((c) => !(items[c.key] > 0)).length

  return (
    <BookPage
      header={
        <BookHeader
          onBack={() => navigate('/bible')}
          backLabel="Back to my Bible"
          title="Stamps"
          note={`${stamped.length} of ${total}`}
        />
      }
    >
      <PaperCard>
        <p style={{ fontSize: 13, lineHeight: 1.55, color: PAPER.inkDim, margin: 0 }}>
          Every card and relic you’ve ever held is pressed in here, once. A stamp is permanent —
          it stays even after you give the item to your church, so what you give away is the
          object, never the record.
        </p>
        {given > 0 && (
          <p style={{ fontSize: 12, marginTop: 8, color: PAPER.inkFaint }}>
            {given} of these {given === 1 ? 'has' : 'have'} been given — still stamped, still yours.
          </p>
        )}
      </PaperCard>

      {stamped.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 10px' }}>
          <div className="floaty" style={{ fontSize: 40 }}>🕊️</div>
          <p style={{ fontSize: 14, marginTop: 10, lineHeight: 1.5, color: PAPER.inkDim }}>
            No stamps yet. Play the daily verse and open the Daily Chest — the first thing you
            collect gets pressed here.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))',
            gap: 12,
            marginTop: 16,
          }}
        >
          {stamped.map((c, i) => (
            <Stamp key={c.key} def={c} index={i} held={items[c.key] > 0} />
          ))}
        </div>
      )}
    </BookPage>
  )
}

// Pressed by hand, so no two sit perfectly straight. The angle is derived from
// the key rather than random, so a stamp doesn't jump every time you open the
// page — it's a mark in a book, and marks stay where they were put.
function Stamp({ def, index, held }: { def: Collectible; index: number; held: boolean }) {
  const tilt = ((hash(def.key) % 11) - 5) * 0.9

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22, delay: Math.min(index, 14) * 0.02 }}
      title={`${def.name} — ${def.description}`}
      style={{
        transform: `rotate(${tilt}deg)`,
        border: `2px solid ${PAPER.accent}`,
        borderRadius: 10,
        // Ink soaks unevenly into paper; the stamp is never a flat fill.
        background:
          'radial-gradient(90% 80% at 35% 25%, rgba(154,47,47,0.13), rgba(154,47,47,0.05))',
        padding: '10px 6px 8px',
        textAlign: 'center',
        // A stamp for something you've given away has faded a little with time.
        opacity: held ? 1 : 0.72,
      }}
    >
      <div style={{ fontSize: 22, lineHeight: 1 }}>{def.emoji}</div>
      <div
        style={{
          fontSize: 9,
          marginTop: 6,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: PAPER.accent,
          fontWeight: 800,
          lineHeight: 1.2,
        }}
      >
        {def.name}
      </div>
      {!held && (
        <div style={{ fontSize: 8, marginTop: 3, color: PAPER.inkFaint, letterSpacing: '0.05em' }}>
          GIVEN
        </div>
      )}
    </motion.div>
  )
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
