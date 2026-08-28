import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { localdb } from '@/lib/localdb'
import { todayLocalDate } from '@/lib/date'
import { STUDY_DROP } from '@/lib/drops'
import { drawRelicKey, collectibleByKey } from '@/data/collectibles'
import { petDropLuck } from '@/data/pets'
import { useAuth } from './auth'
import { useSeason } from './season'
import { useCollection } from './collection'
import { useInventory } from './inventory'

// Things found while studying. See lib/drops.ts for what a drop is and why it
// pays nothing; this store is just the roll and the pending reveal.
//
// The reveal lives here rather than in the screen that rolled it because a study
// run navigates the instant it finishes (a CPU result, a practice recap), so a
// banner rendered inside QuizRunner would unmount before anyone saw it. The find
// is parked here and StudyDropToast — mounted once, app-wide — shows it wherever
// the player actually lands.

export interface StudyDrop {
  key: string
  rarity?: string
  /** First time ever finding this one — it just got stamped into their Bible. */
  newStamp: boolean
  /** Copies now held, so a duplicate can say what it's good for. */
  qty?: number
}

/** Guest cap bookkeeping: how many finds on which local day. */
interface LocalDay {
  date: string
  finds: number
}

function localKey(): string {
  const uid = useAuth.getState().profile?.id
  return uid ? `va.drops.${uid}` : 'va.drops.guest'
}

function readLocalDay(): LocalDay {
  try {
    const raw = JSON.parse(localStorage.getItem(localKey()) || 'null') as LocalDay | null
    if (raw && typeof raw.date === 'string' && Number.isFinite(raw.finds)) return raw
  } catch {
    /* fall through */
  }
  return { date: '', finds: 0 }
}

function writeLocalDay(day: LocalDay) {
  try {
    localStorage.setItem(localKey(), JSON.stringify(day))
  } catch {
    /* private mode / storage full — the cap degrades to per-session */
  }
}

function isOnline(): boolean {
  const a = useAuth.getState()
  return !!supabase && a.mode === 'online' && a.isAuthed
}

interface DropsState {
  /** The find waiting to be shown, if any. */
  found: StudyDrop | null
  /** True while a roll is in flight, so a double-fire can't roll twice. */
  rolling: boolean
  /** Roll one finished study run. Safe to fire-and-forget. */
  roll: () => Promise<void>
  dismiss: () => void
}

export const useDrops = create<DropsState>((set, get) => ({
  found: null,
  rolling: false,

  async roll() {
    if (get().rolling) return
    set({ rolling: true })
    try {
      const drop = isOnline() ? await rollOnline() : rollGuest()
      if (drop) {
        set({ found: drop })
        // Prepacked verb. Counts finds, never attempts — the same rule the
        // daily cap uses, so a dry run costs a quest nothing.
        void useSeason.getState().track('relic_found')
      }
    } catch {
      // A drop is a bonus. If the roll fails there is nothing to recover and
      // nothing to tell the player — they just didn't find anything this run.
    } finally {
      set({ rolling: false })
    }
  },

  dismiss() {
    set({ found: null })
  },
}))

async function rollOnline(): Promise<StudyDrop | null> {
  const { data, error } = await supabase!.rpc('roll_study_drop', { p_local_date: todayLocalDate() })
  if (error || !data) return null
  const raw = data as {
    found?: boolean
    key?: string
    rarity?: string
    new_stamp?: boolean
    qty?: number
  }
  if (!raw.found || !raw.key) return null

  const key = raw.key
  const newStamp = !!raw.new_stamp
  // The server already granted both halves; mirror them so the Bible and the
  // bag agree with the reveal without waiting for the next screen to load.
  if (newStamp) {
    useCollection.setState((s) => (s.owned.includes(key) ? s : { owned: [...s.owned, key] }))
  }
  void useInventory.getState().load()

  return { key, rarity: raw.rarity, newStamp, qty: raw.qty }
}

// Guest mirror of roll_study_drop (migration 0055). Keep the two in sync — the
// odds and the cap both come from lib/drops.ts so at least the numbers can't
// drift, but the shape of the grant has to be maintained by hand.
function rollGuest(): StudyDrop | null {
  const today = todayLocalDate()
  // Read the day off DISK, not off this store: a run can finish before anything
  // in the session touched storage (a deep link straight into a drill, a
  // reload), and counting from an empty in-memory value would hand out a fresh
  // three finds every time the tab was reopened. Same trap as
  // store/bookAccuracy.ts:record.
  const day = readLocalDay()
  const finds = day.date === today ? day.finds : 0
  if (finds >= STUDY_DROP.dailyCap) return null
  // A `luck` pet nudges the odds. Only the odds — the cap is untouched, so the
  // pet finds things a little more often and can never find MORE per day.
  // KEEP IN SYNC with roll_study_drop (0064): same multiplier, same clamp.
  const luck = petDropLuck(useAuth.getState().profile?.pet)
  if (Math.random() >= Math.min(0.6, STUDY_DROP.chance * luck)) return null

  const key = drawRelicKey()
  const rarity = collectibleByKey(key)?.rarity

  // The stamp lands once, ever; the item stacks every time. Disk is the
  // authority for a guest, so ask it rather than a store that may not be loaded.
  const newStamp = !localdb.getCards().includes(key)
  if (newStamp) localdb.addCard(key)
  useCollection.setState({ owned: localdb.getCards() })
  useInventory.getState().addLocal(key)

  writeLocalDay({ date: today, finds: finds + 1 })
  return { key, rarity, newStamp, qty: useInventory.getState().held(key) }
}
