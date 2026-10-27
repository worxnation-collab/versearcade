import { useCallback, useEffect, useMemo, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Collapsible } from '@/components/Collapsible'
import { useJuice } from '@/juice/useJuice'
import {
  archiveChurchGroup,
  fetchChurchGroups,
  GROUP_DESC_MAX,
  GROUP_NAME_MAX,
  saveChurchGroup,
  setGroupMember,
  type ChurchGroup,
  type InsightMember,
} from '@/store/churchAdmin'

// Small groups (0151), on the People tab under Leaders: folded, with the
// number of groups on the header.
//
// Verified leadership names a group, adds members to it from the roster, and
// marks one or more of them as the group's leader. A member is in ONE group:
// adding somebody who is already in another group moves them, and the picker
// says where they are now so that is never a surprise. Retiring a group
// leaves its people unassigned; nothing is lost from anybody's own record.
//
// What a group leader then gets is their group by name and the week's
// discussion questions, on their own church tab (`MyGroupCard`) — names and
// faces, no number about anybody. Nothing here orders people by anything but
// leader-first and then the alphabet.

const FAIL: Record<string, string> = {
  bad_name: 'Give the group a name first.',
  too_many: 'A church can have forty groups. Retire one first.',
  not_found: 'That group isn’t here any more.',
  not_member: 'They aren’t a member of the church any more.',
  not_leadership: 'Only this church’s leadership can do that.',
  not_verified: 'Groups open once the church is verified.',
}
const failText = (reason: string) => FAIL[reason] ?? 'That didn’t go through. Try again in a moment.'

export function GroupsSection({ churchId, roster }: { churchId: string; roster: InsightMember[] }) {
  const juice = useJuice()
  const [groups, setGroups] = useState<ChurchGroup[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [editing, setEditing] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await fetchChurchGroups(churchId)
    if (r.ok) { setGroups(r.data); setFailed(false) } else setFailed(true)
  }, [churchId])
  useEffect(() => { void load() }, [load])

  /** Which group each member is in now, by lowercased username. */
  const where = useMemo(() => {
    const m = new Map<string, string>()
    for (const g of groups ?? []) for (const p of g.members) m.set(p.username.toLowerCase(), g.name)
    return m
  }, [groups])

  const run = async (work: () => Promise<{ ok: true } | { ok: false; reason: string }>, done?: string) => {
    setBusy(true); setNote(null)
    const r = await work()
    setBusy(false)
    if (!r.ok) { setNote({ ok: false, text: failText(r.reason) }); return false }
    juice.select?.()
    if (done) setNote({ ok: true, text: done })
    await load()
    return true
  }

  const create = async () => {
    const n = name.trim()
    if (!n) return
    const ok = await run(async () => saveChurchGroup(churchId, { name: n, description: desc }), `${n} is ready — add its people below.`)
    if (ok) { setName(''); setDesc('') }
  }

  return (
    <Collapsible icon="👥" title="Small groups" meta={groups ? groups.length.toLocaleString() : undefined}>
      <div data-groups style={{ display: 'grid', gap: 10, minWidth: 0 }}>
        <p className="dim" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5 }}>
          Sort your members into groups and pick who leads each one. A group leader sees their group’s names and the
          week’s discussion questions on their church tab — nobody’s scores. Each member is in one group.
        </p>
        {failed && <p className="dim" style={{ margin: 0, fontSize: 13 }}>Couldn’t load the groups. Try again in a moment.</p>}
        {!groups && !failed && <div className="skeleton" style={{ height: 60, borderRadius: 12 }} />}

        {groups?.map((g) => (
          <GroupCard
            key={g.id}
            group={g}
            roster={roster}
            where={where}
            busy={busy}
            editing={editing === g.id}
            onEdit={(on) => setEditing(on ? g.id : null)}
            onRename={(n, d) => run(async () => saveChurchGroup(churchId, { id: g.id, name: n, description: d })).then((ok) => { if (ok) setEditing(null) })}
            onRetire={() => void run(() => archiveChurchGroup(churchId, g.id), `${g.name} is retired. Its people are unassigned.`)}
            onAdd={(u) => void run(() => setGroupMember(churchId, u, g.id, 'member'))}
            onRole={(u, role) => void run(() => setGroupMember(churchId, u, g.id, role))}
            onRemove={(u) => void run(() => setGroupMember(churchId, u, null))}
          />
        ))}

        {groups && (
          <form
            onSubmit={(e) => { e.preventDefault(); void create() }}
            className="card"
            style={{ display: 'grid', gap: 6, padding: '10px 12px' }}
          >
            <label className="dim" htmlFor="new-group" style={{ fontSize: 12.5, fontWeight: 700 }}>New group</label>
            <input
              id="new-group"
              value={name}
              maxLength={GROUP_NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tuesday men’s group"
              autoComplete="off"
              style={{ minWidth: 0 }}
            />
            <input
              aria-label="Description (optional)"
              value={desc}
              maxLength={GROUP_DESC_MAX}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="When and where they meet (optional)"
              autoComplete="off"
              style={{ minWidth: 0 }}
            />
            <Button variant="secondary" type="submit" disabled={busy || !name.trim()}>Create group</Button>
          </form>
        )}

        {note && <div role="status" style={{ fontSize: 12.5, lineHeight: 1.45, color: note.ok ? 'var(--mint)' : 'var(--coral)' }}>{note.text}</div>}
      </div>
    </Collapsible>
  )
}

