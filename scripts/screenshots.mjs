#!/usr/bin/env node
// App Store / Play Store screenshots, driven out of the real app.
//
// Apple rejects a screenshot whose pixel dimensions aren't one of the sizes it
// accepts for the slot you upload it into, and it rejects it AFTER you've filled
// the rest of the listing in — so the size is the part that has to be exact, and
// the part this script guarantees. A viewport of W x H at deviceScaleFactor 3
// screenshots at exactly 3W x 3H, so each device below is chosen to land on an
// accepted size, and every file is re-measured from its own PNG header at the
// end. Nothing is scaled or padded after the fact: a resized screenshot is a
// blurry screenshot.
//
//   iPhone 6.9"  1320 x 2868  — the REQUIRED set (App Store Connect also
//                               accepts 1290 x 2796 in this slot)
//   iPhone 6.5"  1242 x 2688  — optional slot, and what the Play Store listing
//                               reuses (docs/PLAY-STORE-SUBMISSION.md)
//
// It runs the app in LOCAL mode (no Supabase keys — `npm run dev` with no
// .env.local, the documented way to work on this app), which is why it can play
// a whole daily drop with no account and no network: the account wall stands
// down in a keyless build (`useAccountLocked()`), so every surface a screenshot
// wants is reachable. Screens that are a guest wall in a keyless build (Battle,
// Church) are deliberately NOT in the list — a padlock is a bad first
// impression, not a feature.
//
// The daily drop's five questions are the same five for everybody on a date, so
// the run is played TWICE: a throwaway "learn" pass reads which option the app
// marks correct, and the capture pass plays those answers back in a fresh
// context. One answer is thrown on purpose — the teach card a wrong answer
// shows is the whole no-shame promise, and it's the one shot that has to be in
// the set.
//
// Usage:
//   node scripts/screenshots.mjs                 # starts its own dev server
//   node scripts/screenshots.mjs --url http://localhost:5173
//   node scripts/screenshots.mjs --device 6.9    # one size only
//   node scripts/screenshots.mjs --out /tmp/shots
//
// The browser is Playwright's Chromium. CHROMIUM_PATH overrides the executable
// (containers here ship one at /opt/pw-browsers/chromium that doesn't match the
// version playwright expects to download).

import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// ── args ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? fallback : argv[i + 1]
}
const OUT = arg('out', join(ROOT, 'screenshots'))
const ONLY_DEVICE = arg('device', null)
const URL_ARG = arg('url', null)
const PORT = Number(arg('port', 5179))

// ── devices ───────────────────────────────────────────────────────────────────
// width/height are CSS pixels; every one is x3 on capture. Keep the multiply in
// the comment so a future edit can't quietly land on a size Apple refuses.
const DEVICES = [
  { id: '6.9', dir: 'iphone-6.9', width: 440, height: 956, expect: [1320, 2868] },
  { id: '6.5', dir: 'iphone-6.5', width: 414, height: 896, expect: [1242, 2688] },
]

// ── the player these screenshots are of ───────────────────────────────────────
// A real-looking guest: a few weeks in, mid-level, nothing bought. Everything
// here is what the app itself would have written; nothing is faked into a
// number the app can't produce.
const yesterdayLocal = () => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const PROFILE = {
  id: 'local-screenshots',
  username: 'Hannah',
  displayName: 'Hannah',
  avatarEmoji: '🕊️',
  xp: 4820,
  // Must be the level `levelInfo` derives from that xp — the card's bar reads
  // the curve while the stat tile reads this field, so a made-up number puts
  // two different levels on one screenshot.
  level: 10,
  currentStreak: 23,
  longestStreak: 31,
  streakFreezes: 2,
  // Yesterday, so finishing the run in the capture pass continues the streak
  // (24 days) instead of announcing "streak started" under a card that says 23.
  lastPlayedOn: yesterdayLocal(),
  totalPlays: 96,
  soundEnabled: false,
  hapticsEnabled: true,
  reduceMotion: false,
  onboarded: true,
  avatarBorder: 'default',
  avatarBadge: null,
  // A generated starter render (public/skins/starter_fem_sand_chestnut.png) —
  // the drawn SVG fallback is deliberately faceless and reads as unfinished art
  // in a store listing. Any figure/tone/hair here must be a combination that
  // actually shipped a PNG.
  avatarCharacter: { figure: 'fem', skin: 'sand', hair: 'chestnut', robe: 'linen', armor: {} },
  sharedDays: [],
  ownedItems: [],
  ownedSkins: [],
  xpBoosts: 1,
  pet: null,
}

