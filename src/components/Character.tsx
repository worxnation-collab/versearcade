import type { AvatarSpec, ArmorSlot } from '@/types'
import { skinHex, robeHex, equippedSkinId } from '@/data/avatar'

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

// Moses palette
const M_ROBE = '#8A7A4E'
const M_ROBE_SHADE = '#6F6240'
const M_SKIN = '#C89A6E'
const M_HAIR = '#CBC6BA'
const M_BEARD = '#DEDACF'
const M_WOOD = '#7A5A34'
const M_STONE = '#B9BBB1'
const M_STONE_LINE = '#7E827A'

// David palette — the shepherd-king as a youthful giant-slayer
const D_TUNIC = '#A65A3C'
const D_TUNIC_SHADE = '#8C4A30'
const D_BELT = '#7C3F28'
const D_SKIN = '#D9A06E'
const D_HAIR = '#3A2A1E'
const D_BAND = '#C0492E'
const D_SLING = '#8A6A44'

// Esther palette — the queen "for such a time as this"
const E_GOWN = '#6E2A5E'
const E_GOWN_SHADE = '#5A2050'
const E_SLEEVE = '#7C356C'
const E_SASH = '#DCAB3A'
const E_SKIN = '#E0B48C'
const E_HAIR = '#2A1E22'
const E_JEWEL = '#8B1E2E'

// Take Up Your Cross — a bare-wood cross borne by the player's own character
const CROSS_WOOD = '#6B4E2E'
const CROSS_GRAIN = '#4E3A22'

