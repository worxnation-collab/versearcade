import { APP_URL } from '@/features/daily/shareCard'
import { isNativeApp } from './appStore'

// A postcard of your room.
//
// Every share this app has ever had is a SCORE — a row of green squares and a
// streak. This one is a picture of a place, which is the share a cozy game
// actually grows on, and it carries the same invite link the rest of them do.
//
// How it works, and why it is built this way:
//
//   The scene is already an <svg> in the DOM (RoomScene tags it
//   `data-room-scene`), so the postcard SERIALISES that rather than re-rendering
//   it. One room, one drawing — the same rule that made KeepScene a component.
//
//   An SVG loaded as an <img> never fetches external resources, so any <image>
//   inside it would export as a blank rectangle. The clone strips them, which
//   means a generated room painting is dropped and the DRAWN chamber underneath
//   is what ships on the card. That is the fallback working as designed, and it
//   is why RoomArt's furnishings must stay drawn (see its header).
//
//   The figures are NOT on the card. CrowdLife draws people as HTML positioned
//   over the scene, not as SVG, so they can't be serialised — and a postcard of
//   the room rather than of the person is the right picture anyway. Nothing
//   here reveals anything a visitor couldn't already see.

const W = 1120
const H = 760

/** Strip anything an <img>-loaded SVG cannot fetch. */
function sanitizeClone(svg: SVGSVGElement): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.removeAttribute('style')
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', '1120')
  clone.setAttribute('height', '600')
  // Generated paintings and any other external reference: dropped, so the drawn
  // room underneath is what gets exported rather than a blank rectangle.
  clone.querySelectorAll('image').forEach((n) => n.remove())
  // Editing furniture (targets, dashed rings) uses CSS variables, which do not
  // resolve in a detached document — and a postcard of a room mid-rearrange is
  // not the picture anyone wants to send.
  clone.querySelectorAll('[stroke-dasharray]').forEach((n) => n.remove())
  return clone
}

function drawCaption(ctx: CanvasRenderingContext2D, username: string) {
  ctx.fillStyle = '#0a051a'
  ctx.fillRect(0, 600, W, H - 600)
  ctx.fillStyle = '#ffd23f'
  ctx.font = 'bold 44px ui-rounded, "Trebuchet MS", system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText(`@${username}’s Upper Room`, 44, 662)
  ctx.fillStyle = '#b9b2cc'
  ctx.font = '28px system-ui, sans-serif'
  ctx.fillText(APP_URL.replace(/^https?:\/\//, ''), 44, 714)
}

/**
 * Render the room on screen to a PNG blob. Returns null when the browser can't
 * do it (no canvas, no scene mounted, a decode failure) — every caller treats
 * that as "no postcard", never as an error worth a dialog.
 */
export async function renderPostcard(username: string): Promise<Blob | null> {
  try {
    const svg = document.querySelector<SVGSVGElement>('svg[data-room-scene]')
    if (!svg) return null

    const xml = new XMLSerializer().serializeToString(sanitizeClone(svg))
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`

    const img = new Image()
    img.decoding = 'sync'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('svg decode failed'))
      img.src = url
    })

    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#0a051a'
    ctx.fillRect(0, 0, W, H)
    ctx.drawImage(img, 0, 0, W, 600)
    drawCaption(ctx, username)

    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  } catch {
    return null
  }
}

/** What actually happened, so the caller can say the right thing — or nothing. */
export type PostcardOutcome = 'shared' | 'saved' | 'cancelled' | 'failed'

/** A cancelled share sheet is a decision, not a fault. */
function wasCancelled(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name ?? ''
  const message = String((err as { message?: string } | null)?.message ?? '')
  return name === 'AbortError' || /cancel/i.test(message)
}

/** Blob -> bare base64 (no data: prefix), which is what Filesystem.writeFile wants. */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read failed'))
    reader.onload = () => {
      const result = String(reader.result)
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.readAsDataURL(blob)
  })
}

/**
 * Share the postcard, or save it.
 *
 * THE NATIVE PATH IS NOT AN OPTIMISATION — it is the only one that works.
 * Inside the Capacitor shell this used to fall all the way through to an
 * `<a download>` click, which a WKWebView simply ignores: no share sheet, no
 * file, no error. And because the click itself never throws, the old boolean
 * came back TRUE, so the screen didn't even show the "couldn't make one" line.
 * Tapping the button did nothing at all, silently, which is exactly how it was
 * found — on a real phone, months after it shipped. Any future "save a picture"
 * feature needs this same branch; a download link is a web-only affordance.
 *
 * So: Capacitor Share (via a file in the cache directory, the one place the
 * plugin can read from) on native, Web Share where the browser has it, and the
 * download only where a download means something.
 */
export async function sharePostcard(username: string): Promise<PostcardOutcome> {
  const blob = await renderPostcard(username)
  if (!blob) return 'failed'

  const text = `A little chamber on the wall. ${APP_URL}`

  if (isNativeApp()) {
    try {
      const [{ Filesystem, Directory }, { Share }] = await Promise.all([
        import('@capacitor/filesystem'),
        import('@capacitor/share'),
      ])
      // A fresh name each time: the sheet can hold on to the previous file, and
      // overwriting the one it is reading hands somebody last week's room.
      const { uri } = await Filesystem.writeFile({
        path: `upper-room-${Date.now()}.png`,
        data: await toBase64(blob),
        directory: Directory.Cache,
      })
      await Share.share({ title: 'My Upper Room', text, files: [uri] })
      return 'shared'
    } catch (err) {
      return wasCancelled(err) ? 'cancelled' : 'failed'
    }
  }

  const file = new File([blob], 'upper-room.png', { type: 'image/png' })
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData & { files?: File[] }) => boolean
  }

  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'My Upper Room', text })
      return 'shared'
    } catch (err) {
      // Waving the sheet away is not a failure and must not draw an error line
      // — or, worse, silently download a file nobody asked for.
      if (wasCancelled(err)) return 'cancelled'
      // The sheet refused the file: saving it is still a postcard in hand.
    }
  }

  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'upper-room.png'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
    return 'saved'
  } catch {
    return 'failed'
  }
}
