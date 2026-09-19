import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth'

// A colour and a private note, on a verse in your own Bible.
//
// Two-mode for real (`verse_notes` + `set_verse_note` / `my_verse_notes` from
// 0111 online, `va.bible.notes.<uid>` for a guest), and the same shape every
// other store here takes: a private isOnline(), a load() that reads whichever
// source is authoritative, and a writer that moves the in-memory copy first so
// the page shades instantly.
//
// **It is shown to nobody, and that is what lets it exist.** The Prayer Wall's
// line is the app's other player-authored text and it is visible to
// church-mates and buddies, so it needed a report path and an admin queue. A
// verse note is visible only to its author — no card, no board, no roster, no
// crowd scene — so there is nothing to moderate at all. The migration's header
// is the long version; the part that matters here is that `my_verse_notes()`
// takes no user id, so there is no call this client could make that would
// return somebody else's.
//
// It ranks nobody and counts nothing: no XP, no rung, no "12 highlighted", no
// bar toward 31,102. The marks in `store/bible.ts` already make that argument.

/** Mirror of the colour list in 0111's column check AND its RPC. */
export const NOTE_COLOURS = ['amber', 'rose', 'mint', 'sky', 'violet', 'peach'] as const
export type NoteColour = (typeof NOTE_COLOURS)[number]

/** Mirror of the ceiling in `set_verse_note` — the usual keep-in-sync pair. */
export const VERSE_NOTES_CAP = 5000
/** Mirror of the length cap in 0111. */
export const NOTE_MAX = 500

export interface VerseNote {
  colour: NoteColour | null
  note: string | null
}

export type NoteMap = Record<string, VerseNote>

function localKey(): string {
  const uid = useAuth.getState().profile?.id
  return uid ? `va.bible.notes.${uid}` : 'va.bible.notes.guest'
}

function readLocal(): NoteMap {
  try {
    const raw = JSON.parse(localStorage.getItem(localKey()) || '{}') as NoteMap
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

function writeLocal(map: NoteMap) {
  try {
    localStorage.setItem(localKey(), JSON.stringify(map))
  } catch {
    /* private mode / storage full — in-memory only */
  }
}

function isOnline(): boolean {
  const a = useAuth.getState()
  return !!supabase && a.mode === 'online' && a.isAuthed
}

/** The same cleaning the SQL does, so a guest gets exactly what an account gets. */
export function cleanNote(s: string): string | null {
  const flat = s.replace(/[\r\n\t]+/g, ' ').trim()
  return flat ? flat.slice(0, NOTE_MAX) : null
}

interface State {
  notes: NoteMap
  loaded: boolean
  load: () => Promise<void>
  /** Set or clear. Both null clears the verse entirely. */
  set: (reference: string, colour: NoteColour | null, note: string | null) => Promise<void>
}

export const useVerseNotes = create<State>((set, get) => ({
  notes: {},
  loaded: false,

  async load() {
    if (isOnline()) {
      const { data, error } = await supabase!.rpc('my_verse_notes')
      // Fails closed: a server without 0111 leaves the reader exactly as it
      // was — no colours, no error state, the FirstLight shape.
      set({ notes: error || !data ? {} : (data as NoteMap), loaded: true })
      return
    }
    set({ notes: readLocal(), loaded: true })
  },

  async set(reference, colour, note) {
    if (!reference) return
    const clean = note ? cleanNote(note) : null
    const online = isOnline()
    const state = get()

    // Guest writes merge onto what is on DISK, not onto in-memory state — the
    // store can be empty when a deep link lands straight in a chapter, and
    // merging onto {} would write that back and erase every other note. Same
    // trap as store/bookAccuracy.ts:record and store/bible.ts:write.
    const base: NoteMap = state.loaded || online ? state.notes : readLocal()

    const next: NoteMap = { ...base }
    if (!colour && !clean) delete next[reference]
    else {
      if (!base[reference] && Object.keys(base).length >= VERSE_NOTES_CAP) return
      next[reference] = { colour, note: clean }
    }
    set({ notes: next })

    if (online) {
      // Awaited, and the error checked. A postgrest-js builder is lazy — `void
      // supabase.rpc(...)` builds a request and throws it away, which is how
      // keep_placements sat at zero rows in production.
      const { error } = await supabase!.rpc('set_verse_note', {
        p_reference: reference,
        p_colour: colour,
        p_note: clean,
      })
      // Re-read rather than leave an optimistic lie on screen.
      if (error) await get().load()
    } else {
      writeLocal(next)
    }
  },
}))
