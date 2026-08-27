import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { Collapsible } from '@/components/Collapsible'
import { PracticeSection } from '@/features/practice/PracticeSection'
import { InventorySection } from '@/features/collection/InventorySection'
import { BookAccuracyChart } from './BookAccuracyChart'
import { useReviews } from '@/store/reviews'
import { useFavorites } from '@/store/favorites'
import { useInventory, seedGuestInventoryFromCollection } from '@/store/inventory'
import { useJuice } from '@/juice/useJuice'
import { useEffect } from 'react'

// The Study tab — everything that's practice rather than the daily drop or a
// real battle: race a CPU study partner, replay the last five verses, and clear
// whatever spaced-repetition reviews are due. Nothing here touches your rank.
export default function StudyScreen() {
  const navigate = useNavigate()
  const juice = useJuice()
  const { dueRefs, loadDue } = useReviews()
  const favCount = useFavorites((s) => Object.keys(s.map).length)
  const loadFavorites = useFavorites((s) => s.load)
  const loadInventory = useInventory((s) => s.load)
  const inHand = useInventory((s) =>
    Object.values(s.items).reduce((n, qty) => n + Math.max(0, qty), 0),
  )
  // The drop toast sends the player here with ?bag=1 so "give it to your church"
  // lands on an open bag rather than on a closed drawer they have to find.
  const [params] = useSearchParams()
  const openBag = params.get('bag') === '1'

  useEffect(() => {
    loadDue()
    loadFavorites()
    loadInventory()
    seedGuestInventoryFromCollection()
  }, [loadDue, loadFavorites, loadInventory])

  return (
    <Page>
      <div className="center" style={{ marginBottom: 18 }}>
        <div className="floaty" style={{ fontSize: 44 }}>📚</div>
        <h1 style={{ fontSize: 28, marginTop: 4 }}>Study</h1>
        <p className="dim" style={{ marginTop: 4 }}>Practice as much as you like — none of it affects your rank.</p>
      </div>

      {/* Battle the CPU — the headline action, always available. */}
      <motion.div
        className="card"
        initial={{ scale: 0.97, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        style={{ padding: 20, textAlign: 'center', position: 'relative', overflow: 'hidden', marginBottom: 18 }}
      >
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(400px 200px at 50% 0%, rgba(122,63,242,0.22), transparent 70%)' }} />
        <div className="floaty" style={{ fontSize: 40 }}>🤖</div>
        <h2 style={{ fontSize: 22, marginTop: 6 }}>Battle the CPU</h2>
        <p className="dim" style={{ marginTop: 6, fontSize: 14, lineHeight: 1.45 }}>
          Race a study partner through a verse quiz — their score ticks up live beside yours.
          Pick Rookie, Deacon or Prophet.
        </p>
        <div style={{ marginTop: 14 }}>
          <Button variant="gold" full onClick={() => { juice.coin(); navigate('/battle/cpu') }}>
            ⚔️ Play vs CPU
          </Button>
        </div>
      </motion.div>

      {/* Focus practice — drill one book of your choosing against a companion.
          Sibling to the CPU battle: same live versus bar, but scoped to a book
          and it pays a little XP (5/session, every session — no daily cap). */}
      <motion.button
        onClick={() => { juice.coin(); navigate('/study/focus') }}
        whileTap={{ scale: 0.98 }}
        className="card"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ width: '100%', textAlign: 'left', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14 }}
      >
        <div style={{ fontSize: 30 }}>🎯</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17 }}>Focus a book</div>
          <div className="faint" style={{ fontSize: 13, lineHeight: 1.35 }}>
            Drill verses from one book against a study partner · earns XP
          </div>
        </div>
        <div style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)', fontSize: 20 }}>→</div>
      </motion.button>

      {/* Keep it — spaced repetition, only when something is actually due. */}
      {dueRefs.length > 0 && (
        <motion.button
          onClick={() => { juice.select(); navigate('/review') }}
          whileTap={{ scale: 0.97 }}
          className="card"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ width: '100%', textAlign: 'left', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 14 }}
        >
          <div style={{ fontSize: 30 }}>🧠</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17 }}>Keep it</div>
            <div className="faint" style={{ fontSize: 13 }}>
              {dueRefs.length} verse{dueRefs.length > 1 ? 's' : ''} ready to review — make {dueRefs.length > 1 ? 'them' : 'it'} stick
            </div>
          </div>
          <div style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)', fontSize: 20 }}>→</div>
        </motion.button>
      )}

      {/* The player's Bible. Always shown, even at zero — it's how a player
          learns the heart on a recap does something, and where they see that
          everything they've opened is already lit up in the whole book. */}
      <motion.button
        onClick={() => { juice.select(); navigate('/bible') }}
        whileTap={{ scale: 0.97 }}
        className="card"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ width: '100%', textAlign: 'left', marginTop: dueRefs.length > 0 ? 10 : 0, display: 'flex', alignItems: 'center', gap: 14 }}
      >
        <div style={{ fontSize: 30 }}>📖</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17 }}>
            My Bible
            {favCount > 0 && <span className="faint" style={{ fontSize: 12 }}> · {favCount} kept</span>}
          </div>
          <div className="faint" style={{ fontSize: 13, lineHeight: 1.35 }}>
            {favCount > 0
              ? 'See what you’ve kept, studied and read — book by book'
              : 'All 66 books, lit up as you go. Tap the heart after a challenge to keep a verse'}
          </div>
        </div>
        <div style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)', fontSize: 20 }}>→</div>
      </motion.button>

      {/* Study the last five — open by default here, since this is its home. */}
      <PracticeSection defaultOpen showEmpty />

      {/* What studying turned up, and the one thing it's for. The bag also lives
          on the You tab; it's here because this is where the finds happen and
          because the answer to "I found a thing" should be one tap away, not a
          trip to another tab. Folded by default — a drop is a surprise, and a
          permanently open reward drawer would turn it into a chore. */}
      <div style={{ marginTop: 16 }}>
        <Collapsible icon="🎒" title="Your bag" meta={`${inHand} in hand`} defaultOpen={openBag}>
          <InventorySection />
        </Collapsible>
      </div>

      {/* Where you actually stand, book by book — and the tap that turns a weak
          spot into a focus drill. Sits under the actions: it's the reason to
          pick one, not a scoreboard to open the tab for. */}
      <BookAccuracyChart />

      <div style={{ height: 90 }} />
    </Page>
  )
}
