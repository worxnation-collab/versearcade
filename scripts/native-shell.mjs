// The App Store build's native-only paths, driven in a FAKED iOS shell.
//
// Capacitor decides it is on iOS from `window.webkit.messageHandlers.bridge`,
// and sends every plugin call through `Capacitor.nativePromise` /
// `nativeCallback` once `Capacitor.PluginHeaders` names the plugin. So an init
// script that defines those three things IS the native shell, as far as the
// app can tell: every plugin call lands here, is logged, and is answered the
// way the real plugin answers (or fails the way a real failure does).
//
// Paths: Sign in with Apple (system sheet → token; cancelled; unavailable →
// in-app browser) and the deep link back (appUrlOpen → completeNativeOAuth);
// push permission (granted → APNs token saved; denied → the iOS Settings
// line); Restore purchases; the room postcard (Filesystem → Share); and a
// tapped push notification opening its screen. Same stub build as
// scripts/offline.mjs, plus a RevenueCat key so StoreKit paths exist:
//
//   VITE_SUPABASE_URL=https://stubproj.supabase.co VITE_SUPABASE_ANON_KEY=stubkey \
//     VITE_REVENUECAT_IOS_KEY=appl_stub npx vite build --outDir /tmp/dist-native
//   npx vite preview --outDir /tmp/dist-native --port 4183 &
//   node scripts/native-shell.mjs
import { chromium } from 'playwright'
const PORT = process.env.PORT || '4183'
const B = `http://localhost:${PORT}`
const UID = '11111111-1111-1111-1111-111111111111'
const CH_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', CH_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800, aud: 'authenticated' })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'p@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
const profile = { id: UID, username: 'pat', display_name: null, avatar_emoji: '🙂', xp: 900, level: 6, current_streak: 4, longest_streak: 9, streak_freezes: 1, last_played_on: '2026-10-29', total_plays: 30, sound_enabled: false, haptics_enabled: false, reduce_motion: true, onboarded: true, avatar_border: null, avatar_badge: null, card_background: null, xp_boosts: 0, denomination: 'baptist', owned_skins: [] }
const SETTINGS = { state: { tutorialSeen: true, soundEnabled: false, musicEnabled: false, reduceMotion: true, tipsSeen: ['play', 'battle', 'study', 'church', 'you'], firstDropTourSeen: true }, version: 0 }

let failed = 0
const fail = (m) => { console.log('FAIL', m); failed++ }
const ok = (m) => console.log('ok  ', m)