// Elijah palette — the prophet of fire
const L_ROBE = '#9A8B5E'
const L_ROBE_SHADE = '#7F724C'
const L_MANTLE = '#6B5030'
const L_SKIN = '#C89A6E'
const L_HAIR = '#B8B2A6'
const L_BEARD = '#C4BFB2'
const L_WOOD = '#7A5A34'
const L_RAVEN = '#26262C'
const L_FLAME = '#FF8A3C'
const L_FLAME_HI = '#FFB347'

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
  const items = spec.items ?? {}
  const skinId = equippedSkinId(spec)

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 170"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={title ?? (skinId ? `${skinId} avatar` : 'Character avatar')}
      style={{ display: 'block' }}
    >
      {/* ground shadow */}
      <ellipse cx="60" cy="162" rx="30" ry="5" fill="rgba(0,0,0,0.16)" />

      {skinId === 'baldwin' ? (
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

          {/* raised hand of blessing (his free hand, viewer-right) */}
          <path d="M82 58 L71 100 L75 72 Z" fill={ROBE_WHITE} />
          <path d="M74 71 Q82 58 88 41" fill="none" stroke={ROBE_SHADE} strokeWidth="11" strokeLinecap="round" />
          <path d="M74 71 Q82 58 88 41" fill="none" stroke={ROBE_WHITE} strokeWidth="8.5" strokeLinecap="round" />
          <rect x="85.4" y="25" width="1.7" height="9" rx="0.8" fill={ROBE_WHITE} stroke={ROBE_SHADE} strokeWidth="0.5" />
          <rect x="87.6" y="24" width="1.7" height="10" rx="0.8" fill={ROBE_WHITE} stroke={ROBE_SHADE} strokeWidth="0.5" />
          <rect x="89.8" y="25" width="1.7" height="9" rx="0.8" fill={ROBE_WHITE} stroke={ROBE_SHADE} strokeWidth="0.5" />
          <rect x="92" y="27.5" width="1.7" height="7" rx="0.8" fill={ROBE_WHITE} stroke={ROBE_SHADE} strokeWidth="0.5" />
          <ellipse cx="89" cy="36" rx="5" ry="6" fill={ROBE_WHITE} stroke={ROBE_SHADE} strokeWidth="0.8" />
          <ellipse cx="83.6" cy="38" rx="2" ry="3" fill={ROBE_WHITE} stroke={ROBE_SHADE} strokeWidth="0.6" />

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
      ) : skinId === 'whale' ? (
        <>
          {/* ── Jonah's Whale — a splashing $100 patron showpiece ── */}
          <g className="va-whale">
          {/* soft premium aura */}
          <circle cx="54" cy="90" r="55" fill="#6FA8DC" opacity="0.13" />
          {/* gold sparkles */}
          <path d="M97 50 l1.5 3.6 l3.6 1.5 l-3.6 1.5 l-1.5 3.6 l-1.5 -3.6 l-3.6 -1.5 l3.6 -1.5 z" fill="#FFD23F" />
          <path d="M16 64 l1 2.6 l2.6 1 l-2.6 1 l-1 2.6 l-1 -2.6 l-2.6 -1 l2.6 -1 z" fill="#FFD23F" />
          <path d="M101 122 l1 2.4 l2.4 1 l-2.4 1 l-1 2.4 l-1 -2.4 l-2.4 -1 l2.4 -1 z" fill="#FFE58A" />
          {/* water spout + droplets */}
          <path d="M46 60 q-3 -13 0 -20 M50 60 q0 -15 1 -22 M54 60 q3 -13 4 -18"
            stroke="#8FC7E8" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <circle cx="46" cy="35" r="1.6" fill="#8FC7E8" /><circle cx="58" cy="39" r="1.4" fill="#8FC7E8" />
          {/* tail flukes, gold-tipped */}
          <path d="M86 92 L110 74 L100 92 L110 110 Z" fill="#345F8C" />
          <path d="M104 79 L110 74 L106.5 82 Z M106.5 103 L110 110 L104 105 Z" fill="#DCAB3A" />
          {/* body */}
          <ellipse cx="52" cy="92" rx="42" ry="30" fill="#3E6FA8" />
          {/* darker back for depth */}
          <path d="M16 82 Q44 64 80 70 Q92 74 93 84 Q68 74 44 78 Q26 80 16 82 Z" fill="#33608F" opacity="0.85" />
          {/* lighter belly + grooves */}
          <path d="M15 96 Q52 126 90 100 Q80 120 52 121 Q24 121 15 96 Z" fill="#B7D2ED" />
          <path d="M30 108 h32 M28 102 h36 M34 114 h24" stroke="#93B7DB" strokeWidth="1" opacity="0.7" />
          {/* side fin */}
          <path d="M48 111 q10 13 22 8 q-11 7 -24 -2 z" fill="#345F8C" />
          {/* eye + sparkle + smile */}
          <circle cx="33" cy="86" r="4.8" fill="#fff" />
          <circle cx="31.4" cy="86.4" r="2.4" fill="#20303F" />
          <circle cx="30.3" cy="85" r="0.9" fill="#fff" />
          <path d="M19 98 q10 9 23 4" stroke="#20303F" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          {/* gold patron crown on his head */}
          <path d="M23 64 L26.5 54 L31 60 L35 52 L39 60 L43.5 54 L47 64 Z" fill="#DCAB3A" stroke="#9E7716" strokeWidth="0.8" />
          <rect x="23" y="63" width="24" height="3.6" rx="1" fill="#C9992A" stroke="#9E7716" strokeWidth="0.6" />
          <circle cx="35" cy="58" r="1.7" fill="#8B1E2E" />
          </g>
          {/* splash droplets as he surfaces */}
          <g className="va-splash">
            <circle cx="40" cy="116" r="2.4" fill="#8FC7E8" style={{ animationDelay: '0s' }} />
            <circle cx="50" cy="120" r="2" fill="#A9C8E8" style={{ animationDelay: '0.04s' }} />
            <circle cx="60" cy="115" r="2.6" fill="#8FC7E8" style={{ animationDelay: '0.02s' }} />
            <circle cx="70" cy="120" r="2" fill="#A9C8E8" style={{ animationDelay: '0.06s' }} />
            <circle cx="55" cy="122" r="1.8" fill="#B7D2ED" style={{ animationDelay: '0.08s' }} />
          </g>
        </>
      ) : skinId === 'moses' ? (
        <>
          {/* ── Moses — the Lawgiver ── */}
          {/* staff, right hand */}
          <rect x="83" y="40" width="4" height="112" rx="2" fill={M_WOOD} />
          <circle cx="85" cy="40" r="4.2" fill="#6A4E2C" />

          {/* robe */}
          <path d="M42 66 Q60 60 78 66 L88 158 L32 158 Z" fill={M_ROBE} />
          <path d="M60 72 L60 156" stroke={M_ROBE_SHADE} strokeWidth="1.2" opacity="0.5" />
          <path d="M47 82 L44 156 M73 82 L76 156" stroke={M_ROBE_SHADE} strokeWidth="0.8" opacity="0.4" />
          {/* sash */}
          <rect x="43" y="104" width="34" height="6" rx="2" fill={M_ROBE_SHADE} />

          {/* sleeves */}
          <rect x="34" y="70" width="9" height="34" rx="4.5" fill={M_ROBE} />
          <rect x="77" y="70" width="9" height="34" rx="4.5" fill={M_ROBE} />

          {/* stone tablets, cradled in the left arm */}
          <rect x="28" y="92" width="10" height="24" rx="4.5" fill={M_STONE} stroke={M_STONE_LINE} strokeWidth="0.8" />
          <rect x="39" y="92" width="10" height="24" rx="4.5" fill={M_STONE} stroke={M_STONE_LINE} strokeWidth="0.8" />
          {[100, 104, 108, 112].map((y) => (
            <g key={y}>
              <path d={`M30.5 ${y} h5`} stroke={M_STONE_LINE} strokeWidth="0.7" />
              <path d={`M41.5 ${y} h5`} stroke={M_STONE_LINE} strokeWidth="0.7" />
            </g>
          ))}

          {/* neck + head */}
          <rect x="55" y="54" width="10" height="10" rx="3" fill={M_SKIN} />
          <circle cx="60" cy="48" r="12" fill={M_SKIN} />
          {/* hair */}
          <path d="M48 48 a12 12 0 0 1 24 0 l-2.5 0 a9.5 9.5 0 0 0-19 0 z" fill={M_HAIR} />
          {/* long beard */}
          <path d="M49 54 Q50 80 60 90 Q70 80 71 54 Q60 66 49 54 Z" fill={M_BEARD} stroke="#CCC7BB" strokeWidth="0.5" />
        </>
      ) : skinId === 'david' ? (
        <>
          {/* ── David — the shepherd giant-slayer ── */}
          {/* legs + sandals */}
          <rect x="50" y="118" width="9" height="34" rx="4" fill={LEG} />
          <rect x="61" y="118" width="9" height="34" rx="4" fill={LEG} />
          <path d="M46 150 h16 v6 a4 4 0 0 1-4 4 h-8 a4 4 0 0 1-4-4 z" fill="#8A6A44" stroke="#6E5233" strokeWidth="0.8" />
          <path d="M58 150 h16 v6 a4 4 0 0 1-4 4 h-8 a4 4 0 0 1-4-4 z" fill="#8A6A44" stroke="#6E5233" strokeWidth="0.8" />

          {/* short russet tunic */}
          <path d="M44 66 Q60 60 76 66 L74 116 Q60 122 46 116 Z" fill={D_TUNIC} />
          <path d="M60 70 L60 116" stroke={D_TUNIC_SHADE} strokeWidth="1.1" opacity="0.5" />
          {/* belt */}
          <rect x="45" y="104" width="30" height="7" rx="2.5" fill={D_BELT} />

          {/* arms */}
          <rect x="34" y="70" width="9" height="34" rx="4.5" fill={D_TUNIC} />
          <rect x="77" y="70" width="9" height="34" rx="4.5" fill={D_TUNIC} />

          {/* sling — cord swinging up from the right hand to a pouch */}
          <path d="M84 100 Q98 76 92 52" fill="none" stroke={D_SLING} strokeWidth="1.6" strokeLinecap="round" />
          <path d="M84 100 Q96 82 90 54" fill="none" stroke={D_SLING} strokeWidth="1.6" strokeLinecap="round" />
          <ellipse cx="91" cy="52" rx="4.6" ry="3.4" fill={D_SLING} stroke="#6E5233" strokeWidth="0.7" />
          <circle cx="91" cy="52" r="1.7" fill="#8B857A" />

          {/* neck + youthful head */}
          <rect x="55" y="56" width="10" height="10" rx="3" fill={D_SKIN} />
          <circle cx="60" cy="50" r="12.5" fill={D_SKIN} />
          {/* dark curls */}
          <path d="M48 49 a12.5 12.5 0 0 1 25 0 l-2.5 0 a10 10 0 0 0-20 0 z" fill={D_HAIR} />
          <circle cx="50" cy="52" r="2.4" fill={D_HAIR} />
          <circle cx="70" cy="52" r="2.4" fill={D_HAIR} />
          {/* red headband */}
          <path d="M47.5 46 q12.5 -6 25 0" fill="none" stroke={D_BAND} strokeWidth="3" strokeLinecap="round" />
        </>
      ) : skinId === 'esther' ? (
        <>
          {/* ── Esther — the queen "for such a time as this" ── */}
          {/* long royal gown to the floor */}
          <path d="M42 66 Q60 60 78 66 L90 158 L30 158 Z" fill={E_GOWN} />
          <path d="M60 70 L60 156" stroke={E_GOWN_SHADE} strokeWidth="1.2" opacity="0.55" />
          <path d="M47 82 L42 156 M73 82 L78 156" stroke={E_GOWN_SHADE} strokeWidth="0.8" opacity="0.4" />
          {/* gold hem */}
          <path d="M30 154 L90 154 L90 158 L30 158 Z" fill={E_SASH} opacity="0.9" />
          {/* gold sash across the waist */}
          <path d="M43 104 Q60 112 77 104 L77 110 Q60 118 43 110 Z" fill={E_SASH} stroke="#B98F28" strokeWidth="0.6" />

          {/* sleeves */}
          <rect x="34" y="70" width="9" height="36" rx="4.5" fill={E_SLEEVE} />
          <rect x="77" y="70" width="9" height="36" rx="4.5" fill={E_SLEEVE} />

          {/* long dark hair falling past the shoulders */}
          <path d="M44 52 Q40 96 47 118 L54 118 Q49 92 52 58 Z" fill={E_HAIR} />
          <path d="M76 52 Q80 96 73 118 L66 118 Q71 92 68 58 Z" fill={E_HAIR} />

          {/* neck + head */}
          <rect x="55" y="56" width="10" height="10" rx="3" fill={E_SKIN} />
          <circle cx="60" cy="50" r="12.5" fill={E_SKIN} />
          {/* hair crown / fringe */}
          <path d="M47.5 50 a12.5 12.5 0 0 1 25 0 l-3 0 a9.5 9.5 0 0 0-19 0 z" fill={E_HAIR} />

          {/* gold crown with a jewel */}
          <path d="M49 40 L53 30 L58 37 L60 28 L62 37 L67 30 L71 40 Z" fill={E_SASH} stroke="#B98F28" strokeWidth="0.8" />
          <rect x="49" y="39" width="22" height="3.6" rx="1" fill="#C9992A" stroke="#B98F28" strokeWidth="0.6" />
          <circle cx="60" cy="34" r="2" fill={E_JEWEL} />
        </>
      ) : skinId === 'elijah' ? (
        <>
          {/* ── Elijah — the prophet of fire ── */}
          {/* flames dancing at his feet */}
          <path d="M40 158 q-4 -14 4 -22 q-2 10 4 12 q4 -6 1 -14 q9 8 6 22 z" fill={L_FLAME} />
          <path d="M42 158 q-2 -9 3 -15 q0 7 3 8 q2 -4 1 -9 q6 6 4 15 z" fill={L_FLAME_HI} />
          <path d="M70 158 q-3 -11 3 -18 q-1 8 3 10 q3 -5 1 -11 q7 7 5 17 z" fill={L_FLAME} />
          <path d="M72 158 q-1 -7 2 -12 q0 5 2 6 q2 -3 1 -7 q5 5 3 12 z" fill={L_FLAME_HI} />

          {/* legs */}
          <rect x="50" y="118" width="9" height="30" rx="4" fill={LEG} />
          <rect x="61" y="118" width="9" height="30" rx="4" fill={LEG} />

          {/* staff, left hand */}
          <rect x="33" y="40" width="4" height="112" rx="2" fill={L_WOOD} />
          <circle cx="35" cy="40" r="4" fill="#6A4E2C" />

          {/* tan robe */}
          <path d="M44 66 Q60 60 76 66 L84 150 L36 150 Z" fill={L_ROBE} />
          <path d="M60 72 L60 148" stroke={L_ROBE_SHADE} strokeWidth="1.2" opacity="0.5" />
          <path d="M48 82 L44 148 M72 82 L76 148" stroke={L_ROBE_SHADE} strokeWidth="0.8" opacity="0.4" />

          {/* camel-hair mantle over the shoulders */}
          <path d="M42 66 Q60 74 78 66 L82 96 Q60 88 38 96 Z" fill={L_MANTLE} />
          <path d="M42 66 Q60 74 78 66" fill="none" stroke="#5A4228" strokeWidth="1" opacity="0.6" />

          {/* arms */}
          <rect x="35" y="70" width="9" height="34" rx="4.5" fill={L_ROBE} />
          <rect x="76" y="70" width="9" height="34" rx="4.5" fill={L_ROBE} />

          {/* neck + head */}
          <rect x="55" y="56" width="10" height="10" rx="3" fill={L_SKIN} />
          <circle cx="60" cy="50" r="12" fill={L_SKIN} />
          {/* wild grey hair */}
          <path d="M47 50 q-3 -16 13 -16 q16 0 13 16 l-3 -1 q1 -12 -10 -12 q-11 0 -10 12 z" fill={L_HAIR} />
          {/* grey beard */}
          <path d="M49 54 Q50 82 60 92 Q70 82 71 54 Q60 66 49 54 Z" fill={L_BEARD} stroke="#B4AEA2" strokeWidth="0.5" />

          {/* raven perched on his shoulder */}
          <ellipse cx="80" cy="64" rx="7" ry="4" fill={L_RAVEN} transform="rotate(-12 80 64)" />
          <circle cx="86" cy="60" r="3.4" fill={L_RAVEN} />
          <path d="M88.6 59 l4 -1 l-3.4 2.4 z" fill="#C9A227" />
          <circle cx="86.6" cy="59.4" r="0.7" fill="#E7C24A" />
          <path d="M74 65 l-6 3 l5 -0.5 z" fill={L_RAVEN} />
        </>
      ) : (
        <>
          {/* ── Default pilgrim + Armor of God ── */}
          {/* Carried cross (Luke 9:23) — drawn BEHIND the player's own character,
              angled over the shoulder, so the equipped look is "my character
              carrying a cross" rather than a separate figure. */}
          {skinId === 'cross' && (
            <>
              <path d="M22 160 L96 40" stroke={CROSS_WOOD} strokeWidth="11" strokeLinecap="round" />
              <path d="M69 46 L103 60" stroke={CROSS_WOOD} strokeWidth="9" strokeLinecap="round" />
              <path d="M27 156 L92 46" stroke={CROSS_GRAIN} strokeWidth="1.3" opacity="0.5" />
              <path d="M71 49 L100 60" stroke={CROSS_GRAIN} strokeWidth="1.1" opacity="0.5" />
            </>
          )}
          {/* cape / cloak item — drawn behind the body */}
          {items.cape === 'item_cloak' && (
            <>
              <path d="M40 64 Q60 60 80 64 L94 152 L26 152 Z" fill="#6B5030" />
              <rect x="53" y="63" width="14" height="4" rx="2" fill="#8A6A3E" />
            </>
          )}

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

          {/* arms (sleeves in robe color). For the cross, the right arm is raised
              to grip the beam instead of hanging at the side. */}
          <rect x="34" y="70" width="9" height="36" rx="4.5" fill={robe} />
          {skinId === 'cross' ? (
            <>
              <path d="M79 78 L90 56" stroke={robe} strokeWidth="8.5" strokeLinecap="round" />
              <ellipse cx="91" cy="54" rx="4.2" ry="4.8" fill={skin} />
            </>
          ) : (
            <rect x="77" y="70" width="9" height="36" rx="4.5" fill={robe} />
          )}

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

          {/* held item — in the right hand */}
          {items.held === 'item_staff' && (
            <>
              <rect x="83" y="52" width="3.6" height="98" rx="1.8" fill="#7A5A34" />
              <path d="M84.8 52 q7 -3 7 5 q0 6 -6 6" fill="none" stroke="#7A5A34" strokeWidth="3.4" strokeLinecap="round" />
            </>
          )}
          {items.held === 'item_scroll' && (
            <>
              <rect x="79" y="98" width="14" height="7" rx="3.5" fill="#EBE0C6" stroke="#B9A67E" />
              <circle cx="79" cy="101.5" r="3.6" fill="#DED0AE" stroke="#B9A67E" />
              <circle cx="93" cy="101.5" r="3.6" fill="#DED0AE" stroke="#B9A67E" />
            </>
          )}
          {items.held === 'item_lamp' && (
            <>
              <ellipse cx="85" cy="104" rx="7" ry="4" fill="#C99A2E" stroke="#9E7716" />
              <path d="M91 104 h4" stroke="#9E7716" strokeWidth="2" />
              <ellipse cx="80" cy="99" rx="1.8" ry="3.4" fill="#FFB33E" />
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

          {/* hat items — on the crown of the head */}
          {items.hat === 'item_headwrap' && (
            <>
              <path d="M47 47 a13 13 0 0 1 26 0 l0 3 a13 13 0 0 0-26 0 z" fill="#CDB183" stroke="#A98C5C" strokeWidth="0.8" />
              <path d="M70 46 q7 8 3 22 l-5 -1 q3 -12 -2 -20 z" fill="#CDB183" stroke="#A98C5C" strokeWidth="0.8" />
            </>
          )}
          {items.hat === 'item_olive_wreath' && (
            <>
              <path d="M47 47 q13 -11 26 0" fill="none" stroke="#5E7D1E" strokeWidth="3.4" strokeLinecap="round" />
              <ellipse cx="51" cy="44" rx="2.4" ry="1.4" fill="#7BA02E" transform="rotate(-35 51 44)" />
              <ellipse cx="60" cy="40.5" rx="2.4" ry="1.4" fill="#7BA02E" />
              <ellipse cx="69" cy="44" rx="2.4" ry="1.4" fill="#7BA02E" transform="rotate(35 69 44)" />
            </>
          )}
        </>
      )}
    </svg>
  )
}
