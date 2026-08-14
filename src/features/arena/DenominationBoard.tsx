import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Avatar } from '@/components/Avatar'
import { useBattles, type DenomBoard, type DenomMemberRow } from '@/store/battles'
import { DENOMINATIONS, denominationColor, denominationName } from '@/data/denominations'
import { useJuice } from '@/juice/useJuice'

// The Battle tab's home for denominations: join your tradition, then see the
// faction standings where each denomination expands into a per-player table of
// members and their battle records. (Denominations live here only — never on the
// encouragement-first main leaderboard, and no longer on the profile.)
export default function DenominationBoard({
  board,
  myDenom,
  onSetDenom,
}: {
  board: DenomBoard | null
  myDenom: string | null
  onSetDenom: (key: string | null) => void
}) {
  const juice = useJuice()
  const [picking, setPicking] = useState(false)
  const joined = !!myDenom

  const choose = (key: string) => {
    juice.coin()
    onSetDenom(key)
    setPicking(false)
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {/* Join prompt / current membership */}
      {!joined ? (
        <div className="card" style={{ borderColor: 'var(--gold)', background: 'rgba(255,210,63,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 30 }}>🛡️</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>Join your denomination</b>
              <p className="faint" style={{ fontSize: 12, marginTop: 3, lineHeight: 1.4 }}>
                Represent your tradition on the battle ranks. Every win you earn adds to your team’s total.
              </p>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <DenomPicker current={null} onChoose={choose} />
          </div>
        </div>
      ) : (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, background: denominationColor(myDenom), boxShadow: `0 0 8px ${denominationColor(myDenom)}` }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>You represent</div>
            <b style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
              {denominationName(myDenom)}
            </b>
          </div>
          <button
            className="pill"
            onClick={() => { juice.select(); setPicking((p) => !p) }}
            style={{ fontWeight: 800, fontSize: 12 }}
          >
            {picking ? 'Close' : 'Change'}
          </button>
        </div>
      )}

      {joined && picking && (
        <div className="card">
          <p className="faint" style={{ fontSize: 12, marginBottom: 10 }}>Switch your denomination:</p>
          <DenomPicker current={myDenom} onChoose={choose} />
          <button
            onClick={() => { juice.select(); onSetDenom(null); setPicking(false) }}
            className="pill"
            style={{ marginTop: 10, fontSize: 12 }}
          >
            Leave — prefer not to say
          </button>
        </div>
      )}

      {/* Standings — each denomination collapses open into its member table. */}
      <div className="card">
        {!board || board.top.length === 0 ? (
          <p className="faint" style={{ fontSize: 14, textAlign: 'center', padding: '4px 0' }}>
            No denominations yet — be the first to represent yours.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {board.top.map((r) => (
              <DenomRow key={r.denomination} denom={r.denomination} rank={r.rank} members={r.members} wins={r.wins} mine={board.me?.denomination === r.denomination} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function DenomPicker({ current, onChoose }: { current: string | null; onChoose: (key: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {DENOMINATIONS.map((d) => {
        const active = current === d.key
        return (
          <motion.button
            key={d.key}
            whileTap={{ scale: 0.95 }}
            onClick={() => onChoose(d.key)}
            className="pill"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700,
              background: active ? 'rgba(255,210,63,0.14)' : 'var(--card-solid)',
              border: active ? '1px solid var(--gold)' : '1px solid var(--stroke)',
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
            {d.name}
          </motion.button>
        )
      })}
    </div>
  )
}

// A single denomination in the standings — tap to expand its member table.
function DenomRow({ denom, rank, members, wins, mine }: { denom: string; rank: number; members: number; wins: number; mine: boolean }) {
  const juice = useJuice()
  const denominationMembers = useBattles((s) => s.denominationMembers)
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<DenomMemberRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const color = denominationColor(denom)

  // Lazy-load the member table the first time this denomination is expanded.
  useEffect(() => {
    if (!open || rows) return
    setLoading(true)
    denominationMembers(denom).then((m) => { setRows(m); setLoading(false) })
  }, [open, rows, denom, denominationMembers])

  return (
    <div style={{ borderRadius: 10, borderLeft: `3px solid ${color}`, background: mine ? 'rgba(255,210,63,0.08)' : 'transparent', overflow: 'hidden' }}>
      <motion.button
        whileTap={{ scale: 0.99 }}
        onClick={() => { juice.select(); setOpen((o) => !o) }}
        aria-expanded={open}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', color: 'var(--ink)' }}
      >
        <span style={{ width: 18, textAlign: 'center', fontFamily: 'var(--font-display)', color: 'var(--ink-faint)' }}>
          {rank === 1 ? '👑' : rank}
        </span>
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: `0 0 8px ${color}` }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
            {denominationName(denom)}{mine && <span style={{ color: 'var(--gold)', fontSize: 11, marginLeft: 6 }}>you</span>}
          </b>
          <span className="faint" style={{ fontSize: 11 }}>{members} member{members === 1 ? '' : 's'}</span>
        </div>
        <span className="gradient-text" style={{ fontFamily: 'var(--font-display)' }}>{wins}</span>
        <span className="faint" style={{ fontSize: 11 }}>wins</span>
        <span style={{ fontSize: 14, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: 'var(--ink-faint)' }}>▾</span>
      </motion.button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '2px 10px 10px' }}>
              {loading && !rows ? (
                <div className="center" style={{ padding: '10px 0' }}>
                  <div className="floaty" style={{ fontSize: 22 }}>🛡️</div>
                </div>
              ) : rows && rows.length > 0 ? (
                <div style={{ display: 'grid', gap: 2 }}>
                  {/* header */}
                  <div className="faint" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '2px 4px 4px', borderBottom: '1px solid var(--stroke)' }}>
                    <span style={{ width: 18, textAlign: 'center' }}>#</span>
                    <span style={{ flex: 1 }}>Player</span>
                    <span style={{ width: 44, textAlign: 'right' }}>Wins</span>
                    <span style={{ width: 54, textAlign: 'right' }}>Battles</span>
                  </div>
                  {rows.map((m) => (
                    <div key={m.username} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 4px' }}>
                      <span style={{ width: 18, textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 12, color: 'var(--ink-faint)' }}>{m.rank}</span>
                      <Avatar emoji={m.avatar_emoji} character={m.avatar_character} size={24} ring={false} />
                      <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        @{m.username}
                      </span>
                      <span style={{ width: 44, textAlign: 'right', fontFamily: 'var(--font-display)', fontSize: 14 }} className="gradient-text">{m.wins}</span>
                      <span style={{ width: 54, textAlign: 'right', fontSize: 12 }} className="faint">{m.battles}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="faint" style={{ fontSize: 12, textAlign: 'center', padding: '8px 0' }}>
                  No members have battled yet.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
