import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChurchArt } from './ChurchArt'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/store/auth'
import { useChurch } from '@/store/church'
import { useJuice } from '@/juice/useJuice'

// "You haven't picked a church yet" — the one place outside the Church tab
// that says so.
//
// The picker has always been the whole no-church state of `/church`, which
// means a player who tapped past that tab once never hears about it again. This
// is the nudge, and its rules are the app's rules:
//
//   • It offers, it never scolds. Plenty of people playing this don't attend
//     anywhere, and "you have no church" must never read as a thing you're
//     behind on.
//   • So it can be dismissed, permanently, in one tap. The flag is device-local
//     (`va.churchNudge`) rather than a profile column, exactly like the
//     Bible tab's fold state: it's a preference about what you want to be
//     asked, not a fact about your account worth a migration.
//   • Online-only, inherited from `store/church.ts` — a guest has no church to
//     join and no board to join it for.
//   • It is ONE ROW on `/you` (building · one line · button, plus a quiet ✕),
//     not a card with a paragraph. It used to be the tallest thing in "Your
//     people", and a church you haven't joined is not what that tab is about;
//     the explaining lives on `/church`, which the button opens.
const HIDDEN_KEY = 'va.churchNudge'

function dismissed(): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY) === 'hidden'
  } catch {
    return false
  }
}

export function ChurchNudge() {
  const navigate = useNavigate()
  const juice = useJuice()
  const mode = useAuth((s) => s.mode)
  const church = useChurch((s) => s.church)
  const loaded = useChurch((s) => s.loaded)
  const load = useChurch((s) => s.load)
  const [hidden, setHidden] = useState(dismissed)

  const online = mode === 'online' && !!supabase

  useEffect(() => {
    if (online) void load()
  }, [online, load])

  // Nothing until we actually know: flashing "pick a church" at somebody who
  // has one, for the half-second before `get_my_church` answers, is the one
  // way this card can be wrong.
  if (!online || hidden || !loaded || church) return null

  const hide = () => {
    juice.select?.()
    try {
      localStorage.setItem(HIDDEN_KEY, 'hidden')
    } catch {
      // A browser with storage blocked just gets the card again next time.
    }
    setHidden(true)
  }

  const open = () => {
    juice.select?.()
    navigate('/church')
  }

  return (
    <div
      className="card"
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px 8px 10px', marginBottom: 10 }}
    >
      <div aria-hidden style={{ width: 36, height: 36, flexShrink: 0, display: 'grid', placeItems: 'end center' }}>
        <ChurchArt level={1} size={36} />
      </div>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, lineHeight: 1.3 }}>
        Play for your church
      </span>
      <button
        className="pill"
        onClick={open}
        style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--gold)', flexShrink: 0, cursor: 'pointer', whiteSpace: 'nowrap' }}
      >
        Find mine
      </button>
      <button
        onClick={hide}
        aria-label="Not for me"
        className="faint"
        style={{ fontSize: 15, lineHeight: 1, padding: '6px 4px', flexShrink: 0, cursor: 'pointer', background: 'none', border: 0 }}
      >
        ✕
      </button>
    </div>
  )
}
