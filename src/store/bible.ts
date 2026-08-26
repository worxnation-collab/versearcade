import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth'
import { chapterKey } from '@/data/bible/structure'
import { BIBLE_MARKS_CAP, parseReference, type MarkMap } from '@/lib/bibleProgress'

// Where the player has been in their Bible. Two kinds of mark:
//
//   'read'    — a chapter they opened in a reader, keyed `Genesis|1`.
//   'studied' — a verse they answered questions on, keyed by its reference.
//
// Saved verses are NOT here: those are the favorites store, unchanged, so every
// verse anyone ever kept still shows up highlighted in their Bible.
//
// Persistence mirrors the reviews / bookAccuracy stores:
//  - ONLINE: the `bible_marks` table, written through mark_bible_progress
//    (security definer, so the row cap is enforced server-side too), and
//  - LOCAL/guest: localStorage, keyed per account so accounts don't mix.
// The in-memory copy moves first either way, so the page shades instantly.
//
// Marks are cumulative and never removed. Opening a chapter is not a claim to
// have understood it — it's a footprint, and nothing here is scored, ranked or
// shown to anyone else.

function localKey(): string {
  const uid = useAuth.getState().profile?.id
  return uid ? `va.bible.${uid}` : 'va.bible.guest'
}

interface LocalMarks {
  chapters: MarkMap
  studied: MarkMap
}

function readLocal(): LocalMarks {
  try {
    const raw = JSON.parse(localStorage.getItem(localKey()) || '{}') as Partial<LocalMarks>
    return { chapters: raw.chapters ?? {}, studied: raw.studied ?? {} }
  } catch {
    return { chapters: {}, studied: {} }
  }
}

function writeLocal(marks: LocalMarks) {
  try {
    localStorage.setItem(localKey(), JSON.stringify(marks))
  } catch {
    /* private mode / storage full — in-memory only */
  }
}

function isOnline(): boolean {
  const a = useAuth.getState()
  return !!supabase && a.mode === 'online' && a.isAuthed
}

async function readRemote(uid: string): Promise<LocalMarks> {
  const { data, error } = await supabase!
    .from('bible_marks')
    .select('kind, key, created_at')
    .eq('user_id', uid)
  if (error || !data) return { chapters: {}, studied: {} }
  const marks: LocalMarks = { chapters: {}, studied: {} }
  for (const r of data as any[]) {
    const at = r.created_at ?? new Date().toISOString()
    if (r.kind === 'read') marks.chapters[r.key] = at
    else if (r.kind === 'studied') marks.studied[r.key] = at
  }
  return marks
}

interface BibleState {
  chapters: MarkMap
  studied: MarkMap
  loaded: boolean
  load: () => Promise<void>
  markChapterRead: (book: string, chapter: number) => void
  markStudied: (reference: string) => void
}

export const useBible = create<BibleState>((set, get) => ({
  chapters: {},
  studied: {},
  loaded: false,

  async load() {
    const uid = useAuth.getState().profile?.id
    const marks = isOnline() && uid ? await readRemote(uid) : readLocal()
    set({ chapters: marks.chapters, studied: marks.studied, loaded: true })
  },

  markChapterRead(book, chapter) {
    if (!book || !Number.isInteger(chapter) || chapter < 1) return
    write('read', chapterKey(book, chapter), set, get)
  },

  markStudied(reference) {
    // A run can finish from a deep link, before anything showed a reference —
    // so validate rather than trusting the caller's string shape.
    if (!reference || !parseReference(reference)) return
    write('studied', reference, set, get)
  },
}))

type Setter = (partial: Partial<BibleState>) => void
type Getter = () => BibleState

function write(kind: 'read' | 'studied', key: string, set: Setter, get: Getter) {
  const online = isOnline()
  const state = get()

  // Guest writes merge onto what's on DISK, not onto in-memory state. A run can
  // finish before anything called load() (deep link straight into a quiz, or a
  // reload mid-session), and merging onto an empty map would write that back and
  // erase every other mark. Same trap as store/bookAccuracy.ts:record.
  const base: LocalMarks =
    state.loaded || online
      ? { chapters: state.chapters, studied: state.studied }
      : readLocal()

  const bucket = kind === 'read' ? base.chapters : base.studied
  if (bucket[key]) return // already marked — nothing to write, nothing to re-send

  // Mirror of the cap in mark_bible_progress (0048) — same rule, both sides.
  const total = Object.keys(base.chapters).length + Object.keys(base.studied).length
  if (total >= BIBLE_MARKS_CAP) return

  const at = new Date().toISOString()
  const next: LocalMarks = {
    chapters: kind === 'read' ? { ...base.chapters, [key]: at } : base.chapters,
    studied: kind === 'studied' ? { ...base.studied, [key]: at } : base.studied,
  }
  set({ chapters: next.chapters, studied: next.studied })

  if (online) {
    supabase!
      .rpc('mark_bible_progress', { p_kind: kind, p_key: key })
      .then(({ error }) => {
        // Keep a local copy if the network hiccups, so a footprint isn't lost.
        if (error) writeLocal(next)
      })
  } else {
    writeLocal(next)
  }
}
