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
  label = '🔗 Share this church',
  note = 'Anyone can open this page — no account needed to look.',
}: {
  churchId: string
  churchName: string
  /** The button. Your own church's card says "Invite your congregation". */
  label?: string
  note?: string
}) {
  const referralCode = useAuth((s) => s.profile?.referralCode)
  const juice = useJuice()
  const [msg, setMsg] = useState<string | null>(null)

  const share = async () => {
    juice.coin()
    // `?src=church` beside the referral code, because the two answer different
    // questions and only one of them was being asked. `ref` credits the PERSON
    // who sent it; `src` files the CHANNEL, and a church invite carried no
    // channel at all — so every sign-up a pastor drove landed in the growth
    // tab as untracked, next to the social posts that do carry one. That is
    // the number this whole route is judged on. `set_signup_source` (0106)
    // validates a slug by SHAPE rather than against a list, so this needs no
    // migration, and the server keeps only the first value on a NEW account —
    // a hint it verifies, never a fact the client asserts.
    //
    // Joined with the right separator rather than a bare `&`: `inviteUrl`
    // returns the path UNCHANGED when there is no referral code, so an
    // appended `&src=church` would have produced `…/church/<id>&src=church`
    // — one broken link for every sharer who has no code yet.
    const base = inviteUrl(referralCode, `/church/${churchId}`)
    const link = `${base}${base.includes('?') ? '&' : '?'}src=church`
    const text = `${churchName} is on Verse Arcade — come play for it:\n${link}`
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
