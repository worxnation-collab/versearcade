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
export type Kind = 'verse' | 'story' | 'quiz' | 'challenge' | 'challenge2' | 'own' | 'note'
  | 'book' | 'moment' | 'before' | 'figure' | 'quiet' | 'prayer'
/** The six READING kinds: the weekday rotation's second post, all in his own voice. */
export const READING: Kind[] = ['book', 'moment', 'before', 'figure', 'quiet', 'prayer']
export const KINDS: Kind[] = ['verse', 'story', 'quiz', 'challenge', 'challenge2', 'own', 'note', ...READING]
export const kindOf = (k: unknown): Kind => ((KINDS as string[]).includes(String(k)) ? (k as Kind) : 'verse')

/**
 * Which kinds a network does NOT get, and it is now two rules rather than one.
 *
 * **The budget.** Ayrshare's plan is 1,000 posts a month, so every network and
 * every kind is paid for out of the same purse. Do the arithmetic before
 * adding either: the schedule below is 28 posts a day (~840 a month), and it
 * used to be 36 (~1,080) — over the cap, silently, because the comment here
 * still claimed "near 900" from back when six networks carried five kinds.
 *
 * **And volume is a liability on three of the eight.** YouTube's inauthentic
 * content policy (July 2025) demonetizes "mass-produced, generic, repetitive"
 * output, naming AI made "with generic or unoriginal templates... without
 * adding the creator's original, authentic insights"; Meta's originality
 * policy does the same for Facebook and Instagram and applies its penalty
 * ACROSS EVERYTHING THE ACCOUNT POSTS, so one thin post drags the good ones
 * down with it. Five templated posts a day is the exact shape both describe.
 *
 * So those three get only what a person actually made: the morning VERSE and
 * the evening STORY, which carry the operator's own recorded voice, plus
 * `own`, which is him on camera outright. The quiz and the two challenges —
 * the three no human voice touches — go to TikTok, X, Snapchat and Threads,
 * where no volume rule was found and the only constraint is per-video.
 *
 * That is a posture, not a payout: every post on the platforms that judge a
 * CHANNEL has a human in it. What it costs is the comment ask, which only the
 * challenges carry — Meta loses its one engagement-driving format, and that
 * was the deliberate trade.
 *
 * The function's `post` refuses a pair it is not given with a `skipped` row
 * and the runner never asks, so the hub and the cron cannot disagree about it.
 */
const NOTE_ONLY_ON: Platform[] = ['facebook', 'pinterest']
/**
 * The three formats no human voice touches: they go where volume is not held
 * against you — which is now X and Threads alone. TikTok is on a warm-up and
 * Snapchat turned out to publish both a volume rule and an explicit ranking
 * demotion for AI made off-platform; see their entries below.
 */
const AUTOMATED: Kind[] = ['quiz', 'challenge', 'challenge2']
/**
 * The three formats no human voice touches. PARKED, not deleted: `makeQuiz`
 * and `makeChallenge` still work and the `replies` action still runs, so an
 * account with traction can have them back as a row rather than a rebuild —
 * the `bonusTriviaFor` bargain. What they no longer have is a network.
 *
 * They came off because every platform that judges a CHANNEL says the same
 * thing about wholly AI-generated content, and Snapchat says it in its
 * ranking: a schedule of five templated posts a day with three nobody spoke
 * on is the exact shape all three policies describe. The replacement is two
 * posts a day with his voice on both — see docs/TIKTOK-WEEK.md.
 */
const PARKED: Kind[] = [...AUTOMATED, ...READING]

/**
 * The networks this account actually posts to.
 *
 * Everything else is PARKED at the platform level for the reason the three
 * automated kinds are parked at the kind level: it was measured, not assumed.
 * Across five days of the same daily verse, YouTube delivered 983, 951 and
 * 777 views a post. Over the same posts TikTok delivered 1, 2 and 0, Instagram
 * 0, 2 and 5, Threads 10, 2 and 0, and Pinterest zero impressions of anything.
 * The account totals say the same thing louder: 73 YouTube subscribers and
 * 4,625 views against 4 TikTok followers, 0 on Instagram, 0 on Threads and 1
 * board follower on Pinterest.
 *
 * Five networks at single digits are not a small win — they are a cost. They
 * spend Ayrshare quota, they carry the AI-disclosure exposure (Snapchat has
 * already rejected a post from this account), and on the feeds that judge a
 * CHANNEL they make the account look like exactly the spray-and-pray bot the
 * policies are written against. Facebook stays because it is the only other
 * one with a pulse (6 to 104 views a post) and costs one extra API call.
 *
 * This is a LIST, not a rewrite: `postsOn` still decides per (platform, kind)
 * and every generator is untouched, so a network comes back as a row here the
 * day there is a reason for it.
 */
