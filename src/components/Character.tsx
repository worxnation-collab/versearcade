import { useState } from 'react'
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

// Angels palette — one family across the three pack skins so they read as a set
const A_HALO = '#FFE9A8'
// Gabriel — the announcing messenger
const G_ROBE = '#F2EDDF'
const G_ROBE_SHADE = '#D6CDB6'
const G_SASH = '#DCAB3A'
const G_SKIN = '#E0B48C'
const G_HAIR = '#C79A3E'
const G_WING = '#FFFFFF'
const G_WING_EDGE = '#D9D2BE'
// Michael — the archangel in armor
const M2_ARMOR = '#C9D2E0'
const M2_ARMOR_SHADE = '#8F9BB0'
const M2_TUNIC = '#2E4A7D'
const M2_SKIN = '#C89A6E'
const M2_WING = '#DCE4F2'
const M2_WING_EDGE = '#93A2BE'
const M2_FLAME = '#FF8A3C'
const M2_FLAME_HI = '#FFD23F'
// Seraph — the burning one, six wings, a live coal
const S_BODY = '#B33A2B'
const S_BODY_HI = '#E2683C'
// Three wing values, back to front, so six wings still read as six wings.
const S_WING_BACK = '#C0431C'
const S_WING = '#FF9A45'
const S_WING_EDGE = '#A8360F'
const S_WING_HI = '#FFC76B'
const S_COAL = '#FFD766'

// Eden palette — Eve reaching for the fruit. Warm skin and desaturated leaf
// greens against the deep red fruit, so the fruit stays the one hot spot in the
// frame at any size. Genesis says "fruit", not "apple" (the apple is a Latin
// pun, malum, that stuck) — hence the round, unlabelled red fruit.
const ED_SKIN = '#D9A472'
const ED_HAIR = '#3A2418'
const ED_HAIR_HI = '#5A3A22'
const ED_LEAF = '#4E7A3A'
const ED_LEAF_DARK = '#3B5F2C'
const ED_LEAF_HI = '#6FA04E'
const ED_BARK = '#5E4126'
const ED_BARK_LINE = '#432D18'
const ED_CANOPY = '#2F6B33'
const ED_CANOPY_HI = '#4E9A4A'
const ED_FRUIT = '#C62F35'
const ED_FRUIT_HI = '#E85A4A'
const ED_SERPENT = '#9AA84E'
const ED_SERPENT_DARK = '#63702C'
const ED_SERPENT_HI = '#C6D278'
const ED_SKIN_SH = '#BE8B58'
const ED_BARK_HI = '#7A5433'
const ED_CANOPY_DK = '#24552A'
const ED_FRUIT_DK = '#8E1F26'
const ED_LIGHT = '#FFE9A8'

// Sonshine palette — the creator-collab skin, sampled off the reference clips.
// Blocky on purpose: it's a portrait of a voxel-game character, so it is all
// flat axis-aligned rects on a 4-unit grid (an 8x8 head, an 8x12 body and 4x12
// limbs, scaled x4 into the 120x170 box). Drawn rather than raster like the
// other recent skins: rectangles cost nothing to draw, they stay crisp at the
// 18px presence chip where the PNGs soften (see docs/RASTER-SKINS.md), and the
// reference colours can be matched exactly instead of approximated by a
// generator. One shade value per volume, always on the viewer-right edge, so
// the figure reads as lit from the left the way the reference renders do.
const SS_HAIR = '#E0342A'
const SS_HAIR_HI = '#F2483B'
const SS_HAIR_DK = '#A82119'
const SS_SKIN = '#F2D3B3'
const SS_SKIN_SH = '#D9B694'
const SS_EYE = '#2E5CC8'
const SS_JACKET = '#17171E'
const SS_JACKET_DK = '#0D0D12'
const SS_TEE = '#ECECF2'
const SS_TEE_SH = '#CFCFD8'
const SS_DENIM = '#33405C'
const SS_DENIM_DK = '#26314A'
const SS_SHOE = '#C6382C'
const SS_SHOE_DK = '#9E2A20'
const SS_SOLE = '#F0ECE2'

// A feathered wing, drawn from the shoulder out to the viewer-right. `flip`
// mirrors it about the figure's centre line so the pair always matches, and
// `transform` lets a skin fan several pairs (the seraph's six) from one shape.
function Wing({
  fill,
  edge,
  flip = false,
  transform,
  opacity = 1,
}: {
  fill: string
  edge: string
  flip?: boolean
  transform?: string
  opacity?: number
}) {
  // Mirror about x = 60, the centre of the 120-wide viewBox.
  const mirror = flip ? 'translate(120 0) scale(-1 1) ' : ''
  return (
    <g transform={`${mirror}${transform ?? ''}`.trim() || undefined} opacity={opacity}>
      <path d="M58 74 C 74 44, 96 27, 113 26 C 111 52, 100 84, 83 105 C 71 99, 61 88, 58 74 Z" fill={fill} />
      <path d="M62 79 C 78 57, 96 41, 112 32" stroke={edge} strokeWidth="1" fill="none" opacity="0.55" />
      <path d="M68 90 C 84 70, 100 54, 112 43" stroke={edge} strokeWidth="1" fill="none" opacity="0.5" />
      <path d="M76 100 C 90 83, 102 68, 110 55" stroke={edge} strokeWidth="1" fill="none" opacity="0.45" />
    </g>
  )
}

// The seraph's other two pairs are the same wing, pivoted about its shoulder
// (58,74): up and across the face, and down and across the feet (Isaiah 6:2).
const pivot = (deg: number, scale: number, dx: number, dy: number) =>
  `translate(${dx} ${dy}) rotate(${deg} 58 74) translate(58 74) scale(${scale}) translate(-58 -74)`