// The fake bridge. `cfg` picks how each plugin answers for this scenario.
function shell(cfg) {
  const M = {
    App: ['addListener', 'removeListener', 'removeAllListeners', 'getLaunchUrl', 'getInfo', 'getState', 'exitApp', 'minimizeApp'],
    StatusBar: ['setStyle', 'setBackgroundColor', 'show', 'hide', 'setOverlaysWebView', 'getInfo'],
    SplashScreen: ['hide', 'show'],
    Keyboard: ['addListener', 'removeAllListeners', 'setAccessoryBarVisible', 'setResizeMode', 'hide', 'show', 'setScroll'],
    Haptics: ['impact', 'notification', 'vibrate', 'selectionStart', 'selectionChanged', 'selectionEnd'],
    PushNotifications: ['addListener', 'removeListener', 'removeAllListeners', 'checkPermissions', 'requestPermissions', 'register', 'unregister', 'getDeliveredNotifications', 'removeAllDeliveredNotifications'],
    LocalNotifications: ['addListener', 'removeAllListeners', 'checkPermissions', 'requestPermissions', 'schedule', 'getPending', 'cancel', 'createChannel', 'areEnabled', 'checkExactNotificationSetting'],
    Browser: ['addListener', 'removeAllListeners', 'open', 'close'],
    SignInWithApple: ['authorize'],
    Share: ['share', 'canShare'],
    Filesystem: ['writeFile', 'readFile', 'deleteFile', 'getUri', 'stat', 'mkdir'],
    Purchases: ['addListener', 'configure', 'isConfigured', 'logIn', 'logOut', 'getProducts', 'purchaseStoreProduct', 'restorePurchases', 'getCustomerInfo', 'setLogLevel', 'getOfferings', 'syncPurchases'],
  }
  const log = (window.__calls = [])
  const listeners = (window.__listeners = {})
  let nextId = 1
  window.__fire = (plugin, event, data) => (listeners[plugin + ':' + event] || []).forEach((cb) => cb(data))
  const answer = {
    'App.getLaunchUrl': () => ({ url: null }),
    'App.getInfo': () => ({ name: 'Verse Arcade', id: 'com.versearcade.app', build: '40', version: '1.4.0' }),
    'App.getState': () => ({ isActive: true }),
    'PushNotifications.checkPermissions': () => ({ receive: window.__push }),
    'PushNotifications.requestPermissions': () => { window.__push = cfg.pushAnswer || 'granted'; return { receive: window.__push } },
    'PushNotifications.register': () => { setTimeout(() => window.__fire('PushNotifications', 'registration', { value: 'apns-token-abc' }), 30) },
    'LocalNotifications.checkPermissions': () => ({ display: 'granted' }),
    'LocalNotifications.requestPermissions': () => ({ display: 'granted' }),
    'LocalNotifications.getPending': () => ({ notifications: [] }),
    'LocalNotifications.areEnabled': () => ({ value: true }),
    'SignInWithApple.authorize': () => {
      if (cfg.apple === 'cancel') throw Object.assign(new Error('The operation couldn’t be completed. (com.apple.AuthenticationServices.AuthorizationError error 1001.)'), { code: '1001' })
      if (cfg.apple === 'unavailable') throw new Error('The operation couldn’t be completed. (com.apple.AuthenticationServices.AuthorizationError error 1000.)')
      return { response: { identityToken: 'apple-id-token', authorizationCode: 'c', user: 'u', email: null, givenName: null, familyName: null } }
    },
    'Share.canShare': () => ({ value: true }),
    'Share.share': () => { if (cfg.share === 'cancel') throw new Error('Share canceled'); return { activityType: 'com.apple.UIKit.activity.SaveToCameraRoll' } },
    'Filesystem.writeFile': (o) => ({ uri: 'file:///var/mobile/Caches/' + o.path }),
    'Purchases.isConfigured': () => ({ isConfigured: window.__rcConfigured === true }),
    'Purchases.configure': () => { window.__rcConfigured = true },
    'Purchases.getProducts': (o) => {
      if (cfg.products === false) return { products: [] }
      const all = [
        { identifier: 'com.versearcade.app.patron_founding', priceString: '$9.99' },
        { identifier: 'com.versearcade.app.church_verified_monthly', priceString: '$29.99' },
        { identifier: 'com.versearcade.app.church_verified_yearly', priceString: '$299.99' },
      ]
      return { products: all.filter((p) => (o.productIdentifiers || []).includes(p.identifier)).map((p) => ({ ...p, price: 1, currencyCode: 'USD', title: 'x', description: 'x' })) }
    },
    'Purchases.restorePurchases': () => { if (cfg.restore === 'fail') throw new Error('Network error'); return { customerInfo: { allPurchasedProductIdentifiers: cfg.restore === 'owns' ? ['com.versearcade.app.patron_founding'] : [] } } },
  }
  window.webkit = { messageHandlers: { bridge: { postMessage() {} } } }
  window.Capacitor = {
    PluginHeaders: Object.entries(M).map(([name, ms]) => ({ name, methods: ms.map((m) => ({ name: m, rtype: m === 'addListener' ? 'callback' : 'promise' })) })),
    nativePromise(plugin, method, opts) {
      log.push(plugin + '.' + method)
      try { return Promise.resolve(answer[plugin + '.' + method]?.(opts || {}) ?? {}) } catch (e) { return Promise.reject(e) }
    },
    nativeCallback(plugin, method, opts, cb) {
      log.push(plugin + '.' + method + (opts?.eventName ? ':' + opts.eventName : ''))
      if (method === 'addListener') (listeners[plugin + ':' + opts.eventName] ||= []).push(cb)
      return Promise.resolve(String(nextId++))
    },
  }
  window.__push = cfg.push || 'prompt'
}

