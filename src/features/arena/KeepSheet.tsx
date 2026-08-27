import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Collapsible } from '@/components/Collapsible'
import { useAuth } from '@/store/auth'
import { useKeep, loadFactionKeep, type FactionKeep, type Placements } from '@/store/keep'
import { useJuice } from '@/juice/useJuice'
import { denominationColor, denominationName } from '@/data/denominations'
import {
  ANCHORS,
  DECOR,
  decorById,
  decorForMount,
  keepLevelForWins,
  keepLevelName,
} from '@/data/keep'
import { KeepHall, DecorProp } from './KeepArt'
import { KeepLife } from './KeepLife'

// The Keep — a faction's hall, opened from a row on the battle Teams board, or
// your own hall from the "Your keep" card.
//
// What is deliberately NOT here, per docs/FORTRESS.md: no count of decorations
// or owners, no "top decorator", no faction-vs-faction comparison, and the
// faction's rank/wins stay on the board outside — the hall is a place, not a
// number. The crowd carries no per-person score and no one is ordered by what
// they gave. A bare hall is "stone, and room to fill it", never "empty".
//
// Portalled to document.body because the board sits inside a `.card`, and
// `.card` sets backdrop-filter — a containing block for position: fixed (the
// ChurchDetailSheet / BookOpening family of bug). z-index 100 is the sheet
// tier: the player card (110) opens OVER this when you tap a figure.

