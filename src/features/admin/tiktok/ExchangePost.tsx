// The exchange: he opens, two figures out of the text ask and answer each
// other, the answer lands as one whole-frame word, and he closes on a
// question. Three a week — which exchange a date gets is derived from the
// calendar, so this card SHOWS the pick rather than choosing it.
//
// The one thing this card does that the others do not is tell you, before you
// press anything, whether the day's two takes are parked. An exchange is the
// one post here with no synthetic fallback worth having (`makeExchange`
// refuses rather than making a thin one), so "you have not recorded this yet"
// is the most useful thing the card can say.

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/Button'
import { todayLocalDate } from '@/lib/date'
import { makeExchange as makeExchangePost } from './make'
import { EXCHANGES, exchangeForDate, isExchangeDay, voiceFor, type Exchange } from '@/data/tiktokExchanges'
import {
  useDisplayFont, DateRow, Busy, MadeCard, fetchVoice, skinPath,
  type Made,
} from './shared'

/** The next few dates that actually carry an exchange, so the batch button means something. */
function nextExchangeDays(from: string, n: number): string[] {
  const out: string[] = []
  const [y, m, d] = from.split('-').map(Number)
  for (let i = 0; out.length < n && i < 40; i++) {
    const day = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10)
    if (isExchangeDay(day)) out.push(day)
  }
  return out
}

export default function ExchangePost() {
  useDisplayFont()
  const [date, setDate] = useState(todayLocalDate())
  const [pick, setPick] = useState<string>('')
  const [takes, setTakes] = useState<{ open: boolean; close: boolean } | null>(null)
  const [withCopy, setWithCopy] = useState(true)
  const [withMusic, setWithMusic] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [made, setMade] = useState<Made[]>([])
  const cancel = useRef(false)

  const auto = exchangeForDate(date)
  const e: Exchange | null = (pick ? EXCHANGES.find((x) => x.id === pick) : null) ?? auto

  // Are both takes parked? Asked on every date change, because it is the only
  // thing that decides whether this day can be made at all.
  useEffect(() => {
    let live = true
    setTakes(null)
    ;(async () => {
      const [o, c] = await Promise.all([
        fetchVoice(date, 'exchange').catch(() => null),
        fetchVoice(date, 'exchange-close').catch(() => null),
      ])
      if (live) setTakes({ open: !!o, close: !!c })
    })()
    return () => { live = false }
  }, [date])

  const run = async (dates: string[]) => {
    if (busy) return
    cancel.current = false
    setErr(null)
    try {
      for (const d of dates) {
        if (cancel.current) break
        setProgress(0)
        const m = await makeExchangePost(d, { pick: pick || undefined, copy: withCopy, music: withMusic },
          (f, label) => { setProgress(f); setBusy(`${d}: ${label}`) })
        setMade((xs) => [m, ...xs.filter((x) => x.date !== d)])
      }
    } catch (e2) {
      setErr(String((e2 as Error).message || e2))
    } finally {
      setBusy(null)
    }
  }

  const ready = !!takes?.open && !!takes?.close
  return (
    <div>
      <div className="card" style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
        <DateRow date={date} setDate={setDate} homeDate={todayLocalDate()} />
        {!isExchangeDay(date) && (
          <p className="faint" style={{ fontSize: 12 }}>
            Not an exchange day — these run Monday, Wednesday and Friday. Pick one below to make it anyway.
          </p>
        )}
        {e ? (
          <>
            <div>
              <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>{e.hook}</b>
              <span className="faint" style={{ fontSize: 12, marginLeft: 8 }}>· {e.reference}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src={skinPath(e.asker)} alt="" style={{ height: 96 }} />
              <div style={{ flex: 1, fontSize: 13, lineHeight: 1.45 }}>
                <p><b className="faint" style={{ fontSize: 11 }}>{e.asker} · {voiceFor(e.asker).voice}</b><br />{e.question}</p>
                <p style={{ marginTop: 6 }}><b className="faint" style={{ fontSize: 11 }}>{e.answerer} · {voiceFor(e.answerer).voice}</b><br />{e.answer}</p>
              </div>
              <img src={skinPath(e.answerer)} alt="" style={{ height: 96 }} />
            </div>
            <div style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 34, color: 'var(--gold)' }}>
              {e.payoff}{e.payoffNote && <span style={{ fontSize: 15, color: 'var(--ink)', marginLeft: 8 }}>{e.payoffNote}</span>}
            </div>
            {/* What he has to have recorded, and whether he has. */}
            <div style={{ display: 'grid', gap: 6, fontSize: 12, lineHeight: 1.45 }}>
              <div><b className="faint" style={{ fontSize: 11 }}>{takes ? (takes.open ? '✓ opening take parked' : '· opening take — not recorded') : '· checking…'}</b><br />{e.open}</div>
              <div><b className="faint" style={{ fontSize: 11 }}>{takes ? (takes.close ? '✓ closing take parked' : '· closing take — not recorded') : '· checking…'}</b><br />{e.close}</div>
            </div>
          </>
        ) : <p className="faint" style={{ fontSize: 12 }}>No exchange for this date.</p>}
        <select value={pick} onChange={(ev) => setPick(ev.target.value)}>
          <option value="">{auto ? `Auto: ${auto.id}` : 'Auto: none for this date'}</option>
          {EXCHANGES.map((x) => <option key={x.id} value={x.id}>{x.id} — {x.asker} → {x.answerer}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <label className="faint" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={withCopy} onChange={(ev) => setWithCopy(ev.target.checked)} /> caption too
          </label>
          <label className="faint" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={withMusic} onChange={(ev) => setWithMusic(ev.target.checked)} /> music underneath
          </label>
        </div>
        {!ready && takes && (
          <p className="faint" style={{ fontSize: 12 }}>
            An exchange is voiced at both ends by design, so this one cannot be made until both takes are up.
            Record them in Your voice and upload them for this date.
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="gold" disabled={!!busy || !e || !ready} onClick={() => run([date])}>{busy ? 'Working…' : '💬 Make this exchange'}</Button>
          <button className="pill" disabled={!!busy} onClick={() => run(nextExchangeDays(date, 3))}>Next 3 exchange days</button>
          {busy && <button className="pill" onClick={() => { cancel.current = true }}>Stop after this one</button>}
        </div>
        <Busy busy={busy} progress={progress} />
        {err && <p style={{ color: 'var(--coral)', fontSize: 13 }}>{err}</p>}
      </div>

      {made.map((m) => <MadeCard key={m.date} m={m} />)}
    </div>
  )
}