const FACE_WING = pivot(-62, 0.52, 6, 4)
const FEET_WING = pivot(150, 0.5, 6, 34)

// The ring of light above an angel's head — same halo on all three.
function Halo({ cy = 26, rx = 13 }: { cy?: number; rx?: number }) {
  return (
    <g>
      <ellipse cx="60" cy={cy} rx={rx + 4} ry={rx / 2.6} fill={A_HALO} opacity="0.22" />
      <ellipse cx="60" cy={cy} rx={rx} ry={rx / 3.4} fill="none" stroke={A_HALO} strokeWidth="2.6" />
    </g>
  )
}

// ── Raster skin preview ───────────────────────────────────────────────────
// A skin listed here renders as an image instead of drawn paths. The <image>
// sits inside the same 120×170 viewBox, so sizing, the circular clip in Avatar
// and every call site are untouched — and a skin that isn't listed keeps its
// SVG exactly as before.
//
// This is a preview path, not a decision. Raster can't compose (the free
// starter layers armour and items independently) and it softens badly at the
// 18px presence chip, so anything kept here long-term should be redrawn as
// paths. The file is served from public/, so dropping a PNG in is enough.
const RASTER_SKINS: Record<string, string> = {
  baldwin: '/skins/baldwin.png',
  david: '/skins/david.png',
  esther: '/skins/esther.png',
  moses: '/skins/moses.png',
  elijah: '/skins/elijah.png',
  eden: '/skins/eden.png',
  whale: '/skins/whale.png',
  gabriel: '/skins/gabriel.png',
  michael: '/skins/michael.png',
  seraph: '/skins/seraph.png',
  // The Pilgrimage's reactive skin: the equipped skinId carries the state
  // (ruth_1..ruth_4 — see passSkinEquipId in data/avatar), so each maps to its
  // own file and every viewer renders the right basket from the spec alone.
  ruth_1: '/skins/ruth_1.png',
  ruth_2: '/skins/ruth_2.png',
  ruth_3: '/skins/ruth_3.png',
  ruth_4: '/skins/ruth_4.png',
  boaz: '/skins/boaz.png',
}

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
  // Falls back to the drawn skin if the image is missing or fails to decode, so
  // a listed-but-absent file degrades to what shipped before rather than a hole.
  //
  // Keyed on the failing src rather than a boolean. One Character instance can
  // be shown many skins in turn -- the preview avatar on the customise screen is
  // a single instance whose skinId changes as the player taps through the grid --
  // and a boolean latched on the first failure would fall back for every skin
  // after it, permanently, until the component remounted. A transient 404 while
  // a deploy propagates was enough to do it.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const raster = skinId ? RASTER_SKINS[skinId] : undefined
  const useRaster = !!raster && failedSrc !== raster
  // Everywhere the player actually reads an avatar — chips, lists, the profile
  // header, the customise grid — a full-length figure in a small circle throws
  // away the face. Those get a portrait crop. The one place that stays
  // full-length is the large purchase preview, where the whole skin is the point.
  const zoomRaster = useRaster && size < 120

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
      {/* Ground shadow — skipped when a raster skin is framed as a portrait,
          since the figure is cropped at the waist and has no feet to cast one. */}
      {!zoomRaster && <ellipse cx="60" cy="162" rx="30" ry="5" fill="rgba(0,0,0,0.16)" />}

      {useRaster ? (
        <image
          href={raster}
          // Inset rather than filling the viewBox. Avatar clips to a circle, and
          // a figure spanning the full 170 height has its top and bottom corners
          // cut by the curve — invisible on the narrow drawn skins, obvious on a
          // wide head like the whale's, whose cap was being sliced flat. This
          // keeps the feet on the drawn skins' baseline and the head inside the
          // circle at every size.
          {...(zoomRaster
            ? // Portrait framing: cover the viewBox and anchor to the top, so the
              // head and torso fill the circle instead of a full figure shrinking
              // to a few pixels. The processed PNGs are cropped tight to the top
              // of the head, so xMidYMin lands the crop correctly. How much of
              // the figure survives falls out of its own width — a narrow figure
              // like Baldwin zooms to about the waist, a wide-winged angel barely
              // crops at all, which is the right behaviour in both cases. Inset a
              // few units so a wide head (the whale's cap) is not caught by the
              // circle's curve at the corners.
              { x: 5, y: 7, width: 110, height: 156, preserveAspectRatio: 'xMidYMin slice' }
            : // Full figure, inset so Avatar's circular clip does not cut the
              // corners off a wide head.
              { x: 10, y: 20, width: 100, height: 136, preserveAspectRatio: 'xMidYMax meet' })}
          onError={() => setFailedSrc(raster ?? null)}
        />
      ) : skinId === 'baldwin' ? (
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
      ) : skinId === 'gabriel' ? (
        <>
          {/* ── Gabriel — the announcing messenger (Luke 1:19, 1:26) ── */}
          {/* wings, spread behind him */}
          <Wing fill={G_WING} edge={G_WING_EDGE} flip />
          <Wing fill={G_WING} edge={G_WING_EDGE} />

          {/* long white robe to the floor */}
          <path d="M42 66 Q60 60 78 66 L88 158 L32 158 Z" fill={G_ROBE} />
          <path d="M60 72 L60 156" stroke={G_ROBE_SHADE} strokeWidth="1.2" opacity="0.55" />
          <path d="M47 82 L43 156 M73 82 L77 156" stroke={G_ROBE_SHADE} strokeWidth="0.8" opacity="0.4" />
          {/* gold sash across the chest + belt */}
          <path d="M46 70 L72 104 L66 108 L42 76 Z" fill={G_SASH} opacity="0.95" />
          <rect x="45" y="104" width="30" height="7" rx="2.5" fill={G_SASH} stroke="#B98F28" strokeWidth="0.6" />
          {/* gold hem */}
          <path d="M32 154 L88 154 L88 158 L32 158 Z" fill={G_SASH} opacity="0.85" />

          {/* left arm at his side */}
          <rect x="34" y="70" width="9" height="34" rx="4.5" fill={G_ROBE} />
          {/* right arm raised, lifting the trumpet */}
          <path d="M79 78 L90 52" stroke={G_ROBE} strokeWidth="8.5" strokeLinecap="round" />
          <ellipse cx="91" cy="50" rx="4.2" ry="4.8" fill={G_SKIN} />

          {/* trumpet, angled up to the sky */}
          <path d="M88 50 L104 26" stroke={G_SASH} strokeWidth="3.4" strokeLinecap="round" />
          <path d="M100 30 L114 14 L118 26 L106 34 Z" fill={G_SASH} stroke="#B98F28" strokeWidth="0.8" strokeLinejoin="round" />
          <path d="M92 44 h5" stroke="#B98F28" strokeWidth="1" />

          {/* neck + head */}
          <rect x="55" y="56" width="10" height="10" rx="3" fill={G_SKIN} />
          <circle cx="60" cy="50" r="12.5" fill={G_SKIN} />
          {/* gold hair */}
          <path d="M47.5 50 a12.5 12.5 0 0 1 25 0 l-3 0 a9.5 9.5 0 0 0-19 0 z" fill={G_HAIR} />
          <path d="M48 50 q-3 12 2 18 l3 -2 q-4 -8 -2 -16 z" fill={G_HAIR} />
          <path d="M72 50 q3 12 -2 18 l-3 -2 q4 -8 2 -16 z" fill={G_HAIR} />

          <Halo cy={28} />
        </>
      ) : skinId === 'michael' ? (
        <>
          {/* ── Michael — the archangel (Daniel 12:1, Revelation 12:7) ── */}
          {/* steel-blue wings behind the armor */}
          <Wing fill={M2_WING} edge={M2_WING_EDGE} flip />
          <Wing fill={M2_WING} edge={M2_WING_EDGE} />

          {/* legs + greaves */}
          <rect x="50" y="118" width="9" height="32" rx="4" fill={M2_TUNIC} />
          <rect x="61" y="118" width="9" height="32" rx="4" fill={M2_TUNIC} />
          <path d="M46 148 h16 v6 a4 4 0 0 1-4 4 h-8 a4 4 0 0 1-4-4 z" fill={M2_ARMOR} stroke={M2_ARMOR_SHADE} strokeWidth="0.8" />
          <path d="M58 148 h16 v6 a4 4 0 0 1-4 4 h-8 a4 4 0 0 1-4-4 z" fill={M2_ARMOR} stroke={M2_ARMOR_SHADE} strokeWidth="0.8" />

          {/* war tunic under the plate */}
          <path d="M44 66 Q60 60 76 66 L76 120 Q60 126 44 120 Z" fill={M2_TUNIC} />

          {/* arms */}
          <rect x="34" y="70" width="9" height="34" rx="4.5" fill={M2_TUNIC} />
          <path d="M79 76 L88 52" stroke={M2_TUNIC} strokeWidth="8.5" strokeLinecap="round" />

          {/* breastplate + belt */}
          <path d="M45 67 Q60 61 75 67 L73 106 Q60 114 47 106 Z" fill={M2_ARMOR} stroke={M2_ARMOR_SHADE} strokeWidth="1.4" />
          <path d="M60 68 V108" stroke={M2_ARMOR_SHADE} strokeWidth="1.3" opacity="0.7" />
          <path d="M48 82 Q60 88 72 82" fill="none" stroke={M2_ARMOR_SHADE} strokeWidth="1.1" opacity="0.6" />
          <rect x="45" y="106" width="30" height="8" rx="3" fill={GOLD_DEEP} stroke={GOLD_LINE} />
          {/* pauldrons */}
          <ellipse cx="42" cy="70" rx="8" ry="6" fill={M2_ARMOR} stroke={M2_ARMOR_SHADE} strokeWidth="0.9" />
          <ellipse cx="78" cy="70" rx="8" ry="6" fill={M2_ARMOR} stroke={M2_ARMOR_SHADE} strokeWidth="0.9" />

          {/* shield on the left arm */}
          <path d="M20 84 L40 84 L40 106 Q30 118 20 106 Z" fill={M2_ARMOR} stroke={M2_ARMOR_SHADE} strokeWidth="1.2" />
          <path d="M30 88 v20 M23 95 h14" stroke={GOLD} strokeWidth="2.2" />

          {/* flaming sword, raised in the right hand — fire runs the whole blade */}
          <ellipse cx="89" cy="50" rx="4.2" ry="4.8" fill={M2_SKIN} />
          <path d="M80 46 q9 -5 18 0 l-1 3 q-8 -4 -16 0 z" fill={GOLD} stroke={GOLD_LINE} strokeWidth="0.6" />
          <path d="M78 40 q11 -6 22 0 l-1.5 5 q-9.5 -5 -19 0 z" fill={GOLD_DEEP} stroke={GOLD_LINE} strokeWidth="0.7" />
          <path d="M75 22 q6 -18 14 -20 q8 2 14 20 q-3 12 -14 20 q-11 -8 -14 -20 z" fill={M2_FLAME} opacity="0.85" />
          <path d="M80 24 q4 -13 9 -15 q5 2 9 15 q-2 9 -9 14 q-7 -5 -9 -14 z" fill={M2_FLAME_HI} opacity="0.85" />
          <rect x="86.6" y="12" width="4.4" height="30" rx="1.8" fill={STEEL} stroke={M2_ARMOR_SHADE} strokeWidth="0.7" />
          <path d="M86.6 16 L88.8 6 L91 16 Z" fill={STEEL} />

          {/* neck + head */}
          <rect x="55" y="56" width="10" height="10" rx="3" fill={M2_SKIN} />
          <circle cx="60" cy="50" r="12" fill={M2_SKIN} />
          {/* winged helm */}
          <path d="M47 50 a13 13 0 0 1 26 0 l-3.5 0 a9.5 9.5 0 0 0-19 0 z" fill={M2_ARMOR} stroke={M2_ARMOR_SHADE} strokeWidth="0.9" />
          <rect x="58" y="34" width="4" height="14" rx="1.5" fill={GOLD} stroke={GOLD_LINE} strokeWidth="0.6" />
          <path d="M47 42 q-10 -5 -16 4 q9 -2 15 4 z" fill={M2_ARMOR} stroke={M2_ARMOR_SHADE} strokeWidth="0.8" />
          <path d="M73 42 q10 -5 16 4 q-9 -2 -15 4 z" fill={M2_ARMOR} stroke={M2_ARMOR_SHADE} strokeWidth="0.8" />

          <Halo cy={24} rx={12} />
        </>
      ) : skinId === 'seraph' ? (
        <>
          {/* ── Seraph — the burning one (Isaiah 6:2–7). Six wings: two cover the
              face, two cover the feet, and with two he flies. ── */}
          {/* the glow it burns with — stacked rings instead of one flat disc, so
              it falls off softly on any card background */}
          <circle cx="60" cy="92" r="52" fill={S_WING} opacity="0.06" />
          <circle cx="60" cy="90" r="34" fill={S_WING} opacity="0.08" />
          <circle cx="60" cy="86" r="20" fill={S_COAL} opacity="0.1" />

          {/* "with two he flew" — the flying pair, spread wide behind it */}
          <Wing fill={S_WING_BACK} edge={S_WING_EDGE} flip transform="translate(0 16)" />
          <Wing fill={S_WING_BACK} edge={S_WING_EDGE} transform="translate(0 16)" />

          {/* column of fire-lit robe */}
          <path d="M46 66 Q60 60 74 66 L80 152 L40 152 Z" fill={S_BODY} />
          <path d="M60 70 L60 150" stroke={S_BODY_HI} strokeWidth="1.2" opacity="0.5" />
          <path d="M50 80 L46 150 M70 80 L74 150" stroke={S_BODY_HI} strokeWidth="0.8" opacity="0.35" />
          <rect x="46" y="98" width="28" height="6.5" rx="2.5" fill={S_WING_HI} opacity="0.9" />

          {/* head — drawn first, then veiled by the face pair */}
          <rect x="55" y="54" width="10" height="10" rx="3" fill={S_BODY_HI} />
          <circle cx="60" cy="48" r="11.5" fill={S_BODY_HI} />
          <circle cx="60" cy="48" r="7" fill={S_COAL} opacity="0.55" />

          {/* right arm holding the tongs */}
          <path d="M76 76 L86 62" stroke={S_BODY} strokeWidth="8" strokeLinecap="round" />
          <ellipse cx="87" cy="60" rx="4" ry="4.6" fill={S_BODY_HI} />
          {/* tongs + the live coal from the altar (Isaiah 6:6) */}
          <path d="M88 58 L98 46 M90 60 L102 51" stroke="#6E5233" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="101" cy="45" r="7.5" fill={S_COAL} opacity="0.3" />
          <circle cx="101" cy="45" r="4" fill={S_COAL} />
          <circle cx="100" cy="44" r="1.7" fill="#FFF3C4" />

          {/* "with two he covered his face" — the same wing, swung up and across
              the head so the pair crosses over the face */}
          <Wing fill={S_WING} edge={S_WING_EDGE} transform={FACE_WING} />
          <Wing fill={S_WING_HI} edge={S_WING_EDGE} flip transform={FACE_WING} />

          {/* "with two he covered his feet" — swung down across the hem */}
          <Wing fill={S_WING} edge={S_WING_EDGE} transform={FEET_WING} />
          <Wing fill={S_WING_HI} edge={S_WING_EDGE} flip transform={FEET_WING} />

          {/* embers rising off it */}
          <circle cx="30" cy="52" r="1.8" fill={S_COAL} opacity="0.85" />
          <circle cx="24" cy="100" r="1.4" fill={S_COAL} opacity="0.7" />
          <circle cx="96" cy="120" r="1.6" fill={S_COAL} opacity="0.75" />
          <circle cx="86" cy="142" r="1.3" fill={S_COAL} opacity="0.6" />

          <Halo cy={12} rx={10} />
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
      ) : skinId === 'eden' ? (
        <>
          {/* ── Eden — Eve reaching for the fruit (Genesis 3:6) ── */}
          {/* Composed right-heavy on purpose: figure left, tree right, one red
              fruit in the gap between her hand and the serpent's head. At chip
              size that's all that survives — person, tree, red dot — which is
              the test every skin here has to pass. Everything below that (bark
              grain, leaf plates, scales, grass) is detail for the 92px builder
              preview and the redeem sheet, and is layered so it drops out
              gracefully rather than turning to mush when it shrinks.
              Drawn back-to-front: light, canopy, trunk, branch, serpent, fruit,
              then Eve, so her reaching arm lands in front of the branch. */}

          {/* morning light behind the tree */}
          <circle cx="99" cy="26" r="40" fill={ED_LIGHT} opacity="0.035" />
          <circle cx="99" cy="26" r="32" fill={ED_LIGHT} opacity="0.035" />
          <circle cx="99" cy="26" r="24" fill={ED_LIGHT} opacity="0.04" />
          <circle cx="99" cy="26" r="15" fill={ED_LIGHT} opacity="0.045" />

          {/* canopy — shadow mass first, then the lit body, then a scalloped
              leaf edge so the silhouette reads as foliage and not as circles */}
          <ellipse cx="96" cy="34" rx="26" ry="20" fill={ED_CANOPY_DK} />
          <circle cx="78" cy="36" r="12" fill={ED_CANOPY_DK} />
          <circle cx="113" cy="47" r="10" fill={ED_CANOPY_DK} />
          <ellipse cx="94" cy="30" rx="25" ry="19" fill={ED_CANOPY} />
          <circle cx="76" cy="32" r="11.5" fill={ED_CANOPY} />
          <circle cx="112" cy="44" r="9.5" fill={ED_CANOPY} />
          <circle cx="88" cy="12" r="12" fill={ED_CANOPY} />
          {[
            [70, 33, 6], [73, 23, 7], [81, 15, 8], [91, 8, 8], [101, 10, 8],
            [110, 17, 8], [116, 26, 7], [118, 36, 6], [84, 38, 7], [97, 41, 7],
          ].map(([cx, cy, r]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={ED_CANOPY} />)}
          {/* dappled light on the crown */}
          <circle cx="86" cy="19" r="8.5" fill={ED_CANOPY_HI} opacity="0.5" />
          <circle cx="103" cy="28" r="6.5" fill={ED_CANOPY_HI} opacity="0.4" />
          <circle cx="74" cy="26" r="5" fill={ED_CANOPY_HI} opacity="0.38" />
          <circle cx="95" cy="14" r="4" fill={ED_CANOPY_HI} opacity="0.35" />
          {/* more fruit up in the branches — it has to read as a fruit tree,
              not a shade tree, but these stay small so they never compete with
              the one she's reaching for */}
          {[[86, 36, 3], [105, 38, 3], [97, 20, 2.6]].map(([cx, cy, r]) => (
            <g key={`f${cx}`}>
              <circle cx={cx} cy={cy} r={r} fill={ED_FRUIT} />
              <circle cx={cx - r * 0.32} cy={cy - r * 0.32} r={r * 0.34} fill={ED_FRUIT_HI} opacity="0.8" />
            </g>
          ))}

          {/* trunk — lit edge on the left, grain and a knot on the shadow side */}
          <path d="M86 158 Q90 108 90 48 L100 48 Q100 108 104 158 Z" fill={ED_BARK} />
          <path d="M86 158 Q90 108 90 48 L93 48 Q93 108 89 158 Z" fill={ED_BARK_HI} opacity="0.45" />
          <path d="M95 60 Q96 108 92 152 M99 58 Q98 106 102 152 M97 74 Q97.5 100 96 130"
            stroke={ED_BARK_LINE} strokeWidth="1" fill="none" opacity="0.45" />
          <ellipse cx="96.5" cy="116" rx="2.8" ry="3.8" fill={ED_BARK_LINE} opacity="0.55" />
          <ellipse cx="96.5" cy="116" rx="1.2" ry="1.8" fill={ED_BARK} opacity="0.7" />
          {/* root flare */}
          <path d="M86 158 Q80 152 76 154 Q82 154 85 158 Z" fill={ED_BARK} />
          <path d="M104 158 Q110 151 114 153 Q107 154 105 158 Z" fill={ED_BARK} />
          <path d="M89 158 Q86 154 83 155" stroke={ED_BARK_LINE} strokeWidth="0.8" fill="none" opacity="0.5" />

          {/* sprig off the trunk, breaking up the bare column */}
          <path d="M99 96 q7 -3 11 -9" fill="none" stroke={ED_BARK} strokeWidth="2" strokeLinecap="round" />
          <path d="M104 92 q4 -4.5 7.5 0.5 q-4 4 -7.5 -0.5 z" fill={ED_LEAF} />
          <path d="M108 85 q4 -4.5 7.5 0.5 q-4 4 -7.5 -0.5 z" fill={ED_LEAF_HI} opacity="0.85" />

          {/* the low branch the fruit hangs from */}
          <path d="M95 52 Q82 42 68 43" stroke={ED_BARK} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M95 51 Q82 41 68 42" stroke={ED_BARK_HI} strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.5" />
          <path d="M88 47 q4 -3.5 7 0.5 q-3.5 3.5 -7 -0.5 z" fill={ED_LEAF} opacity="0.9" />

          {/* serpent — down out of the canopy, one coil round the branch, head
              over the fruit. Thin on purpose: it's the villain, not the subject,
              and at thicker weights it read as a green ribbon across the frame. */}
          <path d="M92 32 Q88 42 81 37 Q75 33 76 40 Q77 45 81 45"
            fill="none" stroke={ED_SERPENT_DARK} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M92 32 Q88 42 81 37 Q75 33 76 40 Q77 45 81 45"
            fill="none" stroke={ED_SERPENT} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          {/* scale banding, as a dashed highlight down the length of the body */}
          <path d="M92 32 Q88 42 81 37 Q75 33 76 40 Q77 45 81 45"
            fill="none" stroke={ED_SERPENT_HI} strokeWidth="0.9" strokeDasharray="1.5 2.3"
            strokeLinecap="round" opacity="0.75" />
          {/* head, tipped down toward the fruit but never touching it — the two
              reds have to stay separable or they merge into one shape */}
          <ellipse cx="81" cy="45.5" rx="4.2" ry="3" fill={ED_SERPENT} transform="rotate(20 81 45.5)" />
          <ellipse cx="81" cy="45.5" rx="4.2" ry="3" fill="none" stroke={ED_SERPENT_DARK}
            strokeWidth="0.6" transform="rotate(20 81 45.5)" />
          <path d="M77.4 47 q3.4 1.4 6.8 -0.6" fill="none" stroke={ED_SERPENT_DARK}
            strokeWidth="0.6" opacity="0.8" />
          <circle cx="82.6" cy="44.4" r="1" fill={ED_BARK_LINE} />
          <circle cx="82.9" cy="44.1" r="0.35" fill={ED_LIGHT} />
          <path d="M78.4 47.6 l-3 2 m3 -2 l-3.2 0.4" stroke={ED_FRUIT_HI} strokeWidth="0.85" strokeLinecap="round" />

          {/* the fruit, hanging just past her fingers */}
          <path d="M68 44 L68 49" stroke={ED_BARK_LINE} strokeWidth="1.4" strokeLinecap="round" />
          <path d="M68 48 q4.5 -2.5 6 0.5 q-3.5 1.6 -6 -0.5 z" fill={ED_LEAF_DARK} />
          <circle cx="68" cy="55" r="6" fill={ED_FRUIT_DK} />
          <circle cx="67.2" cy="54.4" r="5.4" fill={ED_FRUIT} />
          <ellipse cx="65.9" cy="52.6" rx="2" ry="1.5" fill={ED_FRUIT_HI} opacity="0.9" transform="rotate(-30 65.9 52.6)" />

          {/* legs + bare feet */}
          <rect x="36" y="116" width="8" height="38" rx="4" fill={ED_SKIN} />
          <rect x="45" y="116" width="8" height="38" rx="4" fill={ED_SKIN} />
          <rect x="45" y="116" width="2.6" height="38" rx="1.3" fill={ED_SKIN_SH} opacity="0.5" />
          <ellipse cx="39" cy="155" rx="5.6" ry="3.2" fill={ED_SKIN} />
          <ellipse cx="50" cy="155" rx="5.6" ry="3.2" fill={ED_SKIN} />
          <path d="M36 154.6 h6 M47 154.6 h6" stroke={ED_SKIN_SH} strokeWidth="0.7" opacity="0.5" strokeLinecap="round" />

          {/* long hair down her back — wavy outer edge, kept inside the body
              line so it doesn't read as a cape at small sizes */}
          <path d="M35 56 Q30 70 32 82 Q29 94 34 104 Q31 110 36 114 L42 114 Q38 100 39 86 Q40 70 41 62 Z" fill={ED_HAIR} />
          <path d="M36 64 Q33 78 35 90 Q33 100 37 108" stroke={ED_HAIR_HI} strokeWidth="1.2" fill="none" opacity="0.55" />
          <path d="M39 68 Q37 82 38.5 96" stroke={ED_HAIR_HI} strokeWidth="0.8" fill="none" opacity="0.35" />
          <path d="M55 56 Q58 74 54 84 L49 82 Q52 70 51 60 Z" fill={ED_HAIR} />
          <path d="M55 60 Q57 72 54.5 80" stroke={ED_HAIR_HI} strokeWidth="0.8" fill="none" opacity="0.4" />

          {/* leaf wrap — calf-length, scalloped leaf hem, vine at the waist */}
          <path d="M31 70 Q44 63 57 70 L55 134 q-2.75 7 -5.5 0 q-2.75 7 -5.5 0 q-2.75 7 -5.5 0 q-2.75 7 -5.5 0 Z" fill={ED_LEAF} />
          {/* shadow down the side away from the light */}
          <path d="M31 70 Q35 67.5 38 66.8 L37 136 q-2.6 5.4 -5.2 0.6 Z" fill={ED_LEAF_DARK} opacity="0.32" />
          {/* overlapping leaf plates, so the wrap reads as foliage not cloth */}
          <path d="M44 66 Q52 64 56 71 Q49 74 44 71 Z" fill={ED_LEAF_HI} opacity="0.9" />
          {[
            [33.5, 80], [43, 79],
            [34.5, 92], [43.5, 91],
            [34.5, 114], [43.5, 113],
            [36, 126], [44.5, 125.5],
          ].map(([x, y]) => (
            <g key={`lf${x}-${y}`}>
              <path d={`M${x} ${y} q5.4 -5 9.8 1.2 q-5.4 5 -9.8 -1.2 z`} fill={ED_LEAF_HI} opacity="0.5" />
              <path d={`M${x + 0.8} ${y + 0.3} q4.8 -2.4 8.6 0.7`} fill="none" stroke={ED_LEAF_DARK} strokeWidth="0.5" opacity="0.45" />
            </g>
          ))}
          <path d="M44 72 L44 136" stroke={ED_LEAF_DARK} strokeWidth="0.9" opacity="0.35" />
          {/* vine belt, tied off */}
          <path d="M33 104 q11 5 22 0" fill="none" stroke={ED_LEAF_DARK} strokeWidth="2.2" strokeLinecap="round" />
          <path d="M53 105 q3 3 1 6 M55 105 q3 2 2 5" fill="none" stroke={ED_LEAF_DARK} strokeWidth="1.2" strokeLinecap="round" />

          {/* arm at her side — drawn after the wrap, with a shoulder cap that
              overlaps it, so the limb reads as attached rather than floating */}
          <ellipse cx="32" cy="74" rx="5.2" ry="4.6" fill={ED_SKIN} />
          <rect x="27" y="72" width="8" height="30" rx="4" fill={ED_SKIN} />
          <rect x="27.2" y="76" width="2.2" height="24" rx="1.1" fill={ED_SKIN_SH} opacity="0.28" />
          <ellipse cx="31" cy="104" rx="4.1" ry="4.5" fill={ED_SKIN} />

          {/* neck + head */}
          <rect x="39" y="58" width="10" height="10" rx="3" fill={ED_SKIN} />
          <path d="M39 58 q5 4 10 0 v3 q-5 3.5 -10 0 z" fill={ED_SKIN_SH} opacity="0.4" />
          <circle cx="44" cy="52" r="12" fill={ED_SKIN} />
          <path d="M32 52 a12 12 0 0 1 24 0 l-3 0 a9 9 0 0 0-18 0 z" fill={ED_HAIR} />
          <path d="M33.4 47 a12 12 0 0 1 5.6 -6.6" fill="none" stroke={ED_HAIR_HI} strokeWidth="1" opacity="0.4" strokeLinecap="round" />

          {/* the reach — up past her head, fingers stopping short of the fruit */}
          <path d="M53 78 Q59 68 58 56" fill="none" stroke={ED_SKIN} strokeWidth="8" strokeLinecap="round" />
          <path d="M55.4 74 Q60.4 66.5 60 58.5" fill="none" stroke={ED_SKIN_SH} strokeWidth="1.8" strokeLinecap="round" opacity="0.4" />
          <ellipse cx="57.8" cy="53.5" rx="4" ry="4.4" fill={ED_SKIN} />
          <path d="M58.5 49.6 l1.4 -3.2 M60.6 51 l3 -2.4 M61 54 l3.2 -0.8" stroke={ED_SKIN} strokeWidth="2.1" strokeLinecap="round" />
          <path d="M61 54 l3.2 -0.8" stroke={ED_SKIN_SH} strokeWidth="0.7" strokeLinecap="round" opacity="0.5" />

          {/* garden floor — grass, a couple of flowers, a pebble */}
          <path d="M80 158 q2 -6 4 -1 M106 158 q2 -6 4 -1 M72 159 q2 -5 3 -1 M112 159 q1.5 -5 3 -1
                   M29 158 q2 -6 3.5 -1 M60 158 q2 -6 4 -1 M66 159 q1.6 -5 3 -1"
            fill="none" stroke={ED_LEAF} strokeWidth="1.6" strokeLinecap="round" />
          {[[25, 154.5], [84, 155.5]].map(([fx, fy]) => (
            <g key={`fl${fx}`}>
              <path d={`M${fx} 158.5 v-3.2`} stroke={ED_LEAF_DARK} strokeWidth="0.8" strokeLinecap="round" />
              {[0, 72, 144, 216, 288].map((a) => (
                <ellipse key={a} cx={fx} cy={fy - 1.5} rx="0.75" ry="1.3" fill={ED_LIGHT}
                  opacity="0.85" transform={`rotate(${a} ${fx} ${fy})`} />
              ))}
              <circle cx={fx} cy={fy} r="0.7" fill={ED_FRUIT_HI} opacity="0.9" />
            </g>
          ))}
          <ellipse cx="70" cy="159" rx="3" ry="1.4" fill={ED_BARK_HI} opacity="0.45" />
        </>
      ) : skinId === 'sonshine' ? (
        <>
          {/* ── Sonshine — the creator collab ── */}
          {/* Built back-to-front so the torso's dark edge lands over the arm
              seams: legs, arms, torso, head. Nothing here overlaps by accident
              — every rect sits on the 4-unit grid described at SS_HAIR. */}

          {/* legs — denim, split by a seam so two legs still read as two at
              chip size, where they are three pixels wide between them */}
          <rect x="44" y="104" width="32" height="40" fill={SS_DENIM} />
          <rect x="70" y="104" width="6" height="40" fill={SS_DENIM_DK} />
          <rect x="59" y="104" width="2" height="40" fill={SS_DENIM_DK} />

          {/* red high-tops: upper, stripe, sole */}
          <rect x="44" y="144" width="32" height="8" fill={SS_SHOE} />
          <rect x="70" y="144" width="6" height="8" fill={SS_SHOE_DK} />
          <rect x="59" y="144" width="2" height="8" fill={SS_SHOE_DK} />
          <rect x="46" y="146" width="11" height="2" fill={SS_SOLE} />
          <rect x="62" y="146" width="11" height="2" fill={SS_SOLE} />
          <rect x="44" y="152" width="32" height="4" fill={SS_SOLE} />
          <rect x="59" y="152" width="2" height="4" fill="#D6D1C4" />

          {/* arms — black sleeves, bare hands below the cuff */}
          <rect x="28" y="56" width="16" height="40" fill={SS_JACKET} />
          <rect x="40" y="56" width="4" height="40" fill={SS_JACKET_DK} />
          <rect x="28" y="96" width="16" height="8" fill={SS_SKIN} />
          <rect x="40" y="96" width="4" height="8" fill={SS_SKIN_SH} />
          <rect x="76" y="56" width="16" height="40" fill={SS_JACKET} />
          <rect x="86" y="56" width="6" height="40" fill={SS_JACKET_DK} />
          <rect x="76" y="96" width="16" height="8" fill={SS_SKIN} />
          <rect x="86" y="96" width="6" height="8" fill={SS_SKIN_SH} />

          {/* torso — open black hoodie over a light tee */}
          <rect x="44" y="56" width="32" height="40" fill={SS_JACKET} />
          <rect x="68" y="56" width="8" height="40" fill={SS_JACKET_DK} />
          <rect x="56" y="56" width="7" height="40" fill={SS_TEE} />
          <rect x="60" y="56" width="3" height="40" fill={SS_TEE_SH} />
          <rect x="53" y="58" width="2" height="12" fill={SS_TEE} />
          <rect x="65" y="58" width="2" height="12" fill={SS_TEE_SH} />
          <rect x="44" y="96" width="32" height="8" fill={SS_DENIM} />
          <rect x="68" y="96" width="8" height="8" fill={SS_DENIM_DK} />

          {/* head — face first, then the hair laid over it */}
          <rect x="44" y="36" width="32" height="20" fill={SS_SKIN} />
          <rect x="72" y="36" width="4" height="20" fill={SS_SKIN_SH} />
          <rect x="44" y="24" width="32" height="12" fill={SS_HAIR} />
          <rect x="44" y="24" width="32" height="4" fill={SS_HAIR_HI} />
          <rect x="72" y="24" width="4" height="12" fill={SS_HAIR_DK} />
          {/* fringe, parted off-centre, with the sideburns a row below */}
          <rect x="44" y="36" width="12" height="4" fill={SS_HAIR} />
          <rect x="64" y="36" width="12" height="4" fill={SS_HAIR} />
          <rect x="72" y="36" width="4" height="4" fill={SS_HAIR_DK} />
          <rect x="44" y="40" width="4" height="4" fill={SS_HAIR} />
          <rect x="72" y="40" width="4" height="4" fill={SS_HAIR_DK} />
          <rect x="52" y="42" width="4" height="8" fill={SS_EYE} />
          <rect x="64" y="42" width="4" height="8" fill={SS_EYE} />
          <rect x="56" y="52" width="8" height="2" fill={SS_SKIN_SH} />
        </>
      ) : (
        <>
          {/* ── Default pilgrim + Armor of God ── */}
          {/* Carried cross (Luke 9:23) — drawn BEHIND the player's own character,
              angled over the shoulder, so the equipped look is "my character
              carrying a cross" rather than a separate figure. */}
          {skinId === 'cross' && (
            <>
              {/* glowing golden aura around the cross (bright, pulsing) */}
              <g className="va-cross-glow">
                <path d="M22 160 L96 40" stroke="#FFE7A0" strokeWidth="28" strokeLinecap="round" opacity="0.30" />
                <path d="M69 46 L103 60" stroke="#FFE7A0" strokeWidth="25" strokeLinecap="round" opacity="0.30" />
                <path d="M22 160 L96 40" stroke="#FFD23F" strokeWidth="19" strokeLinecap="round" opacity="0.48" />
                <path d="M69 46 L103 60" stroke="#FFD23F" strokeWidth="17" strokeLinecap="round" opacity="0.48" />
                <path d="M22 160 L96 40" stroke="#FFF6CE" strokeWidth="13" strokeLinecap="round" opacity="0.6" />
                <path d="M69 46 L103 60" stroke="#FFF6CE" strokeWidth="11" strokeLinecap="round" opacity="0.6" />
              </g>
              {/* the cross itself */}
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
          {items.cape === 'item_gleaner_shawl' && (
            <>
              <path d="M42 63 Q60 58 78 63 L90 148 L30 148 Z" fill="#B49B6C" />
              {/* barley-stitch hem */}
              <path d="M32 144 L88 144" stroke="#8A6F42" strokeWidth="2" strokeDasharray="3 3" />
              <rect x="54" y="62" width="12" height="4" rx="2" fill="#CBB584" />
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
          {items.held === 'item_sickle' && (
            <>
              <rect x="82.5" y="96" width="4" height="18" rx="2" fill="#7A5A34" />
              <path d="M84.5 96 q-14 -14 0 -26 q4 10 10 14 q-2 8 -10 12 z" fill="#B98A3C" stroke="#8A6420" strokeWidth="1.2" />
            </>
          )}
          {items.held === 'item_winnowing_fork' && (
            <>
              <rect x="83" y="60" width="3.6" height="90" rx="1.8" fill="#8A6438" />
              <path d="M78 60 v-14 M84.8 62 v-18 M91.5 60 v-14" stroke="#8A6438" strokeWidth="3" strokeLinecap="round" />
              <path d="M77 61 h15" stroke="#8A6438" strokeWidth="3.4" strokeLinecap="round" />
            </>
          )}
          {items.held === 'item_water_skin' && (
            <>
              <path d="M80 96 q10 -3 12 6 q2 9 -7 10 q-9 1 -10 -7 q-1 -7 5 -9 z" fill="#A66A38" stroke="#7C4C22" strokeWidth="1.2" />
              <rect x="88.5" y="92" width="4" height="6" rx="1.5" fill="#7C4C22" />
              <path d="M80 98 q6 6 11 3" stroke="#C89864" strokeWidth="1.4" fill="none" />
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
          {items.hat === 'item_harvest_headscarf' && (
            <>
              <path d="M47 47 a13 13 0 0 1 26 0 l0 4 a13 13 0 0 0-26 0 z" fill="#E4D2A8" stroke="#B8A06C" strokeWidth="0.8" />
              <path d="M48 44 a12 12 0 0 1 24 0" fill="none" stroke="#C8863C" strokeWidth="2.2" />
              <path d="M71 48 q6 9 1 21 l-5 -2 q4 -10 0 -17 z" fill="#E4D2A8" stroke="#B8A06C" strokeWidth="0.8" />
            </>
          )}
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

          {/* Day One (live exclusive) — sunglasses + a gold flex sparkle */}
          {skinId === 'shades' && (
            <>
              <rect x="48" y="46.4" width="24" height="2.2" rx="1.1" fill="#14141a" />
              <ellipse cx="54" cy="50" rx="5.2" ry="4.2" fill="#14141a" />
              <ellipse cx="66" cy="50" rx="5.2" ry="4.2" fill="#14141a" />
              <path d="M51.5 48.4 q2.6 -1.8 5.2 0" stroke="#5f86ad" strokeWidth="1.3" fill="none" opacity="0.85" />
              <path d="M63.5 48.4 q2.6 -1.8 5.2 0" stroke="#5f86ad" strokeWidth="1.3" fill="none" opacity="0.85" />
              <path d="M49 49 L45 47.5" stroke="#14141a" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M71 49 L75 47.5" stroke="#14141a" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M74 40 l0.9 2.3 l2.3 0.9 l-2.3 0.9 l-0.9 2.3 l-0.9 -2.3 l-2.3 -0.9 l2.3 -0.9 z" fill="#FFD23F" />
            </>
          )}
        </>
      )}
    </svg>
  )
}