const browser = await chromium.launch(process.env.PW_EXECUTABLE ? { executablePath: process.env.PW_EXECUTABLE } : {})

async function open(cfg, { signedIn = true, path = '/play' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } })
  const rpcs = []
  await ctx.addInitScript(shell, cfg)
  await ctx.addInitScript(([s, st, signed]) => {
    if (signed && !localStorage.getItem('sb-stubproj-auth-token')) localStorage.setItem('sb-stubproj-auth-token', JSON.stringify(s))
    if (!localStorage.getItem('va.settings')) localStorage.setItem('va.settings', JSON.stringify(st))
  }, [session, SETTINGS, signedIn])
  await ctx.route(/^https?:\/\/(?!localhost)/, async (route) => {
    const u = new URL(route.request().url())
    if (!u.host.includes('stubproj')) return route.abort()
    rpcs.push(u.pathname.replace(/^\/(rest|auth|functions)\/v1\//, '') + (u.search && u.pathname.includes('token') ? u.search : ''))
    let body = 'null'
    if (u.pathname.startsWith('/auth/v1/token')) body = JSON.stringify(session)
    else if (u.pathname.startsWith('/auth/v1/authorize')) body = '{}'
    else if (u.pathname.startsWith('/auth/v1/user')) body = JSON.stringify(user)
    else if (u.pathname === '/rest/v1/profiles') body = JSON.stringify(route.request().headers()['accept']?.includes('vnd.pgrst.object') ? profile : [profile])
    else if (u.pathname.endsWith('/rpc/save_device_token')) body = 'null'
    else if (u.pathname.endsWith('/rpc/my_led_churches')) body = JSON.stringify([{ id: CH_A, name: 'Demo Church', verified: true }, { id: CH_B, name: 'Demo Chapel', verified: false }])
    else if (u.pathname.endsWith('/rpc/church_admin_settings')) { const b = JSON.parse(route.request().postData() || '{}'); body = JSON.stringify({ ok: true, name: b.p_church_id === CH_B ? 'Demo Chapel' : 'Demo Church', verified: b.p_church_id !== CH_B, giving_url: null, announcement: null }) }
    else if (u.pathname.endsWith('/rpc/church_entitlements')) body = JSON.stringify({ ok: true, church_leader: true, leader_look: 'classic-clergy', content_generation: false, custom_leader_avatar: false })
    else if (u.pathname.endsWith('/functions/v1/iap-fulfill')) body = JSON.stringify({ granted: cfg.restore === 'owns' ? ['cephas'] : [] })
    else if (u.pathname.startsWith('/rest/v1/') && !u.pathname.includes('/rpc/')) body = '[]'
    await route.fulfill({ status: 200, contentType: 'application/json', body })
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(B + path)
  await page.waitForTimeout(2000)
  const calls = () => page.evaluate(() => window.__calls)
  return { ctx, page, rpcs, calls, errors }
}
const text = (page) => page.evaluate(() => document.body.innerText)

// 0. The shell is recognised as iOS and boots.
{
  const { ctx, page, calls } = await open({})
  const plat = await page.evaluate(() => window.Capacitor.getPlatform())
  plat === 'ios' ? ok('shell reads as ios') : fail('platform is ' + plat)
  const c = await calls()
  c.includes('SplashScreen.hide') ? ok('splash hidden on boot') : fail('splash never hidden: ' + c.join(','))
  c.includes('App.addListener:appUrlOpen') ? ok('deep-link listener registered') : fail('no appUrlOpen listener')
  c.some((x) => x.startsWith('PushNotifications.requestPermissions')) ? fail('push permission asked on startup') : ok('no push prompt on startup')
  await ctx.close()
}

// 1. Sign in with Apple: system sheet → token → signed in, off the auth screen.
for (const apple of ['token', 'cancel', 'unavailable']) {
  const { ctx, page, rpcs, calls } = await open({ apple }, { signedIn: false, path: '/auth' })
  await page.getByRole('button', { name: /Sign in with Apple/ }).click()
  await page.waitForTimeout(1500)
  const c = await calls()
  const url = new URL(page.url())
  if (apple === 'token') {
    rpcs.some((r) => r.startsWith('token') && r.includes('id_token')) ? ok('apple sheet: token sent to signInWithIdToken') : fail('apple token never exchanged: ' + rpcs.join(' | '))
    url.pathname !== '/auth' ? ok(`apple sheet: left /auth for ${url.pathname}`) : fail('apple sheet: still on /auth after a token sign-in')
    c.includes('Browser.open') ? fail('apple sheet: browser opened after a good token') : ok('apple sheet: no browser')
  } else if (apple === 'cancel') {
    c.includes('Browser.open') ? fail('cancelled sheet opened a browser') : ok('cancelled sheet: nothing else opens')
    url.pathname === '/auth' ? ok('cancelled sheet: stays on /auth') : fail('cancelled sheet moved to ' + url.pathname)
  } else {
    c.includes('Browser.open') ? ok('sheet unavailable: falls back to the in-app browser') : fail('sheet unavailable: no fallback, calls ' + c.join(','))
    // The provider hands back to the bridge, which deep-links into the app.
    await page.evaluate((t) => window.__fire('App', 'appUrlOpen', { url: 'com.versearcade.app://auth/callback#access_token=' + t + '&refresh_token=r&expires_in=3600&token_type=bearer' }), jwt)
    await page.waitForTimeout(1500)
    const c2 = await calls()
    c2.includes('Browser.close') ? ok('deep link: in-app browser closed') : fail('deep link: browser left open')
    new URL(page.url()).pathname !== '/auth' ? ok('deep link: signed in and moved on to ' + new URL(page.url()).pathname) : fail('deep link: still on /auth')
  }
  await ctx.close()
}

// 1b. A provider error deep link (user backed out on Google's page).
{
  const { ctx, page, calls } = await open({ apple: 'unavailable' }, { signedIn: false, path: '/auth' })
  await page.getByRole('button', { name: /Sign in with Google/ }).click()
  await page.waitForTimeout(800)
  await page.evaluate(() => window.__fire('App', 'appUrlOpen', { url: 'com.versearcade.app://auth/callback?error=access_denied&error_description=User+cancelled' }))
  await page.waitForTimeout(1000)
  const c = await calls()
  c.includes('Browser.close') ? ok('provider error: in-app browser closed') : fail('provider error: browser left open over the app')
  ;/cancel/i.test(await text(page)) ? ok('provider error: reason shown on /auth') : fail('provider error: nothing said')
  await ctx.close()
}

// 2. Push permission from Settings: granted → token saved; denied → the iOS line.
for (const pushAnswer of ['granted', 'denied']) {
  const { ctx, page, rpcs } = await open({ pushAnswer })
  await page.goto(B + '/you')
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: /settings/i }).first().click()
  await page.waitForTimeout(600)
  const sw = page.getByRole('switch', { name: /Notes and news/ }).first()
  const has = await sw.count()
  if (!has) { fail('no notifications switch in Settings'); await ctx.close(); continue }
  await sw.click()
  await page.waitForTimeout(1200)
  if (pushAnswer === 'granted') {
    rpcs.some((r) => r.includes('save_device_token')) ? ok('push granted: APNs token saved') : fail('push granted: token never saved')
    ;(await sw.getAttribute('aria-checked')) === 'true' ? ok('push granted: switch on') : fail('push granted: switch still off')
  } else {
    ;/iOS Settings/.test(await text(page)) ? ok('push denied: points at iOS Settings') : fail('push denied: no explanation')
  }
  await ctx.close()
}

// 3. Restore purchases: owns → restored; nothing; StoreKit fails.
for (const restore of ['owns', 'none', 'fail']) {
  const { ctx, page } = await open({ restore })
  await page.goto(B + '/you?customize=1')
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: /^Skins/ }).first().click().catch(() => {})
  await page.waitForTimeout(500)
  const btn = page.getByRole('button', { name: /Restore purchases/ })
  if (!(await btn.count())) { fail('restore: no Restore purchases button in Customize → Skins'); await ctx.close(); continue }
  await btn.click()
  await page.waitForTimeout(1500)
  const t = await text(page)
  const want = { owns: /Restored 1 item/, none: /Nothing to restore/, fail: /couldn|could not|try again/i }[restore]
  want.test(t) ? ok(`restore ${restore}: ${t.match(want)[0]}`) : fail(`restore ${restore}: no outcome line`)
  await ctx.close()
}

