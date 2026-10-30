import { useState } from 'react'
import { Button } from '@/components/Button'
import { useAuth } from '@/store/auth'
import { useSeason } from '@/store/season'
import { buildVerseInviteText, shareResult, verseInviteUrl } from './shareCard'

// SendVerseCard — the first week's one tap to bring somebody in.
//
// "Share my result" under it is a score; this is the verse. The link opens
// TODAY's verse for whoever taps it (`/play?d=<date>`, lib/verseLink), and a
// stranger with no profile gets one button on Landing that drops them straight
// into the run — no sign-up, no character screen first. The text carries no
// score, no reference and no answers, so it spoils nothing and puts nobody's
// number beside anybody's.
//
// A send counts as the day's share (share-day unlocks, the `share_daily`
// verb) exactly as the result share does: a share is a share.
export function SendVerseCard({ dropDate }: { dropDate: string }) {
  const profile = useAuth((s) => s.profile)
  const recordShare = useAuth((s) => s.recordShare)
  const [note, setNote] = useState<string | null>(null)
  if (!profile) return null

  const send = async () => {
    const ref = useAuth.getState().mode === 'online' ? profile.referralCode : null
    const r = await shareResult(buildVerseInviteText(ref, dropDate), verseInviteUrl(ref, dropDate))
    if (r !== 'failed') {
      recordShare(dropDate)
      void useSeason.getState().track('share_daily')
    }
    setNote(r === 'copied' ? 'Link copied — paste it to them.' : r === 'shared' ? 'Sent. It opens straight into today’s verse.' : 'Couldn’t open the share sheet.')
  }

  return (
    <div data-send-verse className="card" style={{ marginTop: 18, display: 'grid', gap: 10 }}>
      <div>
        <b style={{ fontSize: 15 }}>Who should read this today?</b>
        <p className="dim" style={{ fontSize: 13, margin: '4px 0 0', lineHeight: 1.45 }}>
          Send them today’s verse. The link opens straight into it — no account, no score of yours.
        </p>
      </div>
      <Button variant="gold" full onClick={send}>Send today’s verse to a friend</Button>
      {note && <p className="faint" style={{ fontSize: 12.5, margin: 0 }}>{note}</p>}
    </div>
  )
}
