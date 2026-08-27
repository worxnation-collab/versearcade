import { useEffect, useRef, useState } from 'react'
import { Character } from '@/components/Character'
import { usePlayerCard } from '@/components/PlayerCardModal'
import { useSettings } from '@/store/settings'
import type { AvatarSpec } from '@/types'

// A living crowd — the one engine behind every scene where people inhabit a
// place: the keep's hall, the churchyard, and whatever comes next. Grown out
// of the keep's phase-one figures and extracted the moment a second scene
// wanted them, so the two can't drift apart (the QuizRunner rule).
//
// No walk-cycle art exists yet, so nobody "walks": figures GLIDE between the
// scene's waypoints with a bob and a facing flip. Each runs a deterministic
// schedule seeded from its username: a short first dwell so the scene proves
// it's alive in the viewer's first few seconds (shipping 6-14s first dwells
// read as "it does not move at all", verbatim), then 4-9s a spot. Standing
// figures breathe — perfectly still reads as a sticker.
//
// The crowd rules hold everywhere this renders: nobody carries a score,
// position means nothing, you stand among your own people, and tapping a
// figure opens their player card (sheets sit at z 100, the card at 110).
//
// reduce-motion: the schedule still runs — the vestibular problem is
// CONTINUOUS motion, not change — but figures REPOSITION instantly instead of
// gliding, and the bob/breathe loops are off. The scene stays inhabited for
// everyone; nobody gets a room of statues, and nobody gets motion they asked
// not to see. (Removing the setting outright was considered and rejected: it
// is an accessibility control, the app ships on the App Store, and it also
// governs confetti and springs app-wide through useJuice.)
// The component unmounts with its scene, which kills every timer.

export interface CrowdMember {
  username: string
  avatarEmoji: string
  avatarCharacter?: AvatarSpec | null
  isMe: boolean
}

export interface CrowdWaypoint {
  /** Percent across the scene. */
  x: number
  /** Percent up from the scene's bottom edge. */
  b: number
}

// FNV-1a → mulberry32, same family as ChurchScene's original jitter.
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

export function CrowdLife({
  members,
  waypoints,
  sizeFor,
  max = 6,
  speedPctPerSec = 5,
  showYouTag = false,
}: {
  members: CrowdMember[]
  /** The scene's standing spots. Figures glide between these and nowhere else. */
  waypoints: CrowdWaypoint[]
  /** Depth cue: figure size (px) from its bottom-percent. */
  sizeFor: (b: number) => number
  /** A living scene reads best a little under-full. You always make the cut. */
  max?: number
  /** Glide speed as percent-of-scene-width per second. Unhurried on purpose. */
  speedPctPerSec?: number
  /** The churchyard names you; the keep lets the tap do it. */
  showYouTag?: boolean
}) {
  const shown = [...members].sort((a, b) => Number(b.isMe) - Number(a.isMe)).slice(0, max)
  if (shown.length === 0) return null
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {shown.map((m, i) => (
        <LifeFigure
          key={m.username}
          member={m}
          slot={i}
          waypoints={waypoints}
          sizeFor={sizeFor}
          speed={speedPctPerSec}
          showYouTag={showYouTag}
        />
      ))}
    </div>
  )
}

function LifeFigure({
  member,
  slot,
  waypoints,
  sizeFor,
  speed,
  showYouTag,
}: {
  member: CrowdMember
  slot: number
  waypoints: CrowdWaypoint[]
  sizeFor: (b: number) => number
  speed: number
  showYouTag: boolean
}) {
  const { open } = usePlayerCard()
  const reduceMotion = useSettings((s) => s.reduceMotion)

  // Each figure walks its own seeded shuffle of the waypoints, offset by slot
  // so two members never share a schedule even with colliding names, plus a
  // small fixed x-jitter so two figures dwelling at the same spot stand beside
  // each other rather than perfectly stacked.
  const plan = useRef<{ order: number[]; next: () => number; jitter: number }>()
  if (!plan.current) {
    const r = rng(seedFrom(member.username) + slot * 7919)
    const order = waypoints.map((_, i) => i)
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    plan.current = { order, next: r, jitter: (r() - 0.5) * 5 }
  }

  const start = waypoints[plan.current.order[0]]
  const [pos, setPos] = useState(start)
  const [walking, setWalking] = useState(false)
  const [facing, setFacing] = useState(1)
  const [durMs, setDurMs] = useState(0)

  useEffect(() => {
    const p = plan.current!
    let leg = 0
    let cur = waypoints[p.order[0]]
    let timer: ReturnType<typeof setTimeout>
    let alive = true

    let firstMove = true
    const dwell = () => {
      if (!alive) return
      setWalking(false)
      // The FIRST move comes fast (0.8-3s): a viewer decides whether the scene
      // is alive in the first few seconds. After that, 4-9s a spot keeps it
      // calm without going dead.
      const wait = firstMove ? 0.8 + p.next() * 2.2 : 4 + p.next() * 5
      firstMove = false
      timer = setTimeout(walk, wait * 1000)
    }
    const walk = () => {
      if (!alive) return
      leg = (leg + 1) % p.order.length
      const to = waypoints[p.order[leg]]
      // Reduced motion: the figure is simply THERE now — a discrete change of
      // state, not a movement across the screen.
      const ms = reduceMotion ? 0 : (Math.hypot(to.x - cur.x, to.b - cur.b) / speed) * 1000
      setFacing(to.x >= cur.x ? 1 : -1)
      setDurMs(ms)
      setWalking(!reduceMotion)
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

  const size = sizeFor(pos.b)

  return (
    <button
      onClick={() => open(member.username)}
      title={member.isMe ? `${member.username} (you)` : member.username}
      aria-label={member.username}
      style={{
        position: 'absolute',
        left: `${pos.x + plan.current.jitter}%`,
        bottom: `${pos.b}%`,
        // Position glides on a linear tween — a spring's slow settle is exactly
        // the two-second wait that bit BookOpening, so none of those here.
        transition: walking ? `left ${durMs}ms linear, bottom ${durMs}ms linear` : 'none',
        transform: 'translateX(-50%)',
        // Lower on the scene = nearer = in front.
        zIndex: Math.round(200 - pos.b) + (member.isMe ? 1 : 0),
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        pointerEvents: 'auto',
      }}
    >
      {/* Contact shadow, so the glide reads as feet on ground, not a hover. */}
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
            animation: reduceMotion
              ? 'none'
              : walking
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
      {showYouTag && member.isMe && (
        <span
          style={{
            position: 'absolute',
            left: '50%',
            bottom: -13,
            transform: 'translateX(-50%)',
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
    </button>
  )
}
