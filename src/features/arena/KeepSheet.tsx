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
  anchorById,
  decorForMount,
  decorName,
  keepLevelForWins,
  keepLevelName,
  keepTier,
  offerValue,
  offerableAnchors,
  planPlacement,
  unpackDecor,
  winsForTier,
} from '@/data/keep'
import { useChurch } from '@/store/church'
import { KeepScene } from './KeepScene'

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
  // The last merge, so the hall can flash the spot that absorbed it and say in
  // words what just happened. Tapping a second rug and watching a DIFFERENT
  // corner of the room change is the one confusing moment in the mechanic.
  const [merged, setMerged] = useState<{ anchor: string; name: string } | null>(null)
  // The piece currently picked up, by anchor. Tap a prop to lift it, tap a spot
  // of the same kind to set it down — no drag, because the hall is 300 viewBox
  // units tall inside a scrolling sheet and a drag there fights the scroll.
  const [picked, setPicked] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const church = useChurch((s) => s.church)

  const myFaction = !!denomination && me?.denomination === denomination
  const ownHall = !denomination || myFaction

  useEffect(() => {
    void useKeep.getState().load()
    if (denomination) {
      loadFactionKeep(denomination).then(setFaction)
    }
  }, [denomination])

  useEffect(() => {
    if (!merged) return
    const t = setTimeout(() => setMerged(null), 3000)
    return () => clearTimeout(t)
  }, [merged])

  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(null), 3000)
    return () => clearTimeout(t)
  }, [note])

  // Your own church, for the offering button. Loaded lazily: the Battle tab has
  // no reason to have read it, and a guest never gets one at all.
  useEffect(() => {
    if (!useChurch.getState().loaded) void useChurch.getState().load()
  }, [])

  // Place, and let the store tell us whether it turned into a merge.
  const place = async (anchor: string, decorId: string | null) => {
    setPicked(null)
    const res = await useKeep.getState().place(anchor, decorId)
    if (res.merged) {
      juice.merge()
      setMerged({ anchor: res.anchor, name: decorName(res.value) })
    } else {
      juice.select()
    }
  }

  // Tap a placed piece: lift it, or put it back down where it was.
  const pickUp = (anchor: string) => {
    juice.tap()
    setPicked((cur) => (cur === anchor ? null : anchor))
  }

  // Tap a spot while carrying: move it there. An occupied spot trades places
  // rather than overwriting, and the same decoration merges (see planMove).
  const dropOn = async (anchor: string) => {
    const from = picked
    if (!from) return
    setPicked(null)
    const res = await useKeep.getState().move(from, anchor)
    if (!res) return
    if (res.merged) {
      juice.merge()
      setMerged({ anchor: res.anchor, name: decorName(useKeep.getState().placements[res.anchor]) })
    } else {
      juice.select()
      if (res.swapped) setNote('Swapped.')
    }
  }

  const offer = async (decorId: string) => {
    const res = await useKeep.getState().offer(decorId)
    if (!res.ok) {
      setNote(
        res.reason === 'no_church'
          ? 'Join a church on the Church tab first.'
          : res.reason === 'already_offered'
            ? 'You have already given that one.'
            : 'That didn’t go through. Try again in a moment.',
      )
      return
    }
    if (res.leveledUp) juice.celebrate()
    else juice.coin()
    setNote(`Given — ${res.points.toLocaleString()} to ${church?.name ?? 'your church'}.`)
    void useChurch.getState().load()
  }

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
  const nextHall = winsForTier(keepTier(level))

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

          {/* The place itself — the same KeepScene the Battle tab shows inline,
              so the summary and the sheet can't drift into two different rooms. */}
          <KeepScene
            color={colorHex}
            level={level}
            placements={placements}
            members={lifeMembers}
            editing={
              ownHall
                ? { picked, mergedAnchor: merged?.anchor ?? null, onPick: pickUp, onDrop: (a) => void dropOn(a) }
                : undefined
            }
          />

          <AnimatePresence>
            {merged && (
              <motion.p
                key="merge-flash"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="center"
                style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 800, color: 'var(--gold)' }}
              >
                ✦ Two became one — that's a {merged.name} now.
              </motion.p>
            )}
          </AnimatePresence>

          {/* Carrying, or a note about the last thing that happened. One slot,
              because two stacked status lines under a picture is a form. */}
          {(picked || note) && (
            <p className="center" style={{ margin: '8px 0 0', fontSize: 12.5, fontWeight: 700, color: 'var(--gold)' }}>
              {picked
                ? `Carrying the ${decorName(placements[picked])} — tap a marked spot to set it down.`
                : note}
            </p>
          )}

          <p className="faint" style={{ fontSize: 12, margin: '8px 0 0', lineHeight: 1.5 }}>
            <b style={{ color: 'var(--ink-dim)' }}>{keepLevelName(level)}</b> · level {level}
            {denomination && faction
              ? ` · ${faction.memberTotal} member${faction.memberTotal === 1 ? '' : 's'} play here.`
              : ' · won in battles, furnished by you.'}
            {Object.keys(placements).length === 0 && ' Stone, and room to fill it.'}
          </p>

          {/* What the next hall costs. The room itself grows with pooled wins
              (six halls, KeepHall), so the ladder is worth naming — a level
              that only changes a label is the thing this was fixing. */}
          {nextHall != null && (
            <p className="faint" style={{ fontSize: 11.5, margin: '4px 0 0', lineHeight: 1.5 }}>
              {Math.max(0, nextHall - wins).toLocaleString()} more win
              {nextHall - wins === 1 ? '' : 's'} and this becomes the{' '}
              <b style={{ color: 'var(--ink-dim)' }}>{keepLevelName(level + 1)}</b>.
            </p>
          )}

          {/* Decorate — only your own hall (your faction's, or your solo keep).
              You place YOUR decorations; other members see theirs and a sample
              of everyone's. Nothing here writes shared faction state. */}
          {ownHall && (
            <div style={{ marginTop: 12 }}>
              <Collapsible icon="🛋️" title="Decorate" meta={`${keep.owned().length}/${DECOR.length} earned`}>
                <p className="faint" style={{ fontSize: 11.5, margin: '0 0 10px', lineHeight: 1.5 }}>
                  Win keep challenges on the Battle tab to earn furnishings, then choose what hangs
                  where. Members each furnish their own view of the hall. Put something you already
                  have out a second time and the two <b style={{ color: 'var(--gold)' }}>merge</b>
                  {' '}into one finer piece — and the spare spot stays yours to fill.{' '}
                  <b style={{ color: 'var(--gold)' }}>Tap anything in the hall</b> to pick it up and
                  move it somewhere else.
                </p>
                {ANCHORS.filter((a) => decorForMount(a.mount).some((d) => keep.owned().includes(d.id))).map((a) => {
                  const options = decorForMount(a.mount).filter((d) => keep.owned().includes(d.id))
                  const current = unpackDecor(keep.placements[a.id])
                  return (
                    <div key={a.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--stroke)' }}>
                      <div className="faint" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                        {MOUNT_LABEL[a.mount]} {mountIndex(a.id)}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <Chip
                          label="Empty"
                          active={!current.id}
                          onClick={() => { juice.select(); void place(a.id, null) }}
                        />
                        {options.map((d) => {
                          // Ask the planner what the tap will really do, so a
                          // chip that's about to merge says so before it's
                          // pressed rather than surprising you afterwards.
                          const plan = planPlacement(keep.placements, a.id, d.id)
                          return (
                            <Chip
                              key={d.id}
                              label={current.id === d.id ? decorName(keep.placements[a.id]) : d.name}
                              note={plan.merged ? 'merge' : undefined}
                              active={current.id === d.id}
                              onClick={() => { void place(a.id, d.id) }}
                            />
                          )
                        })}
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

          {/* Give a finished piece to your church ------------------------- */}
          {ownHall && <Offerings placements={placements} offered={keep.offered} churchName={church?.name ?? null} onOffer={offer} />}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}

/**
 * Grand pieces, and the one thing left to do with them.
 *
 * A decoration merged to the top has nowhere further to go, so it can be given:
 * the Grand one leaves the hall, the church banks the points, and you keep the
 * plain decoration — ownership is derived from the counters and none of them
 * moved. Once ever per decoration (0062).
 *
 * It renders only when there is something to give, so an empty hall never grows
 * a section explaining a thing the player can't do yet. Guests and the
 * church-less get the one line that says where a church comes from, because the
 * button would otherwise be a promise the app can't keep.
 */
function Offerings({
  placements,
  offered,
  churchName,
  onOffer,
}: {
  placements: Placements
  offered: string[]
  churchName: string | null
  onOffer: (decorId: string) => void
}) {
  const grand = offerableAnchors(placements).filter((g) => !offered.includes(g.decor))
  if (grand.length === 0) return null

  return (
    <div style={{ marginTop: 12 }}>
      <Collapsible icon="🕯️" title="Give to your church" meta={`${grand.length} ready`}>
        <p className="faint" style={{ fontSize: 11.5, margin: '0 0 10px', lineHeight: 1.5 }}>
          A piece merged all the way to Grand has nowhere left to go. Give it and your church banks
          the points — the Grand one leaves the hall and you keep the plain one, because you never
          stopped owning it. Once each, and it doesn't touch your own XP or rank.
        </p>
        {churchName ? (
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
            {grand.map((g) => (
              <div
                key={g.decor}
                className="card"
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', minWidth: 0 }}
              >
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontWeight: 800, fontSize: 14 }}>
                    {decorName(placements[g.anchor])}
                  </span>
                  <span className="faint" style={{ display: 'block', fontSize: 12 }}>
                    +{offerValue(g.decor).toLocaleString()} to {churchName}
                  </span>
                </span>
                <button
                  className="pill"
                  onClick={() => onOffer(g.decor)}
                  style={{ borderColor: 'var(--gold)', color: 'var(--gold)', fontWeight: 800, flexShrink: 0 }}
                >
                  Give
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="dim" style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>
            Pick your church on the Church tab and you'll be able to give these to it.
          </p>
        )}
      </Collapsible>
    </div>
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

function Chip({
  label,
  active,
  note,
  onClick,
}: {
  label: string
  active: boolean
  /** Small tag on the right — 'merge' when tapping would fold a duplicate in. */
  note?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
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
      {note && (
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 800,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            padding: '1px 5px',
            borderRadius: 6,
            background: 'rgba(255,210,63,0.16)',
            color: 'var(--gold)',
          }}
        >
          ✦ {note}
        </span>
      )}
    </button>
  )
}
