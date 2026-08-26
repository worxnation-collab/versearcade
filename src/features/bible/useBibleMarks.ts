import { useEffect, useMemo } from 'react'
import { useBible } from '@/store/bible'
import { useFavorites } from '@/store/favorites'
import { expandMarks, type BibleMarks } from '@/lib/bibleProgress'

// A player's Bible is assembled from two stores that already existed separately:
// the verses they kept (favorites) and where they've been (bible marks). Every
// Bible surface needs both, and any of them can be the first screen of a session
// (a deep link, a reload), so this pulls both in rather than assuming a tab did.
//
// Range references ("Romans 8:38-39") are expanded here, once per change, so the
// per-verse lookup in a long chapter stays a plain object hit.
export function useBibleMarks(): { marks: BibleMarks; ready: boolean } {
  const saved = useFavorites((s) => s.map)
  const savedLoaded = useFavorites((s) => s.loaded)
  const loadFavorites = useFavorites((s) => s.load)

  const chapters = useBible((s) => s.chapters)
  const studied = useBible((s) => s.studied)
  const bibleLoaded = useBible((s) => s.loaded)
  const loadBible = useBible((s) => s.load)

  useEffect(() => {
    if (!savedLoaded) loadFavorites()
    if (!bibleLoaded) loadBible()
  }, [savedLoaded, loadFavorites, bibleLoaded, loadBible])

  const marks = useMemo(
    () => expandMarks({ saved, studied, chapters }),
    [saved, studied, chapters],
  )

  return { marks, ready: savedLoaded && bibleLoaded }
}
