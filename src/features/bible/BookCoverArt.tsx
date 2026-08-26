// The Bible's front board, drawn once and used twice: sitting on the profile,
// and again on the cover that swings open during the transition. Sharing it is
// the point — if the flying book didn't match the one you just tapped, the
// illusion that it IS that book falls apart.
//
// Everything is expressed against a reference width and scaled, so the same
// board reads correctly at 196px on the profile and at 360px mid-flight.
export const COVER_REF_WIDTH = 196
/** Height / width — a hand Bible, not a paperback. */
export const COVER_RATIO = 1.42

export function BookCoverArt({ width, name }: { width: number; name?: string }) {
  const k = width / COVER_REF_WIDTH
  const px = (n: number) => n * k

  return (
    <>
      {/* Spine, with the raised bands a bound book has. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: px(17),
          background:
            'linear-gradient(90deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.28) 55%, rgba(255,255,255,0.07) 100%)',
          borderRight: '1px solid rgba(255,210,63,0.22)',
        }}
      />
      {[0.22, 0.5, 0.78].map((t) => (
        <div
          key={t}
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            width: px(17),
            top: `${t * 100}%`,
            height: px(5),
            background: 'linear-gradient(180deg, rgba(255,210,63,0.42), rgba(255,210,63,0.10))',
          }}
        />
      ))}

      {/* Blind-stamped gilt rules — the double frame a Bible board wears. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: `${px(11)}px ${px(11)}px ${px(11)}px ${px(26)}px`,
          border: '1px solid rgba(255,210,63,0.55)',
          borderRadius: px(3),
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.28)',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: `${px(15)}px ${px(15)}px ${px(15)}px ${px(30)}px`,
          border: '1px solid rgba(255,210,63,0.22)',
          borderRadius: px(2),
        }}
      />

      {/* The face: cross, title, and the owner's name stamped in gold — the way
          a Bible you were given has your name on it. */}
      <div
        style={{
          position: 'absolute',
          inset: `${px(15)}px ${px(15)}px ${px(15)}px ${px(30)}px`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: px(10),
          padding: `${px(10)}px ${px(6)}px`,
          textAlign: 'center',
        }}
      >
        <svg width={px(30)} height={px(42)} viewBox="0 0 30 42" aria-hidden>
          <defs>
            <linearGradient id="giltCross" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ffe89a" />
              <stop offset="45%" stopColor="#e8b93f" />
              <stop offset="100%" stopColor="#a97c1c" />
            </linearGradient>
          </defs>
          <path d="M12.4 1h5.2v11.6H29v5.2H17.6V41h-5.2V17.8H1v-5.2h11.4z" fill="url(#giltCross)" />
        </svg>

        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: px(17),
            lineHeight: 1.15,
            color: '#f4cf62',
            letterSpacing: '0.10em',
            textShadow: '0 1px 0 rgba(0,0,0,0.55)',
          }}
        >
          HOLY
          <br />
          BIBLE
        </div>

        {name && (
          <div
            style={{
              marginTop: px(2),
              paddingTop: px(8),
              borderTop: '1px solid rgba(255,210,63,0.25)',
              fontSize: px(10),
              letterSpacing: '0.16em',
              color: 'rgba(244,207,98,0.78)',
              textTransform: 'uppercase',
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </div>
        )}
      </div>
    </>
  )
}

/** The leather board itself — the surface the art above is stamped onto. */
export const COVER_BOARD: React.CSSProperties = {
  borderRadius: '4px 10px 10px 4px',
  background:
    'radial-gradient(120% 90% at 30% 15%, #5d2a86 0%, #3a1663 38%, #230d45 72%, #170729 100%)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,0.16), inset -8px 0 18px rgba(0,0,0,0.35), 0 14px 30px rgba(0,0,0,0.55)',
  overflow: 'hidden',
}
