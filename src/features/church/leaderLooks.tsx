import { useState } from 'react'
import { figureOf, hairHex, skinHex } from '@/data/avatar'
import type { AvatarSpec } from '@/types'
import { DEFAULT_LEADER_LOOK, DEFAULT_LEADER_LOOKS, type LeaderLookId } from './pricing'

// How a church's leadership looks AS leadership — a separate figure from the
// player's own character, never written into `avatar_character`. A pastor's
// look is a fact about the role at that church (0136 stores it per church), so
// equipping one must not repaint them on the Battle tab.
//
// Same layering as every look here: the owner's painting when there is one
// (OWNER_LOOK_ART below), else the DRAWN figure in the leader's own skin tone
// and hair from their character. The drawing is the fallback, not a leftover —
// a failed load or a figure with no painting still renders as itself. A delivered custom avatar is an https URL from the server
// (0136 refuses anything else) and falls back to the drawing on a failed load.
//
// viewBox 0 0 120 170, ground at y 162 — Character's frame, so a leader can
// stand anywhere a figure already stands.

// These are ADULTS, and the drawn figure has to read as one. The pilgrim's
// head (r 13 on a ~135-unit body, about five heads tall) is a child's
// proportion; scaled to 0.74 about the top of the neck it is ~6.7 heads, an
// adult's, without redrawing the hair caps.
const ADULT_HEAD = 'translate(60 52) scale(0.74) translate(-60 -52)'

// The owner's paintings (2026-10-23): adult, full-length, cut out of their
// magenta backdrop by scripts/key-owner-figure.mjs into public/skins/
// leader-looks/. Hand-kept, deliberately NOT in GENERATED_ART — a gen-art run
// writes that map and must never be able to overwrite these (the rule the
// road rewards and the nav paintings follow).
//
// One painting per look, plus tone/hair variants (ten so far). A leader gets the
// variant that matches their own skin tone AND hair exactly, else the look's
// painting. All fifteen are men, so a woman leader gets the DRAWN figure in her
// own tone until women's paintings exist — a man standing in for her would be
// a stranger wearing her name.
const OWNER_DIR = '/skins/leader-looks'
const OWNER_LOOK_ART: Record<Exclude<LeaderLookId, 'custom'>, string> = {
  'classic-clergy': `${OWNER_DIR}/classic-clergy.png`,
  'liturgical-vestments': `${OWNER_DIR}/liturgical-vestments.png`,
  'professional-suit': `${OWNER_DIR}/professional-suit.png`,
  'robe-stole': `${OWNER_DIR}/robe-stole.png`,
  contemporary: `${OWNER_DIR}/contemporary.png`,
}
/** `look|tone|hair` → painting. Tones and hairs are the AvatarSpec keys. */
const OWNER_VARIANTS: Record<string, string> = {
  'classic-clergy|amber|chestnut': `${OWNER_DIR}/classic-clergy-amber-chestnut.png`,
  'classic-clergy|porcelain|auburn': `${OWNER_DIR}/classic-clergy-porcelain-auburn.png`,
  // Supplied as "bronze-black"; black hair is the `jet` key.
  'liturgical-vestments|bronze|jet': `${OWNER_DIR}/liturgical-vestments-bronze-black.png`,
  'professional-suit|sand|chestnut': `${OWNER_DIR}/professional-suit-sand-chestnut.png`,
  // Supplied as "medium-dark", which is not one of the six tones; filed under
  // bronze with the default hair, between amber and umber.
  'robe-stole|bronze|espresso': `${OWNER_DIR}/robe-stole-medium-dark.png`,
  // The second batch. "deepbrown" is umber (ebony is the very dark brown),
  // "gray" is the `ash` key, and "medium" — the tone between sand and bronze —
  // is amber.
  'classic-clergy|umber|jet': `${OWNER_DIR}/classic-clergy-deepbrown-black.png`,
  'classic-clergy|porcelain|ash': `${OWNER_DIR}/classic-clergy-porcelain-gray.png`,
  'contemporary|bronze|jet': `${OWNER_DIR}/contemporary-bronze-black.png`,
  'liturgical-vestments|sand|auburn': `${OWNER_DIR}/liturgical-vestments-sand-auburn.png`,
  'professional-suit|amber|chestnut': `${OWNER_DIR}/professional-suit-medium-chestnut.png`,
}

