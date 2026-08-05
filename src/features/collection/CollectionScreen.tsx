import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { COLLECTIBLES, rarityColor } from '@/data/collectibles'
import { localdb } from '@/lib/localdb'

// A collection wall. Locked cards are visible-but-dimmed on purpose: seeing what
// you *could* earn is a stronger pull than hiding it. Each card names the exact
// thing to do to unlock it — a concrete next goal every visit.
export default function CollectionScreen() {
  const owned = useMemo(() => new Set(localdb.getCards()), [])
  const total = COLLECTIBLES.length
  const have = COLLECTIBLES.filter((c) => owned.has(c.key)).length

  return (
    <Page>
      <h1 style={{ fontSize: 30 }}>Verse Cards</h1>
      <p className="dim" style={{ marginBottom: 16 }}>
        {have}/{total} collected — chase the set.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {COLLECTIBLES.map((c, i) => {
          const has = owned.has(c.key)
          return (
            <motion.div
              key={c.key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="card"
              style={{
                textAlign: 'center',
                padding: 16,
                borderColor: has ? rarityColor[c.rarity] : 'var(--stroke)',
                opacity: has ? 1 : 0.5,
                filter: has ? 'none' : 'grayscale(0.8)',
                boxShadow: has ? `0 0 20px ${rarityColor[c.rarity]}40` : 'none',
              }}
            >
              <div style={{ fontSize: 40 }}>{has ? c.emoji : '🔒'}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, marginTop: 6 }}>{c.name}</div>
              <div style={{ fontSize: 10, color: rarityColor[c.rarity], textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{c.rarity}</div>
              <p className="faint" style={{ fontSize: 12, marginTop: 8 }}>{c.description}</p>
            </motion.div>
          )
        })}
      </div>
    </Page>
  )
}
