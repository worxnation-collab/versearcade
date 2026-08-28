import { APP_URL } from '@/features/daily/shareCard'

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

/**
 * Share the postcard, or save it.
 *
 * Web Share with a file where it exists (every phone this app cares about), and
 * a download everywhere else. Returns false only when nothing at all could be
 * produced — a share the user CANCELS is not a failure and must not draw an
 * error line.
 */
export async function sharePostcard(username: string): Promise<boolean> {
  const blob = await renderPostcard(username)
  if (!blob) return false

  const file = new File([blob], 'upper-room.png', { type: 'image/png' })
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData & { files?: File[] }) => boolean
  }

  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({
        files: [file],
        title: 'My Upper Room',
        text: `A little chamber on the wall. ${APP_URL}`,
      })
      return true
    } catch {
      // Cancelled, or the sheet refused the file — fall through to saving it,
      // which is still a postcard in the player's hands.
    }
  }

  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'upper-room.png'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
    return true
  } catch {
    return false
  }
}
