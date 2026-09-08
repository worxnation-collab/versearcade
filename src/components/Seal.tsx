import { divisionById, type SealDef } from '@/data/seals'

// A wax seal, drawn rather than generated — the church kit's rule, for the
// church kit's reason: the wax takes a runtime colour (its division's) and a
// baked image can't take one. Seven colours × 66 books is also 66 renders of
// something a circle and three letters says perfectly.
//
// Unpressed is the same shape in outline, never a padlock and never a greyed
// version of the pressed one: an unread book is an invitation, which is the
// same call the reader makes about the `unread` tier.

export function Seal({
  seal,
  pressed,
  size = 44,
  title,
}: {
  seal: SealDef
  pressed: boolean
  size?: number
  title?: string
}) {
  const d = divisionById(seal.division)
  const r = size / 2
  // The wax's ragged edge: a circle with eleven small bumps, deterministic per
  // book so a seal looks the same every time it is drawn.
  const points: string[] = []
  const lobes = 11
  let h = 0
  for (let i = 0; i < seal.book.length; i++) h = (h * 31 + seal.book.charCodeAt(i)) >>> 0
  for (let i = 0; i < lobes * 2; i++) {
    const a = (i / (lobes * 2)) * Math.PI * 2
    h = (h * 1664525 + 1013904223) >>> 0
    const jitter = 0.94 + ((h >>> 16) % 100) / 1000 // 0.94–1.04
    const rad = (i % 2 === 0 ? r * 0.97 : r * 0.86) * jitter
    points.push(`${(r + Math.cos(a) * rad).toFixed(2)},${(r + Math.sin(a) * rad).toFixed(2)}`)
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={title ?? `${seal.book}${pressed ? ' — sealed' : ' — not sealed yet'}`}
      style={{ display: 'block', flex: 'none' }}
    >
      {title && <title>{title}</title>}
      <polygon
        points={points.join(' ')}
        fill={pressed ? d.wax : 'none'}
        stroke={pressed ? d.rim : 'currentColor'}
        strokeWidth={pressed ? 1.2 : 1}
        strokeDasharray={pressed ? undefined : '3 3'}
        opacity={pressed ? 1 : 0.42}
      />
      {pressed && (
        <circle cx={r} cy={r} r={r * 0.66} fill="none" stroke={d.rim} strokeWidth={0.9} opacity={0.55} />
      )}
      <text
        x={r}
        y={r}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--font-display)"
        fontWeight={800}
        fontSize={size * 0.3}
        fill={pressed ? '#fff6e6' : 'currentColor'}
        opacity={pressed ? 0.95 : 0.38}
        letterSpacing={-0.3}
      >
        {seal.abbr}
      </text>
    </svg>
  )
}
