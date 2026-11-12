import { useEffect, useRef, useState } from 'react'
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
import {
  CLOTH_COLORS,
  HAIR_COLORS,
  SETUP_SLOTS,
  SLOTS,
  cleanOutfit,
  defaultOutfit,
  isLayered,
  layerName,
  layerUnlocked,
  layerUrl,
  layerSetName,
  BUILDS,
  buildOf,
  LAYER_REQS,
  reqLabel,
  slotItems,
  takesColor,
  type LayerSlot,
} from '@/data/layered'
import { petProgress } from '@/lib/petProgress'
import { EMPTY_PET_PROGRESS } from '@/data/pets'
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
function ClassicPicker({
  value,
  onChange,
  size = 156,
  showRobe = false,
  longestStreak = 0,
  admin = false,
  onRemoveSkin,
  layout = 'swatches',
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
  /**
   * How tone and hair are chosen. 'swatches' is two rows of colour dots — the
   * profile's customizer, where you already know your character and are
   * nudging it. 'tiles' is ONE row you swipe through, every combination drawn
   * as the actual figure, for the front door: somebody who has never seen the
   * character shouldn't have to build a face out of two colour charts, they
   * should see the people and point at one. Same spec either way; the figure
   * toggle stays in both.
   */
  layout?: 'swatches' | 'tiles'
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

      {layout === 'tiles' ? (
        // minWidth 0: a grid item's min-width is `auto`, which lets an
        // overflowing child WIDEN the item instead of scrolling inside it —
        // the row was 2,596px wide and the whole page scrolled sideways.
        <div style={{ minWidth: 0, maxWidth: '100%' }}>
          <RowLabel>Pick yourself</RowLabel>
          <TileRow
            figure={figure}
            value={value}
            onPick={(skin, hair) => pick({ skin, hair })}
          />
          <p className="faint" style={{ fontSize: 11, margin: '6px 0 0', textAlign: 'center' }}>
            Swipe for more — every tone, every hair colour.
          </p>
        </div>
      ) : (
        <>
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
        </>
      )}

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

/**
 * Every (tone, hair) combination for one figure, as a single swipeable row of
 * the rendered figures — 36 tiles, grouped by tone so a swipe walks the tones
 * and the hair varies inside each. Selected tile wears the gold ring and is
 * scrolled into view on mount, so re-opening the picker lands on you.
 *
 * Each tile is a plain <img loading="lazy"> straight from GENERATED_ART rather
 * than a <Character>: an SVG <image> loads whether or not it's on screen, and
 * 36 renders at once on the sign-up screen is two megabytes nobody asked for.
 * A combination whose render is missing (or 404s) falls back to <Character>,
 * which draws the pilgrim — the batch can ship incomplete and the row still
 * has 36 people in it.
 */
function TileRow({
  figure,
  value,
  onPick,
}: {
  figure: Figure
  value: AvatarSpec
  onPick: (skin: string, hair: string) => void
}) {
  const hairKey = value.hair ?? 'espresso'
  const selectedRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [figure])
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        minWidth: 0,
        maxWidth: 'calc(100% + 12px)',
        // Bleed to the card edges so the first and last tiles can be reached
        // without a dead margin, and hide the scrollbar chrome on desktop.
        margin: '0 -6px',
        padding: '4px 6px 6px',
        scrollSnapType: 'x proximity',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
      }}
    >
      {SKINS.map((s) =>
        HAIRS.map((h) => {
          const selected = value.skin === s.key && hairKey === h.key
          const id = `starter_${figure}_${s.key}_${h.key}`
          const src = GENERATED_ART[id]
          return (
            <motion.button
              key={id}
              ref={selected ? selectedRef : undefined}
              whileTap={{ scale: 0.92 }}
              onClick={() => onPick(s.key, h.key)}
              aria-label={`${s.name} skin, ${h.name} hair`}
              aria-pressed={selected}
              style={{
                flex: '0 0 auto',
                width: 64,
                height: 92,
                padding: 0,
                borderRadius: 14,
                background: selected ? 'var(--select)' : 'var(--card-solid)',
                border: selected ? '2px solid var(--grape)' : '2px solid var(--stroke)',
                boxShadow: selected ? '0 0 0 3px color-mix(in srgb, var(--gold) 35%, transparent)' : 'none',
                cursor: 'pointer',
                scrollSnapAlign: 'center',
                overflow: 'hidden',
                display: 'grid',
                placeItems: 'end center',
              }}
            >
              {src ? (
                <img
                  src={src}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  style={{ height: 84, width: 'auto', maxWidth: 60, objectFit: 'contain', display: 'block' }}
                />
              ) : (
                <Character spec={{ ...value, figure, skin: s.key, hair: h.key, skinId: null, regalia: null }} size={84} fullBody />
              )}
            </motion.button>
          )
        }),
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
        background: selected ? 'var(--select)' : 'var(--card-solid)',
        border: selected ? '1px solid var(--grape)' : '1px solid var(--stroke)',
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
              border: selected === s.key ? '2px solid var(--grape)' : '2px solid var(--stroke)',
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

type PickerProps = Parameters<typeof ClassicPicker>[0]

// The one character picker, now in two generations. A spec carrying an
// `outfit` is a layered character (data/layered.ts) and gets the wardrobe
// builder; a spec without one is an account made before it, and keeps the old
// picker — plus one button to step into the new wardrobe, because changing
// somebody's look out from under them is the one thing this must not do.
// A worn full skin covers both, and the classic picker already says so.
export function CharacterPicker(props: PickerProps) {
  const { value, onChange, layout = 'swatches', admin = false } = props
  const juice = useJuice()
  const worn = equippedSkinId(value)
  const covered = !!worn && !isOverlaySkin(worn)
  if (isLayered(value) && !covered) {
    return <LayeredBuilder value={value} onChange={onChange} setup={layout === 'tiles'} size={props.size} admin={admin} />
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <ClassicPicker {...props} />
      {!covered && (
        <button
          className="btn"
          onClick={() => {
            juice.select?.()
            onChange(toLayered(value))
          }}
          style={{ justifySelf: 'center', fontWeight: 800 }}
        >
          Try the new wardrobe
        </button>
      )}
    </div>
  )
}

const hairHexFor = (key?: string) => (HAIRS.find((h) => h.key === key) ?? HAIRS[1]).hex

/** An old-style character stepped into the new wardrobe: same figure, tone and
 *  hair colour, dressed in the default outfit. Used by "Try the new wardrobe"
 *  and by the You tab's one-time card (WardrobeInvite), so the two can't differ. */
export const toLayered = (spec: AvatarSpec): AvatarSpec => ({
  ...spec,
  // An overlay worn on the old figure does not come along: a new wardrobe
  // that opens wearing wings nobody chose reads as a bug (it did, 2026-11-12).
  ...(isOverlaySkin(equippedSkinId(spec)) ? { skinId: null, regalia: null } : {}),
  outfit: defaultOutfit(figureOf(spec), hairHexFor(spec.hair)),
})

/** The setup stage's figure: big, but never more than about a quarter of the
 *  screen, so a short phone still has room for the options under it. */
const stageSize = () =>
  typeof window === 'undefined' ? 220 : Math.round(Math.max(150, Math.min(230, window.innerHeight * 0.27)))

const asSwatches = (hexes: string[]): Swatch[] => hexes.map((hex) => ({ key: hex, name: hex, hex }))

// The wardrobe builder. At setup (`setup`) it offers the four slots a person
// needs to be dressed — hair, top, legs, shoes — and only free pieces; on the
// profile it offers every slot, with earned pieces shown locked and saying what
// earns them (the thing and the door, never a distance — same rule as /wardrobe).
function LayeredBuilder({
  value,
  onChange,
  setup,
  size = 200,
  admin,
}: {
  value: AvatarSpec & { outfit: NonNullable<AvatarSpec['outfit']> }
  onChange: (spec: AvatarSpec) => void
  setup: boolean
  size?: number
  admin: boolean
}) {
  const juice = useJuice()
  const figure = figureOf(value)
  const slots = setup ? SLOTS.filter((s) => SETUP_SLOTS.includes(s.slot)) : SLOTS
  const [tab, setTab] = useState<LayerSlot>('hair')
  // Read once per render: the numbers only go up, and a setup screen has none.
  const progress = setup ? EMPTY_PET_PROGRESS : petProgress()
  const open = (id: string) => layerUnlocked(id, progress, admin)

  const set = (patch: Partial<AvatarSpec>) => {
    juice.select?.()
    onChange({ ...value, ...patch })
  }
  const wear = (slot: LayerSlot, id: string | null) => {
    const outfit = { ...value.outfit }
    if (!id) delete outfit[slot]
    else {
      const keep = outfit[slot]?.color
      const palette = slot === 'hair' ? HAIR_COLORS : CLOTH_COLORS
      outfit[slot] = { id, color: takesColor(id) ? keep ?? palette[slot === 'hair' ? 1 : 7] : undefined }
    }
    set({ outfit })
  }
  const recolor = (slot: LayerSlot, color: string) => {
    const piece = value.outfit[slot]
    if (piece) set({ outfit: { ...value.outfit, [slot]: { ...piece, color } } })
  }

  const current = value.outfit[tab]
  const meta = slots.find((s) => s.slot === tab)
  const ids = slotItems(tab, figure).filter((id) => !setup || open(id))

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* At setup the figure is the point of the screen, so it is big and it
          STAYS on screen while the options scroll under it: a 150px figure that
          scrolled away left a new player tapping hairstyles they could no longer
          see (2026-11-12, driven in Chromium). */}
      <div
        className="center"
        style={
          setup
            ? {
                position: 'sticky',
                top: 0,
                zIndex: 5,
                margin: '0 -18px',
                padding: '6px 0 10px',
                // Translucent over the page rather than a flat block of the
                // ground colour, which drew a visible dark rectangle.
                background: 'linear-gradient(180deg, rgba(20,14,17,0.9) 78%, rgba(20,14,17,0))',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
              }
            : undefined
        }
      >
        <motion.div
          key={JSON.stringify(value.outfit) + figure + value.skin + buildOf(value)}
          initial={{ scale: 0.94 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 480, damping: 18 }}
          style={{ display: 'inline-block' }}
        >
          <Character spec={value} size={setup ? stageSize() : size} fullBody title="Your character" />
        </motion.div>
      </div>

      {/* An overlay look (the wings, the cross, the vine, the pillar) is a
          SKIN, so nothing in this builder could take it off: it rode along from
          an old character into the wardrobe and stood there with no control in
          sight (2026-11-12). Say what it is and offer the one tap. */}
      {!setup && isOverlaySkin(equippedSkinId(value)) && (
        <div
          className="card"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', margin: 0 }}
        >
          <span className="dim" style={{ fontSize: 13 }}>
            Also wearing <b style={{ color: 'var(--ink)' }}>{skinById(equippedSkinId(value))?.name ?? 'a look'}</b>
          </span>
          <button className="pill" onClick={() => set({ skinId: null, regalia: null })} style={{ flexShrink: 0 }}>
            Take off
          </button>
        </div>
      )}

      <div>
        <RowLabel>Figure</RowLabel>
        <div style={{ display: 'flex', gap: 8 }}>
          {FIGURES.map((f) => (
            <FigureTab
              key={f.key}
              name={f.name}
              selected={figure === f.key}
              onClick={() => set({ figure: f.key as Figure, outfit: cleanOutfit(value.outfit, f.key as Figure, progress, admin) })}
            />
          ))}
        </div>
      </div>

      <div>
        <RowLabel>Build</RowLabel>
        <div style={{ display: 'flex', gap: 8 }}>
          {BUILDS.map((b) => (
            <FigureTab key={b.key} name={b.name} selected={buildOf(value) === b.key} onClick={() => set({ build: b.key })} />
          ))}
        </div>
      </div>

      <div>
        <RowLabel>Skin tone</RowLabel>
        <SwatchRow swatches={SKINS} selected={value.skin} onPick={(s) => set({ skin: s.key })} />
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="tablist">
        {slots.map((s) => (
          <button
            key={s.slot}
            role="tab"
            aria-selected={tab === s.slot}
            className="pill"
            onClick={() => { juice.select?.(); setTab(s.slot) }}
            style={{
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: 13,
              background: tab === s.slot ? 'var(--select)' : undefined,
              color: tab === s.slot ? '#fff' : undefined,
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {current && takesColor(current.id) && (
        <div>
          <RowLabel>Colour</RowLabel>
          <SwatchRow
            swatches={asSwatches(tab === 'hair' ? HAIR_COLORS : CLOTH_COLORS)}
            selected={current.color ?? ''}
            onPick={(s) => recolor(tab, s.hex)}
          />
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))',
          gap: 8,
          minWidth: 0,
        }}
      >
        {!meta?.required && (
          <WardrobeTile label="None" selected={!current} onClick={() => wear(tab, null)}>
            <span style={{ fontSize: 22, color: 'var(--ink-faint)' }}>∅</span>
          </WardrobeTile>
        )}
        {ids.map((id) => {
          const have = open(id)
          const req = LAYER_REQS[id]
          return (
            <WardrobeTile
              key={id}
              label={layerName(id)}
              note={have ? layerSetName(id) : [req ? reqLabel(req) : 'Coming soon', layerSetName(id)].filter(Boolean).join(' · ')}
              selected={current?.id === id}
              locked={!have}
              onClick={() => have && wear(tab, id)}
            >
              {tab === 'hair' || tab === 'top' ? (
                // A hairstyle on its own is a wig floating in a box, and the
                // long ones shrank to slivers beside a bob; a top's grey render
                // took the tint on its arm pixels too. Drawn ON the player's own
                // head and shoulders instead, every piece is the same size, in
                // the colour picked, and reads as "this is how I'd look".
                <span style={{ filter: have ? undefined : 'grayscale(1) brightness(.75)', display: 'block' }}>
                  <Character
                    spec={{ ...value, outfit: { ...value.outfit, [tab]: { id, color: takesColor(id) ? current?.color ?? (tab === 'hair' ? HAIR_COLORS[1] : CLOTH_COLORS[7]) : undefined } } }}
                    size={64}
                  />
                </span>
              ) : (
                <TintedPiece
                  // A back piece is painted only where it shows around the body,
                  // so alone it was a body-shaped hole with straps: back tiles use
                  // a picture of the piece itself (scripts/avatar/back-icons.py).
                  src={tab === 'back' ? `/avatar/icons/${id}.webp` : layerUrl(figure, id)}
                  // A colourable piece is stored GREY and coloured at runtime, so
                  // its tile showed grey while the character wore blue. The tile
                  // wears the colour picked for this slot, like the figure does.
                  tint={have && takesColor(id) ? current?.color ?? CLOTH_COLORS[7] : undefined}
                  dim={!have}
                />
              )}
            </WardrobeTile>
          )
        })}
      </div>

      <p className="faint" style={{ fontSize: 11, margin: 0, textAlign: 'center', lineHeight: 1.45 }}>
        {setup
          ? 'Every hairstyle, colour and everyday outfit is free. Helmets, armour, wings and more are earned by playing.'
          : 'Everything you can see is yours to wear. Locked pieces say what earns them. It saves as you tap.'}
      </p>
    </div>
  )
}

/** A piece's art, multiplied by a colour where it takes one: the grey render
 *  under a solid colour masked to the piece's own shape. */
function TintedPiece({ src, tint, dim }: { src: string; tint?: string; dim?: boolean }) {
  const img = { maxHeight: 64, maxWidth: '100%', objectFit: 'contain' as const, display: 'block' }
  return (
    <span style={{ position: 'relative', display: 'inline-block', filter: dim ? 'grayscale(1) brightness(.75)' : undefined }}>
      <img src={src} alt="" loading="lazy" draggable={false} style={img} />
      {tint && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background: tint,
            mixBlendMode: 'multiply',
            WebkitMaskImage: `url(${src})`,
            maskImage: `url(${src})`,
            WebkitMaskSize: 'contain',
            maskSize: 'contain',
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center',
            maskPosition: 'center',
          }}
        />
      )}
    </span>
  )
}

