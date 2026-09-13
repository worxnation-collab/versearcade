import { motion } from 'framer-motion'
import { useMemo } from 'react'
import { CrowdLife, type CrowdMember, type CrowdWaypoint } from '@/components/CrowdLife'
import { ROOM_SURFACE, furnishingName, type RoomMount } from '@/data/room'
import { arrangeAnchors, arrangementById } from '@/data/layouts'
import type { RoomPlacements } from '@/store/room'
import { RoomChamber, FurnishingProp } from './RoomArt'
import { ArcadeCabinet } from '@/features/arcade/ArcadeCabinet'

// The Upper Room as a place you can look at — the chamber at its tier, whatever
// is in it, and whoever lives there.
//
// One component, every surface that shows a room: your own section on /you, the
// visit sheet, and the postcard rasteriser. That is the same rule KeepScene and
// CrowdLife follow, and it is the whole reason the room in your profile and the
// room a friend visits are provably the same room.
//
// Everything interactive is optional. With no `editing` prop this is a picture:
// nothing is tappable, no targets are drawn, and it costs nothing to render on
// a surface that only wants to show the place — which is exactly what visiting
// needs, since a visitor must never be able to move somebody's furniture.

/** Standing spots on the room's open floor, as percentages of the scene. */
const WAYPOINTS: CrowdWaypoint[] = [
  { x: 30, b: 6 },
  { x: 46, b: 15 },
  { x: 63, b: 5 },
  { x: 21, b: 17 },
  { x: 76, b: 11 },
]

/**
 * Depth cue: further up the floor = smaller. b 5..17% -> 146..100px.
 *
 * MUCH bigger than the other worlds' figures, and deliberately so: this is the
 * one scene that holds exactly ONE person. The hall, the churchyard and the
 * road all draw a crowd, so a figure there is sized to leave room for the
 * others and reads as one of many. A room only ever has its owner in it —
 * RoomSection and RoomVisitSheet each pass a single member — so a
 * crowd-sized figure just read as a doll in an outsized chamber.
 *
 * The numbers are measured against the painting rather than picked: the
 * chamber's alcove stands about 59% of the scene's height and its low table
 * about 14%, which puts a person at roughly half the frame. At the old 46px
 * the owner was a twelfth of the room's height and shorter than the table
 * they were standing next to.
 *
 * Landed by looking rather than by arithmetic alone — the figure now stands
 * about 0.7 of the alcove's height, which reads as a person in a room without
 * filling it. The pet follows automatically: CrowdLife draws it at a ratio of
 * the figure, so a companion grows with its owner and needs nothing here.
 *
 * The postcard is unaffected. CrowdLife draws people as HTML over the scene
 * rather than as SVG, so no figure has ever been serialised onto the card.
 */
const sizeFor = (b: number) => Math.round(146 - ((Math.min(Math.max(b, 5), 17) - 5) / 12) * 46)

