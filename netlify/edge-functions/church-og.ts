import type { Config, Context } from 'https://edge.netlify.com'
// The one copy of the level curve and the building ladder. Imported, never
// restated: a preview that drew a chapel for a church the page draws as a
// cathedral would be a third place for the curve to drift.
import { churchLevelInfo, tierForLevel } from '../../src/features/church/levels.ts'

// Put the church's name on the link preview.
//
// WHY THIS EXISTS AT ALL. netlify.toml rewrites /* to index.html, and index.html
// carries one static set of OG tags ("Verse Arcade — can you beat my score?").
// So every church link pasted into a group chat, a church's Facebook page or a
// newsletter previewed as the same generic card with no church on it — for a
// page whose entire purpose is to travel through exactly those channels. The
// page was fine; the thing that actually gets shared was not.
//
// It reads `churches` straight through PostgREST rather than the RPC: the table
// is `for select using (true)` (0040), so the anon key is enough and there is
// nothing here a visitor to the page couldn't already see. The same is true of
// `church_profiles`, whose RLS returns a row only once it is PUBLISHED (0050) —
// so an unpublished church's preview simply carries no "This week" line.
//
// WHAT THE PREVIEW SAYS, and why (2026-10-21). The title is the church, where
// it is, and "on Verse Arcade" — the three things somebody scrolling a group
// chat needs to know it is their church and not an ad. The description leads
// with the church's OWN words where it has published any ("This week we're in
// John", its tagline, its service times) and ends on one line about what the
// page is. Nothing about a person: no member names, no head count of who
// played, no rank.
//
// THE IMAGE is a card pre-composited by `scripts/og-church-cards.mjs`: this
// church's building, at its real tier and in its real material, standing in
// the churchyard. 32 static JPEGs, picked here by lookup — no rendering at
// request time. There was no og:image at all before this, so every church link
// previewed as text.
//
// IT MUST FAIL OPEN. No env vars, no network, a slow database, an id that isn't
// a church — every one of those serves the untouched shell, which is a working
// page with a generic preview. A blank page would be worse than a dull card.

const SUPABASE_URL = Deno.env.get('VITE_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON = Deno.env.get('VITE_SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''

/** ~1.2s and we give up: a preview is worth less than the page loading. */
const TIMEOUT_MS = 1200

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Anything going into an attribute. The name is operator-vetted church data,
 *  not user input, but it lands inside `content="…"` and a stray quote would
 *  break the tag open. */
function attr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

interface ChurchRow { name: string; city: string | null; region: string | null; xp: number | null }
interface ProfileRow { skin: string | null; this_week: string | null; tagline: string | null; service_times: string | null }

/** The materials `scripts/og-church-cards.mjs` composed a card for, and the
 *  default an unknown or unset skin falls to — `DEFAULT_CHURCH_SKIN` in
 *  `src/features/church/skins.ts`. Keep the three lists together. */
const CARD_SKINS = new Set(['tile', 'classic', 'modern', 'glass'])
const DEFAULT_SKIN = 'tile'

async function rows<T>(path: string, signal: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SUPABASE_ANON, authorization: `Bearer ${SUPABASE_ANON}` },
      signal,
    })
    if (!res.ok) return null
    const out = await res.json()
    return Array.isArray(out) && out[0] ? (out[0] as T) : null
  } catch {
    return null
  }
}

/** The church and its published profile, in parallel, under one deadline. The
 *  profile is optional: a missing one is a preview without the church's words,
 *  never a failed one. */
async function loadChurch(id: string): Promise<{ church: ChurchRow; profile: ProfileRow | null } | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON) return null
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  const key = encodeURIComponent(id)
  try {
    const [church, profile] = await Promise.all([
      rows<ChurchRow>(`churches?id=eq.${key}&select=name,city,region,xp&limit=1`, ctl.signal),
      rows<ProfileRow>(`church_profiles?church_id=eq.${key}&select=skin,this_week,tagline,service_times&limit=1`, ctl.signal),
    ])
    return church?.name ? { church, profile } : null
  } finally {
    clearTimeout(timer)
  }
}

/** One line of somebody's plain text, safe to quote in a sentence. */
function line(s: string | null | undefined, max: number): string {
  const t = (s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

/** Previews cut a description off around here; ours ends on a whole word. */
const DESC_MAX = 200

export default async function churchOg(request: Request, context: Context): Promise<Response | void> {
  const id = new URL(request.url).pathname.split('/')[2] ?? ''
  // A bad id is the SPA's problem, not ours — it draws its own "couldn't find
  // that church". Bail before spending a database call on it.
  if (!UUID.test(id)) return

  const res = await context.next()
  if (!res.headers.get('content-type')?.includes('text/html')) return res

  const loaded = await loadChurch(id)
  if (!loaded) return res
  const { church, profile } = loaded

  const name = line(church.name, 90)
  const where = [church.city, church.region].map((x) => line(x, 40)).filter(Boolean).join(', ')
  const title = attr(`${name}${where ? `, ${where}` : ''} — on Verse Arcade`)

  // The church's own words first, if it has published any; then what the page
  // is. Each piece is dropped whole rather than cut mid-sentence.
  const own = [
    profile?.this_week ? `This week: ${line(profile.this_week, 120)}` : line(profile?.tagline, 120),
    profile?.service_times ? `Services: ${line(profile.service_times, 90)}` : '',
  ].filter(Boolean)
  const pitch = `Play the daily Bible verse with ${name} — free, and no account needed to look.`
  let descText = ''
  for (const piece of [...own, pitch]) {
    const next = descText ? `${descText} · ${piece}` : piece
    if (next.length <= DESC_MAX) descText = next
  }
  const desc = attr(descText || pitch.slice(0, DESC_MAX))
  const origin = new URL(request.url).origin
  const url = attr(new URL(request.url).href)

  const tier = tierForLevel(churchLevelInfo(Number(church.xp) || 0).level)
  const skin = profile?.skin && CARD_SKINS.has(profile.skin) ? profile.skin : DEFAULT_SKIN
  const image = attr(`${origin}/og/church/${skin}-${tier.id}.jpg`)
  const alt = attr(`${tier.name} — ${name} on Verse Arcade`)
  const imageTags =
    `<meta property="og:image" content="${image}" />` +
    `<meta property="og:image:width" content="1200" />` +
    `<meta property="og:image:height" content="630" />` +
    `<meta property="og:image:alt" content="${alt}" />` +
    `<meta name="twitter:image" content="${image}" />` +
    `<meta name="twitter:image:alt" content="${alt}" />`

  const html = (await res.text())
    // The tab title, not just the card: someone with the link open in a
    // background tab should be able to tell which church it is.
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${title}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${desc}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${title}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${desc}$2`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${desc}$2`)
    // A picture now, so the large card rather than the small square.
    .replace(/(<meta name="twitter:card" content=")[^"]*(")/, `$1summary_large_image$2`)
    .replace('</head>', `${imageTags}\n  </head>`)

  const headers = new Headers(res.headers)
  headers.delete('content-length')
  return new Response(html, { status: res.status, headers })
}

export const config: Config = { path: '/church/*' }
