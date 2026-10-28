import { useCallback, useEffect, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { Collapsible } from '@/components/Collapsible'
import { useJuice } from '@/juice/useJuice'
import { prayerCategoryById } from '@/data/prayerWall'
import { fetchChurchPrayerList, markChurchPrayer, type PastoralPrayer } from '@/store/churchAdmin'
import { ago } from '../ChurchLife'

// The pastoral prayer list (0153), on the People tab under Small groups:
// folded, and deliberately with no number on its header.
//
// It shows the Prayer Wall notes this church's members SIGNED in the last
// thirty days, newest first — the note, who left it, when. An unsigned note is
// anonymous to everybody, church-mates included, so it never appears here
// with a name on it; it stays on the wall. Nothing here counts kneelings or
// orders anybody by them.
//
// "I've prayed" is the leader's own tick and nothing more: it is not a
// kneeling (no XP, the member's lantern does not light, their tally does not
// move), no other leader sees it, and it is never drawn anywhere but here.

export function PrayerListSection({ churchId }: { churchId: string }) {
  const juice = useJuice()
  const [notes, setNotes] = useState<PastoralPrayer[] | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    const r = await fetchChurchPrayerList(churchId)
    if (r.ok) { setNotes(r.data); setFailed(false) } else setFailed(true)
  }, [churchId])
  useEffect(() => { void load() }, [load])

  const toggle = async (n: PastoralPrayer) => {
    const next = !n.prayed
    setNotes((cur) => cur?.map((x) => (x.id === n.id ? { ...x, prayed: next } : x)) ?? cur)
    const r = await markChurchPrayer(churchId, n.id, next)
    if (!r.ok) { await load(); return }
    if (next) juice.select?.()
  }

  return (
    <Collapsible icon="🕯️" title="Prayer list">
      <div data-prayer-list style={{ display: 'grid', gap: 8, minWidth: 0 }}>
        <p className="dim" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5 }}>
          Notes your members signed on the Prayer Wall this past month. Unsigned notes stay anonymous and aren’t
          shown here. “I’ve prayed” is only for you — the member isn’t told and nobody else sees it.
        </p>
        {failed && <p className="dim" style={{ margin: 0, fontSize: 13 }}>Couldn’t load the prayer list. Try again in a moment.</p>}
        {!notes && !failed && <div className="skeleton" style={{ height: 60, borderRadius: 12 }} />}
        {notes && notes.length === 0 && (
          <p className="dim" style={{ margin: 0, fontSize: 13 }}>No signed notes from your members this month.</p>
        )}
        {notes?.map((n) => {
          const cat = prayerCategoryById(n.category)
          return (
            <div key={n.id} data-prayer-note={n.username} className="card" style={{ padding: '10px 12px', display: 'grid', gap: 6, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <Avatar emoji={n.avatarEmoji ?? '🙂'} character={n.avatarCharacter} username={n.username} size={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.username}</div>
                  <div className="faint" style={{ fontSize: 11.5 }}>
                    {cat.emoji} {cat.label} · {ago(n.createdAt)}
                    {n.state === 'answered' ? ' · answered' : n.state === 'ended' ? ' · off the wall' : ''}
                  </div>
                </div>
                <button
                  className="pill"
                  aria-pressed={n.prayed}
                  onClick={() => void toggle(n)}
                  style={{ fontSize: 11.5, fontWeight: 800, padding: '5px 10px', flexShrink: 0, ...(n.prayed ? { background: 'var(--select)' } : {}) }}
                >
                  {n.prayed ? '✓ Prayed' : 'I’ve prayed'}
                </button>
              </div>
              {n.line
                ? <div style={{ fontSize: 13.5, lineHeight: 1.45, overflowWrap: 'anywhere' }}>{n.line}</div>
                : <div className="dim" style={{ fontSize: 12.5 }}>{cat.ask}</div>}
            </div>
          )
        })}
      </div>
    </Collapsible>
  )
}
