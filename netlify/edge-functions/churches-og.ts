import type { Config, Context } from 'https://edge.netlify.com'

// The link preview for /churches — the page sent to a pastor by text or email.
//
// Same reason church-og exists: index.html carries one static set of OG tags
// ("can you beat my score?"), which is the wrong card for an offer to a church
// leader. Unlike church-og this needs no database at all: the words are fixed,
// so there is nothing to wait on and nothing to fail. It still fails OPEN — a
// non-HTML response is passed through untouched.

const TITLE = 'Verse Arcade for Churches — your sermon, played all week'
const DESC =
  'Pick the verse you’re preaching on and your congregation plays it every day: a two-minute quiz ' +
  'that teaches with every answer. Founding Churches are free through Easter 2027.'

export default async function churchesOg(request: Request, context: Context): Promise<Response | void> {
  const res = await context.next()
  if (!res.headers.get('content-type')?.includes('text/html')) return res

  const url = new URL(request.url)
  const href = `${url.origin}/churches`
  const html = (await res.text())
    .replace(/<title>[^<]*<\/title>/, `<title>${TITLE}</title>`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${TITLE}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${DESC}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${href}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${TITLE}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${DESC}$2`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${DESC}$2`)

  const headers = new Headers(res.headers)
  headers.delete('content-length')
  return new Response(html, { status: res.status, headers })
}

export const config: Config = { path: '/churches' }
