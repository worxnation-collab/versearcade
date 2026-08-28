import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Avatar } from '@/components/Avatar'
import { XpBar } from '@/components/XpBar'
import { StreakFlame } from '@/components/StreakFlame'
import { cardBgStyle } from '@/data/playerCards'
import { CardBg } from '@/components/CardBg'
import { denominationColor, denominationName } from '@/data/denominations'
import type { AvatarSpec } from '@/types'

// Everything a player card renders. Deliberately a plain data bag rather than a
// Profile, because the same card is drawn for other players from the
// get_player_card RPC, which returns only public fields.
export interface PlayerCardData {
  username: string
  avatarEmoji: string
  avatarCharacter?: AvatarSpec | null
  avatarBorder?: string
  avatarBadge?: string | null
  cardBackground?: string | null
  /** Equipped pet id (data/pets.ts). Drawn by ProfileHero above the card, never
   *  by the card itself — see the note on statsOnly. */
  pet?: string | null
  xp: number
  level: number
  currentStreak: number
  longestStreak: number
  totalPlays: number
  cards: number
  denomination?: string | null
  /** Earned road title, shown under the name. Only ever set for your own card:
   *  the leaderboard RPCs don't return other players' titles yet, and a title
   *  that renders for you and vanishes for everyone else would read as a bug.
   *  Widening it means adding the column to those RPCs, not a change here. */
  title?: string | null
}

// The player card: identity + level + the six stats, on a background the player
// earns and equips. It's the header of your own profile and the thing that
// pops up when anyone taps your avatar, so the two can never look different.
export function PlayerCard({
  p,
  actions,
  compact = false,
  statsOnly = false,
}: {
  p: PlayerCardData
  /** Buttons pinned beside the name — Edit / settings on your own profile. */
  actions?: ReactNode
  /** Tighter padding, for the pop-up where vertical space is scarcer. */
  compact?: boolean
  /**
   * Drop the identity block — avatar, name, title, denomination, XP bar — and
   * keep only the six stats.
   *
   * Used wherever ProfileHero is already showing the player at full size
   * directly above — your own profile, and now the pop-up. Repeating the avatar
   * and handle underneath a portrait is the same person twice on one screen,
   * and the numbers are the part the card is actually carrying there. The
   * denomination and title move up into the hero's caption rather than being
   * dropped.
   *
   * The card still keeps its identity anywhere it stands genuinely alone.
   */
  statsOnly?: boolean
}) {
  const denom = p.denomination ? denominationName(p.denomination) : null
  // SVG gradient ids must be unique per rendered card — the profile header and
  // an open pop-up can be on screen at once.
  const artId = `pc-${p.username}-${p.cardBackground ?? 'default'}`

  return (
    <div
      style={{
        ...cardBgStyle(p.cardBackground),
        borderRadius: 'var(--r-lg, 22px)',
        border: '1px solid var(--stroke)',
        padding: compact ? '16px 14px' : '18px 16px',
        overflow: 'hidden',
        position: 'relative',
        boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
      }}
    >
      <CardBg bgKey={p.cardBackground} id={artId} eager />
      {/* A scrim keeps text legible over the brighter paintings without
          flattening them. */}
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(8,3,24,0.20) 0%, rgba(8,3,24,0.44) 100%)',
        }}
      />
      <div style={{ position: 'relative' }}>
      {/* Actions get their own row above the handle rather than sitting beside
          it, so neither a long username nor a wide button ("✨ Customize") ever
          crowds the other. */}
      {actions && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 10 }}>
          {actions}
        </div>
      )}

      {/* Identity */}
      {!statsOnly && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <Avatar
          emoji={p.avatarEmoji}
          character={p.avatarCharacter}
          size={compact ? 56 : 64}
          ring
          border={p.avatarBorder}
          badge={p.avatarBadge}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2
            style={{
              fontSize: compact ? 21 : 24, overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', minWidth: 0,
              textShadow: '0 2px 10px rgba(0,0,0,0.55)',
            }}
          >
            @{p.username}
          </h2>
          {p.title && (
            <div
              className="faint"
              style={{
                fontSize: 12,
                fontWeight: 700,
                marginTop: 1,
                color: 'var(--gold)',
                textShadow: '0 2px 8px rgba(0,0,0,0.6)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {p.title}
            </div>
          )}
          {denom && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: denominationColor(p.denomination!), boxShadow: `0 0 7px ${denominationColor(p.denomination!)}` }} />
              <span className="faint" style={{ fontSize: 11.5, fontWeight: 700 }}>{denom}</span>
            </div>
          )}
          <div style={{ marginTop: 8 }}><XpBar xp={p.xp} /></div>
        </div>
      </div>
      )}

      {/* Without the identity block the level bar has nowhere to live, and it's
          the one number that reads as progress rather than a total — so it
          moves above the tiles rather than being dropped. */}
      {statsOnly && (
        <div style={{ marginBottom: 12 }}>
          <XpBar xp={p.xp} />
        </div>
      )}

      {/* The six stats, same set and order as the profile has always shown. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <Stat label="Streak" node={<StreakFlame days={p.currentStreak} size={18} />} />
        <Stat label="Longest" value={`${p.longestStreak}d`} />
        <Stat label="Cards" value={`${p.cards}`} />
        <Stat label="Level" value={`${p.level}`} />
        <Stat label="Total XP" value={p.xp.toLocaleString()} />
        <Stat label="Plays" value={`${p.totalPlays}`} />
      </div>
      </div>
    </div>
  )
}

// Tiles sit on painted artwork, so they carry their own scrim instead of the
// usual .card surface — otherwise a bright background washes the numbers out.
function Stat({ label, value, node }: { label: string; value?: string; node?: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        padding: 12,
        textAlign: 'center',
        borderRadius: 'var(--r-md, 16px)',
        background: 'rgba(10,4,28,0.5)',
        border: '1px solid rgba(255,255,255,0.10)',
        backdropFilter: 'blur(3px)',
      }}
    >
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, minHeight: 26, display: 'grid', placeItems: 'center' }}>
        {node ?? value}
      </div>
      <div className="faint" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </motion.div>
  )
}