// Everything that pops over the app unbidden: the music unlock banner, the "get
// the iPhone app" bubble (advertising the App Store inside an App Store
// screenshot), the tutorial, the install prompt. All of them are one-time
// notices a real player has already dismissed by day 23.
const SETTINGS = {
  state: {
    soundEnabled: false,
    musicEnabled: false,
    hapticsEnabled: false,
    tutorialSeen: true,
    installPromptDismissed: true,
    inventorySeen: true,
    inventoryNudgeDismissed: true,
    characterPromptDismissed: true,
    appNudgeDone: true,
  },
  version: 0,
}
const MUSIC = {
  state: {
    introSeen: true,
    unlocked: ['morning', 'fortress', 'cloister', 'scriptorium', 'sanctuary', 'grace', 'heights', 'joyful'],
  },
  version: 0,
}

// Where this player has been in their Bible. Without it the Bible screenshot
// says "1 verse opened · <0.1%", which is a picture of an empty app rather than
// of the feature. Chapter numbers must be real ones (the reader counts verses
// per chapter out of data/bible/structure), so keep these inside each book.
const CHAPTERS_READ = {
  Genesis: 12,
  Psalms: 40,
  Proverbs: 10,
  Isaiah: 9,
  Matthew: 10,
  John: 21,
  Romans: 8,
  Philippians: 4,
  James: 5,
}
const BIBLE_MARKS = (() => {
  const at = new Date().toISOString()
  const chapters = {}
  for (const [book, upTo] of Object.entries(CHAPTERS_READ)) {
    for (let c = 1; c <= upTo; c++) chapters[`${book}|${c}`] = at
  }
  return {
    chapters,
    studied: {
      'John 3:16': at,
      'Psalm 23:1': at,
      'Romans 8:28': at,
      'Philippians 4:13': at,
      'Isaiah 40:31': at,
      'James 1:5': at,
    },
  }
})()

const seed = async (ctx) => {
  await ctx.addInitScript(
    ([p, s, m, bible]) => {
      localStorage.setItem('va.profile', JSON.stringify(p))
      localStorage.setItem('va.settings', JSON.stringify(s))
      localStorage.setItem('va.music', JSON.stringify(m))
      // The bible store keys its local marks per account id.
      localStorage.setItem(`va.bible.${p.id}`, JSON.stringify(bible))
    },
    [PROFILE, SETTINGS, MUSIC, BIBLE_MARKS],
  )
}

// ── the dev server ────────────────────────────────────────────────────────────
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function reachable(url) {
  try {
    const res = await fetch(url, { method: 'GET' })
    return res.ok
  } catch {
    return false
  }
}

async function startServer() {
  const url = `http://localhost:${PORT}`
  if (await reachable(url)) return { url, stop: () => {} }
  const child = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: false,
  })
  for (let i = 0; i < 60; i++) {
    await wait(500)
    if (await reachable(url)) return { url, stop: () => child.kill('SIGTERM') }
  }
  child.kill('SIGTERM')
  throw new Error(`dev server never came up on ${url}`)
}

// ── the run ───────────────────────────────────────────────────────────────────
const READ_BUTTON = /start the clock/i
const NEXT_BUTTON = /next question|see my score|see (your )?(score|result)|finish/i

/** The four answer buttons of the question on screen, in order. */
const optionButtons = (page) =>
  page.$$('main button, body button').then((all) =>
    Promise.all(
      all.map(async (h) => ({ h, text: (await h.innerText()).replace(/\s+/g, ' ').trim() })),
    ).then((xs) => xs.filter((x) => /^[A-D] /.test(x.text))),
  )

