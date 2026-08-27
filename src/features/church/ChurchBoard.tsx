import { motion } from 'framer-motion'
import { useChurch, RADIUS_CHOICES } from '@/store/church'
import { useJuice } from '@/juice/useJuice'
import { ChurchArt } from './ChurchArt'
import { ChurchDetailSheet } from './ChurchDetailSheet'
import { tierForLevel } from './levels'
import { formatMiles } from '@/lib/geo'
import type { Church } from '@/types'

// Churches near yours, ranked by the points their people have poured in. The
// radius is the whole point: a 40-family congregation is never going to out-XP
// a megachurch two states over, but it can absolutely out-give the one across town.
// "All" opens it up to every church playing, for when you want the whole ladder.
export function ChurchBoard() {
  const juice = useJuice()
  const { board, boardMe, boardTotal, boardLoading, radiusMiles, setRadius } = useChurch()

  const meInBoard = !!boardMe && board.some((c) => c.id === boardMe.id)
  const worldwide = radiusMiles === 'all'

  return (
    <div>
      {/* Five equal columns rather than a wrapping flex row: at 360px a flex row
          drops "All" onto a line of its own, which reads like a stray control.
          minmax(0, 1fr) lets the chips shrink to fit instead of overflowing. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
          gap: 5,
          marginBottom: 12,
        }}
      >
        {RADIUS_CHOICES.map((r) => {
          const active = r === radiusMiles
          return (
            <motion.button
              key={r}
              whileTap={{ scale: 0.94 }}
              onClick={() => { juice.select(); setRadius(r) }}
              style={{
                padding: '8px 3px',
                borderRadius: 999,
                fontSize: 12,
                whiteSpace: 'nowrap',
                fontWeight: 800,
                border: '1px solid var(--stroke)',
                background: active ? 'linear-gradient(180deg, var(--grape), var(--grape-deep))' : 'var(--card)',
                color: active ? '#fff' : 'var(--ink-faint)',
                boxShadow: active ? '0 4px 14px rgba(122,63,242,0.45)' : 'none',
              }}
            >
              {r === 'all' ? 'All' : `${r} mi`}
            </motion.button>
          )
        })}
      </div>

      <p className="dim center" style={{ fontSize: 13, margin: '0 0 12px' }}>
        {boardLoading
          ? worldwide
            ? 'Counting everyone…'
            : 'Looking around…'
          : `${boardTotal.toLocaleString()} ${boardTotal === 1 ? 'church' : 'churches'} ${
              worldwide ? 'playing worldwide' : `within ${radiusMiles} miles`
            }`}
      </p>

      {!boardLoading && board.length <= 1 && (
        <div className="card center" style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 30 }}>{worldwide ? '🌍' : '🗺️'}</div>
          <p className="dim" style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5 }}>
            {worldwide
              ? "Yours is the first church on the board — every church that joins from here on is chasing you."
              : `Yours is the only church playing within ${radiusMiles} miles — so you're #1 by default. Invite a friend from a church down the road and give them something to chase.`}
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
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

      {!boardLoading && board.length > 0 && (
        <p className="faint center" style={{ margin: '10px 0 0', fontSize: 11.5 }}>
          Tap a church to see it.
        </p>
      )}

      {/* Portalled to the body, so it isn't clipped by the card the board sits in. */}
      <ChurchDetailSheet />
    </div>
  )
}

const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null)

// A row is a door: tapping it opens the church's own page — the building drawn
// wide with its congregation outside it, whatever the church has published about
// itself, and the way to ask for that to be filled in.
function BoardRow({ church }: { church: Church }) {
  const juice = useJuice()
  const openChurch = useChurch((s) => s.openChurch)
  const mine = !!church.isMine
  const tier = tierForLevel(church.level)
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.985 }}
      onClick={() => { juice.select(); void openChurch(church) }}
      aria-label={`${church.name}, level ${church.level}, ${church.xp.toLocaleString()} XP`}
      className="card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        minWidth: 0,
        width: '100%',
        textAlign: 'left',
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
        <span
          className="faint"
          style={{ display: 'block', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
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

      <span className="faint" style={{ fontSize: 17, flexShrink: 0, marginLeft: 2 }} aria-hidden>›</span>
    </motion.button>
  )
}
