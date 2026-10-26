import { useEffect, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { fetchMyGroup, type MyGroup } from '@/store/churchAdmin'

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

const day = (iso: string, today: string) => {
  if (iso === today) return 'Today'
  const [y, m, d] = iso.split('-').map(Number)
  return y && m && d ? new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) : iso
}

export function MyGroupCard({ churchId }: { churchId: string }) {
  const [g, setG] = useState<MyGroup | null>(null)
  useEffect(() => {
    let alive = true
    fetchMyGroup().then((r) => { if (alive && r.ok) setG(r.data) })
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
