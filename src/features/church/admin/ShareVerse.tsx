import { useEffect, useState } from 'react'
import { useAuth } from '@/store/auth'
import { useJuice } from '@/juice/useJuice'
import { todayLocalDate } from '@/lib/date'
import { fetchDayVerse } from '@/store/churchAdmin'
import { shareResult, inviteUrl } from '@/features/daily/shareCard'

// "Share today's verse" — one tap from Plan (beside the Sunday pack) and the
// Share tab, for a leader to put the day's verse in a group text or an email.
//
// What leaves is the LEADER'S act, the way exporting a verse card is: the
// reference and the words in the share text, and the church's PUBLIC page as
// the link (`/church/:id`, with the leader's referral code like every invite).
// There is deliberately no public page for the verse itself — a church verse
// is congregation-only by check constraint, and widening that is a migration
// and an argument of its own — so the link opens the page that says what the
// church is and how to play its verse. With no live verse today (nothing set,
// or only a draft) the button shares the page alone and says so.
//
// Leadership only by where it stands: the Plan and Share tabs are leadership's
// dashboard, and the demo never mounts it.

export function ShareVerse({ churchId, churchName, compact = false }: { churchId: string; churchName: string; compact?: boolean }) {
  const juice = useJuice()
  const referralCode = useAuth((s) => s.profile?.referralCode)
  const [verse, setVerse] = useState<{ reference: string; text: string } | null | undefined>(undefined)
  const [msg, setMsg] = useState<string | null>(null)
  const today = todayLocalDate()

  useEffect(() => {
    let live = true
    void fetchDayVerse(churchId, today).then((r) => {
      if (!live) return
      const v = r.ok && r.data && r.data.status !== 'draft' && r.data.reference && r.data.text ? r.data : null
      setVerse(v ? { reference: v.reference, text: v.text } : null)
    })
    return () => { live = false }
  }, [churchId, today])

  const link = inviteUrl(referralCode, `/church/${churchId}`)
  const text = verse
    ? `Today at ${churchName}: ${verse.reference}\n“${verse.text}”\n\nPlay it with us — our page opens with no account:\n${link}`
    : `${churchName} on Verse Arcade. Open our page — no account needed:\n${link}`

  const share = async () => {
    juice.select()
    const r = await shareResult(text, link)
    setMsg(r === 'shared' ? 'Shared!' : r === 'copied' ? 'Copied — paste it anywhere.' : 'Couldn’t share from this device.')
  }
  const copy = async () => {
    juice.select()
    try {
      await navigator.clipboard.writeText(text)
      setMsg('Copied — paste it anywhere.')
    } catch {
      setMsg('Couldn’t copy on this device.')
    }
  }

  return (
    <div data-share-verse className={compact ? undefined : 'card'} style={{ display: 'grid', gap: 8, padding: compact ? 0 : '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
        <b style={{ flex: 1, minWidth: 140, fontSize: 14.5 }}>🔗 {verse ? 'Share today’s verse' : 'Share your page'}</b>
        <button className="pill" disabled={verse === undefined} onClick={() => void share()} style={{ fontSize: 12, fontWeight: 800, padding: '5px 11px' }}>
          Share
        </button>
        <button className="pill" disabled={verse === undefined} onClick={() => void copy()} style={{ fontSize: 12, padding: '5px 11px' }}>
          {verse ? 'Copy verse link' : 'Copy link'}
        </button>
      </div>
      <span className="faint" style={{ fontSize: 11.5, lineHeight: 1.45 }}>
        {verse === undefined
          ? 'Reading today’s verse…'
          : verse
            ? `${verse.reference} and its words, with a link to your church’s page — anyone can open it.`
            : 'Nothing is live for today, so this shares your church’s page.'}
      </span>
      {msg && <span role="status" className="faint" style={{ fontSize: 12 }}>{msg}</span>}
    </div>
  )
}
