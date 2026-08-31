import { create } from 'zustand'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth'
import { newRoomCode } from '@/features/arena/live'

// QUICK MATCH: the queue that sits in FRONT of the room code.
//
// docs/LIVE-BATTLE.md said matchmaking with strangers is "a queue table, a
// pairing function, timeouts and abandonment handling" and that two people who
// already know they are about to play each other need none of it. That is still
// true — and it is an argument about people who already know each other, which
// is exactly the case a room code covers and the case somebody tapping "find me
// anyone" does not. So this goes in front of that screen and nothing in
// store/live.ts changes: a quick match ENDS by handing two devices the same room
// code, and from that second on it IS a room-code match.
//
// The queue keeps the property that made the room worth building: NO TABLE and
// NO MIGRATION. Everybody looking for a game stands in one Realtime presence
// roster (`live-battle:queue`), the pairing is derived from that roster on every
// device rather than assigned by a server, and a three-message handshake settles
// who actually got whom. Nothing outlives the search — a closed tab is a
// vanished presence, which is the whole of the abandonment handling.
//
// ONLINE ONLY, inherited from store/live.ts rather than chosen: a queue of one
// person is a person waiting for themselves.

type Role = 'host' | 'guest'

export type QueueStatus =
  /** Not looking. */
  | 'idle'
  /** Subscribing to the lobby. */
  | 'joining'
  /** In the roster, pairing on every sync. */
  | 'searching'
  /** Paired and confirmed — the screen navigates into the room. */
  | 'matched'

interface Entry {
  ticket: string
  username: string
  /** When they started looking. The queue is FIFO on this. */
  at: number
}

type Wire =
  /** I am the head of the queue and I am proposing this room to you. */
  | { t: 'offer'; from: string; to: string; code: string }
  /** I took your offer — but I am not in that room until you confirm it. */
  | { t: 'accept'; from: string; to: string; code: string }
  /** You are the one I paired with. Go. */
  | { t: 'confirm'; from: string; to: string; code: string }

interface QueueState {
  status: QueueStatus
  /** How many OTHER people are looking right now. Drawn, never ranked. */
  waiting: number
  /** Seconds spent looking, for the copy that changes when nobody is about. */
  elapsed: number
  /** The room the search produced, and which side of it I am. */
  match: { code: string; role: Role } | null
  error: string | null

  search: () => Promise<void>
  cancel: () => void
}

// The channel, the ticket and the in-flight handshake live outside the store for
// the reason store/live.ts keeps its channel outside one: they are a
// subscription and a protocol, not state, and a render must never touch them.
let channel: RealtimeChannel | null = null
let ticket = ''
let joinedAt = 0
let timer: ReturnType<typeof setInterval> | null = null
/** My outstanding offer (I am the proposer), or my outstanding accept (I am not). */
let pending: { role: Role; other: string; code: string; at: number } | null = null
/** Tickets that went quiet on me, so a dead partner can't hold up the queue. */
const skip = new Map<string, number>()

/** How long an unanswered offer or accept is allowed to sit before I re-pair. */
const HANDSHAKE_MS = 4000
/** After this long with no offer, anybody may propose — see evaluate(). */
const PROMOTE_MS = 8000

function myUsername() {
  return useAuth.getState().profile?.username ?? 'player'
}

