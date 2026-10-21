// API.Bible's Fair Use Management System. Its terms require an app to report
// each piece of licensed text it actually SHOWS, using the `fumsToken` that
// came back with it. A plain GET to the f3 endpoint is the documented native
// path (the browser tracker script is for pages, and loading a third-party
// script into the WKWebView is a bigger ask than one image request).
//
// Nothing here identifies a person: the device id is a random value made on
// this device, the session id is new every launch, and no user id is sent.

const DEVICE_KEY = 'va.fums.device'
const sessionId = randomId()
const sent = new Set<string>()

function randomId(): string {
  try { return crypto.randomUUID() } catch { return Math.random().toString(36).slice(2) + Date.now().toString(36) }
}

function deviceId(): string {
  try {
    const have = localStorage.getItem(DEVICE_KEY)
    if (have) return have
    const id = randomId()
    localStorage.setItem(DEVICE_KEY, id)
    return id
  } catch { return sessionId }
}

/** Report licensed text as displayed. Once per token per launch; never throws. */
export function reportFums(token: string | undefined | null) {
  if (!token || sent.has(token) || typeof Image === 'undefined') return
  sent.add(token)
  const q = new URLSearchParams({ t: token, dId: deviceId(), sId: sessionId })
  const img = new Image()
  img.referrerPolicy = 'no-referrer'
  img.src = `https://fums.api.bible/f3?${q}`
}
