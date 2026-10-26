import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Collapsible } from '@/components/Collapsible'
import { useJuice } from '@/juice/useJuice'
import { fetchChurchLeaders, grantCoLeader, removeCoLeader, type ChurchLeader, type InsightMember } from '@/store/churchAdmin'

// The church's leadership, managed by its leadership (0147).
//
// Top of the People tab, folded, with the head count on the header (the
// roster's own convention). A verified leader can add a co-leader — a member
// picked from the roster below, or any account by username, because staff
// often have not joined the church in the app — and can remove another leader
// or step down themselves. The server re-checks all of it; what this screen
// adds is the confirm step, because a grant hands somebody every member's name.
//
// Two refusals are drawn before anyone taps rather than after: the LAST
// leader cannot leave (a church with no leadership needs the operator to
// recover), and the leader whose Apple ID pays for the church cannot be
// removed (0140 would end that subscription's hold and could un-verify the
// church for everybody, including whoever pressed the button).

const FAIL: Record<string, string> = {
  user_not_found: 'There’s no account with that username.',
  already: 'They’re already a leader here.',
  too_many: 'A church can have twelve leaders. Remove one first.',
  daily_cap: 'That’s ten new leaders today. Try again tomorrow.',
  last_leader: 'A church needs at least one leader.',
  apple_payer: 'Their Apple ID pays for this church. They cancel through Apple first, or contact us.',
  not_leader: 'They aren’t a leader here any more.',
  not_leadership: 'Only this church’s leadership can do that.',
  not_verified: 'Co-leaders open once the church is verified.',
}
const failText = (reason: string) => FAIL[reason] ?? 'That didn’t go through. Try again in a moment.'

