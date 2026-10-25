// Tone/hair variants of the owner's leader-look paintings, generated from the
// owner's own painting as the reference so they stay in its adult style.
//
//   GEMINI_API_KEY=... node scripts/gen-leader-looks.mjs art/leader-looks-women.json <raw-dir> [--only id]
//
// Deliberately NOT gen-art.mjs: that pipeline adds the storybook style refs
// and writes src/data/generatedArt.ts, and these paintings are hand-kept in
// leaderLooks.tsx precisely so no generator run can rewire them. This writes
// the RAW pink-backdrop render to <raw-dir> (not tracked) and cuts it out with
// scripts/key-owner-figure.mjs into public/skins/leader-looks/<id>.png — the
// same keyer every owner painting goes through. Wiring the result into
// OWNER_FEM_VARIANTS stays a hand edit.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import sharp from 'sharp'

const [manifestPath, rawDir] = process.argv.slice(2)
const KEY = process.env.GEMINI_API_KEY
const MODEL = process.env.GEN_ART_MODEL || 'gemini-3-pro-image'
if (!KEY || !manifestPath || !rawDir) {
  console.error('usage: GEMINI_API_KEY=... node scripts/gen-leader-looks.mjs <manifest.json> <raw-dir> [--only id]')
  process.exit(1)
}
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null
const entries = JSON.parse(readFileSync(manifestPath, 'utf8')).filter((e) => !only || e.id === only)
mkdirSync(rawDir, { recursive: true })

// The reference is a cut-out; show it to the model on the same pink it is
// asked to paint, so "exactly like the pink behind the reference" means one colour.
const onPink = (path) =>
  sharp(path).flatten({ background: { r: 255, g: 20, b: 147 } }).extend({ top: 24, bottom: 24, left: 60, right: 60, background: { r: 255, g: 20, b: 147 } }).png().toBuffer()

for (const e of entries) {
  const out = `public/skins/leader-looks/${e.id}.png`
  if (existsSync(out) && !only) { console.log('skip', e.id); continue }
  const ref = (await onPink(e.ref)).toString('base64')
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: e.prompt }, { inline_data: { mime_type: 'image/png', data: ref } }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '2:3' } },
    }),
  })
  if (!res.ok) { console.error(e.id, res.status, (await res.text()).slice(0, 300)); continue }
  const data = await res.json()
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData || p.inline_data)
  const raw = part?.inlineData?.data ?? part?.inline_data?.data
  if (!raw) { console.error(e.id, 'no image', JSON.stringify(data).slice(0, 300)); continue }
  const rawPath = `${rawDir}/${e.id}.png`
  writeFileSync(rawPath, await sharp(Buffer.from(raw, 'base64')).png().toBuffer())
  execFileSync('node', ['scripts/key-owner-figure.mjs', rawPath, out, '--shadow'], { stdio: 'inherit' })
  console.log('ok', e.id)
}
