import { sessionUserId, supabase } from '@/lib/supabase'
import { shared } from '@/lib/inflight'

// The outbox: writes made with no network, kept on this device per account and
// sent when one comes back. Before it, a chapter opened on a plane, a verse
// kept, a prayer said or an arcade run finished offline simply never reached
// the server — the screen showed it, the next launch did not.
//
// Four rules hold it inside the rest of the app:
//
//   * ONLY A NETWORK FAILURE QUEUES. A write the server REFUSED (a cap, a bad
//     argument, a missing migration) is an answer, not a delay, and retrying it
//     forever would be a loop. `isNetworkFailure` is the one test for both.
//   * The server still decides everything. An entry is an RPC name and its
//     arguments, sent exactly as the store would have sent them; nothing here
//     grants, and every cap and clamp applies when it lands. A date-bearing
//     write (record_prayer, record_arcade_play) carries the player's local date
//     from the moment it was made, which the server clamps ±1 as always.
//   * `key` collapses repeats: a verse kept and un-kept offline sends only the
//     last word, and the same chapter opened twice sends once.
//   * Per account. An entry carries the user id it was made by and is only ever
//     sent by that account's session — a phone that changes hands never sends
//     one player's writes as another's.
//
// The daily play has its own queue (store/game.ts) because its recap needs the
// play's numbers back; everything that only needs to LAND comes through here.

const KEY = 'va.outbox'
const MAX = 200

interface Entry {
  uid: string
  fn: string
  args: Record<string, unknown>
  key: string
  at: number
}

/** No response at all — the phone is offline or the server is unreachable. */
export function isNetworkFailure(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  return (!err.code || err.code === 'NETWORK') && /fetch|network|load failed|internet|offline/i.test(err.message ?? '')
}

function read(): Entry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]') as unknown
    return Array.isArray(raw)
      ? (raw as Entry[]).filter((e) => e && typeof e.uid === 'string' && typeof e.fn === 'string' && typeof e.key === 'string')
      : []
  } catch {
    return []
  }
}
function write(list: Entry[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))) } catch { /* storage blocked */ }
}

/** Park a write for the signed-in account. A later one with the same key replaces it. */
export async function enqueue(fn: string, args: Record<string, unknown>, key: string = fn) {
  const uid = await sessionUserId()
  if (!uid) return
  write([...read().filter((e) => !(e.uid === uid && e.key === key)), { uid, fn, args, key, at: Date.now() }])
}

/**
 * Send a write now, or park it if there is no network. `queued` says which —
 * a caller that shows a payout says "saved, it counts once you're back"
 * instead of reporting a failure for something that will land.
 */
export async function rpcOrQueue<T = unknown>(
  fn: string,
  args: Record<string, unknown>,
  key?: string,
): Promise<{ data: T | null; error: { message?: string; code?: string } | null; queued: boolean }> {
  if (!supabase) return { data: null, error: { message: 'no backend' }, queued: false }
  // Something older is waiting: send it first, so the server sees writes in order.
  if (hasPending()) await flushOutbox()
  const { data, error } = await supabase.rpc(fn, args)
  if (error && isNetworkFailure(error)) {
    await enqueue(fn, args, key ?? fn)
    return { data: null, error: null, queued: true }
  }
  return { data: (data as T) ?? null, error, queued: false }
}

function hasPending(): boolean {
  try { return (localStorage.getItem(KEY) ?? '[]') !== '[]' } catch { return false }
}

/** Send everything this account parked, oldest first. Stops at the first network failure. */
export const flushOutbox = shared(async () => {
  if (!supabase || !hasPending()) return
  const uid = await sessionUserId()
  if (!uid) return
  const mine = read().filter((e) => e.uid === uid).sort((a, b) => a.at - b.at)
  let sent = 0
  for (const e of mine) {
    const { error } = await supabase.rpc(e.fn, e.args)
    if (error && isNetworkFailure(error)) break
    // Sent, or refused by the server — either way it is settled.
    write(read().filter((q) => !(q.uid === uid && q.key === e.key && q.at === e.at)))
    if (!error) sent++
  }
  // A prayer or a run that landed moved XP on the server; let the profile catch up.
  if (sent) for (const cb of afterSend) cb()
})

const afterSend: Array<() => void> = []
/** Called once after a flush delivered something (auth uses it to re-read the profile). */
export function onOutboxSent(cb: () => void) {
  afterSend.push(cb)
}

/** How many writes this device is holding for `uid` (for a quiet "saved on this phone" line). */
export function pendingFor(uid: string | null | undefined): number {
  return uid ? read().filter((e) => e.uid === uid).length : 0
}

if (typeof window !== 'undefined') {
  // Twice, in sequence: a flush started while still offline (a screen's load)
  // can be in flight at this moment, and `shared` would hand back THAT doomed
  // attempt. The second call starts after it settles, with the network up.
  window.addEventListener('online', () => { void flushOutbox().then(() => flushOutbox()) })
}
