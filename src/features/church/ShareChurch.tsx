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
export function ShareChurch({
  churchId,
  churchName,
  city,
  label = '🔗 Share this church',
  note = 'Anyone can open this page — no account needed to look.',
}: {
  churchId: string
  churchName: string
  /** Named in the shared line so the link reads as THIS church, not the game. */
  city?: string | null
  /** The button. Your own church's card says "Invite your congregation". */
  label?: string
  note?: string
}) {
  const referralCode = useAuth((s) => s.profile?.referralCode)
  const juice = useJuice()
  const [msg, setMsg] = useState<string | null>(null)

  const share = async () => {
    juice.select()
    const link = inviteUrl(referralCode, `/church/${churchId}`)
    // The church first, then where it is, then that the page opens without an
    // account. No "beat", "score", "rank" or "win" — this is a church's link,
    // and the game's own share line is a different thing.
    const where = city ? ` in ${city}` : ''
    const text = `${churchName}${where} on Verse Arcade. Open its page — no account needed:\n${link}`
    const r = await shareResult(text, link)
    setMsg(r === 'shared' ? 'Shared!' : r === 'copied' ? 'Link copied!' : 'Could not share')
  }

  return (
    <div style={{ marginTop: 12 }}>
      <Button variant="secondary" full onClick={share}>{label}</Button>
      {msg && (
        <p className="faint center" style={{ margin: '8px 0 0', fontSize: 12.5 }}>{msg}</p>
      )}
      <p className="faint center" style={{ margin: '6px 0 0', fontSize: 11.5, lineHeight: 1.5 }}>
        {note}
      </p>
    </div>
  )
}
