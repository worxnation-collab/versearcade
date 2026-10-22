import { useState } from 'react'
import { assetSlots, slotFamily, slotScale, SLOT_LINE_HEIGHT, templateFor, type AssetKind, type AssetPayload, type AssetSlot, type AssetTemplate, type SlotName } from '@/data/churchAssetTemplates'

// Draws a church's visual asset — a verse card, series header or announcement
// card (0133) — from its template id and the payload the server stored. The
// ONE renderer for every surface: the leader's review, the church tab and the
// /play/church result, so a card looks the same wherever it is seen.
//
// It is HTML laid out in percent and sized in container-width units (`cqw`), so
// the same template is exact at any width. The template decides where words go
// and what is behind them; the payload decides what the words are. A template
// with a background image draws it over the template's colour, and a failed
// image simply leaves the colour — never a broken frame.
export function ChurchAssetCard({
  kind,
  templateId,
  payload,
  placeholderTag = false,
  label,
}: {
  kind: AssetKind
  templateId: string
  payload: AssetPayload
  /** Leaders see a small tag while a template is still stand-in art. */
  placeholderTag?: boolean
  /** Accessible name; defaults to the card's own words. */
  label?: string
}) {
  const t = templateFor(templateId, kind)
  const words = assetSlots(kind, payload)
  const [imageOk, setImageOk] = useState(true)
  const aria = label ?? [words.title, words.body, words.reference].filter(Boolean).join(' — ')

  const card = (
    <div
      role="img"
      aria-label={aria}
      style={{
        position: 'relative', width: '100%', aspectRatio: `${t.aspect[0]} / ${t.aspect[1]}`,
        borderRadius: 14, overflow: 'hidden', containerType: 'inline-size',
        background: t.background.gradient ? `${t.background.gradient}, ${t.background.color}` : t.background.color,
        color: t.ink, isolation: 'isolate',
      }}
    >
      {t.background.image && imageOk && (
        <img
          src={t.background.image}
          alt=""
          aria-hidden
          draggable={false}
          onError={() => setImageOk(false)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: -2 }}
        />
      )}
      {t.background.image && imageOk && t.background.overlay && (
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: t.background.overlay, zIndex: -1 }} />
      )}
      {(Object.keys(t.slots) as SlotName[]).map((name) => {
        const box = t.slots[name]
        const text = words[name]
        if (!box || !text) return null
        return <Slot key={name} box={box} text={text} fonts={t.fonts} ink={t.ink} />
      })}
    </div>
  )
  // The stand-in tag sits UNDER the card, never on it: a corner badge covers
  // whichever slot the template put in that corner.
  if (!placeholderTag || !t.placeholder) return card
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      {card}
      <span className="faint" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        Placeholder art · {t.name}
      </span>
    </div>
  )
}

function Slot({ box, text, fonts, ink }: { box: AssetSlot; text: string; fonts?: AssetTemplate['fonts']; ink: string }) {
  // Sizing and family come from the template module so the PNG export
  // (lib/churchAssetExport.ts) lays a card out by the same numbers.
  const scale = slotScale(box, text)
  const family = slotFamily(box, fonts)
  return (
    <div
      style={{
        position: 'absolute', left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%`,
        display: 'flex', flexDirection: 'column',
        justifyContent: box.valign === 'middle' ? 'center' : box.valign === 'bottom' ? 'flex-end' : 'flex-start',
        textAlign: box.align ?? 'left', overflow: 'hidden',
      }}
    >
      <span
        style={{
          fontSize: `${box.size * scale}cqw`, lineHeight: SLOT_LINE_HEIGHT, fontFamily: family,
          fontWeight: box.weight ?? 500, fontStyle: box.italic ? 'italic' : 'normal',
          textTransform: box.uppercase ? 'uppercase' : 'none',
          letterSpacing: box.tracking ? `${box.tracking}em` : undefined,
          color: box.color ?? ink, overflowWrap: 'anywhere',
          display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: box.maxLines ?? 4, overflow: 'hidden',
        }}
      >
        {text}
      </span>
    </div>
  )
}