export function KeepSheet({
  denomination,
  onClose,
}: {
  /** Faction key, or null for "my hall" (guests and the faction-less). */
  denomination: string | null
  onClose: () => void
}) {
  const juice = useJuice()
  const me = useAuth((s) => s.profile)
  const keep = useKeep()
  const [faction, setFaction] = useState<FactionKeep | null>(null)

  const myFaction = !!denomination && me?.denomination === denomination
  const ownHall = !denomination || myFaction

  useEffect(() => {
    void useKeep.getState().load()
    if (denomination) {
      loadFactionKeep(denomination).then(setFaction)
    }
  }, [denomination])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (typeof document === 'undefined') return null

  const color = denomination ? denominationColor(denomination) : 'var(--gold)'
  const colorHex = denomination ? denominationColor(denomination) : '#e8b64c'
  const title = denomination ? `${denominationName(denomination)} Keep` : 'Your Keep'

  // Whose furnishings the hall shows: for a faction, the server's blend (your
  // own placements win their anchors, other members sample-fill the rest); for
  // your own hall, straight from the store.
  const placements: Placements =
    denomination && faction ? { ...faction.placements, ...(myFaction ? keep.placements : {}) } : keep.placements

  const wins = denomination ? faction?.wins ?? 0 : keep.counters.battle_won + keep.counters.cpu_won
  const level = keepLevelForWins(wins)

  // Who lives in this view of the hall: the faction's members, or just you.
  const lifeMembers =
    denomination && faction
      ? faction.members
      : me
        ? [{ username: me.username, avatarEmoji: me.avatarEmoji, avatarCharacter: me.avatarCharacter, isMe: true }]
        : []

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="keep-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100,
          background: 'rgba(8,3,24,0.72)',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
        }}
      >
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 520,
            maxHeight: '88dvh',
            overflowY: 'auto',
            background: 'var(--bg-1)',
            borderRadius: 'var(--r-lg) var(--r-lg) 0 0',
            border: '1px solid var(--stroke)',
            borderBottom: 'none',
            padding: '14px 14px calc(var(--safe-bottom) + 20px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}`, flexShrink: 0 }} />
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 18, flex: 1, minWidth: 0 }}>{title}</b>
            <button className="pill" onClick={() => { juice.select(); onClose() }} aria-label="Close">✕</button>
          </div>

          {/* The place itself. */}
          <div style={{ position: 'relative', borderRadius: 'var(--r-md)', overflow: 'hidden', border: '1px solid var(--stroke)' }}>
            <svg viewBox="0 0 560 300" style={{ display: 'block', width: '100%', height: 'auto' }}>
              <KeepHall color={colorHex} />
              {ANCHORS.map((a) => {
                const decor = placements[a.id]
                return decor ? <DecorProp key={a.id} id={decor} x={a.x} y={a.y} color={colorHex} /> : null
              })}
            </svg>
            {/* Alive, not pasted: figures run seeded schedules between the
                hearth, the table and the stable (KeepLife). A faction hall
                shows its members; your own hall shows you. Static figures were
                deliberately cut before this — if these ever stop moving, remove
                them rather than letting them go back to being stickers. */}
            <KeepLife members={lifeMembers} />
          </div>

          <p className="faint" style={{ fontSize: 12, margin: '8px 0 0', lineHeight: 1.5 }}>
            <b style={{ color: 'var(--ink-dim)' }}>{keepLevelName(level)}</b> · level {level}
            {denomination && faction
              ? ` · ${faction.memberTotal} member${faction.memberTotal === 1 ? '' : 's'} play here.`
              : ' · won in battles, furnished by you.'}
            {Object.keys(placements).length === 0 && ' Stone, and room to fill it.'}
          </p>

          {/* Decorate — only your own hall (your faction's, or your solo keep).
              You place YOUR decorations; other members see theirs and a sample
              of everyone's. Nothing here writes shared faction state. */}
          {ownHall && (
            <div style={{ marginTop: 12 }}>
              <Collapsible icon="🛋️" title="Decorate" meta={`${keep.owned().length}/${DECOR.length} earned`}>
                <p className="faint" style={{ fontSize: 11.5, margin: '0 0 10px', lineHeight: 1.5 }}>
                  Win keep challenges on the Battle tab to earn furnishings, then choose what hangs
                  where. Members each furnish their own view of the hall.
                </p>
                {ANCHORS.filter((a) => decorForMount(a.mount).some((d) => keep.owned().includes(d.id))).map((a) => {
                  const options = decorForMount(a.mount).filter((d) => keep.owned().includes(d.id))
                  const current = keep.placements[a.id]
                  return (
                    <div key={a.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--stroke)' }}>
                      <div className="faint" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                        {MOUNT_LABEL[a.mount]} {mountIndex(a.id)}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <Chip
                          label="Empty"
                          active={!current}
                          onClick={() => { juice.select(); void keep.place(a.id, null) }}
                        />
                        {options.map((d) => (
                          <Chip
                            key={d.id}
                            label={d.name}
                            active={current === d.id}
                            onClick={() => { juice.select(); void keep.place(a.id, d.id) }}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
                {/* Spots with nothing earned yet stay out of the list — one
                    line says where the rest comes from, instead of eight
                    repeats of "nothing here yet". */}
                <p className="faint" style={{ fontSize: 11.5, margin: '8px 0 0', lineHeight: 1.5 }}>
                  More spots open as challenges unlock furnishings for them.
                </p>
              </Collapsible>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}

const MOUNT_LABEL: Record<string, string> = {
  banner: 'Banner pole',
  wall: 'Wall',
  rafters: 'Rafters',
  table: 'Long table',
  floor: 'Floor',
  stable: 'Stable',
}

/** 'wall_2' -> '2', 'banner_l' -> 'left'. Purely a label. */
function mountIndex(anchorId: string): string {
  const suffix = anchorId.split('_')[1]
  return suffix === 'l' ? '(left)' : suffix === 'r' ? '(right)' : suffix === '1' && !anchorId.startsWith('stable') ? '1' : suffix
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 10px',
        borderRadius: 9,
        fontSize: 12.5,
        cursor: 'pointer',
        border: `1px solid ${active ? 'var(--gold)' : 'var(--stroke)'}`,
        background: active ? 'rgba(255,210,63,0.14)' : 'rgba(255,255,255,0.04)',
        color: active ? 'var(--gold)' : 'var(--ink-dim)',
      }}
    >
      {label}
    </button>
  )
}
