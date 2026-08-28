// The content catalog — what a season is made of, and where it can come from.
//
// WHY THIS FILE EXISTS
// The App Store build runs a copy of `dist` baked into the IPA (webDir in
// capacitor.config), so every road, cosmetic and skin compiled into the bundle
// is frozen until the next review. That is fine for MECHANICS and wrong for
// CONTENT: a Christmas road is five hex codes, an emoji and a reward table, and
// waiting on a 20-minute archive plus review to publish one is the whole reason
// seasonal games ship late.
//
// So content is data. The bundled catalog below is the FLOOR — everything the
// binary knows on its own, and what it falls back to with no network, no keys
// or a guest. On top of it sits an OVERLAY fetched from Supabase
// (store/catalog.ts → `content_catalog`, migration 0066), and the two are
// merged by id.
//
// THREE RULES, and they are the whole design:
//
//   1. MERGE, NEVER REPLACE. An overlay entry with a known id overrides that
//      one entry; a new id is appended; a bundled entry is NEVER removed. An
//      old binary that fetches a catalog it half-understands still renders
//      everything it shipped with, and content a player already equipped can't
//      vanish out from under them. This is the same bargain generatedArt.ts
//      makes — an id with no render keeps its drawn fallback.
//
//   2. FAIL CLOSED, PER ENTRY. Every sanitiser here drops the entry it can't
//      read and keeps going. One malformed row must never take out the road it
//      is in, and a catalog that fails to load entirely is simply the bundled
//      one. There is no state in which the season screen renders empty because
//      a fetch failed.
//
//   3. CODE IS NOT CONTENT. A catalog can name a quest verb, a reward id, a
//      cosmetic and a skin — all data the binary already knows how to render.
//      It CANNOT add a verb, a reward kind or a screen. `sanitizeQuestDefs`
//      (lib/season.ts) drops any quest naming a verb this build lacks, which is
//      why the verb list is prepacked far ahead of the quests that use it.
//
// WHAT STILL NEEDS A RELEASE: new quest verbs, new cosmetic kinds, drawn-SVG
// art, and anything that changes a screen. See docs/CONTENT-CATALOG.md.

import { GENERATED_ART } from './generatedArt'
import { sanitizeQuestDefs, type QuestDef, type QuestPools } from '@/lib/season'

// ── The shapes ───────────────────────────────────────────────────────────────
// These live here rather than in data/season.ts so the sanitisers can see them
// without importing the bundled content (which would be a cycle — data/season
// imports this file). data/season.ts re-exports them, so every existing call
// site is untouched.

/**
 * A post in the app's mailbox — the one channel a season has for saying it has
 * started.
 *
 * The catalog can already ship a whole road without a submission, and until
 * this existed a road switched itself on in total silence: the strip on the
 * season tab simply became a different strip. This is the announcement.
 *
 * It is OPERATOR text, not player text. Only `admin_publish_catalog` (0066)
 * can write the catalog, so nothing here is a moderation surface — and it is
 * still length-capped and rendered as plain text, because a content pipeline
 * that can inject markup into every phone at once is a content pipeline that
 * will eventually be asked to.
 */
export interface NewsDef {
  id: string
  emoji: string
  title: string
  body: string
  /** ISO date the post is FROM — what the mailbox sorts and dates it by. */
  at: string
  /** ISO date it stops being shown, if it should. */
  until?: string
}

/** A short earned phrase shown under your name. Fixed catalog — a player never
 *  types one, so there is no moderation surface. */
export interface TitleDef {
  id: string
  text: string
}

/** What bursts on a correct answer and at the end of a run. Colors only — a
 *  theme changes what is drawn, never WHETHER motion happens. Reduce-motion is
 *  still the last word, in juice/confetti. */
export interface ConfettiDef {
  id: string
  name: string
  colors: string[]
  shapes?: ('circle' | 'square')[]
}

/** The streak flame on the home screen. Glyph plus the color its glow takes;
 *  StreakFlame still scales the intensity by streak length. */
export interface FlameDef {
  id: string
  name: string
  glyph: string
  /** Glow color, as `r,g,b` so StreakFlame can vary the alpha by heat. */
  rgb: string
}

/** What the Daily Chest looks like before it's opened. */
export interface ChestSkinDef {
  id: string
  name: string
  glyph: string
}

export interface Reward {
  /** Stable id. Cosmetics use their catalog id; consumables are 'boost'/'freeze'. */
  id: string
  /** How many, for consumables. Cosmetics are always one. */
  qty?: number
}

