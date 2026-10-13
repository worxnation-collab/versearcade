import { useEffect, useState } from 'react'
import { fetchMyCareOptin, setMyCareOptin } from '@/store/churchAdmin'
import { useJuice } from '@/juice/useJuice'

// The member's own switch, and the ONLY way onto a church's check-in list.
//
// Off by default, and nothing anywhere tells leadership who left it off. When
// it's on and the member has been away three or more days, their church's
// verified leadership sees their name and the date they were last here — and
// nothing else: no score, no streak, no count (`church_care_list`, 0118). The
// wording says exactly that, so nobody switches it on without knowing what it
// shares.
//
// Renders nothing until the server answers, and nothing at all on a server
// without 0118, so it can never claim a setting it couldn't read.
export function CareOptinToggle({ churchName }: { churchName: string }) {
  const juice = useJuice()
  const [on, setOn] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    fetchMyCareOptin().then((v) => { if (alive) setOn(v) })
    return () => { alive = false }
  }, [])

  if (on === null) return null

  const toggle = async () => {
    const next = !on
    setBusy(true)
    setOn(next) // optimistic; put back if the server says no
    const r = await setMyCareOptin(next)
    setBusy(false)
    if (!r.ok) setOn(!next)
    else juice.select?.()
  }

  return (
    <label
      style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginTop: 14, cursor: busy ? 'default' : 'pointer' }}
    >
      <input
        type="checkbox"
        checked={on}
        disabled={busy}
        onChange={toggle}
        style={{ marginTop: 3, width: 18, height: 18, flexShrink: 0, accentColor: 'var(--mint)' }}
      />
      <span style={{ fontSize: 13, lineHeight: 1.5 }}>
        <b>Let {churchName}'s leaders know when I've been away</b>
        <span className="dim" style={{ display: 'block', fontSize: 12.5, marginTop: 2 }}>
          If you haven't played in three days, they'll see your name and the day you were last here — so
          someone can check in. Nothing else, and you can turn it off any time.
        </span>
      </span>
    </label>
  )
}
