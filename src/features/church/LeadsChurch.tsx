import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button } from '@/components/Button'
import { AccountWallCard, useAccountLocked } from '@/components/AccountWall'
import { useAuth } from '@/store/auth'
import { useChurch } from '@/store/church'
import { useJuice } from '@/juice/useJuice'
import { ChurchArt } from './ChurchArt'
import { setPendingChurch } from './pending'
import { fetchMyInquiry, INQUIRY_MAX, sendJoinInquiry, type CardChurch } from '@/store/churchDiscovery'

// "Leads St Mark's" — the quiet line on a church leader's own player card
// (0149), and the sheet it opens.
//
// It is drawn ONLY for a leader of a verified church (`player_card_church`
// answers null for anybody else, a free claim included), under the portrait,
// as one slim row: the building, small, and "Leads {church}". Not a badge of
// rank and not a number — it says what this person does, the way the faction
// line above it says which team they're on. It never appears in a board row,
// a crowd scene or anywhere but the card.
//
// The sheet says what the church is, in the words its public page already
// uses (the building, the tagline, the "This week" line), and then what THIS
// viewer can do about it:
//   * no church → Inquire (one short note to its leadership, once per church)
//     and Join (the church page's own path: `join_church` by id — any signed-in
//     player can join any church, so there is no closed state to show);
//   * a church already → "Visit church", the public page, and never a Join
//     that would move them (the JoinChurchButton rule);
//   * a guest → the account wall, remembering the church so sign-up lands back
//     on its page (`setPendingChurch`, the same door the public page uses);
//   * the leader themselves → their dashboard.
// It sits at 112 — above the card it was opened from, like the room visit.

export function LeadsChurchLine({ church, onOpen }: { church: CardChurch; onOpen: () => void }) {
  const juice = useJuice()
  return (
    <button
      data-leads-church
      onClick={() => { juice.select?.(); onOpen() }}
      className="card"
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px 6px 6px', marginBottom: 10,
        textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit', background: 'var(--card-raised)', minWidth: 0,
      }}
    >
      <span aria-hidden style={{ width: 40, height: 40, flexShrink: 0, display: 'grid', placeItems: 'center' }}>
        <ChurchArt level={church.level} skin={church.skin ?? undefined} size={40} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="dim" style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: 0.3 }}>Church leader</span>
        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800, fontFamily: 'var(--font-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Leads {church.name}
        </span>
      </span>
      <span aria-hidden className="dim" style={{ fontSize: 16 }}>›</span>
    </button>
  )
}

const FAIL: Record<string, string> = {
  has_church: 'You already play for a church.',
  own_church: 'That’s your own church.',
  not_verified: 'This church can’t take notes right now.',
  bad_note: 'Write a line or two first.',
  daily_cap: 'That’s five churches today — try again tomorrow.',
  not_authenticated: 'Sign in to send a note.',
}

