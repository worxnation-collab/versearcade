import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useJuice } from '@/juice/useJuice'
import { useSettings } from '@/store/settings'
import { useBible } from '@/store/bible'
import { useFavorites } from '@/store/favorites'
import { fetchChapter, type Chapter } from '@/lib/bible'
import { FAVORITES_CAP } from '@/lib/favorites'
import { useBibleMarks } from './useBibleMarks'
import { BookHeader, BookPage } from './BookPage'
import { PaperCard, TierLegend } from './tiers'
import { PAPER, PAPER_TIER } from './paper'
import { quizSeedAt, TIER_LABEL, tierAt, type VerseTier } from '@/lib/bibleProgress'
import {
  canonBook,
  chapterCount,
  effectiveVerseCount,
  noteRealVerseCount,
  shapeOf,
  verseReference,
} from '@/data/bible/structure'

// A chapter of the player's own Bible, set as a page: every verse the chapter
// has is here whether or not its text loaded, shaded by what the player has done
// with it — kept it, been quizzed on it, walked past it, or never been here.
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
  const book = canonBook(decodeURIComponent(params.book ?? ''))
  const chapter = Number(params.chapter ?? 0)

  const readingCode = useSettings((s) => s.readingTranslation)
  const markChapterRead = useBible((s) => s.markChapterRead)
  const { marks } = useBibleMarks()

  const [text, setText] = useState<Chapter | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [open, setOpen] = useState<number | null>(null)
  // Which way the last chapter move went, so the page slides the right way.
  const [turn, setTurn] = useState<-1 | 0 | 1>(0)
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
    setOpen(null)
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
    }, 160)
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
      <BookPage
        header={<BookHeader onBack={() => navigate('/bible')} backLabel="Back to contents" title="No such chapter" />}
      >
        <PaperCard>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: PAPER.inkDim, margin: 0 }}>
            {shape
              ? `${book} has ${chapterCount(book)} chapters.`
              : `There’s no book called “${book}” in the Bible.`}
          </p>
        </PaperCard>
      </BookPage>
    )
  }

  const prev = chapter > 1 ? chapter - 1 : null
  const next = chapter < chapterCount(book) ? chapter + 1 : null
  const goto = (c: number, dir: -1 | 1) => {
    juice.whoosh()
    setTurn(dir)
    navigate(`/bible/${encodeURIComponent(book)}/${c}`)
  }

  return (
    <BookPage
      pageKey={`${book}-${chapter}`}
      turn={turn}
      header={
        <BookHeader
          onBack={() => navigate(`/bible/${encodeURIComponent(book)}`)}
          backLabel={`Back to ${book}`}
          title={`${book} ${chapter}`}
          note={state === 'ready' && text ? text.translationName : `${verses.length} verses`}
        />
      }
    >
      {/* Only the two states that can differ on this page — everything else
          here is read by definition, which is why it isn't shaded. */}
      <div style={{ marginBottom: 12 }}>
        <TierLegend only={['saved', 'studied']} />
      </div>

      {state === 'error' && (
        <p style={{ fontSize: 12, marginBottom: 12, lineHeight: 1.5, textAlign: 'center', color: PAPER.inkFaint }}>
          The text couldn’t load right now, so this chapter is showing its verses without their
          words. Everything you’ve marked here is still here.
        </p>
      )}

      <div style={{ display: 'grid', gap: 1 }}>
        {verses.map(({ verse, body }) => {
          const tier = tierAt(book, chapter, verse, marks)
          // Opening this chapter marked every verse in it read, so washing them
          // all would say nothing and turn the page into stripes. Inside a
          // chapter you've opened, `read` IS the page — what earns a mark here
          // is a verse you kept or were quizzed on. The state is still announced
          // to screen readers, and still tints the chapter tile back in the
          // grid, where it does discriminate.
          const paint: VerseTier = tier === 'read' ? 'unread' : tier
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
                  gap: 9,
                  width: '100%',
                  textAlign: 'left',
                  padding: '7px 10px 7px 8px',
                  borderRadius: 6,
                  background: PAPER_TIER[paint].wash,
                  // A left rule carries the tier as shape as well as color, so
                  // the states stay separable without relying on hue.
                  borderLeft: `3px solid ${PAPER_TIER[paint].rule}`,
                  outline: isTarget ? `1px solid ${PAPER_TIER.saved.rule}` : 'none',
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 11,
                    minWidth: 18,
                    paddingTop: 4,
                    color: PAPER.accent,
                    opacity: paint === 'unread' ? 0.75 : 1,
                  }}
                >
                  {verse}
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 16,
                    lineHeight: 1.62,
                    color: PAPER.ink,
                  }}
                >
                  {body ?? (
                    <span style={{ fontSize: 13, fontStyle: 'italic', color: PAPER.inkFaint }}>
                      {state === 'loading' ? '…' : verseReference(book, chapter, verse)}
                    </span>
                  )}
                  {seed && <span aria-hidden style={{ fontSize: 10, marginLeft: 5 }}>✨</span>}
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

      <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
        {prev !== null && <TurnButton label={`← ${prev}`} onClick={() => goto(prev, -1)} />}
        {next !== null && <TurnButton label={`${next} →`} onClick={() => goto(next, 1)} />}
      </div>
    </BookPage>
  )
}

function TurnButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '12px 14px',
        borderRadius: 12,
        border: `1px solid ${PAPER.rule}`,
        background: 'rgba(255,255,255,0.5)',
        color: PAPER.inkDim,
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 15,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
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
      <PaperCard
        accent={tier === 'unread' ? PAPER.rule : PAPER_TIER[tier].rule}
        style={{ padding: 12, margin: '6px 0 8px', background: 'rgba(255,255,255,0.68)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: PAPER.ink }}>{reference}</b>
          <span style={{ fontSize: 11, color: PAPER.inkFaint, marginLeft: 'auto' }}>{TIER_LABEL[tier]}</span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 24, height: 24, borderRadius: '50%', border: `1px solid ${PAPER.rule}`,
              background: 'none', color: PAPER.inkDim, fontSize: 12, cursor: 'pointer',
              display: 'grid', placeItems: 'center',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <button
            onClick={onSave}
            aria-pressed={saved}
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--r-pill)',
              border: `1px solid ${saved ? PAPER_TIER.saved.rule : PAPER.rule}`,
              background: saved ? 'rgba(255,196,0,0.30)' : 'rgba(255,255,255,0.6)',
              color: PAPER.ink,
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
                border: `1px solid ${PAPER_TIER.studied.rule}`,
                background: 'rgba(31,110,130,0.14)',
                color: PAPER_TIER.studied.rule,
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
            <p style={{ fontSize: 12, lineHeight: 1.45, margin: 0, color: PAPER.inkFaint }}>
              No quiz for this verse yet — it’s here to read. More verses join the arcade over time.
            </p>
          )}

          {full && (
            <p style={{ fontSize: 12, margin: 0, color: PAPER.inkFaint }}>
              Your highlights are full ({FAVORITES_CAP}). Remove one to keep another.
            </p>
          )}
        </div>
      </PaperCard>
    </motion.div>
  )
}
