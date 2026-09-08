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
export const KINDS: Kind[] = ['verse', 'story', 'quiz', 'challenge', 'challenge2', 'own', 'note']
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
/** The three formats no human voice touches: they go where volume is not held against you. */
const AUTOMATED: Kind[] = ['quiz', 'challenge', 'challenge2']
const KINDS_OFF: Partial<Record<Platform, Kind[]>> = {
  // TikTok is on a WARM-UP, and for a different reason than the three below.
  // Fifteen posts over four days drew seven views between them — uniformly
  // 0-2 each, across five formats, every one published. Content varying that
  // much and performing identically at zero is an account with no
  // distribution, not a format problem. Five posts a day from a two-week-old
  // account with no followers, every one through a third-party API, is itself
  // the shape of the thing being filtered. So it gets the two posts a person
  // actually made until there is traction to measure, and the automated three
  // go to the networks that are at least delivering.
  tiktok: [...AUTOMATED, 'note'],
  x: ['note'],
  snapchat: ['note'],
  threads: ['quiz', 'note'],
  // The volume-sensitive three: the VOICED posts and the operator's own clips
  // only. See above.
  youtube: [...AUTOMATED, 'note'],
  facebook: [...AUTOMATED],
  instagram: [...AUTOMATED, 'note'],
  // A search engine: the verse video, and the note's card — which is a static,
  // readable, evergreen image, the exact shape a pin is found by. It gave up
  // the story pin to fund the note and got a better pin back for it.
  pinterest: [...AUTOMATED, 'own', 'story'],
}
void NOTE_ONLY_ON

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
/** The same note for a post whose voice is a person's: the art is still painted by a model, and only that is claimed. */
export const AI_NOTE_ART = 'AI-generated art; the voice is our own.'
const aiNote = (a: PostArgs) => (a.voiced ? AI_NOTE_ART : AI_NOTE)

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
  return [t, callToAction(kind)].filter(Boolean).join(join)
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
    // The note moves from the FLAG into the CAPTION, and dropping one without
    // adding the other is the mistake this was two minutes from making.
    // TikTok's caption never carried it — the flag was the whole disclosure —
    // so removing the flag alone would have left TikTok the one network here
    // saying nothing. Snapchat's Spotlight review has already rejected a verse
    // from this very account as "undisclosed AI-generated content", so the
    // failure is not hypothetical, and it is asymmetric: a rejected post is
    // recoverable, a strike on an account with no distribution is not.
    body.post = [withAsk(c.text, a.kind, ' '), aiNote(a), tagLine(c.tags, 5)].filter(Boolean).join(' ').slice(0, 2200)
    // NO `isAIGenerated`, and that is a decision rather than an omission.
    //
    // TikTok requires the AIGC label only for content that "shows
    // realistic-looking scenes or people", and its guidelines name two
    // exemptions this account sits inside twice over: "using artistic styles,
    // like anime", and "using generic text-to-speech (TTS) narration, when the
    // TTS isn't a recognizable voice of a known individual". Every figure here
    // is an illustration and every synthetic voice is generic Gemini TTS —
    // and the two voiced posts a day are a real person, which needs no label
    // at all. So the flag was never required.
    //
    // What it cost is real: TikTok shipped an AIGC preference slider in
    // November 2025 that lets a viewer dial labelled content DOWN in their For
    // You feed, and it cannot be switched off. It is the only place across
    // eight networks where the label itself carries a mechanical reach
    // penalty. Fifteen posts over four days drew seven views in total with it
    // set, alongside an off-platform link in the caption (since removed) —
    // neither is proof, and both were the suppressors we could control.
    //
    // This is NOT a retreat from disclosure. YouTube keeps
    // `containsSyntheticMedia` below, because YouTube states outright that
    // disclosing "won't limit a video's audience or impact its eligibility to
    // earn money" — free there, costly here, so the answer differs by network.
    // The visible AI note stays in the caption where a caption carries one,
    // and the honest line about the voice ("AI-generated art; the voice is our
    // own") is untouched — and now says it on TikTok too, in the caption. If a
    // post ever carries a realistic-looking person or a cloned voice, the flag
    // goes back on: that is what it is for, and words are not a substitute for
    // it on content the rules actually cover.
    body.tikTokOptions = { visibility: 'public' }
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
    // same size as the video. `link` is the pin's DESTINATION rather than
    // caption text (tapping a pin is following it), so it keeps the tracked
    // URL while the description has none.
    body.post = [withAsk(c.text, a.kind), aiNote(a), tagLine(c.tags, 3)].filter(Boolean).join('\n\n').slice(0, 500)
    body.pinterestOptions = { title: (c.title || `${a.reference || 'Verse Arcade'} · Daily Bible Verse`).slice(0, 100), link: siteLink(platform), thumbNail: a.cover, altText: [`${a.reference || 'A Bible verse'}, read aloud over a painted road — Verse Arcade`.slice(0, 500)] }
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
    // Instagram, and the same trade as TikTok's above — with weaker evidence,
    // stated so nobody mistakes it for a measured result. Meta publishes no
    // reach or monetization penalty for the AI label (its enforcement targets
    // UNORIGINAL content, not AI), so unlike TikTok there is no known
    // mechanism costing us anything here. What holds is the other half:
    // Meta's labelling is aimed at photorealistic and deceptive media, and
    // illustrated characters over a painted road are neither — so the flag is
    // not required, and Instagram sits at zero views alongside TikTok.
    //
    // The note goes into the caption for the reason it did there: this branch
    // never carried one, so the flag was the whole disclosure, and dropping it
    // alone would leave Instagram saying nothing. Snapchat's Spotlight review
    // has already rejected a verse from this account as "undisclosed
    // AI-generated content".
    body.post = [withAsk(c.text, a.kind), aiNote(a), tagLine(c.tags, 5)].filter(Boolean).join('\n\n').slice(0, 2200)
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
