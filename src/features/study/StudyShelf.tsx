import { useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { useJuice } from '@/juice/useJuice'
import { BookCoverArt, COVER_BOARD } from '@/features/bible/BookCoverArt'
import {
  BOARDS,
  STUDY_COVER_RATIO,
  StudyBookArt,
  StudyBookPaintedArt,
  studyBoard,
  type BoardSkin,
} from './StudyBookArt'

// Generated cover paintings (scripts/generate-study-covers.mjs), keyed by book.
// Resolved at build time: a book whose image exists wears it; one whose image
// is missing keeps its drawn board, so a partial set never breaks the shelf.
const PAINTED: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob('@/assets/study/*.{jpg,png,webp}', { eager: true, query: '?url', import: 'default' }),
  ).map(([file, url]) => [file.replace(/^.*\//, '').replace(/\.[a-z]+$/, ''), url as string]),
)

// The Study tab as a shelf.
//
// Everything you can practise is a book standing on a plank, and tapping one
// swings its cover open before the route changes — the same promise the Bible
// on the profile makes, kept in miniature. It replaced a stack of list rows:
// same destinations, but a shelf you browse rather than a menu you read.
//
// Nothing here ranks anybody. A book's caption says what's inside it (five to
// replay, three due, your accuracy) and never how you compare to anyone.

/** Cap the board so it stays a book on a wide screen instead of a poster. */
const MAX_BOOK_WIDTH = 108
/**
 * Books stand well back from their column, not flush to it.
 *
 * These two numbers came down (148/0.86 -> 108/0.66) when the lending library
 * moved in above the shelf. Two reasons, and the second is the one that
 * matters: a smaller board is a *shelf* rather than a wall of tiles, and the
 * whole shelf now clears roughly 230px of scroll, which is what lets the room
 * and the books share one screen instead of the room pushing the books below
 * the fold. The caption is deliberately NOT scaled with the board — it spans
 * the full grid column (see ShelfBook), so shrinking the art doesn't shrink
 * the only part of a book that says what is inside it.
 */
const BOOK_SCALE = 0.66
const GAP = 16
/** How long the cover swings before the route changes. Tween, not spring —
    a spring soft enough to look like leather takes a second to settle, and
    that turns every tap into a wait (same lesson as `BookOpening`). */
const OPEN_MS = 250

export interface ShelfItem {
  key: string
  title: string
  emblem: string
  /** Which leather. `bible` wears the player's actual Bible board instead. */
  skin: keyof typeof BOARDS | 'bible'
  /** What's inside, in the player's terms — sits under the book, not on it. */
  caption: string
  to: string
  /** A count worth seeing before you tap, e.g. verses due. */
  badge?: string
  /** Stamped on the Bible's board, the way a Bible you were given is. */
  name?: string
  /**
   * How the librarian describes it as she hands it over, if she lends it.
   *
   * An item WITHOUT this is not something the library can fetch — your bag and
   * your reports are your own, not stock. This lives on the shelf item rather
   * than in a second list in the sheet so the two can never drift: a book added
   * to the shelf is either lendable here or it isn't, decided once.
   */
  lend?: string
}

export function StudyShelf({ items }: { items: ShelfItem[] }) {
  const shelf = useRef<HTMLDivElement | null>(null)
  const width = useShelfWidth(shelf)
  const bookW = Math.min(Math.floor(((width - GAP) / 2) * BOOK_SCALE), MAX_BOOK_WIDTH)
  const bookH = Math.round(bookW * STUDY_COVER_RATIO)

  // Two to a row, with a plank drawn under each pair.
  const rows: ShelfItem[][] = []
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2))

  return (
    <div ref={shelf}>
      {rows.map((row, r) => (
        <div key={row.map((i) => i.key).join('-')} style={{ position: 'relative', marginBottom: 22 }}>
          {/* The plank. Positioned off the known board height rather than by
              flow, so it lands exactly at the books' feet and the captions
              hang below it like shelf labels. */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: -6,
              right: -6,
              top: bookH + 1,
              height: 9,
              borderRadius: 3,
              background:
                'linear-gradient(180deg, rgba(255,210,63,0.34) 0%, rgba(160,107,255,0.16) 45%, rgba(0,0,0,0.42) 100%)',
              boxShadow: '0 8px 18px rgba(0,0,0,0.45)',
            }}
          />
          <div
            style={{
              position: 'relative',
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: GAP,
              alignItems: 'start',
            }}
          >
            {row.map((item, i) => (
              <ShelfBook key={item.key} item={item} width={bookW} delay={0.05 * (r * 2 + i)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function ShelfBook({ item, width, delay }: { item: ShelfItem; width: number; delay: number }) {
  const navigate = useNavigate()
  const juice = useJuice()
  const reduceMotion = useReducedMotion()
  const [opening, setOpening] = useState(false)
  const height = Math.round(width * STUDY_COVER_RATIO)
  const skin: BoardSkin | null = item.skin === 'bible' ? null : BOARDS[item.skin]
  // The player's Bible always wears its real board (their name is stamped on
  // it); every other book prefers its painting when one has been generated.
  const painted = item.skin === 'bible' ? undefined : PAINTED[item.skin]

  const open = () => {
    if (opening) return
    juice.select?.()
    // Reduce-motion gets the destination, not a shortened version of the show.
    if (reduceMotion) {
      navigate(item.to)
      return
    }
    juice.whoosh?.()
    setOpening(true)
    window.setTimeout(() => navigate(item.to), OPEN_MS)
  }

  return (
    <motion.button
      onClick={open}
      aria-label={`${item.title} — ${item.caption}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26, delay }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0,
        padding: 0,
        background: 'none',
        border: 'none',
        justifySelf: 'stretch',
        // Full column, with the board centred inside it. The caption is the
        // only part of a book that says what is inside, so it gets the whole
        // column even though the board no longer fills it.
        width: '100%',
        perspective: 900,
        WebkitPerspective: 900,
      }}
    >
      <div
        style={{
          position: 'relative',
          width,
          height,
          transformStyle: 'preserve-3d',
          flexShrink: 0,
        }}
      >
        {/* The block of pages: gilt edge down the right and along the bottom,
            so the book has a body — and something to see once it swings open. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: '3px -4px -4px 8px',
            borderRadius: '3px 7px 7px 3px',
            background: 'linear-gradient(90deg, #b79a5e 0%, #e8d9a8 35%, #fbf3d9 60%, #d8c48a 100%)',
            boxShadow: '0 10px 24px rgba(0,0,0,0.5)',
          }}
        />

        {/* The board. Hinged at its left edge, so a tap opens the book rather
            than shrinking a tile. */}
        <motion.div
          whileTap={{ rotateY: -12 }}
          animate={{ rotateY: opening ? -78 : 0 }}
          transition={{ duration: OPEN_MS / 1000, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            inset: 0,
            transformOrigin: 'left center',
            transformStyle: 'preserve-3d',
            backfaceVisibility: 'hidden',
            ...(skin ? studyBoard(skin) : COVER_BOARD),
          }}
        >
          {!skin ? (
            <BookCoverArt width={width} name={item.name} />
          ) : painted ? (
            <StudyBookPaintedArt width={width} title={item.title} art={painted} />
          ) : (
            <StudyBookArt width={width} title={item.title} emblem={item.emblem} skin={skin} />
          )}
        </motion.div>

        {/* A count worth seeing before you tap — a wax seal on the corner. */}
        {item.badge && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: -7,
              right: -7,
              minWidth: 24,
              height: 24,
              padding: '0 7px',
              borderRadius: 999,
              display: 'grid',
              placeItems: 'center',
              background: 'linear-gradient(180deg, #ffe89a, #e8b93f)',
              color: '#3a1663',
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: 12,
              boxShadow: '0 3px 10px rgba(0,0,0,0.5)',
            }}
          >
            {item.badge}
          </div>
        )}
      </div>

      {/* The caption hangs under the plank, where a shelf label goes. A real
          cover doesn't carry statistics. */}
      <div
        style={{
          marginTop: 18,
          fontSize: 11.5,
          lineHeight: 1.35,
          color: 'var(--ink-dim)',
          textAlign: 'center',
          width: '100%',
        }}
      >
        {item.caption}
      </div>
    </motion.button>
  )
}

/** The shelf's own width, so the boards can be sized in real pixels. */
function useShelfWidth(ref: React.RefObject<HTMLDivElement>) {
  const [width, setWidth] = useState(() =>
    Math.min(typeof window === 'undefined' ? 390 : window.innerWidth, 520) - 36,
  )

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setWidth(el.getBoundingClientRect().width)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])

  return width
}