const LIVE_PLATFORMS: Platform[] = ['youtube', 'facebook']

const KINDS_OFF: Partial<Record<Platform, Kind[]>> = Object.fromEntries(
  PLATFORMS.map((p) => [p, [
    ...PARKED,
    // A network that is not live takes nothing at all.
    ...(LIVE_PLATFORMS.includes(p) ? [] : (['verse', 'story', 'own', 'note'] as Kind[])),
    // The NOTE is a photo rather than a video, so Facebook distributes it
    // through machinery a Reel never reaches and Pinterest can pin it. It is
    // written from the same paragraphs Tabitha tells, so it belongs to the day
    // the story runs and moves with it.
    ...(NOTE_ONLY_ON.includes(p) ? [] : (['note'] as Kind[])),
  ]]),
) as Partial<Record<Platform, Kind[]>>

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
  /**
   * He OPENED this post and an AI voice read the verse. Travels from the
   * generator with `voiced`, never inferred from a parked file — the same
   * rule, for the same reason: a claim about a FILE is not a claim about the
   * post, and this line is a disclosure.
   */
  opened?: boolean
  /** A public JPG of the video's first frame, same size as the video. Pinterest refuses a video pin without one. */
  cover?: string
  /** A voice on the video is the operator's own recording (days/<date>/voice-<kind>.json exists); the AI note then claims only the art. */
  voiced?: boolean
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
/**
 * The note for a post a PERSON read. The platform flag is a binary that says
 * "synthetic" and cannot say anything else, so this is the only place the
 * difference can be drawn — and on the two networks now warming up, every
 * post is one of these, because they get the verse and the story and nothing
 * else.
 *
 * It claims the VOICE and not the words. The thought is drafted for him and
 * he departs from it as he reads; saying the words are his would be the one
 * false note in a line whose whole job is being true.
 */
export const AI_NOTE_ART = 'AI-generated art. The voice you hear is mine, not synthetic.'
/**
 * And the note for the one post that is a PHOTO. Both lines above name a
 * voice, and a still has none — "AI-generated art and voice." on a card that
 * cannot make a sound describes something that is not in the post, which is
 * the one thing a disclosure must never do. It does not vary with `voiced`
 * either: a voiced DAY says nothing about a picture, so the note stays the
 * same on both.
 */
export const AI_NOTE_STILL = 'AI-generated art.'
/**
 * And the note for a post he OPENS but does not read.
 *
 * This one is the whole reason `voiced` could not stay a boolean. An opener
 * post carries BOTH voices — his introduction, then a synthesised reading of
 * the verse — so `AI_NOTE_ART` would claim a voice that is only half his,
 * about the half that is not. That is precisely the failure this engine has
 * already shipped once, when a story was captioned "The voice you hear is
 * mine" over a telling that was entirely Gemini's, and it went to seven
 * networks before anybody measured the audio.
 *
 * So the line names both, and names which is which. It is longer than the
 * others and that is the cost of it being true.
 */
export const AI_NOTE_OPENED = 'AI-generated art, and the verse is read by an AI voice. The introduction is mine.'
const aiNote = (a: PostArgs) =>
  a.kind === 'note' ? AI_NOTE_STILL
    : a.opened ? AI_NOTE_OPENED
      : a.voiced ? AI_NOTE_ART
        : AI_NOTE

const tagLine = (tags: string[] | undefined, n: number) => (tags ?? []).slice(0, n).map((t) => '#' + t).join(' ')

/**
 * The link every post carries: the PLAYABLE verse, not the homepage, tagged
 * with the network it was posted on. `/play` is open to a guest, so a
 * stranger plays today's verse in thirty seconds and meets the account wall
 * with a streak already started — the conversion path the app was built
 * for. `?src=` is what `set_signup_source` (0106) files the sign-up under,
 * so the hub can say which network sends people who sign up rather than
 * people who watch.
 */