// 4. The room postcard: written to the cache, handed to the share sheet.
for (const share of ['ok', 'cancel']) {
  const { ctx, page, calls, errors } = await open({ share })
  await page.goto(B + '/you')
  await page.waitForTimeout(2000)
  const btn = page.getByRole('button', { name: 'Share a postcard of your room' })
  if (!(await btn.count())) { fail('postcard: no button'); await ctx.close(); continue }
  await btn.click()
  await page.waitForTimeout(3000)
  const c = await calls()
  const t = await text(page)
  if (share === 'ok') {
    c.includes('Filesystem.writeFile') && c.includes('Share.share') ? ok('postcard: cache file → share sheet') : fail('postcard: calls ' + c.filter((x) => /File|Share/.test(x)).join(','))
  } else {
    ;/Couldn’t make a postcard/.test(t) ? fail('postcard: a cancelled share sheet reads as "couldn’t make one"') : ok('postcard: cancelling the sheet says nothing wrong')
  }
  if (errors.length) console.log('   page errors:', errors.slice(0, 2))
  await ctx.close()
}

// 5. A tapped push notification opens the screen it names; a bad url is ignored.
{
  const { ctx, page } = await open({ push: 'granted' })
  await page.evaluate(() => window.__fire('PushNotifications', 'pushNotificationActionPerformed', { actionId: 'tap', notification: { data: { url: '/mail' } } }))
  await page.waitForTimeout(1200)
  new URL(page.url()).pathname === '/mail' ? ok('push tap: opened /mail') : fail('push tap: landed on ' + new URL(page.url()).pathname)
  await page.evaluate(() => window.__fire('PushNotifications', 'pushNotificationActionPerformed', { actionId: 'tap', notification: { data: { url: 'https://evil.example/' } } }))
  await page.waitForTimeout(600)
  new URL(page.url()).host.startsWith('localhost') ? ok('push tap: off-site url ignored') : fail('push tap: followed an off-site url')
  await ctx.close()
}

