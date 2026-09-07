// social — how a Verse Arcade video is described to each network, as an
// Ayrshare /post body. ONE copy, imported by the Edge Function (Deno) and
// bundled into the headless runner (scripts/tiktok-daily.mjs, via esbuild),
// so the dashboard's "Post it now" and the morning cron cannot drift apart
// about what a TikTok caption or a YouTube title looks like.
//
// Pure: no I/O, no environment. Everything a network needs is either in the
// day's per-platform copy or in the arguments.

export type Platform = 'tiktok' | 'youtube' | 'facebook' | 'instagram' | 'x' | 'snapchat' | 'threads' | 'pinterest'
export const PLATFORMS: Platform[] = ['tiktok', 'youtube', 'facebook', 'instagram', 'x', 'snapchat', 'threads', 'pinterest']

/** Ayrshare's own name for a platform: X is still "twitter" on its API. */
export const ayrshareName = (p: Platform): string => (p === 'x' ? 'twitter' : p)

export interface PlatformCopy { title?: string; text?: string; tags?: string[] }
export interface DayCopy { hook?: string; platforms?: Partial<Record<Platform, PlatformCopy>> }

/** The posts a day: see admin/tiktok/shared.tsx for what each is. */
export type Kind = 'verse' | 'story' | 'quiz' | 'challenge' | 'challenge2' | 'own'
export const KINDS: Kind[] = ['verse', 'story', 'quiz', 'challenge', 'challenge2', 'own']
export const kindOf = (k: unknown): Kind => ((KINDS as string[]).includes(String(k)) ? (k as Kind) : 'verse')

/**
 * Which kinds a network does NOT get. Ayrshare's plan is 1,000 posts a month
 * and five kinds on six networks already sits near 900, so a seventh network
 * has to give something up: Threads skips the quiz (the 107-second replay
 * is the weakest fit for a text-first feed anyway). Pinterest gets the verse
 * and the story ONLY: it is a search engine where a pin is found for years,
 * and a "comment your answer" clock or a replay of yesterday's quiz is a
 * pin nobody searches for. The function's `post` refuses the pair with a
 * `skipped` row and the runner never asks, so the hub and the cron cannot
 * disagree about it.
 */
const KINDS_OFF: Partial<Record<Platform, Kind[]>> = { threads: ['quiz'], pinterest: ['quiz', 'challenge', 'challenge2', 'own'] }
export const postsOn = (platform: Platform, kind: Kind): boolean => !(KINDS_OFF[platform] ?? []).includes(kind)

export interface PostArgs {
  date: string
  kind: Kind
  reference: string
  videoUrl: string
  /** UTC, `YYYY-MM-DDThh:mm:ssZ`; omitted posts now. */
  scheduleDate?: string
  /** A deliberate re-post of the same day and kind (a rejected first try): joins the idempotency key so Ayrshare takes it. */
  attempt?: number
  /** The video's length. Facebook Reels stop at 90 seconds; a longer video goes to the page as a plain video post instead. */
  seconds?: number
  /** A public JPG of the video's first frame, same size as the video. Pinterest refuses a video pin without one. */
  cover?: string
}

/** Facebook's Reels ceiling. The quiz (about 107s) and a long story (91s) both hit it on the first real day. */
export const FACEBOOK_REEL_MAX_SECONDS = 90

/**
 * The art is painted by a model and the voice is synthetic, and every network
 * now asks that to be said. TikTok, YouTube and Instagram take it as a flag
 * and put their own label on the post; Snapchat, Facebook and X have no flag
 * on Ayrshare's API, so the caption says it — Snapchat's Spotlight review
 * rejected the first verse as "undisclosed AI-generated content".
 */
export const AI_NOTE = 'AI-generated art and voice.'

const tagLine = (tags: string[] | undefined, n: number) => (tags ?? []).slice(0, n).map((t) => '#' + t).join(' ')

