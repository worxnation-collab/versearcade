import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/Button'
import { useJuice } from '@/juice/useJuice'
import { addDays } from '@/lib/date'
import { fetchDays, fillDays, type DayVerse, type VerseBackend, type WeekDay } from '@/store/churchAdmin'

// After a save: carry the verse across the rest of a series.
//
// The leader picks how far ("through Sun, Nov 30") and sees, before anything is
// written, exactly what will happen to every day in that run: the EMPTY days
// get the verse, and every day that ALREADY has one is listed by date and
// reference, untouched unless the leader ticks it. Nothing is replaced by
// default, and a ticked day is only replaced if it still holds the verse that
// was on screen (`fillDays` re-reads each day just before writing). So the one
// failure this panel must never have — silently overwriting a Sunday somebody
// prepared — needs two deliberate acts and a stale screen can't cause it.
//
// Copies carry the series name, and NOT the note: a note is about its day.

/** The range read caps at 42 days (0123), so a run never asks for more. */
const MAX_RUN = 42

export function SeriesCopyPanel({
  churchId,
  from,
  today,
  defaultUntil,
  verse,
  backend,
  onDone,
}: {
  churchId: string
  /** The day just saved; the run starts the day after. */
  from: string
  today: string
  defaultUntil: string
  verse: DayVerse
  backend: VerseBackend
  onDone: (text: string) => void
}) {
  const juice = useJuice()
  const first = addDays(from, 1) < today ? today : addDays(from, 1)
  const last = addDays(first, MAX_RUN - 1)
  const [until, setUntil] = useState(() => clamp(defaultUntil, first, last))
  const [days, setDays] = useState<WeekDay[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [replace, setReplace] = useState<Record<string, string>>({})
  const [mix, setMix] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    setDays(null)
    setFailed(false)
    setReplace({})
    fetchDays(churchId, first, span(first, until), backend).then((r) => {
      if (!alive) return
      if (r.ok) setDays(r.data)
      else setFailed(true)
    })
    return () => { alive = false }
  }, [churchId, first, until, backend])

  const empty = useMemo(() => (days ?? []).filter((d) => !d.verse).map((d) => d.date), [days])
  const taken = useMemo(() => (days ?? []).filter((d) => d.verse), [days])
  const replacing = Object.keys(replace).length
  const total = empty.length + replacing

  const go = async () => {
    if (!total) return
    setBusy(true)
    const targets = (days ?? []).filter((d) => !d.verse || d.date in replace).map((d) => d.date)
    const { filled, skipped } = await fillDays(churchId, targets, verse, mix, backend, replace)
    setBusy(false)
    juice.select?.()
    const parts = [`${verse.reference} is set on ${filled.length} more ${filled.length === 1 ? 'day' : 'days'}.`]
    if (skipped.length) parts.push(`${skipped.length} ${skipped.length === 1 ? 'day was' : 'days were'} changed since you looked and left alone.`)
    onDone(filled.length ? parts.join(' ') : 'Nothing was copied — those days changed since you looked, and were left alone.')
  }

  return (
    <div className="card" style={{ padding: 12, display: 'grid', gap: 10, background: 'var(--card-raised)', minWidth: 0 }}>
      <b style={{ fontSize: 13.5 }}>Use {verse.reference} for more days{verse.series ? ` of ${verse.series}` : ''}?</b>

      <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--ink-dim)' }}>
        Through
        <input type="date" value={until} min={first} max={last} onChange={(e) => e.target.value && setUntil(clamp(e.target.value, first, last))} />
      </label>

      {failed ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--coral)' }}>Couldn&rsquo;t check those days — try again in a moment.</p>
      ) : !days ? (
        <div className="skeleton" style={{ height: 40, borderRadius: 10 }} />
      ) : (
        <>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>
            {empty.length
              ? `${empty.length} empty ${empty.length === 1 ? 'day gets' : 'days get'} it (${pretty(first)} – ${pretty(until)}).`
              : `No empty days between ${pretty(first)} and ${pretty(until)}.`}
          </p>
          {taken.length > 0 && (
            <div style={{ display: 'grid', gap: 6 }}>
              <span className="faint" style={{ fontSize: 11.5, lineHeight: 1.45 }}>
                {taken.length === 1 ? 'This day already has a verse' : 'These days already have a verse'} and {taken.length === 1 ? 'stays' : 'stay'} as {taken.length === 1 ? 'it is' : 'they are'} unless you tick it:
              </span>
              {taken.map((d) => (
                <label key={d.date} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, minWidth: 0 }}>
                  <input
                    type="checkbox"
                    checked={d.date in replace}
                    onChange={(e) => setReplace((r) => {
                      const next = { ...r }
                      if (e.target.checked) next[d.date] = d.verse!.reference
                      else delete next[d.date]
                      return next
                    })}
                    style={{ width: 18, height: 18, flexShrink: 0 }}
                  />
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {pretty(d.date, true)} · {d.verse!.reference}{d.verse!.series ? ` · ${d.verse!.series}` : ''}
                    {d.date in replace && <b style={{ color: 'var(--coral)' }}> → replaced</b>}
                  </span>
                </label>
              ))}
            </div>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={mix} onChange={(e) => setMix(e.target.checked)} style={{ width: 18, height: 18, flexShrink: 0 }} />
            Mix the order of the questions and answers each day
          </label>
          <Button variant="secondary" full disabled={busy || !total} onClick={go}>
            {busy
              ? 'Copying…'
              : !total
                ? 'Nothing to copy'
                : `Copy to ${empty.length} ${empty.length === 1 ? 'day' : 'days'}${replacing ? ` and replace ${replacing}` : ''}`}
          </Button>
          <p className="faint" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45 }}>
            Copies keep the series name. Your note stays with the day you wrote it for.
          </p>
        </>
      )}
    </div>
  )
}

function clamp(d: string, lo: string, hi: string) {
  return d < lo ? lo : d > hi ? hi : d
}

/** Days from `a` through `b`, inclusive. */
function span(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)
  return Math.max(1, Math.round(ms / 86400000) + 1)
}

function pretty(iso: string, weekday = false): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString(undefined, weekday ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' })
}
