#!/usr/bin/env node
// Paint the day's SPEAKER into the day's painting, so the living clip moves him
// too (his hands, his mouth) instead of animating the road under a stiff
// cut-out.
//
//   node scripts/gen-cast-stills.mjs [--from 2026-11-13] [--days 14]
//   node scripts/gen-living.mjs --only /tiktok/cast/
//
// For each date it works out exactly what the morning verse post would draw —
// the verse's own painting or the day's road, and the verse's speaker
// (`castFor`) — composes them with the renderer's own placement
// (`composeStanding`), and writes public/tiktok/cast/<scene>--<figure>.jpg.
// It also makes the chalkboard with the operator's figure in it. Each new still
// is appended to art/living.json; gen-living.mjs then makes its clips. A pair
// that already exists is reused, so roads and speakers repeat for free.
//
// Runs the app's own modules in headless Chromium through a Vite dev server,
// so the cast and the placement can never drift from what the renderer does.
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'

const args = process.argv.slice(2)
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const from = arg('--from', new Date(Date.now() + 864e5).toISOString().slice(0, 10))
const days = Number(arg('--days', '14'))
const dates = Array.from({ length: days }, (_, i) => new Date(Date.parse(`${from}T00:00:00Z`) + i * 864e5).toISOString().slice(0, 10))

const server = await createServer({ server: { port: 5181, strictPort: false }, logLevel: 'error' })
await server.listen()
const url = server.resolvedUrls.local[0]
const browser = await chromium.launch(process.env.PW_EXECUTABLE ? { executablePath: process.env.PW_EXECUTABLE } : {})
const page = await browser.newPage()
await page.goto(url)

const made = await page.evaluate(async (dates) => {
  const r = await import('/src/lib/tiktokRender.ts')
  const { getVerseForDate } = await import('/src/data/bible/questions.ts')
  const { castFor } = await import('/src/data/tiktokCast.ts')
  const { autoCast, scenePath, castStillPath, existsAt, SPEAKER_SKIN } = await import('/src/features/admin/tiktok/shared.tsx')
  const versePainting = (ref) => `/tiktok/verse/${String(ref).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.jpg`
  const pairs = new Map()
  for (const d of dates) {
    const v = getVerseForDate(d)
    const painted = versePainting(v.reference)
    const scene = (await existsAt(painted, 'image/')) ? painted : scenePath(autoCast(d).scene)
    const figure = castFor(v).figure
    pairs.set(castStillPath(scene, figure), { scene, figure, layout: 'verse', dates: [...(pairs.get(castStillPath(scene, figure))?.dates ?? []), d] })
  }
  pairs.set(castStillPath('/tiktok/exchange/chalkboard.jpg', SPEAKER_SKIN), { scene: '/tiktok/exchange/chalkboard.jpg', figure: SPEAKER_SKIN, layout: 'chalk', dates: [] })
  const out = []
  for (const [path, p] of pairs) {
    const blob = await r.composeStanding(await r.loadImage(p.scene), await r.loadImage(`/skins/${p.figure}.png`), p.layout)
    const buf = new Uint8Array(await blob.arrayBuffer())
    let s = ''
    for (let i = 0; i < buf.length; i += 32768) s += String.fromCharCode(...buf.subarray(i, i + 32768))
    out.push({ path, ...p, jpg: btoa(s) })
  }
  return out
}, dates)

await browser.close()
await server.close()

mkdirSync('public/tiktok/cast', { recursive: true })
const M = JSON.parse(readFileSync('art/living.json', 'utf8'))
const known = new Set(M.paintings.map((p) => p.src))
const ambient = Object.fromEntries(M.paintings.map((p) => [p.src, p.motion]))
for (const m of made) {
  const file = `public${m.path}`
  if (!existsSync(file)) writeFileSync(file, Buffer.from(m.jpg, 'base64'))
  if (known.has(m.path)) { console.log(`${m.path}  (already listed)`); continue }
  const speak = m.layout === 'chalk'
    ? 'The person standing at the lower right in front of the blackboard talks to the viewer: their lips move as they speak, they gesture with one hand toward the board, small natural head movement. They stay on the same spot. The blackboard stays perfectly still and empty, its frame does not move.'
    : 'The person standing in the middle talks warmly to the viewer: their lips move as they speak, they gesture gently with their hands, small natural head and shoulder movement, their robes stir in the breeze. They stay standing on the same spot and keep facing the viewer.'
  const bg = ambient[m.scene] ? ` Behind them: ${ambient[m.scene]}` : ''
  M.paintings.push({ src: m.path, motion: speak + bg, calm: 'The person keeps talking gently: lips moving, small hand gestures, slight head movement, breathing.', dates: m.dates })
  console.log(`${m.path}  ${m.dates.join(' ') || 'chalkboard'}`)
}
writeFileSync('art/living.json', JSON.stringify(M, null, 2) + '\n')
