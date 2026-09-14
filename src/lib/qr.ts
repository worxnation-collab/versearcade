// A QR code, generated here, because a link on a wall is the church channel.
//
// ── Why this is ours rather than a dependency ──────────────────────────────
//
// Same bargain `juice/music.ts` and `juice/sound.ts` make for audio and
// `data/icons.tsx` makes for iconography: nothing to ship, cache or license,
// and it is DATA rather than art — the matrix is a pure function of the URL,
// so it cannot be a Nano Banana render (a baked image cannot take a runtime
// value, the same carve-out the church kit and the seals' wax live under).
//
// ── Why it is verified against somebody else's implementation ──────────────
//
// A wrong QR RENDERS PERFECTLY and scans wrong — or scans on the phone you
// tested with and fails on the one in a church foyer. That is the
// `check-trivia` shape exactly, so `scripts/check-qr.mjs` builds every matrix
// this file can produce over a corpus of real invite URLs and compares it
// MODULE BY MODULE against the `qrcode` npm package, installed outside the
// repo for the check alone. Agreement on every module of every version is the
// only evidence worth having here; "it scanned on my phone" is not.
//
// Byte mode only, because every payload is a URL. Error correction level Q
// (25%) rather than the usual M: this is printed and projected, and a sheet
// gets creased, glared on and photographed from the back of a room.

/** The finished code: `size` x `size` modules, true = dark. */
export interface QrMatrix {
  size: number
  version: number
  modules: boolean[][]
}

// ── Galois field GF(256) for Reed-Solomon ──────────────────────────────────
// Generated once at module load rather than written out as two 256-entry
// tables: the tables are derivable and a hand-typed one is a silent wrong
// answer, the same argument the Bible's verse-count table loses (it is NOT
// derivable, so it is typed and checked against published figures instead).

const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)
{
  let x = 1
  for (let i = 0; i < 255; i++) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d // the QR spec's primitive polynomial
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]
}

const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]])

/** The generator polynomial for `degree` error-correction codewords. */
function rsGenerator(degree: number): number[] {
  let poly = [1]
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0)
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= mul(poly[j], 1)
      next[j + 1] ^= mul(poly[j], EXP[i])
    }
    poly = next
  }
  return poly
}

function rsEncode(data: number[], degree: number): number[] {
  const gen = rsGenerator(degree)
  const rem = new Array(degree).fill(0)
  for (const byte of data) {
    const factor = byte ^ rem[0]
    rem.shift()
    rem.push(0)
    for (let i = 0; i < degree; i++) rem[i] ^= mul(gen[i + 1], factor)
  }
  return rem
}

// ── Version tables, level Q only ───────────────────────────────────────────
// Per version 1..40: total data codewords, EC codewords per block, and the
// block split (count in group 1, count in group 2). Group 2's blocks each hold
// one more data codeword than group 1's.
//
// Only level Q is carried. A second level is a second table to keep right, and
// nothing here wants one — see the header for why Q is the choice.

interface VersionSpec {
  /** Total data codewords across every block. */
  data: number
  /** EC codewords per block. */
  ec: number
  /** Blocks in group 1, blocks in group 2. */
  blocks: [number, number]
}

const Q: VersionSpec[] = [
  { data: 13, ec: 13, blocks: [1, 0] },
  { data: 22, ec: 22, blocks: [1, 0] },
  { data: 34, ec: 18, blocks: [2, 0] },
  { data: 48, ec: 26, blocks: [2, 0] },
  { data: 62, ec: 18, blocks: [2, 2] },
  { data: 76, ec: 24, blocks: [4, 0] },
  { data: 88, ec: 18, blocks: [2, 4] },
  { data: 110, ec: 22, blocks: [4, 2] },
  { data: 132, ec: 20, blocks: [4, 4] },
  { data: 154, ec: 24, blocks: [6, 2] },
  { data: 180, ec: 28, blocks: [4, 4] },
  { data: 206, ec: 26, blocks: [4, 6] },
  { data: 244, ec: 24, blocks: [8, 4] },
  { data: 261, ec: 20, blocks: [11, 5] },
  { data: 295, ec: 30, blocks: [5, 7] },
  { data: 325, ec: 24, blocks: [15, 2] },
  { data: 367, ec: 28, blocks: [1, 15] },
  { data: 397, ec: 28, blocks: [17, 1] },
  { data: 445, ec: 26, blocks: [17, 4] },
  { data: 485, ec: 30, blocks: [15, 5] },
  { data: 512, ec: 28, blocks: [17, 6] },
  { data: 568, ec: 30, blocks: [7, 16] },
  { data: 614, ec: 30, blocks: [11, 14] },
  { data: 664, ec: 30, blocks: [11, 16] },
  { data: 718, ec: 30, blocks: [7, 22] },
  { data: 754, ec: 28, blocks: [28, 6] },
  { data: 808, ec: 30, blocks: [8, 26] },
  { data: 871, ec: 30, blocks: [4, 31] },
  { data: 911, ec: 30, blocks: [1, 37] },
  { data: 985, ec: 30, blocks: [15, 25] },
  { data: 1033, ec: 30, blocks: [42, 1] },
  { data: 1115, ec: 30, blocks: [10, 35] },
  { data: 1171, ec: 30, blocks: [29, 19] },
  { data: 1231, ec: 30, blocks: [44, 7] },
  { data: 1286, ec: 30, blocks: [39, 14] },
  { data: 1354, ec: 30, blocks: [46, 10] },
  { data: 1426, ec: 30, blocks: [49, 10] },
  { data: 1502, ec: 30, blocks: [48, 14] },
  { data: 1582, ec: 30, blocks: [43, 22] },
  { data: 1666, ec: 30, blocks: [34, 34] },
]