export function RoomScene({
  tier,
  skin,
  layout,
  placements,
  members,
  onRemove,
  onOpen,
  onArcade,
  onTapSelf,
  /** Skip the generated painting — the postcard can only serialise drawn SVG. */
  flat = false,
  lampLit = true,
}: {
  tier: number
  /** What the room is made of. Undefined draws the default, which is the room
   *  exactly as it has always been drawn. */
  skin?: string | null
  /** Which arrangement the owner picked (`data/layouts.ts`, 0112). Undefined
   *  is `settled`, the room exactly as it has always been laid out. */
  layout?: string | null
  placements: RoomPlacements
  members: CrowdMember[]
  /**
   * Your own room only. The scene used to take a whole editing protocol here —
   * pick, drop, drag-commit, resize, remove — and it is one callback now.
   *
   * **The room arranges itself** (`data/layouts.ts`): you choose the material
   * and the arrangement, and where each piece stands is the app's job. Tapping
   * a piece takes it back out, which is the one thing left that only makes
   * sense with the piece in front of you; everything else is the shelf.
   */
  onRemove?: (anchor: string) => void
  /** Tapping the picture itself — the summary card opens the full section. */
  onOpen?: () => void
  /** The cabinet in the corner. Only the room that belongs to the player. */
  onArcade?: () => void
  /** Tapping your OWN figure offers to pray — the one place in the app where
   *  a figure does something other than open a player card. */
  onTapSelf?: () => void
  /** Skip the generated painting — the postcard can only serialise drawn SVG. */
  flat?: boolean
  lampLit?: boolean
}) {
  // Where everything stands, as this arrangement has it. Memoised because it
  // is pure over (surface, arrangement) and the scene re-renders on every
  // crowd tick.
  const anchors = useMemo(
    () => arrangeAnchors(ROOM_SURFACE, arrangementById(layout)),
    [layout],
  )

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 'var(--r-md)',
        overflow: 'hidden',
        border: '1px solid var(--stroke)',
        cursor: onOpen ? 'pointer' : undefined,
      }}
      onClick={onOpen}
    >
      <svg
        viewBox="0 0 560 300"
        style={{ display: 'block', width: '100%', height: 'auto' }}
        data-room-scene=""
      >
        <RoomChamber tier={tier} flat={flat} skin={skin} />

        {/* Tucked into the left corner, clear of floor_1 at x=96. */}
        {onArcade && <ArcadeCabinet x={52} y={284} scale={0.86} screen="attract" onOpen={onArcade} />}

        {anchors.map((a, i) => {
          const value = placements[a.id]
          if (!value) return null
          // The piece is DRAWN on its designed anchor and the group is
          // TRANSLATED to where this arrangement puts it. Drawing it at the
          // arranged point instead would snap between arrangements, because the
          // position would be an SVG attribute rather than a motion value —
          // which is what this did on its first pass, and it is invisible in a
          // diff because both render identically while nothing changes.
          const base = ROOM_SURFACE.anchors[i]
          const bx = (base as { x?: number }).x ?? 0
          const by = (base as { y?: number }).y ?? 0
          const ax = (a as { x?: number }).x ?? bx
          const ay = (a as { y?: number }).y ?? by
          // The value's own `~x..y..s..` suffix is deliberately NOT read any
          // more: a piece stands where the arrangement puts it. Old values
          // still parse — `unpackDecor` is untouched and no row was rewritten —
          // the suffix simply stops meaning anything here, which is what let
          // this ship with no placement migration at all.
          return (
            <motion.g
              key={a.id}
              initial={false}
              // The whole of the motion left in this scene: a piece slides to
              // its new spot when the arrangement changes. Nothing tracks a
              // finger, because nothing is dragged.
              animate={{ x: ax - bx, y: ay - by }}
              transition={{ type: 'spring', stiffness: 160, damping: 24 }}
              style={{ cursor: onRemove ? 'pointer' : undefined }}
              {...(onRemove
                ? {
                    role: 'button' as const,
                    tabIndex: 0,
                    'aria-label': `Take the ${furnishingName(value)} back out`,
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return
                      e.preventDefault()
                      onRemove(a.id)
                    },
                    onClick: (e: React.MouseEvent) => {
                      e.stopPropagation()
                      onRemove(a.id)
                    },
                  }
                : {})}
            >
              <FurnishingProp value={value} x={bx} y={by} mount={a.mount as RoomMount} lit={lampLit} />
            </motion.g>
          )
        })}
      </svg>

      {/* Alive, not pasted — the same engine the hall, the churchyard and the
          road use, so your companion walks in here too without this file
          knowing pets exist. `max` is 3 rather than the hall's 6: this is a
          small room, and a crowd in it would be a party, not a chamber. */}
      {/* Inert while a piece is held, the same rule the hall and the churchyard
          follow: your own figure walks in front of the furniture, and a tap
          meant for the lampstand would open the prayer offer instead. */}
      <CrowdLife
        members={members}
        waypoints={WAYPOINTS}
        sizeFor={sizeFor}
        max={3}
        onTapSelf={onTapSelf}
      />
    </div>
  )
}
