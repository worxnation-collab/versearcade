#!/usr/bin/env node
// Living paintings: make a TikTok backdrop painting MOVE.
//
//   node scripts/gen-living.mjs [--only <src substring>] [--force] [--loops-only]
//
// For every painting in art/living.json (a path under public/), makes:
//   1. <name>.mp4       — the OPENING: five seconds of real movement from the
//                         painting (he walks, the ship rocks). Kling 2.5 Turbo
//                         Standard, ~$0.21.
//   2. <name>-loop.mp4  — a seamless calm LOOP that starts AND ends on the
//                         opening's last frame (Kling 2.5 Turbo Pro with a tail
//                         image, ~$0.35), so it repeats with no jump and picks
//                         up exactly where the opening left off.
// The renderer plays the opening under the hook, then repeats the loop for the
// rest of the post (`makeLiving` in lib/tiktokRender.ts). Either file missing
// degrades gracefully: no loop holds the opening's last frame; neither is the
// painting as before.
//
// Images go to fal as data URIs, so a painting need not be deployed first.
// The fal.ai key is a network secret the environment's proxy injects for
// queue.fal.run — never a file. FAL_KEY is honoured if set (a laptop run).
// Clips are re-encoded silent H.264 (~1MB) because they ship in the bundle.
import { readFileSync, existsSync, renameSync, statSync, rmSync, mkdtempSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'

const M = JSON.parse(readFileSync('art/living.json', 'utf8'))
const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const force = args.includes('--force')
const loopsOnly = args.includes('--loops-only')
const KEY = `Authorization: Key ${process.env.FAL_KEY || 'proxy'}`
const TMP = mkdtempSync(path.join(tmpdir(), 'living-'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// curl rather than fetch: Node's fetch ignores HTTPS_PROXY, and the proxy is
// where the key comes from in a cloud session. The body goes through a file
// because a data URI is far past the argument-length limit.
function curl(url, body) {
  const a = ['-sS', '--fail-with-body', '-H', KEY, url]
  if (body) {
    const f = path.join(TMP, `body-${Math.random().toString(36).slice(2)}.json`)
    execFileSync('sh', ['-c', 'cat > "$1"', 'sh', f], { input: JSON.stringify(body) })
    a.push('-H', 'Content-Type: application/json', '--data-binary', `@${f}`)
  }
  return JSON.parse(execFileSync('curl', a, { encoding: 'utf8', maxBuffer: 1 << 26 }))
}
const dataUri = (file) => `data:image/jpeg;base64,${readFileSync(file).toString('base64')}`

async function kling(model, body) {
  const sub = curl(`https://queue.fal.run/${model}`, body)
  if (!sub.status_url) throw new Error(`submit failed: ${JSON.stringify(sub).slice(0, 300)}`)
  for (let i = 0; i < 180; i++) {
    await sleep(10000)
    const s = curl(sub.status_url)
    if (s.status === 'COMPLETED') break
    if (s.status !== 'IN_QUEUE' && s.status !== 'IN_PROGRESS') throw new Error(`status ${JSON.stringify(s).slice(0, 300)}`)
  }
  const url = curl(sub.response_url)?.video?.url
  if (!url) throw new Error('no video in the response')
  const raw = path.join(TMP, `raw-${Math.random().toString(36).slice(2)}.mp4`)
  execFileSync('curl', ['-sS', '--fail', '-o', raw, url])
  return raw
}
function encode(raw, out) {
  const tmp = `${out}.part.mp4`
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-an', '-vf', 'scale=1080:-2,fps=30', '-c:v', 'libx264',
    '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', tmp])
  renameSync(tmp, out)
}
function lastFrame(video) {
  const f = path.join(TMP, `last-${Math.random().toString(36).slice(2)}.jpg`)
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-sseof', '-0.1', '-i', video, '-frames:v', '1', '-q:v', '2', f])
  return f
}

async function one(p) {
  const img = `public${p.src}`
  if (!existsSync(img)) throw new Error(`no painting at ${img}`)
  const base = img.replace(/\.(jpe?g|png)$/i, '')
  const opening = `${base}.mp4`, loop = `${base}-loop.mp4`
  const done = []
  if (!loopsOnly && (force || !existsSync(opening))) {
    const raw = await kling(M.model, { image_url: dataUri(img), prompt: p.motion + M.style, negative_prompt: M.negative, duration: '5', cfg_scale: 0.5 })
    encode(raw, opening)
    done.push(`opening ${(statSync(opening).size / 1e6).toFixed(2)}MB`)
  }
  if (force || !existsSync(loop)) {
    // The loop starts where the opening ended, or on the painting itself.
    const start = existsSync(opening) ? lastFrame(opening) : img
    const uri = dataUri(start)
    const raw = await kling(M.loopModel, { image_url: uri, tail_image_url: uri, prompt: (p.calm ?? '') + M.loopStyle, negative_prompt: M.negative, duration: '5', cfg_scale: 0.5 })
    encode(raw, loop)
    done.push(`loop ${(statSync(loop).size / 1e6).toFixed(2)}MB`)
  }
  return done.join(', ') || 'up to date'
}

const todo = M.paintings.filter((p) => !only || p.src.includes(only))
console.log(`${todo.length} painting(s)`)
let failed = 0
for (let i = 0; i < todo.length; i += 4) {
  await Promise.all(todo.slice(i, i + 4).map(async (p) => {
    try { console.log(`${p.src}  ${await one(p)}`) }
    catch (e) { failed++; console.error(`${p.src}  FAILED  ${e.message}`) }
  }))
}
rmSync(TMP, { recursive: true, force: true })
if (failed) process.exit(1)
