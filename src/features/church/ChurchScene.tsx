import { motion } from 'framer-motion'
import { Character } from '@/components/Character'
import { ChurchArt } from './ChurchArt'
import type { ChurchMember } from '@/types'

// The church, pulled back far enough that you can see the people.
//
// The hero on your own church tab is a portrait of the *building*. This is the
// wide shot: the same building, smaller, with the congregation standing outside
// it on the grass. That difference is the whole point — a leaderboard row is a
// number, and this is meant to be the moment it turns into a place with people
// in front of it.
//
// The crowd is drawn in two ranks so it reads as depth rather than a line-up:
// the back rank is smaller, dimmer and higher on the ground plane; the front
// rank is bigger and lower. Nobody is ordered by what they gave, and no figure
// carries a score — see the note on ChurchMember.
//
// It draws at most eleven people and deliberately doesn't say so. This is a
// picture of the place, not a census: the roster underneath it names the
// congregation and carries the head count, and a "+23 more" badge up here only
// argued with the list of names right below it.

const CANVAS_H = 236
/** Where the building's own ground ellipse lands, measured from the bottom. */
const GROUND = 82
const CHURCH_W = 190

/** Stable per-person jitter, so nobody shuffles on a re-render. */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967295
}

interface Figure {
  member: ChurchMember
  /** Percent across the scene. */
  x: number
  /** Pixels from the bottom of the scene. */
  y: number
  size: number
}

/** Spread `members` across the width in a rank, nudged so they don't line up. */
function rank(members: ChurchMember[], y: number, size: number): Figure[] {
  const n = members.length
  return members.map((member, i) => {
    const j = hash(member.username)
    // Evenly spaced across 10%–90%, then jittered by up to ±3.5% of the width.
    const span = n === 1 ? 0 : 80 / (n - 1)
    const x = (n === 1 ? 50 : 10 + i * span) + (j - 0.5) * 7
    return {
      member,
      x,
      y: y + Math.round((j - 0.5) * 8),
      size: Math.round(size * (0.9 + j * 0.2)),
    }
  })
}

export function ChurchScene({
  level,
  members,
  skin,
}: {
  level: number
  members: ChurchMember[]
  /** The church's skin, so the wide shot matches the row you tapped. */
  skin?: string | null
}) {
  // You stand out front. Everyone else keeps the server's order (oldest member
  // first), which is stable and means the crowd doesn't rearrange itself.
  const ordered = [...members].sort((a, b) => Number(b.isMe) - Number(a.isMe))
  const front = rank(ordered.slice(0, 5), 18, 40)
  const back = rank(ordered.slice(5, 11), 56, 28)

  return (
    <div
      style={{
        position: 'relative',
        height: CANVAS_H,
        borderRadius: 'var(--r-md)',
        overflow: 'hidden',
        border: '1px solid var(--stroke)',
        background:
          'radial-gradient(120% 90% at 50% 8%, #35197a 0%, #1b0d43 55%, #120829 100%)',
      }}
    >
      {/* A few stars, fixed so they don't twinkle differently on every render. */}
      {STARS.map((s, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            left: `${s[0]}%`,
            top: `${s[1]}%`,
            width: s[2],
            height: s[2],
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.65)',
          }}
        />
      ))}

      {/* Grass. The building's own shadow ellipse sits right on this line. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: GROUND + 6,
          background: 'linear-gradient(180deg, #24404a 0%, #16262f 100%)',
          borderTop: '1px solid rgba(94,231,223,0.18)',
        }}
      />
      {/* The path up to the door — narrow at the church, wide at the viewer, so
          it reads as ground running away from you rather than a beam of light.
          It's what makes the figures look like they're standing *outside* the
          church rather than floating in front of it. */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 0,
          width: 120,
          height: GROUND + 6,
          transform: 'translateX(-50%)',
          background: 'linear-gradient(0deg, rgba(243,236,221,0.16), rgba(243,236,221,0.05))',
          clipPath: 'polygon(0% 100%, 100% 100%, 60% 0%, 40% 0%)',
        }}
      />

      <div style={{ position: 'absolute', left: '50%', bottom: GROUND - 8, transform: 'translateX(-50%)' }}>
        <ChurchArt level={level} skin={skin} size={CHURCH_W} />
      </div>

      {back.map((f) => (
        <Figure key={f.member.username} {...f} dim />
      ))}
      {front.map((f) => (
        <Figure key={f.member.username} {...f} />
      ))}

      {members.length === 0 && (
        <p
          className="faint"
          style={{ position: 'absolute', left: 0, right: 0, bottom: 10, margin: 0, fontSize: 12, textAlign: 'center' }}
        >
          The doors are open — nobody's playing for this one yet.
        </p>
      )}
    </div>
  )
}

// Fixed constellation — decorative only, and identical for every church so the
// scene reads as one place rather than a random field.
const STARS: [number, number, number][] = [
  [8, 12, 2], [17, 30, 1.5], [26, 8, 1.5], [38, 20, 2], [47, 6, 1.5],
  [58, 16, 2], [69, 9, 1.5], [78, 26, 2], [88, 14, 1.5], [93, 32, 2],
]

function Figure({ member, x, y, size, dim = false }: Figure & { dim?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: dim ? 0.82 : 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      title={member.isMe ? `${member.username} (you)` : member.username}
      style={{
        position: 'absolute',
        left: `${x}%`,
        bottom: y,
        transform: 'translateX(-50%)',
        display: 'grid',
        placeItems: 'center',
        // Front rank over back rank, and you over everyone.
        zIndex: (dim ? 1 : 2) + (member.isMe ? 1 : 0),
      }}
    >
      {/* Contact shadow — without it the figures hover above the grass. */}
      <span
        style={{
          position: 'absolute',
          bottom: -2,
          width: size * 0.6,
          height: size * 0.13,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.4)',
          filter: 'blur(1.5px)',
        }}
      />
      {member.avatarCharacter ? (
        <Character spec={member.avatarCharacter} size={size} title={member.username} fullBody />
      ) : (
        <span
          role="img"
          aria-label={member.username}
          style={{ fontSize: size * 0.72, lineHeight: 1, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.5))' }}
        >
          {member.avatarEmoji}
        </span>
      )}
      {member.isMe && (
        <span
          style={{
            position: 'absolute',
            bottom: -11,
            fontSize: 9.5,
            fontWeight: 800,
            color: 'var(--gold)',
            textShadow: '0 1px 3px rgba(0,0,0,0.8)',
            whiteSpace: 'nowrap',
          }}
        >
          you
        </span>
      )}
    </motion.div>
  )
}
