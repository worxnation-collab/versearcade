import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/store/auth'
import { useSettings } from '@/store/settings'
import { useJuice } from '@/juice/useJuice'
import { AppleGlyph } from '@/components/AppStoreBadge'
import { appStoreAsk, isAppleStoreTarget, openAppStore, storeName } from '@/lib/appStore'

// How long a ✕ buys you before we'd mention it again.
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000
// Don't ask a stranger for a favor: the bubble waits until they've actually
// played a few drops, so a review ask lands on someone who likes the thing.
const MIN_PLAYS = 3
// Let the home screen paint and settle first — a bubble that beats the page in
// is an interruption, not an invitation.
const APPEAR_DELAY_MS = 2600

/**
 * The low-key bubble that floats in over the home screen once a player is a few
 * drops deep. Two shapes, decided by where they're standing:
 *
 *   • in a native app → "leave a review" — the single highest-leverage thing a
 *                       happy player can do for a project this size.
 *   • on the web      → "get the app", on the store for their device.
 *
 * Every mention of the store goes through storeName(), because both shapes are
 * rendered by the Android build too — hardcoding "App Store" here is how a Play
 * user gets asked for an App Store review.
 *
 * Never a modal, never blocks play, one tap to dismiss, and silent for two weeks
 * after that. Tapping through retires it for good.
 */
export function AppStoreNudge() {
  const ask = appStoreAsk()
  const totalPlays = useAuth((s) => s.profile?.totalPlays ?? 0)
  const snoozedAt = useSettings((s) => s.appNudgeSnoozedAt)
  const done = useSettings((s) => s.appNudgeDone)
  const setSettings = useSettings((s) => s.set)
  const juice = useJuice()
  const [visible, setVisible] = useState(false)

  const eligible =
    ask !== 'none' && !done && totalPlays >= MIN_PLAYS && Date.now() - snoozedAt > SNOOZE_MS

  useEffect(() => {
    if (!eligible) return
    const t = setTimeout(() => setVisible(true), APPEAR_DELAY_MS)
    return () => clearTimeout(t)
  }, [eligible])

  if (!eligible) return null

  const review = ask === 'review'

  const onTap = () => {
    try {
      juice.coin()
    } catch {
      /* feedback must never block the link */
    }
    setSettings({ appNudgeDone: true })
    setVisible(false)
    openAppStore(review ? 'review' : 'download')
  }

  const dismiss = () => {
    setSettings({ appNudgeSnoozedAt: Date.now() })
    setVisible(false)
  }

  return (
    <AnimatePresence>
      {visible && (
        // The centring lives on this plain wrapper, not on the motion element —
        // framer-motion writes its own `transform`, so a translateX(-50%) here
        // would be silently clobbered by the entrance animation.
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 'calc(var(--safe-bottom) + 84px)',
            display: 'grid',
            justifyItems: 'center',
            padding: '0 14px',
            zIndex: 90,
            pointerEvents: 'none',
          }}
        >
        <motion.div
          initial={{ opacity: 0, y: 26, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 280, damping: 24 }}
          style={{ width: '100%', maxWidth: 492, pointerEvents: 'auto' }}
        >
          <div
            className="card"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: 12,
              background: 'var(--card-solid)',
              border: '1.5px solid var(--stroke)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            <button
              onClick={onTap}
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: 'none',
                border: 'none',
                padding: 0,
                textAlign: 'left',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: 38,
                  height: 38,
                  flexShrink: 0,
                  borderRadius: 12,
                  background: '#000',
                  color: '#fff',
                }}
              >
                {review ? (
                  <span style={{ fontSize: 20 }}>⭐</span>
                ) : isAppleStoreTarget() ? (
                  <AppleGlyph size={20} />
                ) : (
                  <span style={{ fontSize: 18 }}>▶</span>
                )}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: 'block', fontFamily: 'var(--font-display)', fontSize: 15 }}>
                  {review ? 'Enjoying Verse Arcade?' : isAppleStoreTarget() ? 'Get the iPhone app' : 'Get the Android app'}
                </b>
                <span className="faint" style={{ display: 'block', fontSize: 12.5, lineHeight: 1.35 }}>
                  {review
                    ? `A quick ${storeName()} review helps new players find the daily drop.`
                    : `Free on ${storeName()} — plus a nudge when the drop lands.`}
                </span>
              </span>
              <span style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)', fontSize: 18, flexShrink: 0 }}>
                →
              </span>
            </button>
            <button
              aria-label="Not now"
              onClick={dismiss}
              className="faint"
              style={{ background: 'none', border: 'none', fontSize: 16, padding: 4, cursor: 'pointer', flexShrink: 0, alignSelf: 'flex-start' }}
            >
              ✕
            </button>
          </div>
        </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

/**
 * The same two asks as an always-available settings row — someone who dismissed
 * the bubble (or wants to leave a review months later) can still get there.
 * Unlike the bubble this shows everywhere, including desktop: it's opt-in, so a
 * "we're on iPhone" row is information rather than a nag.
 */
export function AppStoreRow() {
  const ask = appStoreAsk()
  const setSettings = useSettings((s) => s.set)
  const review = ask === 'review'

  return (
    <>
      <h3 style={{ fontSize: 14, margin: '0 0 8px' }} className="dim">
        {review ? 'Rate us' : 'iPhone app'}
      </h3>
      <div className="card" style={{ marginBottom: 18 }}>
        <button
          onClick={() => {
            setSettings({ appNudgeDone: true })
            openAppStore(review ? 'review' : 'download')
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            width: '100%',
            padding: '10px 4px',
            background: 'none',
            border: 'none',
            color: 'inherit',
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          <span style={{ flex: 1 }}>{review ? '⭐ Leave an App Store review' : '📱 Get Verse Arcade on iPhone'}</span>
          <span className="pill" style={{ fontSize: 11, fontWeight: 800 }}>{review ? 'Review' : 'App Store'}</span>
        </button>
      </div>
      {review && (
        <p className="faint" style={{ fontSize: 11, lineHeight: 1.4, margin: '-12px 0 18px' }}>
          Reviews are how a small project gets found. Thirty seconds from you, months of reach for us.
        </p>
      )}
    </>
  )
}
