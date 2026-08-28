import { useEffect, useRef, useState } from 'react'
import { Character } from '@/components/Character'
import { Pet } from '@/components/Pet'
import { usePlayerCard } from '@/components/PlayerCardModal'
import { petById } from '@/data/pets'
import { useAuth } from '@/store/auth'
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
// ONE scene overrides that, and only for your own figure: the Upper Room passes
// `onTapSelf`, because tapping yourself in the room that is yours should offer
// to pray rather than show you your own stats. Somebody else's figure always
// opens their card, in every scene including that one — the override is
// narrow on purpose, so "tap a person, see the person" stays true.
//
// EVERYBODY'S pet walks with them. `CrowdMember.pet` carries it, filled by the
// three RPCs that feed a scene (keep_json, get_church_page, room_json — 0072).
//
// This used to be your pet and only yours, with no field on CrowdMember at all,
// so the rule was enforced by the shape of the component. The rule is now
// narrower rather than gone, and the line is worth keeping straight: a pet is a
// PICTURE, not a number, and a SCENE has no order and no score in it — so a
// companion standing in a churchyard is the same kind of thing as the robe
// standing there. A LEADERBOARD is the opposite: an ordered list, where a
// companion in a ranked row starts reading as part of the rank. Those RPCs are
// deliberately still untouched. See the Pets section of CLAUDE.md.
//
// YOUR OWN figure still reads from the auth store rather than from the member
// row, and that is not redundancy: equipping a pet has to change the scene you
// are looking at immediately, before any RPC is re-fetched. The member row is
// the fallback for you and the only source for everyone else.
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
  /** Equipped pet id (data/pets.ts). Absent = no companion, which is also what
   *  an id this build doesn't know renders as — petById() drops it. */
  pet?: string | null
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

/**
 * A companion is drawn at `PetDef.scale` against the figure — the SAME ratio as
 * ProfileHero, so your camel is your camel wherever you meet it, and the "kept
 * well under 1 on purpose" note in data/pets holds here too (a camel at real
 * scale is a mount with a person beside it, not a companion).
 *
 * The one concession to size: a scene figure is 24-46px, so a strictly
 * proportional dove at the far end of the road lands at six pixels and reads
 * as a speck of dirt on the painting. Nothing is drawn under this floor. It
 * only ever bites for the two smallest pets at the two smallest depths, which
 * is the trade — a dove and a lamb the same size for one waypoint, rather than
 * a dove nobody can see at all.
 */
const PET_MIN_PX = 9

/**
 * What the crowd says to each other. EMOJI ONLY, from this fixed list, and
 * that is the entire feature — there is no text field, no per-player message
 * and nothing anybody can author, so the one surface in this app where players
 * appear to talk cannot carry an insult, a link, or a moderation queue.
 *
 * Chosen to be warm and uncomparative, like everything else in these scenes: a
 * wave, a heart, a hallelujah. Nothing here can read as a score, a taunt or a
 * verdict on somebody else's play (no 💪, no 🥇, no 👎), which is the same rule
 * that keeps figures from carrying points.
 */
const CHATTER = ['❤️', '📖', '✝️', '🙏', '🕊️', '✨', '😊', '👋', '🎵', '🌾']

/** How long one bubble is on screen — must match the va-bubble keyframe. */
const BUBBLE_MS = 2400