const settle = async (page, ms = 700) => {
  await page.waitForTimeout(ms)
}

/**
 * Throwaway pass: play the drop answering blind, and read back which option the
 * app marks with a ✅. The daily questions are deterministic for the date, so
 * the capture pass can play these answers for real.
 */
async function learnAnswers(ctx, base) {
  const page = await ctx.newPage()
  await page.goto(`${base}/play/run`, { waitUntil: 'networkidle' })
  await settle(page, 900)
  await page.getByRole('button', { name: READ_BUTTON }).click()
  const answers = []
  for (let q = 0; q < 5; q++) {
    await settle(page)
    const opts = await optionButtons(page)
    if (!opts.length) break
    const prompt = await page.evaluate(() => document.body.innerText.slice(0, 200))
    await opts[0].h.click()
    await settle(page)
    const after = await optionButtons(page)
    const right = after.find((o) => o.text.includes('✅'))
    answers.push({
      // "C upstairs ✅" → "upstairs": match by TEXT in the capture pass, so a
      // reshuffled option order can't silently answer the wrong thing.
      label: right ? right.text.replace(/^[A-D] /, '').replace(/\s*✅\s*/, '').trim() : null,
      prompt: prompt.slice(0, 60),
    })
    const next = page.getByRole('button', { name: NEXT_BUTTON }).first()
    if (await next.count()) await next.click()
  }
  await page.close()
  return answers
}

// ── shots ─────────────────────────────────────────────────────────────────────
// Order is the order they go into App Store Connect. The first three are the
// pitch: what today is, what you read, what it asks.
const WRONG_ON = 4 // question index answered wrong on purpose — the teach card
const QUESTION_SHOT_ON = 2 // two correct behind it, so the combo pill is up

async function capture(page, dir, name) {
  const file = join(dir, `${name}.png`)
  await page.screenshot({ path: file })
  return file
}

async function shoot(ctx, base, dir, answers) {
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const files = []

  // 1 — the Play tab: today's verse, today's trivia, the road, the compass.
  await page.goto(`${base}/play`, { waitUntil: 'networkidle' })
  await settle(page, 2200)
  files.push(await capture(page, dir, '01-today'))

  // 2 — the verse itself, before the clock starts. Reading is free.
  await page.goto(`${base}/play/run`, { waitUntil: 'networkidle' })
  await settle(page, 1200)
  files.push(await capture(page, dir, '02-the-verse'))

  // 3..5 — play the run. A question mid-combo, the teach card a wrong answer
  // shows, and the recap at the end.
  await page.getByRole('button', { name: READ_BUTTON }).click()
  for (let q = 0; q < 5; q++) {
    await settle(page)
    const opts = await optionButtons(page)
    if (!opts.length) break
    // The question shot is taken a few questions in, so the header carries
    // points and a live combo rather than a row of zeros.
    if (q === QUESTION_SHOT_ON) files.push(await capture(page, dir, '03-question'))
    const want = answers[q]?.label
    const right = want ? opts.find((o) => o.text.replace(/^[A-D] /, '').trim() === want) : null
    const pick =
      q === WRONG_ON
        ? opts.find((o) => o !== right && (!want || o.text.replace(/^[A-D] /, '').trim() !== want)) ?? opts[0]
        : right ?? opts[0]
    await pick.h.click()
    await settle(page, 900)
    if (q === WRONG_ON) files.push(await capture(page, dir, '04-every-answer-teaches'))
    const next = page.getByRole('button', { name: NEXT_BUTTON }).first()
    if (await next.count()) await next.click()
  }
  await page.waitForURL(/\/play\/result/, { timeout: 15000 }).catch(() => {})
  await settle(page, 5200) // let the count-up finish and the confetti fall clear of the verse
  files.push(await capture(page, dir, '05-recap'))

  // 6 — the library. The whole Study tab is one room with a librarian in it.
  await page.goto(`${base}/study`, { waitUntil: 'networkidle' })
  await settle(page, 2600)
  files.push(await capture(page, dir, '06-study'))

  // 7 — you, at full length, over the player card.
  await page.goto(`${base}/you`, { waitUntil: 'networkidle' })
  await settle(page, 2600)
  files.push(await capture(page, dir, '07-you'))

  // 8 — the Upper Room, the one place that belongs to the player alone. Scrolled
  // so the room fills the frame instead of sitting under the card.
  // scrollIntoViewIfNeeded is a no-op here — the heading is already partly on
  // screen under the card, which is exactly the framing this shot is fixing.
  const roomHeading = page.getByText(/your upper room/i).first()
  await roomHeading.evaluate((el) => el.scrollIntoView({ block: 'start' }))
  await page.evaluate(() => window.scrollBy(0, -8))
  await settle(page, 1400)
  files.push(await capture(page, dir, '08-upper-room'))

  // 9 — the arcade. Three machines, and nothing in it touches anybody's rank.
  await page.goto(`${base}/arcade`, { waitUntil: 'networkidle' })
  await settle(page, 2000)
  files.push(await capture(page, dir, '09-arcade'))

  // 10 — the Bible: 66 books, and it says what you've read.
  await page.goto(`${base}/bible`, { waitUntil: 'networkidle' })
  await settle(page, 1200)
  // Open the Old Testament fold: closed, the page is four rows and a lot of
  // cream. The books are the feature — 39 of them, shaded by how far in you are.
  const testament = page.getByText(/old testament/i).first()
  if (await testament.count()) await testament.click()
  await settle(page, 1200)
  files.push(await capture(page, dir, '10-bible'))

  await page.close()
  return { files, errors }
}

