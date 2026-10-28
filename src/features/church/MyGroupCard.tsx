import { useEffect, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { useJuice } from '@/juice/useJuice'
import { todayLocalDate } from '@/lib/date'
import { fetchMyGroup, fetchMyGroupQuiet, type GroupPerson, type MyGroup } from '@/store/churchAdmin'
import { CHECK_IN_DRAFT, CHECK_IN_FAIL, CHECK_IN_MAX, CHECK_IN_VERSE_DRAFT, useChurchCheckIns } from '@/store/churchCheckIns'
import { useChurchVerse } from '@/store/churchVerse'

// "Your group" — on the church tab, for a GROUP LEADER only (0151).
//
// `my_church_group` answers null for everybody who leads no group, so a
// regular member never sees this card, and neither does a guest or an
// unverified church. What a group leader gets is their group by name and face
// — never a score, a last-played day or a streak, so they learn nothing about
// their people that the church's leadership didn't already choose to show —
// and the discussion questions leadership approved for today and the six days
// after, with the day's reference so the group knows what they're reading.
//
// Who is in which group is leadership's to change (People → Small groups);
// nothing here edits anything.
//
// "Haven't played this week" (0156, `my_church_group_quiet`): the group's own
// members with no play in seven days — the SAME rule as leadership's folded
// "Not active this week" — by name and face, with no streak, no score and no
// last-played day. Folded behind one tap like the leadership fold, and empty
// means the line is simply absent. Each name offers "Send a note": the
// leadership check-in, sent through `send_group_check_in`, which refuses
// anybody outside this leader's group.

const day = (iso: string, today: string) => {
  if (iso === today) return 'Today'
  const [y, m, d] = iso.split('-').map(Number)
  return y && m && d ? new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) : iso
}

export function MyGroupCard({ churchId }: { churchId: string }) {
  const [g, setG] = useState<MyGroup | null>(null)
  const [quiet, setQuiet] = useState<GroupPerson[] | null>(null)
  const [quietOpen, setQuietOpen] = useState(false)
  const [noteTo, setNoteTo] = useState<string | null>(null)
  const [sent, setSent] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    let alive = true
    fetchMyGroup().then((r) => { if (alive && r.ok) setG(r.data) })
    fetchMyGroupQuiet().then((r) => { if (alive && r.ok) setQuiet(r.data) })
    return () => { alive = false }
  }, [churchId])
  if (!g) return null

  return (
    <section className="card" data-my-group aria-label={`Your group: ${g.name}`} style={{ padding: '12px 14px', display: 'grid', gap: 10, minWidth: 0 }}>
      <div>
        <div className="faint" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>You lead a small group</div>
        <b style={{ fontSize: 16, overflowWrap: 'anywhere' }}>{g.name}</b>
        {g.description && <div className="dim" style={{ fontSize: 12.5, lineHeight: 1.45 }}>{g.description}</div>}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {g.members.map((m) => (
          <span key={m.username} data-my-group-member={m.username} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, minWidth: 0 }}>
            <Avatar emoji={m.avatarEmoji ?? '🙂'} character={m.avatarCharacter} username={m.isMe ? null : m.username} size={28} />
            <span>
              {m.isMe ? 'You' : m.username}
              {m.role === 'leader' && !m.isMe && <span className="faint" style={{ fontWeight: 700 }}> · leader</span>}
            </span>
          </span>
        ))}
      </div>

      {quiet && quiet.length > 0 && (
        <div data-group-quiet style={{ display: 'grid', gap: 6 }}>
          <button
            className="pill"
            aria-expanded={quietOpen}
            onClick={() => setQuietOpen((o) => !o)}
            style={{ justifySelf: 'start', fontSize: 12.5, fontWeight: 800, padding: '5px 11px' }}
          >
            🕊️ Haven’t played this week · {quiet.length} {quietOpen ? '▴' : '▾'}
          </button>
          {quietOpen && quiet.map((m) => (
            <div key={m.username} data-group-quiet-member={m.username} style={{ display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <Avatar emoji={m.avatarEmoji ?? '🙂'} character={m.avatarCharacter} username={m.username} size={28} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.username}</span>
                {sent.has(m.username)
                  ? <span className="faint" style={{ fontSize: 12, fontWeight: 700 }}>Sent ✓</span>
                  : noteTo !== m.username && (
                    <button className="pill" onClick={() => setNoteTo(m.username)} style={{ fontSize: 12, fontWeight: 800, padding: '5px 10px', flexShrink: 0 }}>
                      Send a note
                    </button>
                  )}
              </div>
              {noteTo === m.username && (
                <GroupNote
                  username={m.username}
                  onCancel={() => setNoteTo(null)}
                  onSent={() => { setSent((x) => new Set(x).add(m.username)); setNoteTo(null) }}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {g.discussion.length === 0 ? (
        <p className="faint" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45 }}>
          No discussion questions this week yet — your church’s leaders add them beside the day’s verse.
        </p>
      ) : (
        g.discussion.map((d) => (
          <div key={d.date} data-discussion-day={d.date} style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 800 }}>
              {day(d.date, g.today)} · {d.reference}
              {d.series && <span className="faint" style={{ fontWeight: 700 }}> · {d.series}</span>}
            </div>
            <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 4, fontSize: 13.5, lineHeight: 1.45 }}>
              {d.questions.map((q, i) => <li key={i}>{q}</li>)}
            </ol>
          </div>
        ))
      )}
      <p className="faint" style={{ margin: 0, fontSize: 11, lineHeight: 1.45 }}>
        Only you and your church’s leaders see this. Open questions — there’s no right answer to get.
      </p>
    </section>
  )
}