export function LeadersSection({
  churchId,
  churchName,
  roster,
  onChanged,
}: {
  churchId: string
  churchName: string
  /** The members, for picking one; leaders are filtered out. */
  roster: InsightMember[]
  /** Re-read the roster so its "· leader" tags follow. */
  onChanged: () => void
}) {
  const juice = useJuice()
  const navigate = useNavigate()
  const [leaders, setLeaders] = useState<ChurchLeader[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [name, setName] = useState('')
  const [pending, setPending] = useState<{ kind: 'add'; username: string; member: boolean | null } | { kind: 'remove'; leader: ChurchLeader } | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const r = await fetchChurchLeaders(churchId)
    if (r.ok) { setLeaders(r.data); setFailed(false) } else setFailed(true)
  }, [churchId])
  useEffect(() => { void load() }, [load])

  const leaderNames = useMemo(() => new Set((leaders ?? []).map((l) => l.username.toLowerCase())), [leaders])
  const typed = name.trim().replace(/^@/, '')
  const suggestions = useMemo(() => {
    const q = typed.toLowerCase()
    return roster
      .filter((m) => !m.leader && !leaderNames.has(m.username.toLowerCase()))
      .filter((m) => !q || m.username.toLowerCase().includes(q))
      .slice(0, 6)
  }, [roster, leaderNames, typed])

  const ask = (username: string) => {
    juice.select?.()
    setNote(null)
    const inRoster = roster.find((m) => m.username.toLowerCase() === username.toLowerCase())
    setPending({ kind: 'add', username: inRoster?.username ?? username, member: inRoster ? true : null })
  }

  const confirm = async () => {
    if (!pending) return
    setBusy(true)
    if (pending.kind === 'add') {
      const r = await grantCoLeader(churchId, pending.username)
      setBusy(false)
      setPending(null)
      if (!r.ok) { setNote({ ok: false, text: failText(r.reason) }); return }
      juice.select?.()
      setName('')
      setNote({ ok: true, text: `${r.data.username} is now a leader of ${churchName}.${r.data.member ? '' : ' They haven’t joined the church in the app yet.'}` })
    } else {
      const who = pending.leader
      const r = await removeCoLeader(churchId, who.username)
      setBusy(false)
      setPending(null)
      if (!r.ok) { setNote({ ok: false, text: failText(r.reason) }); return }
      if (r.data.self) { navigate(`/church/${churchId}`); return }
      setNote({ ok: true, text: `${who.username} is no longer a leader here.` })
    }
    await load()
    onChanged()
  }

  const count = leaders?.length ?? 0
  const last = count <= 1

  return (
    <Collapsible icon="🗝️" title="Leaders" meta={leaders ? count.toLocaleString() : undefined}>
      <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
        {failed && <p className="dim" style={{ margin: 0, fontSize: 13 }}>Couldn’t load the leaders. Try again in a moment.</p>}
        {!leaders && !failed && <div className="skeleton" style={{ height: 52, borderRadius: 12 }} />}
        {leaders?.map((l) => {
          const blocked = l.applePayer ? 'Pays through Apple' : last ? 'Only leader' : null
          return (
            <div key={l.username} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', minWidth: 0 }}>
              <Avatar emoji={l.avatarEmoji ?? '🙂'} character={l.avatarCharacter} username={l.isMe ? null : l.username} size={34} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {l.username}{l.isMe && <span className="faint" style={{ fontWeight: 700, fontSize: 11.5 }}> · you</span>}
                </div>
                <div className="faint" style={{ fontSize: 11.5 }}>
                  {l.grantedBy ? `Added by ${l.grantedBy}` : 'Verified by Verse Arcade'}
                  {!l.member ? ' · not a member in the app' : ''}
                  {l.applePayer ? ' · pays through Apple' : ''}
                </div>
              </div>
              {blocked ? (
                <span className="faint" style={{ fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{blocked}</span>
              ) : (
                <button
                  className="pill"
                  disabled={busy}
                  onClick={() => { juice.select?.(); setNote(null); setPending({ kind: 'remove', leader: l }) }}
                  style={{ fontSize: 12, fontWeight: 800, padding: '6px 11px', flexShrink: 0 }}
                >
                  {l.isMe ? 'Step down' : 'Remove'}
                </button>
              )}
            </div>
          )
        })}

        {pending && (
          <div className="card" role="alertdialog" aria-label="Confirm" style={{ padding: '12px 14px', display: 'grid', gap: 8, border: '1px solid var(--edge)' }}>
            {pending.kind === 'add' ? (
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>
                Make <b>{pending.username}</b> a leader of {churchName}? They’ll see this dashboard — every member by
                name, the schedule and the notices — and can add or remove leaders too.
                {pending.member === null && <span className="dim"> They’re not in your roster, so check the username is right.</span>}
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>
                {pending.leader.isMe
                  ? <>Step down as a leader of {churchName}? You’ll lose this dashboard straight away.</>
                  : <>Remove <b>{pending.leader.username}</b> as a leader? They’ll lose this dashboard straight away.</>}
              </p>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant={pending.kind === 'add' ? 'gold' : 'secondary'} disabled={busy} onClick={() => void confirm()}>
                {busy ? 'Saving…' : pending.kind === 'add' ? 'Make leader' : pending.leader.isMe ? 'Step down' : 'Remove'}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setPending(null)}>Cancel</Button>
            </div>
          </div>
        )}

        {!pending && leaders && (
          <form
            onSubmit={(e) => { e.preventDefault(); if (typed) ask(typed) }}
            style={{ display: 'grid', gap: 6, marginTop: 4 }}
          >
            <label className="dim" htmlFor="co-leader" style={{ fontSize: 12.5, fontWeight: 700 }}>Add a co-leader</label>
            <div style={{ display: 'flex', gap: 8, minWidth: 0 }}>
              <input
                id="co-leader"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Pick a member or type a username"
                autoComplete="off"
                autoCapitalize="none"
                style={{ flex: 1, minWidth: 0 }}
              />
              <Button variant="secondary" disabled={!typed} type="submit">Add</Button>
            </div>
            {suggestions.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {suggestions.map((m) => (
                  <button key={m.username} type="button" className="pill" onClick={() => ask(m.username)} style={{ fontSize: 12, padding: '5px 10px' }}>
                    {m.username}
                  </button>
                ))}
              </div>
            )}
          </form>
        )}

        {note && <div style={{ fontSize: 12.5, lineHeight: 1.45, color: note.ok ? 'var(--mint)' : 'var(--coral)' }}>{note.text}</div>}
      </div>
    </Collapsible>
  )
}
