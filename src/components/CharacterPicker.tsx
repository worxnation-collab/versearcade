import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Character } from '@/components/Character'
import {
  FIGURES,
  HAIRS,
  SKINS,
  ROBES,
  accessOwned,
  equippedSkinId,
  figureOf,
  isOverlaySkin,
  skinById,
  type Swatch,
} from '@/data/avatar'
import { GENERATED_ART } from '@/data/generatedArt'
import { useJuice } from '@/juice/useJuice'
import type { AvatarSpec, Figure } from '@/types'

// The one character picker. Onboarding, account creation and the profile's
// Customize screen all mount THIS — a second copy would drift, and the whole
// promise of the flow is that the character you build while signing up is the
// character you keep.
//
// Deliberately small: male/female, six skin tones, six hair colours. Everything
// here is free and nothing here is a number, so there is no version of this
// screen where somebody else's character is better than yours — it is a
// portrait, not a loadout. The paid and earned looks (full skins, items) live
// on the Customize screen where they can be earned or bought; onboarding never
// opens with a shop.
export function CharacterPicker({
  value,
  onChange,
  size = 156,
  showRobe = false,
  longestStreak = 0,
  admin = false,
  onRemoveSkin,
}: {
  value: AvatarSpec
  onChange: (spec: AvatarSpec) => void
  /** Preview figure height. Full-body, always — this is the one place the whole
   *  character is the subject, so the portrait crop used by avatar chips would
   *  throw away the half that changes when you switch figures. */
  size?: number
  /** Robe colour row. Off in onboarding (fewer choices at the door), on in the
   *  profile customizer where the Studio colour also has to be reachable. */
  showRobe?: boolean
  longestStreak?: number
  admin?: boolean
  /** Given, a worn full skin can be taken off from right here — the one control
   *  that's worth keeping when the rest of the picker has nothing to say. The
   *  sign-up flow never passes it: nothing is equipped at the door. */
  onRemoveSkin?: () => void
}) {
  const juice = useJuice()
  const figure = figureOf(value)
  const hairKey = value.hair ?? 'espresso'
  // A full skin REPLACES the figure (Character.tsx renders its art instead of
  // the starter render), so while one is worn the figure, tone and hair rows
  // are three controls that visibly do nothing — you tap a swatch and Moses
  // doesn't change. They're hidden rather than dimmed: the character underneath
  // is untouched and comes straight back when the skin comes off, so there is
  // nothing here to explain with a padlock. An OVERLAY skin (the carried cross)
  // layers onto your own character instead of replacing it, so it keeps them.
  const wornSkinId = equippedSkinId(value)
  const wornSkin = wornSkinId && !isOverlaySkin(wornSkinId) ? skinById(wornSkinId) : null
  const covered = !!wornSkinId && !isOverlaySkin(wornSkinId)

  // The base character is a raster render per (figure, tone, hair) — see
  // Character.tsx — so a tap on a swatch swaps to a PNG the browser may not
  // have yet, and an unfetched image is a blank figure for a beat. Warm the
  // variants one tap away: every tone at the current hair, every hair at the
  // current tone, both figures at the current combination. Bounded (~13
  // images), and misses are harmless — an id with no render just isn't in
  // the map, and the drawn fallback shows instead of a gap.
  useEffect(() => {
    const ids = [
      ...SKINS.map((s) => `starter_${figure}_${s.key}_${hairKey}`),
      ...HAIRS.map((h) => `starter_${figure}_${value.skin}_${h.key}`),
      `starter_${figure === 'fem' ? 'masc' : 'fem'}_${value.skin}_${hairKey}`,
    ]
    for (const id of ids) {
      const src = GENERATED_ART[id]
      if (src) new Image().src = src
    }
  }, [figure, value.skin, hairKey])

  const pick = (patch: Partial<AvatarSpec>) => {
    juice.select?.()
    onChange({ ...value, ...patch })
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Live preview. Keyed on the whole look so every tap re-springs the
          figure — the feedback IS the reward here; nothing else on this screen
          moves. */}
      <div className="center">
        <motion.div
          key={`${figure}-${value.skin}-${value.hair}-${value.robe}`}
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 480, damping: 16 }}
          style={{ display: 'inline-block' }}
        >
          <Character spec={value} size={size} fullBody title="Your character" />
        </motion.div>
      </div>

      {covered ? (
        <div style={{ textAlign: 'center' }}>
          <p className="dim" style={{ fontSize: 13, lineHeight: 1.5, margin: 0 }}>
            You’re wearing <b>{wornSkin?.name ?? 'a full look'}</b>. Your own character is underneath,
            exactly as you made it — take the look off and it’s back.
          </p>
          {onRemoveSkin && (
            <button
              className="pill"
              onClick={() => { juice.select?.(); onRemoveSkin() }}
              style={{ marginTop: 10, fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}
            >
              Take it off
            </button>
          )}
        </div>
      ) : (
      <>
      {/* Male / female */}
      <div>
        <RowLabel>Figure</RowLabel>
        <div style={{ display: 'flex', gap: 8 }}>
          {FIGURES.map((f) => (
            <FigureTab
              key={f.key}
              name={f.name}
              selected={figure === f.key}
              onClick={() => pick({ figure: f.key as Figure })}
            />
          ))}
        </div>
      </div>

      <div>
        <RowLabel>Skin tone</RowLabel>
        <SwatchRow
          swatches={SKINS}
          selected={value.skin}
          onPick={(s) => pick({ skin: s.key })}
        />
      </div>

      <div>
        <RowLabel>Hair</RowLabel>
        <SwatchRow
          swatches={HAIRS}
          selected={value.hair ?? 'espresso'}
          onPick={(s) => pick({ hair: s.key })}
        />
      </div>

      {showRobe && (
        <div>
          <RowLabel>Robe</RowLabel>
          <SwatchRow
            swatches={ROBES}
            selected={value.robe}
            onPick={(s) => pick({ robe: s.key })}
            owned={(s) => accessOwned(s.access, longestStreak, admin)}
          />
        </div>
      )}
      </>
      )}
    </div>
  )
}

