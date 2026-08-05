import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth'
import { localdb } from '@/lib/localdb'
import { getVerseForDate } from '@/data/bible/questions'
import { DEFAULT_TRANSLATION } from '@/lib/config'
import {
  buildChallenge,
  isDue,
  masteredCount,
  nextEntry,
  seedByReference,
  SESSION_CAP,
  type ReviewChallenge,
  type ReviewEntry,
  type ReviewSchedule,
} from '@/lib/review'

// SRS math lives on the client (it uses the user's LOCAL date). Persistence is:
//  - ONLINE: the `verse_reviews` table (syncs across devices), and
//  - LOCAL/guest: localStorage (per account key so accounts don't mix).
function guestKey(): string {
  const uid = useAuth.getState().profile?.id
  return uid ? `va.reviews.${uid}` : 'va.reviews.guest'
}
function readLocalSchedule(): ReviewSchedule {
  try {
    return JSON.parse(localStorage.getItem(guestKey()) || '{}') as ReviewSchedule
  } catch {
    return {}
  }
}
function writeLocalSchedule(s: ReviewSchedule) {
  localStorage.setItem(guestKey(), JSON.stringify(s))
}

function isOnline(): boolean {
  return useAuth.getState().mode === 'online' && !!supabase
}

async function readRemoteSchedule(uid: string): Promise<ReviewSchedule> {
  const { data, error } = await supabase!
    .from('verse_reviews')
    .select('reference, mastery, due, last_reviewed_on')
    .eq('user_id', uid)
  if (error || !data) return {}
  const schedule: ReviewSchedule = {}
  for (const r of data as any[]) {
    schedule[r.reference] = { mastery: r.mastery, due: r.due, last: r.last_reviewed_on ?? r.due }
  }
  return schedule
}

// Distinct verse references the player has actually seen (played).
async function playedReferences(): Promise<string[]> {
  let dates: string[] = []
  if (!isOnline()) {
    dates = Object.keys(localdb.getPlays())
  } else {
    const { data: u } = await supabase!.auth.getUser()
    if (!u.user) return []
    const { data } = await supabase!.from('plays').select('drop_date').eq('user_id', u.user.id)
    dates = (data ?? []).map((r: any) => r.drop_date)
  }
  const refs = new Set<string>()
  for (const d of dates) refs.add(getVerseForDate(d).reference)
  return [...refs]
}

interface ReviewsState {
  schedule: ReviewSchedule
  dueRefs: string[]
  masteredCount: number
  queue: ReviewChallenge[]
  loadDue: () => Promise<void>
  grade: (reference: string, correct: boolean) => void
}

export const useReviews = create<ReviewsState>((set, get) => ({
  schedule: {},
  dueRefs: [],
  masteredCount: 0,
  queue: [],

  async loadDue() {
    const online = isOnline()
    const uid = useAuth.getState().profile?.id
    const schedule = online && uid ? await readRemoteSchedule(uid) : readLocalSchedule()
    const refs = await playedReferences()
    const due = refs.filter((r) => seedByReference(r) && isDue(schedule[r]))
    const queue = due
      .slice(0, SESSION_CAP)
      .map((r) => buildChallenge(r, schedule[r]?.mastery ?? 0, DEFAULT_TRANSLATION))
      .filter((c): c is ReviewChallenge => c !== null)
    set({ schedule, dueRefs: due, masteredCount: masteredCount(schedule), queue })
  },

  grade(reference, correct) {
    const entry: ReviewEntry = nextEntry(get().schedule[reference], correct)
    const schedule = { ...get().schedule, [reference]: entry }
    // Optimistic in-memory update so the UI is instant.
    set({
      schedule,
      masteredCount: masteredCount(schedule),
      dueRefs: get().dueRefs.filter((r) => r !== reference),
    })
    // Persist.
    const uid = useAuth.getState().profile?.id
    if (isOnline() && uid) {
      supabase!
        .from('verse_reviews')
        .upsert(
          {
            user_id: uid,
            reference,
            mastery: entry.mastery,
            due: entry.due,
            last_reviewed_on: entry.last,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,reference' },
        )
        .then(({ error }) => {
          // Fall back to a local copy so progress isn't lost on a network hiccup.
          if (error) writeLocalSchedule(schedule)
        })
    } else {
      writeLocalSchedule(schedule)
    }
  },
}))
