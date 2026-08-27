import { useEffect, useRef, useState } from 'react'
import { Character } from '@/components/Character'
import { usePlayerCard } from '@/components/PlayerCardModal'
import { useSettings } from '@/store/settings'
import type { KeepMember } from '@/store/keep'

// Life in the hall — phase one of the living keep.
//
// No walk-cycle art exists yet, so nobody "walks": figures GLIDE between
// waypoints with a slight bob and a facing flip, the way Habbo and a decade of
// idle games sold the same illusion. Each figure runs a deterministic schedule
// seeded from its username (the ChurchScene hash, extended over time): idle at
// a spot for a while, drift to the next, repeat. Deterministic on purpose — a
// calm room, not a twitchy one, and the same room on every visit.
//
// The rules of the crowd still hold from docs/FORTRESS.md: nobody carries a
// score, nobody's position means anything, you stand among your own people.
// Tapping a figure opens their player card (the sheet sits at z 100 and the
// card at 110 — that layering exists for exactly this).
//
// reduce-motion: figures are placed at their first waypoint and stay put.
// The whole component unmounts with the sheet, which kills every timer.

/** Standing spots on the painted hall's open floor (560x300 viewBox coords).
 *  All are in FRONT of the painting — the room is one flat image, so nothing
 *  can pass behind the table; the spots are chosen so nobody has to. */
const WAYPOINTS: { x: number; y: number }[] = [
  { x: 135, y: 262 }, // warming at the hearth
  { x: 95, y: 246 },  // back left, by the chimney
  { x: 225, y: 268 }, // the near end of the table
  { x: 330, y: 274 }, // the far end of the table
  { x: 270, y: 292 }, // mid-floor, front
  { x: 205, y: 242 }, // along the back wall
  { x: 455, y: 258 }, // looking in at the stable
]

/** Depth cue: further up the floor = smaller. y 238..295 -> size 26..44. */
const sizeFor = (y: number) => Math.round(26 + ((y - 238) / 57) * 18)

// FNV-1a → mulberry32, same family as ChurchScene / lib/season.
function seedFrom(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function rng(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Glide speed in viewBox units per second. Unhurried on purpose. */
const SPEED = 26

export function KeepLife({ members }: { members: KeepMember[] }) {
  // A living room reads best a little under-full; six is a crowd, eleven is a
  // queue. You always make the cut.
  const shown = [...members].sort((a, b) => Number(b.isMe) - Number(a.isMe)).slice(0, 6)
  if (shown.length === 0) return null
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {shown.map((m, i) => (
        <LifeFigure key={m.username} member={m} slot={i} />
      ))}
    </div>
  )
}

function LifeFigure({ member, slot }: { member: KeepMember; slot: number }) {
  const { open } = usePlayerCard()
  const reduceMotion = useSettings((s) => s.reduceMotion)

  // Each figure walks its own seeded shuffle of the waypoints, offset by slot
  // so two members never share a schedule even with colliding names.
  const plan = useRef<{ order: number[]; next: () => number }>()
  if (!plan.current) {
    const r = rng(seedFrom(member.username) + slot * 7919)
    const order = WAYPOINTS.map((_, i) => i)
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    plan.current = { order, next: r }
  }

  const start = WAYPOINTS[plan.current.order[0]]
  const [pos, setPos] = useState(start)
  const [walking, setWalking] = useState(false)
  const [facing, setFacing] = useState(1)
  const [durMs, setDurMs] = useState(0)

  useEffect(() => {
    if (reduceMotion) return
    const p = plan.current!
    let leg = 0
    let cur = WAYPOINTS[p.order[0]]
    let timer: ReturnType<typeof setTimeout>
    let alive = true

    let firstMove = true
    const dwell = () => {
      if (!alive) return
      setWalking(false)
      // The FIRST move comes fast (0.8-3s): a viewer decides whether the room
      // is alive in the first few seconds, and a figure that stands still for
      // eight of them reads as a statue — which is exactly how it shipped
      // first. After that, 4-9s a spot keeps it calm without going dead.
      const wait = firstMove ? 0.8 + p.next() * 2.2 : 4 + p.next() * 5
      firstMove = false
      timer = setTimeout(walk, wait * 1000)
    }
    const walk = () => {
      if (!alive) return
      leg = (leg + 1) % p.order.length
      const to = WAYPOINTS[p.order[leg]]
      const ms = (Math.hypot(to.x - cur.x, to.y - cur.y) / SPEED) * 1000
      setFacing(to.x >= cur.x ? 1 : -1)
      setDurMs(ms)
      setWalking(true)
      setPos(to)
      cur = to
      timer = setTimeout(dwell, ms)
    }
    dwell()
    return () => {
      alive = false
      clearTimeout(timer)
    }
    // The schedule is seeded and self-contained; it never re-derives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion])

  const size = sizeFor(pos.y)

  return (
    <button
      onClick={() => open(member.username)}
      title={member.isMe ? `${member.username} (you)` : member.username}
      aria-label={member.username}
      style={{
        position: 'absolute',
        left: `${(pos.x / 560) * 100}%`,
        bottom: `${((300 - pos.y) / 300) * 100}%`,
        // Position glides on a linear tween — a spring's slow settle is exactly
        // the two-second wait that bit BookOpening, so none of those here.
        transition: walking
          ? `left ${durMs}ms linear, bottom ${durMs}ms linear`
          : 'none',
        transform: 'translateX(-50%)',
        zIndex: Math.round(pos.y),
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        pointerEvents: 'auto',
      }}
    >
      {/* Contact shadow, so the glide reads as feet on stone, not a hover. */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: '50%',
          bottom: -2,
          transform: 'translateX(-50%)',
          width: size * 0.6,
          height: size * 0.13,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.4)',
          filter: 'blur(1.5px)',
        }}
      />
      {/* Two nested spans because both need `transform`: the outer owns the
          facing flip, the inner owns the bob/breathe animation — on one
          element the animation's transform would silently replace the flip. */}
      <span style={{ display: 'block', transform: `scaleX(${facing})` }}>
        <span
          style={{
            display: 'block',
            // Walking bobs; standing breathes. Either way the figure is never
            // perfectly still, because perfectly still reads as a sticker.
            animation: walking
              ? 'va-keep-bob 0.44s ease-in-out infinite alternate'
              : 'va-keep-breathe 2.6s ease-in-out infinite alternate',
            transformOrigin: 'bottom center',
          }}
        >
        {member.avatarCharacter ? (
          <Character spec={member.avatarCharacter} size={size} title={member.username} fullBody />
        ) : (
          <span
            style={{
              fontSize: size * 0.72,
              lineHeight: 1,
              display: 'block',
              filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.5))',
            }}
          >
            {member.avatarEmoji}
          </span>
        )}
        </span>
      </span>
    </button>
  )
}