export const siteLink = (platform: Platform): string => `https://versearcade.org/play?src=${platform}`

/**
 * NO CAPTION IN THIS ACCOUNT CARRIES A LINK, on any network. Two reasons,
 * and the first one is measurable: Facebook's own Professional dashboard
 * names "remove links from your caption" among the things a Reel is
 * rewarded for, and every feed that ranks video treats an outbound link the
 * same way. The second is the one that decided it — a post that ends in a
 * URL reads as an advertisement, and these are meant to read as something a
 * person would say and pass on. The brand is IN the video (the end card, the
 * site, the reference); the caption is just the words.
 *
 * So this removes whole any sentence carrying a versearcade.org mention (a
 * bare mention as well as a real URL — the model writes both), and the ask
 * that replaces it is the share.
 */
const dropLinkSentence = (text: string): string =>
  text.replace(/[^.!?\n]*(?:https?:\/\/)?(?:www\.)?versearcade\.org\S*[^.!?\n]*[.!?]?/gi, ' ')

/**
 * Where the tracked link goes instead, and it is not lost: Ayrshare posts a
 * FIRST COMMENT on the account's own post, and on these three a link in a
 * comment is tappable. It is added when the post actually publishes, which
 * is also the only moment a SCHEDULED post has an id to comment on.
 *
 * The other five are deliberate omissions, not oversights. TikTok and
 * Instagram take a first comment and render its link as dead text, so one
 * would buy nothing; Snapchat, Threads and Pinterest have no comment
 * endpoint on Ayrshare at all. Those five carry `?src=<network>` in their
 * BIO LINK, set by hand — which is what TikTok, Snapchat and Instagram
 * already did, with Threads joining them. Pinterest also keeps its link in
 * `pinterestOptions.link`, which is the pin's destination rather than
 * caption text: tapping a pin IS following the link.
 */
const FIRST_COMMENT_ON: Platform[] = ['facebook', 'youtube', 'x']

/**
 * The ask at the end of every caption, and it is now the SAME on every
 * network, which is the change: it used to be a link on the networks where
 * one is tappable and a follow where it is not, so a caption's last line was
 * always about the account. A share is about the person reading it, it is
 * the only ask that reaches somebody who has never heard of this, and it is
 * the one thing a wholesome post can end on without stopping being one.
 *
 * A challenge still asks for the comment first — a comment is what a
 * one-question post exists to collect — and the share second. The copy
 * prompt asks for the same thing; this is the guarantee, over words a model
 * may not have written that way.
 *
 * There is deliberately no second ask. A caption that asks for a share AND a
 * follow AND a comment asks for none of them, and the follow is the weaker
 * of the two anyway: it reaches people already watching, where a share
 * reaches a stranger's feed.
 */
export function callToAction(kind: Kind, short = false): string {
  // Friday's "who is this?" is the one format left that asks for a comment,
  // and it is the whole reason the week keeps a guessing post at all: the
  // challenges took the comment ask with them when they were parked.
  if (kind === 'figure') return short ? 'Guess before the reveal.' : 'Comment your guess before the reveal — then share it with someone who would get it.'
  const challenge = kind === 'challenge' || kind === 'challenge2'
  if (short) return challenge ? 'Comment your answer, then share it.' : 'Share this with someone who needs it.'
  return challenge
    ? 'Comment your answer — then share this with someone who needs to hear it.'
    : 'Share this with someone who needs to hear it today.'
}

/**
 * The caption's words with every link taken out and the share ask on the
 * end, unless the model already wrote one. `join` is a space where the
 * network flattens line breaks anyway (TikTok, Snapchat) and a newline
 * everywhere else.
 */
