// App Store screenshots, captured by driving the real app.
//
//   npm run dev            # LOCAL mode, no keys — see CLAUDE.md
//   npm run shots          # writes docs/app-store/screenshots/*.png
//
// Apple wants 6.7" iPhone at 1290 x 2796, which is a 430 x 932 CSS viewport at
// deviceScaleFactor 3 — so these come out at the exact pixel size with real type
// rendering rather than an upscale of a small capture. Every file is checked
// against that size at the end; a wrong one is a build-time failure here rather
// than a rejected upload twenty minutes into App Store Connect.
//
// Three things about it are worth knowing before changing it:
//
// - It plays the run TWICE. The daily five are the same five for everybody and a
//   started run is locked (QuizRunner's runId), so there is no way to know which
//   option is right before answering one. The first pass answers blind and reads
//   the ✅ off each reveal; the second clears the guest's play record, replays the
//   same day and answers four right and ONE wrong on purpose — the teach card and
//   the end-of-run "things you now know" list are the app's whole no-shame pitch
//   and both need a miss in them.
// - The seeded profile is a GUEST in a keyless build, so nothing here touches a
//   server and no screenshot can leak a real player. The Bible marks are seeded
//   under both `va.bible.guest` and `va.bible.<id>` because store/bible.ts keys on
//   the profile id when there is one.
// - The account-gated screens (Church, Battle, the Prayer Wall) are deliberately
//   not shot: in a keyless build they draw their own "create an account" card,
//   which is honest and a poor advertisement. Shoot those signed in, on a phone.

import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const OUT = process.env.SHOTS_OUT || 'docs/app-store/screenshots'
const BASE = process.env.SHOTS_BASE || 'http://localhost:5173'
// The container's Chromium is not the one this playwright build downloads.
const EXE = process.env.CHROMIUM_PATH || undefined

fs.mkdirSync(OUT, { recursive: true })

const profile = {
  id: 'guest-shots', username: 'Sam', displayName: 'Sam', avatarEmoji: '🕊️',
  avatarCharacter: { figure: 'masc', skin: 'sand', hair: 'chestnut' },
  xp: 14820, level: 22, currentStreak: 23, longestStreak: 31, streakFreezes: 2,
  lastPlayedOn: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
  totalPlays: 61, soundEnabled: false, hapticsEnabled: false, reduceMotion: false,
  onboarded: true, avatarBorder: 'default', avatarBadge: null, cardBackground: null,
  pet: 'lamb', sharedDays: [], ownedItems: [], ownedSkins: [],
}

// Eighteen short books read all the way through: enough wax on the Seals page to
// show what it is, and 67 chapters, which is past the 60-chapter border too.
const READ = {
  Obadiah: 1, Philemon: 1, '2 John': 1, '3 John': 1, Jude: 1, Jonah: 4, Ruth: 4,
  Haggai: 2, Nahum: 3, Titus: 3, Malachi: 4, James: 5, Ephesians: 6,
  Philippians: 4, Colossians: 4, '1 Peter': 5, Galatians: 6, Ecclesiastes: 12,
}

const browser = await chromium.launch(EXE ? { executablePath: EXE } : {})
const ctx = await browser.newContext({
  viewport: { width: 430, height: 932 }, deviceScaleFactor: 3,
  isMobile: true, hasTouch: true,
})
const page = await ctx.newPage()

await page.addInitScript(({ p, read }) => {
  localStorage.setItem('va.profile', JSON.stringify(p))
  localStorage.setItem('va.firstSeen', String(Date.now() - 30 * 86400000))
  localStorage.setItem('va.map.seen', '1')
  localStorage.setItem('va.saveNudge', '1')
  localStorage.setItem('va.settings', JSON.stringify({
    state: {
      soundEnabled: false, hapticsEnabled: false, reduceMotion: false, volume: 0.6,
      musicEnabled: false, musicVolume: 0.5, characterPromptDismissed: true,
      tutorialSeen: true, tipsSeen: ['play', 'battle', 'study', 'you', 'church', 'home'],
      installPromptDismissed: true, inventorySeen: true, inventoryNudgeDismissed: true,
      appNudgeSnoozedAt: Date.now(), appNudgeDone: true, readingTranslation: 'kjv',
      readingTextScale: 1, prayerShowShape: false, prayerVoice: 'female',
    }, version: 0,
  }))
  const chapters = {}
  for (const [b, n] of Object.entries(read)) for (let c = 1; c <= n; c++) chapters[`${b}|${c}`] = true
  const marks = JSON.stringify({ chapters, studied: {} })
  localStorage.setItem('va.bible.guest', marks)
  localStorage.setItem(`va.bible.${p.id}`, marks)
}, { p: profile, read: READ })

