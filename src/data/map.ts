// Everywhere you can go, as data.
//
// This app has five tabs and around two dozen destinations, and the gap between
// those two numbers is the whole reason this file exists. Praying is behind
// tapping your own figure inside a room halfway down a tab. The arcade only
// advertises itself once today's verse is finished. The Journal and the mailbox
// are pills on a card two screens down. Every one of those placements is right
// where it stands — a thing belongs next to the thing it's about — and the sum
// of them is an app you have to already know to navigate.
//
// So: ONE list, read by the map sheet and by nothing else that has to be kept
// in step with it. Same choke-point habit as `features/arcade/games.ts` and
// `QuizRunner` — a second inventory of the app's own screens would drift the
// first time a route was added, and drift invisibly, because both halves look
// right on their own.
//
// **Nothing here may rank anybody, and that is what lets a directory of the
// whole app exist at all.** A place carries an icon, a name and a line saying
// what it is. It deliberately carries NO number: no "12 cards", no "3 due", no
// completion state, no ordering by how much you have used it. A map with counts
// on it is a progress screen, and a progress screen is a list of the places you
// are behind on. The one live signal anywhere near this feature is the
// invitations panel (`features/map/invitations.ts`), which is today-only,
// countless and forgets everything at midnight — read the header there before
// adding anything that looks like a tally.

/** The five tabs, which are also the five neighbourhoods of the map. */
export type MapArea = 'play' | 'battle' | 'study' | 'church' | 'you'

export interface MapAreaDef {
  id: MapArea
  /** Matches the bottom nav's icon for the tab, so the map reads as the app. */
  icon: string
  title: string
}

export const MAP_AREAS: MapAreaDef[] = [
  { id: 'play', icon: '🎮', title: 'Play' },
  { id: 'battle', icon: '⚔️', title: 'Battle' },
  { id: 'study', icon: '📚', title: 'Study' },
  { id: 'church', icon: '⛪', title: 'Church' },
  { id: 'you', icon: '⭐', title: 'You' },
]

export interface MapPlace {
  id: string
  icon: string
  label: string
  /** One line saying what it IS. Not a slogan, and never a number. */
  line: string
  to: string
  area: MapArea
  /**
   * Key into `App.tsx`'s WALL table, where this destination asks for an
   * account. It draws the padlock and nothing else — the gate itself is still
   * the route's own `RequireAccount`, exactly as the bottom nav's padlock is
   * only what a locked tab looks like from outside. Places stay VISIBLE and
   * tappable for a guest on purpose: a locked door you can look at is the
   * pitch, and hiding half the map would make the app look smaller than it is.
   */
  wall?: string
  /** Operator-only rows, hidden from everybody who lacks the server-set flag. */
  adminOnly?: boolean
}

