import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { CardArt } from '@/data/cardArt'
import { cardArtProps, cardBgByKey } from '@/data/playerCards'
import { bundleItemCount, skinById, type BundleDef } from '@/data/avatar'
import { bundleBuyUrl } from '@/lib/config'
import { storefrontEnabled } from '@/lib/commerce'
import { useJuice } from '@/juice/useJuice'
import type { AvatarSpec } from '@/types'

// The buy sheet for a BUNDLE — one price, all or nothing. Everything inside is
// swipeable before you pay: each skin worn by YOUR character (so you see the
// look you'd actually get, not a stock figure) and each calling card painted
// full-bleed. There is deliberately no per-item buy button; the pack is the
// only thing for sale.

interface Slide {
  key: string
  label: string
  kind: 'skin' | 'card'
  blurb: string
}

export function BundleSheet({
  bundle,
  spec,
  emoji,
  username,
  owned,
  onClose,
}: {
  bundle: BundleDef
  spec: AvatarSpec
  emoji: string
  username: string
  owned: boolean
  onClose: () => void
}) {
  const juice = useJuice()
  const [i, setI] = useState(0)

  const slides: Slide[] = [
    ...bundle.skins.map((id): Slide => {
      const s = skinById(id)
      return { key: id, label: s?.name ?? id, kind: 'skin', blurb: s?.blurb ?? '' }
    }),
    ...bundle.cards.map((key): Slide => {
      const c = cardBgByKey(key)
      return { key, label: c.name, kind: 'card', blurb: 'Calling card — the art behind your player card.' }
    }),
  ]

  const go = (next: number) => {
    const clamped = Math.max(0, Math.min(slides.length - 1, next))
    if (clamped === i) return
    juice.select()
    setI(clamped)
  }

  const buyUrl = bundleBuyUrl(bundle.id)
  // Native builds have no storefront, so this sheet is unreachable there (the
  // pack tile is hidden — see lib/commerce). Kept as a second lock: if it ever
  // did open, it must not show a price or a way to pay.
  const store = storefrontEnabled()
  const canBuy = !owned && !!buyUrl && store

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.62)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 20 }}
    >
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360, width: '100%', textAlign: 'center' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>{bundle.name}</h3>
        <p className="faint" style={{ fontSize: 12, marginTop: 2 }}>
          {bundleItemCount(bundle)} items · sold as one pack
        </p>

        {/* Swipeable preview of everything inside. */}
        <div style={{ position: 'relative', marginTop: 12, borderRadius: 16, overflow: 'hidden', border: '1px solid var(--stroke)', background: 'var(--card-solid)' }}>
          <motion.div
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.16}
            onDragEnd={(_, info) => {
              if (info.offset.x < -40 || info.velocity.x < -450) go(i + 1)
              else if (info.offset.x > 40 || info.velocity.x > 450) go(i - 1)
            }}
            animate={{ x: `${-i * 100}%` }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            style={{ display: 'flex', cursor: 'grab', touchAction: 'pan-y' }}
          >
            {slides.map((s) => (
              <div key={s.key} style={{ minWidth: '100%', height: 190, position: 'relative', display: 'grid', placeItems: 'center' }}>
                {s.kind === 'skin' ? (
                  <div style={{ pointerEvents: 'none' }}>
                    <Avatar emoji={emoji} character={{ ...spec, skinId: s.key, regalia: null }} size={150} ring={false} />
                  </div>
                ) : (
                  <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
                    <CardArt {...cardArtProps(s.key)} id={`bundle-${bundle.id}-${s.key}`} />
                  </div>
                )}
              </div>
            ))}
          </motion.div>

          {/* Step arrows, for anyone not swiping. */}
          {i > 0 && <StepArrow dir="prev" onClick={() => go(i - 1)} />}
          {i < slides.length - 1 && <StepArrow dir="next" onClick={() => go(i + 1)} />}
        </div>

        {/* Which one you're looking at. */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10 }}>
          {slides.map((s, n) => (
            <button
              key={s.key}
              onClick={() => go(n)}
              aria-label={`Preview ${s.label}`}
              style={{
                width: n === i ? 18 : 7, height: 7, borderRadius: 999, padding: 0, cursor: 'pointer',
                border: 'none', transition: 'width 0.2s, background 0.2s',
                background: n === i ? 'var(--gold)' : 'var(--stroke)',
              }}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={slides[i].key}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
            style={{ marginTop: 8, minHeight: 62 }}
          >
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>{slides[i].label}</b>
            <p className="faint" style={{ fontSize: 12, marginTop: 3, lineHeight: 1.45 }}>{slides[i].blurb}</p>
          </motion.div>
        </AnimatePresence>

        <p style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>{bundle.blurb}</p>

        {owned ? (
          <p style={{ marginTop: 12, fontWeight: 800, color: 'var(--good)' }}>✓ You own this pack</p>
        ) : (
          <>
            {store && (
              <p style={{ marginTop: 10, marginBottom: 12, fontFamily: 'var(--font-display)', fontSize: 26 }} className="gradient-text">
                {bundle.price}
              </p>
            )}
            {canBuy ? (
              <>
                <Button variant="gold" full onClick={() => {
                  juice.coin()
                  // "<username>-<sku>" as Stripe's client_reference_id, so the
                  // webhook grants the whole pack to the right account.
                  const ref = encodeURIComponent(`${username}-${bundle.sku}`)
                  const url = buyUrl + (buyUrl.includes('?') ? '&' : '?') + 'client_reference_id=' + ref
                  window.open(url, '_blank', 'noopener,noreferrer')
                  onClose()
                }}>
                  Get the pack — {bundle.price}
                </Button>
                <p className="faint" style={{ fontSize: 10, marginTop: 8, lineHeight: 1.4 }}>
                  All {bundleItemCount(bundle)} items unlock together right after checkout. Thank you for supporting a solo builder! 🙏
                </p>
              </>
            ) : store ? (
              <p className="faint" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
                Purchases are opening soon — check back shortly. 🙏
              </p>
            ) : null}
          </>
        )}
        <button className="pill" style={{ marginTop: 12 }} onClick={onClose}>
          {owned ? 'Close' : 'Maybe later'}
        </button>
      </div>
    </div>
  )
}

function StepArrow({ dir, onClick }: { dir: 'prev' | 'next'; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={dir === 'prev' ? 'Previous item' : 'Next item'}
      style={{
        position: 'absolute', top: '50%', transform: 'translateY(-50%)',
        [dir === 'prev' ? 'left' : 'right']: 6,
        width: 30, height: 30, borderRadius: 999, cursor: 'pointer',
        border: '1px solid var(--stroke)', background: 'rgba(0,0,0,0.45)',
        color: '#fff', fontSize: 15, lineHeight: 1, display: 'grid', placeItems: 'center',
      }}
    >
      {dir === 'prev' ? '‹' : '›'}
    </button>
  )
}