const wait = (ms) => page.waitForTimeout(ms)
const shot = async (name) => {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
  console.log('  ✓', name)
}
// The road's reward rail centres the next prize on load, which scrolls the page.
const go = async (route, ms = 2800) => {
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded' })
  await wait(ms)
  await page.evaluate(() => window.scrollTo(0, 0))
  await wait(500)
}

const options = () => page.locator('button:not([disabled])').filter({ hasText: /^[ABCD]/ })
const nextBtn = () => page.getByRole('button', { name: /Next question|See my score|Finish/i })

async function clearRun() {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    localStorage.removeItem('va.plays')
    localStorage.removeItem('va.run.guest')
    localStorage.removeItem('va.chestDate')
  })
}

// Pass 1: answer blind, read the ✅ off each reveal.
async function learnAnswers() {
  await clearRun()
  await go('/play/run', 2600)
  await page.getByText(/start the clock/i).click()
  await wait(1000)
  const key = []
  for (let q = 0; q < 5; q++) {
    if (!(await options().count())) break
    await options().first().click()
    await wait(1100)
    key.push(await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((e) => e.innerText.includes('✅'))
      return b ? b.innerText.replace(/[✅💡]/g, '').replace(/^[ABCD]\s*/, '').trim() : null
    }))
    if (await nextBtn().count()) { await nextBtn().first().click(); await wait(1100) }
  }
  return key
}

// Pass 2: four right, the second one wrong, shooting as it goes.
async function playForReal(key) {
  await clearRun()
  await go('/play/run', 2600)
  await shot('02-verse-read')
  await page.getByText(/start the clock/i).click()
  await wait(1200)
  for (let q = 0; q < 5; q++) {
    if (!(await options().count())) break
    if (q === 0) await shot('03-question')
    const n = await options().count()
    let pick = 0
    for (let i = 0; i < n; i++) {
      const t = (await options().nth(i).innerText()).replace(/^[ABCD]\s*/, '').trim()
      const right = key[q] && t === key[q]
      if (q === 1 ? !right : right) { pick = i; break }
    }
    await options().nth(pick).click()
    await wait(1400)
    if (q === 1) await shot('04-teach')
    if (await nextBtn().count()) { await nextBtn().first().click(); await wait(1400) }
  }
  await wait(2600)
  await page.evaluate(() => window.scrollTo(0, 0))
  await shot('05-result')
}

console.log('capturing →', OUT)
await go('/play', 3200); await shot('01-play-tab')
await playForReal(await learnAnswers())
await go('/arcade', 2600); await shot('06-arcade')
await go('/you', 3200); await shot('07-you-room')
await go('/study', 3000); await shot('08-study-library')
await go('/bible', 2800); await shot('09-bible')
await go('/bible/seals', 3000); await shot('10-seals')
await go('/wardrobe', 2800)
{
  const shelf = page.getByText(/Earned by reading/i)
  if (await shelf.count()) { await shelf.first().click(); await wait(1400) }
}
await shot('11-wardrobe')
await go('/pilgrimage', 3200); await shot('12-road')
await go('/journal', 2800); await shot('13-journal')

await browser.close()

// A screenshot at the wrong size is refused by App Store Connect, so check here.
let bad = 0
for (const f of fs.readdirSync(OUT).filter((f) => f.endsWith('.png'))) {
  const head = fs.readFileSync(path.join(OUT, f)).subarray(16, 24)
  const w = head.readUInt32BE(0)
  const h = head.readUInt32BE(4)
  if (w !== 1290 || h !== 2796) { console.error(`  ✗ ${f} is ${w}x${h}, not 1290x2796`); bad++ }
}
if (bad) { console.error(`${bad} screenshot(s) at the wrong size`); process.exit(1) }
console.log('all screenshots 1290x2796 ✓')