// Ordered within each area by how central the thing is, not alphabetically and
// not by how deep it currently sits — the point of a map is that the buried
// rooms sit level with the front doors.
export const MAP_PLACES: MapPlace[] = [
  // ── Play ────────────────────────────────────────────────────────────────
  {
    id: 'home',
    icon: '✦',
    label: 'Today’s drop',
    line: 'The verse everyone is playing right now',
    to: '/play',
    area: 'play',
  },
  {
    id: 'daily-trivia',
    icon: '✨',
    label: 'Today’s trivia',
    line: 'A round about one book of the Bible, new every day',
    to: '/play/trivia',
    area: 'play',
  },
  {
    id: 'arcade',
    icon: '🕹️',
    label: 'The arcade',
    line: 'Three machines · a minute each',
    to: '/arcade',
    area: 'play',
  },
  {
    id: 'road',
    icon: '🌾',
    label: 'The Harvest Road',
    line: 'The season’s road and everything along it',
    to: '/pilgrimage',
    area: 'play',
    wall: 'road',
  },
  {
    id: 'ranks',
    icon: '🏆',
    label: 'Worldwide ranks',
    line: 'Where the day’s players stand',
    to: '/leaderboard',
    area: 'play',
    wall: 'ranks',
  },

  // ── Battle ──────────────────────────────────────────────────────────────
  {
    id: 'battle',
    icon: '⚔️',
    label: 'Your battles',
    line: 'Whose move it is, and your faction’s hall',
    to: '/battle',
    area: 'battle',
    wall: 'battle',
  },
  {
    id: 'battle-new',
    icon: '➕',
    label: 'Start a battle',
    line: 'Challenge a buddy, or share a link',
    to: '/battle/new',
    area: 'battle',
    wall: 'battle',
  },
  {
    id: 'battle-live',
    icon: '⚡',
    label: 'Live battle',
    line: 'One clock, both reading · room code or quick match',
    to: '/battle/live',
    area: 'battle',
    wall: 'battle',
  },

  // ── Study ───────────────────────────────────────────────────────────────
  {
    id: 'study',
    icon: '📚',
    label: 'The library',
    line: 'Tabitha lends what you feel like working on',
    to: '/study',
    area: 'study',
    wall: 'study',
  },
  {
    id: 'review',
    icon: '🧠',
    label: 'Verses to review',
    line: 'The ones you kept, coming back around',
    to: '/review',
    area: 'study',
    wall: 'review',
  },
  {
    id: 'focus',
    icon: '🎯',
    label: 'Focus drill',
    line: 'One book, over and over, until it sticks',
    to: '/study/focus',
    area: 'study',
    wall: 'study',
  },
  {
    id: 'trivia',
    icon: '✨',
    label: 'Bonus trivia',
    line: 'The daily verse’s last question, five at a time',
    to: '/study/trivia',
    area: 'study',
    wall: 'study',
  },
  {
    id: 'cpu',
    icon: '🤖',
    label: 'Race a study partner',
    line: 'A battle that counts for nothing but practice',
    to: '/battle/cpu',
    area: 'study',
    wall: 'study',
  },
  {
    id: 'cross',
    icon: '✝️',
    label: 'The Cross Word',
    line: 'Two words that share a letter, and the verse they came from',
    to: '/arcade/cross',
    area: 'study',
    wall: 'cross',
  },
  {
    id: 'reports',
    icon: '📈',
    label: 'How you’re doing',
    line: 'Your accuracy, book by book',
    to: '/study/reports',
    area: 'study',
    wall: 'study',
  },
  {
    id: 'bag',
    icon: '🎒',
    label: 'Your bag',
    line: 'The relics study runs have turned up',
    to: '/study/bag',
    area: 'study',
    wall: 'study',
  },
  {
    id: 'bible',
    icon: '📖',
    label: 'Your Bible',
    line: 'All 66 books, shading in as you play',
    to: '/bible',
    area: 'study',
    wall: 'bible',
  },
  {
    id: 'highlights',
    icon: '💛',
    label: 'Verses you’ve kept',
    line: 'Everything you’ve highlighted, in one place',
    to: '/bible/highlights',
    area: 'study',
    wall: 'bible',
  },

  // ── Church ──────────────────────────────────────────────────────────────
  {
    id: 'church',
    icon: '⛪',
    label: 'Your church',
    line: 'The building, the yard, and this week’s rivalry',
    to: '/church',
    area: 'church',
    wall: 'church',
  },
  {
    id: 'churches',
    icon: '📣',
    label: 'For churches',
    line: 'Bring your congregation in — get in touch',
    to: '/churches',
    area: 'church',
  },

  // ── You ─────────────────────────────────────────────────────────────────
  {
    id: 'you',
    icon: '⭐',
    label: 'Your profile',
    line: 'You, your room and your card',
    to: '/you',
    area: 'you',
  },
  {
    id: 'pray',
    icon: '🙏',
    label: 'Pray',
    line: 'A prayer built one movement at a time, in your own room',
    to: '/you?pray=1',
    area: 'you',
  },
  {
    id: 'wall',
    icon: '🕯️',
    label: 'The Prayer Wall',
    line: 'Leave a note, or hold a candle for somebody else’s',
    to: '/pray',
    area: 'you',
    wall: 'wall',
  },
  {
    id: 'customize',
    icon: '✨',
    label: 'Customize',
    line: 'Skins, pets, items, cards, borders and badges',
    to: '/you?customize=1',
    area: 'you',
  },
  {
    id: 'journal',
    icon: '📔',
    label: 'The Journal',
    line: 'Everything you’ve passed so far',
    to: '/journal',
    area: 'you',
  },
  {
    id: 'mail',
    icon: '📬',
    label: 'Mailbox',
    line: 'Gifts, buddy requests and the season’s news',
    to: '/mail',
    area: 'you',
    wall: 'mail',
  },
  {
    id: 'buddies',
    icon: '🤝',
    label: 'Bible Buddies',
    line: 'The people you play alongside',
    to: '/buddies',
    area: 'you',
    wall: 'buddies',
  },
  {
    id: 'cards',
    icon: '🃏',
    label: 'Your collection',
    line: 'Verse cards and relics you’ve gathered',
    to: '/collection',
    area: 'you',
    wall: 'cards',
  },
  {
    id: 'admin',
    icon: '🛠️',
    label: 'Admin',
    line: 'Operator dashboard',
    to: '/admin',
    area: 'you',
    adminOnly: true,
  },
]

/** The places in one neighbourhood, in the order this file lists them. */
export function placesIn(area: MapArea, opts?: { admin?: boolean }): MapPlace[] {
  return MAP_PLACES.filter((p) => p.area === area && (!p.adminOnly || opts?.admin))
}

/**
 * Every route the map claims to reach, for the import-time check below.
 * Query strings are stripped: `/you?pray=1` is the `/you` route plus a
 * parameter that screen already knows how to read.
 */
export function mapRoutes(): string[] {
  return MAP_PLACES.map((p) => p.to.split('?')[0])
}

/**
 * A map that points at a route the router doesn't have sends somebody to the
 * catch-all, which redirects to Landing — so a typo here logs a player out of
 * their own app, silently, and only for the one row nobody tapped in testing.
 * `scripts/check-map.mjs` asserts every `to` above against the real route table
 * in `App.tsx` as part of `npm run build`, re-deriving the routes from that file
 * rather than importing this one.
 *
 * This function is the cheap half of the same check: it catches a place with no
 * area, a duplicate id, or an empty field at import in dev, the way
 * `checkQuestVerbs()` and `checkTrackData()` do.
 */
export function checkMapPlaces(): void {
  const seen = new Set<string>()
  const areas = new Set(MAP_AREAS.map((a) => a.id))
  for (const p of MAP_PLACES) {
    if (seen.has(p.id)) throw new Error(`map: duplicate place id "${p.id}"`)
    seen.add(p.id)
    if (!areas.has(p.area)) throw new Error(`map: place "${p.id}" has unknown area "${p.area}"`)
    if (!p.to.startsWith('/')) throw new Error(`map: place "${p.id}" has a non-absolute route "${p.to}"`)
    if (!p.label.trim() || !p.line.trim() || !p.icon.trim()) {
      throw new Error(`map: place "${p.id}" is missing an icon, label or line`)
    }
  }
  for (const a of MAP_AREAS) {
    if (!MAP_PLACES.some((p) => p.area === a.id)) {
      throw new Error(`map: area "${a.id}" has no places in it`)
    }
  }
}

if (import.meta.env?.DEV) checkMapPlaces()
