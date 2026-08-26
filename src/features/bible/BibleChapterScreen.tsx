import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { useJuice } from '@/juice/useJuice'
import { useSettings } from '@/store/settings'
import { useBible } from '@/store/bible'
import { useFavorites } from '@/store/favorites'
import { fetchChapter, type Chapter } from '@/lib/bible'
import { FAVORITES_CAP } from '@/lib/favorites'
import { useBibleMarks } from './useBibleMarks'
import { TierLegend } from './tiers'
import {
  quizSeedAt,
  TIER_COLOR,
  TIER_LABEL,
  TIER_WASH,
  tierAt,
  type VerseTier,
} from '@/lib/bibleProgress'
import {
  canonBook,
  chapterCount,
  effectiveVerseCount,
  noteRealVerseCount,
  shapeOf,
  verseReference,
} from '@/data/bible/structure'

// A chapter of the player's own Bible. Every verse the chapter has is on the
// page whether or not its text loaded, shaded by what the player has done with
// it: kept it, been quizzed on it, walked past it, or never been here.
//
// Opening this marks the chapter read — a footprint, not a claim to have
// understood it. Tapping a verse opens the one thing you can do with it: keep
// it, and play it when the arcade has questions for it.
export default function BibleChapterScreen() {
  const navigate = useNavigate()
  const juice = useJuice()
  const reduceMotion = useReducedMotion()
  const params = useParams()
  const [search] = useSearchParams()
  // A citation name in the URL still finds the book — /bible/Psalm/23 is
  // Psalms 23, and every link the app builds already uses the shelf name.
  const book = canonBook(decodeURIComponent(params.book ?? ''))
  const chapter = Number(params.chapter ?? 0)

  const readingCode = useSettings((s) => s.readingTranslation)
  const markChapterRead = useBible((s) => s.markChapterRead)
  const { marks } = useBibleMarks()

  const [text, setText] = useState<Chapter | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [open, setOpen] = useState<number | null>(null)
  const targetRef = useRef<HTMLDivElement | null>(null)

  const shape = shapeOf(book)
  const valid = !!shape && Number.isInteger(chapter) && chapter >= 1 && chapter <= chapterCount(book)

  // Opening a chapter is what "read" means, so it's recorded on arrival rather
  // than on a scroll-to-bottom — the promise is a map of where you've been.
  useEffect(() => {
    if (valid) markChapterRead(book, chapter)
  }, [valid, book, chapter, markChapterRead])

  useEffect(() => {
    if (!valid) return
    const ctrl = new AbortController()
    setState('loading')
    setText(null)
    fetchChapter(book, chapter, readingCode, ctrl.signal)
      .then((c) => {
        // Translations disagree about a few chapter endings; believe the one the
        // reader is actually holding over the shipped table.
        noteRealVerseCount(book, chapter, c.verses.length)
        setText(c)
        setState('ready')
      })
      .catch((e) => {
        if (ctrl.signal.aborted || (e as Error)?.name === 'AbortError') return
        setState('error')
      })
    return () => ctrl.abort()
  }, [valid, book, chapter, readingCode])

  // ?v=16 — arriving from a highlight or a recap brings that verse into view.
  const target = Number(search.get('v') ?? 0)
  useEffect(() => {
    if (!target || state === 'loading') return
    const t = setTimeout(() => {
      targetRef.current?.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })
    }, 140)
    return () => clearTimeout(t)
  }, [target, state, reduceMotion])

  const verses = useMemo(() => {
    if (!valid) return []
    const total = effectiveVerseCount(book, chapter)
    const byNumber = new Map(text?.verses.map((v) => [v.verse, v.text]) ?? [])
    const rows: { verse: number; body: string | null }[] = []
    for (let v = 1; v <= total; v++) rows.push({ verse: v, body: byNumber.get(v) ?? null })
    // A translation that runs past the table still shows every verse it sent.
    for (const v of text?.verses ?? []) {
      if (v.verse > total) rows.push({ verse: v.verse, body: v.text })
    }
    return rows
  }, [valid, book, chapter, text])

  if (!valid) {
    return (
      <Page noNav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <button className="pill" onClick={() => navigate('/bible')} aria-label="Back">✕</button>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>No such chapter</b>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="dim" style={{ fontSize: 14, lineHeight: 1.5 }}>
            {shape
              ? `${book} has ${chapterCount(book)} chapters.`
              : `There’s no book called “${book}” in the Bible.`}
          </p>
          <div style={{ marginTop: 14 }}>
            <Button variant="gold" full onClick={() => navigate('/bible')}>Back to contents</Button>
          </div>
        </div>
      </Page>
    )
  }

  const prev = chapter > 1 ? chapter - 1 : null
  const next = chapter < chapterCount(book) ? chapter + 1 : null

  return (
    <Page noNav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <button
          className="pill"
          onClick={() => navigate(`/bible/${encodeURIComponent(book)}`)}
          aria-label={`Back to ${book}`}
        >
          ←
        </button>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>{book} {chapter}</b>
        <span className="faint" style={{ fontSize: 11, marginLeft: 'auto' }}>
          {state === 'ready' && text ? text.translationName : `${verses.length} verses`}
        </span>
      </div>

      <div style={{ marginBottom: 12 }}>
        <TierLegend compact />
      </div>

      {state === 'error' && (
        <p className="faint center" style={{ fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
          The text couldn’t load right now, so this chapter is showing its verses without their
          words. Everything you’ve marked here is still here.
        </p>
      )}

      <div style={{ display: 'grid', gap: 2 }}>
        {verses.map(({ verse, body }) => {
          const tier = tierAt(book, chapter, verse, marks)
          const seed = quizSeedAt(book, chapter, verse)
          const isTarget = verse === target
          return (
            <div key={verse} ref={isTarget ? targetRef : undefined}>
              <button
                onClick={() => { juice.select(); setOpen(open === verse ? null : verse) }}
                aria-expanded={open === verse}
                aria-label={`${verseReference(book, chapter, verse)} — ${TIER_LABEL[tier]}`}
                style={{
                  display: 'flex',
                  gap: 10,
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  borderRadius: 'var(--r-sm)',
                  background: TIER_WASH[tier],
                  // A left rule carries the tier as shape as well as color, so
                  // the four states stay separable without relying on hue.
                  borderLeft: `3px solid ${tier === 'unread' ? 'transparent' : TIER_COLOR[tier]}`,
                  outline: isTarget ? '1px solid var(--gold)' : 'none',
                  cursor: 'pointer',
                  lineHeight: 1.55,
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 12,
                    minWidth: 20,
                    paddingTop: 3,
                    color: tier === 'unread' ? 'var(--ink-faint)' : 'var(--gold)',
                  }}
                >
                  {verse}
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 15,
                    color: tier === 'unread' ? 'var(--ink-dim)' : 'var(--ink)',
                  }}
                >
                  {body ?? (
                    <span className="faint" style={{ fontSize: 13, fontStyle: 'italic' }}>
                      {state === 'loading' ? '…' : `${verseReference(book, chapter, verse)}`}
                    </span>
                  )}
                  {seed && <span aria-hidden style={{ fontSize: 10, marginLeft: 6 }}>✨</span>}
                </span>
              </button>

              <AnimatePresence>
                {open === verse && (
                  <VerseActions
                    book={book}
                    chapter={chapter}
                    verse={verse}
                    tier={tier}
                    playable={seed?.reference ?? null}
                    onClose={() => setOpen(null)}
                  />
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        {prev !== null && (
          <Button
            variant="secondary"
            full
            onClick={() => navigate(`/bible/${encodeURIComponent(book)}/${prev}`)}
          >
            ← {chapter - 1}
          </Button>
        )}
        {next !== null && (
          <Button
            variant="secondary"
            full
            onClick={() => navigate(`/bible/${encodeURIComponent(book)}/${next}`)}
          >
            {chapter + 1} →
          </Button>
        )}
      </div>

      <div style={{ height: 40 }} />
    </Page>
  )
}

// What you can do with one verse. Deliberately two things: keep it, and play it
// when there are questions for it. No rating, no marking-as-done — the shading
// already records everything this feature records.
function VerseActions({
  book,
  chapter,
  verse,
  tier,
  playable,
  onClose,
}: {
  book: string
  chapter: number
  verse: number
  tier: VerseTier
  playable: string | null
  onClose: () => void
}) {
  const navigate = useNavigate()
  const juice = useJuice()
  const reference = verseReference(book, chapter, verse)
  const toggle = useFavorites((s) => s.toggle)
  // A range in the pool ("Romans 8:38-39") is kept under its own reference, so
  // the heart reflects whichever of the two covers this verse.
  const savedKey = playable && playable !== reference ? playable : reference
  const saved = useFavorites((s) => !!s.map[savedKey])
  const [full, setFull] = useState(false)

  const onSave = () => {
    const r = toggle(savedKey)
    if (r === 'full') {
      setFull(true)
      return
    }
    r === 'added' ? juice.coin() : juice.select()
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 34 }}
      style={{ overflow: 'hidden' }}
    >
      <div
        className="card"
        style={{ padding: 12, margin: '6px 0 8px', borderColor: TIER_COLOR[tier] }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 14 }}>{reference}</b>
          <span className="faint" style={{ fontSize: 11, marginLeft: 'auto' }}>{TIER_LABEL[tier]}</span>
          <button className="pill" style={{ padding: '2px 8px' }} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <button
            onClick={onSave}
            aria-pressed={saved}
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--r-pill)',
              border: `1px solid ${saved ? 'var(--gold)' : 'var(--stroke)'}`,
              background: saved ? 'rgba(255,210,63,0.12)' : 'var(--card)',
              color: saved ? 'var(--gold)' : 'var(--ink)',
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {saved ? '🔖 Kept in your Bible' : '🤍 Keep this verse'}
          </button>

          {playable ? (
            <button
              onClick={() => {
                juice.coin()
                navigate(`/study/focus?verse=${encodeURIComponent(playable)}`)
              }}
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--r-pill)',
                border: '1px solid var(--mint)',
                background: 'rgba(78,205,196,0.10)',
                color: 'var(--mint)',
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              ✨ Play this verse
            </button>
          ) : (
            // Most of the Bible has no quiz, and saying so plainly is kinder
            // than a disabled button: this verse isn't lesser, it's just here to
            // read for now.
            <p className="faint" style={{ fontSize: 12, lineHeight: 1.45, margin: 0 }}>
              No quiz for this verse yet — it’s here to read. More verses join the arcade over time.
            </p>
          )}

          {full && (
            <p className="faint" style={{ fontSize: 12, margin: 0 }}>
              Your highlights are full ({FAVORITES_CAP}). Remove one to keep another.
            </p>
          )}
        </div>
      </div>
    </motion.div>
  )
}
