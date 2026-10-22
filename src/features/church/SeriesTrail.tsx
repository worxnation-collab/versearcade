import { seriesPosition, type ChurchSeries } from '@/store/churchVerse'

// A church series drawn as the run of days it is (0130) — the church tab, the
// Play tab's church box and the /play/church result all use this one, so a
// series reads the same everywhere and can't drift between them.
//
//   "Day 3 of 5 · Fruit of the Spirit", then one cell per day: ✓ where you
//   played, a ring on today, the rest plain.
//
// A past day you didn't play is drawn exactly like a day still to come —
// neutral, never red, never "missed". It is your own record and nobody else's,
// and a series that scolds you for Tuesday is a series you stop opening.
// Future days show their weekday only: the reference arrives with the day.
export function SeriesTrail({ series, compact = false }: { series: ChurchSeries; compact?: boolean }) {
  const pos = seriesPosition(series)
  const headline = seriesHeadline(series)

  if (compact) {
    return (
      <span className="faint" style={{ fontSize: 12 }}>
        {headline}
      </span>
    )
  }

  const seen = series.days.filter((d) => d.reference)
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 800, overflowWrap: 'anywhere' }}>{headline}</div>
      <div
        role="list"
        aria-label={`${series.name}: ${series.days.length} days${pos.played ? `, you've played ${pos.played}` : ''}`}
        style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(series.days.length, 7)}, minmax(0, 1fr))`, gap: 4 }}
      >
        {series.days.map((d, i) => (
          <div
            key={d.date}
            role="listitem"
            aria-label={`Day ${i + 1}, ${weekday(d.date)}${d.today ? ', today' : ''}${d.played ? ', played' : ''}${d.reference ? `, ${d.reference}` : ''}`}
            style={{ display: 'grid', justifyItems: 'center', gap: 3, minWidth: 0 }}
          >
            <span
              aria-hidden
              style={{
                width: 26, height: 26, borderRadius: 999, display: 'grid', placeItems: 'center',
                fontSize: 12, fontWeight: 800,
                background: d.played ? 'var(--mint)' : 'var(--card-raised)',
                color: d.played ? 'var(--bg-0)' : d.date <= series.today ? 'var(--ink-dim)' : 'var(--ink-faint)',
                boxShadow: d.today ? '0 0 0 2px var(--gold)' : 'inset 0 0 0 1px var(--edge)',
              }}
            >
              {d.played ? '✓' : i + 1}
            </span>
            <span style={{ fontSize: 10, color: d.today ? 'var(--ink)' : 'var(--ink-faint)', fontWeight: d.today ? 800 : 600 }}>
              {d.today ? 'Today' : weekday(d.date)}
            </span>
          </div>
        ))}
      </div>
      {seen.length > 0 && (
        <div className="faint" style={{ fontSize: 11.5, lineHeight: 1.45, overflowWrap: 'anywhere' }}>
          So far:{' '}
          {seen.map((d) => d.reference).join(' · ')}
          {pos.next ? ` · next ${weekday(pos.next.date)}` : ''}
        </div>
      )}
    </div>
  )
}

/** "Day 3 of 5 · Name", or where the series stands on a day it has no verse. */
export function seriesHeadline(s: ChurchSeries): string {
  const pos = seriesPosition(s)
  if (pos.day) return `Day ${pos.day} of ${pos.total} · ${s.name}`
  if (!pos.started) return `${s.name} starts ${weekday(s.days[0].date)}`
  if (pos.next) return `${s.name} · no verse today, back ${weekday(pos.next.date)}`
  return `${s.name} · finished`
}

function weekday(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short' })
}
