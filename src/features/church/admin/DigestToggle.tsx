import { useEffect, useState } from 'react'
import { useJuice } from '@/juice/useJuice'
import { fetchDigestSetting, sendDigestTest, setDigest } from '@/store/churchAdmin'

// "Email me the Monday digest" — under Home's "This week" list (0154,
// docs/CHURCH-DIGEST.md). Default OFF, and PER LEADER: this switch is your
// own inbox for this church; a co-leader decides for theirs.
//
// The email carries the rows above it that the digest shares with Home (the
// sermon week / Autopilot line, drafts, flagged questions, inquiries, the
// quiet count), each a link back onto the tab its row opens. "Send me this
// week's now" is the same email, on demand, to your own address.
//
// Verified leadership only: a free claim's read comes back refused and this
// draws nothing.

const FAIL: Record<string, string> = {
  no_provider: 'Email isn’t switched on for the app yet — your setting is saved and the first Monday after it is, it’ll arrive.',
  no_email: 'Your account has no email address to send to.',
  not_verified: 'The digest is for verified churches.',
  not_leadership: 'Only this church’s leadership gets the digest.',
}

export function DigestToggle({ churchId }: { churchId: string }) {
  const juice = useJuice()
  const [on, setOn] = useState<boolean | null>(null)
  const [hasEmail, setHasEmail] = useState(true)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let alive = true
    fetchDigestSetting(churchId).then((r) => {
      if (!alive || !r.ok) return
      setOn(r.data.enabled); setHasEmail(r.data.hasEmail)
    })
    return () => { alive = false }
  }, [churchId])

  if (on === null) return null

  const flip = async () => {
    const next = !on
    setOn(next); setBusy(true); setNote(null)
    const r = await setDigest(churchId, next)
    setBusy(false)
    if (!r.ok) { setOn(!next); setNote({ ok: false, text: FAIL[r.reason] ?? 'That didn’t save. Try again in a moment.' }); return }
    juice.select?.()
  }
  const test = async () => {
    setBusy(true); setNote(null)
    const r = await sendDigestTest(churchId)
    setBusy(false)
    setNote(r.ok ? { ok: true, text: `Sent to ${r.data.to ?? 'your email'}.` } : { ok: false, text: FAIL[r.reason] ?? 'That didn’t send. Try again in a moment.' })
  }

  return (
    <div className="card" data-digest style={{ display: 'grid', gap: 8, padding: '11px 13px' }}>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
        <input type="checkbox" checked={on} disabled={busy || !hasEmail} onChange={() => void flip()} style={{ marginTop: 3, width: 18, height: 18, flexShrink: 0, padding: 0 }} />
        <span style={{ minWidth: 0 }}>
          <b style={{ display: 'block', fontSize: 14 }}>Email me the Monday digest</b>
          <span className="dim" style={{ display: 'block', fontSize: 12.5, lineHeight: 1.45, marginTop: 2 }}>
            Monday morning: your sermon week, drafts, flagged questions, inquiries and how many could use a check-in
            (never names), each a link back here. Just to you — other leaders choose for themselves.
          </span>
        </span>
      </label>
      {!hasEmail && <span className="dim" style={{ fontSize: 12.5 }}>Your account has no email address, so there’s nowhere to send it.</span>}
      {on && (
        <button className="pill" disabled={busy} onClick={() => void test()} style={{ justifySelf: 'start', fontSize: 12.5, fontWeight: 800 }}>
          {busy ? 'Sending…' : 'Send me this week’s now'}
        </button>
      )}
      {note && <div role="status" style={{ fontSize: 12.5, lineHeight: 1.45, color: note.ok ? 'var(--mint)' : 'var(--coral)' }}>{note.text}</div>}
    </div>
  )
}