/**
 * The link every post carries: the PLAYABLE verse, not the homepage, tagged
 * with the network it was posted on. `/play` is open to a guest, so a
 * stranger plays today's verse in thirty seconds and meets the account wall
 * with a streak already started — the conversion path the app was built
 * for. `?src=` is what `set_signup_source` (0106) files the sign-up under,
 * so the hub can say which network sends people who sign up rather than
 * people who watch. Networks whose captions are not tappable (TikTok,
 * Snapchat, Instagram) get it through the bio link, set by hand to the
 * same shape.
 */
export const siteLink = (platform: Platform): string => `https://versearcade.org/play?src=${platform}`

/** Any bare site mention the model wrote becomes the tracked link, so no caption goes out untagged. */
const trackLinks = (text: string, platform: Platform): string =>
  text.replace(/(?:https?:\/\/)?(?:www\.)?versearcade\.org(?:\/[\w./?=&-]*)?/gi, siteLink(platform))

/**
 * The ask at the end of a caption, per network, and it differs on purpose:
 * a URL is a dead string on TikTok and Snapchat (nothing in a caption there
 * is tappable), so those ask for the follow, which IS tappable and is the
 * number that decides whether a day's post reaches anyone the next day.
 * Instagram's is the bio link, YouTube's, Facebook's and X's are live URLs.
 * A challenge asks for the comment first — a comment is what a one-question
 * post exists to collect — and the follow second. The copy prompt asks for
 * the same thing; this is the guarantee, over words a model may not have
 * written that way.
 */
export function callToAction(platform: Platform, kind: Kind): string {
  const challenge = kind === 'challenge' || kind === 'challenge2'
  switch (platform) {
    case 'tiktok': return challenge ? "Comment your answer. Follow for tomorrow's." : "Follow for tomorrow's verse."
    case 'snapchat': return challenge ? 'Comment your answer.' : "Follow for tomorrow's verse."
    case 'instagram': return challenge ? 'Comment your answer. Play it — link in bio.' : 'Play it — link in bio.'
    case 'youtube': return challenge ? `Comment your answer. Play today's verse: ${siteLink(platform)}` : `Play today's verse: ${siteLink(platform)}`
    case 'facebook': return challenge ? `Comment your answer. ${siteLink(platform)}` : siteLink(platform)
    case 'x': return challenge ? `Comment your answer. ${siteLink(platform)}` : siteLink(platform)
    case 'threads': return challenge ? `Comment your answer. Play it: ${siteLink(platform)}` : `Play today's verse: ${siteLink(platform)}`
    case 'pinterest': return `Play today's verse: ${siteLink(platform)}`
  }
}

