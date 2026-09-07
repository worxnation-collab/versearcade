import { useEffect, useState } from 'react'
import { useSaveNudge } from '@/store/saveNudge'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/Button'
import { useGame } from '@/store/game'
import { useCollection } from '@/store/collection'
import { useAuth } from '@/store/auth'
import { collectibleByKey, rarityColor } from '@/data/collectibles'
import { Avatar } from '@/components/Avatar'
import { drawChestItem, itemById, DEFAULT_AVATAR } from '@/data/avatar'
import { useJuice } from '@/juice/useJuice'
import { useSeason } from '@/store/season'
import { chestSkinById } from '@/data/season'
import { GENERATED_ART } from '@/data/generatedArt'
import { CARD_BACKGROUNDS } from '@/data/playerCards'

// A once-a-day reward that reinforces the daily loop: it unlocks only after you
// play today's verse, then gives a random relic (common / uncommon / rare) —
// one more reason to keep the streak alive and come back tomorrow.
export function DailyChest() {
  const todayDate = useGame((s) => s.todayDate)
  const playedToday = useGame((s) => s.playedToday)
  const load = useCollection((s) => s.load)
  const chestOpenedOn = useCollection((s) => s.chestOpenedOn)
  const openChest = useCollection((s) => s.openChest)
  const juice = useJuice()
  const profile = useAuth((s) => s.profile)
  const grantItem = useAuth((s) => s.grantItem)
  const setCardBackground = useAuth((s) => s.setCardBackground)
  const [onCard, setOnCard] = useState(false)
  const [revealed, setRevealed] = useState<{
    kind: 'relic' | 'boost'
    key?: string
    rarity?: string
    /** First time ever — it just got stamped into their Bible. */
    newStamp?: boolean
    /** Copies now held, so a duplicate can say what it's good for. */
    qty?: number
  } | null>(null)
  const [itemDrop, setItemDrop] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  // What the chest looks like — an equipped seasonal chest skin, or the default.
  // Cosmetic only: the skin never changes what's inside or how often it opens.
  const chest = chestSkinById(useSeason((s) => s.equipped.chest))
  // The painted chest (art/chest.json), for the default skin only — a seasonal
  // chest skin is its own glyph and stays one. Two states, closed and open, and
  // the glyph is the drawn fallback for an ungenerated build.
  const painted = chest.id === 'chest_classic' && GENERATED_ART['chest_closed'] && GENERATED_ART['chest_open']
  const ChestArt = ({ open, size, dim }: { open: boolean; size: number; dim?: boolean }) =>
    painted ? (
      <img
        src={open ? GENERATED_ART['chest_open'] : GENERATED_ART['chest_closed']}
        alt=""
        aria-hidden
        width={size}
        height={size}
        style={{ width: size, height: size, objectFit: 'contain', display: 'block', margin: '0 auto', opacity: dim ? 0.55 : 1 }}
      />
    ) : (
      <div style={{ fontSize: size * 0.85, lineHeight: 1, opacity: dim ? 0.5 : 1 }}>{chest.glyph}</div>
    )

  useEffect(() => {
    load()
  }, [load])

  const openedToday = chestOpenedOn(todayDate)

  // Opening takes a beat. It used to be tap → reveal in the same frame, which
  // is a vending machine; the shake-then-burst is what makes a chest a chest.
  // The roll itself is instant and happens under the shake, so nothing here
  // is a fake delay on a network call.
  const open = async () => {
    if (opening) return
    setOpening(true)
    juice.whoosh()
    const [res] = await Promise.all([openChest(todayDate), new Promise((r) => setTimeout(r, 950))])
    setOpening(false)
    if (res.alreadyOpened) return
    // Opening the chest is worth miles on the road, and finishes a quest.
    void useSeason.getState().track('chest_open')
    if (res.kind === 'boost') {
      setRevealed({ kind: 'boost' })
      juice.levelUp()
    } else if (res.key) {
      setRevealed({ kind: 'relic', key: res.key, rarity: res.rarity, newStamp: res.newStamp, qty: res.qty })
      juice.celebrate()
      // A guest's first stamp is the moment to say where it lives. No-op for
      // an account, in a keyless build, and after the first time.
      if (res.newStamp) {
        useSaveNudge.getState().offer({
          thing: 'That stamp',
          line: 'The chest, the relics it turns up and the card backgrounds they unlock are kept on this device.',
        })
      }
    }
    // Bonus: a chest may also drop a wearable avatar item (free, cosmetic).
    if (Math.random() < 0.45) {
      const dropped = drawChestItem(profile?.ownedItems ?? [], Math.random())
      if (dropped) {
        grantItem(dropped)
        setItemDrop(dropped)
      }
    }
  }

  const isBoost = revealed?.kind === 'boost'
  const relic = revealed?.kind === 'relic' && revealed.key ? collectibleByKey(revealed.key) : null
  const rarity = relic?.rarity ?? 'common'
  const glow = isBoost ? '#ffd23f' : rarityColor[rarity]

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        marginTop: 16,
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
        borderColor: revealed ? glow : 'var(--stroke)',
        boxShadow: revealed ? `0 0 26px ${glow}55` : undefined,
      }}
    >
      <AnimatePresence mode="wait">
        {isBoost ? (
          // ——— Rare XP Boost reveal ———
          <motion.div key="boost" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {painted && <ChestArt open size={64} />}
            <motion.div
              initial={{ scale: 0.3, rotate: -12, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 240, damping: 12 }}
              style={{ fontSize: 56 }}
            >
              ⚡
            </motion.div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, marginTop: 6 }} className="gradient-text">
              XP Boost!
            </div>
            <div style={{ fontSize: 11, color: '#ffd23f', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>
              rare find
            </div>
            <p className="faint" style={{ fontSize: 13, marginTop: 8 }}>
              Apply it before a daily verse for <b style={{ color: 'var(--gold)' }}>+50% XP</b>. Saved until you use it.
            </p>
            <p className="faint" style={{ fontSize: 12, marginTop: 10 }}>Come back tomorrow for another chest.</p>
          </motion.div>
        ) : relic ? (
          // ——— Relic reveal ———
          <motion.div key="reveal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {painted && <ChestArt open size={64} />}
            <motion.div
              initial={{ scale: 0.3, rotate: -12, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 240, damping: 12 }}
              style={{ fontSize: 56 }}
            >
              {relic.emoji}
            </motion.div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, marginTop: 6 }}>{relic.name}</div>
            <div style={{ fontSize: 11, color: glow, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>
              {rarity} relic
            </div>
            <p className="faint" style={{ fontSize: 13, marginTop: 8 }}>{relic.description}</p>

            {/* Say what actually just happened. The reveal used to name the
                relic and stop, so a first find and a duplicate looked identical
                — and a duplicate genuinely was nothing before inventory existed.
                Now one presses a stamp and the other is something to give. */}
            {revealed?.newStamp ? (
              <>
                <p style={{ fontSize: 12, marginTop: 10, color: 'var(--gold)', lineHeight: 1.5 }}>
                  ✦ Stamped into your Bible — its card background is yours now.
                </p>
                {/* "Is yours now" with nowhere to tap was a reward described
                    rather than handed over. One tap, right here. */}
                {revealed.key && CARD_BACKGROUNDS.some((b) => b.key === revealed.key) && (onCard || profile?.cardBackground !== revealed.key) && (
                  <div style={{ marginTop: 10 }}>
                    <Button
                      variant={onCard ? 'secondary' : 'gold'}
                      full
                      disabled={onCard}
                      onClick={async () => {
                        const r = await setCardBackground(revealed.key!)
                        if (r.ok) { juice.coin(); setOnCard(true) }
                      }}
                    >
                      {onCard ? '✓ On your card' : '🃏 Put it on my card'}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <p style={{ fontSize: 12, marginTop: 10, color: 'var(--mint)', lineHeight: 1.5 }}>
                You already have this one{revealed?.qty && revealed.qty > 1 ? ` — that’s ${revealed.qty}` : ''}.
                Spare copies are worth giving: donate it to your church from your Inventory.
              </p>
            )}

            <p className="faint" style={{ fontSize: 12, marginTop: 10 }}>Come back tomorrow for another.</p>
          </motion.div>
        ) : openedToday ? (
          // ——— Already opened today ———
          <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <ChestArt open size={56} dim />
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, marginTop: 6 }}>Chest opened</div>
            <p className="faint" style={{ fontSize: 13, marginTop: 4 }}>Come back tomorrow for a new relic.</p>
          </motion.div>
        ) : playedToday ? (
          // ——— Ready to open ———
          <motion.div key="ready" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                background: 'radial-gradient(300px 160px at 50% 0%, rgba(255,210,63,0.16), transparent 70%)',
              }}
            />
            <motion.div
              animate={
                opening
                  ? { rotate: [0, -14, 14, -12, 12, -8, 8, 0], y: [0, -6, 0, -6, 0, -8, 0], scale: [1, 1.05, 1.1, 1.15] }
                  : { rotate: [0, -6, 6, -6, 0], y: [0, -3, 0] }
              }
              transition={opening ? { duration: 0.9, ease: 'easeInOut' } : { repeat: Infinity, repeatDelay: 1.4, duration: 0.7 }}
              style={{ filter: opening ? 'drop-shadow(0 0 18px rgba(255,210,63,0.9))' : undefined }}
            >
              <ChestArt open={false} size={84} />
            </motion.div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, marginTop: 6 }}>Daily Chest</div>
            <p className="dim" style={{ fontSize: 13, marginTop: 4 }}>A relic is waiting inside.</p>
            <div style={{ marginTop: 14 }}>
              <Button variant="gold" full disabled={opening} onClick={open}>
                {opening ? 'Opening…' : 'Open today’s chest ✨'}
              </Button>
            </div>
          </motion.div>
        ) : (
          // ——— Locked until they play ———
          <motion.div key="locked" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <ChestArt open={false} size={56} dim />
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, marginTop: 6 }}>Daily Chest</div>
            <p className="faint" style={{ fontSize: 13, marginTop: 4 }}>Play today’s verse to unlock your chest.</p>
          </motion.div>
        )}
      </AnimatePresence>

      {itemDrop &&
        (() => {
          const def = itemById(itemDrop)
          if (!def) return null
          const base = profile?.avatarCharacter ?? DEFAULT_AVATAR
          const preview = { ...base, regalia: null, items: { ...(base.items ?? {}), [def.slot]: def.id } }
          return (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--stroke)', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}
            >
              <Avatar emoji={profile?.avatarEmoji ?? '🙂'} character={preview} size={52} ring={false} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>You also found an item</div>
                <b style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>{def.name}</b>
                <div className="faint" style={{ fontSize: 12 }}>{def.rarity} · equip it on your profile</div>
              </div>
            </motion.div>
          )
        })()}
    </motion.div>
  )
}