export interface Waystation {
  /** 1-based tier. */
  n: number
  /** Both columns, both free. Column A is the steady drip, B the bigger beat. */
  a: Reward[]
  b: Reward[]
  /** Every tenth is a milestone: a bigger reveal, nothing more. */
  milestone?: boolean
}

export interface RoadDef {
  id: string
  name: string
  blurb: string
  /** Inclusive start / exclusive end, ISO. */
  start: string
  end: string
  waystations: Waystation[]
  /** Granted to everyone who reached waystation 1, so nobody ends empty-handed. */
  memento: string
  /**
   * How many waystations this road has. Optional so the Harvest Road keeps the
   * 50 it shipped with; a catalog road may run shorter (an Advent road is 24).
   */
  length?: number
  /**
   * This road's own quest pools. Omitted means the bundled ones.
   *
   * FROZEN ONCE THE ROAD STARTS — the draw is a seeded shuffle of the whole
   * array, so adding an entry mid-road re-draws every remaining day. Publish
   * before `start`; after that only ever fix a `text` typo.
   */
  daily?: QuestDef[]
  weekly?: QuestDef[]
  /**
   * Art id for the road's painting — the full-width scene at the top of
   * /pilgrimage and the window into it on the Play tab.
   *
   * An ID, not a URL, so every image in the catalog is declared in one place
   * (`art`) and validated by one rule. Resolved through catalogArtUrl, so it
   * can point at a bundled render (pre-shipped, works offline) or at an https
   * URL published with the season. Omitted keeps the Harvest painting, which
   * is the right fallback: a road with no scene is still a road.
   */
  scene?: string
}

/**
 * A skin the catalog can add or re-describe.
 *
 * Deliberately NOT the full SkinDef from data/avatar: a catalog may not invent
 * a paid skin. There is no price, sku or pack here and there never will be —
 * `source` is the free half of that union only, because a storefront is a
 * decision that lives in lib/commerce.ts and nowhere else, least of all in a
 * row somebody can edit without a review.
 */
export interface CatalogSkin {
  id: string
  name: string
  source: 'free' | 'earned' | 'pass'
  blurb: string
  /** Reactive skins with numbered states (ruth_1..ruth_N). */
  states?: number
  shareGoal?: number
  referralGoal?: number
}

export interface ContentCatalog {
  /** Bumped by whoever publishes; only ever used for logging and cache busting. */
  version: number
  roads: RoadDef[]
  titles: TitleDef[]
  confetti: ConfettiDef[]
  flames: FlameDef[]
  chests: ChestSkinDef[]
  skins: CatalogSkin[]
  /** Mailbox posts — how a season announces itself. See NewsDef. */
  news: NewsDef[]
  /**
   * Art id → URL, merged over data/generatedArt.ts and RASTER_SKINS.
   *
   * This is what lets a season's art ship without a binary: the PNG lives in
   * Supabase Storage (or any https host) and the id points at it. A skin id
   * with no entry keeps whatever the bundle has, which is the generatedArt
   * bargain applied one level up.
   */
  art: Record<string, string>
}

export const EMPTY_CATALOG: ContentCatalog = {
  version: 0,
  roads: [],
  titles: [],
  confetti: [],
  flames: [],
  chests: [],
  skins: [],
  news: [],
  art: {},
}

// ── Sanitisers ───────────────────────────────────────────────────────────────
// Every one of these takes `unknown` and returns something renderable, dropping
// what it can't read. The catalog is fetched at runtime and is not typechecked
// by anything — treating it as trusted input is how one bad row becomes a blank
// season screen on every phone at once.

const str = (v: unknown, max = 200): string | null =>
  typeof v === 'string' && v.trim() !== '' && v.length <= max ? v : null

const isIsoDate = (v: unknown): v is string =>
  typeof v === 'string' && !Number.isNaN(new Date(v).getTime())

/** A catalog id: the key everything merges on, so keep it boring and safe to
 *  interpolate into a storage key or a quest id. */
const id = (v: unknown): string | null =>
  typeof v === 'string' && /^[a-z0-9][a-z0-9_]{0,63}$/i.test(v) ? v : null

/** `#rgb` / `#rrggbb` only. Confetti colors are handed straight to a canvas
 *  library and a bad value there throws inside the burst. */
const hex = (v: unknown): string | null =>
  typeof v === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ? v : null

