import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Icon } from '@/data/icons'
import { useJuice } from '@/juice/useJuice'
import { todayLocalDate } from '@/lib/date'
import { WESTERN_NOTE, liturgyFor, nextFeast, yearOf, type FeastDef } from '@/data/liturgy'
import { VERSE_POOL } from '@/data/bible/pool'

// The church year, as a place you can stand in.
//
// It carries NO number and nothing countable — no days-observed, no streak of
// seasons kept, no "you've seen 4 of 10 feasts". A calendar with a score on it
// is the progress screen the map rule already forbids, and this one would be
// worse: a tally of religious observance is the single most shaming number
// this app could invent. What it does is say what today is, what is coming,
// and what happened on each day.
//
// Read `data/liturgy.ts` before adding a day to it. The list is deliberately
// only what traditions broadly share, and the Western reckoning is named
// rather than assumed — both are load-bearing, not tidiness.
export default function CalendarScreen() {
  const navigate = useNavigate()
  const juice = useJuice()
  const today = todayLocalDate()
  const day = useMemo(() => liturgyFor(today), [today])
  const next = useMemo(() => nextFeast(today), [today])
  const year = useMemo(() => yearOf(today), [today])

  return (
    <Page>
      <div className="center" style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 26 }}>The church year</h1>
        <p className="dim" style={{ marginTop: 2, fontSize: 13 }}>
          What today is, and what is coming. Nothing here is scored.
        </p>
      </div>

      {/* ── Today ──────────────────────────────────────────────────────────
          The season always; the day's own name only when it has one. */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="card"
        style={{ marginBottom: 14, borderColor: day.feast ? 'var(--edge)' : undefined }}
      >
        <div
          className="faint"
          style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 800 }}
        >
          Today
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <span
            aria-hidden
            style={{
              width: 12, height: 34, borderRadius: 4, flexShrink: 0,
              background: day.season.hex, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.35)',
            }}
          />
          <div style={{ minWidth: 0 }}>
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 20, display: 'block' }}>
              {day.feast ? day.feast.name : day.season.name}
            </b>
            <span className="faint" style={{ fontSize: 12.5 }}>
              {day.feast ? `in ${day.season.name}` : day.season.line}
            </span>
          </div>
        </div>
        {day.feast && (
          <p className="dim" style={{ margin: '12px 0 0', fontSize: 14, lineHeight: 1.5 }}>
            {day.feast.line}
          </p>
        )}
        <VerseLine feast={day.feast} />
      </motion.div>

      {/* ── What's coming ─────────────────────────────────────────────────
          One row, not a countdown grid. "In 34 days" is a fact about the
          calendar; a bar filling toward it would be a thing to be behind on. */}
      {next && (
        <div className="card" style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'var(--edge)', lineHeight: 0, flexShrink: 0 }}>
            <Icon id="calendar" size={20} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ fontSize: 14.5 }}>{next.feast.name}</b>
            <div className="faint" style={{ fontSize: 12 }}>
              {next.inDays === 1 ? 'tomorrow' : `in ${next.inDays} days`} · {formatDate(next.date)}
            </div>
          </div>
        </div>
      )}

      {/* ── The year ──────────────────────────────────────────────────────── */}
      <h3 className="dim" style={{ fontSize: 16, margin: '0 0 10px' }}>
        {today.slice(0, 4)}
      </h3>
      <div style={{ display: 'grid', gap: 7, marginBottom: 16 }}>
        {year.map(({ date, feast }) => {
          const past = date < today
          const isToday = date === today
          return (
            <div
              key={feast.id}
              className="card"
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px',
                opacity: past ? 0.55 : 1,
                borderColor: isToday ? 'var(--edge)' : undefined,
              }}
            >
              <span
                className="faint"
                style={{ fontSize: 11.5, width: 52, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
              >
                {formatDate(date)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: 14 }}>{feast.name}</b>
                <div className="faint" style={{ fontSize: 12, lineHeight: 1.4 }}>{feast.line}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* The reckoning, named. This is not a footnote — see data/liturgy.ts. */}
      <p className="faint" style={{ fontSize: 11, lineHeight: 1.5, marginBottom: 10 }}>
        {WESTERN_NOTE}
      </p>
      <p className="faint" style={{ fontSize: 11, lineHeight: 1.5 }}>
        Only the days kept broadly across traditions are here, and none of them asks anything of you —
        this says what a day is, never what to do on it.
      </p>

      <div style={{ marginTop: 16 }}>
        <button
          className="pill"
          onClick={() => { juice.select?.(); navigate('/play') }}
          style={{ padding: '10px 16px' }}
        >
          ← Back to today’s verse
        </button>
      </div>
      <div style={{ height: 80 }} />
    </Page>
  )
}

/** The day's verse, when the pool carries one and it is safe to quote. */
function VerseLine({ feast }: { feast?: FeastDef }) {
  const hit = useMemo(() => {
    if (!feast?.reference) return null
    return VERSE_POOL.find((v) => v.reference === feast.reference) ?? null
  }, [feast])
  if (!feast?.reference) return null
  return (
    <div
      style={{
        marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--stroke)',
        fontSize: 13.5, lineHeight: 1.55,
      }}
    >
      <div className="faint" style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 800 }}>
        {feast.reference}
      </div>
      {/* A reference the pool does not carry shows the reference alone, exactly
          as the player card's favourite verse does — never a blank quote. */}
      {hit && <p style={{ margin: '5px 0 0' }} className="dim">“{hit.text}”</p>}
    </div>
  )
}

function formatDate(d: string) {
  const [, m, day] = d.split('-')
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${MONTHS[Number(m) - 1]} ${Number(day)}`
}
