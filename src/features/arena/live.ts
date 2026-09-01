import { battleVerse, type BattleMode } from './battle'
import type { DailyVerse } from '@/types'

// Live Bible Battle — the pure parts. Room codes, the seed both devices derive
// from the room, and the winner rule. No React, no network: everything here has
// to be identical on both phones and in a spectator's browser, so it is a
// function of the room code and nothing else.

// Deliberately missing B, I, O, S and Z, and 0, 1, 2, 5 and 8 — a code gets read
// out loud on a livestream and typed by somebody watching on a phone, so every
// lookalike pair (B/8, I/1, O/0, S/5, Z/2) is worth more than the entropy it
// costs. 26^4 is still 457k rooms, against the two that will ever be open.
const ALPHABET = 'ACDEFGHJKLMNPQRTUVWXY34679'

export function newRoomCode(): string {
  let out = ''
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length]
  return out
}

/**
 * Normalizes what somebody typed: upper-case, and drop anything that isn't a
 * letter or a digit (spaces, dashes, a pasted URL fragment).
 *
 * Deliberately NOT lookalike-substituting: the alphabet above already has no
 * lookalikes in it, so a character outside it is a genuine mis-type, and
 * guessing which real character it meant (is `0` an `O` or a `Q`?) turns a
 * clear "no such room" into a confident join of the wrong one.
 */
export function normalizeRoomCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
}

/**
 * The verse both players get, derived from the room + round rather than sent.
 *
 * This is the whole reason the live handshake is small: there is no "the host
 * announces the seed" message to lose, race or arrive late, and a spectator can
 * render the same verse without asking anybody. A rematch is `round + 1`, which
 * is also why the round is in the hash — the same room must not replay the same
 * verse all stream.
 */
export function seedForRoom(code: string, round: number): number {
  let h = 2166136261
  const input = `${code}#${round}`
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h | 0) % 0x7fffffff
}

/**
 * The MODE both players get, derived from the room the way the seed is.
 *
 * A live battle has no row until it is over and no announce message by design,
 * so there is nowhere to put a host's choice — and putting one there would be
 * one device deciding for two, which is exactly the bug the rematch handshake
 * was rewritten to close. Deriving it means the ROOM deals the round and neither
 * player imposes anything, which is also the only shape that works for quick
 * match, where two strangers arrive with nobody in charge.
 *
 * Its own hash rather than a bit of the seed: hanging the mode on the seed's
 * parity ties two things that should stay free to change separately, and would
 * make any future tweak to `seedForRoom` silently re-roll every room's mode too.
 *
 * `round` is in the input for the same reason it is in the seed — a rematch is
 * a fresh round of a fresh kind, rather than the same thing all stream.
 */
export function modeForRoom(code: string, round: number): BattleMode {
  let h = 2166136261
  const input = `mode#${code}#${round}`
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  // AVALANCHE BEFORE TAKING A BIT, and this is not decoration — it was found by
  // running the real function over three hundred room codes. FNV-1a's final
  // step is a multiply by an odd constant, so the LOW bit of the result is just
  // the low bit of the input: incrementing the round by one flips it every
  // time. Taking `h % 2` straight off meant every room in the app produced one
  // of exactly two sequences (verse/trivia/verse… or its inverse), so a
  // rematch always flipped the mode and one round told you every future one.
  // Unbiased across rooms, and still wrong. This is murmur3's fmix32, which
  // spreads every input bit across all thirty-two.
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) % 2 === 0 ? 'verse' : 'trivia'
}

export function verseForRoom(code: string, round: number): DailyVerse {
  return battleVerse(seedForRoom(code, round), modeForRoom(code, round))
}

export interface LiveResult {
  score: number
  timeMs: number
  correctCount: number
  totalQuestions: number
}

/**
 * Who won, decided on each device from both results.
 *
 * KEEP IN SYNC WITH `submit_battle` (0020/0021): higher score, then lower total
 * time, else a tie. A live match shows its result the moment both players
 * finish — before, and whether or not, the row is recorded — so this rule exists
 * client-side for the same reason lib/practice.ts mirrors submit_practice. If
 * the SQL tiebreak ever changes, change it here too or a stream will show one
 * winner on screen and the other one in battle history.
 */
export function liveWinner(mine: LiveResult, theirs: LiveResult): 'me' | 'them' | 'tie' {
  if (mine.score !== theirs.score) return mine.score > theirs.score ? 'me' : 'them'
  if (mine.timeMs !== theirs.timeMs) return mine.timeMs < theirs.timeMs ? 'me' : 'them'
  return 'tie'
}
