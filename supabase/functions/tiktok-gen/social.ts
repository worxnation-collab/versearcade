// social — how a Verse Arcade video is described to each network, as an
// Ayrshare /post body. ONE copy, imported by the Edge Function (Deno) and
// bundled into the headless runner (scripts/tiktok-daily.mjs, via esbuild),
// so the dashboard's "Post it now" and the morning cron cannot drift apart
// about what a TikTok caption or a YouTube title looks like.
//
// Pure: no I/O, no environment. Everything a network needs is either in the
// day's per-platform copy or in the arguments.

export type Platform = 'tiktok' | 'youtube' | 'facebook' | 'instagram' | 'x' | 'snapchat'
export const PLATFORMS: Platform[] = ['tiktok', 'youtube', 'facebook', 'instagram', 'x', 'snapchat']

/** Ayrshare's own name for a platform: X is still "twitter" on its API. */
export const ayrshareName = (p: Platform): string => (p === 'x' ? 'twitter' : p)

export interface PlatformCopy { title?: string; text?: string; tags?: string[] }
export interface DayCopy { hook?: string; platforms?: Partial<Record<Platform, PlatformCopy>> }

export interface PostArgs {
  date: string
  kind: 'verse' | 'story' | 'quiz'
  reference: string
  videoUrl: string
  /** UTC, `YYYY-MM-DDThh:mm:ssZ`; omitted posts now. */
  scheduleDate?: string
}

const tagLine = (tags: string[] | undefined, n: number) => (tags ?? []).slice(0, n).map((t) => '#' + t).join(' ')

/**
 * The per-platform options are deliberate: YouTube as a Short, public, not
 * made for kids, `containsSyntheticMedia` (the voice is synthetic); TikTok
 * public with `isAIGenerated` for the same reason, its caption on one line
 * because TikTok drops line breaks; Facebook as a Reel titled with the hook;
 * Instagram as a Reel shared to the feed, five hashtags at most; X gets one
 * line under 280 characters with two tags; Snapchat goes to Spotlight, its
 * discovery feed, where a video from an account nobody follows yet can still
 * be shown to strangers and hashtags are live — asked for together with a
 * saved story, Ayrshare posted ONLY the saved story, which sits on the
 * profile for people who already found it, so Spotlight is asked for alone.
 * A platform with no block of its own borrows TikTok's. An idempotency
 * key per (date, kind, platform) means a retry after a network blip cannot
 * post the same video twice.
 */
export function postBody(platform: Platform, copy: DayCopy, a: PostArgs): Record<string, unknown> {
  const c = copy.platforms?.[platform] ?? copy.platforms?.tiktok ?? {}
  const body: Record<string, unknown> = {
    platforms: [ayrshareName(platform)], mediaUrls: [a.videoUrl], isVideo: true,
    idempotencyKey: `va-${a.date}-${a.kind}-${platform}`,
    notes: `Verse Arcade ${a.kind} ${a.date}`,
  }
  if (a.scheduleDate) body.scheduleDate = a.scheduleDate
  if (platform === 'tiktok') {
    body.post = [c.text ?? '', tagLine(c.tags, 5)].filter(Boolean).join(' ').slice(0, 2200)
    body.tikTokOptions = { visibility: 'public', isAIGenerated: true }
  } else if (platform === 'youtube') {
    body.post = [c.text ?? '', tagLine(c.tags, 5)].filter(Boolean).join('\n\n').slice(0, 5000)
    body.youTubeOptions = { title: (c.title || `${a.reference || 'Verse Arcade'} · Verse Arcade`).slice(0, 100), visibility: 'public', shorts: true, madeForKids: false, containsSyntheticMedia: true }
  } else if (platform === 'facebook') {
    body.post = [c.text ?? '', tagLine(c.tags, 2)].filter(Boolean).join('\n\n').slice(0, 5000)
    body.faceBookOptions = { reels: true, title: (copy.hook || a.reference || 'Verse Arcade').slice(0, 255) }
  } else if (platform === 'x') {
    const tags = tagLine(c.tags, 2)
    const text = (c.text ?? '').slice(0, Math.max(0, 279 - tags.length - 1))
    body.post = [text, tags].filter(Boolean).join(' ')
  } else if (platform === 'snapchat') {
    body.post = [c.text ?? '', tagLine(c.tags, 3)].filter(Boolean).join(' ').slice(0, 160)
    body.snapChatOptions = { spotlight: true }
  } else {
    body.post = [c.text ?? '', tagLine(c.tags, 5)].filter(Boolean).join('\n\n').slice(0, 2200)
    body.instagramOptions = { shareReelsFeed: true }
  }
  return body
}

/** One row of what Ayrshare said, in the shape the dashboard shows. */
export function postResult(platform: Platform, r: Record<string, unknown>, scheduleDate?: string): Record<string, unknown> {
  const ids = Array.isArray(r.postIds) ? (r.postIds as Array<Record<string, unknown>>) : []
  const errs = Array.isArray(r.errors) ? (r.errors as Array<Record<string, unknown>>) : []
  return {
    platform, status: String(r.status ?? 'error'), id: r.id ?? null,
    postUrl: ids[0]?.postUrl ?? null, postId: ids[0]?.id ?? null,
    error: errs[0]?.message ?? (r.status === 'error' ? String(r.message ?? r.raw ?? 'failed') : null),
    scheduleDate: scheduleDate ?? null,
  }
}
