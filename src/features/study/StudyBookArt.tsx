// A study book's front board.
//
// Same construction as the Bible's cover (`bible/BookCoverArt`) — spine with
// raised bands, a double gilt frame, an emblem and a stamped title — because
// the shelf only works if these read as books from the *same* shelf as the one
// the player already owns. Only the board's leather changes per book, so the
// set looks bound by the same hand.
//
// Everything is expressed against a reference width and scaled, so one board
// reads correctly at 120px on a small phone and at 172px on a wide one.
export const STUDY_COVER_REF = 196
/** Height / width — matched to the Bible's board on purpose. */
export const STUDY_COVER_RATIO = 1.42

export interface BoardSkin {
  /** The leather. */
  board: string
  /** Halo behind the emblem, so each book has its own light. */
  glow: string
}

// Six leathers. Distinct in hue *and* in value, so the shelf still reads as
// seven different books in greyscale or for a colourblind player — nothing here
// carries meaning by colour anyway, it's just so you can find your place.
export const BOARDS = {
  versus: {
    board: 'radial-gradient(120% 90% at 30% 15%, #9b3350 0%, #661a34 38%, #3f1020 72%, #260913 100%)',
    glow: 'rgba(255,107,107,0.30)',
  },
  focus: {
    board: 'radial-gradient(120% 90% at 30% 15%, #1f7570 0%, #12534f 38%, #0a3736 72%, #062425 100%)',
    glow: 'rgba(78,205,196,0.28)',
  },
  keep: {
    board: 'radial-gradient(120% 90% at 30% 15%, #7c2c88 0%, #551b63 38%, #350f41 72%, #21092b 100%)',
    glow: 'rgba(200,120,255,0.28)',
  },
  replay: {
    board: 'radial-gradient(120% 90% at 30% 15%, #3c4aa2 0%, #262f7c 38%, #181f53 72%, #0f143a 100%)',
    glow: 'rgba(122,140,255,0.28)',
  },
  reports: {
    board: 'radial-gradient(120% 90% at 30% 15%, #8d6621 0%, #6a4a16 38%, #46300f 72%, #2b1d09 100%)',
    glow: 'rgba(255,210,63,0.28)',
  },
  bag: {
    board: 'radial-gradient(120% 90% at 30% 15%, #74482a 0%, #53331c 38%, #382110 72%, #23150a 100%)',
    glow: 'rgba(255,159,28,0.26)',
  },
} satisfies Record<string, BoardSkin>

/** The board itself — the surface the art below is stamped onto. */
export function studyBoard(skin: BoardSkin): React.CSSProperties {
  return {
    borderRadius: '4px 10px 10px 4px',
    background: skin.board,
    boxShadow:
      'inset 0 1px 0 rgba(255,255,255,0.16), inset -8px 0 18px rgba(0,0,0,0.35), 0 14px 30px rgba(0,0,0,0.55)',
    overflow: 'hidden',
  }
}

export function StudyBookArt({
  width,
  title,
  emblem,
  skin,
}: {
  width: number
  title: string
  emblem: string
  skin: BoardSkin
}) {
  const k = width / STUDY_COVER_REF
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

      {/* The emblem's own light, thrown onto the leather behind it. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(${px(120)}px ${px(90)}px at 58% 34%, ${skin.glow}, transparent 70%)`,
        }}
      />

      {/* Blind-stamped gilt rules — the double frame a bound board wears. */}
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

      {/* The face: emblem, a foil rule, and the title stamped in gold. */}
      <div
        style={{
          position: 'absolute',
          inset: `${px(15)}px ${px(15)}px ${px(15)}px ${px(30)}px`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: px(9),
          padding: `${px(10)}px ${px(5)}px`,
          textAlign: 'center',
        }}
      >
        <div
          aria-hidden
          style={{ fontSize: px(38), lineHeight: 1, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.55))' }}
        >
          {emblem}
        </div>

        <div
          aria-hidden
          style={{
            width: px(38),
            height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(255,210,63,0.7), transparent)',
          }}
        />

        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: px(15),
            lineHeight: 1.15,
            color: '#f4cf62',
            letterSpacing: '0.09em',
            textTransform: 'uppercase',
            textShadow: '0 1px 0 rgba(0,0,0,0.55)',
            maxWidth: '100%',
          }}
        >
          {title}
        </div>
      </div>
    </>
  )
}
