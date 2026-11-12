// visual-audit — the rollout check (CLAUDE.md, "Before calling new art or a
// feature done") as far as a machine can hold it.
//
// Against the PRODUCTION build (`npm run build` first), keyless LOCAL mode:
//   1. a guest wearing the layered wardrobe on EBONY skin, once per figure,
//      visits the main screens at 390px;
//   2. the landing carousel is shot on every slide MID-transition (120ms) and
//      at rest — the overlapping-captions bug only showed mid-slide;
//   3. it FAILS on a page error, an <img> that failed to load, or a page wider
//      than the phone (sideways scroll — the grid min-width trap).
// Screenshots land in art/.visual-audit/ (gitignored; CI uploads them) for a
// person — or the daily review session — to LOOK at. Passing this is not the
// same as looking right; it catches what is mechanically broken.
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const PORT = 4183
const BASE = `http://127.0.0.1:${PORT}`
const OUT = 'art/.visual-audit'
const W = 390

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const server = spawn('node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
const stop = () => { try { server.kill() } catch { /* gone */ } }
process.on('exit', stop)

const problems = []
const shots = []

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASE)).ok) return } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('vite preview never came up')
}

const outfit = (fig) => ({
  hair: { id: fig === 'fem' ? 'hair_long_straight' : 'hair_short', color: '#1E1410' },
  top: { id: 'top_tshirt', color: '#4F8FD6' },
  legs: { id: 'legs_jeans', color: '#2A3F7A' },
  shoes: { id: 'shoes_sneakers', color: '#F2ECE0' },
})

const profile = (fig) => ({
  id: `local-audit-${fig}`, username: `audit_${fig}`, displayName: `audit_${fig}`, avatarEmoji: '📖',
  avatarCharacter: { skin: 'ebony', robe: 'linen', hair: 'black', figure: fig, armor: {}, outfit: outfit(fig) },
  xp: 1200, level: 6, currentStreak: 3, longestStreak: 5, streakFreezes: 2, lastPlayedOn: null, totalPlays: 6,
  soundEnabled: false, hapticsEnabled: false, reduceMotion: true, onboarded: true, avatarBorder: 'default',
})

const SETTINGS = { state: { tutorialSeen: true, soundEnabled: false, musicEnabled: false, reduceMotion: true, tipsSeen: ['play', 'battle', 'study', 'church', 'you'], firstDropTourSeen: true }, version: 0 }

const ROUTES = ['/play', '/battle', '/study', '/church', '/you', '/you?customize=1', '/arcade', '/bible', '/journal', '/wardrobe', '/pray']

/** What is mechanically wrong on the page right now. */
async function inspect(page, label) {
  const r = await page.evaluate((w) => {
    const broken = [...document.images]
      .filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute('src'))
      .map((i) => i.getAttribute('src'))
    const wide = document.documentElement.scrollWidth
    // The widest element poking past the phone, to say WHAT overflowed.
    let culprit = null
    if (wide > w + 1) {
      for (const el of document.body.querySelectorAll('*')) {
        const b = el.getBoundingClientRect()
        if (b.right > w + 1 && getComputedStyle(el).position !== 'fixed') {
          culprit = `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''} (right ${Math.round(b.right)})`
          break
        }
      }
    }
    return { broken: [...new Set(broken)], wide, culprit }
  }, W)
  for (const src of r.broken) problems.push(`${label}: image failed to load: ${src}`)
  if (r.wide > W + 1) problems.push(`${label}: page is ${r.wide}px wide on a ${W}px phone — ${r.culprit ?? 'unknown element'}`)
}

async function shoot(page, name) {
  const file = `${OUT}/${name}.png`
  await page.screenshot({ path: file })
  shots.push(file)
}

let browser
try {
  await waitForServer()
  browser = await chromium.launch(process.env.PW_EXECUTABLE ? { executablePath: process.env.PW_EXECUTABLE } : {})

  // 1. The app, once per figure, dark skin.
  for (const fig of ['masc', 'fem']) {
    const ctx = await browser.newContext({ viewport: { width: W, height: 844 }, hasTouch: true })
    await ctx.addInitScript(([p, s]) => {
      if (localStorage.getItem('va.profile')) return
      localStorage.setItem('va.profile', JSON.stringify(p))
      localStorage.setItem('va.settings', JSON.stringify(s))
    }, [profile(fig), SETTINGS])
    const page = await ctx.newPage()
    page.on('pageerror', (e) => problems.push(`${fig} ${page.url().replace(BASE, '')}: page error: ${e.message}`))
    for (const route of ROUTES) {
      await page.goto(`${BASE}${route}`)
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.waitForTimeout(900)
      const label = `${fig} ${route}`
      if (page.url() === `${BASE}/`) problems.push(`${label}: bounced to the landing page`)
      await inspect(page, label)
      await shoot(page, `${fig}${route.replace(/[/?=]+/g, '_')}`)
    }
    await ctx.close()
  }

  // 2. The landing carousel, signed out, every slide mid-transition and at rest.
  const ctx = await browser.newContext({ viewport: { width: W, height: 844 }, hasTouch: true })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => problems.push(`landing: page error: ${e.message}`))
  await page.goto(`${BASE}/`)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(800)
  await inspect(page, 'landing')
  await shoot(page, 'landing_0_rest')
  const dots = page.locator('button[aria-label^="Show "]')
  const n = await dots.count()
  for (let i = 1; i < n + 1; i++) {
    await dots.nth(i % n).click()
    await page.waitForTimeout(120)
    await shoot(page, `landing_${i % n}_mid`)
    await page.waitForTimeout(900)
    await inspect(page, `landing slide ${i % n}`)
    await shoot(page, `landing_${i % n}_rest`)
  }
  await ctx.close()

  writeFileSync(`${OUT}/report.txt`, (problems.length ? problems.join('\n') : 'no mechanical problems') + `\n\n${shots.length} screenshots\n`)
  if (problems.length) {
    console.error(`VISUAL AUDIT: ${problems.length} problem(s)\n` + problems.join('\n'))
    process.exitCode = 1
  } else {
    console.log(`visual-audit: ${shots.length} screenshots in ${OUT}, no broken images, no sideways scroll, no page errors`)
  }
} finally {
  await browser?.close()
  stop()
}
