import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { FavoriteButton } from '@/components/FavoriteButton'
import { useFavorites } from '@/store/favorites'
import { savedLabel, toList } from '@/lib/favorites'
import { parseReference } from '@/lib/bibleProgress'
import { useBibleMarks } from './useBibleMarks'

// Every verse the player has kept, newest first — the old favorites shelf, now
// the index to their Bible rather than a place of its own. Tapping one opens it
// where it actually lives, in its chapter, highlighted among its neighbours.
//
// Reading, not scoring: no XP here, no rank, nothing to beat.
export default function HighlightsScreen() {
  const navigate = useNavigate()
  const map = useFavorites((s) => s.map)
  const loaded = useFavorites((s) => s.loaded)
  // Loads favorites (and the marks the Bible needs when we jump into it).
  useBibleMarks()

  const list = useMemo(() => toList(map), [map])

  const openInBible = (reference: string) => {
    const ref = parseReference(reference)
    if (!ref) return
    navigate(`/bible/${encodeURIComponent(ref.book)}/${ref.chapter}?v=${ref.start}`)
  }

  return (
    <Page noNav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button className="pill" onClick={() => navigate('/bible')} aria-label="Back to my Bible">←</button>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Your highlights</b>
        {list.length > 0 && (
          <span className="faint" style={{ fontSize: 13, marginLeft: 'auto' }}>{list.length} kept</span>
        )}
      </div>

      {!loaded ? (
        <div className="center" style={{ paddingTop: 60 }}>
          <div className="floaty" style={{ fontSize: 44 }}>🔖</div>
          <p className="faint" style={{ marginTop: 10 }}>Finding your highlights…</p>
        </div>
      ) : list.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', paddingTop: 26, paddingBottom: 26 }}>
          <div className="floaty" style={{ fontSize: 44 }}>🤍</div>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 18, display: 'block', marginTop: 8 }}>
            Nothing kept yet
          </b>
          <p className="dim" style={{ fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>
            Finish any verse challenge — the daily drop, a practice replay, a focus drill or a
            battle — and tap the heart on the recap. Whatever you keep turns gold in your Bible.
          </p>
          <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
            <Button variant="gold" full onClick={() => navigate('/play')}>Play today’s verse</Button>
            <Button variant="secondary" full onClick={() => navigate('/bible')}>Open my Bible</Button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {list.map((f, idx) => (
            <motion.div
              key={f.reference}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28, delay: Math.min(idx, 6) * 0.03 }}
              className="card"
              style={{ textAlign: 'left', borderColor: 'rgba(255,210,63,0.35)' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>{f.reference}</b>
                  <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
                    {savedLabel(f.savedAt)}
                    {f.seed?.theme ? ` · ${f.seed.theme}` : ''}
                  </div>
                </div>
                <FavoriteButton reference={f.reference} variant="icon" savedLabel="Kept" />
              </div>

              {f.seed ? (
                <>
                  <p style={{ marginTop: 10, lineHeight: 1.5 }}>“{f.seed.text}”</p>
                  {f.seed.facts[0] && (
                    <p className="faint" style={{ marginTop: 8, fontSize: 13 }}>💡 {f.seed.facts[0]}</p>
                  )}
                </>
              ) : (
                // A reference kept before the pool changed: still listed, still
                // removable, and still openable — its chapter is in the Bible
                // whether or not the arcade has questions for it.
                <p className="faint" style={{ marginTop: 10, fontSize: 13, lineHeight: 1.45 }}>
                  This verse isn’t in the quiz rotation, so there’s no preview here — it still opens
                  in your Bible, and the heart still removes it.
                </p>
              )}

              {parseReference(f.reference) && (
                <button
                  onClick={() => openInBible(f.reference)}
                  style={{
                    marginTop: 12,
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 'var(--r-pill)',
                    border: '1px solid var(--gold)',
                    background: 'rgba(255,210,63,0.10)',
                    color: 'var(--gold)',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 800,
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  📖 Open in my Bible →
                </button>
              )}
            </motion.div>
          ))}
        </div>
      )}

      <p className="faint center" style={{ fontSize: 11, marginTop: 20, lineHeight: 1.45 }}>
        Just for you — highlights are private and never affect your XP, streak or rank.
      </p>

      <div style={{ height: 40 }} />
    </Page>
  )
}
