// A wrong QR renders perfectly and scans wrong.
//
// That is the `check-trivia` shape exactly — nothing throws, the sheet looks
// finished, and the failure arrives as "nobody in the building could scan it",
// which is the one place this channel cannot afford a bug. So the matrix is
// compared MODULE BY MODULE against an independent implementation rather than
// eyeballed, and "it scanned on my phone" is not accepted as evidence: a code
// with a bad mask or a mis-sized version often reads on a good camera at
// 20cm and fails on a cheap one at the back of a room.
//
// TWO THINGS ABOUT THE COMPARISON WERE LEARNED THE HARD WAY, and both made a
// correct encoder look broken:
//
//   1. The reference OPTIMISES SEGMENTS. `qrcode.create(text)` will split a
//      string into numeric/alphanumeric/byte runs — a church id like
//      "…-6978-8765-4321…" gets its digit runs encoded in numeric mode — and
//      produces a smaller, entirely different matrix. src/lib/qr.ts is byte
//      mode only, on purpose (every payload is a URL). So the reference is
//      forced into a single byte segment, or the diff is meaningless: it was
//      reporting ~500 differing modules on versions 7 and 8 while the encoder
//      was exactly right.
//   2. The reference's RULE 4 deviates from the spec. It scores
//      `|ceil(percent / 5) - 10|`, charging 10 points across the (50%, 55%)
//      dark band where the spec charges none, so on some payloads the two pick
//      DIFFERENT MASKS. Both codes are valid and scannable — rule 4 is about
//      how even a code looks, not whether it decodes.
//
// So the strong assertion here is at FORCED masks, where the two must agree
// module for module on everything that matters: version, block interleave,
// Reed-Solomon, module placement, format bits and version bits. An auto-mask
// disagreement is allowed ONLY when it is explained by selection alone — the
// check proves that by re-comparing at the mask this encoder actually chose.
// Verified: with the reference's rule-4 formula substituted in, all 65 corpus
// payloads become module-identical, which is what pins the difference to that
// one rule rather than leaving it as a guess.
//
// The reference is the `qrcode` npm package, installed OUTSIDE the repo (it is
// not a dependency and must never become one — the whole point of src/lib/qr.ts
// is that nothing ships). Set QR_REF to its location:
//
//   mkdir -p /tmp/qrref && cd /tmp/qrref && npm init -y && npm i qrcode
//   QR_REF=/tmp/qrref node scripts/check-qr.mjs
//
// With no reference available the check still runs every structural assertion
// it can make on its own and says plainly that it could not diff — a skipped
// comparison that reported success would be worse than no check at all.

import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

let failed = 0
const fail = (msg) => { console.error(`✗ ${msg}`); failed += 1 }

// ── The corpus: the real shapes this app will ever encode ──────────────────
// Invite URLs at every length a church id, a referral code and the src can
// produce, plus the edges that decide a version boundary.
const CORPUS = [
  'https://versearcade.org/church/abc',
  'https://versearcade.org/church/6f1e2d3c-4b5a-6978-8765-4321fedcba09?src=church',
  'https://versearcade.org/church/6f1e2d3c-4b5a-6978-8765-4321fedcba09?ref=ABCD1234&src=church',
  'https://versearcade.org/church/6f1e2d3c-4b5a-6978-8765-4321fedcba09?ref=A&src=church',
  'https://versearcade.org/play?src=church',
  'https://versearcade.org/',
  // Length sweep across the version-1..10 boundaries, including the jump from
  // an 8-bit to a 16-bit character count at version 10.
  ...Array.from({ length: 60 }, (_, i) => 'https://versearcade.org/c/' + 'x'.repeat(i + 1)),
  // Longer still, to reach the versions a QR with a long tracked link needs.
  'https://versearcade.org/church/' + 'a'.repeat(300),
  // Non-ASCII, because a church name never reaches the URL but a future caller
  // might hand this something UTF-8 and byte mode has to count BYTES.
  'https://versearcade.org/church/café-münster-δοκιμή',
]

const server = await createServer({ root, logLevel: 'error', server: { middlewareMode: true } })
const { encodeQr, qrPath, freeModuleCount } = await server.ssrLoadModule('/src/lib/qr.ts')

// Data modules a version leaves free, per the spec: total codewords * 8 plus
// the version's remainder bits. Independently entered, NOT derived from
// src/lib/qr.ts — a misplaced or missing function pattern shifts every data
// module after it, which reads as noise rather than as a missing square.
const TOTAL_CODEWORDS = [
  26, 44, 70, 100, 134, 172, 196, 242, 292, 346, 404, 466, 532, 581, 655, 733, 815, 901, 991, 1085,
  1156, 1258, 1364, 1474, 1588, 1706, 1828, 1921, 2051, 2185, 2323, 2465, 2611, 2761, 2876, 3034,
  3196, 3362, 3532, 3706,
]
const REMAINDER = (v) =>
  v === 1 ? 0 : v <= 6 ? 7 : v <= 13 ? 0 : v <= 20 ? 3 : v <= 27 ? 4 : v <= 34 ? 3 : 0

