import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth'
import { todayLocalDate } from '@/lib/date'
import { mergeRun, type BookAccuracy } from '@/lib/bookAccuracy'

// Per-book accuracy tallies. Persistence mirrors the reviews store:
//  - ONLINE: the `book_accuracy` table, incremented through record_book_accuracy
//    (server-side add, so two devices playing the same day both count), and
//  - LOCAL/guest: localStorage, keyed per account so accounts don't mix.
// The in-memory copy is updated optimistically either way, so the Study chart
// moves the instant a run ends.

function localKey(): string {
  const uid = useAuth.getState().profile?.id
  return uid ? `va.bookAccuracy.${uid}` : 'va.bookAccuracy.guest'
}

function readLocal(): BookAccuracy {
  try {
    return JSON.parse(localStorage.getItem(localKey()) || '{}') as BookAccuracy
  } catch {
    return {}
  }
}

function writeLocal(stats: BookAccuracy) {
  try {
    localStorage.setItem(localKey(), JSON.stringify(stats))
  } catch {
    /* private mode / storage full — in-memory only */
  }
}

function isOnline(): boolean {
  const a = useAuth.getState()
  return !!supabase && a.mode === 'online' && a.isAuthed
}

async function readRemote(uid: string): Promise<BookAccuracy> {
  const { data, error } = await supabase!
    .from('book_accuracy')
    .select('book, correct, answered, last_played_on')
    .eq('user_id', uid)
  if (error || !data) return {}
  const stats: BookAccuracy = {}
  for (const r of data as any[]) {
    stats[r.book] = {
      book: r.book,
      correct: r.correct ?? 0,
      answered: r.answered ?? 0,
      lastPlayedOn: r.last_played_on ?? null,
    }
  }
  return stats
}

interface BookAccuracyState {
  stats: BookAccuracy
  loaded: boolean
  load: () => Promise<void>
  /** Fold one finished run (or one graded review card) into the book's tally. */
  record: (book: string, correct: number, answered: number) => void
}

export const useBookAccuracy = create<BookAccuracyState>((set, get) => ({
  stats: {},
  loaded: false,

  async load() {
    const uid = useAuth.getState().profile?.id
    const stats = isOnline() && uid ? await readRemote(uid) : readLocal()
    set({ stats, loaded: true })
  },

  record(book, correct, answered) {
    if (!book || answered <= 0) return
    const day = todayLocalDate()
    // A run can finish before anything has read the tallies (deep-linking
    // straight into a quiz, or a reload mid-session), so merge onto what's on
    // disk rather than an empty in-memory map — otherwise the write below would
    // replace every other book with just this one. `loaded` stays as it was: the
    // chart reloads on mount, which is what makes the ONLINE copy authoritative.
    const stats = mergeRun(get().loaded ? get().stats : readLocal(), book, correct, answered, day)
    set({ stats })

    if (isOnline()) {
      supabase!
        .rpc('record_book_accuracy', {
          p_book: book,
          p_correct: Math.max(0, Math.min(correct, answered)),
          p_answered: answered,
          p_day: day,
        })
        .then(({ error }) => {
          // Keep a local copy if the network hiccups, so a run is never lost.
          if (error) writeLocal(stats)
        })
    } else {
      writeLocal(stats)
    }
  },
}))
