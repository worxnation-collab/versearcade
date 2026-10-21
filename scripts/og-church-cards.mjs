// The link-preview image for a church page: its building, at its tier and in
// its material, standing in the churchyard. 8 tiers x 4 skins = 32 cards.
//
//   node scripts/og-church-cards.mjs
//
// WHY PRE-COMPOSITED, AND NOT RENDERED PER CHURCH. A per-church image would
// mean drawing `ChurchScene` (SVG, live figures, a runtime-coloured kit) on a
// server for every crawler hit — an image pipeline of its own. But the two
// things a preview can honestly show about a church without a person in it are
// already finite: which building it has (its tier) and what it is made of (its
// skin). Both are Nano Banana paintings in `public/church/`, and the backdrop
// is the same `churchyard.jpg` the scene draws. So the cards are those
// paintings composed once, here, and the `church-og` edge function only has to
// PICK one — a lookup, no rendering, nothing that can be slow.
//
// No words are baked in: the name and city ride in og:title beside the image,
// where they are real text, and a baked caption would need a font on the build
// machine and could not say which church it is anyway. No people either — the
// crowd on the page is the page's, never the preview's.
//
// Re-run when a building render or the yard changes; outputs are committed
// (`public/og/church/<skin>-<tier>.jpg`), so a build never depends on sharp.

import sharp from 'sharp'
import { mkdirSync, statSync } from 'node:fs'

const W = 1200
const H = 630
/** Where the building's base stands, as a fraction of the card height —
 *  just under the treeline, on the near grass, the way ChurchScene stands it. */
const GROUND = 0.86
/** The tallest a building is drawn: high enough to read at thumbnail size,
 *  low enough to leave the sky above it. */
const MAX_H = 440

const SKINS = ['tile', 'classic', 'modern', 'glass']
const TIERS = ['gathering', 'chapel', 'country', 'parish', 'stone', 'great', 'cathedral', 'basilica']

mkdirSync('public/og/church', { recursive: true })

const yard = await sharp('public/church/churchyard.jpg').resize(W, H, { fit: 'cover', position: 'bottom' }).toBuffer()

let total = 0
for (const skin of SKINS) {
  for (const tier of TIERS) {
    const src = `public/church/church_${skin}_${tier}.png`
    // Trim the cut-out's empty margin first, so the base sits ON the ground
    // line rather than hovering by its padding (the `bottomPad` scar).
    const trimmed = await sharp(src).trim().toBuffer({ resolveWithObject: true })
    const scale = Math.min(MAX_H / trimmed.info.height, (W * 0.6) / trimmed.info.width)
    const bw = Math.round(trimmed.info.width * scale)
    const bh = Math.round(trimmed.info.height * scale)
    const building = await sharp(trimmed.data).resize(bw, bh).toBuffer()
    const left = Math.round((W - bw) / 2)
    const top = Math.round(H * GROUND - bh)

    // A soft contact shadow under the base, or a keyed building on grass reads
    // as a sticker (the kit's `Ground` ellipse does the same job on the board).
    const sw = Math.round(bw * 0.95)
    const shadow = Buffer.from(
      `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
        `<defs><radialGradient id="g"><stop offset="0" stop-color="#000" stop-opacity="0.45"/>` +
        `<stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>` +
        `<ellipse cx="${W / 2}" cy="${Math.round(H * GROUND) - 4}" rx="${sw / 2}" ry="${Math.round(sw * 0.07)}" fill="url(#g)"/></svg>`,
    )

    const out = `public/og/church/${skin}-${tier}.jpg`
    await sharp(yard)
      .composite([{ input: shadow }, { input: building, left, top }])
      .jpeg({ quality: 78, mozjpeg: true })
      .toFile(out)
    total += statSync(out).size
  }
}
console.log(`wrote ${SKINS.length * TIERS.length} cards, ${(total / 1024).toFixed(0)}KB total`)
