// The owner's recordings, made to sound produced before a post uses them
// (2026-11-12, the owner's call after hearing the walkthrough's voice).
//
// The chain is the walkthrough's (docs/PROMO-SCRIPT.md → "Finishing the
// voiceover") with two deliberate differences, both because a parked
// recording carries WORD TIMINGS the renderer captions from:
//   - nothing that moves a word: no pause tightening, no tempo change. The
//     output is checked to be the same length, sample for sample, as the
//     input, and is refused (the original stays) if it is not;
//   - no loudness target: the renderer levels speech itself (SPEECH_TARGET in
//     lib/speechLevel.ts), so a second normaliser here would only fight it.
// Noise removal is RNNoise (ffmpeg's arnndn) rather than the paid
// DeepFilterNet the walkthrough used: it is free, needs no key in CI, and the
// phone memos measured a -78 dB floor already, so the EQ, de-esser and
// compressor are most of what is heard. The model is fetched at run time
// (GregorR/rnnoise-models), and a failed fetch skips noise removal rather
// than the post.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const MODEL_URL = 'https://raw.githubusercontent.com/GregorR/rnnoise-models/master/somnolent-hogwash-2018-09-01/sh.rnnn'
const CHAIN = 'highpass=f=80,equalizer=f=220:t=q:w=1:g=-2.5,equalizer=f=3200:t=q:w=1.2:g=3,'
  + 'highshelf=f=9000:g=2.5,deesser=i=0.35,acompressor=threshold=-22dB:ratio=3:attack=8:release=160:makeup=3dB'

export async function rnnoiseModel(dir) {
  const p = path.join(dir, 'sh.rnnn')
  if (fs.existsSync(p)) return p
  try {
    const r = await fetch(MODEL_URL)
    if (!r.ok) return null
    fs.writeFileSync(p, Buffer.from(await r.arrayBuffer()))
    return p
  } catch { return null }
}

function samples(ffprobe, file) {
  const r = spawnSync(ffprobe, ['-v', 'error', '-select_streams', 'a:0', '-count_packets', '-show_entries',
    'stream=sample_rate,duration_ts,duration', '-of', 'json', file], { encoding: 'utf8' })
  try { const s = JSON.parse(r.stdout).streams[0]; return Math.round(Number(s.duration) * Number(s.sample_rate)) } catch { return -1 }
}

/** Polish `inFile` into `outFile`. Returns null on success, else why it was refused. */
export function polishVoice(inFile, outFile, { ffmpeg = 'ffmpeg', ffprobe = 'ffprobe', model = null } = {}) {
  const sr = spawnSync(ffprobe, ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate,channels', '-of', 'csv=p=0', inFile], { encoding: 'utf8' }).stdout.trim().split(',')
  const [rate, ch] = [sr[0] || '48000', sr[1] || '1']
  // RNNoise runs at 48 kHz; the chain resamples back so the file keeps its
  // own rate (and so its own sample count) for the transcript beside it.
  const af = [model ? `aresample=48000,arnndn=m='${model.replace(/'/g, "\\'")}':mix=0.85,aresample=${rate}` : null, CHAIN].filter(Boolean).join(',')
  const r = spawnSync(ffmpeg, ['-v', 'error', '-y', '-i', inFile, '-af', af, '-ac', ch, '-ar', rate, '-c:a', 'pcm_s16le', outFile], { encoding: 'utf8' })
  if (r.status !== 0) return `ffmpeg: ${(r.stderr || '').slice(0, 200)}`
  const a = samples(ffprobe, inFile), b = samples(ffprobe, outFile)
  // A few samples of resampler rounding are inaudible and move no word; more
  // than 10 ms would, and is refused.
  if (a < 0 || b < 0 || Math.abs(a - b) > Number(rate) / 100) return `length changed ${a} -> ${b}`
  return null
}
