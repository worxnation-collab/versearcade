import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Collapsible } from '@/components/Collapsible'
import { useAuth } from '@/store/auth'
import { useBible } from '@/store/bible'
import { useCollection } from '@/store/collection'
import { useRoom } from '@/store/room'
import { useJuice } from '@/juice/useJuice'
import { roomProgress } from '@/lib/roomProgress'
import { packDecor } from '@/data/placement'
import {
  FURNISHINGS,
  REQUIREMENT_NOUN,
  ROOM_MOUNT_WORD,
  furnishingName,
  levelForTier,
  nextFurnishing,
  ownedFurnishings,
  planRoomPick,
  roomAnchorsHolding,
  roomPlacedTier,
  roomTier,
  roomTierName,
  type RoomProgress,
} from '@/data/room'
import { RoomScene } from './RoomScene'
import { FurnishingThumb } from './RoomArt'
import { sharePostcard } from '@/lib/postcard'

// Your Upper Room, on /you — the one surface that owns furnishing it.
//
// It sits directly under ProfileHero, which is the little-worlds rule: a world
// opens its section rather than hiding behind a row that describes it. And it
// is the ONLY editable copy — the visit sheet renders the same RoomScene with
// no `editing` prop, so a room you are visiting is inert by construction rather
// than by everyone remembering not to write to it.

export function RoomSection() {
  const juice = useJuice()
  const me = useAuth((s) => s.profile)
  const placements = useRoom((s) => s.placements)
  const [merged, setMerged] = useState<{ anchor: string; name: string } | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)

  // The room's own store, plus the two stores its REQUIREMENTS live in. Loading
  // only the first would quietly report 0 studied verses and 0 chapters read
  // and lock three furnishings that are already earned — the exact trap
  // lib/petProgress.ts documents for the pet picker.
  useEffect(() => {
    void useRoom.getState().load()
    if (!useBible.getState().loaded) void useBible.getState().load()
    if (!useCollection.getState().loaded) void useCollection.getState().load()
  }, [])

  // Re-read the numbers whenever anything they depend on changes. Subscribing
  // to the three stores rather than computing once on mount is what makes a
  // furnishing appear the moment its requirement is met.
  const level = useAuth((s) => s.profile?.level ?? 1)
  const studiedCount = useBible((s) => Object.keys(s.studied).length)
  const readCount = useBible((s) => Object.keys(s.chapters).length)
  const cardCount = useCollection((s) => s.owned.length)
  const progress: RoomProgress = roomProgress()
  void studiedCount
  void readCount
  void cardCount

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

  if (!me) return null

  const owned = ownedFurnishings(progress)
  const tier = roomTier(level)
  const nextLevel = levelForTier(tier)
  const upNext = nextFurnishing(progress)

  // Tap a placed piece: lift it, or put it back down where it was.
  const pickUp = (anchor: string) => {
    juice.tap()
    setPicked((cur) => (cur === anchor ? null : anchor))
  }

  // Tap a spot while carrying: move it there. An occupied spot trades places
  // rather than overwriting, and the same piece merges (see planRoomMove).
  const dropOn = async (anchor: string) => {
    const from = picked
    if (!from) return
    setPicked(null)
    const res = await useRoom.getState().move(from, anchor)
    if (!res) return
    if (res.merged) {
      juice.merge()
      setMerged({ anchor: res.anchor, name: furnishingName(useRoom.getState().placements[res.anchor]) })
    } else {
      juice.select()
      if (res.swapped) setNote('Swapped.')
    }
  }

  // Tap a piece on the shelf: it goes where it belongs, or merges with the one
  // already out. The planner decides; this only reports what happened.
  const pickFurnishing = async (id: string) => {
    // Plan against the LIVE store, not the rendered snapshot. `placements` from
    // the hook is whatever the last render saw, and two taps inside one tick
    // both read it — so tapping the mat and then the stool planned the same
    // free floor anchor twice and the second overwrote the first. Found by
    // driving the real app; it is invisible in the diff, and it is the one
    // thing the planner exists to make impossible.
    const plan = planRoomPick(useRoom.getState().placements, id)
    if (plan.kind === 'maxed') {
      juice.select()
      setNote('That’s already as fine as it gets — tap it in the room to move it.')
      return
    }
    if (plan.kind === 'full') {
      const word = ROOM_MOUNT_WORD[plan.mount as keyof typeof ROOM_MOUNT_WORD] ?? 'spot'
      juice.select()
      setNote(`No room on the ${word} — take something down first.`)
      return
    }
    const res = await useRoom.getState().place(plan.anchor, id)
    if (res.failed) {
      setNote('That didn’t save. Try again in a moment.')
      return
    }
    if (res.merged) {
      juice.merge()
      setMerged({ anchor: res.anchor, name: furnishingName(res.value) })
    } else {
      juice.select()
    }
  }

  /** Take every copy of a furnishing back out of the room. */
  const clearFurnishing = async (id: string) => {
    juice.select()
    for (const anchor of roomAnchorsHolding(useRoom.getState().placements, id)) {
      const res = await useRoom.getState().place(anchor, null)
      if (res.failed) {
        setNote('That didn’t save. Try again in a moment.')
        return
      }
    }
  }

  const postcard = async () => {
    setSharing(true)
    juice.coin()
    const ok = await sharePostcard(me.username)
    setSharing(false)
    setNote(ok ? null : 'Couldn’t make a postcard on this device.')
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>Your Upper Room</b>
        <span className="faint" style={{ fontSize: 11.5 }}>{roomTierName(tier)}</span>
      </div>

      <RoomScene
        tier={tier}
        placements={placements}
        members={[{
          username: me.username,
          avatarEmoji: me.avatarEmoji,
          avatarCharacter: me.avatarCharacter,
          pet: me.pet,
          isMe: true,
        }]}
        editing={{ picked, mergedAnchor: merged?.anchor ?? null, onPick: pickUp, onDrop: (a) => void dropOn(a) }}
      />

      <AnimatePresence>
        {merged && (
          <motion.p
            key="room-merge"
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
            ? `Carrying the ${furnishingName(placements[picked])} — tap a marked spot to set it down.`
            : note}
        </p>
      )}

      <p className="faint" style={{ fontSize: 12, margin: '8px 0 0', lineHeight: 1.5 }}>
        A little chamber on the wall — a bed, a table, a stool and a candlestick (2 Kings 4:10).
        {Object.keys(placements).length === 0 && ' Bare, and room to fill it.'}
      </p>
      {nextLevel != null && (
        <p className="faint" style={{ fontSize: 11.5, margin: '4px 0 0', lineHeight: 1.5 }}>
          At level {nextLevel} this becomes the{' '}
          <b style={{ color: 'var(--ink-dim)' }}>{roomTierName(tier + 1)}</b>.
        </p>
      )}

      <div style={{ marginTop: 12 }}>
        <Collapsible icon="🪑" title="Furnish" meta={`${owned.length}/${FURNISHINGS.length} earned`}>
          <p className="faint" style={{ fontSize: 11.5, margin: '0 0 10px', lineHeight: 1.5 }}>
            Tap a piece to put it in the room. Tap one you already have out and the two{' '}
            <b style={{ color: 'var(--gold)' }}>merge</b> into something finer. Tap anything in the
            room above to pick it up and move it — nothing you place can ever be lost.
          </p>
          <Shelf
            owned={owned}
            placements={placements}
            progress={progress}
            onPick={(id) => void pickFurnishing(id)}
            onClear={(id) => void clearFurnishing(id)}
          />
          {upNext && (
            <p className="faint" style={{ fontSize: 11.5, margin: '10px 0 0', lineHeight: 1.5 }}>
              Next: <b style={{ color: 'var(--ink-dim)' }}>{upNext.name}</b> —{' '}
              {REQUIREMENT_NOUN[upNext.req](upNext.goal).toLowerCase()} (
              {Math.min(progress[upNext.req], upNext.goal).toLocaleString()}/
              {upNext.goal.toLocaleString()}).
            </p>
          )}
          <button
            className="pill"
            onClick={() => void postcard()}
            disabled={sharing}
            style={{ marginTop: 12, fontWeight: 800, fontSize: 12.5 }}
          >
            {sharing ? '…' : '📮 Share a postcard'}
          </button>
        </Collapsible>
      </div>
    </div>
  )
}

