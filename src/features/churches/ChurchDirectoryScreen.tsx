import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Page } from '@/components/Page'
import { useAuth } from '@/store/auth'
import { useJuice } from '@/juice/useJuice'
import { fetchChurchDirectory } from '@/store/churchPackage'
import { VerifiedBadge } from '@/features/church/VerifiedBadge'
import type { ChurchDirectoryRow } from '@/types/churchPackages'

// /churches/find — every church playing on Verse Arcade, by name. PUBLIC.
//
// The free layer's front door, and deliberately not the picker. The picker
// (`ChurchPicker`, on /church) searches 606k PLACES — every church building in
// the country — and is where a player finds a congregation nobody here has
// joined yet. This lists the CHURCHES that already exist in the app, with what
// they've published about themselves, for somebody who was told "find us on
// Verse Arcade". Each row opens /church/:id, which has the Join button.
//
// Three rules hold it:
//   • Free churches are never hidden or demoted. The order is the server's —
//     congregation size, then name — and `verified` plays no part in it. A
//     verified church gets a badge, not a better seat: ranking congregations
//     by what they paid is the auction the sponsored slot refuses (0077).
//   • No number about a person. A row is a church: a name, a town, its own
//     line about itself.
//   • It fails to an honest line. No keys, a server without 0117, a network
//     error — the list says it couldn't load, and the two doors below it
//     (the picker, and the "for churches" page) still work.
export default function ChurchDirectoryScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const juice = useJuice()
  const profile = useAuth((s) => s.profile)
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<ChurchDirectoryRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)

  // Debounced, and sequence-numbered so a slow answer to an old query can
  // never overwrite the answer to the current one.
  useEffect(() => {
    const mine = ++seq.current
    setLoading(true)
    const t = setTimeout(async () => {
      const r = await fetchChurchDirectory(q)
      if (mine !== seq.current) return
      setRows(r ?? [])
      setFailed(r === null)
      setLoading(false)
    }, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [q])

  // Same exit rule as ChurchesScreen: a cold landing has no in-app page behind it.
  const exit = () => {
    juice.select?.()
    if (location.key !== 'default') navigate(-1)
    else navigate(profile ? '/play' : '/')
  }

  const typed = q.trim().length > 0

  return (
    <Page noNav>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <button className="pill" onClick={exit} aria-label="Back">← Back</button>
      </div>

      <h1 style={{ fontSize: 26, margin: '0 0 4px' }}>Find a church</h1>
      <p className="dim" style={{ margin: '0 0 14px', fontSize: 13.5, lineHeight: 1.5 }}>
        Churches playing on Verse Arcade. Joining one is optional — the daily verse and quiz are the
        same game either way.
      </p>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Church name or town"
        aria-label="Search churches by name or town"
        autoCapitalize="none"
        autoCorrect="off"
        maxLength={80}
        style={{ width: '100%', marginBottom: 12 }}
      />

      {loading && rows === null ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 64, borderRadius: 14 }} />)}
        </div>
      ) : failed ? (
        <p className="dim center" style={{ fontSize: 13.5 }}>The list couldn't load just now.</p>
      ) : rows && rows.length > 0 ? (
        <div style={{ display: 'grid', gap: 8, opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
          {rows.map((r) => <Row key={r.id} row={r} onOpen={() => { juice.select?.(); navigate(`/church/${r.id}`) }} />)}
        </div>
      ) : (
        <p className="dim center" style={{ fontSize: 13.5 }}>
          {typed ? `No church on Verse Arcade matches “${q.trim()}” yet.` : 'No churches yet.'}
        </p>
      )}

      {/* The two doors that always work, whatever the list said. */}
      <div className="card" style={{ marginTop: 16 }}>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>Don't see yours?</b>
        <p className="dim" style={{ margin: '6px 0 10px', fontSize: 13, lineHeight: 1.5 }}>
          Every church building in the country is in the church tab's search — pick yours there and it
          joins the list.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="pill" onClick={() => navigate('/church')} style={{ fontWeight: 800 }}>
            Search every church
          </button>
          <button className="pill" onClick={() => navigate('/churches')}>
            Lead a church? Get in touch
          </button>
        </div>
      </div>
      <div style={{ height: 32 }} />
    </Page>
  )
}

function Row({ row, onOpen }: { row: ChurchDirectoryRow; onOpen: () => void }) {
  const where = [row.city, row.region].filter(Boolean).join(', ')
  return (
    <button
      onClick={onOpen}
      className="card"
      style={{ display: 'flex', gap: 12, alignItems: 'center', textAlign: 'left', width: '100%', minWidth: 0, padding: '12px 14px' }}
    >
      {row.logo_url ? (
        <img
          src={row.logo_url}
          alt=""
          draggable={false}
          loading="lazy"
          referrerPolicy="no-referrer"
          style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover', flexShrink: 0, background: 'var(--card-raised)' }}
        />
      ) : (
        <div
          aria-hidden="true"
          style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--card-raised)', fontSize: 20 }}
        >
          ⛪
        </div>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <b style={{ fontSize: 14.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</b>
          {row.verified && <VerifiedBadge />}
        </div>
        <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>{where || 'Location not listed'}</div>
        {row.tagline && (
          <div
            className="dim"
            style={{
              fontSize: 12.5,
              marginTop: 4,
              lineHeight: 1.4,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              overflowWrap: 'anywhere',
            }}
          >
            {row.tagline}
          </div>
        )}
      </div>
      <span className="faint" aria-hidden="true" style={{ flexShrink: 0 }}>›</span>
    </button>
  )
}
