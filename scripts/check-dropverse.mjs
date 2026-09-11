// `dropVerse` takes the reading off the front of a morning take, so the hook
// alone is refitted onto the hook's own timings.
//
// It is checked here because BOTH ways of getting it wrong render perfectly.
// Cut too little and the verse's last words ride the front of the hook's
// captions; cut too much and somebody's words are deleted; cut when there was
// no reading at all and the whole caption track is somebody else's sentence.
// None of that throws, the parked file looks complete, and the word count
// stays sensible — the original bug spread 80 words across ten seconds of
// audio at 0.04s each and reported a clean parking.
//
// Every case below is REAL: seven takes from one recorded week, and the four
// distinct ways a strict in-order match died on them. They are written out
// here rather than fetched, because the recording is not in the repo and a
// checker that needs a file nobody has is a checker that gets deleted.

import { build } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dv-')), 'dv.mjs')
await build({ entryPoints: [path.join(root, 'src/lib/dropVerse.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' })
const { dropVerse } = await import(out)

let bad = 0
const fail = (m) => { console.error('check-dropverse:', m); bad++ }
const cut = (name, said, verse, wantStart) => {
  const got = dropVerse(said, verse)
  if (got === said) return fail(`${name}: the reading was not taken off at all`)
  if (!got.startsWith(wantStart)) fail(`${name}: hook starts "${got.slice(0, 48)}…", wanted "${wantStart}…"`)
}
const keep = (name, said, verse) => {
  if (dropVerse(said, verse) !== said) fail(`${name}: cut something that carries no reading`)
}

// ── the four substitutions that each ended a strict match ────────────────────
// A word the READER dropped, three from the end ("gave Himself up for me").
cut('dropped word',
  'I have been crucified with Christ, and I no longer live, but Christ lives in me. The life I live in the body, I live by faith in the Son of God, who loved me and gave Himself for me. Paul is angrier in this letter than anywhere else he ever writes.',
  'I have been crucified with Christ, and I no longer live, but Christ lives in me. The life I live in the body, I live by faith in the Son of God, who loved me and gave Himself up for me.',
  'Paul is angrier')
// A name mis-heard as two words, at the verse's FOURTH word — 6% matched.
cut('name mis-heard early',
  'As for you, solemn in my son, know the God of your father and serve him wholeheartedly and with a willing mind. This is a dying king talking to his son.',
  'As for you, Solomon my son, know the God of your father, and serve Him wholeheartedly and with a willing mind',
  'This is a dying king')
// One word mis-heard as its near-homophone, also at word four.
cut('near-homophone',
  'And they sang responsibly with praise and thanksgiving to the Lord. They have come home from exile to a city that is rubble.',
  'And they sang responsively with praise and thanksgiving to the LORD',
  'They have come home')
// One token in the pool, two out of Whisper — and at the verse's END, which
// is what left a remnant on the front of the hook rather than refusing.
cut('hyphen split at the end',
  'But let justice roll on like a river and righteousness like an ever -flowing stream. Amos is not a priest.',
  'But let justice roll on like a river, and righteousness like an ever-flowing stream.',
  'Amos is not a priest')
// The reader skipping the verse's opening word outright.
cut('opening word skipped',
  'the Lord causes face to shine upon you and be gracious to you. The oldest piece of the Bible anyone has ever dug up is this blessing.',
  'may the LORD cause His face to shine upon you and be gracious to you;',
  'The oldest piece')

// ── and the three refusals, which are the half that protects somebody's words ─
keep('hook only',
  'These are people Paul already brought in and somebody has turned up after him telling them they missed a step. Tabitha tells you what that step was.',
  'I have been crucified with Christ, and I no longer live, but Christ lives in me.')
keep('reading only, nothing after it',
  'But let justice roll on like a river, and righteousness like an ever-flowing stream.',
  'But let justice roll on like a river, and righteousness like an ever-flowing stream.')
keep('a hook that happens to share short words',
  'And this is the line that comes out of that argument, and it is the one they all remember.',
  'I have been crucified with Christ, and I no longer live, but Christ lives in me. The life I live in the body, I live by faith in the Son of God.')

if (bad) process.exitCode = 1
else console.log('check-dropverse: 5 cuts, 3 refusals OK')
