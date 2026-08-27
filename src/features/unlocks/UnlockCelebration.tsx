// The moment something unlocks.
//
// Everything earned in this app is derived from the player's stats, so an
// unlock used to be a tile that quietly changed its label — the share that
// finished King Baldwin's set produced no more feedback than the nine before
// it. store/unlocks notices the change; this is the part that says so.
//
// Two components, mounted once at the root:
//   • UnlockWatcher — no UI. Feeds the store the facts it can't reach on its
//     own (whether notifications are actually on) and re-scans when anything
//     an unlock depends on moves.
//   • UnlockCelebration — the card itself.
//
// The card is a celebration, not a dialog: it never blocks play (it holds its
// queue while a run is in progress and lands afterwards), it offers to put the
// thing on rather than making you go find it, and it can always be waved away.

import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { useAuth } from '@/store/auth'
import { useReminders } from '@/store/reminders'
import { useUnlocks, type UnlockAward } from '@/store/unlocks'
import { useJuice } from '@/juice/useJuice'
import { DEFAULT_AVATAR } from '@/data/avatar'
import type { AvatarSpec } from '@/types'

/**
 * Routes where a run is actually in progress. A confetti card thrown over a
 * live quiz is an interruption, not a reward — the queue simply waits, and the
 * result screen is where it lands.
 */
const MID_RUN = /^\/play\/run$|^\/play\/practice\/[^/]+$|^\/battle\/(cpu|[^/]+\/play)$|^\/study\/focus$/

export function UnlockWatcher() {
  const profile = useAuth((s) => s.profile)
  const scan = useUnlocks((s) => s.scan)
  const refreshNotifications = useUnlocks((s) => s.refreshNotifications)
  // Reminder prefs are device state, and flipping one completes an unlock.
  const remindersSig = useReminders(
    (s) => `${s.supported}|${s.permission}|${s.dropEnabled}|${s.studyEnabled}|${s.loaded}`,
  )

  // Web Push has no store to subscribe to — the truth is the browser's actual
  // subscription — so re-ask on mount, whenever the native prefs move, and
  // whenever the tab comes back, which is when a permission prompt answered in
  // browser chrome finally resolves.
  useEffect(() => {
    void refreshNotifications()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshNotifications()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refreshNotifications, remindersSig])

  // Re-scan whenever anything an unlock reads has moved. A string signature
  // rather than the profile object: the profile is replaced on every write
  // (score, settings, equipped border) and none of those change what's owned.
  const signature = profile
    ? [
        profile.id,
        profile.longestStreak,
        profile.level,
        profile.totalPlays,
        (profile.sharedDays ?? []).length,
        profile.referralCount ?? 0,
        profile.churchId ?? '',
        (profile.ownedSkins ?? []).join(','),
        profile.founder ? 1 : 0,
        profile.isAdmin ? 1 : 0,
      ].join('|')
    : ''

  useEffect(() => {
    if (signature) scan()
  }, [signature, scan])

  return null
}

/** The look to show on the card: the new thing, on top of what they wear now. */
function previewSpec(award: UnlockAward, spec: AvatarSpec): AvatarSpec {
  if (award.skinId) return { ...spec, skinId: award.skinId, regalia: null }
  if (award.armorSlot) return { ...spec, armor: { ...spec.armor, [award.armorSlot]: true } }
  return spec
}

export function UnlockCelebration() {
  const award = useUnlocks((s) => s.queue[0] ?? null)
  const dismiss = useUnlocks((s) => s.dismiss)
  const profile = useAuth((s) => s.profile)
  const setAvatarCharacter = useAuth((s) => s.setAvatarCharacter)
  const setCosmetics = useAuth((s) => s.setCosmetics)
  const juice = useJuice()
  const { pathname } = useLocation()

  const holding = MID_RUN.test(pathname)
  const showing = award && profile && !holding ? award : null

  // One burst per award, when it actually appears (not when it's queued).
  useEffect(() => {
    if (showing) juice.celebrate()
  }, [showing?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!showing || !profile) return null

  const spec = profile.avatarCharacter ?? DEFAULT_AVATAR
  const wearable = !!showing.skinId || !!showing.armorSlot || !!showing.borderKey || !!showing.badgeKey

  const wear = () => {
    juice.select()
    if (showing.skinId) setAvatarCharacter({ ...spec, skinId: showing.skinId, regalia: null })
    else if (showing.armorSlot) setAvatarCharacter({ ...spec, armor: { ...spec.armor, [showing.armorSlot]: true } })
    else if (showing.borderKey) void setCosmetics({ border: showing.borderKey })
    else if (showing.badgeKey) void setCosmetics({ badge: showing.badgeKey })
    dismiss()
  }

  const close = () => {
    juice.tap()
    dismiss()
  }

  return (
    <AnimatePresence>
      <motion.div
        key={showing.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={close}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 90,
          display: 'grid',
          placeItems: 'center',
          padding: 20,
          background: 'rgba(8, 6, 20, 0.78)',
          backdropFilter: 'blur(6px)',
        }}
      >
        <motion.div
          className="card"
          onClick={(e) => e.stopPropagation()}
          initial={{ scale: 0.7, y: 30, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          style={{ width: '100%', maxWidth: 340, textAlign: 'center', padding: '22px 18px' }}
        >
          <span className="pill" style={{ background: 'var(--gold)', color: '#1a1206', fontWeight: 800 }}>
            ✨ Unlocked
          </span>

          <motion.div
            style={{ display: 'grid', placeItems: 'center', margin: '16px 0 12px' }}
            initial={{ scale: 0.5, rotate: -8 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.1 }}
          >
            <Avatar
              emoji={profile.avatarEmoji}
              character={previewSpec(showing, spec)}
              border={showing.borderKey ?? profile.avatarBorder ?? 'default'}
              badge={showing.badgeKey ?? null}
              size={116}
            />
          </motion.div>

          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 26, margin: '0 0 6px' }}>{showing.name}</h2>
          <p className="dim" style={{ fontSize: 13, lineHeight: 1.5, margin: '0 0 12px' }}>{showing.blurb}</p>

          {showing.contents && (
            <ul
              style={{
                listStyle: 'none',
                margin: '0 0 12px',
                padding: 0,
                display: 'grid',
                gap: 4,
                fontSize: 12,
                textAlign: 'left',
              }}
            >
              {showing.contents.map((c) => (
                <li key={c} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: 'var(--good)' }}>✓</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          )}

          <p className="faint" style={{ fontSize: 11, margin: '0 0 16px' }}>{showing.how}</p>

          <div style={{ display: 'grid', gap: 8 }}>
            {wearable && <Button full onClick={wear}>Wear it now</Button>}
            <button className="pill" style={{ width: '100%' }} onClick={close}>
              {wearable ? 'Maybe later' : 'Nice'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
