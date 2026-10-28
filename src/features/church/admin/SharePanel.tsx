import { ShareChurch } from '@/features/church/ShareChurch'
import { ChurchInviteQR } from '@/features/church/ChurchInviteQR'
import { ShareVerse } from './ShareVerse'

// Leadership's Share tab: the church's page link, ready to paste, and — for a
// verified church — the QR code ready to print.
//
// The page is the thing a pastor hands out, so getting it out of the app
// belongs where the pastor already is, not two screens away at the bottom of
// the church's own page. Same two components the page uses, so the link here
// and the link there can never differ (both carry the sharer's referral code).
//
// "Share today's verse" (`ShareVerse`) sits under the page link: the day's
// verse and the same page link, for a group text. Plan carries it too.
//
// The QR stays part of the verified package (docs/CHURCH-PACKAGES.md), as it
// is on the page; the link is every church's, free.
export function SharePanel({
  churchId,
  churchName,
  city,
  verified,
}: {
  churchId: string
  churchName: string
  city?: string | null
  verified: boolean
}) {
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <p className="dim" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>
        Your church&rsquo;s page shows your building, your service times and this week&rsquo;s line, and
        anyone can open it without an account. Put the link in a bulletin or an email, or the code on a slide.
      </p>
      <ShareChurch
        churchId={churchId}
        churchName={churchName}
        city={city}
        showLink
        label="Share the page"
      />
      <div style={{ marginTop: 12 }}><ShareVerse churchId={churchId} churchName={churchName} /></div>
      {verified && <ChurchInviteQR churchId={churchId} churchName={churchName} defaultOpen />}
    </div>
  )
}