export function CrowdLife({
  members,
  waypoints,
  sizeFor,
  max = 6,
  speedPctPerSec = 5,
  showYouTag = false,
  onTapSelf,
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
  /** Tapping YOUR OWN figure calls this instead of opening your player card.
   *  Only the Upper Room passes it — see the header note. */
  onTapSelf?: () => void
}) {
  const shown = [...members].sort((a, b) => Number(b.isMe) - Number(a.isMe)).slice(0, max)
  if (shown.length === 0) return null
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        // A STACKING CONTEXT, and it is load-bearing. Figures carry a z-index of
        // roughly 180-199 to sort themselves by depth (below), and this
        // container used to be `position: absolute` at `z-index: auto`, which
        // creates no context at all — so those numbers escaped into whatever
        // ancestor context the scene happened to sit in. For a scene rendered
        // INLINE on a page (the Battle tab's hall, the churchyard, the road,
        // the Upper Room) that is the page root, where the app's sheets live at
        // 100 and the player card at 110 — so a camel painted over the card you
        // had just opened by tapping it. `isolation: isolate` makes the depth
        // sorting local without changing layout or the layer's order against
        // the SVG beside it, which is decided by DOM order.
        isolation: 'isolate',
      }}
    >
      {shown.map((m, i) => (
        <LifeFigure
          key={m.username}
          member={m}
          slot={i}
          waypoints={waypoints}
          sizeFor={sizeFor}
          speed={speedPctPerSec}
          showYouTag={showYouTag}
          onTapSelf={onTapSelf}
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
  onTapSelf,
}: {
  member: CrowdMember
  slot: number
  waypoints: CrowdWaypoint[]
  sizeFor: (b: number) => number
  speed: number
  showYouTag: boolean
  onTapSelf?: () => void
}) {
  const { open } = usePlayerCard()
  const reduceMotion = useSettings((s) => s.reduceMotion)
  // Your own comes from the auth store so equipping one changes the scene you
  // are looking at without waiting for a re-fetch; everybody else's rides on
  // the member row. See the header note for why this is allowed in a scene and
  // still isn't on a board.
  const myPet = useAuth((s) => s.profile?.pet)
  const companion = petById(member.isMe ? (myPet ?? member.pet) : member.pet)

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
  const [bubble, setBubble] = useState<string | null>(null)

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

  // Chatter runs on its OWN rng, seeded from the same name with a different
  // salt. Drawing from the walk plan's generator would have shifted every
  // dwell and every waypoint the moment this was added, which is the sort of
  // change that silently re-times a scene nobody thought they had touched.
  //
  // 12-30s apart per figure and 2.4s on screen, so a full yard says something
  // every few seconds and no single person is chatty. The first one comes
  // sooner, for the same reason the first move does: a viewer decides in the
  // first few seconds whether anything here is alive.
  useEffect(() => {
    const r = rng(seedFrom(member.username) + 104729 + slot * 31)
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    const wait = () => { timer = setTimeout(say, (12 + r() * 18) * 1000) }
    const say = () => {
      if (!alive) return
      setBubble(CHATTER[Math.floor(r() * CHATTER.length)])
      timer = setTimeout(() => {
        if (!alive) return
        setBubble(null)
        wait()
      }, BUBBLE_MS)
    }
    timer = setTimeout(say, (2 + r() * 9) * 1000)
    return () => {
      alive = false
      clearTimeout(timer)
    }
    // Seeded and self-contained, exactly like the walk schedule above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const size = sizeFor(pos.b)
  // Which side the companion stands on: towards the middle of the scene, so it
  // can never be the half of the pair that falls outside the frame.
  const petOnRight = pos.x < 50

  return (
    <button
      onClick={() => (member.isMe && onTapSelf ? onTapSelf() : open(member.username))}
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
        // Lower on the scene = nearer = in front. These are SCENE-LOCAL: the
        // container above isolates them, so they never compete with the app's
        // sheet (100) and player-card (110) tiers.
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
      {/* Your companion, standing with you.
          It sits OUTSIDE the facing flip and picks its side from where you are
          in the frame — inward, always. Tying it to the facing flip was the
          obvious version and it walks the pet out of the painting: the outer
          waypoints sit at x 12-24%, so a figure facing outward there hangs its
          camel over the edge, and every scene clips (overflow: hidden). Inward
          also composes better — the pet is between you and the middle of the
          picture rather than pressed against its border.
          Mirrored when it lands on your right so it's always turned towards
          you: a companion looking at you reads as company, one looking away
          reads as an animal that happens to be nearby. */}
      {companion && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            // Just past the figure's shoulder. Character draws into a 120x170
            // viewBox with the figure only about 70 units wide, so a fifth of
            // that box is empty on each side — 88% lands the pet beside a
            // person rather than a hand's width away from one.
            ...(petOnRight ? { left: '88%' } : { right: '88%' }),
            // Character's ground shadow sits at y=162 of 170, ~4.5% up from the
            // bottom of its box. Matching it stands the two on one floor.
            bottom: size * 0.045,
            lineHeight: 0,
            transform: petOnRight ? 'scaleX(-1)' : 'none',
            transformOrigin: 'bottom center',
          }}
        >
          <span
            style={{
              display: 'block',
              // Bobs and breathes like everyone else in the scene, half a beat
              // behind you so the pair aren't in lockstep.
              animation: reduceMotion
                ? 'none'
                : walking
                  ? 'va-keep-bob 0.44s ease-in-out -0.22s infinite alternate'
                  : 'va-keep-breathe 2.6s ease-in-out -1.3s infinite alternate',
              transformOrigin: 'bottom center',
            }}
          >
            <Pet id={companion.id} size={Math.max(size * companion.scale, PET_MIN_PX)} />
          </span>
        </span>
      )}
      {/* What they're saying. Above the head and OUTSIDE the facing flip: a
          bubble inside it would mirror, and a back-to-front ✝️ is the one thing
          in this scene that would read as a bug rather than as a place.
          Anchored to the top of the figure's own box, so it clears every head
          from the 24px figures at the back of the road to the 46px ones at the
          front without knowing which is which.
          reduce-motion keeps the bubble and drops the pop — appearing and
          disappearing is a discrete change of state, which is the same line
          the glide draws. */}
      {bubble && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: '50%',
            bottom: '100%',
            marginBottom: 2,
            padding: `${Math.max(2, size * 0.05)}px ${Math.max(4, size * 0.1)}px`,
            borderRadius: 999,
            background: 'rgba(10,5,26,0.82)',
            border: '1px solid rgba(255,255,255,0.18)',
            fontSize: Math.max(11, size * 0.4),
            lineHeight: 1,
            whiteSpace: 'nowrap',
            transform: 'translateX(-50%)',
            animation: reduceMotion ? 'none' : `va-bubble ${BUBBLE_MS}ms ease-out both`,
          }}
        >
          {bubble}
          {/* The tail. A bordered triangle would show its own outline through
              the bubble, so this is a plain filled one in the bubble's colour,
              tucked a pixel under the rim. */}
          <span
            style={{
              position: 'absolute',
              left: '50%',
              top: '100%',
              marginTop: -1,
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '3px solid transparent',
              borderRight: '3px solid transparent',
              borderTop: '4px solid rgba(10,5,26,0.82)',
            }}
          />
        </span>
      )}
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
