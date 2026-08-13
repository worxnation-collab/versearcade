import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Avatar } from '@/components/Avatar'
import { useAuth } from '@/store/auth'
import { useJuice } from '@/juice/useJuice'
import { BORDERS, BADGES, isUnlocked } from '@/data/cosmetics'
import {
  ARMOR,
  SKINS,
  ROBES,
  DEFAULT_AVATAR,
  distinctSharedDays,
  accessOwned,
  accessLabel,
  ITEMS,
  FULL_SKINS,
  skinOwned,
  equippedSkinId,
  type ArmorPieceDef,
  type ItemDef,
  type SkinDef,
  type Swatch,
} from '@/data/avatar'

// "Customize" — streak-unlocked avatar borders + badges. Unlock eligibility is
// based on the player's LONGEST streak ever, so a missed day never takes a
// cosmetic away. Locked items stay visible (with the milestone needed) as a
// gentle pull toward the next streak.
export function CustomizeSection() {
  const profile = useAuth((s) => s.profile)!
  const setCosmetics = useAuth((s) => s.setCosmetics)
  const juice = useJuice()
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [devNoteOpen, setDevNoteOpen] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Brief "Saved ✓" confirmation — the builder auto-saves on every change, so
  // this makes the (otherwise invisible) save visible.
  const flashSaved = () => {
    setSavedFlash(true)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSavedFlash(false), 1500)
  }

  const setAvatarCharacter = useAuth((s) => s.setAvatarCharacter)

  const longest = profile.longestStreak
  const equippedBorder = profile.avatarBorder || 'default'
  const equippedBadge = profile.avatarBadge ?? 'none'
  const spec = profile.avatarCharacter ?? DEFAULT_AVATAR
  const equippedPieces = ARMOR.filter((a) => spec.armor[a.slot]).length

  const equip = async (patch: { border?: string; badge?: string | null }) => {
    setErr(null)
    juice.select()
    const res = await setCosmetics(patch)
    if (!res.ok) setErr(res.error ?? 'That’s not unlocked yet')
  }

  const toggleArmor = (def: ArmorPieceDef) => {
    if (!accessOwned(def.access, longest)) {
      setErr(`${def.name} unlocks with a ${accessLabel(def.access).text.toLowerCase()}`)
      return
    }
    setErr(null)
    juice.select()
    setAvatarCharacter({ ...spec, armor: { ...spec.armor, [def.slot]: !spec.armor[def.slot] } })
    flashSaved()
  }

  const pickSkin = (s: Swatch) => {
    setErr(null)
    juice.select()
    setAvatarCharacter({ ...spec, skin: s.key })
    flashSaved()
  }

  const pickRobe = (r: Swatch) => {
    if (!accessOwned(r.access, longest)) {
      setErr(`${r.name} is a Studio color`)
      return
    }
    setErr(null)
    juice.select()
    setAvatarCharacter({ ...spec, robe: r.key })
    flashSaved()
  }

  const ownedItems = profile.ownedItems ?? []
  const myItems = ITEMS.filter((i) => ownedItems.includes(i.id))
  const toggleItem = (item: ItemDef) => {
    setErr(null)
    juice.select()
    const nextItems = { ...(spec.items ?? {}) }
    if (nextItems[item.slot] === item.id) delete nextItems[item.slot]
    else nextItems[item.slot] = item.id
    setAvatarCharacter({ ...spec, items: nextItems })
    flashSaved()
  }

  const sharedCount = distinctSharedDays(profile.sharedDays)
  const grantSkin = useAuth((s) => s.grantSkin)
  const ownedSkins = profile.ownedSkins ?? []
  const equippedSkin = equippedSkinId(spec)
  const onSkinTap = (skin: SkinDef) => {
    const owned = skinOwned(skin, { sharedDays: profile.sharedDays, ownedSkins })
    if (!owned && skin.source === 'earned') {
      const goal = skin.shareGoal ?? 0
      setErr(`${skin.name}: shared ${Math.min(sharedCount, goal)}/${goal} days`)
      return
    }
    setErr(null)
    juice.select()
    // Paid skin not owned yet → free "preview" unlock (no real IAP yet).
    if (!owned && skin.source === 'paid') grantSkin(skin.id)
    const willEquip = equippedSkin !== skin.id
    setAvatarCharacter({ ...spec, skinId: willEquip ? skin.id : null, regalia: null })
    flashSaved()
  }

  return (
    <>
      {/* Collapsed by default so the profile stays uncluttered; tapping drops
          the whole customization menu down. */}
      <button
        onClick={() => { juice.select(); setOpen((o) => !o) }}
        aria-expanded={open}
        className="card"
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, marginBottom: open ? 14 : 0, textAlign: 'left', cursor: 'pointer' }}
      >
        <Avatar emoji={profile.avatarEmoji} character={spec} size={44} ring={false} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>Customize your character</b>
          <div className="faint" style={{ fontSize: 12 }}>Armor of God · King Baldwin · borders &amp; badges</div>
        </div>
        <span style={{ fontSize: 18, color: 'var(--gold)', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>▾</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="customize-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            {/* ── Character builder ─────────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
              <h3 style={{ fontSize: 16 }} className="dim">Your Character</h3>
        <span style={{ fontSize: 12, fontWeight: savedFlash ? 700 : 400, color: savedFlash ? 'var(--good)' : 'var(--faint, #8b8199)', transition: 'color 0.2s' }} className={savedFlash ? undefined : 'faint'}>
          {savedFlash ? 'Saved ✓' : `Armor of God · ${equippedPieces}/6`}
        </span>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14 }}>
          <Avatar emoji={profile.avatarEmoji} character={spec} size={76} border={equippedBorder} badge={equippedBadge} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>Equip your armor</b>
            <p className="faint" style={{ fontSize: 12, marginTop: 2 }}>
              Ephesians 6 — a piece at a time. Tap to equip or remove; it saves automatically.
            </p>
            <div style={{ marginTop: 8, height: 8, borderRadius: 999, background: 'rgba(0,0,0,0.3)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(equippedPieces / 6) * 100}%`, borderRadius: 999, background: 'linear-gradient(90deg, var(--gold), var(--tangerine))', transition: 'width 0.25s' }} />
            </div>
          </div>
        </div>

        {/* Armor pieces */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {ARMOR.map((def) => {
            const owned = accessOwned(def.access, longest)
            const on = !!spec.armor[def.slot]
            const lbl = accessLabel(def.access)
            return (
              <button
                key={def.slot}
                onClick={() => toggleArmor(def)}
                style={{
                  textAlign: 'left',
                  display: 'grid',
                  gap: 3,
                  padding: '9px 10px',
                  borderRadius: 12,
                  background: on ? 'var(--grape)' : 'var(--card-solid)',
                  border: on ? '1px solid var(--gold)' : '1px solid var(--stroke)',
                  opacity: owned ? 1 : 0.55,
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.15 }}>{def.name}</span>
                <span className="faint" style={{ fontSize: 10, fontStyle: 'italic' }}>{def.verse}</span>
                <span style={{ ...pillStyle(lbl.tone), marginTop: 2 }}>
                  {on ? '✓ Equipped' : owned ? (lbl.tone === 'studio' ? '✦ Studio' : 'Tap to equip') : `🔒 ${lbl.text}`}
                </span>
              </button>
            )
          })}
        </div>

        {/* Skin tone */}
        <p className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '14px 0 6px' }}>Skin tone</p>
        <div style={{ display: 'flex', gap: 8 }}>
          {SKINS.map((s) => (
            <SwatchDot key={s.key} hex={s.hex} selected={spec.skin === s.key} onClick={() => pickSkin(s)} />
          ))}
        </div>

        {/* Robe */}
        <p className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '14px 0 6px' }}>Robe</p>
        <div style={{ display: 'flex', gap: 8 }}>
          {ROBES.map((r) => (
            <SwatchDot
              key={r.key}
              hex={r.hex}
              selected={spec.robe === r.key}
              locked={!accessOwned(r.access, longest)}
              studio={r.access?.kind === 'studio'}
              onClick={() => pickRobe(r)}
            />
          ))}
        </div>

        <p className="faint" style={{ fontSize: 10, marginTop: 12, lineHeight: 1.4 }}>
          Studio pieces are unlocked here so you can preview the full look. Scripture is always free — the craft around it is the paid layer.
        </p>
      </div>

      {/* ── Full-look skins ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ fontSize: 16 }} className="dim">Skins</h3>
        <span className="faint" style={{ fontSize: 12 }}>full looks</span>
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {FULL_SKINS.map((skin) => {
            const owned = skinOwned(skin, { sharedDays: profile.sharedDays, ownedSkins })
            const equipped = equippedSkin === skin.id
            const preview = { ...spec, skinId: skin.id, regalia: null }
            const status =
              owned
                ? equipped
                  ? '✓ Equipped'
                  : 'Tap to wear'
                : skin.source === 'earned'
                  ? `Shared ${Math.min(sharedCount, skin.shareGoal ?? 0)}/${skin.shareGoal ?? 0} days`
                  : `✦ ${skin.price} · Preview`
            return (
              <button
                key={skin.id}
                onClick={() => onSkinTap(skin)}
                style={{
                  display: 'grid',
                  justifyItems: 'center',
                  gap: 6,
                  padding: '10px 8px',
                  borderRadius: 14,
                  background: equipped ? 'var(--grape)' : 'var(--card-solid)',
                  border: equipped ? '1px solid var(--gold)' : '1px solid var(--stroke)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ position: 'relative' }}>
                  <Avatar emoji={profile.avatarEmoji} character={preview} size={60} ring={false} />
                  {!owned && (
                    <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 20, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' }}>🔒</span>
                  )}
                </div>
                <span style={{ fontSize: 13, fontWeight: 800 }}>{skin.name}</span>
                <span style={{ ...pillStyle(skin.source === 'paid' ? 'studio' : 'earned') }}>{status}</span>
              </button>
            )
          })}
        </div>
        <p className="faint" style={{ fontSize: 10, marginTop: 10, lineHeight: 1.4 }}>
          Paid skins are <b>preview-unlocked</b> for now — real purchases arrive later. Earned skins (like Baldwin) are never for sale.
        </p>
      </div>

      {/* A genuine note on why anything costs money at all */}
      <button
        onClick={() => { juice.select(); setDevNoteOpen((o) => !o) }}
        className="card"
        style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, marginBottom: devNoteOpen ? 0 : 14, cursor: 'pointer' }}
      >
        <span style={{ fontSize: 18 }}>💛</span>
        <b style={{ flex: 1, fontSize: 13.5 }}>Why do skins cost anything?</b>
        <span style={{ color: 'var(--gold)', transform: devNoteOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
      </button>
      {devNoteOpen && (
        <div className="card" style={{ marginTop: 8, marginBottom: 14, lineHeight: 1.6, fontSize: 14 }}>
          <p style={{ margin: 0 }}>
            Verse Arcade is built by <b>one person</b> — not a company, no investors. The whole app is
            free: the daily verse, the games, streaks, groups, battles. That never changes, and the
            Scripture is never behind a paywall.
          </p>
          <p style={{ margin: '12px 0 0' }}>
            Skins are the one optional extra. I’m not a nonprofit, so this isn’t a donation — it’s
            support. It covers the real monthly cost of keeping the app online, and gives me a little
            room to keep building it instead of shelving it. You’re only ever paying for a cosmetic you
            like.
          </p>
          <p style={{ margin: '12px 0 0', color: 'var(--ink)' }}>
            If you grab one — thank you, genuinely. It keeps this going. If you don’t, that’s completely
            okay: the app is yours to enjoy either way. 🙏
          </p>
        </div>
      )}

      {/* ── Collected items (from the Daily Chest) ────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ fontSize: 16 }} className="dim">Items</h3>
        <span className="faint" style={{ fontSize: 12 }}>{myItems.length} collected</span>
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        {myItems.length === 0 ? (
          <p className="faint" style={{ fontSize: 13, textAlign: 'center', padding: '6px 0' }}>
            🎁 Open your Daily Chest to find hats, staffs, cloaks and more — then equip them here.
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {myItems.map((item) => {
              const on = spec.items?.[item.slot] === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => toggleItem(item)}
                  style={{
                    textAlign: 'left',
                    display: 'grid',
                    gap: 3,
                    padding: '9px 10px',
                    borderRadius: 12,
                    background: on ? 'var(--grape)' : 'var(--card-solid)',
                    border: on ? '1px solid var(--gold)' : '1px solid var(--stroke)',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.15 }}>{item.name}</span>
                  <span className="faint" style={{ fontSize: 10, textTransform: 'capitalize' }}>{item.slot} · {item.rarity}</span>
                  <span style={{ ...pillStyle(on ? 'studio' : 'free'), marginTop: 2 }}>{on ? '✓ Worn' : 'Tap to wear'}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Streak-unlocked borders + badges ──────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ fontSize: 16 }} className="dim">Customize</h3>
        <span className="faint" style={{ fontSize: 12 }}>Best streak: {longest}d</span>
      </div>

      {/* Borders */}
      <p className="faint" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Borders</p>
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {BORDERS.map((b) => {
            const unlocked = isUnlocked(b.requiredStreak, longest, profile.founder)
            const equipped = equippedBorder === b.key
            return (
              <CosmeticTile
                key={b.key}
                name={b.name}
                unlocked={unlocked}
                equipped={equipped}
                requiredStreak={b.requiredStreak}
                onClick={unlocked && !equipped ? () => equip({ border: b.key }) : undefined}
                preview={
                  <Avatar
                    emoji={profile.avatarEmoji}
                    character={spec}
                    size={52}
                    border={b.key}
                    badge={equippedBadge}
                  />
                }
              />
            )
          })}
        </div>
      </div>

      {/* Badges */}
      <p className="faint" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Badges</p>
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {BADGES.map((b) => {
            const unlocked = isUnlocked(b.requiredStreak, longest, profile.founder)
            const equipped = equippedBadge === b.key
            return (
              <CosmeticTile
                key={b.key}
                name={b.name}
                unlocked={unlocked}
                equipped={equipped}
                requiredStreak={b.requiredStreak}
                onClick={unlocked && !equipped ? () => equip({ badge: b.key }) : undefined}
                preview={
                  <Avatar
                    emoji={profile.avatarEmoji}
                    character={spec}
                    size={52}
                    border={equippedBorder}
                    badge={b.key === 'none' ? null : b.key}
                  />
                }
              />
            )
          })}
        </div>
      </div>

            {err && <p style={{ color: 'var(--coral)', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>{err}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

// Small access pill (Free / earned streak / Studio) shown on each armor tile.
function pillStyle(tone: 'free' | 'earned' | 'studio'): React.CSSProperties {
  const color = tone === 'free' ? 'var(--good)' : tone === 'earned' ? 'var(--tangerine)' : 'var(--gold)'
  return {
    justifySelf: 'start',
    fontSize: 9.5,
    fontWeight: 800,
    letterSpacing: '0.03em',
    textTransform: 'uppercase',
    padding: '3px 7px',
    borderRadius: 999,
    color,
    background: 'color-mix(in srgb, currentColor 16%, transparent)',
  }
}

// A tappable color swatch for skin tone / robe, with lock + studio affordances.
function SwatchDot({
  hex,
  selected,
  locked,
  studio,
  onClick,
}: {
  hex: string
  selected: boolean
  locked?: boolean
  studio?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      style={{
        position: 'relative',
        width: 34,
        height: 34,
        borderRadius: '50%',
        background: hex,
        border: selected ? '2px solid var(--gold)' : '2px solid var(--stroke)',
        boxShadow: selected ? '0 0 0 3px color-mix(in srgb, var(--gold) 35%, transparent)' : 'none',
        cursor: 'pointer',
        opacity: locked ? 0.6 : 1,
        flexShrink: 0,
      }}
    >
      {studio && (
        <span
          style={{
            position: 'absolute',
            right: -3,
            bottom: -3,
            fontSize: 10,
            lineHeight: 1,
            background: 'var(--card-solid)',
            borderRadius: '50%',
            padding: 1,
          }}
        >
          {locked ? '🔒' : '✦'}
        </span>
      )}
    </button>
  )
}

function unlockLabel(days: number): string {
  if (days === 365) return '1-year streak'
  if (days % 365 === 0) return `${days / 365}-year streak`
  return `${days}-day streak`
}

function CosmeticTile({
  name,
  unlocked,
  equipped,
  requiredStreak,
  preview,
  onClick,
}: {
  name: string
  unlocked: boolean
  equipped: boolean
  requiredStreak: number
  preview: React.ReactNode
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      style={{
        display: 'grid',
        justifyItems: 'center',
        gap: 6,
        padding: '8px 4px',
        borderRadius: 14,
        background: equipped ? 'var(--grape)' : 'transparent',
        border: equipped ? '1px solid var(--gold)' : '1px solid transparent',
        cursor: onClick ? 'pointer' : 'default',
        opacity: unlocked ? 1 : 0.5,
        filter: unlocked ? 'none' : 'grayscale(0.7)',
      }}
    >
      <div style={{ position: 'relative' }}>
        {preview}
        {!unlocked && (
          <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 20 }}>🔒</span>
        )}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, textAlign: 'center' }}>{name}</div>
      <div className="faint" style={{ fontSize: 10, textAlign: 'center' }}>
        {equipped ? 'Equipped' : unlocked ? 'Tap to equip' : unlockLabel(requiredStreak)}
      </div>
    </button>
  )
}
