// Records the promo walkthrough of the real app as JPEG frames (CDP
// screencast at 1080x1920), one folder per shot. Assembled by cut.sh.
//   node scripts/video/record.mjs <outDir> [shot,shot]
// Needs `npm run build` (keyless) and `npx vite preview --port 4173`.
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const OUT = process.argv[2]
const ONLY = process.argv[3]?.split(',')
const BASE = 'http://localhost:4173'
const exe = (() => {
  const d = fs.readdirSync('/opt/pw-browsers').find((x) => x.startsWith('chromium_headless_shell'))
  return d && `/opt/pw-browsers/${d}/chrome-headless-shell-linux64/chrome-headless-shell`
})()

const today = new Date().toISOString()
const PROFILE = {
  id: 'local-promo', username: 'grace', displayName: 'grace', avatarEmoji: '📖',
  xp: 2400, level: 9, currentStreak: 12, longestStreak: 21, streakFreezes: 2, lastPlayedOn: null, totalPlays: 40,
  soundEnabled: false, hapticsEnabled: false, reduceMotion: false, onboarded: true, avatarBorder: 'default', createdAt: today,
  avatarCharacter: {
    skin: 'amber', robe: 'linen', figure: 'fem', armor: {}, build: 'standard',
    outfit: {
      hair: { id: 'hair_long_wavy', color: '#3E2A1E' }, top: { id: 'top_hoodie', color: '#2F8F8A' },
      legs: { id: 'legs_jeans', color: '#2A3F7A' }, shoes: { id: 'shoes_sneakers', color: '#F2ECE0' },
    },
  },
}
const SETTINGS = { state: { tutorialSeen: true, soundEnabled: false, musicEnabled: false, reduceMotion: false, tipsSeen: ['play', 'battle', 'study', 'church', 'you'], firstDropTourSeen: true, firstWeekCuesSeen: true }, version: 0 }

// A visible tap: a soft ring where the pointer went down.
const TAPS = `
addEventListener('pointerdown', (e) => {
  const d = document.createElement('div')
  d.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;width:46px;height:46px;border-radius:50%;' +
    'left:' + (e.clientX - 23) + 'px;top:' + (e.clientY - 23) + 'px;border:3px solid rgba(255,255,255,.95);' +
    'background:rgba(255,255,255,.28);box-shadow:0 0 18px rgba(255,255,255,.6);transition:transform .45s ease-out,opacity .45s ease-out'
  document.body.appendChild(d)
  requestAnimationFrame(() => { d.style.transform = 'scale(1.7)'; d.style.opacity = '0' })
  setTimeout(() => d.remove(), 600)
}, true)`

async function shot(browser, name, fn) {
  if (ONLY && !ONLY.includes(name)) return
  const dir = path.join(OUT, name)
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true })
  const ctx = await browser.newContext({ viewport: { width: 432, height: 768 }, deviceScaleFactor: 2.5 })
  await ctx.addInitScript(([p, s]) => {
    if (!localStorage.getItem('va.profile')) {
      localStorage.setItem('va.profile', JSON.stringify(p))
      localStorage.setItem('va.settings', JSON.stringify(s))
    }
  }, [PROFILE, SETTINGS])
  await ctx.addInitScript(TAPS)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.error(name, 'pageerror', e.message))
  let rec = false
  const frames = []
  const cdp = await ctx.newCDPSession(page)
  cdp.on('Page.screencastFrame', async (f) => {
    if (rec) frames.push({ t: f.metadata.timestamp, data: f.data })
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1080, maxHeight: 1920 })
  const api = {
    page,
    go: async (url) => { await page.goto(BASE + url); await page.waitForLoadState('networkidle').catch(() => {}) },
    start: () => { rec = true },
    wait: (ms) => page.waitForTimeout(ms),
  }
  await fn(api)
  await page.waitForTimeout(300)
  rec = false
  await cdp.send('Page.stopScreencast')
  // ffconcat with each frame held until the next one arrived.
  const lines = ['ffconcat version 1.0']
  frames.forEach((f, i) => {
    const file = `f${String(i).padStart(5, '0')}.jpg`
    fs.writeFileSync(path.join(dir, file), Buffer.from(f.data, 'base64'))
    const next = frames[i + 1]?.t ?? f.t + 0.3
    lines.push(`file ${file}`, `duration ${Math.max(0.01, next - f.t).toFixed(4)}`)
  })
  if (frames.length) lines.push(`file f${String(frames.length - 1).padStart(5, '0')}.jpg`)
  fs.writeFileSync(path.join(dir, 'list.txt'), lines.join('\n') + '\n')
  const dur = frames.length ? frames.at(-1).t - frames[0].t : 0
  console.log(name, frames.length, 'frames', dur.toFixed(1) + 's')
  await ctx.close()
}