function ownerLookArt(look: Exclude<LeaderLookId, 'custom'>, fem: boolean, tone: string, hair: string): string | undefined {
  if (fem) return undefined
  return OWNER_VARIANTS[`${look}|${tone}|${hair}`] ?? OWNER_LOOK_ART[look]
}

type Garment = {
  /** The long garment from the shoulders down. */
  body: string
  /** Where it stops: a full-length garment hides the legs. */
  hem: number
  /** Trousers under a short jacket. */
  legs?: string
  /** What shows at the throat. */
  collar: 'tab' | 'band' | 'open' | 'none'
  shirt?: string
  stole?: { color: string; trim?: string; cross?: boolean }
  lapels?: boolean
  cincture?: string
}

const GARMENTS: Record<Exclude<LeaderLookId, 'custom'>, Garment> = {
  'classic-clergy': { body: '#1d1b22', hem: 158, collar: 'band' },
  'liturgical-vestments': { body: '#f2efe6', hem: 158, collar: 'none', stole: { color: '#5b3a8c', trim: '#d9b45a', cross: true }, cincture: '#d8d2c2' },
  'professional-suit': { body: '#232a3d', hem: 112, legs: '#1d2333', collar: 'tab', shirt: '#2a2a30', lapels: true },
  'robe-stole': { body: '#2b2433', hem: 158, collar: 'none', stole: { color: '#7a2e3a', trim: '#d9b45a', cross: true } },
  contemporary: { body: '#8a7a64', hem: 112, legs: '#2e3a52', collar: 'open', shirt: '#e8e4da', lapels: true },
}

export function leaderLookName(look: LeaderLookId | null | undefined): string {
  if (look === 'custom') return 'Your custom look'
  return (DEFAULT_LEADER_LOOKS.find((l) => l.id === look) ?? DEFAULT_LEADER_LOOKS[0]).name
}

