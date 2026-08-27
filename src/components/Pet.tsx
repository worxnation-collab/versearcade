import { PETS, petById } from '@/data/pets'

// The companion that stands beside your figure on your own profile.
//
// Same constraints as every other drawn thing here — flat fills, no <defs>, no
// gradients or filters — because several can be on screen at once (the picker
// grid) and shared <defs> ids across SVG instances are how one instance ends up
// painting another's colours.
//
// Each pet is drawn in a 60x60 box standing on the floor of it (y=56), so the
// hero can line a pet's feet up with the figure's without knowing which pet it
// is. Generated art (art/pets.json) layers over these the same way RASTER_DECOR
// and RASTER_FLORA do — a batch that hasn't been generated yet degrades to the
// drawing rather than to a hole beside the player.

const WOOL = '#efe7d6'
const WOOL_SHADE = '#d3c8b2'
const HIDE = '#8a6a44'
const HIDE_DARK = '#6b5133'
const HIDE_LIGHT = '#b08a5c'
const FACE = '#4a3f38'
const EYE = '#1d1720'
const BEAK = '#e8b64c'
const FEATHER = '#e9eef5'
const FEATHER_SHADE = '#c6d0dd'
const RAVEN = '#3a3a4c'
const RAVEN_SHEEN = '#565a75'
const MANE = '#c98a3c'
const TAN = '#d2a765'
const TAN_DARK = '#a9834a'

/** Each pet, drawn standing on y=56 of a 60x60 box. */
const ART: Record<string, JSX.Element> = {
  pet_lamb: (
    <g>
      <ellipse cx="30" cy="57" rx="16" ry="2.6" fill="rgba(0,0,0,0.18)" />
      <g fill={HIDE_DARK}>
        <rect x="19" y="44" width="4" height="12" rx="1.6" />
        <rect x="27" y="44" width="4" height="12" rx="1.6" />
        <rect x="35" y="44" width="4" height="12" rx="1.6" />
      </g>
      {/* fleece: overlapping curls, not one oval */}
      <g fill={WOOL}>
        <circle cx="24" cy="36" r="10" />
        <circle cx="34" cy="35" r="10" />
        <circle cx="29" cy="30" r="9" />
        <circle cx="40" cy="39" r="7" />
      </g>
      <g fill={WOOL_SHADE}>
        <circle cx="24" cy="42" r="5" />
        <circle cx="34" cy="43" r="5" />
      </g>
      {/* head, turned to the player */}
      <ellipse cx="44" cy="29" rx="8" ry="7" fill={WOOL} />
      <ellipse cx="46" cy="32" rx="5.4" ry="4.4" fill={FACE} />
      <ellipse cx="37" cy="27" rx="4" ry="2.6" fill={WOOL_SHADE} />
      <ellipse cx="51" cy="28" rx="3.4" ry="2.2" fill={WOOL_SHADE} />
      <circle cx="46" cy="28" r="1.5" fill={EYE} />
      <circle cx="49" cy="33" r="1" fill={EYE} />
    </g>
  ),
  pet_dove: (
    <g>
      <ellipse cx="30" cy="57" rx="11" ry="2.2" fill="rgba(0,0,0,0.18)" />
      <g fill={HIDE_LIGHT}>
        <rect x="27" y="48" width="2.6" height="8" rx="1.2" />
        <rect x="33" y="48" width="2.6" height="8" rx="1.2" />
      </g>
      {/* body + tail */}
      <ellipse cx="31" cy="38" rx="13" ry="11" fill={FEATHER} />
      <path d="M19 40 l-12 6 l12 2 z" fill={FEATHER_SHADE} />
      {/* wing, half-open */}
      <path d="M28 32 q12 2 14 12 q-10 3 -16 -4 z" fill={FEATHER_SHADE} />
      {/* head */}
      <circle cx="42" cy="27" r="7.4" fill={FEATHER} />
      <path d="M48 27 l7 2 l-7 2.4 z" fill={BEAK} />
      <circle cx="44" cy="25" r="1.5" fill={EYE} />
      {/* the olive leaf, because of course */}
      <path d="M50 32 q6 -3 10 0 q-5 4 -10 0 z" fill="#7a9a4e" />
    </g>
  ),
  pet_raven: (
    <g>
      <ellipse cx="30" cy="57" rx="12" ry="2.2" fill="rgba(0,0,0,0.18)" />
      <g fill={HIDE_DARK}>
        <rect x="27" y="47" width="2.8" height="9" rx="1.3" />
        <rect x="34" y="47" width="2.8" height="9" rx="1.3" />
      </g>
      <ellipse cx="31" cy="36" rx="14" ry="12" fill={RAVEN} />
      <path d="M18 38 l-13 8 l13 3 z" fill={RAVEN_SHEEN} />
      <path d="M27 29 q13 3 16 13 q-11 4 -18 -4 z" fill={RAVEN_SHEEN} />
      <circle cx="44" cy="25" r="7.6" fill={RAVEN} />
      <path d="M50 25 l9 2.6 l-9 2.6 z" fill="#5a5a44" />
      <circle cx="46" cy="23" r="1.6" fill={FEATHER} />
      {/* bread and meat, morning and evening */}
      <ellipse cx="55" cy="31" rx="4.4" ry="3" fill="#c9a05e" />
    </g>
  ),
  pet_lion_cub: (
    <g>
      <ellipse cx="30" cy="57" rx="17" ry="2.8" fill="rgba(0,0,0,0.18)" />
      <g fill={TAN_DARK}>
        <rect x="18" y="44" width="4.4" height="12" rx="1.8" />
        <rect x="26" y="44" width="4.4" height="12" rx="1.8" />
        <rect x="34" y="44" width="4.4" height="12" rx="1.8" />
      </g>
      <ellipse cx="29" cy="38" rx="16" ry="10" fill={TAN} />
      {/* tail with a tuft */}
      <path d="M14 34 q-8 -2 -8 -10" stroke={TAN_DARK} strokeWidth="3.4" fill="none" strokeLinecap="round" />
      <circle cx="6" cy="23" r="3" fill={MANE} />
      {/* a cub's mane is barely there — that's what makes it a cub */}
      <circle cx="45" cy="29" r="11" fill={MANE} />
      <circle cx="45" cy="29" r="8.4" fill={TAN} />
      <circle cx="41" cy="21" r="3.4" fill={TAN_DARK} />
      <circle cx="50" cy="21" r="3.4" fill={TAN_DARK} />
      <circle cx="42" cy="27" r="1.6" fill={EYE} />
      <circle cx="49" cy="27" r="1.6" fill={EYE} />
      <path d="M45.5 31 l-2.4 2 h4.8 z" fill={FACE} />
    </g>
  ),
  pet_donkey: (
    <g>
      <ellipse cx="30" cy="57" rx="19" ry="3" fill="rgba(0,0,0,0.18)" />
      <g fill={HIDE_DARK}>
        <rect x="15" y="40" width="5" height="16" rx="2" />
        <rect x="24" y="40" width="5" height="16" rx="2" />
        <rect x="34" y="40" width="5" height="16" rx="2" />
      </g>
      <ellipse cx="28" cy="32" rx="18" ry="11" fill={HIDE} />
      <path d="M10 26 q-6 4 -4 12" stroke={HIDE_DARK} strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* neck + long head */}
      <path d="M40 32 l6 -16 q1 -4 6 -3 l4 1 l-3 18 z" fill={HIDE} />
      <ellipse cx="53" cy="30" rx="5.4" ry="6" fill={HIDE_LIGHT} />
      {/* the ears, which are the whole point of a donkey */}
      <path d="M45 15 q-2 -12 3 -13 q4 3 2 13 z" fill={HIDE} />
      <path d="M53 14 q2 -12 7 -11 q2 4 -3 13 z" fill={HIDE} />
      <circle cx="50" cy="22" r="1.6" fill={EYE} />
      <circle cx="55" cy="32" r="1.2" fill={FACE} />
    </g>
  ),
  pet_camel: (
    <g>
      <ellipse cx="30" cy="57" rx="21" ry="3" fill="rgba(0,0,0,0.18)" />
      <g fill={TAN_DARK}>
        <rect x="13" y="38" width="5" height="18" rx="2" />
        <rect x="22" y="38" width="5" height="18" rx="2" />
        <rect x="33" y="38" width="5" height="18" rx="2" />
      </g>
      <ellipse cx="27" cy="31" rx="19" ry="10" fill={TAN} />
      {/* the hump */}
      <path d="M16 24 q10 -16 22 -2 q-11 4 -22 2 z" fill={TAN} />
      <path d="M18 23 q9 -12 18 -2" stroke={TAN_DARK} strokeWidth="2" fill="none" />
      <path d="M8 26 q-5 4 -3 10" stroke={TAN_DARK} strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* long neck, small head, permanently unimpressed */}
      <path d="M40 30 l4 -18 q1 -4 6 -3 l3 1 l-3 21 z" fill={TAN} />
      <ellipse cx="52" cy="11" rx="6.4" ry="4.6" fill={TAN} />
      <ellipse cx="56" cy="13" rx="3.4" ry="3" fill={TAN_DARK} />
      <path d="M47 6 q-1 -4 2 -4 q2 1 1 4 z" fill={TAN_DARK} />
      <circle cx="52" cy="9" r="1.4" fill={EYE} />
    </g>
  ),
}