/** Where the alignment-pattern centres sit, per version (empty for version 1). */
const ALIGN: number[][] = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46],
  [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70],
  [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90],
  [6, 28, 50, 72, 94], [6, 26, 50, 74, 98], [6, 30, 54, 78, 102], [6, 28, 54, 80, 106],
  [6, 32, 58, 84, 110], [6, 30, 58, 86, 114], [6, 34, 62, 90, 118], [6, 26, 50, 74, 98, 122],
  [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130], [6, 30, 56, 82, 108, 134],
  [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146],
  [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154], [6, 28, 54, 80, 106, 132, 158],
  [6, 32, 58, 84, 110, 136, 162], [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170],
]

/** Level Q's format bits, indexed by mask 0..7. Fixed by the spec. */
const FORMAT_Q = [
  0x355f, 0x3068, 0x3f31, 0x3a06, 0x24b4, 0x2183, 0x2eda, 0x2bed,
]

/** Version information (versions 7+ only), indexed from version 7. */
const VERSION_BITS = [
  0x07c94, 0x085bc, 0x09a99, 0x0a4d3, 0x0bbf6, 0x0c762, 0x0d847, 0x0e60d, 0x0f928, 0x10b78,
  0x1145d, 0x12a17, 0x13532, 0x149a6, 0x15683, 0x168c9, 0x177ec, 0x18ec4, 0x191e1, 0x1afab,
  0x1b08e, 0x1cc1a, 0x1d33f, 0x1ed75, 0x1f250, 0x209d5, 0x216f0, 0x228ba, 0x2379f, 0x24b0b,
  0x2542e, 0x26a64, 0x27541, 0x28c69,
]

// ── Encoding ───────────────────────────────────────────────────────────────

/** Byte mode's character-count field is 8 bits to version 9, 16 after. */
const countBits = (version: number) => (version <= 9 ? 8 : 16)

function smallestVersion(byteLength: number): number {
  for (let v = 1; v <= 40; v++) {
    const capacity = Q[v - 1].data * 8 - 4 - countBits(v)
    if (byteLength * 8 <= capacity) return v
  }
  throw new Error('qr: payload too long even for version 40')
}

class BitWriter {
  bits: number[] = []
  push(value: number, length: number) {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >> i) & 1)
  }
}

/** Data codewords for `bytes`, padded and split into the version's blocks. */
function codewords(bytes: number[], version: number): number[] {
  const spec = Q[version - 1]
  const w = new BitWriter()
  w.push(0b0100, 4) // byte mode
  w.push(bytes.length, countBits(version))
  for (const b of bytes) w.push(b, 8)

  const capacity = spec.data * 8
  // Terminator: up to four zero bits, or fewer if the code is nearly full.
  w.push(0, Math.min(4, capacity - w.bits.length))
  // Pad to a byte boundary, then alternate the spec's two pad bytes.
  while (w.bits.length % 8) w.bits.push(0)
  const data: number[] = []
  for (let i = 0; i < w.bits.length; i += 8) {
    let byte = 0
    for (let j = 0; j < 8; j++) byte = (byte << 1) | w.bits[i + j]
    data.push(byte)
  }
  for (let i = 0; data.length < spec.data; i++) data.push(i % 2 ? 0x11 : 0xec)

  // Split into blocks. Group 2's blocks each carry one more data codeword.
  const [g1, g2] = spec.blocks
  const total = g1 + g2
  const short = Math.floor(spec.data / total)
  const blocks: number[][] = []
  let at = 0
  for (let i = 0; i < total; i++) {
    const len = i < g1 ? short : short + 1
    blocks.push(data.slice(at, at + len))
    at += len
  }
  const ecBlocks = blocks.map((b) => rsEncode(b, spec.ec))

  // Interleave: one codeword from each block in turn, data first then EC.
  const out: number[] = []
  const longest = Math.max(...blocks.map((b) => b.length))
  for (let i = 0; i < longest; i++) {
    for (const b of blocks) if (i < b.length) out.push(b[i])
  }
  for (let i = 0; i < spec.ec; i++) {
    for (const b of ecBlocks) out.push(b[i])
  }
  return out
}

