import { useEffect, useState, type ReactNode } from 'react'
import { useJuice } from '@/juice/useJuice'

// "More tools" — the one fold at the foot of a leadership tab (2026-10-29).
//
// The dashboard had grown to about thirty tools across its four tabs, and the
// first screen of each was a column of closed rows a pastor had to read past
// to reach the thing they came for. Production said which ones were used:
// verses, the notice, sharing the page and the roster were; co-leaders, small
// groups, the prayer list, the Sunday pack and the leader look had no rows at
// all. So each tab now leads with its everyday tools and puts the rest behind
// this row. Nothing is removed and no gate changed — every tool is one tap
// further, and the row names what is inside so nothing is hidden by surprise.
//
// It is a disclosure, not a `Collapsible`: the tools inside are Collapsibles
// themselves, and a card nested in a card's padding is the Landscaping trap
// (CLAUDE.md → "The little worlds"). `open` forces it open — a door from Home
// or a return from a checkout that lands on something inside.

export function MoreTools({ names, open = false, children }: { names: string[]; open?: boolean; children: ReactNode }) {
  const juice = useJuice()
  const [shown, setShown] = useState(open)
  useEffect(() => { if (open) setShown(true) }, [open])
  return (
    <div data-more-tools style={{ display: 'grid', gap: 10, minWidth: 0 }}>
      <button
        className="pill"
        aria-expanded={shown}
        onClick={() => { juice.select?.(); setShown((s) => !s) }}
        style={{ justifySelf: 'stretch', minHeight: 44, padding: '10px 14px', textAlign: 'left', whiteSpace: 'normal', lineHeight: 1.4, display: 'flex', alignItems: 'center', gap: 8 }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: 13.5 }}>{shown ? 'Fewer tools' : 'More tools'}</b>
          {!shown && <span className="dim" style={{ display: 'block', fontSize: 12, marginTop: 1 }}>{names.join(' · ')}</span>}
        </span>
        <span aria-hidden className="dim" style={{ fontSize: 14 }}>{shown ? '−' : '+'}</span>
      </button>
      {shown && children}
    </div>
  )
}
