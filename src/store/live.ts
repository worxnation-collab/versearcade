import { create } from 'zustand'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth'
import { seedForRoom, type LiveResult } from '@/features/arena/live'
import { todayLocalDate } from '@/lib/date'
import type { AvatarSpec } from '@/types'

// LIVE Bible Battle: two people in the same room, on the same verse, at the same
// moment. Every other battle in this app is asynchronous — you play, they play
// later, a winner is declared — which is the right shape for friends in
// different timezones and the wrong shape for two people on a livestream.
//
// ONLINE ONLY, and this one inherits that rather than choosing it, exactly the
// way store/washing.ts and store/churchYard.ts do. The whole gesture is a second
// real person answering the same question at the same second; a LOCAL path would
// be a person racing themselves, which is what /battle/cpu already is and does
// better. There is no half-built guest path here to finish — there is nothing
// for one to do.
//
// The transport is a Supabase Realtime BROADCAST channel and deliberately not a
// table: nothing here outlives the match. Live scores are chatter, so writing
// them would mean a row per keystroke and a cleanup job, and a dropped message
// costs one stale number for 400ms rather than a lost record. What DOES outlive
// the match — who won — is written at the end through the existing
// create_battle/submit_battle RPCs, so a live match lands in battle history and
// on the battle board like any other. See recordResult() for that.

type Role = 'host' | 'guest'

/** Where the room is in its lifecycle. Both devices agree by construction. */
export type LiveStage =
  /** Not in a room. */
  | 'idle'
  /** Subscribing to the channel. */
  | 'joining'
  /** In the room; waiting for the second player to arrive. */
  | 'lobby'
  /** Both here, reading the verse, waiting on the ready-check. */
  | 'reading'
  /** Both tapped ready — the quiz is running. */
  | 'playing'
  /** I've finished; waiting for them (or both done). */
  | 'finished'

export interface LivePlayer {
  username: string
  avatarEmoji: string
  avatarCharacter?: AvatarSpec | null
  role: Role
}

/** What the opponent is doing right now, for the versus bar. */
export interface LiveProgress {
  score: number
  qi: number
  /** They've locked an answer for `qi` and are reading the teach line. */
  locked: boolean
  /** They've finished the whole run. */
  done: boolean
}

const emptyProgress: LiveProgress = { score: 0, qi: 0, locked: false, done: false }

interface Msg {
  role: Role
  username: string
  avatarEmoji: string
  avatarCharacter?: AvatarSpec | null
}
type Wire =
  | (Msg & { t: 'hello'; want: boolean; round: number })
  | (Msg & { t: 'ready'; round: number })
  | (Msg & { t: 'progress'; round: number; p: LiveProgress })
  | (Msg & { t: 'finished'; round: number; result: LiveResult })
  | (Msg & { t: 'rematch'; round: number })
  | (Msg & { t: 'bye' })

// `Omit` over a union collapses it to the shared keys, so the send() helper has
// to distribute across the arms itself or every payload field looks unknown.
type WireBody<T> = T extends unknown ? Omit<T, keyof Msg> : never

interface LiveState {
  stage: LiveStage
  code: string | null
  role: Role | null
  /** Bumped by a rematch; with the code it decides the verse (see live.ts). */
  round: number
  opponent: LivePlayer | null
  /** They were here and left mid-match — the one failure a stream will notice. */
  opponentGone: boolean
  iAmReady: boolean
  opponentReady: boolean
  /** I've asked for another round and am waiting for them to agree. */
  iWantRematch: boolean
  /** They've asked. Nothing moves until I say yes too. */
  opponentWantsRematch: boolean
  progress: LiveProgress
  myResult: LiveResult | null
  opponentResult: LiveResult | null
  /** The recorded battle row, once one exists. Best-effort; null is not an error. */
  battleId: string | null
  error: string | null

  seed: () => number
  open: (code: string, role: Role) => Promise<void>
  setReady: () => void
  sendProgress: (p: LiveProgress) => void
  finish: (result: LiveResult) => void
  rematch: () => void
  leave: () => void
}

// The channel lives outside the store: it is a subscription, not state, and
// putting a RealtimeChannel in a zustand value invites a render to touch it.
let channel: RealtimeChannel | null = null
let recording = false

function me() {
  const p = useAuth.getState().profile
  return {
    username: p?.username ?? 'player',
    avatarEmoji: p?.avatarEmoji ?? '😇',
    avatarCharacter: p?.avatarCharacter ?? null,
  }
}