function GroupCard({
  group: g, roster, where, busy, editing, onEdit, onRename, onRetire, onAdd, onRole, onRemove,
}: {
  group: ChurchGroup
  roster: InsightMember[]
  where: Map<string, string>
  busy: boolean
  editing: boolean
  onEdit: (on: boolean) => void
  onRename: (name: string, description: string) => void
  onRetire: () => void
  onAdd: (username: string) => void
  onRole: (username: string, role: 'member' | 'leader') => void
  onRemove: (username: string) => void
}) {
  const [pick, setPick] = useState('')
  const [n, setN] = useState(g.name)
  const [d, setD] = useState(g.description ?? '')
  const [retiring, setRetiring] = useState(false)
  const inHere = new Set(g.members.map((m) => m.username.toLowerCase()))
  // Unassigned members first, then those in another group (adding moves them).
  const options = roster
    .filter((m) => !inHere.has(m.username.toLowerCase()))
    .sort((a, b) => Number(where.has(a.username.toLowerCase())) - Number(where.has(b.username.toLowerCase())))
  const leaders = g.members.filter((m) => m.role === 'leader').length

  return (
    <div className="card" data-group={g.name} style={{ padding: '10px 12px', display: 'grid', gap: 8, minWidth: 0 }}>
      {editing ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <input aria-label="Group name" value={n} maxLength={GROUP_NAME_MAX} onChange={(e) => setN(e.target.value)} style={{ minWidth: 0 }} />
          <input aria-label="Group description" value={d} maxLength={GROUP_DESC_MAX} onChange={(e) => setD(e.target.value)} placeholder="When and where they meet (optional)" style={{ minWidth: 0 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" disabled={busy || !n.trim()} onClick={() => onRename(n.trim(), d)}>Save</Button>
            <Button variant="ghost" disabled={busy} onClick={() => { setN(g.name); setD(g.description ?? ''); onEdit(false) }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ fontSize: 14.5, overflowWrap: 'anywhere' }}>{g.name}</b>
            <div className="faint" style={{ fontSize: 11.5 }}>
              {g.members.length === 0 ? 'Nobody yet' : `${g.members.length} ${g.members.length === 1 ? 'person' : 'people'}`}
              {g.members.length > 0 && leaders === 0 ? ' · no leader yet' : ''}
            </div>
            {g.description && <div className="dim" style={{ fontSize: 12.5, lineHeight: 1.45, marginTop: 2 }}>{g.description}</div>}
          </div>
          <button className="pill" disabled={busy} onClick={() => onEdit(true)} style={{ fontSize: 11.5, fontWeight: 800, padding: '5px 10px', flexShrink: 0 }}>Rename</button>
        </div>
      )}

      {g.members.map((m) => (
        <div key={m.username} data-group-member={m.username} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <Avatar emoji={m.avatarEmoji ?? '🙂'} character={m.avatarCharacter} username={m.username} size={30} />
          <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {m.username}
            {m.role === 'leader' && <span style={{ color: 'var(--gold)', fontSize: 11.5, fontWeight: 800 }}> · group leader</span>}
          </div>
          <button
            className="pill"
            disabled={busy}
            aria-pressed={m.role === 'leader'}
            onClick={() => onRole(m.username, m.role === 'leader' ? 'member' : 'leader')}
            style={{ fontSize: 11.5, fontWeight: 800, padding: '5px 9px', flexShrink: 0 }}
          >
            {m.role === 'leader' ? 'Not leader' : 'Make leader'}
          </button>
          <button
            className="pill"
            disabled={busy}
            aria-label={`Take ${m.username} out of ${g.name}`}
            onClick={() => onRemove(m.username)}
            style={{ fontSize: 11.5, fontWeight: 800, padding: '5px 9px', flexShrink: 0 }}
          >
            ✕
          </button>
        </div>
      ))}

      {options.length > 0 && (
        <div style={{ display: 'flex', gap: 8, minWidth: 0 }}>
          <select
            aria-label={`Add a member to ${g.name}`}
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            style={{ flex: 1, minWidth: 0 }}
          >
            <option value="">Add a member…</option>
            {options.map((m) => {
              const other = where.get(m.username.toLowerCase())
              return <option key={m.username} value={m.username}>{m.username}{other ? ` (moves from ${other})` : ''}</option>
            })}
          </select>
          <Button variant="secondary" disabled={busy || !pick} onClick={() => { onAdd(pick); setPick('') }}>Add</Button>
        </div>
      )}

      {retiring ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5 }}>Retire {g.name}? Its people become unassigned.</span>
          <Button variant="secondary" disabled={busy} onClick={() => { setRetiring(false); onRetire() }}>Retire</Button>
          <Button variant="ghost" disabled={busy} onClick={() => setRetiring(false)}>Cancel</Button>
        </div>
      ) : (
        !editing && (
          <button className="faint" disabled={busy} onClick={() => setRetiring(true)} style={{ justifySelf: 'start', padding: 0, fontSize: 11.5, fontWeight: 700, color: 'var(--ink-dim)', cursor: 'pointer' }}>
            Retire this group
          </button>
        )
      )}
    </div>
  )
}
