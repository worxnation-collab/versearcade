import { useState } from 'react'
import { Button } from '@/components/Button'
import { useAuth } from '@/store/auth'
import { shareResult, inviteUrl } from '@/features/daily/shareCard'
import { churchPricesVisible } from '@/lib/commerce'
import { useJuice } from '@/juice/useJuice'

// Pastor to pastor: the cheapest way a church plan finds its next church.
// A leader already using it is the most credible person to describe it, so
// Home offers one tap to send the For Churches page to somebody they know.
//
// The link carries `?src=pastor-ref` (lib/attribution files the sign-up under
// it) and the leader's referral code, so the channel is measurable from its
// first send. The free-until-Easter line is a price claim, so it rides only
// where `churchPricesVisible` says a church price may be shown — never in the
// App Store build.
export function TellAPastor({ churchName }: { churchName: string }) {
  const referralCode = useAuth((s) => s.profile?.referralCode)
  const juice = useJuice()
  const [msg, setMsg] = useState<string | null>(null)
  const link = inviteUrl(referralCode, '/churches?src=pastor-ref')

  const send = async () => {
    juice.select?.()
    const free = churchPricesVisible() ? ' Founding Churches use it free until Easter 2027.' : ''
    const text =
      `We use Verse Arcade at ${churchName}: our people play the week's verse every day, ` +
      `and it drafts the week from my sermon so I don't have to.${free} Have a look:\n${link}`
    const r = await shareResult(text, link)
    setMsg(r === 'shared' ? 'Sent — thank you.' : r === 'copied' ? 'Link copied.' : 'Couldn’t share — try again.')
  }

  return (
    <div className="card" style={{ padding: '12px 14px', display: 'grid', gap: 8 }}>
      <b style={{ fontSize: 14 }}>Know another pastor?</b>
      <span className="dim" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
        Send them what your church uses. One tap, and the page explains the rest.
      </span>
      <div><Button variant="ghost" onClick={send}>Send it to a pastor</Button></div>
      {msg && <span className="faint" style={{ fontSize: 12 }}>{msg}</span>}
    </div>
  )
}
