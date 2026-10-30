// Offline WRITES, end to end (lib/outbox.ts): a day online against a stubbed
// backend, then offline — open a Bible chapter, keep a verse, say a prayer —
// then back online. Asserts each screen draws from the device's copy at once
// (no ~7s postgrest retry), the three writes wait in va.outbox, and the
// reconnect sends exactly those three and empties it. Same setup as
// scripts/offline.mjs:
//
//   VITE_SUPABASE_URL=https://stubproj.supabase.co VITE_SUPABASE_ANON_KEY=stubkey \
//     npx vite build --outDir /tmp/dist-stub
//   npx vite preview --outDir /tmp/dist-stub --port 4182 &
//   node scripts/offline-writes.mjs /tmp
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
  else if (/rpc\/(mark_bible_progress|set_verse_favorite|record_prayer|record_arcade_play)$/.test(u.pathname)) { submits.push(u.pathname.split('/').pop() + ' ' + route.request().postData()); body = JSON.stringify({ ok: true, awarded: 10, today: 1, cap: 3 }) }
  else if (u.pathname.endsWith('/rpc/submit_play')) { submits.push(JSON.parse(route.request().postData())); body = JSON.stringify({ already_played: false, xp_earned: 50, xp: 950, level: 6, current_streak: 5, leveled_up: false }) }
  else if (u.pathname.startsWith('/rest/v1/') && !u.pathname.includes('/rpc/')) body = '[]'
  await route.fulfill({ status: 200, contentType: 'application/json', body })
})

const page = await ctx.newPage()
const B = `http://localhost:${PORT}`
await page.goto(`${B}/play`); await page.waitForTimeout(2500)
await page.goto(`${B}/bible`); await page.waitForTimeout(2500)
offline = true
// Chapter opened offline: how long until its verses show?
let t0 = Date.now()
await page.goto(`${B}/bible/John/3`)
await page.locator('button[aria-label^="John 3:16"]').waitFor({ timeout: 12000 }).then(() => console.log(`offline chapter: verses in ${Date.now() - t0}ms`)).catch(() => fail('offline chapter never drew'))
await page.locator('button[aria-label^="John 3:16"]').click()
await page.locator('button[aria-pressed]').first().click({ timeout: 5000 }).catch(() => fail('no keep button'))
await page.waitForTimeout(800)
// A prayer said offline.
await page.goto(`${B}/you?pray=1`)
await page.getByRole('button', { name: /./ }).filter({ hasText: /Thanks|thank|Grat|Morning|Worry|Help|Someone/i }).first().click({ timeout: 8000 }).catch(() => fail('no occasion'))
await page.getByRole('button', { name: /^Amen$/ }).click({ timeout: 8000 }).catch(() => fail('no Amen'))
await page.getByText(/saved on your phone/).waitFor({ timeout: 5000 }).then(() => console.log('offline prayer: saved-on-phone line shown')).catch(() => fail('offline prayer had no saved line'))
// Reload the Bible offline: the device copy, fast.
t0 = Date.now()
await page.goto(`${B}/bible`)
await page.waitForFunction(() => /[1-9][\d,]*\s*verses? opened/.test(document.body.innerText), null, { timeout: 12000 })
  .then(() => console.log(`offline Bible: shows the device's marks in ${Date.now() - t0}ms`))
  .catch(() => fail('offline Bible never showed the chapter read offline'))
console.log('offline Bible says:', (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 90))
console.log('device keys:', await page.evaluate(() => Object.keys(localStorage).filter((k) => /bible|favorites/.test(k)).map((k) => k + '=' + localStorage.getItem(k).slice(0, 80))))
console.log('outbox:', await page.evaluate(() => (JSON.parse(localStorage.getItem('va.outbox') || '[]')).map((e) => e.key)))
// Back online.
offline = false
await page.evaluate(() => window.dispatchEvent(new Event('online')))
await page.waitForTimeout(3000)
console.log('sent on reconnect:', submits)
if (submits.length !== 3) fail(`expected 3 writes sent on reconnect, got ${submits.length}`)
const left = await page.evaluate(() => localStorage.getItem('va.outbox'))
if (left !== '[]') fail('outbox not empty after reconnect: ' + left)
else console.log('outbox empty after reconnect')
await browser.close()
