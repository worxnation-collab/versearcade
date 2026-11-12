#!/usr/bin/env node
// The evening myth's OPENING SHOT, made to move: one Kling image-to-video clip
// per scripted myth, from the painting the post already uses.
//
//   node scripts/gen-myth-clips.mjs [--only 2026-11-14] [--force]
//
// Reads art/tiktok-myth-clips.json, animates https://versearcade.org/tiktok/
// myths/<date>.jpg (the painting must be DEPLOYED — fal fetches it by URL),
// and writes public/tiktok/myths/<date>.mp4. The renderer plays it under the
// hook for its five seconds and then holds its LAST frame for the rest of the
// post (`StoryInput.openClip`), so a missing clip is the painting as before.
//
// The fal.ai key is a network secret the environment's proxy injects for
// queue.fal.run — never a file. FAL_KEY is honoured if set (a laptop run).
//
// Cost: ~$0.28 per clip (Kling 2.1 standard, 5s). Re-encoded on the way in
// (no audio, H.264, faststart) because these ship in the app bundle.
import { readFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const M = JSON.parse(readFileSync('art/tiktok-myth-clips.json', 'utf8'))
const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const force = args.includes('--force')
const KEY = `Authorization: Key ${process.env.FAL_KEY || 'proxy'}`
// curl rather than fetch: Node's fetch ignores HTTPS_PROXY, and the proxy is
// where the key comes from in a cloud session.
function curl(url, body) {
  const a = ['-sS', '--fail-with-body', '-H', KEY, url]
  if (body) a.push('-H', 'Content-Type: application/json', '-d', JSON.stringify(body))
  return JSON.parse(execFileSync('curl', a, { encoding: 'utf8' }))
}
const OUT = 'public/tiktok/myths'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function animate(c) {
  const body = {
    image_url: `https://versearcade.org/tiktok/myths/${c.date}.jpg`,
    prompt: c.motion + M.style,
    negative_prompt: M.negative,
    duration: '5',
    aspect_ratio: '9:16',
    cfg_scale: 0.5,
  }
  const sub = curl(`https://queue.fal.run/${M.model}`, body)
  if (!sub.status_url) throw new Error(`submit failed: ${JSON.stringify(sub).slice(0, 300)}`)
  for (let i = 0; i < 120; i++) {
    await sleep(10000)
    const s = curl(sub.status_url)
    if (s.status === 'COMPLETED') break
    if (s.status !== 'IN_QUEUE' && s.status !== 'IN_PROGRESS') throw new Error(`status ${JSON.stringify(s).slice(0, 300)}`)
  }
  const res = curl(sub.response_url)
  const url = res?.video?.url
  if (!url) throw new Error(`no video: ${JSON.stringify(res).slice(0, 300)}`)
  const raw = `${OUT}/.${c.date}.raw.mp4`
  execFileSync('curl', ['-sS', '--fail', '-o', raw, url])
  const tmp = `${OUT}/.${c.date}.mp4`
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-an', '-vf', 'scale=1080:-2,fps=30', '-c:v', 'libx264',
    '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', tmp])
  execFileSync('rm', ['-f', raw])
  renameSync(tmp, `${OUT}/${c.date}.mp4`)
  return statSync(`${OUT}/${c.date}.mp4`).size
}

mkdirSync(OUT, { recursive: true })
const todo = M.clips.filter((c) => (!only || c.date === only) && (force || !existsSync(`${OUT}/${c.date}.mp4`)))
console.log(`${todo.length} clip(s) to make`)
// Four at a time: fal queues the rest anyway, and one failure never stops the batch.
let failed = 0
for (let i = 0; i < todo.length; i += 4) {
  await Promise.all(todo.slice(i, i + 4).map(async (c) => {
    try { console.log(`${c.date}  ${(await animate(c) / 1e6).toFixed(2)} MB`) }
    catch (e) { failed++; console.error(`${c.date}  FAILED  ${e.message}`) }
  }))
}
if (failed) process.exit(1)
