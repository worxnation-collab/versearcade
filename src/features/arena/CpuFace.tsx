import { GENERATED_ART } from '@/data/generatedArt'
import type { CpuProfile } from './cpu'

// The CPU opponent's face — a painted figure where one has been generated
// (`art/cpu.json` → `cpu_<name>`), the emoji it always had where not.
//
// The render is a full-length figure like every skin here, so the chip crops
// to a portrait exactly as `Character` does for a player: top-anchored cover
// in a circle, which keeps the face and drops the feet. Emoji is the drawn
// fallback, so an ungenerated build is the app exactly as it was.
export function CpuFace({ profile, size = 36 }: { profile: CpuProfile; size?: number }) {
  // Ids are the characters' names, not the difficulty keys — the manifest
  // says `cpu_rookie`, the profile says `easy`.
  const src = GENERATED_ART[`cpu_${profile.name.toLowerCase()}`]
  if (!src) {
    return (
      <span style={{ fontSize: size * 0.8, lineHeight: 1, display: 'inline-block' }} aria-hidden>
        {profile.emoji}
      </span>
    )
  }
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        display: 'inline-block',
        flexShrink: 0,
        background: 'radial-gradient(circle at 50% 30%, rgba(255,210,63,0.25), rgba(20,10,52,0.9))',
        border: '1px solid var(--stroke)',
      }}
    >
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 4%', transform: 'scale(1.9)', transformOrigin: '50% 8%', display: 'block' }}
      />
    </span>
  )
}
