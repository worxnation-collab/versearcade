import { useEffect, useState } from 'react'
import { useAuth } from '@/store/auth'
import { claimOptions } from '@/store/churchClaim'
import { shareResult, inviteUrl } from '@/features/daily/shareCard'
import { useJuice } from '@/juice/useJuice'
import type { Church } from '@/types'
import { Button } from '@/components/Button'

// What a member of an UNVERIFIED church sees in the place ChurchLife fills for
// a verified one — and it was nothing. 31 players sat in 22 churches on
// 2026-11-01, all but one unverified, so the church tab real players got was
// the yard, a level bar and the Give card, with no word that their church
// could have more or how. The verified layer (a verse picked for the
// congregation, the pastor's note, a series) is something only the church's
// own staff can switch on, so the honest thing for a member to be offered is
// the one move that gets it: hand the church's claim page to the pastor.
//
// It is also the best route to a pilot church this app has: a member asking
// their own pastor beats any cold email. Four rules keep it from becoming a
// nag:
//   * Only when NOBODY leads the church yet (`church_self_claim_status` =
//     'open'). A church with a leader setting it up is not asked again.
//   * Folds away on "Not now" for 30 days, per church, on this device.
//   * No price, no "plan", no checkout — the claim page says what it costs,
//     on the pastor's own screen; this card only names what the congregation
//     gets. Byte-identical in the App Store build for that reason.
//   * No number about a person. The congregation's size is the only figure,
//     and it is the church's.

const SNOOZE_DAYS = 30
const key = (id: string) => `va.askPastor.${id}`

function snoozed(id: string): boolean {
  try {
    const t = Number(localStorage.getItem(key(id)) || 0)
    return t > 0 && Date.now() - t < SNOOZE_DAYS * 86_400_000
  } catch { return false }
}

export function AskPastorCard({ church }: { church: Church }) {
  const juice = useJuice()
  const referralCode = useAuth((s) => s.profile?.referralCode)
  const [open, setOpen] = useState<boolean | null>(null)
  const [hidden, setHidden] = useState(() => snoozed(church.id))
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (hidden) return
    let alive = true
    claimOptions(church.id).then((o) => { if (alive) setOpen(o?.status === 'open') })
    return () => { alive = false }
  }, [church.id, hidden])

  if (hidden || !open) return null

  const link = inviteUrl(referralCode, `/church/${church.id}/claim`)
  const players = church.members === 1 ? '1 of us plays' : `${church.members} of us play`

  const send = async () => {
    juice.select()
    const text = `${church.name} is on Verse Arcade — ${players} the daily verse there. If you claim our church's page, you can pick the verse we all read each day and post a note for the church:\n${link}`
    const r = await shareResult(text, link)
    setMsg(r === 'shared' ? 'Sent — thank you.' : r === 'copied' ? 'Link copied — paste it to your pastor.' : 'Could not share just now.')
  }

  const later = () => {
    juice.tap()
    try { localStorage.setItem(key(church.id), String(Date.now())) } catch { /* storage blocked */ }
    setHidden(true)
  }

  return (
    <div className="card" style={{ padding: '14px 16px' }} data-ask-pastor>
      <b style={{ fontSize: 15.5 }}>Bring {church.name} to life</b>
      <p className="dim" style={{ margin: '6px 0 0', fontSize: 13.5, lineHeight: 1.5 }}>
        When someone on staff claims this church, everyone here gets a verse chosen for the
        congregation each day, notes from the pastor, and a series to read together.
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 180px' }}>
          <Button variant="gold" full onClick={send}>Ask your pastor</Button>
        </div>
        <button className="pill" onClick={later} style={{ fontSize: 12.5 }}>Not now</button>
      </div>
      <p className="faint" style={{ margin: '8px 0 0', fontSize: 11.5, lineHeight: 1.45 }}>
        {msg ?? 'It sends your church’s own claim page. Nobody sees who sent it.'}
      </p>
    </div>
  )
}