// ── PNG size check ────────────────────────────────────────────────────────────
// Read width/height straight out of the IHDR chunk rather than trusting the
// viewport maths — this is the one thing the App Store rejects on.
function pngSize(file) {
  const b = readFileSync(file)
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file}: not a PNG`)
  return [b.readUInt32BE(16), b.readUInt32BE(20)]
}

// ── main ──────────────────────────────────────────────────────────────────────
const devices = ONLY_DEVICE ? DEVICES.filter((d) => d.id === ONLY_DEVICE) : DEVICES
if (!devices.length) {
  console.error(`unknown --device ${ONLY_DEVICE}; try ${DEVICES.map((d) => d.id).join(' or ')}`)
  process.exit(1)
}

const server = URL_ARG ? { url: URL_ARG, stop: () => {} } : await startServer()
let browser
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
} catch (e) {
  server.stop()
  console.error(
    `${e.message}\n\nNo Chromium to drive. Run \`npx playwright install chromium\`, or point\nCHROMIUM_PATH at one you already have.`,
  )
  process.exit(1)
}

let bad = 0
try {
  for (const device of devices) {
    const dir = join(OUT, device.dir)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })

    const ctxOpts = {
      viewport: { width: device.width, height: device.height },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    }

    const learnCtx = await browser.newContext(ctxOpts)
    await seed(learnCtx)
    const answers = await learnAnswers(learnCtx, server.url)
    await learnCtx.close()

    const ctx = await browser.newContext(ctxOpts)
    await seed(ctx)
    const { files, errors } = await shoot(ctx, server.url, dir, answers)
    await ctx.close()

    console.log(`\n${device.dir} — ${device.expect.join(' x ')}`)
    for (const f of files) {
      const [w, h] = pngSize(f)
      const ok = w === device.expect[0] && h === device.expect[1]
      if (!ok) bad++
      const kb = Math.round(statSync(f).size / 1024)
      console.log(`  ${ok ? '✓' : '✗'} ${f.slice(OUT.length + 1)}  ${w} x ${h}  ${kb}KB`)
    }
    if (errors.length) console.log(`  page errors: ${[...new Set(errors)].join(' | ')}`)
  }
} finally {
  await browser.close()
  server.stop()
}

if (bad) {
  console.error(`\n${bad} screenshot(s) came out the wrong size — do not upload these.`)
  process.exit(1)
}
console.log(`\nAll screenshots are the size App Store Connect expects. → ${OUT}`)
