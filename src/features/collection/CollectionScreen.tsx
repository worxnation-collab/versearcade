import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { CARDS, RELICS, rarityColor, THRONE_KEY, type Collectible } from '@/data/collectibles'
import { useCollection } from '@/store/collection'
import { ThroneIcon } from '@/components/ThroneIcon'

// A collection wall. Locked items are visible-but-dimmed on purpose: seeing what
// you *could* earn is a stronger pull than hiding it. Cards name the exact thing
// to do to unlock them; relics come from the Daily Chest.
// Standalone /collection route — kept for deep links. The wall itself now also
// lives in a collapsible on the You tab.
export default function CollectionScreen() {
  return (
    <Page>
      <h1 style={{ fontSize: 30 }}>Collection</h1>
      <CollectionSection />
      <div style={{ height: 90 }} />
    </Page>
  )
}

// The collection wall with no page chrome, so it can be embedded on the You tab.
export function CollectionSection() {
  const owned = useCollection((s) => s.owned)
  const loaded = useCollection((s) => s.loaded)
  const load = useCollection((s) => s.load)
  const ownedSet = new Set(owned)

  useEffect(() => {
    load()
  }, [load])

  const cardsHave = CARDS.filter((c) => ownedSet.has(c.key)).length
  const relicsHave = RELICS.filter((c) => ownedSet.has(c.key)).length

  return (
    <>
      <p className="dim" style={{ marginBottom: 18 }}>
        {loaded ? `${cardsHave + relicsHave}/${CARDS.length + RELICS.length} collected — chase the set.` : 'Loading…'}
      </p>

      <SectionHeader title="Verse Cards" sub="Earn these by how you play" have={cardsHave} total={CARDS.length} />
      <Grid items={CARDS} ownedSet={ownedSet} lockedHint={(c) => c.description} />

      <div style={{ height: 22 }} />

      <SectionHeader title="Relics" sub="Open the Daily Chest to find these" have={relicsHave} total={RELICS.length} />
      <Grid items={RELICS} ownedSet={ownedSet} lockedHint={() => 'Found in the Daily Chest'} />
    </>
  )
}

function SectionHeader({ title, sub, have, total }: { title: string; sub: string; have: number; total: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
      <div>
        <h2 style={{ fontSize: 20 }}>{title}</h2>
        <p className="faint" style={{ fontSize: 12 }}>{sub}</p>
      </div>
      <span className="dim" style={{ fontSize: 13 }}>
        {have}/{total}
      </span>
    </div>
  )
}

function Grid({
  items,
  ownedSet,
  lockedHint,
}: {
  items: Collectible[]
  ownedSet: Set<string>
  lockedHint: (c: Collectible) => string
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {items.map((c, i) => {
        const has = ownedSet.has(c.key)
        return (
          <motion.div
            key={c.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 8) * 0.03 }}
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
            {has && c.key === THRONE_KEY ? (
              <div style={{ display: 'grid', placeItems: 'center', height: 52 }}>
                <ThroneIcon size={40} />
              </div>
            ) : (
              <div style={{ fontSize: 40 }}>{has ? c.emoji : '🔒'}</div>
            )}
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, marginTop: 6 }}>{c.name}</div>
            <div style={{ fontSize: 10, color: rarityColor[c.rarity], textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>
              {c.rarity}
            </div>
            <p className="faint" style={{ fontSize: 12, marginTop: 8 }}>{has ? c.description : lockedHint(c)}</p>
          </motion.div>
        )
      })}
    </div>
  )
}
