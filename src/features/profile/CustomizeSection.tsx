import { useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { useAuth } from '@/store/auth'
import { useJuice } from '@/juice/useJuice'
import { BORDERS, BADGES, isUnlocked } from '@/data/cosmetics'

// "Customize" — streak-unlocked avatar borders + badges. Unlock eligibility is
// based on the player's LONGEST streak ever, so a missed day never takes a
// cosmetic away. Locked items stay visible (with the milestone needed) as a
// gentle pull toward the next streak.
export function CustomizeSection() {
  const profile = useAuth((s) => s.profile)!
  const setCosmetics = useAuth((s) => s.setCosmetics)
  const juice = useJuice()
  const [err, setErr] = useState<string | null>(null)

  const longest = profile.longestStreak
  const equippedBorder = profile.avatarBorder || 'default'
  const equippedBadge = profile.avatarBadge ?? 'none'

  const equip = async (patch: { border?: string; badge?: string | null }) => {
    setErr(null)
    juice.select()
    const res = await setCosmetics(patch)
    if (!res.ok) setErr(res.error ?? 'That’s not unlocked yet')
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ fontSize: 16 }} className="dim">Customize</h3>
        <span className="faint" style={{ fontSize: 12 }}>Best streak: {longest}d</span>
      </div>

      {/* Borders */}
      <p className="faint" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Borders</p>
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {BORDERS.map((b) => {
            const unlocked = isUnlocked(b.requiredStreak, longest)
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
            const unlocked = isUnlocked(b.requiredStreak, longest)
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
    </>
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
