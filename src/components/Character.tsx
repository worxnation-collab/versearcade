import type { AvatarSpec, ArmorSlot } from '@/types'
import { skinHex, robeHex } from '@/data/avatar'

// A composable character figure, drawn from an AvatarSpec. Two looks share one
// silhouette so it reads at any size (20px presence chip → 76px builder):
//
//  • Default — a pilgrim in a robe, with each equipped Armor of God piece added
//    as a gold overlay. Unequipped pieces aren't drawn, so a free-tier character
//    still looks intentional, never poor.
//  • King Baldwin regalia — the masked Leper King: white hood, dark silver mask,
//    gold cross-mantle + belt, and a ceremonial sword held upright at his side.
//    A full-look override (its iconic silhouette replaces the base body).

const GOLD = '#DCAB3A'
const GOLD_DEEP = '#C9992A'
const GOLD_LINE = '#9E7716'
const STEEL = '#E7DCC0'
const LEG = '#6E6152'

// Baldwin palette
const ROBE_WHITE = '#E8E4D8'
const ROBE_SHADE = '#CDC8BA'
const MASK = '#3B3E46'
const MASK_SHEEN = '#585C67'
const MASK_DARK = '#24262C'
const BLADE = '#C7CBD4'
const BLADE_EDGE = '#9AA0AC'

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
  const baldwin = spec.regalia === 'baldwin'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 170"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={title ?? (baldwin ? 'King Baldwin avatar' : 'Character avatar')}
      style={{ display: 'block' }}
    >
      {/* ground shadow */}
      <ellipse cx="60" cy="162" rx="30" ry="5" fill="rgba(0,0,0,0.16)" />

      {baldwin ? (
        <>
          {/* ── King Baldwin — the masked Leper King ── */}
          {/* ceremonial sword, held upright at his (viewer-left) side */}
          <rect x="40.2" y="72" width="3.6" height="80" rx="1.4" fill={BLADE} stroke={BLADE_EDGE} strokeWidth="0.8" />
          <path d="M40.2 150 h3.6 l-1.8 6 z" fill={BLADE_EDGE} />
          <rect x="33" y="69" width="18" height="4" rx="2" fill={GOLD} stroke={GOLD_LINE} strokeWidth="0.8" />
          <rect x="40" y="60" width="4" height="9" fill={MASK_DARK} />
          <circle cx="42" cy="59" r="3.6" fill={GOLD} stroke={GOLD_LINE} strokeWidth="0.8" />

          {/* white robe (long, to the floor) */}
          <path d="M40 66 Q60 60 80 66 L90 158 L30 158 Z" fill={ROBE_WHITE} />
          <path d="M60 70 L60 156" stroke={ROBE_SHADE} strokeWidth="1.2" opacity="0.6" />
          <path d="M46 80 L42 156 M74 80 L78 156" stroke={ROBE_SHADE} strokeWidth="0.8" opacity="0.45" />

          {/* gold cross-mantle across the chest */}
          <path d="M48 70 Q60 80 72 70" fill="none" stroke={GOLD} strokeWidth="2.4" strokeLinecap="round" />
          <rect x="57.6" y="80" width="4.8" height="22" rx="1" fill={GOLD} stroke={GOLD_LINE} strokeWidth="0.6" />
          <rect x="50" y="88" width="20" height="4.6" rx="1" fill={GOLD} stroke={GOLD_LINE} strokeWidth="0.6" />
          <circle cx="52" cy="74" r="1.5" fill={GOLD} />
          <circle cx="68" cy="74" r="1.5" fill={GOLD} />

          {/* ornate gold belt */}
          <rect x="45" y="106" width="30" height="8" rx="2.5" fill={GOLD_DEEP} stroke={GOLD_LINE} />
          <circle cx="60" cy="110" r="3.2" fill={GOLD} stroke={GOLD_LINE} strokeWidth="0.7" />

          {/* white hood framing the face */}
          <path d="M39 74 C35 38 47 22 60 22 C73 22 85 38 81 74 L74 74 C77 46 70 34 60 34 C50 34 43 46 46 74 Z" fill={ROBE_WHITE} />
          <path d="M46 72 C43 46 50 34 60 34 C70 34 77 46 74 72 Z" fill={ROBE_SHADE} opacity="0.55" />

          {/* dark silver mask */}
          <ellipse cx="60" cy="50" rx="11" ry="13.5" fill={MASK} />
          <ellipse cx="56" cy="48" rx="3" ry="8" fill={MASK_SHEEN} opacity="0.55" />
          <ellipse cx="56.5" cy="49" rx="1.5" ry="1" fill={MASK_DARK} />
          <ellipse cx="63.5" cy="49" rx="1.5" ry="1" fill={MASK_DARK} />

          {/* gloved hand resting on the pommel */}
          <ellipse cx="43" cy="70" rx="3.6" ry="4.4" fill={ROBE_WHITE} stroke={ROBE_SHADE} strokeWidth="0.8" />
        </>
      ) : (
        <>
          {/* ── Default pilgrim + Armor of God ── */}
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
        </>
      )}
    </svg>
  )
}