const smooth = (page, y, ms = 1400) => page.evaluate(([y, ms]) => new Promise((r) => {
  const s = scrollY, t0 = performance.now()
  const step = (t) => { const k = Math.min(1, (t - t0) / ms); scrollTo(0, s + (y - s) * (k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2)); k < 1 ? requestAnimationFrame(step) : r() }
  requestAnimationFrame(step)
}), [y, ms])

const browser = await chromium.launch(exe ? { executablePath: exe } : {})

// Which option is right, per question, from a dry run (deterministic deal).
async function answers() {
  const ctx = await browser.newContext({ viewport: { width: 432, height: 768 } })
  await ctx.addInitScript(([p, s]) => { localStorage.setItem('va.profile', JSON.stringify(p)); localStorage.setItem('va.settings', JSON.stringify(s)) }, [PROFILE, SETTINGS])
  const page = await ctx.newPage()
  await page.goto(BASE + '/play/run')
  await page.getByRole('button', { name: /start the clock/ }).click({ timeout: 15000 })
  const out = []
  for (let i = 0; i < 5; i++) {
    await page.locator('[data-option]:not([disabled])').first().waitFor()
    await page.locator('[data-option]').first().click()
    await page.locator('[data-option]:has-text("✅")').waitFor()
    out.push(Number(await page.locator('[data-option]:has-text("✅")').getAttribute('data-option')))
    await page.getByRole('button', { name: /Next question|See my score/ }).click()
  }
  await ctx.close()
  return out
}

const RIGHT = (!ONLY || ONLY.includes('verse')) ? await answers() : []
if (RIGHT.length) console.log('answers', RIGHT)

await shot(browser, 'verse', async ({ page, go, start, wait }) => {
  await go('/play'); await wait(1500); start(); await wait(1800)
  await page.goto(BASE + '/play/run'); await wait(3800)
  await page.getByRole('button', { name: /start the clock/ }).click()
  const pick = async (i, hold) => {
    await page.locator('[data-option]:not([disabled])').first().waitFor()
    await wait(1600)
    await page.locator(`[data-option="${i}"]`).click()
    await wait(hold)
    await page.getByRole('button', { name: /Next question|See my score/ }).click()
  }
  await pick(RIGHT[0], 2200)
  await pick((RIGHT[1] + 1) % 4, 5200)   // wrong on purpose: the teach line
  await pick(RIGHT[2], 1800)
  await pick(RIGHT[3], 1800)
  await pick(RIGHT[4], 1800)
  await page.waitForURL(/result/); await wait(2600)
  await smooth(page, 420, 1800); await wait(2600)
})

await shot(browser, 'trivia', async ({ page, go, start, wait }) => {
  await go('/play/trivia'); start(); await wait(2500)
  const b = page.getByRole('button', { name: /start the clock/ })
  if (await b.count()) { await b.click() }
  await page.locator('[data-option]:not([disabled])').first().waitFor({ timeout: 10000 }).catch(() => {})
  await wait(1800)
  await page.locator('[data-option]').first().click().catch(() => {})
  await wait(2600)
})

await shot(browser, 'arcade', async ({ page, go, start, wait }) => {
  await go('/arcade'); start(); await wait(2400)
  await page.goto(BASE + '/arcade/manna'); await wait(1400)
  await page.getByRole('button', { name: /Go out and gather/ }).click()
  const end = Date.now() + 11000
  while (Date.now() < end) {
    const f = page.locator('button[aria-label="fresh manna"]').first()
    if (await f.count()) await f.click({ timeout: 800 }).catch(() => {})
    await wait(220)
  }
})

