import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useBookAccuracy } from '@/store/bookAccuracy'
import { useJuice } from '@/juice/useJuice'
import {
  MIN_ANSWERS_FOR_TIER,
  TIERS,
  accuracyPct,
  reviewOrder,
  summarize,
  tierOf,
  type BookStat,
} from '@/lib/bookAccuracy'

// The review chart — the Study tab's "what should I look at next?" panel.
//
// Every book you've answered questions about, ranked weakest first, each as a
// meter of how much of it you're getting right. It's a review tool, not a score:
// tapping a row drops you straight into Focus practice on that book, which is
// the only action the chart is trying to produce.
//
// Form notes: one measure (accuracy) per named category, so it's a horizontal
// bar list rather than anything fancier — thin 10px meters, rounded data end,
// value at the tip. The three tier colors are a status palette (never a
// value-ramp), and each row spells its tier out in text, so nothing is carried
// by color alone.

const COLLAPSED_ROWS = 5

export function BookAccuracyChart() {
  const navigate = useNavigate()
  const juice = useJuice()
  const stats = useBookAccuracy((s) => s.stats)
  const loaded = useBookAccuracy((s) => s.loaded)
  const load = useBookAccuracy((s) => s.load)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    load()
  }, [load])

  const rows = useMemo(() => reviewOrder(stats), [stats])
  const summary = useMemo(() => summarize(stats), [stats])

  const drill = (book: string) => {
    juice.coin()
    navigate(`/study/focus?book=${encodeURIComponent(book)}`)
  }

  if (!loaded || rows.length === 0) {
    return (
      <div className="card" style={{ marginTop: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 30 }}>📊</div>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 16, display: 'block', marginTop: 6 }}>
          Your book accuracy
        </b>
        <p className="faint" style={{ fontSize: 13, marginTop: 6, lineHeight: 1.45 }}>
          {loaded
            ? 'Answer some questions and every book you touch shows up here — so you can see which ones are solid and which want another look.'
            : 'Reading your answers…'}
        </p>
      </div>
    )
  }

  const shown = expanded ? rows : rows.slice(0, COLLAPSED_ROWS)
  const hidden = rows.length - shown.length

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card"
      style={{ marginTop: 16, padding: 16 }}
      aria-label="Accuracy by book"
    >
      {/* Header: the one headline number, then what the list is for. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>📊</span>
            <b style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17 }}>Accuracy by book</b>
          </div>
          <p className="faint" style={{ fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>
            Weakest first · tap a book to drill it
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, lineHeight: 1 }}>{summary.pct}%</div>
          <div className="faint" style={{ fontSize: 11, marginTop: 3 }}>
            {summary.correct}/{summary.answered} overall
          </div>
        </div>
      </div>

      {/* The one thing to do next, named. */}
      {summary.weakest && (
        <div
          style={{
            marginTop: 12,
            padding: '9px 12px',
            borderRadius: 'var(--r-sm)',
            background: 'rgba(255,210,63,0.08)',
            border: '1px solid rgba(255,210,63,0.28)',
            fontSize: 12.5,
            lineHeight: 1.4,
          }}
        >
          <b style={{ color: 'var(--gold)' }}>Next up:</b>{' '}
          <span className="dim">
            {summary.weakest.book} is your softest spot at {accuracyPct(summary.weakest)}%
            {summary.best ? ` — ${summary.best.book} is your strongest at ${accuracyPct(summary.best)}%.` : '.'}
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
        {shown.map((s, i) => (
          <BookRow key={s.book} stat={s} index={i} onDrill={() => drill(s.book)} />
        ))}
      </div>

      {hidden > 0 && (
        <button
          onClick={() => setExpanded(true)}
          style={{ marginTop: 12, width: '100%', fontSize: 12.5, fontWeight: 700, color: 'var(--gold)', padding: 4 }}
        >
          Show {hidden} more book{hidden === 1 ? '' : 's'} ▾
        </button>
      )}
      {expanded && rows.length > COLLAPSED_ROWS && (
        <button
          onClick={() => setExpanded(false)}
          style={{ marginTop: 12, width: '100%', fontSize: 12.5, fontWeight: 700, color: 'var(--ink-dim)', padding: 4 }}
        >
          Show less ▴
        </button>
      )}

      <p className="faint" style={{ fontSize: 11, marginTop: 12, lineHeight: 1.4 }}>
        Counts every question you answer — daily drops, practice, focus drills, reviews and battles alike. A book needs{' '}
        {MIN_ANSWERS_FOR_TIER} answers before it gets rated.
      </p>
    </motion.section>
  )
}

function BookRow({ stat, index, onDrill }: { stat: BookStat; index: number; onDrill: () => void }) {
  const tier = tierOf(stat)
  const { label, color } = TIERS[tier]
  const pct = accuracyPct(stat)

  return (
    <motion.button
      whileTap={{ scale: 0.985 }}
      onClick={onDrill}
      aria-label={`${stat.book}: ${pct}% accuracy, ${stat.correct} of ${stat.answered} correct — ${label}. Drill this book.`}
      style={{ display: 'block', width: '100%', textAlign: 'left', padding: 0 }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <b
          style={{
            flex: 1,
            minWidth: 0,
            fontWeight: 800,
            fontSize: 14.5,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {stat.book}
        </b>
        {/* Value at the tip of the bar — this list has no axis, so the number
            beside each meter is what carries the reading. */}
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>
          {pct}%
        </span>
      </div>

      {/* The meter: fill carries the tier, the track is the same hue held back. */}
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${stat.book} accuracy`}
        style={{
          marginTop: 5,
          height: 10,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.09)',
          overflow: 'hidden',
        }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 90, damping: 20, delay: 0.04 * index }}
          style={{ height: '100%', background: color, borderRadius: '0 4px 4px 0' }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: color, flexShrink: 0 }} aria-hidden />
        <span className="dim" style={{ fontSize: 11.5, fontWeight: 700 }}>{label}</span>
        <span className="faint" style={{ fontSize: 11.5 }}>
          · {stat.correct}/{stat.answered} correct
        </span>
        <span style={{ flex: 1 }} />
        <span className="faint" style={{ fontSize: 11.5, color: 'var(--gold)' }}>🎯 Drill</span>
      </div>
    </motion.button>
  )
}
