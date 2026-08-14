import { create } from 'zustand'

// Focus practice: the book a player has chosen to drill. Persisted to the device
// so the choice sticks across sessions "until the user changes it". `book === null`
// means Any book (random from the whole pool); `chosen` distinguishes a real pick
// from the never-picked default so the picker can show a first-run state.

const KEY = 'va_focus_book_v1'

interface Saved {
  book: string | null
  chosen: boolean
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { book: null, chosen: false }
    const p = JSON.parse(raw) as Partial<Saved>
    return { book: typeof p.book === 'string' ? p.book : null, chosen: !!p.chosen }
  } catch {
    return { book: null, chosen: false }
  }
}

function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* private mode / storage disabled — in-memory only */
  }
}

interface FocusState extends Saved {
  setBook: (book: string | null) => void
}

export const useFocus = create<FocusState>((set) => ({
  ...load(),
  setBook(book) {
    const next = { book, chosen: true }
    save(next)
    set(next)
  },
}))
