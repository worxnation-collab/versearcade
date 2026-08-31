import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Collapsible } from '@/components/Collapsible'
import { useAuth } from '@/store/auth'
import { useBible } from '@/store/bible'
import { useCollection } from '@/store/collection'
import { useRoom } from '@/store/room'
import { useJuice } from '@/juice/useJuice'
import { roomProgress } from '@/lib/roomProgress'
import { packDecor, unpackDecor } from '@/data/placement'
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
  furnishingBestTier,
  nextFurnishingTierInfo,
  type RoomProgress,
} from '@/data/room'
import { RoomScene } from './RoomScene'
import { FurnishingThumb } from './RoomArt'
import { sharePostcard } from '@/lib/postcard'
import { PrayerSheet } from '@/features/prayer/PrayerSheet'
import { usePrayer } from '@/store/prayer'

// Your Upper Room, on /you — the one surface that owns furnishing it.
//
// It sits directly under ProfileHero, which is the little-worlds rule: a world
// opens its section rather than hiding behind a row that describes it. And it
// is the ONLY editable copy — the visit sheet renders the same RoomScene with
// no `editing` prop, so a room you are visiting is inert by construction rather
// than by everyone remembering not to write to it.

const SIZE_BTN: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 10,
  border: '1px solid var(--stroke)',
  background: 'rgba(255,255,255,0.06)',
  color: 'var(--ink)',
  fontSize: 16,
  fontWeight: 800,
  cursor: 'pointer',
}