await shot(browser, 'character', async ({ page, go, start, wait }) => {
  await go('/you?customize=1'); await wait(1200)
  await page.getByRole('button', { name: 'Sturdy' }).first().scrollIntoViewIfNeeded()
  await page.evaluate(() => scrollBy(0, -260)); await wait(400)
  start(); await wait(1600)
  for (const b of ['Sturdy', 'Slim', 'Standard']) { await page.getByRole('button', { name: b }).first().click(); await wait(1300) }
  await page.getByRole('tab', { name: 'Top' }).or(page.getByRole('button', { name: 'Top', exact: true })).first().click().catch(() => {}); await wait(1000)
  await smooth(page, (await page.evaluate(() => scrollY)) + 260, 900); await wait(800)
  // Recolour the hoodie, then come back up to see it on the character.
  await page.locator('[aria-label="#B8322E"]').first().click(); await wait(900)
  await page.getByRole('button', { name: 'Shepherd Coat' }).or(page.getByRole('button', { name: /Shepherd/ })).first().click({ timeout: 3000 }).catch(() => {})
  await wait(700)
  const y = await page.evaluate(() => scrollY)
  await smooth(page, y - 330, 900); await wait(2400)
  await wait(600)
})

await shot(browser, 'church', async ({ page, go, start, wait }) => {
  await go('/churches/try'); start(); await wait(2600)
  await smooth(page, 380, 2000); await wait(2600)
})

// The pastor's side, through the public demo (the real leadership tools over
// memory): type the sermon's verse, let it fill the words and five questions,
// name the series, set it, then play it as the congregation would.
await shot(browser, 'pastor', async ({ page, go, start, wait }) => {
  await go('/churches/try'); start(); await wait(1600)
  const ref = page.getByPlaceholder('John 15:5')
  await ref.scrollIntoViewIfNeeded(); await page.evaluate(() => scrollBy(0, -120)); await wait(500)
  await ref.click(); await ref.pressSequentially('John 15:5', { delay: 110 }); await wait(700)
  await page.getByRole('button', { name: /Fill in the words/ }).click(); await wait(1600)
  const series = page.getByPlaceholder(/John 15–17/)
  await smooth(page, (await series.evaluate((e) => e.getBoundingClientRect().top + scrollY)) - 260, 1100)
  await series.click(); await series.pressSequentially('Abide', { delay: 120 }); await wait(600)
  const note = page.getByPlaceholder(/Read the whole chapter/)
  await note.click(); await note.pressSequentially('Stay connected this week!', { delay: 45 }); await wait(500)
  const set = page.getByRole('button', { name: /Set today’s verse|Set the verse/ })
  await smooth(page, (await set.evaluate((e) => e.getBoundingClientRect().top + scrollY)) - 500, 1300); await wait(500)
  await set.click(); await wait(1200)
  await smooth(page, 0, 1100); await wait(800)
  await page.getByRole('button', { name: /Play it as your congregation/ }).click(); await wait(2600)
  await page.getByRole('button', { name: /start the clock/ }).click().catch(() => {})
  for (let i = 0; i < 2; i++) {
    await page.locator('[data-option]:not([disabled])').first().waitFor({ timeout: 8000 }).catch(() => {})
    await wait(1200)
    await page.locator('[data-option]').nth(i).click().catch(() => {}); await wait(2000)
    await page.getByRole('button', { name: /Next question|See my score/ }).click().catch(() => {})
  }
  await wait(800)
})

await shot(browser, 'people', async ({ page, go, start, wait }) => {
  await go('/churches/try'); await wait(800)
  await page.getByRole('tab', { name: 'People' }).or(page.getByRole('button', { name: 'People', exact: true })).first().click()
  await wait(600); start(); await wait(1800)
  await smooth(page, 420, 2200); await wait(2000)
})