export function ChurchInquirySheet({
  church,
  leader,
  isMe,
  onClose,
  onLeave,
}: {
  church: CardChurch
  /** The leader whose card this came from. */
  leader: string
  isMe: boolean
  onClose: () => void
  /** Close the card too — for anything that navigates away. */
  onLeave: () => void
}) {
  const navigate = useNavigate()
  const juice = useJuice()
  const locked = useAccountLocked()
  const online = useAuth((s) => s.mode) === 'online'
  const mine = useChurch((s) => s.church)
  const loaded = useChurch((s) => s.loaded)
  const loadMine = useChurch((s) => s.load)
  const [sent, setSent] = useState<boolean | null>(null)
  const [reply, setReply] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<'send' | 'join' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { if (online) void loadMine() }, [online, loadMine])
  useEffect(() => {
    if (!online || isMe) return
    let alive = true
    fetchMyInquiry(church.id).then((s) => { if (alive) { setSent(s.sent); setReply(s.reply) } })
    return () => { alive = false }
  }, [online, isMe, church.id])

  const go = (to: string) => { onLeave(); navigate(to) }

  const send = async () => {
    setBusy('send'); setErr(null)
    const r = await sendJoinInquiry(church.id, note)
    setBusy(null)
    if (r.ok || r.reason === 'already') { juice.select?.(); setSent(true); return }
    setErr(FAIL[r.reason] ?? 'That didn’t send — check your connection and try again.')
  }

  const join = async () => {
    setBusy('join'); setErr(null)
    const joined = await useChurch.getState().join({
      churchId: church.id, placeKey: '', name: church.name, lat: 0, lng: 0,
      address: null, city: null, region: null, miles: 0,
    })
    setBusy(null)
    if (!joined) return setErr('That didn’t go through — check your connection and try again.')
    // A quiet tick, not confetti: joining a church is a choice, not a score.
    juice.select?.()
    go('/church')
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 112, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', padding: 18 }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`${church.name}`}
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="card"
        style={{ width: '100%', maxWidth: 400, maxHeight: 'calc(100dvh - 36px)', overflowY: 'auto', display: 'grid', gap: 12, padding: 16 }}
      >
        <div style={{ display: 'grid', justifyItems: 'center', gap: 6, textAlign: 'center' }}>
          <ChurchArt level={church.level} skin={church.skin ?? undefined} size={130} />
          <b style={{ fontSize: 18, fontFamily: 'var(--font-body)', lineHeight: 1.25 }}>{church.name}</b>
          <span className="dim" style={{ fontSize: 12.5 }}>@{leader} leads this church</span>
          {church.tagline && <span style={{ fontSize: 13.5, lineHeight: 1.45 }}>{church.tagline}</span>}
          {church.thisWeek && (
            <span className="dim" style={{ fontSize: 12.5, lineHeight: 1.45 }}><b>This week:</b> {church.thisWeek}</span>
          )}
        </div>

        {isMe ? (
          <Button variant="secondary" full onClick={() => go(`/church/${church.id}/admin`)}>Open your dashboard</Button>
        ) : locked || !online ? (
          <AccountWallCard
            icon="⛪"
            title="Create an account to inquire"
            line={`With an account you can send ${church.name}’s leaders a note, or play for their church — your daily verse, with a congregation.`}
            onGo={() => setPendingChurch(church.id)}
          />
        ) : !loaded ? (
          <div className="skeleton" style={{ height: 90, borderRadius: 14 }} />
        ) : mine ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <p className="dim" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, textAlign: 'center' }}>
              {mine.id === church.id ? `You play for ${church.name}.` : `You play for ${mine.name}. You can still visit ${church.name}’s page.`}
            </p>
            <Button variant="secondary" full onClick={() => go(`/church/${church.id}`)}>Visit church</Button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {sent && reply ? (
              <div data-inquiry-reply style={{ display: 'grid', gap: 3 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--mint)' }}>{church.name}’s leaders replied</span>
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{reply}</p>
              </div>
            ) : sent ? (
              <p role="status" style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--mint)' }}>
                ✓ Your note is with {church.name}’s leaders.
              </p>
            ) : (
              <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--ink-dim)' }}>
                Ask {church.name}’s leaders something
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, INQUIRY_MAX))}
                  rows={3}
                  placeholder="When do you meet on Sundays? Is there something for families?"
                  style={{ resize: 'vertical' }}
                />
                <span className="faint" style={{ fontSize: 11, fontWeight: 600 }}>
                  One note per church. Only its leaders see it.
                </span>
              </label>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: sent ? '1fr' : '1fr 1fr', gap: 8 }}>
              {!sent && (
                <Button variant="secondary" full disabled={!!busy || note.trim().length < 2 || sent === null} onClick={send}>
                  {busy === 'send' ? 'Sending…' : 'Inquire'}
                </Button>
              )}
              <Button variant="gold" full disabled={!!busy} onClick={join}>
                {busy === 'join' ? 'Joining…' : 'Join'}
              </Button>
            </div>
            <span className="faint" style={{ fontSize: 11.5, lineHeight: 1.45, textAlign: 'center' }}>
              Join to play the daily verse with {church.name} — the points you give build its church.
            </span>
            <button className="faint" onClick={() => go(`/church/${church.id}`)} style={{ justifySelf: 'center', padding: 0, fontSize: 12, fontWeight: 700, color: 'var(--ink-dim)', cursor: 'pointer' }}>
              Visit the church’s page
            </button>
          </div>
        )}
        {err && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--coral)', textAlign: 'center' }}>{err}</p>}
        <button className="pill" onClick={onClose} style={{ justifySelf: 'center', fontSize: 13, fontWeight: 800, padding: '8px 16px' }}>Back</button>
      </motion.div>
    </div>
  )
}
