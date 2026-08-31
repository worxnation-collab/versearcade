import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/Button'
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

  return (
    <div className="card" style={{ borderColor: 'var(--gold)', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 24 }}>⛪</span>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>Play for your church</b>
      </div>
      <p className="dim" style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5 }}>
        We'll suggest the churches near you. Tap yours and the points you earn pool with everyone
        else who goes there — the building grows for all of you.
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Button variant="gold" onClick={() => { juice.select?.(); navigate('/church') }}>
          Find my church
        </Button>
        <Button variant="ghost" onClick={hide}>Not for me</Button>
      </div>
    </div>
  )
}