export const useLiveQueue = create<QueueState>((set, get) => {
  const send = (w: Wire) => {
    if (!channel) return
    void channel.send({ type: 'broadcast', event: 'queue', payload: w })
  }

  /** Pair up, confirmed, and stop looking. The screen navigates on `match`. */
  const settle = (code: string, role: Role) => {
    pending = null
    set({ status: 'matched', match: { code, role } })
    // Leave the roster immediately: two people already in a room must not be
    // offered to a third, and the queue is only ever a picture of who is free.
    if (channel) void channel.untrack()
  }

  /**
   * Who pairs with whom, derived on every device from the same roster.
   *
   * The rule is deliberately the smallest one that can't disagree with itself:
   * the person who has been waiting LONGEST proposes, everybody else waits. One
   * pair forms at a time and both leave, so the queue drains in join order and
   * nobody can be skipped by arriving late — the same fairness the church
   * rivalry's draw is after, reached by sorting rather than by hashing because
   * here there IS an order worth honouring.
   *
   * Every disagreement it can still produce (two devices with rosters half a
   * second apart) is caught by the handshake below rather than prevented here.
   */
  const evaluate = () => {
    if (!channel || get().status !== 'searching') return

    const roster = Object.values(channel.presenceState<Entry>()).flat()
    const seen = new Set<string>()
    const list: Entry[] = []
    for (const e of roster) {
      if (!e?.ticket || seen.has(e.ticket)) continue
      seen.add(e.ticket)
      list.push({ ticket: e.ticket, username: e.username, at: Number(e.at) || 0 })
    }
    list.sort((a, b) => a.at - b.at || (a.ticket < b.ticket ? -1 : 1))

    const others = list.filter((e) => e.ticket !== ticket)
    set({ waiting: others.length })
    if (!list.some((e) => e.ticket === ticket)) return // my own track hasn't landed yet

    if (pending) {
      if (Date.now() - pending.at < HANDSHAKE_MS) return
      // Nobody answered. Remember them for a bit so the next pass reaches past
      // them, rather than re-offering the same silent ticket forever.
      skip.set(pending.other, Date.now() + 10_000)
      pending = null
    }

    const now = Date.now()
    for (const [k, until] of skip) if (until < now) skip.delete(k)

    // My own second tab is a real thing that happens while testing, and a battle
    // against yourself is refused by create_battle anyway — so never pair two
    // presences wearing the same username.
    const mine = myUsername()
    const candidate = others.find((e) => e.username !== mine && !skip.has(e.ticket))
    if (!candidate) return

    // Head of the queue proposes. The promotion clause is the self-heal: if the
    // head is a client that never offers (an older build, a tab the OS froze),
    // the whole queue would otherwise wait on it forever, so after PROMOTE_MS
    // anybody may propose and the tie-break below sorts out the collision.
    const iAmHead = list[0].ticket === ticket
    if (!iAmHead && now - joinedAt < PROMOTE_MS) return

    const code = newRoomCode()
    pending = { role: 'host', other: candidate.ticket, code, at: now }
    send({ t: 'offer', from: ticket, to: candidate.ticket, code })
  }

  const onWire = (w: Wire) => {
    if (!w || w.to !== ticket || w.from === ticket) return
    const status = get().status
    if (status === 'matched') return

    switch (w.t) {
      case 'offer': {
        // Two devices can both believe they are the head for a moment. Rather
        // than let both hold an offer out, the LOWER ticket is the proposer —
        // a rule both sides can apply to the same two strings and reach the same
        // answer, with no round trip to agree on it.
        if (pending && pending.role === 'host' && ticket < w.from) return
        if (pending && pending.role === 'guest') return
        pending = { role: 'guest', other: w.from, code: w.code, at: Date.now() }
        send({ t: 'accept', from: ticket, to: w.from, code: w.code })
        break
      }
      case 'accept': {
        // Only MY outstanding offer can be accepted, and only once: a second
        // accept (from somebody whose offer crossed mine) is dropped, and they
        // fall back into the queue when their own accept times out. This third
        // message is what stops a guest walking into a room the host never
        // entered — the accepter is not matched until it hears back.
        if (!pending || pending.role !== 'host' || pending.other !== w.from || pending.code !== w.code) return
        send({ t: 'confirm', from: ticket, to: w.from, code: w.code })
        settle(w.code, 'host')
        break
      }
      case 'confirm': {
        if (!pending || pending.role !== 'guest' || pending.other !== w.from || pending.code !== w.code) return
        settle(w.code, 'guest')
        break
      }
    }
  }

  return {
    status: 'idle',
    waiting: 0,
    elapsed: 0,
    match: null,
    error: null,

    async search() {
      if (!supabase) {
        set({ error: 'Quick match needs an account and a connection.' })
        return
      }
      get().cancel()

      ticket = crypto.randomUUID()
      joinedAt = Date.now()
      pending = null
      skip.clear()
      set({ status: 'joining', waiting: 0, elapsed: 0, match: null, error: null })

      const ch = supabase.channel('live-battle:queue', {
        config: { broadcast: { self: false }, presence: { key: ticket } },
      })
      channel = ch

      ch.on('broadcast', { event: 'queue' }, ({ payload }) => onWire(payload as Wire))
      // Same rule as the room's presence handler: read the WHOLE roster on
      // sync and never react to a join/leave event. A leave payload carries no
      // channel key, and a client re-tracking emits the two in an order you do
      // not control — here that would mean pairing with somebody who had gone.
      ch.on('presence', { event: 'sync' }, evaluate)

      await ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          set({ status: 'searching' })
          await ch.track({ ticket, username: myUsername(), at: joinedAt })
          evaluate()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          get().cancel()
          set({ error: 'Lost the connection to the lobby.' })
        }
      })

      // One timer, doing three jobs: the elapsed count the copy reads, expiring
      // a handshake nobody answered, and re-pairing when the roster has not
      // changed but my own promotion window has opened.
      timer = setInterval(() => {
        if (get().status !== 'searching') return
        set({ elapsed: Math.floor((Date.now() - joinedAt) / 1000) })
        evaluate()
      }, 1000)
    },

    cancel() {
      if (timer) clearInterval(timer)
      timer = null
      if (channel) {
        void supabase?.removeChannel(channel)
        channel = null
      }
      pending = null
      skip.clear()
      set({ status: 'idle', waiting: 0, elapsed: 0, match: null, error: null })
    },
  }
})