function withAsk(text: string | undefined, kind: Kind, join = '\n'): string {
  const stripped = dropLinkSentence((text ?? '').trim()).replace(/\blink in bio\b[^.!?\n]*[.!?]?/gi, ' ')
  // A space join is a network that flattens line breaks (TikTok, Snapchat),
  // so the model's own paragraph breaks are collapsed rather than shipped as
  // the blank gaps those feeds render them into.
  const t = join === ' '
    ? stripped.replace(/\s+/g, ' ').trim()
    : stripped.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  const challenge = kind === 'challenge' || kind === 'challenge2'
  const has = /\bshare\b/i.test(t) && (!challenge || /comment/i.test(t))
  if (has) return t
  // The ask is separated the way the words themselves are. A single newline
  // under the NOTE — three paragraphs split by blank lines — hung the share
  // line off the end of the closing sentence like a fourth clause of it,
  // where every other break in the post was a paragraph. So a text that
  // already contains a blank line gets one; a one-line caption keeps the
  // join it was given, and a space-joined network is untouched.
  const gap = join === '\n' && /\n\n/.test(t) ? '\n\n' : join
  return [t, callToAction(kind)].filter(Boolean).join(gap)
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
  // A note is a PHOTO post: one 4:5 card and the words. `isVideo` false is
  // not cosmetic — Ayrshare routes a video and a photo down different
  // endpoints, and a JPG sent as a video is refused by Facebook rather than
  // posted wrong.
  const photo = a.kind === 'note'
  const body: Record<string, unknown> = {
    platforms: [ayrshareName(platform)], mediaUrls: [a.videoUrl], isVideo: !photo,
    idempotencyKey: `va-${a.date}-${a.kind}-${platform}${a.attempt && a.attempt > 1 ? `-${a.attempt}` : ''}`,
    notes: `Verse Arcade ${a.kind} ${a.date}`,
  }
  if (a.scheduleDate) body.scheduleDate = a.scheduleDate
  // The tracked link, on the three networks where a comment's link is
  // tappable. Everywhere else it is the bio link, set by hand.
  if (FIRST_COMMENT_ON.includes(platform)) body.firstComment = { comment: `Play today's verse: ${siteLink(platform)}` }
  if (platform === 'tiktok') {
    // BOTH: the flag AND the note in the caption.
    //
    // The flag was briefly removed on the belief that it cost reach. TikTok's
    // own Creator Academy says the opposite — adding the label "won't affect
    // the distribution of your video" — so removing it bought nothing and
    // carried real risk: unlabelled AI can be taken down, the label cannot be
    // added after posting, and Snapchat's Spotlight review has already
    // rejected a verse from this account as "undisclosed AI-generated
    // content". The November 2025 preference slider is a VIEWER setting, not a
    // ranking penalty, and conflating the two is what caused the mistake.
    //
    // The caption note stays, because it says the thing the flag cannot: the
    // flag is a binary that reads "synthetic", and these posts are not. The
    // art is a model's; the voice is a person's.
    body.post = [withAsk(c.text, a.kind, ' '), aiNote(a), tagLine(c.tags, 5)].filter(Boolean).join(' ').slice(0, 2200)
    body.tikTokOptions = { visibility: 'public', isAIGenerated: true }
  } else if (platform === 'youtube') {
    body.post = [withAsk(c.text, a.kind), tagLine(c.tags, 5)].filter(Boolean).join('\n\n').slice(0, 5000)
    body.youTubeOptions = { title: (c.title || `${a.reference || 'Verse Arcade'} · Verse Arcade`).slice(0, 100), visibility: 'public', shorts: true, madeForKids: false, containsSyntheticMedia: true }
  } else if (platform === 'facebook') {
    body.post = [withAsk(c.text, a.kind), aiNote(a), tagLine(c.tags, 2)].filter(Boolean).join('\n\n').slice(0, 5000)
    // A Reel where one is allowed (it is the surface Facebook shows to
    // strangers); over the ceiling, a plain video post on the page rather
    // than a refusal — Facebook rejected the quiz and a 91-second story as
    // Reels on the first real day. Unknown length is treated as short.
    // A NOTE is never a Reel — it is a photo, and asking Facebook to make a
    // Reel out of a JPG is a refusal rather than a post.
    const reels = !photo && !(a.seconds && a.seconds > FACEBOOK_REEL_MAX_SECONDS)
    body.faceBookOptions = { reels, title: (copy.hook || a.reference || 'Verse Arcade').slice(0, 255) }
  } else if (platform === 'x') {
    // 280 characters, and now none of them are a URL — the link is the first
    // comment, so the whole budget belongs to the words, the note and the
    // tags. Composed rather than run through withAsk, because the model's
    // words are what get shortened to fit and the ask and the note never do.
    const tail = [aiNote(a), tagLine(c.tags, 2)].filter(Boolean).join(' ')
    const ask = callToAction(a.kind)
    let lead = dropLinkSentence(c.text ?? '').replace(/\s+/g, ' ').trim()
    const words = lead.split(' ').filter(Boolean)
    while (words.length > 1 && [words.join(' '), ask, tail].join(' ').length > 280) words.pop()
    lead = words.join(' ')
    body.post = [lead, ask, tail].filter(Boolean).join(' ').slice(0, 280)
  } else if (platform === 'threads') {
    // Threads: 500 characters, no AI flag on the API so the caption says it,
    // two tags at most (Threads treats a tag as a topic). Its link lives in
    // the profile's bio — Ayrshare has no Threads comment endpoint.
    body.post = [withAsk(c.text, a.kind), aiNote(a), tagLine(c.tags, 2)].filter(Boolean).join('\n\n').slice(0, 500)
  } else if (platform === 'pinterest') {
    // Pinterest is search: the title carries the reference and what the pin
    // is, the description (500) the words somebody would type, and the cover
    // is the frame Pinterest shows before play — required for a video pin,
    // same size as the video. A NOTE is already a still, so it carries no
    // thumbnail at all: `thumbNail` is Pinterest's poster for something that
    // PLAYS, and handing one to an image pin describes a frame of a video
    // that does not exist. `link` is the pin's DESTINATION rather than
    // caption text (tapping a pin is following it), so it keeps the tracked
    // URL while the description has none.
    body.post = [withAsk(c.text, a.kind), aiNote(a), tagLine(c.tags, 3)].filter(Boolean).join('\n\n').slice(0, 500)
    body.pinterestOptions = { title: (c.title || `${a.reference || 'Verse Arcade'} · Daily Bible Verse`).slice(0, 100), link: siteLink(platform), thumbNail: photo ? undefined : a.cover, altText: [`${a.reference || 'A Bible verse'}, read aloud over a painted road — Verse Arcade`.slice(0, 500)] }
  } else if (platform === 'snapchat') {
    // 160 characters, hard, and everything here is ordered by what must
    // survive it: the AI disclosure first (Spotlight's review rejected the
    // first verse as "undisclosed AI-generated content"), then the words,
    // then the short ask, then a tag if there is room. What gets shortened
    // is the MODEL'S WORDS, cut at a word boundary — a slice(0, 160) over
    // the whole thing ended the post halfway through the word "share".
    const note = aiNote(a)
    const ask = callToAction(a.kind, true)
    const tags = tagLine(c.tags, 2)
    let room = 160 - note.length - ask.length - 2
    let lead = dropLinkSentence(c.text ?? '').replace(/\s+/g, ' ').trim()
    if (lead.length + tags.length + 1 <= room) room -= tags.length + 1
    if (lead.length > room) {
      // Whole SENTENCES while they fit — "What he sent" followed by the ask
      // is a word boundary and still reads as a sentence someone cut in
      // half. Only if the first sentence alone is too long is it trimmed to
      // a word.
      const sentences = lead.match(/[^.!?]+[.!?]*/g) ?? [lead]
      let kept = ''
      for (const one of sentences) { if ((kept + one).trim().length > room) break; kept += one }
      lead = kept.trim() || (room > 0 ? lead.slice(0, room).replace(/\s+\S*$/, '').replace(/[\s,;:—-]+$/, '') : '')
    }
    const fits = [note, lead, ask, tags].filter(Boolean).join(' ')
    body.post = (fits.length <= 160 ? fits : [note, lead, ask].filter(Boolean).join(' ')).slice(0, 160)
    body.snapChatOptions = { spotlight: true }
  } else {
    // Instagram, same as TikTok above: the flag AND the note. The flag was
    // briefly dropped here too, on the same mistaken premise, and Meta never
    // published a reach penalty for it in the first place.
    body.post = [withAsk(c.text, a.kind), aiNote(a), tagLine(c.tags, 5)].filter(Boolean).join('\n\n').slice(0, 2200)
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