// ── Matrix ─────────────────────────────────────────────────────────────────

type Grid = (boolean | null)[][]

function blank(size: number): Grid {
  return Array.from({ length: size }, () => new Array(size).fill(null))
}

function placeFinder(g: Grid, row: number, col: number) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r
      const cc = col + c
      if (rr < 0 || cc < 0 || rr >= g.length || cc >= g.length) continue
      const edge = r === -1 || r === 7 || c === -1 || c === 7
      const ring = r === 0 || r === 6 || c === 0 || c === 6
      const core = r >= 2 && r <= 4 && c >= 2 && c <= 4
      g[rr][cc] = !edge && (ring || core)
    }
  }
}

function reserveFunctionPatterns(g: Grid, version: number) {
  const size = g.length
  placeFinder(g, 0, 0)
  placeFinder(g, 0, size - 7)
  placeFinder(g, size - 7, 0)

  // Timing patterns.
  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0
    g[6][i] = dark
    g[i][6] = dark
  }

  // Alignment patterns, skipping the three finder corners.
  const centres = ALIGN[version - 1]
  for (const r of centres) {
    for (const c of centres) {
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8)) continue
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          g[r + dr][c + dc] = Math.max(Math.abs(dr), Math.abs(dc)) !== 1
        }
      }
    }
  }

  // The dark module, and the format-info areas (filled properly later).
  g[size - 8][8] = true
  for (let i = 0; i < 9; i++) {
    if (g[8][i] === null) g[8][i] = false
    if (g[i][8] === null) g[i][8] = false
  }
  for (let i = 0; i < 8; i++) {
    if (g[8][size - 1 - i] === null) g[8][size - 1 - i] = false
    if (g[size - 1 - i][8] === null) g[size - 1 - i][8] = false
  }

  // Version information, versions 7 and up.
  if (version >= 7) {
    const bits = VERSION_BITS[version - 7]
    for (let i = 0; i < 18; i++) {
      const bit = ((bits >> i) & 1) === 1
      g[Math.floor(i / 3)][size - 11 + (i % 3)] = bit
      g[size - 11 + (i % 3)][Math.floor(i / 3)] = bit
    }
  }
}

/**
 * How many modules a version leaves free for data.
 *
 * Exported for `scripts/check-qr.mjs`, which asserts it equals the spec's
 * `total codewords * 8 + remainder bits`. That single number catches the whole
 * family of bugs where a function pattern is misplaced or missing: the data
 * then starts one module out and EVERY module after it is wrong, which looks
 * like noise rather than like a missing alignment square.
 */
export function freeModuleCount(version: number): number {
  let n = 0
  for (const row of reservedMap(version)) for (const v of row) if (!v) n++
  return n
}

/** True where a module belongs to a function pattern and takes no data. */
function reservedMap(version: number): boolean[][] {
  const size = version * 4 + 17
  const g = blank(size)
  reserveFunctionPatterns(g, version)
  return g.map((row) => row.map((v) => v !== null))
}

function placeData(g: Grid, reserved: boolean[][], bits: number[]) {
  const size = g.length
  let i = 0
  let upward = true
  for (let right = size - 1; right >= 1; right -= 2) {
    // Column 6 is the vertical timing pattern and is skipped entirely.
    if (right === 6) right = 5
    for (let step = 0; step < size; step++) {
      const row = upward ? size - 1 - step : step
      for (const col of [right, right - 1]) {
        if (reserved[row][col]) continue
        g[row][col] = i < bits.length ? bits[i] === 1 : false
        i++
      }
    }
    upward = !upward
  }
}

const MASKS: Array<(r: number, c: number) => boolean> = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
]

