// What the TikTok engine actually posted, read back for the player.
//
// The engine (docs/TIKTOK-ENGINE.md) is an operator tool: three videos a day —
// the verse read aloud, the story behind it, a CPU replaying the previous day's
// quiz — handed to Ayrshare and parked at `days/<date>/posted-<kind>.json` in
// the `tiktok` bucket. That bucket is PUBLIC read (everything in it is a piece
// of a public video), so a player-facing surface can offer "watch it" with no
// RPC, no table and no migration: a plain GET of a JSON file, for a guest
// exactly as for an account.
//
// Two rules hold it together.
//
// **It fails closed at every step, and there is no error state.** No keys, no
// bucket, no record for the day, a post still scheduled, a URL that isn't the
// network's own — all of them come back as an empty list, and the surface that
// asked renders nothing at all. A row saying "we couldn't reach TikTok" is
// worse than no row: nobody was promised one.
//
// **A link may only go where it says it goes.** These URLs are written by
// Ayrshare rather than by us, and they land in an `href` on a player's screen,
// so each one is checked against the host of the platform it claims to be —
// the same "code is not content" rule the catalog's `art` URLs follow. https
// only, known host only, everything else dropped.
//
// It reads nothing about a player and writes nothing anywhere: no view counts,
// no "12 watched", nothing countable and nothing to rank.

import { supabase } from './supabase'

export type SocialPlatform = 'tiktok' | 'youtube' | 'facebook' | 'instagram' | 'x' | 'snapchat'
export type PostKind = 'verse' | 'story' | 'quiz'

export interface SocialLink {
  platform: SocialPlatform
  /** What the network is called, as a player would say it. */
  name: string
  url: string
}

/** The order they are offered in — biggest audience first, not the record's order. */
export const SOCIAL_ORDER: SocialPlatform[] = ['tiktok', 'youtube', 'instagram', 'facebook', 'x', 'snapchat']

export const SOCIAL_NAMES: Record<SocialPlatform, string> = {
  tiktok: 'TikTok',
  youtube: 'YouTube',
  instagram: 'Instagram',
  facebook: 'Facebook',
  x: 'X',
  snapchat: 'Snapchat',
}

/** Where a link for each platform is allowed to point. A host or a subdomain of one. */
const SOCIAL_HOSTS: Record<SocialPlatform, string[]> = {
  tiktok: ['tiktok.com'],
  youtube: ['youtube.com', 'youtu.be'],
  instagram: ['instagram.com'],
  facebook: ['facebook.com', 'fb.watch', 'fb.com'],
  x: ['x.com', 'twitter.com'],
  snapchat: ['snapchat.com'],
}

interface PostedRow {
  platform?: unknown
  status?: unknown
  postUrl?: unknown
}

function safeUrl(platform: SocialPlatform, raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'https:') return null
  const host = u.hostname.toLowerCase()
  const ok = SOCIAL_HOSTS[platform].some((h) => host === h || host.endsWith('.' + h))
  return ok ? u.toString() : null
}

// One fetch per (date, kind) for the life of the tab. The file changes at most
// once a day and several surfaces may ask for the same one.
const cache = new Map<string, Promise<SocialLink[]>>()

async function read(date: string, kind: PostKind): Promise<SocialLink[]> {
  if (!supabase) return []
  const url = supabase.storage.from('tiktok').getPublicUrl(`days/${date}/posted-${kind}.json`).data.publicUrl
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 6000)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) return []
    const record = (await res.json()) as { results?: PostedRow[] }
    const rows = Array.isArray(record?.results) ? record.results : []
    const links: SocialLink[] = []
    for (const platform of SOCIAL_ORDER) {
      const row = rows.find((r) => String(r?.platform ?? '') === platform)
      // A post Ayrshare accepted for LATER carries no postUrl until the network
      // publishes it (the function's `links` action fills those in afterwards),
      // so "no URL yet" is the ordinary state rather than a failure.
      const href = row ? safeUrl(platform, row.postUrl) : null
      if (href) links.push({ platform, name: SOCIAL_NAMES[platform], url: href })
    }
    return links
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}

/** Every network that has a live, watchable post of that day's video. Empty is normal. */
export function postedLinks(date: string, kind: PostKind): Promise<SocialLink[]> {
  const key = `${date}:${kind}`
  let p = cache.get(key)
  if (!p) {
    p = read(date, kind)
    cache.set(key, p)
  }
  return p
}
