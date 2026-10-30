// Request waterfall per tab on a slow phone: every Supabase call answered by a
// stub after a fixed latency (400ms ≈ a 3G round trip), each logged with its
// start/end and the WAVE it sits in — a request that could only start after
// another one finished. Waves, not request count, are what a slow phone waits on.
//
//   VITE_SUPABASE_URL=https://stubproj.supabase.co VITE_SUPABASE_ANON_KEY=stubkey \
//     npx vite build --outDir /tmp/dist-stub
//   npx vite preview --outDir /tmp/dist-stub --port 4182 &
//   node scripts/waterfall.mjs 4182 400 [/play,/church,...]
//
// The stub answers null to most RPCs, so a chain that only exists when real
// data comes back is invisible unless it is given a canned answer below
// (get_my_church is, so the church tab's second hop shows).
import { chromium } from 'playwright'
const PORT = process.argv[2] ?? '4182'
const LAT = Number(process.argv[3] ?? 400)
const UID = '11111111-1111-1111-1111-111111111111'
const CHURCH = '22222222-2222-2222-2222-222222222222'
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800, aud: 'authenticated' })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'p@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
const profile = {
  id: UID, username: 'pat', display_name: null, avatar_emoji: '🙂', xp: 900, level: 6, current_streak: 4, longest_streak: 9,
  streak_freezes: 1, last_played_on: '2026-10-29', total_plays: 30, sound_enabled: false, haptics_enabled: false, reduce_motion: true,
  onboarded: true, avatar_border: null, avatar_badge: null, card_background: null, xp_boosts: 0, denomination: 'baptist', church_id: CHURCH,
}
const tabs = (process.argv[4] ?? '/play,/church,/battle,/study,/you').split(',')
const browser = await chromium.launch(process.env.PW_EXECUTABLE ? { executablePath: process.env.PW_EXECUTABLE } : {})
for (const tab of tabs) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } })
  await ctx.addInitScript(([s]) => {
    localStorage.setItem('sb-stubproj-auth-token', JSON.stringify(s))
    localStorage.setItem('va.settings', JSON.stringify({ state: { tutorialSeen: true, soundEnabled: false, musicEnabled: false, reduceMotion: true, tipsSeen: ['play', 'battle', 'study', 'church', 'you'], firstDropTourSeen: true }, version: 0 }))
  }, [session])
  const log = []
  let t0 = 0
  await ctx.route('https://stubproj.supabase.co/**', async (route) => {
    const u = new URL(route.request().url())
    const name = (u.pathname.includes('/rest/v1/plays') ? u.search.slice(0,60) + ' ' : '') + u.pathname.replace('/rest/v1/rpc/', 'rpc:').replace('/rest/v1/', 'rest:').replace('/functions/v1/', 'fn:')
    const start = Date.now() - t0
    await new Promise((r) => setTimeout(r, LAT))
    log.push({ name, start, end: Date.now() - t0 })
    let body = 'null'
    if (u.pathname.startsWith('/auth/v1/user')) body = JSON.stringify(user)
    else if (u.pathname.startsWith('/auth/v1/token')) body = JSON.stringify(session)
    else if (u.pathname === '/rest/v1/profiles') body = JSON.stringify(route.request().headers()['accept']?.includes('vnd.pgrst.object') ? profile : [profile])
    else if (u.pathname.endsWith('/rpc/get_my_church')) body = JSON.stringify({ church: { id: CHURCH, name: 'St Mark', lat: 40, lng: -75, xp: 1200, level: 3, members: 4, verified: true }, available: 0, my_given: 0, givers: [] })
    else if (u.pathname.startsWith('/rest/v1/') && !u.pathname.includes('/rpc/')) body = '[]'
    await route.fulfill({ status: 200, contentType: 'application/json', body })
  })
  await ctx.route(/realtime/, (r) => r.abort())
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  t0 = Date.now()
  await page.goto(`http://localhost:${PORT}${tab}`)
  await page.waitForTimeout(LAT * 14)
  // Waves: a request is in wave n+1 if it started after some wave-n request ended.
  log.sort((a, b) => a.start - b.start)
  const wave = []
  for (const r of log) {
    let w = 0
    for (let i = 0; i < wave.length; i++) if (log[i].end <= r.start) w = Math.max(w, wave[i] + 1)
    wave.push(w)
  }
  const last = Math.max(0, ...log.map((r) => r.end))
  console.log(`\n=== ${tab}: ${log.length} requests, ${Math.max(0, ...wave) + 1} waves, settled at ${last}ms ${errs.length ? 'ERR ' + errs.slice(0, 2).join(' | ') : ''}`)
  log.forEach((r, i) => console.log(`  w${wave[i]} ${String(r.start).padStart(5)}-${String(r.end).padStart(5)} ${r.name}`))
  await ctx.close()
}
await browser.close()
