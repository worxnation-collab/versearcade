import { motion } from 'framer-motion'
import { CrowdLife, type CrowdMember, type CrowdWaypoint } from '@/components/CrowdLife'
import { ROOM_ANCHORS, roomAnchorById } from '@/data/room'
import type { RoomPlacements } from '@/store/room'
import { RoomChamber, FurnishingProp } from './RoomArt'

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

/** Depth cue: further up the floor = smaller. b 5..17% -> 46..30px. */
const sizeFor = (b: number) => Math.round(46 - ((Math.min(Math.max(b, 5), 17) - 5) / 12) * 16)

export function RoomScene({
  tier,
  placements,
  members,
  editing,
  onOpen,
  onTapSelf,
  /** Skip the generated painting — the postcard can only serialise drawn SVG. */
  flat = false,
}: {
  tier: number
  placements: RoomPlacements
  members: CrowdMember[]
  /**
   * Tap-to-move, for the ONE surface that owns the furnishing (RoomSection).
   * Absent everywhere else. A room you can rearrange from somebody else's
   * screen is the church-page rule broken; a room you can rearrange from a
   * summary card lets you redecorate by accident.
   */
  editing?: {
    picked: string | null
    mergedAnchor?: string | null
    onPick: (anchor: string) => void
    onDrop: (anchor: string) => void
  }
  onOpen?: () => void
  flat?: boolean
  /** Tapping YOUR OWN figure in the room. Only the editable surface passes it:
   *  a visited room shows its owner, and tapping them opens their card as it
   *  does in every other scene. */
  onTapSelf?: () => void
}) {
  const picked = editing?.picked ?? null
  const pickedMount = picked ? roomAnchorById(picked)?.mount : undefined

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
        <RoomChamber tier={tier} flat={flat} />

        {ROOM_ANCHORS.map((a) => {
          const value = placements[a.id]
          if (!value) return null
          const lifted = picked === a.id
          // The spot that just absorbed a duplicate gives one pulse — the eye
          // needs telling where to look when the thing you tapped isn't the
          // thing that changed.
          return (
            <motion.g
              key={a.id}
              initial={false}
              animate={
                editing?.mergedAnchor === a.id
                  ? { scale: [1, 1.22, 1], y: 0 }
                  : lifted
                    ? { scale: 1.08, y: -6 }
                    : { scale: 1, y: 0 }
              }
              transition={{ duration: lifted ? 0.18 : 0.5 }}
              style={{ transformOrigin: `${a.x}px ${a.y}px`, cursor: editing ? 'pointer' : undefined }}
              onClick={
                editing
                  ? () => (picked && picked !== a.id ? editing.onDrop(a.id) : editing.onPick(a.id))
                  : undefined
              }
            >
              <FurnishingProp value={value} x={a.x} y={a.y} mount={a.mount} />
              {lifted && (
                <circle cx={a.x} cy={a.y} r="28" fill="none" stroke="var(--gold)" strokeWidth="2" strokeDasharray="5 5" opacity="0.9" />
              )}
            </motion.g>
          )
        })}

        {/* Where the carried piece can go: every OTHER spot of its own kind.
            The constraint made visible, rather than an error after the fact. */}
        {editing && picked &&
          ROOM_ANCHORS.filter((a) => a.id !== picked && a.mount === pickedMount).map((a) => (
            <g key={`t-${a.id}`} onClick={() => editing.onDrop(a.id)} style={{ cursor: 'pointer' }}>
              {/* Generous invisible hit area — the visible ring is a 12px tap. */}
              <circle cx={a.x} cy={a.y} r="26" fill="transparent" />
              <circle
                cx={a.x}
                cy={a.y}
                r="13"
                fill={placements[a.id] ? 'rgba(10,5,26,0.86)' : 'rgba(255,210,63,0.16)'}
                stroke="var(--gold)"
                strokeWidth="2"
                strokeDasharray="4 4"
              />
              {placements[a.id] && (
                // Two arrows: this spot is taken, so dropping here trades.
                <path
                  d={`M${a.x - 6} ${a.y - 3} h12 l-3 -3 M${a.x + 6} ${a.y + 3} h-12 l3 3`}
                  fill="none"
                  stroke="var(--gold)"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </g>
          ))}
      </svg>

      {/* Alive, not pasted — the same engine the hall, the churchyard and the
          road use, so your companion walks in here too without this file
          knowing pets exist. `max` is 3 rather than the hall's 6: this is a
          small room, and a crowd in it would be a party, not a chamber. */}
      <CrowdLife members={members} waypoints={WAYPOINTS} sizeFor={sizeFor} max={3} onTapSelf={onTapSelf} />
    </div>
  )
}
