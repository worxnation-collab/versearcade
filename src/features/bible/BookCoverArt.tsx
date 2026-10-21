// The Bible's front board, drawn once and used twice: sitting on the profile,
// and again on the cover that swings open during the transition. Sharing it is
// the point — if the flying book didn't match the one you just tapped, the
// illusion that it IS that book falls apart.
//
// Everything is expressed against a reference width and scaled, so the same
// board reads correctly at 196px on the profile and at 360px mid-flight.
import coverArt from '@/assets/bible-cover.webp'

export const COVER_REF_WIDTH = 196
/** Height / width — the painted board's own proportions (457x640). */
export const COVER_RATIO = 1.4

// The board is an owner-supplied painting (2026-10-21): purple leather, a gilt
// edge, leaf corners and a brushed cross. NO name is baked into it — the
// player's name is stamped over the lower half as text, so every Bible stays
// the owner's own. The drawn spine, rules and title it replaced are gone; the
// board's gradient underneath stays as the fallback while the image loads.
export function BookCoverArt({ width, name }: { width: number; name?: string }) {
  const k = width / COVER_REF_WIDTH
  const px = (n: number) => n * k

  return (
    <>
      <img
        src={coverArt}
        alt=""
        aria-hidden
        draggable={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', display: 'block' }}
      />

      {name && (
        <div
          style={{
            position: 'absolute',
            left: '14%',
            right: '12%',
            top: '64%',
            textAlign: 'center',
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: px(12),
            letterSpacing: '0.18em',
            color: '#e9c46a',
            textShadow: '0 1px 0 rgba(0,0,0,0.6), 0 0 6px rgba(0,0,0,0.35)',
            textTransform: 'uppercase',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </div>
      )}
    </>
  )
}

/** The leather board itself — the surface the art above is stamped onto. */
export const COVER_BOARD: React.CSSProperties = {
  // Matches the painting's own rounded corners, which are the same all round.
  borderRadius: 6,
  background:
    'radial-gradient(120% 90% at 30% 15%, #5d2a86 0%, #3a1663 38%, #230d45 72%, #170729 100%)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,0.16), inset -8px 0 18px rgba(0,0,0,0.35), 0 14px 30px rgba(0,0,0,0.55)',
  overflow: 'hidden',
}
