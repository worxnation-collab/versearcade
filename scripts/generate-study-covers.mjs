// Generate the Study shelf's six book covers with Gemini's image model
// ("nano banana"). Needs GEMINI_API_KEY in the environment; writes one JPEG
// per book into src/assets/study/, where the shelf picks them up by filename
// (see StudyShelf/StudyBookArt — a missing file falls back to the drawn board).
//
//   GEMINI_API_KEY=... node scripts/generate-study-covers.mjs [key ...]
//
// Pass book keys (versus focus keep replay reports bag cross) to regenerate a
// subset; no arguments regenerates all seven.
//
// One shared style preamble, seven subjects — the whole set is generated
// together so it reads as books bound by the same hand. The titles are NOT in
// the artwork on purpose: the app stamps them in CSS, so they stay crisp at
// 44px, localizable, and immune to the model misspelling them.
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const MODEL = 'gemini-2.5-flash-image'
const OUT_DIR = path.join(import.meta.dirname, '..', 'src', 'assets', 'study')

// Matches the drawn boards' leathers (StudyBookArt BOARDS) — hue AND value
// distinct, so the shelf still reads as different books in greyscale.
const STYLE = `Ornate antique leather-bound book cover, front board only, viewed perfectly
straight-on and flat, filling the entire frame edge to edge with no background visible.
Blind-stamped and gilt tooled leather, an embossed gold double-line frame border near the
edges, and a single central embossed emblem with soft metallic shading. Flat illustration
with subtle grain and gentle top lighting, rich and warm, storybook-game style. The lower
third of the cover inside the frame stays empty plain leather. Absolutely no text, no
letters, no numbers anywhere.`

const COVERS = {
  versus: `${STYLE} Deep crimson-burgundy leather. Central emblem: a friendly retro robot head in brass and gold with softly glowing eyes, small radiating engraved rays behind it.`,
  focus: `${STYLE} Deep teal-emerald leather. Central emblem: a gold archery target with an arrow standing in the bullseye, faint engraved concentric rings behind it.`,
  keep: `${STYLE} Deep royal purple-violet leather. Central emblem: a gold anatomical brain with a soft radiant halo, faint engraved filigree swirls behind it.`,
  replay: `${STYLE} Deep navy-indigo leather. Central emblem: a small gold stack of five books, faint engraved star flourishes behind it.`,
  reports: `${STYLE} Warm golden-amber ochre leather. Central emblem: a gold rising bar chart of three bars, faint engraved laurel branches behind it.`,
  bag: `${STYLE} Dark walnut-brown earthy leather, distinctly brown with no red tones. Central emblem: a gold traveler's satchel with a buckled flap, faint engraved rope-knot flourishes behind it.`,
  cross: `${STYLE} Deep olive-forest green leather. Central emblem: a gold Latin cross made of two timbers with visible woodgrain, the crossbar high in the upper third, faint engraved wheat sprays behind it.`,
}

const key = process.env.GEMINI_API_KEY
if (!key) {
  console.error('GEMINI_API_KEY is not set.')
  process.exit(1)
}

const wanted = process.argv.slice(2)
const bad = wanted.filter((k) => !(k in COVERS))
if (bad.length) {
  console.error(`Unknown cover key(s): ${bad.join(', ')} — valid: ${Object.keys(COVERS).join(' ')}`)
  process.exit(1)
}
const keys = wanted.length ? wanted : Object.keys(COVERS)

await mkdir(OUT_DIR, { recursive: true })

async function generate(name, prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['IMAGE'],
          // The boards render at width : height = 1 : 1.42; 2:3 is the closest
          // supported ratio and the shelf crops the sliver with object-fit.
          imageConfig: { aspectRatio: '2:3' },
        },
      }),
    },
  )
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`)
  const json = await res.json()
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)
  if (!part) throw new Error(`${name}: no image in response — ${JSON.stringify(json).slice(0, 300)}`)
  const ext = part.inlineData.mimeType === 'image/png' ? 'png' : 'jpg'
  const file = path.join(OUT_DIR, `${name}.${ext}`)
  await writeFile(file, Buffer.from(part.inlineData.data, 'base64'))
  console.log(`✔ ${name} → ${path.relative(process.cwd(), file)}`)
}

// Sequential on purpose: free-tier keys rate-limit fast, and six images
// aren't worth a retry ladder.
let failed = 0
for (const name of keys) {
  try {
    await generate(name, COVERS[name])
  } catch (e) {
    failed++
    console.error(`✘ ${String(e.message ?? e)}`)
  }
}
process.exit(failed ? 1 : 0)