// 6. A custom-scheme link that is NOT a sign-in (e.g. a share opened from Notes).
{
  const { ctx, page } = await open({})
  await page.evaluate(() => window.__fire('App', 'appUrlOpen', { url: 'com.versearcade.app://church/22222222-2222-2222-2222-222222222222' }))
  await page.waitForTimeout(1200)
  const p = new URL(page.url()).pathname
  p.startsWith('/church/') ? ok('scheme link: opened ' + p) : fail('scheme link com.versearcade.app://church/… ignored, still on ' + p)
  await ctx.close()
}

// 7. A leader of two churches reaches the second (0177), and the unverified one
//    offers the Verified Church plan through Apple.
{
  const { ctx, page } = await open({})
  await page.goto(B + `/church/${CH_A}/admin`)
  await page.waitForTimeout(2500)
  const pill = page.getByRole('button', { name: /Demo Chapel · not yet verified/ })
  if (!(await pill.count())) fail('two churches: no "You also lead" row on the first church\'s screen')
  else {
    ok('two churches: "You also lead" row shown')
    await pill.click()
    await page.waitForTimeout(2500)
    new URL(page.url()).pathname === `/church/${CH_B}/admin` ? ok('two churches: opened the second church\'s screen') : fail('two churches: landed on ' + new URL(page.url()).pathname)
    await page.getByText('Your page', { exact: true }).first().click().catch(() => {})
    await page.waitForTimeout(1500)
    ;(await page.getByRole('button', { name: /Subscribe with Apple/ }).count()) ? ok('unverified church: Apple plan offered') : fail('unverified church: no Apple plan offer')
    if (process.env.DEBUG) { console.log((await text(page)).slice(0, 1500)); }
  }
  await ctx.close()
}

await browser.close()
console.log(failed ? `\n${failed} failed` : '\nall native paths ok')
process.exitCode = failed ? 1 : 0