/** `r,g,b`, each 0-255 — the shape StreakFlame interpolates an alpha into. */
const rgbTriple = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const parts = v.split(',').map((p) => Number(p.trim()))
  if (parts.length !== 3) return null
  if (!parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) return null
  return parts.join(',')
}

/**
 * An art URL, and this one is a security boundary rather than a tidiness one.
 *
 * These strings end up in `<image href>` and `<img src>`. Anything but plain
 * https or a root-relative path is rejected — `javascript:` and `data:` in
 * particular, so a compromised or mistyped catalog row can't put script into
 * every player's avatar. No protocol-relative `//host` either: it inherits the
 * page's scheme, which inside the Capacitor WebView is not https.
 */
export const artUrl = (v: unknown): string | null => {
  if (typeof v !== 'string' || v.length > 500) return null
  if (v.startsWith('/') && !v.startsWith('//')) return v
  if (/^https:\/\/[^\s"'<>]+$/i.test(v)) return v
  return null
}

function sanitizeTitles(raw: unknown): TitleDef[] {
  if (!Array.isArray(raw)) return []
  const out: TitleDef[] = []
  for (const t of raw) {
    if (!t || typeof t !== 'object') continue
    const i = id((t as TitleDef).id)
    const text = str((t as TitleDef).text, 40)
    if (i && text) out.push({ id: i, text })
  }
  return out
}

function sanitizeConfetti(raw: unknown): ConfettiDef[] {
  if (!Array.isArray(raw)) return []
  const out: ConfettiDef[] = []
  for (const c of raw) {
    if (!c || typeof c !== 'object') continue
    const o = c as ConfettiDef
    const i = id(o.id)
    const name = str(o.name, 40)
    const colors = Array.isArray(o.colors)
      ? o.colors.map(hex).filter((x): x is string => x !== null).slice(0, 12)
      : []
    // A theme with no usable colors would burst nothing at all, which reads as
    // the app being broken rather than as a cosmetic being unset.
    if (!i || !name || colors.length === 0) continue
    const shapes = Array.isArray(o.shapes)
      ? o.shapes.filter((s): s is 'circle' | 'square' => s === 'circle' || s === 'square')
      : undefined
    out.push({ id: i, name, colors, ...(shapes?.length ? { shapes } : {}) })
  }
  return out
}

/** One or two characters — an emoji, not a caption. Grapheme-aware enough for
 *  the flags and ZWJ sequences a glyph might reasonably be. */
const glyph = (v: unknown): string | null => {
  if (typeof v !== 'string' || v.trim() === '' || v.length > 16) return null
  return v
}

function sanitizeFlames(raw: unknown): FlameDef[] {
  if (!Array.isArray(raw)) return []
  const out: FlameDef[] = []
  for (const f of raw) {
    if (!f || typeof f !== 'object') continue
    const o = f as FlameDef
    const i = id(o.id)
    const name = str(o.name, 40)
    const g = glyph(o.glyph)
    const rgb = rgbTriple(o.rgb)
    if (i && name && g && rgb) out.push({ id: i, name, glyph: g, rgb })
  }
  return out
}

function sanitizeChests(raw: unknown): ChestSkinDef[] {
  if (!Array.isArray(raw)) return []
  const out: ChestSkinDef[] = []
  for (const c of raw) {
    if (!c || typeof c !== 'object') continue
    const o = c as ChestSkinDef
    const i = id(o.id)
    const name = str(o.name, 40)
    const g = glyph(o.glyph)
    if (i && name && g) out.push({ id: i, name, glyph: g })
  }
  return out
}

function sanitizeRewards(raw: unknown): Reward[] {
  if (!Array.isArray(raw)) return []
  const out: Reward[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    // A reward id may carry a `_`-suffixed state (skin_ruth_1), so it uses the
    // same charset as an id but is allowed to be longer.
    const rid = (r as Reward).id
    if (typeof rid !== 'string' || !/^[a-z0-9][a-z0-9_]{0,63}$/i.test(rid)) continue
    const qty = (r as Reward).qty
    // The consumable counters are `+= qty` in SQL (claim_season_reward, 0058);
    // an absurd qty there is a client handing itself 10,000 streak freezes.
    const n = typeof qty === 'number' && Number.isInteger(qty) && qty > 0 && qty <= 10 ? qty : undefined
    out.push(n ? { id: rid, qty: n } : { id: rid })
  }
  return out.slice(0, 12)
}

function sanitizeWaystations(raw: unknown, length: number): Waystation[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<number>()
  const out: Waystation[] = []
  for (const w of raw) {
    if (!w || typeof w !== 'object') continue
    const o = w as Waystation
    if (!Number.isInteger(o.n) || o.n < 1 || o.n > length) continue
    if (seen.has(o.n)) continue // two rows for one tier: rewardsAt would miss one
    seen.add(o.n)
    out.push({
      n: o.n,
      a: sanitizeRewards(o.a),
      b: sanitizeRewards(o.b),
      ...(o.milestone === true ? { milestone: true } : {}),
    })
  }
  return out.sort((x, y) => x.n - y.n)
}

/** How many waystations a road has when it doesn't say. */
export const DEFAULT_ROAD_LENGTH = 50

export function sanitizeRoads(raw: unknown): RoadDef[] {
  if (!Array.isArray(raw)) return []
  const out: RoadDef[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const o = r as RoadDef
    const i = id(o.id)
    const name = str(o.name, 60)
    const blurb = str(o.blurb, 300)
    const memento = str(o.memento, 64)
    if (!i || !name || !blurb || !memento) continue
    if (!isIsoDate(o.start) || !isIsoDate(o.end)) continue
    // A backwards window would make activeRoad() never match and roadDay()
    // negative — cheaper to drop the road than to render a season of nothing.
    if (new Date(o.end).getTime() <= new Date(o.start).getTime()) continue
    const length =
      Number.isInteger(o.length) && (o.length as number) >= 1 && (o.length as number) <= 200
        ? (o.length as number)
        : DEFAULT_ROAD_LENGTH
    const waystations = sanitizeWaystations(o.waystations, length)
    if (waystations.length === 0) continue // a road that pays nothing is a bug
    const daily = sanitizeQuestDefs(o.daily)
    const weekly = sanitizeQuestDefs(o.weekly)
    out.push({
      id: i,
      name,
      blurb,
      start: o.start,
      end: o.end,
      waystations,
      memento,
      length,
      // A partial pool is worse than none: `pick()` needs 3 dailies and 5
      // weeklies, and falling back to the bundled pool is always playable.
      ...(daily.length >= 3 ? { daily } : {}),
      ...(weekly.length >= 5 ? { weekly } : {}),
      ...(id(o.scene) ? { scene: o.scene } : {}),
    })
  }
  return out
}

function sanitizeSkins(raw: unknown): CatalogSkin[] {
  if (!Array.isArray(raw)) return []
  const out: CatalogSkin[] = []
  for (const s of raw) {
    if (!s || typeof s !== 'object') continue
    const o = s as CatalogSkin
    const i = id(o.id)
    const name = str(o.name, 60)
    const blurb = str(o.blurb, 300)
    // 'paid' is not in this union on purpose — see CatalogSkin.
    const source = o.source === 'free' || o.source === 'earned' || o.source === 'pass' ? o.source : null
    if (!i || !name || !blurb || !source) continue
    const states =
      Number.isInteger(o.states) && (o.states as number) >= 2 && (o.states as number) <= 12
        ? (o.states as number)
        : undefined
    const num = (v: unknown) =>
      Number.isInteger(v) && (v as number) > 0 && (v as number) <= 10_000 ? (v as number) : undefined
    out.push({
      id: i,
      name,
      source,
      blurb,
      ...(states ? { states } : {}),
      ...(num(o.shareGoal) ? { shareGoal: o.shareGoal } : {}),
      ...(num(o.referralGoal) ? { referralGoal: o.referralGoal } : {}),
    })
  }
  return out
}

function sanitizeArt(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    // Art ids carry state suffixes (ruth_1), so the same charset as a reward id.
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(k)) continue
    const url = artUrl(v)
    if (url) out[k] = url
  }
  return out
}