export function RoomSection() {
  const juice = useJuice()
  const navigate = useNavigate()
  const me = useAuth((s) => s.profile)
  const placements = useRoom((s) => s.placements)
  const [merged, setMerged] = useState<{ anchor: string; name: string } | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  // Tapping your own figure in your own room offers to pray. Two steps rather
  // than opening the sheet on the tap itself: a figure that launches a
  // full-screen sheet the instant you brush it is a trap on a screen where
  // everything else you tap is furniture you're moving.
  // Burning when you have prayed today. The whole of the feedback for praying:
  // no count, no streak, no rung — it resets by itself every day and the only
  // thing it can say is "today, yes".
  const lampLit = usePrayer((s) => s.today > 0)
  const [praying, setPraying] = useState(false)
  const [prayerOffered, setPrayerOffered] = useState(false)

  // The room's own store, plus the two stores its REQUIREMENTS live in. Loading
  // only the first would quietly report 0 studied verses and 0 chapters read
  // and lock three furnishings that are already earned — the exact trap
  // lib/petProgress.ts documents for the pet picker.
  useEffect(() => {
    void useRoom.getState().load()
    if (!useBible.getState().loaded) void useBible.getState().load()
    if (!useCollection.getState().loaded) void useCollection.getState().load()
    // The lamp. Loaded here rather than only inside the prayer sheet, or it
    // would stay dark until you opened the sheet — which is the one screen
    // where you already know the answer.
    void usePrayer.getState().load()
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
  // rather than overwriting (see planRoomMove).
  const dropOn = async (anchor: string) => {
    const from = picked
    if (!from) return
    setPicked(null)
    const res = await useRoom.getState().move(from, anchor)
    if (!res) return
    juice.select()
    if (res.swapped) setNote('Swapped.')
  }

  // Where a dragged piece was let go: stand it right there, clamped to its own
  // mount's band. Selection is kept so a nudge can follow a nudge.
  const dropAt = async (x: number, y: number) => {
    if (!picked) return
    juice.select()
    await useRoom.getState().moveTo(picked, x, y)
  }

  // The ✕ on the lifted piece: take that one back out of the room. It loses
  // nothing — ownership is derived from lifetime numbers that only go up, so
  // the piece is back on the shelf at the same tier before the toast fades.
  const removeAt = async (anchor: string) => {
    juice.select()
    const name = furnishingName(useRoom.getState().placements[anchor])
    setPicked(null)
    const res = await useRoom.getState().place(anchor, null)
    if (res.failed) {
      setNote('That didn’t save. Try again in a moment.')
      return
    }
    setNote(name ? `Took the ${name} back out — it’s on the shelf.` : null)
  }

  // Grow or shrink the selected furnishing a step. Bounds live in the planner.
  const resizePicked = async (delta: number) => {
    if (!picked) return
    const cur = unpackDecor(useRoom.getState().placements[picked]).s ?? 1
    juice.tap()
    await useRoom.getState().resize(picked, cur + delta)
  }

  // Tap a piece on the shelf: it goes where it belongs, or upgrades the one
  // already out in place. The planner decides; this only reports what happened.
  const pickFurnishing = async (id: string) => {
    // Plan against the LIVE store, not the rendered snapshot. `placements` from
    // the hook is whatever the last render saw, and two taps inside one tick
    // both read it — so tapping the mat and then the stool planned the same
    // free floor anchor twice and the second overwrote the first. Found by
    // driving the real app; it is invisible in the diff, and it is the one
    // thing the planner exists to make impossible.
    // The shelf offers the finest tier this life has earned; a lesser copy
    // already out is upgraded where it stands.
    const tier = Math.max(1, furnishingBestTier(id, roomProgress()))
    const plan = planRoomPick(useRoom.getState().placements, id, tier)
    if (plan.kind === 'already') {
      juice.select()
      setNote('That’s already out — tap it in the room to drag, resize or take it out.')
      return
    }
    if (plan.kind === 'full') {
      const word = ROOM_MOUNT_WORD[plan.mount as keyof typeof ROOM_MOUNT_WORD] ?? 'spot'
      juice.select()
      setNote(`No room on the ${word} — take something down first.`)
      return
    }
    const res = await useRoom.getState().place(plan.anchor, plan.value)
    if (res.failed) {
      setNote('That didn’t save. Try again in a moment.')
      return
    }
    if (plan.kind === 'upgrade') {
      juice.merge()
      setMerged({ anchor: plan.anchor, name: furnishingName(plan.value) })
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
    const outcome = await sharePostcard(me.username)
    setSharing(false)
    // Shared and cancelled both say nothing: one is obvious, and the other was
    // a decision. Only the two outcomes the player can't see get a line.
    setNote(
      outcome === 'saved'
        ? 'Saved the postcard to your photos or files.'
        : outcome === 'failed'
          ? 'Couldn’t make a postcard on this device.'
          : null,
    )
  }

  return (
    <div style={{ marginTop: 14 }}>
      {/* Pray and Postcard sit ON the room's own title, not inside the Furnish
          shelf they used to hide at the bottom of. Sharing a room is not a step
          of decorating one, and a button folded behind a collapsible is a
          button nobody found. `flexWrap` lets them drop to their own line on a
          320px phone rather than crushing the tier name.

          PRAY IS HERE BECAUSE IT HAD NO NAME ANYWHERE IN THE APP. The gesture
          was reachable only by tapping your own figure in the room and then
          confirming — a lovely thing to discover and an impossible thing to
          find, on the one feature here that isn't a game. Tapping the figure
          still works and still offers; this is the same sheet with a label on
          it, so somebody who has never brushed their own character can still
          get to it.

          It says the same thing the lamp says and nothing more: an invitation
          while today is unprayed, quiet once it isn't. No count, no streak, no
          rung — see the lamp's note in CLAUDE.md for why a growing tally here
          would change why somebody does it. */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>Your Upper Room</b>
        <span className="faint" style={{ fontSize: 11.5 }}>{roomTierName(tier)}</span>
        <button
          className="pill"
          onClick={() => { juice.select(); setPraying(true) }}
          aria-label={lampLit ? 'Pray again' : 'Pray in your room'}
          style={{
            marginLeft: 'auto',
            fontWeight: 800,
            fontSize: 12,
            padding: '5px 12px',
            borderColor: lampLit ? undefined : 'var(--gold)',
            color: lampLit ? undefined : 'var(--gold)',
          }}
        >
          🙏 Pray
        </button>
        <button
          className="pill"
          onClick={() => void postcard()}
          disabled={sharing}
          aria-label="Share a postcard of your room"
          style={{
            fontWeight: 800,
            fontSize: 12,
            padding: '5px 12px',
            opacity: sharing ? 0.6 : 1,
          }}
        >
          {sharing ? '…' : '📮 Postcard'}
        </button>
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
        editing={{
          picked,
          mergedAnchor: merged?.anchor ?? null,
          onPick: pickUp,
          onDrop: (a) => void dropOn(a),
          onDropAt: (x, y) => void dropAt(x, y),
          onCancel: () => { juice.tap(); setPicked(null) },
          onRemove: (a) => void removeAt(a),
        }}
        lampLit={lampLit}
        onTapSelf={() => { juice.tap(); setPrayerOffered(true) }}
        onArcade={() => { juice.select(); navigate('/arcade') }}
      />

      {/* The offer, not the thing itself. It stays until it's taken or waved
          off — a prompt that vanishes on a timer is one you have to catch. */}
      <AnimatePresence>
        {prayerOffered && !praying && (
          <motion.div
            key="pray-offer"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}
          >
            <button
              className="pill"
              onClick={() => { juice.select(); setPraying(true) }}
              style={{
                fontWeight: 800,
                fontSize: 13.5,
                padding: '10px 18px',
                borderColor: 'var(--gold)',
                color: 'var(--gold)',
              }}
            >
              🙏 Pray
            </button>
            <button
              className="pill"
              onClick={() => { juice.select(); setPrayerOffered(false) }}
              aria-label="Not now"
              style={{ fontSize: 12, fontWeight: 800 }}
            >
              Not now
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {praying && (
        <PrayerSheet onClose={() => { setPraying(false); setPrayerOffered(false) }} />
      )}

      <AnimatePresence>
        {picked && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
            <span className="faint" style={{ fontSize: 12, fontWeight: 700 }}>
              {furnishingName(useRoom.getState().placements[picked])}
            </span>
            <button onClick={() => void resizePicked(-0.1)} aria-label="Smaller" style={SIZE_BTN}>
              −
            </button>
            <button onClick={() => void resizePicked(0.1)} aria-label="Bigger" style={SIZE_BTN}>
              ＋
            </button>
            <button onClick={() => setPicked(null)} style={{ ...SIZE_BTN, width: 'auto', padding: '0 10px' }}>
              Done
            </button>
          </div>
        )}
        {merged && (
          <motion.p
            key="room-merge"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="center"
            style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 800, color: 'var(--gold)' }}
          >
            ✦ Upgraded where it stands — that’s a {merged.name} now.
          </motion.p>
        )}
      </AnimatePresence>

      {/* Carrying, or a note about the last thing that happened. One slot,
          because two stacked status lines under a picture is a form. */}
      {(picked || note) && (
        <p className="center" style={{ margin: '8px 0 0', fontSize: 12.5, fontWeight: 700, color: 'var(--gold)' }}>
          {picked
            ? `Holding the ${furnishingName(placements[picked])} — drag it anywhere, tap a marked spot to swap, ✕ to take it out, or tap the floor to let go.`
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
            Tap a piece to put it in the room — the finest version you've earned. Keep at it and
            it <b style={{ color: 'var(--gold)' }}>upgrades</b> where it stands. Tap anything in the
            room above to pick it up, then <b style={{ color: 'var(--gold)' }}>drag it</b> wherever
            you like — or resize it, or tap its ✕ to take it back out. Tapping anywhere else in
            the room puts it down. Nothing you place can ever be lost.
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
        const best = furnishingBestTier(f.id, progress)
        const tier = roomPlacedTier(placements, f.id)
        const out = tier > 0
        const next = nextFurnishingTierInfo(f.id, progress)
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
                {has ? furnishingName(packDecor(f.id, Math.max(tier, best, 1))) : f.name}
              </span>
              <span className="faint" style={{ display: 'block', fontSize: 10, marginTop: 2, lineHeight: 1.3 }}>
                {has
                  ? `${out ? 'In the room' : ROOM_MOUNT_WORD[f.mount]}${next ? ` · ${next.name} at ${next.goal.toLocaleString()}` : ''}`
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