/**
 * The shelf you pick furnishings from.
 *
 * Ordered by the ladder (FURNISHINGS order), so it reads as the collection it
 * is and a newly-earned piece appears where you'd expect rather than jumping to
 * the front. Locked pieces stay visible and dimmed — a silhouette would hide
 * what you're working toward — and every locked tile SAYS what earns it, which
 * is the one thing the keep's shelf makes you leave the sheet to find out.
 */
function Shelf({
  owned,
  placements,
  progress,
  onPick,
  onClear,
}: {
  owned: string[]
  placements: Record<string, string>
  progress: RoomProgress
  onPick: (id: string) => void
  onClear: (id: string) => void
}) {
  return (
    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' }}>
      {FURNISHINGS.map((f) => {
        const has = owned.includes(f.id)
        const tier = roomPlacedTier(placements, f.id)
        const out = tier > 0
        return (
          <div
            key={f.id}
            style={{
              position: 'relative',
              borderRadius: 12,
              border: `1px solid ${out ? 'var(--gold)' : 'var(--stroke)'}`,
              background: out ? 'rgba(255,210,63,0.10)' : 'rgba(255,255,255,0.04)',
              opacity: has ? 1 : 0.45,
              overflow: 'hidden',
            }}
          >
            <button
              onClick={() => has && onPick(f.id)}
              disabled={!has}
              aria-label={has ? `Place ${f.name}` : `${f.name}, locked — ${REQUIREMENT_NOUN[f.req](f.goal)}`}
              style={{
                display: 'block',
                width: '100%',
                padding: '10px 6px 8px',
                background: 'none',
                border: 'none',
                cursor: has ? 'pointer' : 'default',
                textAlign: 'center',
              }}
            >
              <span style={{ display: 'grid', placeItems: 'center', height: 56 }}>
                <FurnishingThumb id={f.id} size={54} />
              </span>
              <span style={{ display: 'block', fontSize: 11, fontWeight: 800, marginTop: 4, lineHeight: 1.25 }}>
                {out ? furnishingName(packDecor(f.id, tier)) : f.name}
              </span>
              <span className="faint" style={{ display: 'block', fontSize: 10, marginTop: 2, lineHeight: 1.3 }}>
                {has
                  ? out
                    ? 'In the room'
                    : ROOM_MOUNT_WORD[f.mount]
                  : `🔒 ${REQUIREMENT_NOUN[f.req](f.goal)} (${Math.min(progress[f.req], f.goal).toLocaleString()}/${f.goal.toLocaleString()})`}
              </span>
            </button>
            {out && (
              <button
                onClick={() => onClear(f.id)}
                aria-label={`Take ${f.name} back out`}
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  border: '1px solid var(--stroke)',
                  background: 'rgba(10,5,26,0.8)',
                  color: 'var(--ink-dim)',
                  fontSize: 12,
                  lineHeight: 1,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