/**
 * Mailbox posts. Fails closed per entry like every other sanitiser here: a post
 * missing a date, or carrying a body longer than a paragraph, is dropped rather
 * than rendered badly. `at` and `until` must parse as dates, because a post the
 * mailbox cannot sort is a post that appears in a random place forever.
 */
export function sanitizeNews(raw: unknown): NewsDef[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: NewsDef[] = []
  for (const n of raw) {
    if (!n || typeof n !== 'object') continue
    const { id, emoji, title, body, at, until } = n as Partial<NewsDef>
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(id)) continue
    if (seen.has(id)) continue
    const t = str(title, 80)
    const b = str(body, 400)
    if (!t || !b) continue
    if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) continue
    if (until != null && (typeof until !== 'string' || Number.isNaN(Date.parse(until)))) continue
    seen.add(id)
    out.push({
      id,
      // One or two characters: an emoji, never a sentence smuggled in as one.
      emoji: typeof emoji === 'string' && emoji.length > 0 && emoji.length <= 4 ? emoji : '📣',
      title: t,
      body: b,
      at,
      ...(until ? { until } : {}),
    })
  }
  return out
}

/** Turn whatever the server sent into something safe to render. */
export function sanitizeCatalog(raw: unknown): ContentCatalog {
  if (!raw || typeof raw !== 'object') return EMPTY_CATALOG
  const o = raw as Partial<ContentCatalog>
  return {
    version: Number.isFinite(o.version) ? Number(o.version) : 0,
    roads: sanitizeRoads(o.roads),
    titles: sanitizeTitles(o.titles),
    confetti: sanitizeConfetti(o.confetti),
    flames: sanitizeFlames(o.flames),
    chests: sanitizeChests(o.chests),
    skins: sanitizeSkins(o.skins),
    news: sanitizeNews(o.news),
    art: sanitizeArt(o.art),
  }
}

