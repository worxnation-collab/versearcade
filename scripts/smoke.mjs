// smoke — plays the real app once, end to end, against the PRODUCTION build.
//
// CLAUDE.md's oldest rule is "verify by running it, not by reading it": the bugs
// that have shipped here were state and persistence bugs a green build never
// saw. This is the smallest version of that rule a machine can hold:
//   1. a seeded guest lands on Play;
//   2. plays the daily drop, RELOADING mid-run (the run must resume, not
//      re-deal — the lock in QuizRunner);
//   3. reaches the result, and the play is on disk afterwards (streak, plays);
//   4. every tab and a few lazy screens render, with no page error anywhere.
// It needs `npm run build` first and a Chromium (`npx playwright install
// chromium` in CI; the container's own elsewhere). Keyless LOCAL mode, so no
// backend and nothing is written anywhere but the browser.
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const PORT = 4179
const BASE = `http://127.0.0.1:${PORT}`
const fail = (msg) => { console.error(`SMOKE FAIL: ${msg}`); process.exitCode = 1; throw new Error(msg) }

const server = spawn('node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
const stop = () => { try { server.kill() } catch { /* already gone */ } }
process.on('exit', stop)

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASE)).ok) return } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  fail('vite preview never came up')
}

const PROFILE = {
  id: 'local-smoke', username: 'smoke_test', displayName: 'smoke_test', avatarEmoji: '📖',
  xp: 0, level: 1, currentStreak: 0, longestStreak: 0, streakFreezes: 2, lastPlayedOn: null, totalPlays: 0,
  soundEnabled: false, hapticsEnabled: false, reduceMotion: true, onboarded: true, avatarBorder: 'default',
}

let browser
try {
  await waitForServer()
  browser = await chromium.launch(process.env.PW_EXECUTABLE ? { executablePath: process.env.PW_EXECUTABLE } : {})
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
  await ctx.addInitScript((p) => {
    if (localStorage.getItem('va.profile')) return
    localStorage.setItem('va.profile', JSON.stringify(p))
    localStorage.setItem('va.settings', JSON.stringify({ state: { tutorialSeen: true, soundEnabled: false, musicEnabled: false, reduceMotion: true, tipsSeen: ['play', 'battle', 'study', 'church', 'you'], firstDropTourSeen: true }, version: 0 }))
  }, PROFILE)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`))

  // 1. Play.
  await page.goto(`${BASE}/play`)
  await page.getByText('Today’s Drop').first().waitFor({ timeout: 15000 }).catch(() => fail('Play tab never showed the daily drop'))

  // 2. The run, with a reload in the middle.
  await page.goto(`${BASE}/play/run`)
  await page.getByRole('button', { name: /start the clock/ }).click({ timeout: 15000 })
  const answer = async (n) => {
    const opt = page.locator('[data-option]:not([disabled])').first()
    await opt.waitFor({ timeout: 15000 }).catch(() => fail(`question ${n} never showed its options`))
    await opt.click()
    await page.getByRole('button', { name: /Next question|See my score/ }).click({ timeout: 10000 })
  }
  await answer(1)
  await answer(2)
  await page.reload()
  if (!page.url().includes('/play/run')) fail(`a reload mid-run left the run (${page.url()})`)
  await answer(3)
  await answer(4)
  await answer(5)
  await page.waitForURL(/\/play\/result/, { timeout: 15000 }).catch(() => fail('the run never reached its result'))
  // A first play ends on what tomorrow holds (TomorrowCard).
  await page.locator('[data-tomorrow]').waitFor({ timeout: 10000 }).catch(() => fail('a first play ended without the Tomorrow card'))
  await page.locator('[data-send-verse]').waitFor({ timeout: 5000 }).catch(() => fail('a first play ended without the send-the-verse card'))

  // 3. It was recorded.
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('va.profile') || '{}'))
  if (saved.totalPlays !== 1) fail(`expected 1 play on disk, found ${saved.totalPlays}`)
  if (saved.currentStreak !== 1) fail(`expected a 1-day streak on disk, found ${saved.currentStreak}`)
  await page.reload()
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('va.profile') || '{}'))
  if (after.totalPlays !== 1) fail('the play did not survive a reload')

  // 4. Every tab and some lazy screens render.
  for (const path of ['/battle', '/study', '/church', '/you', '/arcade', '/bible', '/journal', '/play/trivia']) {
    await page.goto(`${BASE}${path}`)
    await page.waitForTimeout(1200)
    const text = (await page.evaluate(() => document.body.innerText)).trim()
    if (text.length < 20) fail(`${path} rendered blank`)
    if (page.url() === `${BASE}/`) fail(`${path} bounced to the landing page`)
  }
  if (errors.length) fail(`page errors:\n${errors.join('\n')}`)
  console.log('smoke: Play → run (with a reload) → result → saved → 8 screens, no page errors')
} finally {
  await browser?.close()
  stop()
}
