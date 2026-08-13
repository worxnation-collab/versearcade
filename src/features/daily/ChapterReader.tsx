import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { DailyVerse } from '@/types'
import { fetchChapter, type Chapter } from '@/lib/bible'

// A full-screen chapter reader: the day's verse shown in its surrounding
// context, with the verse itself highlighted and scrolled into view. Opened from
// the result recap so a player can dive deeper right after finishing.
//
// The full chapter is fetched live from the configured translation (bible-api).
// If that fails (offline / API down) we fall back to the single verse plus the
// before/after context prose the verse already carries — so the reader is always
// useful, even offline.
export function ChapterReader({ verse, onClose }: { verse: DailyVerse; onClose: () => void }) {
  const reduceMotion = useReducedMotion()
  const [chapter, setChapter] = useState<Chapter | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const firstHi = useRef<HTMLDivElement | null>(null)

  const start = verse.verseStart
  const end = verse.verseEnd ?? verse.verseStart
  const isHi = (n: number) => n >= start && n <= end

  useEffect(() => {
    const ctrl = new AbortController()
    setState('loading')
    fetchChapter(verse.book, verse.chapter, verse.translation, ctrl.signal)
      .then((c) => {
        setChapter(c)
        setState('ready')
      })
      .catch((e) => {
        if (ctrl.signal.aborted || (e as Error)?.name === 'AbortError') return
        setState('error')
      })
    return () => ctrl.abort()
  }, [verse.book, verse.chapter, verse.translation])

  // Once the chapter renders, bring the highlighted verse into view.
  useEffect(() => {
    if (state !== 'ready') return
    const t = setTimeout(() => {
      firstHi.current?.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })
    }, 120)
    return () => clearTimeout(t)
  }, [state, reduceMotion])

  // Close on Escape (desktop / hardware keyboards).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const chapterLabel = `${verse.book} ${verse.chapter}`

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { y: '100%' }}
      animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { y: '100%' }}
      transition={{ type: 'spring', stiffness: 300, damping: 32 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'linear-gradient(180deg, var(--bg-1), var(--bg-0))',
        display: 'flex',
        flexDirection: 'column',
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`${chapterLabel} — full chapter`}
    >
      {/* Sticky header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: 'calc(var(--safe-top) + 12px) 16px 12px',
          borderBottom: '1px solid var(--stroke)',
          background: 'rgba(11,7,32,0.6)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            border: '1px solid var(--stroke)',
            background: 'var(--card)',
            color: 'var(--ink)',
            fontSize: 20,
            flexShrink: 0,
            cursor: 'pointer',
          }}
        >
          ←
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, lineHeight: 1.1 }}>{chapterLabel}</div>
          <div className="faint" style={{ fontSize: 12 }}>
            {chapter?.translationName ?? verse.translation} · {verse.reference} highlighted
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 16px calc(var(--safe-bottom) + 96px)' }}>
          {state === 'loading' && <ChapterSkeleton />}

          {state === 'ready' && chapter && (
            <div style={{ display: 'grid', gap: 2 }}>
              {chapter.verses.map((v) => {
                const hi = isHi(v.verse)
                return (
                  <div
                    key={v.verse}
                    ref={hi && v.verse === start ? firstHi : undefined}
                    style={{
                      display: 'flex',
                      gap: 10,
                      padding: hi ? '10px 12px' : '4px 2px',
                      borderRadius: hi ? 12 : 0,
                      background: hi ? 'rgba(255,210,63,0.12)' : 'transparent',
                      boxShadow: hi ? 'inset 0 0 0 1px rgba(255,210,63,0.4)' : 'none',
                      borderLeft: hi ? '3px solid var(--gold)' : '3px solid transparent',
                      scrollMarginTop: 80,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 12,
                        lineHeight: '1.9',
                        color: hi ? 'var(--gold)' : 'var(--ink-faint)',
                        minWidth: 20,
                        textAlign: 'right',
                        flexShrink: 0,
                        fontWeight: hi ? 800 : 600,
                      }}
                    >
                      {v.verse}
                    </span>
                    <span
                      style={{
                        fontSize: 16.5,
                        lineHeight: 1.65,
                        color: hi ? 'var(--ink)' : 'var(--ink-dim)',
                        fontWeight: hi ? 600 : 400,
                      }}
                    >
                      {v.text}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {state === 'error' && (
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 30 }}>📖</div>
              <p style={{ margin: '8px 0 4px', fontWeight: 700 }}>Couldn’t load the full chapter</p>
              <p className="faint" style={{ fontSize: 13 }}>
                You may be offline. Here’s the verse in context from what we have saved.
              </p>
              <div className="card" style={{ marginTop: 14, textAlign: 'left', borderColor: 'var(--gold)', background: 'rgba(255,210,63,0.10)' }}>
                <b style={{ fontFamily: 'var(--font-display)' }}>{verse.reference}</b>
                <p style={{ marginTop: 6, lineHeight: 1.6 }}>“{verse.text}”</p>
              </div>
            </div>
          )}

          {/* "In context" — a human summary + facts. Always shown: it complements
              the full chapter, and carries the reader when offline. */}
          <ContextPanel verse={verse} />
        </div>
      </div>

      {/* Bottom close bar */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: `12px 16px calc(var(--safe-bottom) + 12px)`,
          background: 'linear-gradient(180deg, transparent, var(--bg-0) 40%)',
          pointerEvents: 'none',
        }}
      >
        <button
          onClick={onClose}
          style={{
            pointerEvents: 'auto',
            width: '100%',
            padding: '14px',
            borderRadius: 'var(--r-pill)',
            border: 'none',
            fontFamily: 'var(--font-display)',
            fontSize: 16,
            fontWeight: 800,
            color: '#2a1a00',
            background: 'linear-gradient(180deg, #ffe27a, var(--gold))',
            boxShadow: 'var(--shadow-soft)',
            cursor: 'pointer',
          }}
        >
          Done reading
        </button>
      </div>
    </motion.div>
  )
}

function ContextPanel({ verse }: { verse: DailyVerse }) {
  const hasBefore = !!verse.contextBefore
  const hasAfter = !!verse.contextAfter
  const fact = verse.facts?.[0]
  if (!verse.theme && !hasBefore && !hasAfter && !fact) return null
  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, marginBottom: 8 }}>In context</div>
      {verse.theme && (
        <span className="pill" style={{ marginBottom: 10 }}>
          {verse.theme}
        </span>
      )}
      {hasBefore && (
        <p style={{ fontSize: 13.5, lineHeight: 1.55, marginTop: 8 }}>
          <b style={{ color: 'var(--ink-dim)' }}>Just before · </b>
          <span className="dim">{verse.contextBefore}</span>
        </p>
      )}
      {hasAfter && (
        <p style={{ fontSize: 13.5, lineHeight: 1.55, marginTop: 8 }}>
          <b style={{ color: 'var(--ink-dim)' }}>Right after · </b>
          <span className="dim">{verse.contextAfter}</span>
        </p>
      )}
      {fact && (
        <p className="faint" style={{ fontSize: 13, marginTop: 12 }}>
          💡 {fact}
        </p>
      )}
    </div>
  )
}

function ChapterSkeleton() {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 16, width: `${70 + ((i * 7) % 28)}%` }} />
      ))}
    </div>
  )
}
