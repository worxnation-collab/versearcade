import { motion } from 'framer-motion'
import { useChurch, RADIUS_CHOICES } from '@/store/church'
import { useJuice } from '@/juice/useJuice'
import { ChurchArt } from './ChurchArt'
import { tierForLevel } from './levels'
import { formatMiles } from '@/lib/geo'
import type { Church } from '@/types'

// Churches near yours, ranked by the points their people have poured in. The
// radius is the whole point: a 40-family congregation is never going to out-XP
// a megachurch two states over, but it can absolutely out-give the one across town.
export function ChurchBoard() {
  const juice = useJuice()
  const { board, boardMe, boardTotal, boardLoading, radiusMiles, setRadius } = useChurch()

  const meInBoard = !!boardMe && board.some((c) => c.id === boardMe.id)

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        {RADIUS_CHOICES.map((r) => {
          const active = r === radiusMiles
          return (
            <motion.button
              key={r}
              whileTap={{ scale: 0.94 }}
              onClick={() => { juice.select(); setRadius(r) }}
              style={{
                padding: '7px 14px',
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 800,
                border: '1px solid var(--stroke)',
                background: active ? 'linear-gradient(180deg, var(--grape), var(--grape-deep))' : 'var(--card)',
                color: active ? '#fff' : 'var(--ink-faint)',
                boxShadow: active ? '0 4px 14px rgba(122,63,242,0.45)' : 'none',
              }}
            >
              {r} mi
            </motion.button>
          )
        })}
      </div>

      <p className="dim center" style={{ fontSize: 13, margin: '0 0 12px' }}>
        {boardLoading
          ? 'Looking around…'
          : `${boardTotal} ${boardTotal === 1 ? 'church' : 'churches'} within ${radiusMiles} miles`}
      </p>

      {!boardLoading && board.length <= 1 && (
        <div className="card center" style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 30 }}>🗺️</div>
          <p className="dim" style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5 }}>
            Yours is the only church playing within {radiusMiles} miles — so you're #1 by default.
            Invite a friend from a church down the road and give them something to chase.
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {board.map((c) => (
          <BoardRow key={c.id} church={c} />
        ))}
      </div>

      {/* Your church always gets a row, even when it's ranked below the cut. */}
      {boardMe && !meInBoard && (
        <>
          <p className="faint center" style={{ margin: '10px 0 8px', fontSize: 18, letterSpacing: 4 }}>···</p>
          <BoardRow church={boardMe} />
        </>
      )}
    </div>
  )
}

const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null)

function BoardRow({ church }: { church: Church }) {
  const mine = !!church.isMine
  const tier = tierForLevel(church.level)
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        borderColor: mine ? 'var(--gold)' : 'var(--stroke)',
        background: mine ? 'rgba(255,210,63,0.10)' : undefined,
      }}
    >
      <span
        style={{
          width: 30,
          textAlign: 'center',
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: church.rank && church.rank <= 3 ? 20 : 15,
          color: mine ? 'var(--gold)' : 'var(--ink-faint)',
          flexShrink: 0,
        }}
      >
        {medal(church.rank ?? 0) ?? church.rank}
      </span>

      <span style={{ width: 44, flexShrink: 0, display: 'grid', placeItems: 'center' }}>
        <ChurchArt level={church.level} size={44} />
      </span>

      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontWeight: 800, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {church.name}
        </span>
        <span className="faint" style={{ display: 'block', fontSize: 11.5 }}>
          LVL {church.level} · {tier.name}
          {church.miles != null && !mine ? ` · ${formatMiles(church.miles)}` : ''}
        </span>
      </span>

      <span style={{ textAlign: 'right', flexShrink: 0 }}>
        <span style={{ display: 'block', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, color: 'var(--gold)' }}>
          {church.xp.toLocaleString()}
        </span>
        <span className="faint" style={{ fontSize: 10.5 }}>
          {church.members} {church.members === 1 ? 'player' : 'players'}
        </span>
      </span>
    </motion.div>
  )
}