export const useLive = create<LiveState>((set, get) => {
  const send = (payload: WireBody<Wire>) => {
    const role = get().role
    if (!channel || !role) return
    void channel.send({ type: 'broadcast', event: 'live', payload: { ...me(), role, ...payload } })
  }

  /**
   * Write the finished match into battle history, once, from ONE device.
   *
   * The host is the challenger and creates the row with the guest named as the
   * invited player; the guest submits against it. That ordering is forced by the
   * schema (create_battle takes the challenger's score, so the row cannot exist
   * before somebody has played) and it is why the host waits for both results.
   * The guest polls for the row instead of being told about it: a "recorded"
   * broadcast would be one more message to lose at the exact moment both phones
   * are navigating to a result screen.
   *
   * Best-effort on purpose. The result on screen is computed locally by
   * liveWinner() and is already correct — recording is what makes the match
   * count on the battle board, and a failure there must not eat the result the
   * two players just watched happen.
   */
  const recordResult = async () => {
    const s = get()
    if (recording || s.battleId || !supabase) return
    const { myResult, opponentResult, opponent, role, code, round } = s
    if (!myResult || !opponentResult || !opponent || !role || !code) return
    recording = true
    try {
      const seed = seedForRoom(code, round)
      if (role === 'host') {
        const { data } = await supabase.rpc('create_battle', {
          p_seed: seed,
          p_score: myResult.score,
          p_time_ms: myResult.timeMs,
          p_invited: opponent.username,
          p_broadcast: false,
          // The one place a battle is marked LIVE. The guest never sends it —
          // submit_battle reads it back off the row the host wrote — so the two
          // devices cannot disagree about what kind of match this was, and a
          // client cannot claim an async battle was a live one to farm the
          // Jonathan/Deborah counters (0086).
          p_live: true,
          p_local_date: todayLocalDate(),
        })
        if (data) set({ battleId: data as string })
        await useAuth.getState().refreshProfile()
      } else {
        // The host's row may not exist yet. Look for the challenge that names
        // me on this seed, for a few seconds, then give up quietly.
        for (let i = 0; i < 10; i++) {
          const { data } = await supabase.rpc('list_my_battles')
          const rows = (data as { id: string; seed: number; status: string; is_invited: boolean }[]) ?? []
          const row = rows.find((b) => Number(b.seed) === seed && b.is_invited && b.status === 'pending')
          if (row) {
            await supabase.rpc('submit_battle', {
              p_id: row.id,
              p_score: myResult.score,
              p_time_ms: myResult.timeMs,
              p_local_date: todayLocalDate(),
            })
            set({ battleId: row.id })
            // The server may have paid for this run (award_battle_xp, 0086).
            // Pull the profile rather than guessing an amount, so the XP bar and
            // the live-battle skin counter are right the moment the result
            // screen draws.
            await useAuth.getState().refreshProfile()
            break
          }
          await new Promise((r) => setTimeout(r, 800))
        }
      }
    } catch {
      /* the match still happened, and the screen already says who won */
    } finally {
      recording = false
    }
  }

  const onWire = (w: Wire) => {
    const s = get()
    if (!s.role || w.role === s.role) return // my own echo, or a spectator
    // Only these three describe a position INSIDE a round, so only these are
    // stale when the round has moved on — a late progress update arriving after
    // a rematch would otherwise rewind the versus bar.
    //
    // 'rematch' and 'hello' are exempt because they are the two messages whose
    // whole job is to carry a round the receiver does NOT have yet. Filtering
    // 'rematch' here shipped, and it dropped every rematch on the floor: the
    // player who tapped it went back to the ready check alone and the other one
    // sat on the old result screen. Invisible in the diff, obvious in two
    // browsers, and it would have happened on the first rematch of the stream.
    const roundScoped = w.t === 'ready' || w.t === 'progress' || w.t === 'finished'
    if (roundScoped && w.round !== s.round) return

    const who: LivePlayer = {
      username: w.username,
      avatarEmoji: w.avatarEmoji,
      avatarCharacter: w.avatarCharacter,
      role: w.role,
    }

    switch (w.t) {
      case 'hello': {
        set({ opponent: who, opponentGone: false, stage: s.stage === 'lobby' || s.stage === 'joining' ? 'reading' : s.stage })
        // Reply so they learn about me too — once, or two clients ping forever.
        if (w.want) send({ t: 'hello', want: false, round: get().round })
        // A guest arriving mid-round adopts the host's round, so both devices
        // derive the same verse without a seed ever crossing the wire.
        if (w.role === 'host' && w.round !== get().round) set({ round: w.round })
        break
      }
      case 'ready':
        set({ opponent: who, opponentReady: true })
        if (get().iAmReady) set({ stage: 'playing' })
        break
      case 'progress':
        set({ opponent: who, progress: w.p })
        break
      case 'finished':
        set({ opponent: who, opponentResult: w.result, progress: { ...get().progress, done: true } })
        void recordResult()
        break
      case 'rematch':
        // An OFFER, not a command. This used to reset the receiver outright,
        // which meant one player tapping Rematch swept the other off their
        // result screen and into a new round they had not agreed to — and if
        // they were still playing, out of the run they were in the middle of.
        // Now it waits, exactly like the ready-check two cases up.
        set({ opponent: who, opponentWantsRematch: true })
        if (get().iWantRematch) startRound(w.round)
        break
      case 'bye':
        // Their offer leaves with them, or the result screen would sit there
        // waiting on somebody who has gone.
        set({ opponentGone: true, opponentReady: false, opponentWantsRematch: false })
        break
    }
  }

  /**
   * Begin an agreed round. Both sides land here — the one who offered second
   * and the one whose offer was accepted — so there is no way for the two
   * devices to reset to different things.
   */
  const startRound = (round: number) => {
    set({
      round,
      stage: 'reading',
      iAmReady: false,
      opponentReady: false,
      iWantRematch: false,
      opponentWantsRematch: false,
      progress: emptyProgress,
      myResult: null,
      opponentResult: null,
      battleId: null,
    })
  }

  return {
    stage: 'idle',
    code: null,
    role: null,
    round: 1,
    opponent: null,
    opponentGone: false,
    iAmReady: false,
    opponentReady: false,
    iWantRematch: false,
    opponentWantsRematch: false,
    progress: emptyProgress,
    myResult: null,
    opponentResult: null,
    battleId: null,
    error: null,

    seed: () => {
      const { code, round } = get()
      return code ? seedForRoom(code, round) : 0
    },

    async open(code, role) {
      if (!supabase) {
        set({ error: 'Live battles need an account and a connection.' })
        return
      }
      get().leave()
      set({
        stage: 'joining',
        code,
        role,
        round: 1,
        opponent: null,
        opponentGone: false,
        iAmReady: false,
        opponentReady: false,
        iWantRematch: false,
        opponentWantsRematch: false,
        progress: emptyProgress,
        myResult: null,
        opponentResult: null,
        battleId: null,
        error: null,
      })

      const ch = supabase.channel(`live-battle:${code}`, {
        config: { broadcast: { self: false }, presence: { key: `${role}:${me().username}` } },
      })
      channel = ch

      ch.on('broadcast', { event: 'live' }, ({ payload }) => onWire(payload as Wire))
      // Presence is how a DROP is noticed. A closed tab sends no 'bye', and on a
      // livestream a phone that quietly vanishes with no explanation on screen is
      // the worst version of this feature failing.
      //
      // Read the WHOLE roster on 'sync' rather than reacting to join/leave
      // events. Two reasons, both found by driving it: a leave payload carries
      // the tracked fields and a presence_ref but no channel key, so matching on
      // a key marked every leave as the opponent's; and a client re-tracking
      // emits leave/join in an order you do not control, so a pair of events can
      // land as a permanent "they dropped". `sync` fires on every change with
      // the authoritative roster, which cannot go stale that way — the first
      // version of this said "They dropped" from the opening question of a match
      // in which nobody had gone anywhere.
      ch.on('presence', { event: 'sync' }, () => {
        const roster = Object.values(ch.presenceState<{ role: Role }>()).flat()
        const others = roster.filter((p) => p.role !== get().role)
        // Only a player we have actually MET can be gone; an empty room before
        // anyone arrives is the lobby, not a drop.
        set({ opponentGone: get().opponent !== null && others.length === 0 })
      })

      await ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          set({ stage: get().opponent ? 'reading' : 'lobby' })
          await ch.track({ role, username: me().username })
          send({ t: 'hello', want: true, round: get().round })
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          set({ error: 'Lost the connection to the room.' })
        }
      })
    },

    setReady() {
      if (get().iAmReady) return
      set({ iAmReady: true })
      send({ t: 'ready', round: get().round })
      if (get().opponentReady) set({ stage: 'playing' })
    },

    // Only the OPPONENT's progress is stored: mine is QuizRunner's own state,
    // and a second copy of it here is a second thing to keep in step.
    sendProgress(p) {
      send({ t: 'progress', round: get().round, p })
    },

    finish(result) {
      set({ myResult: result, stage: 'finished' })
      send({ t: 'finished', round: get().round, result })
      void recordResult()
    },

    /**
     * Ask for another round. Nothing moves until BOTH have asked.
     *
     * Same shape as `setReady` above, and for the same reason: a live match is
     * two people agreeing to start together. One of them deciding for the other
     * is the bug this replaced — the second player got no say and no warning,
     * they were simply somewhere else.
     *
     * The round number is `current + 1` on both sides, so whichever way round
     * the two taps land, the two devices derive the same verse.
     */
    rematch() {
      if (get().iWantRematch) return
      const round = get().round + 1
      set({ iWantRematch: true })
      send({ t: 'rematch', round })
      if (get().opponentWantsRematch) startRound(round)
    },

    leave() {
      if (channel) {
        send({ t: 'bye' })
        void supabase?.removeChannel(channel)
        channel = null
      }
      recording = false
      set({ stage: 'idle', code: null, role: null, opponent: null, opponentGone: false, iAmReady: false, opponentReady: false, iWantRematch: false, opponentWantsRematch: false, progress: emptyProgress, myResult: null, opponentResult: null, battleId: null })
    },
  }
})
