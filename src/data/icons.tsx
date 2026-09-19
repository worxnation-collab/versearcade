import type { CSSProperties } from 'react'

// The app's own iconography.
//
// **Why these are DRAWN and not Nano Banana renders**, given the house rule
// that every image here is generated: an icon takes a runtime colour. A nav
// tab is white when it is the tab you are on, faint when it is not, and dim
// behind a padlock; a row's icon inherits whatever the row is doing. That is
// the same carve-out the church kit, the denomination shield and the seals'
// wax already sit in — "a baked image can't take a colour" — and it is the
// whole argument, not a shortcut. A 20px PNG of a painted sword is also mush,
// where a path is crisp at every density.
//
// So every icon here is ONE path family on a 24x24 grid, filled rather than
// stroked (a 1.5px stroke disappears at 20px on a phone), drawn to read at
// 18px first and scaled up from there. They take `currentColor` and nothing
// else — no gradients, no second colour, no drop shadow — so a caller styles
// an icon by styling its container, exactly as it would style text.
//
// **What this replaces is the app's single loudest "indie" tell.** The bottom
// nav was 🎮⚔️📚⛪⭐ on every screen in the app, the map drew 36 more, and
// every competitor this app is judged against ships drawn icons. Emoji also
// render as a different typeface on every platform, at a size the app does not
// control, in a colour the app cannot set — so none of the three things above
// were ever actually true of them.
//
// Adding one is a row in `ICONS`. `npm run check:icons` asserts the nav and
// the map name only ids that exist here, because a missing id renders as
// nothing at all — an invisible failure, the `check-trivia` habit.

export type IconId =
  // ── The five tabs ──
  | 'play' | 'battle' | 'study' | 'church' | 'you'
  // ── Places and things ──
  | 'verse' | 'trivia' | 'arcade' | 'road' | 'trophy' | 'plus' | 'bolt'
  | 'brain' | 'target' | 'robot' | 'cross' | 'chart' | 'bag' | 'book'
  | 'bookmark' | 'heart' | 'megaphone' | 'pray' | 'candle' | 'basin'
  | 'journal' | 'mail' | 'buddies' | 'card' | 'tools' | 'keep' | 'lock'
  | 'gift' | 'compass' | 'chest' | 'seal' | 'people' | 'calendar' | 'lamp'
  | 'sparkle' | 'listen'

