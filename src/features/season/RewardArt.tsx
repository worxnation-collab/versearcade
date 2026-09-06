import type { AvatarSpec } from '@/types'
import { Avatar } from '@/components/Avatar'
import { itemArt } from '@/data/avatar'
import { confettiById, flameById, chestSkinById, cosmeticKind, rewardLabel } from '@/data/season'

// A road reward, drawn as the THING rather than named.
//
// The waystation list used to read "1 · Streak Freeze, Ruth the Gleaner" — a
// bulleted list of what you would get, in an app where every other reward
// surface shows the object. This is the one picture per reward id, shared by the
// Play tab's strip (the next payout) and the road's rail (all of them), so the
// two can't drift into different pictures of the same prize.
//
// Every kind falls back to its glyph, so a reward id this build has never seen
// (a catalog road can add one) still draws something rather than a hole.
export function RewardArt({
  id,
  size = 56,
  spec,
  dim,
}: {
  id: string
  size?: number
  /** The player's own character, for a skin reward — drawn wearing it. */
  spec?: AvatarSpec | null
  /** Not yet reached. The picture stays; only the tone changes. */
  dim?: boolean
}) {
  const box: React.CSSProperties = {
    width: size,
    height: size,
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    opacity: dim ? 0.72 : 1,
    filter: dim ? 'saturate(0.7)' : undefined,
  }
  const kind = cosmeticKind(id)
  const label = rewardLabel(id)

  if (id.startsWith('skin_') && spec) {
    // The equipped skinId carries the reactive state (ruth_2), and the reward
    // id is `skin_` + that — so the slice IS the equip id.
    return (
      <div style={box} title={label.name}>
        <Avatar emoji="🌾" character={{ ...spec, skinId: id.slice(5), regalia: null }} size={size} ring={false} />
      </div>
    )
  }

  if (id.startsWith('item_')) {
    return (
      <div style={box} title={label.name}>
        <img
          src={itemArt(id)}
          alt=""
          aria-hidden
          width={size}
          height={size}
          loading="lazy"
          style={{ width: size * 0.86, height: size * 0.86, objectFit: 'contain' }}
        />
      </div>
    )
  }

  if (kind === 'confetti') {
    // A handful of the theme's own colours, so the tile is the confetti.
    const c = confettiById(id)
    const dots = c.colors.slice(0, 5)
    const r = size * 0.11
    return (
      <div style={box} title={label.name} aria-hidden>
        <svg width={size} height={size} viewBox="0 0 100 100">
          {dots.map((hex, i) => {
            const a = (i / dots.length) * Math.PI * 2 - Math.PI / 2
            const cx = 50 + Math.cos(a) * 28
            const cy = 50 + Math.sin(a) * 28
            const sq = c.shapes?.[0] === 'square'
            return sq ? (
              <rect key={i} x={cx - r} y={cy - r} width={r * 2} height={r * 2} fill={hex} transform={`rotate(${i * 23} ${cx} ${cy})`} />
            ) : (
              <circle key={i} cx={cx} cy={cy} r={r} fill={hex} />
            )
          })}
          <circle cx="50" cy="50" r={r * 0.9} fill={dots[0]} opacity="0.8" />
        </svg>
      </div>
    )
  }

  if (kind === 'flame') {
    const f = flameById(id)
    return (
      <div style={box} title={label.name} aria-hidden>
        <span
          style={{
            fontSize: size * 0.56,
            lineHeight: 1,
            filter: `drop-shadow(0 0 ${size * 0.16}px rgba(${f.rgb},0.85))`,
          }}
        >
          {f.glyph}
        </span>
      </div>
    )
  }

  if (kind === 'chest') {
    const c = chestSkinById(id)
    return (
      <div style={box} title={label.name} aria-hidden>
        <span style={{ fontSize: size * 0.56, lineHeight: 1 }}>{c.glyph}</span>
      </div>
    )
  }

  if (kind === 'title') {
    // A title is words, so its picture is a name plate.
    return (
      <div style={box} title={label.name} aria-hidden>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: Math.max(9, size * 0.19),
            fontWeight: 800,
            lineHeight: 1.1,
            textAlign: 'center',
            padding: '4px 6px',
            borderRadius: 6,
            border: '1px solid rgba(255,210,63,0.5)',
            background: 'rgba(255,210,63,0.12)',
            color: 'var(--gold)',
            maxWidth: size,
            overflow: 'hidden',
          }}
        >
          {label.name}
        </span>
      </div>
    )
  }

  // Consumables, mementos, and anything a future road invents.
  return (
    <div style={box} title={label.name} aria-hidden>
      <span style={{ fontSize: size * 0.56, lineHeight: 1 }}>{label.glyph}</span>
    </div>
  )
}
