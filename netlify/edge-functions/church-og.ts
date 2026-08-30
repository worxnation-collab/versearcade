import type { Config, Context } from 'https://edge.netlify.com'

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
// nothing here a visitor to the page couldn't already see.
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

async function loadChurch(id: string): Promise<{ name: string; city: string | null; region: string | null } | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON) return null
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/churches?id=eq.${encodeURIComponent(id)}&select=name,city,region&limit=1`,
      {
        headers: { apikey: SUPABASE_ANON, authorization: `Bearer ${SUPABASE_ANON}` },
        signal: ctl.signal,
      },
    )
    if (!res.ok) return null
    const rows = await res.json()
    return Array.isArray(rows) && rows[0]?.name ? rows[0] : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export default async function churchOg(request: Request, context: Context): Promise<Response | void> {
  const id = new URL(request.url).pathname.split('/')[2] ?? ''
  // A bad id is the SPA's problem, not ours — it draws its own "couldn't find
  // that church". Bail before spending a database call on it.
  if (!UUID.test(id)) return

  const res = await context.next()
  if (!res.headers.get('content-type')?.includes('text/html')) return res

  const church = await loadChurch(id)
  if (!church) return res

  const where = [church.city, church.region].filter(Boolean).join(', ')
  const title = attr(`${church.name} on Verse Arcade`)
  const desc = attr(
    `${where ? `${where} · ` : ''}One Bible verse a day, the same one for everybody. ` +
      `Play for ${church.name} — giving costs you nothing, and it's how the building grows.`,
  )
  const url = attr(new URL(request.url).href)

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

  const headers = new Headers(res.headers)
  headers.delete('content-length')
  return new Response(html, { status: res.status, headers })
}

export const config: Config = { path: '/church/*' }
