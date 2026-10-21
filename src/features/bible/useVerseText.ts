import { useEffect, useState } from 'react'
import { useSettings } from '@/store/settings'
import { fetchVerse } from '@/lib/bible'
import { reportFums } from '@/lib/fums'
import { parseReference } from '@/lib/bibleProgress'
import { BUNDLED, translationById } from '@/lib/translations'

/** Anything that knows a verse: a pool seed, a DailyVerse, a favorite. */
export interface VerseLike {
  reference: string
  /** The bundled (BSB) words — shown first, and kept if no fetch lands. */
  text: string
  book?: string
  chapter?: number
  verseStart?: number
  verseEnd?: number
}

export interface ShownVerse {
  text: string
  abbr: string
  translationName: string
  copyright: string
  /** False while it's still the bundled text standing in. */
  translated: boolean
  loading: boolean
}

const BUNDLED_COPYRIGHT = 'The Holy Bible, Berean Standard Bible, BSB — public domain.'

/**
 * A verse in the player's chosen translation, with the bundled text in hand
 * from the first frame. The BSB choice never touches the network: the bundled
 * pool already IS the BSB. Anything that fails — offline, a verse a version
 * numbers differently, a keyless build — leaves the bundled words on screen,
 * labelled BSB, rather than an empty card or a version the player didn't pick.
 */
export function useVerseText(v: VerseLike | null | undefined): ShownVerse {
  const tid = useSettings((s) => s.readingTranslation)
  const t = translationById(tid)
  const bundled: ShownVerse = {
    text: v?.text ?? '',
    abbr: BUNDLED.abbr,
    translationName: BUNDLED.name,
    copyright: BUNDLED_COPYRIGHT,
    translated: false,
    loading: false,
  }
  const [shown, setShown] = useState<ShownVerse>(bundled)

  const ref = v
    ? v.book && v.chapter && v.verseStart
      ? { book: v.book, chapter: v.chapter, start: v.verseStart, end: v.verseEnd }
      : (() => { const p = parseReference(v.reference); return p ? { book: p.book, chapter: p.chapter, start: p.start, end: p.end } : null })()
    : null
  const sig = ref ? `${t.id}|${ref.book}|${ref.chapter}|${ref.start}|${ref.end ?? ''}` : ''

  useEffect(() => {
    if (!v) return
    setShown(bundled)
    if (!ref || t.id === 'bsb') return
    const ctrl = new AbortController()
    setShown({ ...bundled, loading: true })
    fetchVerse(ref, t.id, ctrl.signal)
      .then((r) => {
        if (ctrl.signal.aborted) return
        setShown({ text: r.text, abbr: r.abbr, translationName: r.translationName, copyright: r.copyright, translated: true, loading: false })
        if (r.licensed) reportFums(r.fumsToken)
      })
      .catch(() => { if (!ctrl.signal.aborted) setShown(bundled) })
    return () => ctrl.abort()
    // `sig` captures everything the fetch depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, v?.text])

  return shown
}
