#!/usr/bin/env node
// Every expression variant must still be THE SAME PERSON as its base render.
//
// This exists because the failure renders. `david_struck` came back as a
// crowned queen in purple and `david_settled` as Moses with tablets and a
// staff — two entirely different characters. Both were valid PNGs, both were
// reported `ok` by the generator, both wired themselves into generatedArt.ts,
// and the post would have cut from David's question to Queen Esther's face.
// Nothing anywhere said a word. The same family as the chroma-key scar: the
// generator's exit code says the API answered, never that it answered with
// the right picture.
//
// What it can check cheaply, and what it cannot. It CANNOT know whether a
// face looks surprised. What it CAN know is that the SILHOUETTE moved: the
// renders are cropped to content, so a figure that changed pose, gained a
// staff or became a different person changes width. Both David failures were
// 15% and 20% out where every good variant in the batch sat within 2%. So the
// gate is the silhouette, plus the cut-out test every generated figure needs.
//
// A legitimate re-roll can drift a little — an open mouth, a tipped head — so
// the threshold is generous. Tighten it and honest variants start failing;
// loosen it and a different character walks through.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = path.join(ROOT, 'public', 'skins')
const FACES = /_(asking|struck|settled)\.png$/
const WIDTH_TOLERANCE = 0.08

const read = (f) => PNG.sync.read(fs.readFileSync(path.join(DIR, f)))
const problems = []
let checked = 0

for (const f of fs.readdirSync(DIR).filter((x) => FACES.test(x)).sort()) {
  const baseName = f.replace(FACES, '.png')
  if (!fs.existsSync(path.join(DIR, baseName))) {
    problems.push(`${f}: no base render ${baseName} to compare against`)
    continue
  }
  const p = read(f), b = read(baseName)
  checked++
  if (p.height !== b.height) problems.push(`${f}: height ${p.height} against base ${b.height} — a variant is not a re-frame`)
  const drift = Math.abs(p.width - b.width) / b.width
  if (drift > WIDTH_TOLERANCE) {
    problems.push(`${f}: silhouette is ${(drift * 100).toFixed(0)}% wider/narrower than ${baseName} ` +
      `(${p.width} vs ${b.width}) — look at it, this is how a different character gets in`)
  }
  // The cut-out test. A variant on an opaque field draws a rectangle behind
  // the figure, which is the other way a perfectly valid PNG ruins a post.
  const alpha = (x, y) => p.data[(y * p.width + x) * 4 + 3]
  const corners = [alpha(2, 2), alpha(p.width - 3, 2), alpha(2, p.height - 3), alpha(p.width - 3, p.height - 3)]
  if (corners.filter((a) => a > 200).length >= 2) {
    problems.push(`${f}: opaque background (corner alpha ${corners.join(',')}) — the chroma key was ignored`)
  }
}

if (problems.length) {
  console.error('check-faces: ' + problems.length + ' problem(s)\n  ' + problems.join('\n  '))
  process.exit(1)
}
console.log(`check-faces: ${checked} expression variants, all the same person as their base`)
