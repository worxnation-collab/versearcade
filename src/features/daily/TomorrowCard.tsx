import { useEffect, useState } from 'react'
import { useJuice } from '@/juice/useJuice'
import { addDays } from '@/lib/date'
import { dailyTriviaBook } from '@/data/bible/questions'
import { useReminders } from '@/store/reminders'

// "Tomorrow" — the end of a new player's first sessions (2026-10-30).
//
// Production: 43% of everybody who has finished a first verse never came back
// for a second day, and the result screen's only word about tomorrow was one
// line under the streak ("Streak started — come back tomorrow!"). Nothing said
// what tomorrow would HOLD, and nothing offered to remind anybody: the daily
// reminder (a local notification, `store/reminders.ts`) shipped OFF and lived
// only in Settings, and web push reaches nobody (one subscription, across the
// whole user base, and no daily verse push exists on the server).
//
// So on a player's first two streak days the result screen says, in three
// lines, what is genuinely waiting tomorrow — a new verse, the day-2 streak,
// and tomorrow's trivia BOOK (named by the round itself, so it gives away no
// answer) — and, in the App Store build, offers the one reminder that really
// fires: today's hour, tomorrow. It never names tomorrow's verse, book or
// speaker (each is a question in the run), never counts anybody else, and on
// the web, where no daily reminder exists, it promises none.

function hhmm(d: Date): string {
  // Five minutes before now, rounded down to five: the hour they play, a beat early.
  const t = new Date(d.getTime() - 5 * 60_000)
  const m = Math.floor(t.getMinutes() / 5) * 5
  return `${String(t.getHours()).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function pretty(time: string): string {
  const [h, m] = time.split(':').map(Number)
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function TomorrowCard({ todayDate, streak }: { todayDate: string; streak: number }) {
  const juice = useJuice()
  const r = useReminders()
  const [state, setState] = useState<'idle' | 'busy' | 'set' | 'refused'>('idle')
  useEffect(() => { if (!r.loaded) void r.load() }, [r.loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  const book = dailyTriviaBook(addDays(todayDate, 1))
  const next = streak + 1

  const remind = async () => {
    if (state === 'busy') return
    setState('busy')
    const time = hhmm(new Date())
    await r.setTime('drop', time)
    const ok = await r.setEnabled('drop', true)
    setState(ok ? 'set' : 'refused')
    if (ok) juice.coin()
  }

  const already = r.supported && r.dropEnabled && r.permission === 'granted'

  return (
    <div className="card" data-tomorrow style={{ marginTop: 18, padding: '14px 16px', display: 'grid', gap: 8, textAlign: 'left' }}>
      <h2 style={{ margin: 0, fontSize: 16, fontFamily: 'var(--font-display)' }}>Tomorrow</h2>
      <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4, fontSize: 13.5, lineHeight: 1.45 }}>
        <li>A new verse, the same one for everybody, from midnight.</li>
        <li>Play it and your streak becomes {next} days.</li>
        {book && <li>The trivia round: five questions about {book}.</li>}
      </ul>
      {r.supported && (
        already || state === 'set' ? (
          <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>
            🔔 We&rsquo;ll remind you at {pretty(r.dropTime)}. Change it any time in Settings.
          </p>
        ) : state === 'refused' ? (
          <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>
            Notifications are off for Verse Arcade — you can turn them on in your phone&rsquo;s Settings.
          </p>
        ) : (
          <button className="pill" onClick={() => void remind()} disabled={state === 'busy'} style={{ justifySelf: 'start', fontWeight: 800 }}>
            🔔 Remind me at {pretty(hhmm(new Date()))} tomorrow
          </button>
        )
      )}
    </div>
  )
}