function WardrobeTile({
  label,
  note,
  selected,
  locked,
  onClick,
  children,
}: {
  label: string
  note?: string
  selected: boolean
  locked?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <motion.button
      whileTap={locked ? undefined : { scale: 0.93 }}
      onClick={onClick}
      aria-pressed={selected}
      aria-disabled={locked || undefined}
      style={{
        display: 'grid',
        gap: 3,
        justifyItems: 'center',
        padding: '6px 4px',
        borderRadius: 12,
        background: selected ? 'var(--select)' : 'var(--card-raised)',
        // One signal for "on": the select fill. Gold is for the next thing to do.
        border: selected ? '2px solid rgba(255,255,255,0.35)' : '2px solid transparent',
        cursor: locked ? 'default' : 'pointer',
        color: 'var(--ink)',
        minWidth: 0,
      }}
    >
      <span style={{ height: 64, display: 'grid', placeItems: 'center', position: 'relative', width: '100%' }}>
        {children}
        {locked && (
          <span style={{ position: 'absolute', top: 0, right: 2, fontSize: 12 }} aria-hidden>
            🔒
          </span>
        )}
      </span>
      <span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.2, textAlign: 'center' }}>{label}</span>
      {note && <span style={{ fontSize: 10, color: 'var(--ink-dim)', lineHeight: 1.2, textAlign: 'center' }}>{note}</span>}
    </motion.button>
  )
}
