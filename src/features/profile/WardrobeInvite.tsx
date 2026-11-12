import { AnimatePresence, motion } from 'framer-motion'
import { Button } from '@/components/Button'
import { Character } from '@/components/Character'
import { toLayered } from '@/components/CharacterPicker'
import { equippedSkinId, isOverlaySkin } from '@/data/avatar'
import { isLayered } from '@/data/layered'
import { useAuth } from '@/store/auth'
import { useSettings } from '@/store/settings'
import { useJuice } from '@/juice/useJuice'

// The new wardrobe, offered ONCE to a player whose character predates it.
//
// Their own character is drawn twice — as it is, and as it would look in the
// new art (same figure, tone and hair colour) — and nothing changes unless
// they tap "Try it". "Keep mine" retires the card for good; so does trying it.
// Never shown to: a player with no character (they never built one, and the
// default stand-in already draws in the new art), one already in the new
// wardrobe, or one wearing a full skin (the new art would sit under it unseen).
// Remembered in settings.tipsSeen, the FirstVisitTip flag, so it is one flag
// per device and never counted.
const SEEN = 'wardrobe-invite'

export function WardrobeInvite({ onCustomize }: { onCustomize: () => void }) {
  const spec = useAuth((s) => s.profile?.avatarCharacter ?? null)
  const setAvatarCharacter = useAuth((s) => s.setAvatarCharacter)
  const seen = useSettings((s) => s.tipsSeen.includes(SEEN))
  const set = useSettings((s) => s.set)
  const juice = useJuice()

  const worn = spec ? equippedSkinId(spec) : null
  const covered = !!worn && !isOverlaySkin(worn)
  const show = !seen && !!spec && !isLayered(spec) && !covered

  const retire = () => set({ tipsSeen: [...useSettings.getState().tipsSeen, SEEN] })

  return (
    <AnimatePresence initial={false}>
      {show && spec && (
        <motion.div
          key="wardrobe-invite"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          className="card"
          style={{ marginBottom: 14, padding: 14, overflow: 'hidden' }}
        >
          <div style={{ fontWeight: 800, fontSize: 15 }}>New: build your character piece by piece</div>
          <p className="dim" style={{ margin: '4px 0 10px', fontSize: 13, lineHeight: 1.45 }}>
            Hair, tops, legs, shoes and hats, in any colour. Here's you in the new look —
            nothing changes unless you say so.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 18, marginBottom: 12 }}>
            <figure style={{ margin: 0, textAlign: 'center', opacity: 0.75 }}>
              <Character spec={spec} size={84} fullBody />
              <figcaption className="faint" style={{ fontSize: 11, marginTop: 2 }}>Now</figcaption>
            </figure>
            <span aria-hidden className="dim" style={{ fontSize: 18, paddingBottom: 40 }}>→</span>
            <figure style={{ margin: 0, textAlign: 'center' }}>
              <Character spec={toLayered(spec)} size={104} fullBody />
              <figcaption className="dim" style={{ fontSize: 11, marginTop: 2, fontWeight: 700 }}>New</figcaption>
            </figure>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Button variant="secondary" full onClick={() => { juice.select?.(); retire() }}>Keep mine</Button>
            <Button
              variant="gold"
              full
              onClick={() => {
                juice.select?.()
                setAvatarCharacter(toLayered(spec))
                retire()
                onCustomize()
              }}
            >
              Try it
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
