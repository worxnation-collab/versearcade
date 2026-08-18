import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { FavoriteButton } from '@/components/FavoriteButton'
import { ChapterReader } from '@/features/daily/ChapterReader'
import { useFavorites } from '@/store/favorites'
import { savedLabel, toList } from '@/lib/favorites'
import { verseFromReference } from '@/data/bible/questions'
import type { DailyVerse } from '@/types'

// The shelf: every verse the player hearted after a challenge, newest first.
// Reading, not scoring — there's no XP here, no rank, nothing to beat. Tapping a
// verse opens the same chapter reader the daily recap uses, so a keepsake leads
// back into the text rather than into another quiz.
export default function FavoritesScreen() {
  const navigate = useNavigate()
  const map = useFavorites((s) => s.map)
  const loaded = useFavorites((s) => s.loaded)
  const load = useFavorites((s) => s.load)
  const [reading, setReading] = useState<DailyVerse | null>(null)

  useEffect(() => {
    load()
  }, [load])

  const list = useMemo(() => toList(map), [map])

  return (
    <Page noNav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button className="pill" onClick={() => navigate(-1)} aria-label="Back">✕</button>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Favorite verses</b>
        {list.length > 0 && (
          <span className="faint" style={{ fontSize: 13, marginLeft: 'auto' }}>{list.length} kept</span>
        )}
      </div>

      {!loaded ? (
        <div className="center" style={{ paddingTop: 60 }}>
          <div className="floaty" style={{ fontSize: 44 }}>❤️</div>
          <p className="faint" style={{ marginTop: 10 }}>Opening your shelf…</p>
        </div>
      ) : list.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', paddingTop: 26, paddingBottom: 26 }}>
          <div className="floaty" style={{ fontSize: 44 }}>🤍</div>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 18, display: 'block', marginTop: 8 }}>
            Nothing kept yet
          </b>
          <p className="dim" style={{ fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>
            Finish any verse challenge — the daily drop, a practice replay, a focus drill or a
            battle — and tap the heart on the recap. Whatever you keep lands here to read again.
          </p>
          <div style={{ marginTop: 16 }}>
            <Button variant="gold" full onClick={() => navigate('/play')}>Play today’s verse</Button>
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
              style={{ textAlign: 'left' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>{f.reference}</b>
                  <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
                    {savedLabel(f.savedAt)}
                    {f.seed?.theme ? ` · ${f.seed.theme}` : ''}
                  </div>
                </div>
                <FavoriteButton reference={f.reference} variant="icon" savedLabel="Saved" />
              </div>

              {f.seed ? (
                <>
                  <p style={{ marginTop: 10, lineHeight: 1.5 }}>“{f.seed.text}”</p>
                  {f.seed.facts[0] && (
                    <p className="faint" style={{ marginTop: 8, fontSize: 13 }}>💡 {f.seed.facts[0]}</p>
                  )}
                  <button
                    onClick={() => setReading(verseFromReference(f.reference))}
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
                    📖 Read the full chapter →
                  </button>
                </>
              ) : (
                // A reference kept before the pool changed: still listed, still
                // removable, just without the text to show.
                <p className="faint" style={{ marginTop: 10, fontSize: 13, lineHeight: 1.45 }}>
                  This verse isn’t in the current rotation, so there’s nothing to show here — the
                  heart still removes it.
                </p>
              )}
            </motion.div>
          ))}
        </div>
      )}

      <p className="faint center" style={{ fontSize: 11, marginTop: 20, lineHeight: 1.45 }}>
        Just for you — favorites are private and never affect your XP, streak or rank.
      </p>

      <div style={{ height: 40 }} />

      <AnimatePresence>
        {reading && <ChapterReader verse={reading} onClose={() => setReading(null)} />}
      </AnimatePresence>
    </Page>
  )
}
