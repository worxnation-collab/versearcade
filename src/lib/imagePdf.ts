// A PDF made only of pictures — one JPEG per page, nothing else — written by
// hand rather than through a library, because that is all the Sunday pack
// needs and a PDF of DCT images is about sixty lines of the format: a catalog,
// a page tree, and per page an image XObject plus a one-line content stream
// that paints it edge to edge. JPEG goes in as-is (`/DCTDecode`), so nothing
// is re-encoded and the file is the size of its pictures.
//
// Each page takes its picture's own shape, long side 11 inches (792pt): a
// landscape slide comes out landscape, a 4:5 card portrait, and a printer's
// "fit to page" does the rest. Nothing here can carry text, a link or a
// script — the pages are pictures, which is also why it can be handed to
// anybody.

export interface PdfPage {
  jpeg: Uint8Array
  /** Pixel size of the JPEG. */
  width: number
  height: number
}

const LONG_SIDE_PT = 792

export function buildImagePdf(pages: PdfPage[]): Blob {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const push = (b: Uint8Array) => { chunks.push(b); length += b.length }
  const text = (s: string) => push(enc.encode(s))
  // Object n lives at offsets[n - 1].
  const begin = (n: number) => { offsets[n - 1] = length; text(`${n} 0 obj\n`) }

  text('%PDF-1.4\n%âãÏÓ\n')
  // 1 catalog, 2 page tree, then three objects per page: page, image, content.
  const pageObj = (i: number) => 3 + i * 3
  begin(1); text('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  begin(2)
  text(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] >>\nendobj\n`)

  pages.forEach((p, i) => {
    const scale = LONG_SIDE_PT / Math.max(p.width, p.height)
    const w = Math.round(p.width * scale * 100) / 100
    const h = Math.round(p.height * scale * 100) / 100
    const n = pageObj(i)
    begin(n)
    text(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${n + 1} 0 R >> >> /Contents ${n + 2} 0 R >>\nendobj\n`)
    begin(n + 1)
    text(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`)
    push(p.jpeg)
    text('\nendstream\nendobj\n')
    const draw = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`
    begin(n + 2)
    text(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream\nendobj\n`)
  })

  const xref = length
  const count = 2 + pages.length * 3
  text(`xref\n0 ${count + 1}\n0000000000 65535 f \n`)
  for (const o of offsets) text(`${String(o).padStart(10, '0')} 00000 n \n`)
  text(`trailer\n<< /Size ${count + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  return new Blob(chunks as BlobPart[], { type: 'application/pdf' })
}

/** A canvas as a JPEG page. White under it, because JPEG has no transparency. */
export async function canvasPage(canvas: HTMLCanvasElement, quality = 0.92): Promise<PdfPage | null> {
  const flat = document.createElement('canvas')
  flat.width = canvas.width
  flat.height = canvas.height
  const ctx = flat.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, flat.width, flat.height)
  ctx.drawImage(canvas, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) => flat.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) return null
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), width: flat.width, height: flat.height }
}

/** Any image blob (a PNG from an existing export path) as a JPEG page. */
export async function blobPage(blob: Blob): Promise<PdfPage | null> {
  const bmp = await createImageBitmap(blob)
  const c = document.createElement('canvas')
  c.width = bmp.width
  c.height = bmp.height
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(bmp, 0, 0)
  bmp.close?.()
  return canvasPage(c)
}
