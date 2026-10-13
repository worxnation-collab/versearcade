import { useEffect, useState } from 'react'
import { fetchCareList, fetchOverview, type CareRow, type Overview } from '@/store/churchAdmin'
import { isNativeApp } from '@/lib/appStore'

// How the congregation's week went — and who asked to be checked on.
//
// Two halves with two different rules, and the copy says which is which:
//
//   • The NUMBERS are congregation totals, floored server-side: below five
//     members every figure but the head count is withheld, because in a small
//     group a total names people. No per-person number appears anywhere here,
//     no ordering of members, nothing comparative — the buckets are how many
//     people are on a run of a given length, never who.
//   • The CARE LIST is people, and only people who chose it. A member is on it
//     only if they switched on "Let my church's leaders know when I've been
//     away" themselves (`church_care_optin`, off by default) AND have been away
//     three or more days. Name and last-active date, nothing else. The
//     framing is pastoral on purpose: these are people to reach out to, never
//     people who fell behind.

export function ParticipationPanel({ churchId }: { churchId: string }) {
  const [ov, setOv] = useState<Overview | null>(null)
  const [care, setCare] = useState<CareRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([fetchOverview(churchId), fetchCareList(churchId)]).then(([o, c]) => {
      if (!alive) return
      if (o.ok) setOv(o.data)
      else setFailed(true)
      setCare(c.ok ? c.data : [])
    })
    return () => { alive = false }
  }, [churchId])

  if (failed) {
    return <p className="dim" style={{ fontSize: 13.5 }}>This week's numbers couldn't load just now.</p>
  }
  if (!ov) return <div className="skeleton" style={{ height: 180, borderRadius: 14 }} />

  const copyList = async () => {
    if (!care?.length) return
    const text = care.map((r) => `${r.username} — ${lastSeen(r.lastActive)}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied('Copied — paste it into a note or a message.')
    } catch {
      setCopied('Couldn’t copy on this device — try the download instead.')
    }
  }

  const downloadList = () => {
    if (!care?.length) return
    const csv = 'name,last active\n' + care.map((r) => `${csvCell(r.username)},${r.lastActive ?? ''}`).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'check-in-list.csv'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <div className="faint" style={{ fontSize: 11.5, marginBottom: 8 }}>
          The last seven days · {pretty(ov.from)} – {pretty(ov.to)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Tile label="in your congregation" value={ov.members} />
          <Tile label="played at least once this week" value={ov.played7d} />
        </div>
        {ov.floored && (
          <p className="dim" style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.5 }}>
            The rest of these numbers appear once {ov.members === 1 ? 'there are' : 'you have'} five
            members — in a smaller group a total would point at a person, so it stays private.
          </p>
        )}
      </div>

      {ov.streaks && (
        <div>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>Daily rhythms</b>
          <p className="dim" style={{ margin: '4px 0 10px', fontSize: 12.5, lineHeight: 1.45 }}>
            How many people are on a run of days right now. Every number is a group of people, never one.
          </p>
          <Bucket label="1–3 days" n={ov.streaks.s1_3} of={ov.members} />
          <Bucket label="4–6 days" n={ov.streaks.s4_6} of={ov.members} />
          <Bucket label="7–29 days" n={ov.streaks.s7_29} of={ov.members} />
          <Bucket label="30+ days" n={ov.streaks.s30} of={ov.members} />
          <Bucket label="Not on a run right now" n={ov.streaks.none} of={ov.members} quiet />
        </div>
      )}

      <div className="card" style={{ borderColor: 'var(--edge)' }}>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>People who'd welcome a check-in</b>
        <p className="dim" style={{ margin: '4px 0 10px', fontSize: 12.5, lineHeight: 1.5 }}>
          Members who turned on “Let my church's leaders know when I've been away”, and haven't
          played in three days or more. Nobody appears here without saying yes. A kind word goes a long way.
        </p>
        {care === null ? (
          <div className="skeleton" style={{ height: 40, borderRadius: 10 }} />
        ) : care.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13.5 }}>No one on the list right now. 🙏</p>
        ) : (
          <>
            <div style={{ display: 'grid', gap: 6 }}>
              {care.map((r) => (
                <div key={r.username} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13.5 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.username}</span>
                  <span className="faint" style={{ flexShrink: 0, fontSize: 12.5 }}>{lastSeen(r.lastActive)}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button className="pill" onClick={copyList} style={{ fontWeight: 800 }}>Copy list</button>
              {/* A download link does nothing in the iOS web view (the postcard
                  scar, CLAUDE.md) — Copy is the native path. */}
              {!isNativeApp() && <button className="pill" onClick={downloadList}>Download CSV</button>}
            </div>
            {copied && <p className="faint" style={{ margin: '8px 0 0', fontSize: 12 }}>{copied}</p>}
          </>
        )}
      </div>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="card center" style={{ padding: '12px 8px' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 24 }}>{value == null ? '—' : value.toLocaleString()}</div>
      <div className="faint" style={{ fontSize: 11.5, marginTop: 2 }}>{label}</div>
    </div>
  )
}

/** A bar for a group's size against the congregation — about the group, not a person. */
function Bucket({ label, n, of, quiet }: { label: string; n: number; of: number; quiet?: boolean }) {
  const pct = of > 0 ? Math.round((n / of) * 100) : 0
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <span className={quiet ? 'dim' : undefined}>{label}</span>
        <span className="dim">{n}</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: 'var(--card-raised)', marginTop: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: quiet ? 'var(--edge)' : 'var(--mint)' }} />
      </div>
    </div>
  )
}

function lastSeen(iso: string | null): string {
  if (!iso) return 'hasn’t played yet'
  return `last here ${pretty(iso)}`
}

function pretty(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** A username can't contain a comma or quote today, but a CSV cell shouldn't rely on that. */
function csvCell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
