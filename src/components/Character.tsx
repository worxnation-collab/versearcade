import type { AvatarSpec, ArmorSlot } from '@/types'
import { skinHex, robeHex } from '@/data/avatar'

// A composable "Armor of God" figure, drawn from an AvatarSpec. The same shapes
// as the concept mockup: a bare pilgrim by default, with each equipped piece
// added as a gold overlay. Scales from a 20px presence chip to the 72px builder
// preview — preserveAspectRatio="meet" fits the whole figure inside the square
// so it sits cleanly inside the Avatar's circle.
//
// Unequipped pieces simply aren't drawn (the "reaching for the next piece" look),
// so a free-tier character still looks intentional — never poor.

const GOLD = '#DCAB3A'
const GOLD_DEEP = '#C9992A'
const GOLD_LINE = '#9E7716'
const STEEL = '#E7DCC0'
const LEG = '#6E6152'

export function Character({
  spec,
  size = 44,
  title,
}: {
  spec: AvatarSpec
  size?: number
  title?: string
}) {
  const skin = skinHex(spec.skin)
  const robe = robeHex(spec.robe)
  const has = (s: ArmorSlot) => !!spec.armor[s]

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 170"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={title ?? 'Character avatar'}
      style={{ display: 'block' }}
    >
      {/* ground shadow */}
      <ellipse cx="60" cy="162" rx="30" ry="5" fill="rgba(0,0,0,0.16)" />

      {/* legs */}
      <rect x="50" y="118" width="9" height="34" rx="4" fill={LEG} />
      <rect x="61" y="118" width="9" height="34" rx="4" fill={LEG} />

      {/* sandals (gospel readiness) */}
      {has('sandals') && (
        <>
          <path d="M46 150 h16 v6 a4 4 0 0 1-4 4 h-8 a4 4 0 0 1-4-4 z" fill={GOLD} stroke={GOLD_LINE} />
          <path d="M58 150 h16 v6 a4 4 0 0 1-4 4 h-8 a4 4 0 0 1-4-4 z" fill={GOLD} stroke={GOLD_LINE} />
        </>
      )}

      {/* tunic / robe */}
      <path d="M44 66 Q60 60 76 66 L74 120 Q60 126 46 120 Z" fill={robe} />

      {/* arms (sleeves in robe color) */}
      <rect x="34" y="70" width="9" height="36" rx="4.5" fill={robe} />
      <rect x="77" y="70" width="9" height="36" rx="4.5" fill={robe} />

      {/* breastplate of righteousness */}
      {has('breastplate') && (
        <>
          <path d="M46 68 Q60 62 74 68 L72 104 Q60 112 48 104 Z" fill={GOLD} stroke={GOLD_LINE} strokeWidth="1.5" />
          <path d="M60 70 V104" stroke={GOLD_LINE} strokeWidth="1.5" opacity="0.6" />
        </>
      )}

      {/* belt of truth */}
      {has('belt') && <rect x="45" y="103" width="30" height="8" rx="3" fill={GOLD_DEEP} stroke={GOLD_LINE} />}

      {/* shield of faith (on the left arm) */}
      {has('shield') && (
        <>
          <circle cx="34" cy="104" r="15" fill={GOLD} stroke={GOLD_LINE} strokeWidth="1.5" />
          <path d="M34 96 v16 M27 104 h14" stroke="#7C5E12" strokeWidth="2" />
        </>
      )}

      {/* sword of the Spirit (in the right hand) */}
      {has('sword') && (
        <>
          <rect x="79" y="34" width="5" height="60" rx="2" fill={STEEL} stroke={GOLD_LINE} />
          <rect x="74" y="72" width="15" height="5" rx="2" fill={GOLD_DEEP} />
        </>
      )}

      {/* neck + head */}
      <rect x="55" y="56" width="10" height="10" rx="3" fill={skin} />
      <circle cx="60" cy="50" r="13" fill={skin} />

      {/* helmet of salvation */}
      {has('helmet') && (
        <>
          <path d="M46 50 a14 14 0 0 1 28 0 l-4 0 a10 10 0 0 0-20 0 z" fill={GOLD} stroke={GOLD_LINE} />
          <rect x="58" y="40" width="4" height="12" fill={GOLD_LINE} opacity="0.5" />
        </>
      )}
    </svg>
  )
}