/** The spec's four penalty rules, summed. Lower is better. */
function penalty(m: boolean[][]): number {
  const size = m.length
  let score = 0

  // Rule 1 — runs of five or more of one colour, in rows and in columns.
  for (let i = 0; i < size; i++) {
    for (const line of [m[i], m.map((row) => row[i])]) {
      let run = 1
      for (let j = 1; j < size; j++) {
        if (line[j] === line[j - 1]) {
          run++
          if (run === 5) score += 3
          else if (run > 5) score += 1
        } else run = 1
      }
    }
  }

  // Rule 2 — every 2x2 block of one colour.
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = m[r][c]
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3
    }
  }

  // Rule 3 — the finder-like 1:1:3:1:1 run, with four light modules one side.
  const A = [true, false, true, true, true, false, true, false, false, false, false]
  const B = [false, false, false, false, true, false, true, true, true, false, true]
  const matches = (line: boolean[], at: number, pat: boolean[]) => {
    for (let k = 0; k < pat.length; k++) if (line[at + k] !== pat[k]) return false
    return true
  }
  for (let i = 0; i < size; i++) {
    for (const line of [m[i], m.map((row) => row[i])]) {
      for (let j = 0; j + 11 <= size; j++) {
        if (matches(line, j, A)) score += 40
        if (matches(line, j, B)) score += 40
      }
    }
  }

  // Rule 4 — deviation from a half-dark code.
  //
  // The spec's wording: take the two multiples of five either side of the dark
  // percentage, subtract 50 from each, halve-step by 5, and take the SMALLER.
  // That is what this computes. The widely-deployed `qrcode` npm package uses
  // `|ceil(percent / 5) - 10|` instead, which systematically charges 10 points
  // across the (50%, 55%) band where the spec charges none — so on a payload
  // whose masks land in that band the two implementations pick different
  // masks. `scripts/check-qr.mjs` pins that down rather than glossing it: every
  // matrix is compared at all eight FORCED masks (where the two must agree
  // exactly, and do), and any auto-mask disagreement must still be explained by
  // selection alone. Both choices produce a valid, scannable code — rule 4 is
  // about how even the code looks, not whether it decodes.
  let dark = 0
  for (const row of m) for (const v of row) if (v) dark++
  const percent = (dark * 100) / (size * size)
  score += Math.floor(Math.abs(percent - 50) / 5) * 10

  return score
}

function applyFormat(g: Grid, mask: number) {
  const size = g.length
  const bits = FORMAT_Q[mask]
  for (let i = 0; i < 15; i++) {
    const bit = ((bits >> i) & 1) === 1
    // The copy around the top-left finder.
    if (i < 6) g[i][8] = bit
    else if (i === 6) g[7][8] = bit
    else if (i === 7) g[8][8] = bit
    else if (i === 8) g[8][7] = bit
    else g[8][14 - i] = bit
    // The split copy along the other two.
    if (i < 8) g[8][size - 1 - i] = bit
    else g[size - 15 + i][8] = bit
  }
}

/**
 * Encode `text` as a QR matrix at error-correction level Q.
 *
 * The mask is CHOSEN rather than fixed: all eight are scored by the spec's four
 * penalty rules and the lowest wins, which is what keeps a code readable when
 * its payload happens to produce large blank runs. A fixed mask passes a
 * casual test and fails on the one URL that lands badly.
 *
 * `forceMask` exists for `scripts/check-qr.mjs` alone, and it is what makes the
 * check able to say WHICH half is wrong: comparing at a forced mask tests the
 * encoding, the block interleave and the module placement, while comparing the
 * auto-chosen matrix additionally tests the penalty scoring. Without it a
 * single "498 modules differ" tells you nothing about where to look.
 */
export function encodeQr(text: string, forceMask?: number): QrMatrix {
  const bytes = Array.from(new TextEncoder().encode(text))
  const version = smallestVersion(bytes.length)
  const size = version * 4 + 17
  const words = codewords(bytes, version)
  const bits: number[] = []
  for (const w of words) for (let i = 7; i >= 0; i--) bits.push((w >> i) & 1)

  const reserved = reservedMap(version)
  let best: boolean[][] | null = null
  let bestScore = Infinity
  let bestMask = 0
  for (let mask = 0; mask < 8; mask++) {
    if (forceMask !== undefined && mask !== forceMask) continue
    const g = blank(size)
    reserveFunctionPatterns(g, version)
    placeData(g, reserved, bits)
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!reserved[r][c] && MASKS[mask](r, c)) g[r][c] = !g[r][c]
      }
    }
    applyFormat(g, mask)
    const m = g.map((row) => row.map((v) => v === true))
    const score = penalty(m)
    if (score < bestScore) {
      bestScore = score
      best = m
      bestMask = mask
    }
  }
  void bestMask
  return { size, version, modules: best! }
}

/**
 * The matrix as one SVG path, plus the viewBox side it is drawn in.
 *
 * One path rather than a rect per module: a version 6 code is 1,681 modules and
 * roughly half are dark, so a rect each is ~800 nodes on a page that also has
 * to print. The quiet zone is included — four modules on every side, which the
 * spec requires and which a scanner genuinely needs. Without it a code printed
 * flush against a coloured panel simply will not read.
 */
export function qrPath(m: QrMatrix, quiet = 4): { d: string; side: number } {
  let d = ''
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      if (m.modules[r][c]) d += `M${c + quiet} ${r + quiet}h1v1h-1z`
    }
  }
  return { d, side: m.size + quiet * 2 }
}