/** 24x24 path data. One `d` per icon, or several for a compound shape. */
const ICONS: Record<IconId, string[]> = {
  // ── Tabs ────────────────────────────────────────────────────────────────
  // A play triangle inside a soft square: this tab IS the day's run.
  play: ['M5 4.6h14a2.4 2.4 0 0 1 2.4 2.4v10a2.4 2.4 0 0 1-2.4 2.4H5A2.4 2.4 0 0 1 2.6 17V7A2.4 2.4 0 0 1 5 4.6Zm5.1 3.7v7.4l6.2-3.7-6.2-3.7Z'],
  // Two blades leaning APART rather than crossing in an X, each with a real
  // crossguard, grip and pommel. The first draft was two thin diagonals and
  // read as the letter X at 20px on a phone — the geometry below is rotated
  // about each pommel rather than eyeballed, which is what makes them read as
  // swords at nav size. Points up and apart on purpose: this app's battles are
  // two people who went out to meet each other (see Jonathan and Deborah).
  battle: [
    'M3.5 3.4L6.3 6.1L9.2 13.2L6.2 14.4L3.3 7.3Z',
    'M4.2 15.2L11.2 12.3L11.9 14.0L4.8 16.9Z',
    'M7.4 15.8L9.3 15.1L10.9 19.1L9.1 19.9Z',
    'M8.4 19.9L11.4 18.7L12.3 21.0L9.3 22.2Z',
    'M20.5 3.4L20.7 7.3L17.8 14.4L14.8 13.2L17.7 6.1Z',
    'M12.8 12.3L19.8 15.2L19.2 16.9L12.1 14.0Z',
    'M14.7 15.1L16.6 15.8L14.9 19.9L13.1 19.1Z',
    'M12.6 18.7L15.6 19.9L14.7 22.2L11.7 21.0Z',
  ],
  // A stack of books, spines out.
  study: [
    'M3.4 17.2h17.2v3.4H3.4v-3.4Zm2.2.9v1.6h1.1v-1.6H5.6Zm11.6 0v1.6h1.2v-1.6h-1.2Z',
    'M4.8 12.6h14.4v3.4H4.8v-3.4Zm2.2.9v1.6h1.1v-1.6H7Zm9.8 0v1.6h1.2v-1.6h-1.2Z',
    'M6.2 8h11.6v3.4H6.2V8Zm2.2.9v1.6h1.1V8.9H8.4Zm7 0v1.6h1.2V8.9h-1.2Z',
    'M8.4 3.4h7.2v3.4H8.4V3.4Zm2 .9v1.6h1.1V4.3h-1.1Z',
  ],
  // A chapel: pitched roof, door, cross on the ridge.
  church: [
    'M11.1 2h1.8v2.1H15v1.8h-2.1v2.4h-1.8V5.9H9V4.1h2.1V2Z',
    'M12 8.6 20.4 15v6.2h-5.6v-4.4a2.8 2.8 0 0 0-5.6 0v4.4H3.6V15L12 8.6Z',
  ],
  // A person: head and shoulders.
  you: [
    'M12 3.4a3.9 3.9 0 1 1 0 7.8 3.9 3.9 0 0 1 0-7.8Z',
    'M12 12.7c4.3 0 7.8 2.7 7.8 6v1.9H4.2v-1.9c0-3.3 3.5-6 7.8-6Z',
  ],

  // ── Places and things ───────────────────────────────────────────────────
  verse: ['M12 2.2l2.5 6.1 6.6.5-5 4.3 1.5 6.4L12 16.1l-5.6 3.4 1.5-6.4-5-4.3 6.6-.5L12 2.2Z'],
  sparkle: ['M12 2.6l1.8 5.3 5.3 1.8-5.3 1.8L12 16.8l-1.8-5.3-5.3-1.8 5.3-1.8L12 2.6Z', 'M19 15.4l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z'],
  trivia: ['M12 2.6l1.8 5.3 5.3 1.8-5.3 1.8L12 16.8l-1.8-5.3-5.3-1.8 5.3-1.8L12 2.6Z', 'M19 15.4l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z'],
  // An arcade cabinet.
  arcade: ['M6 2.4h12a2 2 0 0 1 2 2v11.3a2 2 0 0 1-2 2h-2.3l.9 3.9H7.4l.9-3.9H6a2 2 0 0 1-2-2V4.4a2 2 0 0 1 2-2Zm1.2 3v6.3h9.6V5.4H7.2Zm2 8.4a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Zm5.6 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Z'],
  // A road bending to the horizon.
  road: ['M9.4 2.6h5.2l5.8 18.8H14L11.3 6.9h-.6L8 21.4H2.6L9.4 2.6Zm2.1 5.8h1v2.6h-1V8.4Zm.3 4.6h1.2v2.8h-1.2V13Zm.4 4.8h1.5v2.8h-1.5v-2.8Z'],
  trophy: ['M7 2.8h10v2.1h3.4v2.6a4.2 4.2 0 0 1-3.7 4.2 5 5 0 0 1-2.8 2.5v2.5h3v2.4H7.1v-2.4h3v-2.5a5 5 0 0 1-2.8-2.5A4.2 4.2 0 0 1 3.6 7.5V4.9H7V2.8Zm-1 4.3v.4a2.1 2.1 0 0 0 1 1.8V7.1H6Zm12 0h-1v2.2a2.1 2.1 0 0 0 1-1.8v-.4Z'],
  plus: ['M10.6 3.8h2.8v6.8h6.8v2.8h-6.8v6.8h-2.8v-6.8H3.8v-2.8h6.8V3.8Z'],
  bolt: ['M13.6 2.2 5.4 13.1h4.9l-.9 8.7 8.2-10.9h-4.9l.9-8.7Z'],
  brain: ['M9.4 2.6a3.5 3.5 0 0 1 3.2 2 3.5 3.5 0 0 1 6.3 2.1v.4a3.3 3.3 0 0 1 .7 5.6v4.1a4.6 4.6 0 0 1-7.6 3.5 4.6 4.6 0 0 1-7.6-3.5v-4.1a3.3 3.3 0 0 1 .7-5.6v-.4a3.5 3.5 0 0 1 3.5-3.5Z'],
  target: ['M12 2.4a9.6 9.6 0 1 1 0 19.2 9.6 9.6 0 0 1 0-19.2Zm0 2.9a6.7 6.7 0 1 0 0 13.4 6.7 6.7 0 0 0 0-13.4Zm0 2.9a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6Z'],
  robot: ['M10.6 1.8h2.8v2.1h3.4a3 3 0 0 1 3 3v9.4a3 3 0 0 1-3 3H7.2a3 3 0 0 1-3-3V6.9a3 3 0 0 1 3-3h3.4V1.8ZM9 8.9a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2Zm6 0a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2ZM2.2 10.2h1.3v4.6H2.2v-4.6Zm18.3 0h1.3v4.6h-1.3v-4.6ZM8.4 20.1h7.2v2.1H8.4v-2.1Z'],
  cross: ['M9.9 2.2h4.2v5.6h5.6v4.2h-5.6v9.8H9.9v-9.8H4.3V7.8h5.6V2.2Z'],
  chart: ['M3.2 19.4h17.6v2.2H3.2v-2.2Zm1.4-7.2h3.2v6H4.6v-6Zm5.2-5.4h3.2v11.4H9.8V6.8Zm5.2 3h3.2v8.4H15v-8.4Z'],
  bag: ['M8.6 5.6V4.8a3.4 3.4 0 0 1 6.8 0v.8h3a2 2 0 0 1 2 2.1l-.8 11.4a2 2 0 0 1-2 1.9H6.4a2 2 0 0 1-2-1.9L3.6 7.7a2 2 0 0 1 2-2.1h3Zm2.2 0h2.4v-.8a1.2 1.2 0 0 0-2.4 0v.8Z'],
  book: ['M4 3.4h5.6A2.6 2.6 0 0 1 12 5.1a2.6 2.6 0 0 1 2.4-1.7H20a1 1 0 0 1 1 1v13.2a1 1 0 0 1-1 1h-5.6a2.6 2.6 0 0 0-2.4 1.6 2.6 2.6 0 0 0-2.4-1.6H4a1 1 0 0 1-1-1V4.4a1 1 0 0 1 1-1Z'],
  bookmark: ['M6 2.6h12a1.4 1.4 0 0 1 1.4 1.4v17.4L12 17l-7.4 4.4V4A1.4 1.4 0 0 1 6 2.6Z'],
  heart: ['M12 21.1 3.9 13a5.1 5.1 0 0 1 7.2-7.2l.9.9.9-.9A5.1 5.1 0 0 1 20.1 13L12 21.1Z'],
  megaphone: ['M3 9.4h3.6L17.4 4v16L6.6 14.6H5.9l1.5 6.5H4.1L2.6 14A2.4 2.4 0 0 1 1.4 12a2.4 2.4 0 0 1 1.6-2.3V9.4Zm16.5 0h3v5.2h-3V9.4Z'],
  pray: ['M10.4 2.2c.9 0 1.6.8 1.6 1.7v7l2.9-3.4a1.7 1.7 0 0 1 2.6 2.2l-4 5.3v2.5h1.9v4.3H7.1v-4.3h1.7v-2.5l-4-5.3a1.7 1.7 0 0 1 2.6-2.2l1.4 1.7V3.9c0-.9.7-1.7 1.6-1.7Z'],
  candle: ['M12 1.8c1.6 1.9 2.4 3.2 2.4 4.3a2.4 2.4 0 0 1-4.8 0c0-1.1.8-2.4 2.4-4.3ZM8.8 9.4h6.4v12.8H8.8V9.4Z'],
  basin: ['M2.8 10.2h18.4v2.1a9.2 9.2 0 0 1-6 8.6v1.1H8.8v-1.1a9.2 9.2 0 0 1-6-8.6v-2.1Zm7.6-8.4h1.8v6.2h-1.8V1.8Zm3.4 1.6h1.8v4.6h-1.8V3.4Z'],
  journal: ['M6.4 2.4H19a1 1 0 0 1 1 1v17.2a1 1 0 0 1-1 1H6.4a2.8 2.8 0 0 1-2.8-2.8V5.2a2.8 2.8 0 0 1 2.8-2.8Zm2 4v2.2h8V6.4h-8Zm0 4.4v2.2h8v-2.2h-8Z'],
  mail: ['M3.4 5.2h17.2a1 1 0 0 1 1 1v1L12 13.1 2.4 7.2v-1a1 1 0 0 1 1-1ZM2.4 9.6 12 15.5l9.6-5.9v8.2a1 1 0 0 1-1 1H3.4a1 1 0 0 1-1-1V9.6Z'],
  buddies: ['M8.4 3.4a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2Zm8 1.2a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM8.4 12.2c3.9 0 7 2.4 7 5.4v3H1.4v-3c0-3 3.1-5.4 7-5.4Zm8 .6c3.2 0 6.2 1.7 6.2 4.3v3.5h-5.4v-3a6.4 6.4 0 0 0-2.4-4.8h1.6Z'],
  card: ['M3.4 4.6h17.2a1.6 1.6 0 0 1 1.6 1.6v11.6a1.6 1.6 0 0 1-1.6 1.6H3.4a1.6 1.6 0 0 1-1.6-1.6V6.2a1.6 1.6 0 0 1 1.6-1.6Zm1.2 3.2v2.6h5.2V7.8H4.6Zm0 4.6v1.8h9.6v-1.8H4.6Z'],
  tools: ['M14.9 2.2a6 6 0 0 1 5.9 7.1L21 10l-2.9 2.9-4.9-4.9L16.1 5l.7.2a6 6 0 0 1-1.9-3ZM9.7 9.5l4.8 4.8-6.9 6.9a3.4 3.4 0 0 1-4.8-4.8l6.9-6.9Z'],
  keep: ['M2.6 3.4h3.2v2.8h2.6V3.4h3.2v2.8h2.6V3.4h3.2v2.8h2.6V3.4h1.4v17.2H2.6V3.4Zm7 9.2a2.4 2.4 0 0 1 4.8 0v8H9.6v-8Z'],
  lock: ['M12 1.8a4.9 4.9 0 0 1 4.9 4.9v2.4h1.5a1.4 1.4 0 0 1 1.4 1.4v9.3a1.4 1.4 0 0 1-1.4 1.4H5.6a1.4 1.4 0 0 1-1.4-1.4v-9.3a1.4 1.4 0 0 1 1.4-1.4h1.5V6.7A4.9 4.9 0 0 1 12 1.8Zm0 2.6a2.3 2.3 0 0 0-2.3 2.3v2.4h4.6V6.7A2.3 2.3 0 0 0 12 4.4Z'],
  gift: ['M12 4.6a3 3 0 0 1 5.4-1.8A3 3 0 0 1 17 6.6h3.4v4.2H3.6V6.6H7a3 3 0 0 1 5-2V4.6Zm-1.2 8.2v8.6H5.2a1 1 0 0 1-1-1v-7.6h6.6Zm2.4 0h6.6v7.6a1 1 0 0 1-1 1h-5.6v-8.6Z'],
  compass: ['M12 2.2a9.8 9.8 0 1 1 0 19.6 9.8 9.8 0 0 1 0-19.6Zm4.6 5.2-6.5 2.9-2.7 6.7 6.5-2.9 2.7-6.7ZM12 10.6a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8Z'],
  chest: ['M4.4 4.2h15.2a2 2 0 0 1 2 2v3.4H2.4V6.2a2 2 0 0 1 2-2Zm-2 7.4h7.4v2.2h4.4v-2.2h7.4v6.2a2 2 0 0 1-2 2H4.4a2 2 0 0 1-2-2v-6.2Z'],
  seal: ['M12 1.9a10.1 10.1 0 1 1 0 20.2 10.1 10.1 0 0 1 0-20.2Zm0 3.4a6.7 6.7 0 1 0 0 13.4 6.7 6.7 0 0 0 0-13.4Zm-1.3 2.2h2.6v3h3v2.6h-3v3h-2.6v-3h-3v-2.6h3v-3Z'],
  people: ['M8.4 3.4a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2Zm8 1.2a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM8.4 12.2c3.9 0 7 2.4 7 5.4v3H1.4v-3c0-3 3.1-5.4 7-5.4Zm8 .6c3.2 0 6.2 1.7 6.2 4.3v3.5h-5.4v-3a6.4 6.4 0 0 0-2.4-4.8h1.6Z'],
  calendar: ['M7 1.8h2.4v2.4h5.2V1.8H17v2.4h2.6a1.4 1.4 0 0 1 1.4 1.4v3H3v-3a1.4 1.4 0 0 1 1.4-1.4H7V1.8ZM3 11.2h18v9.4a1.4 1.4 0 0 1-1.4 1.4H4.4A1.4 1.4 0 0 1 3 20.6v-9.4Zm3.6 2.2v2.2h2.2v-2.2H6.6Zm4.4 0v2.2h2.2v-2.2H11Zm4.4 0v2.2h2.2v-2.2h-2.2Z'],
  lamp: ['M12 1.6c1.5 1.8 2.2 3 2.2 4a2.2 2.2 0 0 1-4.4 0c0-1 .7-2.2 2.2-4ZM9.4 9.2h5.2l1.2 5.4H8.2l1.2-5.4Zm-2.6 7h10.4v2.2h-3.6v3.6h-3.2v-3.6H6.8v-2.2Z'],
  listen: ['M13.4 3.1a1.2 1.2 0 0 1 2 .9v16a1.2 1.2 0 0 1-2 .9L7.6 16H4.2a1.4 1.4 0 0 1-1.4-1.4V9.4A1.4 1.4 0 0 1 4.2 8h3.4l5.8-4.9Zm5 2.8a9.6 9.6 0 0 1 0 12.2l-1.7-1.4a7.4 7.4 0 0 0 0-9.4l1.7-1.4Zm-2.7 2.6a6 6 0 0 1 0 7l-1.7-1.4a3.8 3.8 0 0 0 0-4.2l1.7-1.4Z'],
}

export function hasIcon(id: string): id is IconId {
  return Object.prototype.hasOwnProperty.call(ICONS, id)
}

/**
 * One icon, in the current text colour.
 *
 * `size` is the box; the art is drawn to fill it. Everything about how it
 * looks — colour, opacity, a drop shadow — is the caller's, set on the
 * container, because these carry `currentColor` and nothing else.
 */
export function Icon({
  id,
  size = 20,
  style,
  title,
}: {
  id: IconId
  size?: number
  style?: CSSProperties
  /** Only for an icon that is the ONLY thing naming its control. */
  title?: string
}) {
  const paths = ICONS[id]
  if (!paths) return null
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
      style={{ display: 'block', flexShrink: 0, fill: 'currentColor', ...style }}
      fillRule="evenodd"
      clipRule="evenodd"
    >
      {title && <title>{title}</title>}
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  )
}