export function LeaderLookFigure({
  look,
  spec,
  customArtUrl,
  size = 120,
  title,
  preview = false,
}: {
  look: LeaderLookId | null | undefined
  /** The leader's own character — only tone, hair and figure are read. */
  spec?: AvatarSpec | null
  customArtUrl?: string | null
  size?: number
  title?: string
  /** A picker tile: show the look's own painting whoever is choosing, because
   *  the tile's job is to show the OUTFIT. Off, it is how this leader appears. */
  preview?: boolean
}) {
  const fem = spec ? figureOf(spec) === 'fem' : false
  const skin = skinHex(spec?.skin ?? 'sand')
  const hair = hairHex(spec?.hair)
  const custom = look === 'custom' && customArtUrl ? customArtUrl : null
  const id = look && look !== 'custom' ? look : DEFAULT_LEADER_LOOK
  const g = GARMENTS[id]
  const tone = spec?.skin ?? 'sand'
  const hairKey = spec?.hair ?? 'espresso'
  const raster = custom ?? (preview ? OWNER_LOOK_ART[id] : ownerLookArt(id, fem, tone, hairKey))
  const [failed, setFailed] = useState<string | null>(null)
  const useRaster = !!raster && failed !== raster

  return (
    <svg
      width={size}
      height={size * (170 / 120)}
      viewBox="0 0 120 170"
      role="img"
      aria-label={title ?? leaderLookName(look)}
      style={{ display: 'block' }}
    >
      <ellipse cx="60" cy="162" rx="30" ry="5" fill="rgba(0,0,0,0.16)" />
      {useRaster ? (
        <image
          href={raster!}
          x="0"
          y="0"
          width="120"
          height="166"
          preserveAspectRatio="xMidYMax meet"
          onError={() => setFailed(raster!)}
        />
      ) : (
        <g>
          {/* Long hair falls behind the shoulders — scaled with the head (ADULT_HEAD). */}
          {fem && <path transform={ADULT_HEAD} d="M44 38 Q44 70 50 80 L70 80 Q76 70 76 38 Z" fill={hair} />}

          {/* Legs + shoes under a short jacket; just shoes under a long one. */}
          {g.legs && <path d="M47 110 L50 158 L59 158 L60 118 L61 158 L70 158 L73 110 Z" fill={g.legs} />}
          <ellipse cx="54" cy="159" rx="7" ry="3" fill="#15131a" />
          <ellipse cx="66" cy="159" rx="7" ry="3" fill="#15131a" />

          {/* The garment. */}
          {g.hem > 120 ? (
            <path d={`M44 60 Q60 54 76 60 L84 ${g.hem} L36 ${g.hem} Z`} fill={g.body} />
          ) : (
            <path d={`M44 60 Q60 54 76 60 L79 ${g.hem} L41 ${g.hem} Z`} fill={g.body} />
          )}
          {/* Sleeves and hands. */}
          <path d="M44 61 L36 104 L43 106 L49 70 Z" fill={g.body} />
          <path d="M76 61 L84 104 L77 106 L71 70 Z" fill={g.body} />
          <circle cx="39" cy="107" r="4.2" fill={skin} />
          <circle cx="81" cy="107" r="4.2" fill={skin} />

          {/* Shirt front under a jacket. */}
          {g.shirt && <path d="M54 58 L66 58 L63 96 L57 96 Z" fill={g.shirt} />}
          {g.lapels && (
            <>
              <path d="M53 58 L60 80 L49 66 Z" fill="rgba(0,0,0,0.22)" />
              <path d="M67 58 L60 80 L71 66 Z" fill="rgba(0,0,0,0.22)" />
            </>
          )}
          {g.cincture && <rect x="42" y="96" width="36" height="2.6" rx="1.3" fill={g.cincture} />}

          {g.stole && (
            <g>
              <path d="M52 58 L50 136 L56 136 L57 62 Z" fill={g.stole.color} />
              <path d="M68 58 L70 136 L64 136 L63 62 Z" fill={g.stole.color} />
              {g.stole.trim && (
                <>
                  <rect x="50" y="132" width="6" height="2" fill={g.stole.trim} />
                  <rect x="64" y="132" width="6" height="2" fill={g.stole.trim} />
                </>
              )}
              {g.stole.cross && g.stole.trim && (
                <>
                  <rect x="52.2" y="118" width="1.6" height="8" fill={g.stole.trim} />
                  <rect x="50.6" y="120.4" width="4.8" height="1.6" fill={g.stole.trim} />
                  <rect x="66.2" y="118" width="1.6" height="8" fill={g.stole.trim} />
                  <rect x="64.6" y="120.4" width="4.8" height="1.6" fill={g.stole.trim} />
                </>
              )}
            </g>
          )}

          {/* Neck, head, hair cap — faceless, like the drawn pilgrim. */}
          <rect x="56" y="48" width="8" height="12" rx="3" fill={skin} />
          {g.collar === 'band' && <rect x="54" y="56" width="12" height="3.2" rx="1.2" fill="#f4f2ec" />}
          {g.collar === 'tab' && (
            <>
              <rect x="54" y="56" width="12" height="3.2" rx="1.2" fill={g.shirt ?? '#2a2a30'} />
              <rect x="58" y="56.4" width="4" height="2.6" fill="#f4f2ec" />
            </>
          )}
          {g.collar === 'open' && <path d="M55 58 L60 66 L65 58 Z" fill={skin} />}
          <g transform={ADULT_HEAD}>
          <circle cx="60" cy="40" r="13" fill={skin} />
          <path d={fem ? 'M46 40 Q46 25 60 25 Q74 25 74 40 Q68 31 60 31 Q52 31 46 40 Z' : 'M47 38 Q48 26 60 26 Q72 26 73 38 Q67 31 60 31 Q53 31 47 38 Z'} fill={hair} />
          </g>
        </g>
      )}
    </svg>
  )
}
