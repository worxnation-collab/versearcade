import { useCallback, useEffect, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { Collapsible } from '@/components/Collapsible'
import { useJuice } from '@/juice/useJuice'
import { dismissJoinInquiry, fetchJoinInquiries, INQUIRY_REPLY_MAX, replyJoinInquiry, type JoinInquiry } from '@/store/churchAdmin'

// "Asking about your church" — notes players sent from this church's leader's
// player card (0149, `church_join_inquiries`). Top of the People tab, folded
// open when there is anything in it, and nothing at all when there isn't.
//
// A plain list, newest first: who, what they wrote, when, and whether they
// have since joined. No count beyond the header's, no ordering by anything but
// time, nothing compared — a stranger's question, not a lead to be scored.
// Dismiss takes one off the list (the player cannot send this church another:
// one note per church).
//
// Reply (0155) answers it ONCE, in the church's voice: a short note (280)
// that lands in the asker's mailbox and on the church sheet they asked from,
// and nowhere else. After sending, the row says "Replied" with the words and
// can still be dismissed. A player who has since joined still gets it — the
// row already says where they went, and the send line repeats it.

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
  const [open, setOpen] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState<{ user: string; ok: boolean; text: string } | null>(null)
  if (!items?.length) return null

  const dismiss = async (u: string) => {
    setBusy(u)
    const r = await dismissJoinInquiry(churchId, u)
    setBusy(null)
    if (r.ok) { juice.select?.(); setItems((all) => (all ?? []).filter((x) => x.username !== u)) }
  }

  const send = async (u: string) => {
    setBusy(u); setNote(null)
    const r = await replyJoinInquiry(churchId, u, draft)
    setBusy(null)
    if (!r.ok) {
      setNote({ user: u, ok: false, text: REPLY_FAIL[r.reason] ?? 'That didn’t send. Try again in a moment.' })
      return
    }
    juice.select?.()
    const text = draft.replace(/\s+/g, ' ').trim().slice(0, INQUIRY_REPLY_MAX)
    setItems((all) => (all ?? []).map((x) => (x.username === u ? { ...x, reply: text, repliedAt: new Date().toISOString() } : x)))
    setOpen(null); setDraft('')
    setNote({
      user: u, ok: true,
      text: r.data.joined === 'here' ? 'Sent. They’ve joined your church since — it’s in their mailbox.'
        : r.data.joined === 'elsewhere' ? 'Sent. They’ve since joined another church; it’s still in their mailbox.'
        : 'Sent to their mailbox.',
    })
  }

  return (
    <Collapsible icon="✉️" title="Asking about your church" meta={items.length.toLocaleString()} defaultOpen>
      <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
        <p className="faint" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45 }}>
          Players who tapped a leader’s card and wrote to you. Only your church’s leaders see these, and a reply goes to
          that player alone.
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
              {q.reply && (
                <div data-replied style={{ borderLeft: '2px solid var(--edge)', paddingLeft: 8, display: 'grid', gap: 2 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--mint)' }}>✓ Replied{q.repliedAt ? ` · ${when(q.repliedAt)}` : ''}</span>
                  <span className="dim" style={{ fontSize: 12.5, lineHeight: 1.45, overflowWrap: 'anywhere' }}>{q.reply}</span>
                </div>
              )}
              {open === q.username && !q.reply && (
                <div style={{ display: 'grid', gap: 6 }}>
                  <textarea
                    aria-label={`Reply to ${q.username}`}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value.slice(0, INQUIRY_REPLY_MAX))}
                    rows={3}
                    placeholder="We meet Sundays at 10 — come find me at the door."
                    style={{ resize: 'vertical', minWidth: 0 }}
                  />
                  <span className="faint" style={{ fontSize: 11 }}>
                    {draft.length}/{INQUIRY_REPLY_MAX} · One reply, from your church. Only {q.username} sees it.
                  </span>
                </div>
              )}
              {note?.user === q.username && (
                <span role="status" style={{ fontSize: 12, lineHeight: 1.45, color: note.ok ? 'var(--mint)' : 'var(--coral)' }}>{note.text}</span>
              )}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {!q.reply && (open === q.username ? (
                  <>
                    <button className="pill" disabled={busy === q.username || draft.trim().length < 2} onClick={() => void send(q.username)} style={{ fontSize: 12, padding: '4px 10px', fontWeight: 800 }}>
                      {busy === q.username ? 'Sending…' : 'Send reply'}
                    </button>
                    <button className="pill" disabled={busy === q.username} onClick={() => { setOpen(null); setDraft('') }} style={{ fontSize: 12, padding: '4px 10px' }}>Cancel</button>
                  </>
                ) : (
                  <button className="pill" disabled={!!busy} onClick={() => { setOpen(q.username); setDraft(''); setNote(null) }} style={{ fontSize: 12, padding: '4px 10px', fontWeight: 800 }}>Reply</button>
                ))}
                {open !== q.username && (
                  <button className="pill" disabled={busy === q.username} onClick={() => void dismiss(q.username)} style={{ fontSize: 12, padding: '4px 10px' }}>
                    {busy === q.username ? '…' : 'Dismiss'}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Collapsible>
  )
}

const REPLY_FAIL: Record<string, string> = {
  already: 'This one already has your reply.',
  bad_note: 'Write a few words first.',
  not_found: 'That note isn’t here any more.',
  not_leadership: 'Only this church’s leadership can reply.',
  not_verified: 'Replies open once the church is verified.',
}