for (let v = 1; v <= 40; v++) {
  const want = TOTAL_CODEWORDS[v - 1] * 8 + REMAINDER(v)
  const got = freeModuleCount(v)
  if (got !== want) fail(`version ${v} leaves ${got} data modules, the spec says ${want}`)
}

// ── Structural assertions, reference or not ────────────────────────────────
for (const text of CORPUS) {
  const m = encodeQr(text)
  const expected = m.version * 4 + 17
  if (m.size !== expected) fail(`size ${m.size} is not 4*${m.version}+17 for ${text.slice(0, 40)}…`)
  if (m.modules.length !== m.size || m.modules.some((r) => r.length !== m.size)) {
    fail(`matrix is not ${m.size}x${m.size} for ${text.slice(0, 40)}…`)
  }
  // The three finder patterns, checked as actual 7x7 rings rather than assumed.
  const finder = (r0, c0) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const ring = r === 0 || r === 6 || c === 0 || c === 6
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4
        if (m.modules[r0 + r][c0 + c] !== (ring || core)) return false
      }
    }
    return true
  }
  if (!finder(0, 0) || !finder(0, m.size - 7) || !finder(m.size - 7, 0)) {
    fail(`a finder pattern is malformed for ${text.slice(0, 40)}…`)
  }
  // The dark module is fixed by the spec and is the classic silent mistake.
  if (m.modules[m.size - 8][8] !== true) fail(`the dark module is light for ${text.slice(0, 40)}…`)
  // The quiet zone has to be in the path's viewBox or a printed code fails.
  const { side } = qrPath(m)
  if (side !== m.size + 8) fail(`path side ${side} leaves no 4-module quiet zone (size ${m.size})`)
}

// ── The comparison that actually matters ───────────────────────────────────
const ref = process.env.QR_REF
let compared = 0
let maskOnly = 0
if (ref && existsSync(resolve(ref, 'node_modules/qrcode'))) {
  const require = createRequire(resolve(ref, 'noop.cjs'))
  const qrcode = require('qrcode')
  // A single byte segment, never `qrcode.create(text)` — see the header.
  const refAt = (text, mask) =>
    qrcode.create([{ data: text, mode: 'byte' }], { errorCorrectionLevel: 'Q', maskPattern: mask })
  const diffCount = (mine, theirs) => {
    const n = theirs.modules.size
    if (n !== mine.size) return Infinity
    let d = 0
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) if (mine.modules[r][c] !== (theirs.modules.data[r * n + c] === 1)) d++
    }
    return d
  }

  for (const text of CORPUS) {
    const label = text.length > 44 ? `${text.slice(0, 44)}…` : text
    const auto = encodeQr(text)
    const theirsAuto = refAt(text, undefined)
    if (theirsAuto.version !== auto.version) {
      fail(`version ${auto.version} vs reference ${theirsAuto.version} for ${label}`)
      continue
    }

    // The strong one: at every FORCED mask the two must be identical. This is
    // what actually proves the encoder — interleave, Reed-Solomon, placement,
    // format bits and version bits all have to be right eight times over.
    let forcedBad = 0
    for (let mask = 0; mask < 8; mask++) {
      const d = diffCount(encodeQr(text, mask), refAt(text, mask))
      if (d) {
        forcedBad++
        if (forcedBad === 1) fail(`${d} module(s) differ at forced mask ${mask} for ${label}`)
      }
    }
    if (forcedBad) continue

    // The auto-chosen matrix must be one this encoder could have produced —
    // i.e. it really is one of the eight, not a mangled ninth thing.
    let chosen = -1
    for (let mask = 0; mask < 8; mask++) {
      if (diffCount(auto, refAt(text, mask)) === 0) { chosen = mask; break }
    }
    if (chosen < 0) fail(`the auto-chosen matrix matches no mask at all for ${label}`)
    compared++
    if (diffCount(auto, theirsAuto) !== 0) maskOnly++
  }
} else {
  console.warn(
    '! check-qr: no reference implementation found, so the matrices were NOT diffed.\n' +
    '  Structural checks only. Install one and re-run before trusting a printed code:\n' +
    '    mkdir -p /tmp/qrref && cd /tmp/qrref && npm init -y && npm i qrcode\n' +
    '    QR_REF=/tmp/qrref node scripts/check-qr.mjs',
  )
}

await server.close()

if (failed) {
  console.error(`\ncheck-qr: ${failed} problem${failed === 1 ? '' : 's'}.`)
  process.exit(1)
}
console.log(
  `✓ qr: ${CORPUS.length} payloads structurally sound; 40 versions leave exactly the spec's data modules` +
  (compared
    ? `; ${compared} identical to the reference at all 8 forced masks` +
      (maskOnly ? ` (${maskOnly} chose a different mask — rule 4, see the header)` : '')
    : '; NOT diffed — no reference'),
)
