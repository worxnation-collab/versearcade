import { useState } from 'react'
import { Button } from '@/components/Button'
import { useAuth } from '@/store/auth'
import { shareResult, inviteUrl } from '@/features/daily/shareCard'
import { useJuice } from '@/juice/useJuice'

// The way a church page gets out of the app.
//
// This is not polish on the public page — it is the other half of it. A page a
// pastor cannot link to is a page nobody outside the app ever sees, and the
// whole argument for /church/:id is that one recommendation on a Sunday reaches
// a congregation at once. So the link lives wherever a church is already open.
//
// It rides the referral code like every other invite here, so a church shared
// by one of its own members still credits them.
export function ShareChurch({ churchId, churchName }: { churchId: string; churchName: string }) {
  const referralCode = useAuth((s) => s.profile?.referralCode)
  const juice = useJuice()
  const [msg, setMsg] = useState<string | null>(null)

  const share = async () => {
    juice.coin()
    const link = inviteUrl(referralCode, `/church/${churchId}`)
    const text = `${churchName} is on Verse Arcade — come play for it:\n${link}`
    const r = await shareResult(text, link)
    setMsg(r === 'shared' ? 'Shared!' : r === 'copied' ? 'Link copied!' : 'Could not share')
  }

  return (
    <div style={{ marginTop: 12 }}>
      <Button variant="secondary" full onClick={share}>🔗 Share this church</Button>
      {msg && (
        <p className="faint center" style={{ margin: '8px 0 0', fontSize: 12.5 }}>{msg}</p>
      )}
      <p className="faint center" style={{ margin: '6px 0 0', fontSize: 11.5, lineHeight: 1.5 }}>
        Anyone can open this page — no account needed to look.
      </p>
    </div>
  )
}