// ── The overlay ──────────────────────────────────────────────────────────────
// A module-level value rather than a hook, and that is deliberate. Every
// consumer of this content is a synchronous accessor called from render —
// `confettiById()` inside useJuice, `flameById()` inside StreakFlame,
// `activeRoad()` inside a zustand action. Threading a promise through all of
// them would touch thirty call sites to say the same thing; setting the overlay
// once and letting the accessors read it touches none.
//
// store/catalog.ts owns the fetch and calls setCatalogOverlay(); it is mounted
// early enough that the overlay is in place before the season screen renders,
// and if it isn't, every accessor falls back to bundled content and the next
// render picks it up.

let overlay: ContentCatalog = EMPTY_CATALOG

export function setCatalogOverlay(raw: unknown): ContentCatalog {
  overlay = sanitizeCatalog(raw)
  return overlay
}

export const catalogOverlay = (): ContentCatalog => overlay

/**
 * Any image the catalog can name, by id.
 *
 * Overlay first, then whatever the generator bundled — the same two-tier
 * bargain skinArtUrl makes, and the reason a season's art can either ride
 * along in the binary (pre-shipped, offline-proof) or arrive over the wire.
 */
export function catalogArtUrl(id?: string | null): string | undefined {
  if (!id) return undefined
  return catalogOverlay().art[id] ?? GENERATED_ART[id]
}

/** Test/dev seam — put it back to "nothing fetched yet". */
/**
 * Every mailbox post that is live right now, newest first.
 *
 * There is no bundled news — a binary has nothing to announce about itself —
 * so this is the overlay, filtered by `until` and sorted. It is a pure function
 * of the clock against ISO dates, which is the same free trick `activeRoad()`
 * uses: a post can be published weeks early and switch itself on at its `at`.
 */
export function activeNews(now: Date = new Date()): NewsDef[] {
  const t = now.getTime()
  return overlay.news
    .filter((n) => Date.parse(n.at) <= t && (!n.until || Date.parse(n.until) > t))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}

export function resetCatalogOverlay(): void {
  overlay = EMPTY_CATALOG
}

/**
 * Bundled first, then the overlay laid over it by id.
 *
 * Order matters and is part of the contract: bundled entries keep their
 * positions (so the equip grids don't reshuffle under a player when a catalog
 * publishes), an overridden id is replaced in place, and genuinely new entries
 * are appended in catalog order.
 */
export function mergeById<T extends { id: string }>(bundled: T[], extra: T[]): T[] {
  if (extra.length === 0) return bundled
  const byId = new Map(extra.map((e) => [e.id, e]))
  const merged = bundled.map((b) => byId.get(b.id) ?? b)
  const known = new Set(bundled.map((b) => b.id))
  for (const e of extra) if (!known.has(e.id)) merged.push(e)
  return merged
}

/** The pools a road draws from, given the bundled fallbacks. */
export function poolsFor(road: RoadDef, fallback: QuestPools): QuestPools {
  return {
    daily: road.daily && road.daily.length >= 3 ? road.daily : fallback.daily,
    weekly: road.weekly && road.weekly.length >= 5 ? road.weekly : fallback.weekly,
  }
}