export const DRAWN_PETS = Object.keys(ART)

// Generated art, when it exists. Every image in the project comes from Nano
// Banana (art/pets.json → scripts/gen-art.mjs); a pet listed here renders as
// its render, anything else keeps drawing the SVG above. Add an id only once
// its PNG is actually in public/pets/ — an <img> at a 404 is a hole beside the
// player's own figure, which is the worst place in the app for one.
const RASTER_PETS: Record<string, string> = {}

/**
 * One pet, standing. `size` is its height in px; the drawing is square, so a
 * caller sizes a pet against the figure it accompanies via PetDef.scale.
 */
export function Pet({ id, size = 48, title }: { id: string; size?: number; title?: string }) {
  const def = petById(id)
  const raster = RASTER_PETS[id]
  const art = ART[id]
  if (!def || (!raster && !art)) return null

  if (raster) {
    return (
      <img
        src={raster}
        alt={title ?? def.name}
        style={{ display: 'block', width: size, height: size, objectFit: 'contain', objectPosition: 'bottom' }}
      />
    )
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 60 60"
      role="img"
      aria-label={title ?? def.name}
      style={{ display: 'block' }}
    >
      {art}
    </svg>
  )
}

// A pet in the catalog with no artwork renders nothing, which reads as a bug in
// the profile rather than a missing file — so say so at import in dev, the same
// guard checkTrackData() gives the soundtrack.
if (import.meta.env.DEV) {
  const missing = PETS.filter((p) => !ART[p.id] && !RASTER_PETS[p.id]).map((p) => p.id)
  if (missing.length) console.error('[pets] pets with no art:', missing.join(', '))
  const orphans = DRAWN_PETS.filter((id) => !PETS.some((p) => p.id === id))
  if (orphans.length) console.error('[pets] art with no pet:', orphans.join(', '))
}
