import { useCallback, useEffect, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { Collapsible } from '@/components/Collapsible'
import { useJuice } from '@/juice/useJuice'
import { dismissJoinInquiry, fetchJoinInquiries, type JoinInquiry } from '@/store/churchAdmin'

// "Asking about your church" — notes players sent from this church's leader's
// player card (0149, `church_join_inquiries`). Top of the People tab, folded
// open when there is anything in it, and nothing at all when there isn't.
//
// A plain list, newest first: who, what they wrote, when, and whether they
// have since joined. No count beyond the header's, no ordering by anything but
// time, nothing compared — a stranger's question, not a lead to be scored.
// Dismiss takes one off the list (the player cannot send this church another:
// one note per church). There is no reply path yet — a check-in note reaches
// members only — so "reply" is to welcome them when they join.

export function useJoinInquiries(churchId: string, enabled: boolean) {
  const [items, setItems] = useState<JoinInquiry[] | null>(null)
  const reload = useCallback(async () => {
    if (!enabled) return
    const r = await fetchJoinInquiries(churchId)
    setItems(r.ok ? r.data : [])
  }, [churchId, enabled])
  useEffect(() => { void reload() }, [reload])
  return { items, reload, setItems }
}

const when = (iso: string) => {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const mins = Math.round((Date.now() - t) / 60_000)
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hr ago`
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function InquiriesSection({ churchId }: { churchId: string }) {
  const juice = useJuice()
  const { items, setItems } = useJoinInquiries(churchId, true)
  const [busy, setBusy] = useState<string | null>(null)
  if (!items?.length) return null

  const dismiss = async (u: string) => {
    setBusy(u)
    const r = await dismissJoinInquiry(churchId, u)
    setBusy(null)
    if (r.ok) { juice.select?.(); setItems((all) => (all ?? []).filter((x) => x.username !== u)) }
  }

  return (
    <Collapsible icon="✉️" title="Asking about your church" meta={items.length.toLocaleString()} defaultOpen>
      <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
        <p className="faint" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45 }}>
          Players who tapped a leader’s card and wrote to you. Only your church’s leaders see these.
        </p>
        {items.map((q) => (
          <div key={q.username} className="card" data-inquiry={q.username} style={{ display: 'grid', gridTemplateColumns: '34px minmax(0,1fr)', gap: 10, padding: '10px 12px', minWidth: 0 }}>
            <Avatar emoji={q.avatarEmoji ?? '🙂'} character={q.avatarCharacter} username={q.username} size={34} />
            <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <b style={{ fontSize: 13.5 }}>{q.username}</b>
                <span className="faint" style={{ fontSize: 11.5 }}>{when(q.at)}</span>
                {q.joinedHere && <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--mint)' }}>· joined your church</span>}
                {q.joinedElsewhere && <span className="faint" style={{ fontSize: 11.5 }}>· joined another church</span>}
              </div>
              <span style={{ fontSize: 13, lineHeight: 1.45, overflowWrap: 'anywhere' }}>{q.note}</span>
              <button className="pill" disabled={busy === q.username} onClick={() => void dismiss(q.username)} style={{ justifySelf: 'start', fontSize: 12, padding: '4px 10px' }}>
                {busy === q.username ? '…' : 'Dismiss'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </Collapsible>
  )
}