// ---- The long walkthrough's extra shots (about three minutes) ----
// A page, a beat, a slow scroll down: the shape most of these need.
const tour = (url, ys, pause = 1600) => async ({ page, go, start, wait }) => {
  await go(url); await wait(900); start(); await wait(pause)
  for (const y of ys) { await smooth(page, y, 1800); await wait(pause) }
}
const answerRun = async (page, wait, n = 5) => {
  await page.getByRole('button', { name: /start the clock/ }).click({ timeout: 8000 }).catch(() => {})
  for (let i = 0; i < n; i++) {
    await page.locator('[data-option]:not([disabled])').first().waitFor({ timeout: 8000 }).catch(() => {})
    await wait(1100)
    await page.locator('[data-option]').nth(i % 4).click().catch(() => {}); await wait(1500)
    await page.getByRole('button', { name: /Next question|See my score|See the result|Finish/ }).first().click({ timeout: 3000 }).catch(() => {})
  }
}
// Scroll with the wheel: the Bible scrolls inside its own page, not the window.
const wheel = async (page, px, steps = 24, ms = 1800) => {
  await page.mouse.move(216, 420)
  for (let k = 0; k < steps; k++) { await page.mouse.wheel(0, px / steps); await page.waitForTimeout(ms / steps) }
}
await shot(browser, 'battle', async ({ page, go, start, wait }) => {
  await go('/battle/cpu'); await wait(1200); start(); await wait(1800)
  await page.getByRole('button', { name: /Play/ }).nth(1).click(); await wait(2600)
  await answerRun(page, wait)
  await wait(3500)
})
await shot(browser, 'bible', async ({ page, go, start, wait }) => {
  await go('/bible'); await wait(2500); start(); await wait(1600)
  await page.getByText('New Testament').first().click().catch(() => {}); await wait(900)
  await wheel(page, 700); await wait(1000)
  await page.goto(BASE + '/bible/John/15'); await wait(2600)
  await wheel(page, 600, 30, 2600); await wait(1500)
})
await shot(browser, 'seals', async ({ page, go, start, wait }) => {
  await go('/bible/seals'); await wait(2000); start(); await wait(1500)
  await wheel(page, 800, 30, 2600); await wait(1500)
})
await shot(browser, 'study', tour('/study', [500, 1100]))
await shot(browser, 'wordcatch', async ({ page, go, start, wait }) => {
  await go('/arcade/word-catch'); await wait(1200)
  // Today's verse, word by word, exactly as the field labels its targets.
  const verse = (await page.locator('text=/^But seek first/').first().innerText().catch(() => '')).replace(/[“”"]/g, '').replace(/\s*\.\.\.$|…$/, '')
  start(); await wait(1400)
  await page.getByRole('button', { name: /Put it back together/ }).click(); await wait(1200)
  // Only ever tap a WORD on the field: a stray tap on the header's back
  // button walked the recording out of the game and back, over and over.
  const end = Date.now() + 16000
  while (Date.now() < end) {
    const labels = await page.$$eval('button[aria-label]', (bs) => bs.map((b) => b.getAttribute('aria-label')))
    const words = labels.filter((l) => l && l.length < 24 && !/back|share|close|menu|play|study|church|battle|you/i.test(l))
    // The game knows which word comes next; try each word on the field once
    // (a wrong one just drops back), slowly enough to read.
    let hit = false
    for (const w of words) {
      const b = page.locator(`button[aria-label="${w.replace(/"/g, '\\"')}"]`).first()
      if (await b.count()) { await b.click({ timeout: 500 }).then(() => { hit = true }).catch(() => {}); await wait(380) }
      if (Date.now() > end) break
    }
    if (!hit) await wait(300)
  }
  void verse
})
await shot(browser, 'cross', async ({ page, go, start, wait }) => {
  await go('/arcade/cross'); await wait(1200); start(); await wait(1800)
  for (const ch of 'STRONG') { await page.keyboard.press(ch); await wait(260) }
  await wait(900)
  await page.getByRole('button', { name: /across|crossbar/i }).first().click().catch(() => {})
  await wait(500)
  for (const ch of 'AFRAID') { await page.keyboard.press(ch); await wait(260) }
  await wait(3500)
})
await shot(browser, 'you', tour('/you', [600, 1300]))
await shot(browser, 'wardrobe', tour('/wardrobe', [700, 1500]))
await shot(browser, 'journal', tour('/journal', [600]))
await shot(browser, 'pastor2', async ({ page, go, start, wait }) => {
  await go('/churches/try'); await wait(900); start(); await wait(1500)
  await smooth(page, 260, 1400); await wait(1800)
  await page.getByRole('tab', { name: 'Overview' }).or(page.getByRole('button', { name: 'Overview', exact: true })).first().click().catch(() => {})
  await wait(1800); await smooth(page, 700, 2200); await wait(1800)
})

await shot(browser, 'end', async ({ page, start, wait }) => {
  await page.setContent(`<html><body style="margin:0;height:100vh;display:grid;place-items:center;text-align:center;
    background:radial-gradient(ellipse at 50% 30%,#3a2a1c,#120c08);color:#fff;font-family:Inter,system-ui,sans-serif">
    <div><div style="font-size:64px">📖</div>
    <div style="font-size:38px;font-weight:900;margin-top:10px">Play today's verse</div>
    <div style="font-size:30px;font-weight:800;color:#FFD23F;margin-top:14px">versearcade.org</div>
    <div style="font-size:17px;opacity:.75;margin-top:18px">Free. Link under this video.</div></div></body></html>`)
  start(); await wait(5000)
})

await browser.close()
