import { ANCHORS, decorName } from '@/data/keep'
import type { Placements } from '@/store/keep'
import type { KeepMember } from '@/store/keep'
import { KeepHall, DecorProp } from './KeepArt'
import { KeepLife } from './KeepLife'

// The hall as a place you can look at — the painted room at its tier, whatever
// is hung in it, and the people living in it.
//
// Extracted from KeepSheet the moment a second surface wanted it (the Battle
// tab shows the hall inline under the new-battle button), which is the same
// rule QuizRunner and CrowdLife follow: the instant two screens want the same
// thing, it becomes one thing. A keep drawn two ways would drift, and the whole
// point of these little worlds is that the one in the sheet and the one on the
// tab are the same room.
//
// **The hall arranges itself now** (`data/layouts.ts`). Lifting, dragging,
// dropping on a spot, trading places and resizing all came out: a piece stands
// on its anchor, which is where the room was designed to put it. What is left
// is a picture you can take something back out of.
//
// The Upper Room has an ARRANGEMENT picker and this deliberately does not. An
// arrangement is a thing the owner of a room chooses, and nobody owns this one:
// a faction hall is thousands of strangers and its placements are a BLEND of
// theirs, so there is no person here whose taste it would be. The hall reads as
// `settled` — the anchors exactly as they have always been.
//
// Everything interactive is optional. With no `onRemove` this is a picture:
// nothing is tappable and it costs nothing to put on a screen that only wants
// to show the place.

export function KeepScene({
  color,
  level,
  placements,
  members,
  onRemove,
  onOpen,
}: {
  /** The faction colour the gonfalon and barding take. */
  color: string
  level: number
  placements: Placements
  members: KeepMember[]
  /**
   * Your own hall only (the sheet). Tapping a piece takes it back down — the
   * one gesture left that only makes sense with the piece in front of you
   * rather than on the shelf. Absent everywhere else, so a summary card cannot
   * redecorate by accident while somebody reaches for the button under it.
   *
   * In a FACTION hall the placements are a blend, so the handler refuses
   * somebody else's piece and says so; nothing here needs to know that.
   */
  onRemove?: (anchor: string) => void
  /** Makes the whole scene one big button. Only for the non-editing surfaces. */
  onOpen?: () => void
}) {
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
      <svg viewBox="0 0 560 300" style={{ display: 'block', width: '100%', height: 'auto' }}>
        <KeepHall color={color} level={level} />

        {ANCHORS.map((a) => {
          const value = placements[a.id]
          if (!value) return null
          // The value's own `~x..y..s..` suffix is deliberately NOT read any
          // more — a piece stands on its anchor. Old values still parse
          // (`unpackDecor` is untouched) and no row was rewritten, which is
          // what let this ship with no placement migration at all.
          return (
            <g
              key={a.id}
              style={{ cursor: onRemove ? 'pointer' : undefined }}
              {...(onRemove
                ? {
                    role: 'button' as const,
                    tabIndex: 0,
                    'aria-label': `Take the ${decorName(value)} back down`,
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
              <DecorProp value={value} x={a.x} y={a.y} color={color} mount={a.mount} />
            </g>
          )
        })}
      </svg>

      {/* Alive, not pasted: figures run seeded schedules between the hearth,
          the table and the stable (KeepLife). A faction hall shows its members;
          your own hall shows you. Static figures were deliberately cut before
          this — if these ever stop moving, remove them rather than letting them
          go back to being stickers. */}
      <KeepLife members={members} />
    </div>
  )
}
