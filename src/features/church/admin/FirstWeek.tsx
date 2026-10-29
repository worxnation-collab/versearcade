import { useEffect, useState } from 'react'
import { useJuice } from '@/juice/useJuice'

// "Your first week" — the top of Home for a leader who has just started.
//
// It APPEARS when a verified church's leadership opens Home with nothing set
// up yet: no live notice, no verse (live or draft) in the next seven days, and
// fewer than three members (nothing records who a leader has invited, so a
// near-empty congregation is the honest stand-in). Once it has appeared it is
// remembered on this device (`va.church.firstweek.<id>`), so posting the
// notice doesn't make the list vanish before the other rows are done.
//
// Three rows, each a door like a Home to-do row (HomeGo): plan this week (or
// switch on Autopilot), post a notice, share your page — the order a church
// gets value in. "Choose your look" was the first row until 2026-10-29 and is
// now under Your page → More tools: a look is a nicety, not a setup step.
// Each is ticked by the real state where there is one (a notice live, a day
// planned or Autopilot on); "Share" is ticked when its row is
// tapped, since a share leaves the app. The list goes when every row is done,
// or for good on "Hide this". A done row is dimmed with a tick, not struck out. It sits ABOVE "This week" and blocks nothing —
// the ordinary to-do rows below it are unchanged.

export type FirstWeekDoor = 'notice' | 'plan' | 'share'

const KEY = (id: string) => `va.church.firstweek.${id}`
function read(id: string): { on?: boolean; hidden?: boolean; shared?: boolean } {
  try { return JSON.parse(localStorage.getItem(KEY(id)) ?? '{}') ?? {} } catch { return {} }
}
function write(id: string, v: { on?: boolean; hidden?: boolean; shared?: boolean }) {
  try { localStorage.setItem(KEY(id), JSON.stringify(v)) } catch { /* a private window just forgets */ }
}

export function FirstWeek({
  churchId,
  fresh,
  hasNotice,
  planned,
  autopilotOffered,
  onDoor,
}: {
  churchId: string
  /** Every start condition holds right now (no notice, no verse in 7 days, < 3 members). */
  fresh: boolean
  hasNotice: boolean
  /** A verse or draft in the next seven days, or Autopilot on. */
  planned: boolean
  /** The church holds Content Generation, so Autopilot is a choice here. */
  autopilotOffered: boolean
  onDoor: (d: FirstWeekDoor) => void
}) {
  const juice = useJuice()
  const [state, setState] = useState(() => read(churchId))
  const on = !!state.on || (fresh && !state.hidden)
  // Latch it the first time it appears, so the list outlives its own trigger.
  useEffect(() => {
    if (fresh && !state.on && !state.hidden) { const next = { ...state, on: true }; write(churchId, next); setState(next) }
  }, [fresh, churchId]) // eslint-disable-line react-hooks/exhaustive-deps
  const rows: { door: FirstWeekDoor; icon: string; title: string; detail: string; done: boolean }[] = [
    {
      door: 'plan', icon: '📅', title: 'Plan this week',
      detail: autopilotOffered ? 'A verse for each day — or switch on Autopilot and let your sermon draft it.' : 'A verse for each day your church plays together.',
      done: planned,
    },
    { door: 'notice', icon: '📣', title: 'Post a notice', detail: 'One line on your page — a service time, this week’s potluck.', done: hasNotice },
    { door: 'share', icon: '🔗', title: 'Share your page', detail: 'The link and QR code for a bulletin, a slide or a group text.', done: !!state.shared },
  ]
  if (!on || state.hidden || rows.every((r) => r.done)) return null

  const tap = (d: FirstWeekDoor) => {
    juice.select?.()
    if (d === 'share') { const next = { ...state, shared: true }; write(churchId, next); setState(next) }
    onDoor(d)
  }
  const hide = () => { const next = { ...state, hidden: true }; write(churchId, next); setState(next) }

  return (
    <section data-first-week aria-label="Your first week" style={{ display: 'grid', gap: 8, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 style={{ margin: 0, flex: 1, fontSize: 17, fontFamily: 'var(--font-display)' }}>Your first week</h2>
        <button className="pill" onClick={hide} style={{ fontSize: 11.5, padding: '4px 10px' }}>Hide this</button>
      </div>
      {rows.map((r) => (
        <button
          key={r.door}
          className="card"
          data-first-week-row={r.door}
          data-done={r.done || undefined}
          onClick={() => tap(r.door)}
          style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 13px', textAlign: 'left', color: 'inherit', font: 'inherit', cursor: 'pointer', width: '100%', minWidth: 0, opacity: r.done ? 0.6 : 1 }}
        >
          <span aria-hidden style={{ fontSize: 18, lineHeight: '22px', width: 22, textAlign: 'center', flexShrink: 0 }}>{r.done ? '✓' : r.icon}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <b style={{ display: 'block', fontSize: 14, lineHeight: 1.35 }}>{r.title}</b>
            {!r.done && <span className="dim" style={{ display: 'block', fontSize: 12.5, lineHeight: 1.45, marginTop: 2 }}>{r.detail}</span>}
          </span>
        </button>
      ))}
    </section>
  )
}