// The group leader's check-in: today's church verse attached when there is one
// (switchable), a line they edit, sent only by the button. The server copies
// the verse itself and refuses a name outside this leader's group.
function GroupNote({ username, onCancel, onSent }: { username: string; onCancel: () => void; onSent: () => void }) {
  const juice = useJuice()
  const verse = useChurchVerse((s) => s.today)
  useEffect(() => { void useChurchVerse.getState().load() }, [])
  const [attach, setAttach] = useState(true)
  const [text, setText] = useState(verse ? CHECK_IN_VERSE_DRAFT : CHECK_IN_DRAFT)
  // The verse can arrive after the note opens: swap the untouched draft for the verse's line.
  useEffect(() => { if (verse) setText((t) => (t === CHECK_IN_DRAFT ? CHECK_IN_VERSE_DRAFT : t)) }, [verse])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const withVerse = !!verse && attach

  const send = async () => {
    setBusy(true); setError(null)
    const r = await useChurchCheckIns.getState().sendGroup(username, text, { attachVerse: withVerse, localDate: todayLocalDate() })
    setBusy(false)
    if (r.ok) { juice.select?.(); onSent() } else setError(CHECK_IN_FAIL[r.reason ?? 'failed'])
  }

  return (
    <div data-group-note className="card" style={{ display: 'grid', gap: 8, padding: '10px 12px', background: 'var(--card-raised)' }}>
      {verse && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700 }}>
          <input
            type="checkbox"
            checked={attach}
            onChange={(e) => {
              setAttach(e.target.checked)
              if (!e.target.checked && text.trim() === CHECK_IN_VERSE_DRAFT) setText(CHECK_IN_DRAFT)
              if (e.target.checked && text.trim() === CHECK_IN_DRAFT) setText(CHECK_IN_VERSE_DRAFT)
            }} style={{ width: 16, height: 16, margin: 0, flexShrink: 0 }} />
          Include today’s verse ({verse.reference})
        </label>
      )}
      <textarea
        aria-label={`A note to ${username}`}
        value={text}
        rows={2}
        onChange={(e) => setText(e.target.value.slice(0, CHECK_IN_MAX))}
        style={{ resize: 'vertical', minWidth: 0, font: 'inherit', fontSize: 14 }}
      />
      <span className="faint" style={{ fontSize: 11 }}>It arrives in {username}’s mailbox from you{withVerse ? ', with the verse' : ''}.</span>
      {error && <span role="status" style={{ fontSize: 12, color: 'var(--coral)' }}>{error}</span>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="pill" disabled={busy || (!withVerse && !text.trim())} onClick={() => void send()} style={{ fontSize: 12, fontWeight: 800, padding: '5px 11px' }}>
          {busy ? 'Sending…' : 'Send'}
        </button>
        <button className="pill" disabled={busy} onClick={onCancel} style={{ fontSize: 12, padding: '5px 11px' }}>Cancel</button>
      </div>
    </div>
  )
}
