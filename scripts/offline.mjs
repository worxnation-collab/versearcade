// Airplane mode, end to end: a day online against a stubbed backend, then the
// same device offline (the app's own files still load, as they do from a
// native build's bundle; every outside request fails), then back online.
// Asserts the three things that used to break: a signed-in launch reaches the
// Play tab, the church tab still shows the player's church, and a daily play
// finished offline is kept and sent by submit_play on reconnect.
//
//   VITE_SUPABASE_URL=https://stubproj.supabase.co VITE_SUPABASE_ANON_KEY=stubkey \
//     npx vite build --outDir /tmp/dist-stub
//   npx vite preview --outDir /tmp/dist-stub --port 4182 &
//   node scripts/offline.mjs /tmp
import { chromium } from 'playwright'
const PORT = '4182', SP = process.argv[2]
const UID = '11111111-1111-1111-1111-111111111111', CHURCH = '22222222-2222-2222-2222-222222222222'
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800, aud: 'authenticated' })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'p@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
const profile = { id: UID, username: 'pat', display_name: null, avatar_emoji: '🙂', xp: 900, level: 6, current_streak: 4, longest_streak: 9, streak_freezes: 1, last_played_on: '2026-10-29', total_plays: 30, sound_enabled: false, haptics_enabled: false, reduce_motion: true, onboarded: true, avatar_border: null, avatar_badge: null, card_background: null, xp_boosts: 0, denomination: 'baptist' }
let offline = false
const submits = []
const fail = (m) => { console.log('FAIL', m); process.exitCode = 1 }
const browser = await chromium.launch(process.env.PW_EXECUTABLE ? { executablePath: process.env.PW_EXECUTABLE } : {})
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } })
await ctx.addInitScript(([s]) => {
  if (!localStorage.getItem('sb-stubproj-auth-token')) localStorage.setItem('sb-stubproj-auth-token', JSON.stringify(s))
  if (!localStorage.getItem('va.settings')) localStorage.setItem('va.settings', JSON.stringify({ state: { tutorialSeen: true, soundEnabled: false, musicEnabled: false, reduceMotion: true, tipsSeen: ['play', 'battle', 'study', 'church', 'you'], firstDropTourSeen: true }, version: 0 }))
}, [session])
await ctx.route(/^https?:\/\/(?!localhost)/, async (route) => {
  const u = new URL(route.request().url())
  if (offline) return route.abort('internetdisconnected')
  if (!u.host.includes('stubproj')) return route.abort()
  let body = 'null'
  if (u.pathname.startsWith('/auth/v1/user')) body = JSON.stringify(user)
  else if (u.pathname === '/rest/v1/profiles') body = JSON.stringify(route.request().headers()['accept']?.includes('vnd.pgrst.object') ? profile : [profile])
  else if (u.pathname.endsWith('/rpc/get_my_church')) body = JSON.stringify({ church: { id: CHURCH, name: 'St Mark', lat: 40, lng: -75, xp: 1200, level: 3, members: 4 }, available: 0, my_given: 0, givers: [] })
  else if (u.pathname.endsWith('/rpc/submit_play')) { submits.push(JSON.parse(route.request().postData())); body = JSON.stringify({ already_played: false, xp_earned: 50, xp: 950, level: 6, current_streak: 5, leveled_up: false }) }
  else if (u.pathname.startsWith('/rest/v1/') && !u.pathname.includes('/rpc/')) body = '[]'
  await route.fulfill({ status: 200, contentType: 'application/json', body })
})
const page = await ctx.newPage()
// Day online.
await page.goto(`http://localhost:${PORT}/play`); await page.waitForTimeout(2500)
await page.goto(`http://localhost:${PORT}/church`); await page.waitForTimeout(2500)
// Airplane mode.
offline = true
await ctx.setOffline(false)
const t0 = Date.now()
await page.goto(`http://localhost:${PORT}/play`)
await page.getByText('Today’s Drop').first().waitFor({ timeout: 4000 }).then(() => console.log(`offline launch: Play tab in ${Date.now() - t0}ms`)).catch(() => fail('offline launch never reached the Play tab'))
await page.goto(`http://localhost:${PORT}/church`); await page.waitForTimeout(9000)
const churchTxt = await page.evaluate(() => document.body.innerText)
if (/St Mark/.test(churchTxt)) console.log('offline church tab: shows St Mark'); else fail('offline church tab: ' + churchTxt.slice(0, 120).replace(/\s+/g, ' '))
await page.screenshot({ path: `${SP}/church-offline.png` })
// Play the drop offline.
await page.goto(`http://localhost:${PORT}/play/run`)
await page.getByRole('button', { name: /start the clock/ }).click({ timeout: 15000 })
for (let n = 1; n <= 5; n++) {
  const opt = page.locator('[data-option]:not([disabled])').first()
  await opt.waitFor({ timeout: 15000 }); await opt.click()
  await page.getByRole('button', { name: /Next question|See my score/ }).click({ timeout: 10000 })
}
await page.waitForURL(/\/play\/result/, { timeout: 20000 }).catch(() => fail('offline run never reached its result'))
await page.locator('[data-play-pending]').waitFor({ timeout: 8000 }).then(() => console.log('offline result: pending note shown')).catch(() => fail('offline result: no pending note'))
await page.waitForTimeout(3000); await page.screenshot({ path: `${SP}/result-offline.png`, fullPage: true })
// Reload offline: still played.
await page.goto(`http://localhost:${PORT}/play/run`); await page.waitForTimeout(9000)
console.log('offline reload of /play/run lands on', new URL(page.url()).pathname)
console.log('outbox:', await page.evaluate(() => localStorage.getItem('va.pendingPlays')))
// Back online.
offline = false
await page.evaluate(() => window.dispatchEvent(new Event('online')))
await page.waitForTimeout(3000)
console.log('submit_play calls after reconnect:', submits.length, submits[0] ? `date=${submits[0].p_drop_date} score=${submits[0].p_score}` : '')
console.log('outbox after:', await page.evaluate(() => localStorage.getItem('va.pendingPlays')))
await browser.close()
