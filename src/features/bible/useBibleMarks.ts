import { useEffect, useMemo } from 'react'
import { useBible } from '@/store/bible'
import { useFavorites } from '@/store/favorites'
import { expandMarks, type BibleMarks } from '@/lib/bibleProgress'
import { useVerseNotes, type NoteMap } from '@/store/verseNotes'

// A player's Bible is assembled from two stores that already existed separately:
// the verses they kept (favorites) and where they've been (bible marks). Every
// Bible surface needs both, and any of them can be the first screen of a session
// (a deep link, a reload), so this pulls both in rather than assuming a tab did.
//
// Range references ("Romans 8:38-39") are expanded here, once per change, so the
// per-verse lookup in a long chapter stays a plain object hit.
//
// The player's own highlights and notes (0111) ride along for the same reason
// the other two do: a chapter can be the first screen of a session, and a store
// that is only loaded by the screen that writes to it never turns anything on
// (the FirstLight scar). They are returned separately from `marks` because they
// are a CHOICE rather than a derived state — see PAPER_HIGHLIGHT.
export function useBibleMarks(): { marks: BibleMarks; notes: NoteMap; ready: boolean } {
  const saved = useFavorites((s) => s.map)
  const savedLoaded = useFavorites((s) => s.loaded)
  const loadFavorites = useFavorites((s) => s.load)

  const chapters = useBible((s) => s.chapters)
  const studied = useBible((s) => s.studied)
  const bibleLoaded = useBible((s) => s.loaded)
  const loadBible = useBible((s) => s.load)

  const notes = useVerseNotes((s) => s.notes)
  const notesLoaded = useVerseNotes((s) => s.loaded)
  const loadNotes = useVerseNotes((s) => s.load)

  useEffect(() => {
    if (!savedLoaded) loadFavorites()
    if (!bibleLoaded) loadBible()
    if (!notesLoaded) void loadNotes()
  }, [savedLoaded, loadFavorites, bibleLoaded, loadBible, notesLoaded, loadNotes])

  const marks = useMemo(
    () => expandMarks({ saved, studied, chapters }),
    [saved, studied, chapters],
  )

  // `ready` deliberately does NOT wait on notes: the page must render at full
  // speed, and a highlight arriving a beat later is a wash appearing, not a
  // layout moving.
  return { marks, notes, ready: savedLoaded && bibleLoaded }
}