/** The caption's text with the network's own ask on the end, unless the words already carry it. */
function withAsk(text: string | undefined, platform: Platform, kind: Kind): string {
  const t = trackLinks((text ?? '').trim(), platform)
  const ask = callToAction(platform, kind)
  const has = (platform === 'tiktok' || platform === 'snapchat') ? /follow/i.test(t) : /versearcade\.org|link in bio/i.test(t)
  if (has && (!/challenge/.test(kind) || /comment/i.test(t))) return t
  return [t, ask].filter(Boolean).join(platform === 'tiktok' || platform === 'snapchat' || platform === 'x' ? ' ' : '\n')
}

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
    idempotencyKey: `va-${a.date}-${a.kind}-${platform}${a.attempt && a.attempt > 1 ? `-${a.attempt}` : ''}`,
    notes: `Verse Arcade ${a.kind} ${a.date}`,
  }
  if (a.scheduleDate) body.scheduleDate = a.scheduleDate
  if (platform === 'tiktok') {
    body.post = [withAsk(c.text, platform, a.kind), tagLine(c.tags, 5)].filter(Boolean).join(' ').slice(0, 2200)
    body.tikTokOptions = { visibility: 'public', isAIGenerated: true }
  } else if (platform === 'youtube') {
    body.post = [withAsk(c.text, platform, a.kind), tagLine(c.tags, 5)].filter(Boolean).join('\n\n').slice(0, 5000)
    body.youTubeOptions = { title: (c.title || `${a.reference || 'Verse Arcade'} · Verse Arcade`).slice(0, 100), visibility: 'public', shorts: true, madeForKids: false, containsSyntheticMedia: true }
  } else if (platform === 'facebook') {
    body.post = [withAsk(c.text, platform, a.kind), AI_NOTE, tagLine(c.tags, 2)].filter(Boolean).join('\n\n').slice(0, 5000)
    // A Reel where one is allowed (it is the surface Facebook shows to
    // strangers); over the ceiling, a plain video post on the page rather
    // than a refusal — Facebook rejected the quiz and a 91-second story as
    // Reels on the first real day. Unknown length is treated as short.
    const reels = !(a.seconds && a.seconds > FACEBOOK_REEL_MAX_SECONDS)
    body.faceBookOptions = { reels, title: (copy.hook || a.reference || 'Verse Arcade').slice(0, 255) }
  } else if (platform === 'x') {
    // X counts every URL as 23 characters whatever its length, and the ask
    // carries the tracked link, so the budget is measured that way and the
    // model's words are what get shortened — never the ask, never the note.
    const tail = [AI_NOTE, tagLine(c.tags, 2)].filter(Boolean).join(' ')
    const ask = callToAction(platform, a.kind)
    const xLen = (s: string) => s.replace(/https?:\/\/\S+/g, 'x'.repeat(23)).length
    // The model's own link sentence goes whole ("Play today's verse: versearcade.org"): the ask says it again with the tracked link.
    let lead = (c.text ?? '').replace(/[^.!?\n]*(?:https?:\/\/)?(?:www\.)?versearcade\.org\S*[^.!?\n]*[.!?]?/gi, ' ').replace(/\s+/g, ' ').trim()
    const words = lead.split(' ')
    while (words.length > 1 && xLen([words.join(' '), ask, tail].join(' ')) > 280) words.pop()
    lead = words.join(' ')
    body.post = [lead, ask, tail].filter(Boolean).join(' ')
  } else if (platform === 'threads') {
    // Threads: 500 characters, links tappable, no AI flag on the API so the
    // caption says it. Two tags at most — Threads treats a tag as a topic.
    body.post = [withAsk(c.text, platform, a.kind), AI_NOTE, tagLine(c.tags, 2)].filter(Boolean).join('\n\n').slice(0, 500)
  } else if (platform === 'pinterest') {
    // Pinterest is search: the title carries the reference and what the pin
    // is, the description (500) the words somebody would type, the link is
    // the pin's click-through, and the cover is the frame Pinterest shows
    // before play — required for a video pin, same size as the video.
    body.post = [withAsk(c.text, platform, a.kind), AI_NOTE, tagLine(c.tags, 3)].filter(Boolean).join('\n\n').slice(0, 500)
    body.pinterestOptions = { title: (c.title || `${a.reference || 'Verse Arcade'} · Daily Bible Verse`).slice(0, 100), link: siteLink(platform), thumbNail: a.cover, altText: [`${a.reference || 'A Bible verse'}, read aloud over a painted road — Verse Arcade`.slice(0, 500)] }
  } else if (platform === 'snapchat') {
    // The note goes FIRST: the caption is cut at 160 and the disclosure is
    // the part that must survive.
    body.post = [AI_NOTE, withAsk(c.text, platform, a.kind), tagLine(c.tags, 3)].filter(Boolean).join(' ').slice(0, 160)
    body.snapChatOptions = { spotlight: true }
  } else {
    body.post = [withAsk(c.text, platform, a.kind), tagLine(c.tags, 5)].filter(Boolean).join('\n\n').slice(0, 2200)
    body.instagramOptions = { shareReelsFeed: true, isAIGenerated: true }
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