function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="faint"
      style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}
    >
      {children}
    </p>
  )
}

function FigureTab({ name, selected, onClick }: { name: string; selected: boolean; onClick: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      aria-pressed={selected}
      style={{
        flex: 1,
        padding: '10px 12px',
        borderRadius: 12,
        fontWeight: 800,
        fontSize: 14,
        background: selected ? 'var(--grape)' : 'var(--card-solid)',
        border: selected ? '1px solid var(--gold)' : '1px solid var(--stroke)',
        color: 'inherit',
        cursor: 'pointer',
      }}
    >
      {name}
    </motion.button>
  )
}

function SwatchRow({
  swatches,
  selected,
  onPick,
  owned,
}: {
  swatches: Swatch[]
  selected: string
  onPick: (s: Swatch) => void
  /** When given, an un-owned swatch is dimmed and inert (Studio robe colours).
   *  Everything without one is free — skin and hair always are. */
  owned?: (s: Swatch) => boolean
}) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {swatches.map((s) => {
        const have = owned ? owned(s) : true
        return (
          <motion.button
            key={s.key}
            whileTap={have ? { scale: 0.86 } : undefined}
            onClick={() => have && onPick(s)}
            aria-label={s.name}
            aria-pressed={selected === s.key}
            title={s.name}
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: s.hex,
              border: selected === s.key ? '2px solid var(--gold)' : '2px solid var(--stroke)',
              boxShadow:
                selected === s.key ? '0 0 0 3px color-mix(in srgb, var(--gold) 35%, transparent)' : 'none',
              opacity: have ? 1 : 0.45,
              cursor: have ? 'pointer' : 'default',
              flexShrink: 0,
            }}
          />
        )
      })}
    </div>
  )
}
