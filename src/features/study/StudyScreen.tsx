import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Page } from '@/components/Page'
import { LibraryScene } from './LibraryScene'
import { LibrarianSheet } from './LibrarianSheet'
import { useLibrary } from '@/store/library'
import { LIBRARIAN_NAME, type StudyBook } from '@/data/library'
import { useJuice } from '@/juice/useJuice'
import { useReviews } from '@/store/reviews'
import { useFavorites } from '@/store/favorites'
import { useInventory, seedGuestInventoryFromCollection } from '@/store/inventory'
import { usePractice } from '@/store/practice'
import { useBookAccuracy } from '@/store/bookAccuracy'
import { useAuth } from '@/store/auth'
import { summarize } from '@/lib/bookAccuracy'

// The Study tab — everything that's practice rather than the daily drop or a
// real battle. It is a LIBRARY: one room, filling the tab, with a librarian at
// the desk who lends you the five things you can practise, a ledger on that
// desk that is your reports, and a satchel on the floor that is your bag.
//
// It used to be a grid of book tiles. The argument for the room is the one
// every other section of this app already made — the road is the top of
// /season, the hall sits under "Start a new battle", the churchyard is the hero
// of /church, your Upper Room is under the player card — and Study was the last
// section that opened with a list of things rather than the place they are in.
//
// ONE LIST, TWO SURFACES. `books` below is built once and handed BOTH to the
// room (for its hotspot badges) and to Tabitha (for what she lends). A book
// carrying `lend` is stock; one without it is yours, and stands in the room as
// itself. Deciding that here, once, is what stops the room and her desk from
// becoming two menus that can disagree.
//
// Nothing here touches your rank. The one exception is deliberately tiny and
// deliberately server-granted: the FIRST BOOK OF THE DAY pays 5 XP
// (checkout_library_book, 0083), and nothing anywhere counts how many days in a
// row you have collected it.
export default function StudyScreen() {
  const navigate = useNavigate()
  const juice = useJuice()
  const { dueRefs, loadDue } = useReviews()
  const favCount = useFavorites((s) => Object.keys(s.map).length)
  const loadFavorites = useFavorites((s) => s.load)
  const loadInventory = useInventory((s) => s.load)
  const inHand = useInventory((s) =>
    Object.values(s.items).reduce((n, qty) => n + Math.max(0, qty), 0),
  )
  const replays = usePractice((s) => s.list.length)
  const loadPractice = usePractice((s) => s.loadList)
  const stats = useBookAccuracy((s) => s.stats)
  const loadAccuracy = useBookAccuracy((s) => s.load)
  const name = useAuth((s) => s.profile?.username ?? '')
  const loadLibrary = useLibrary((s) => s.load)

  // Old deep links (the drop toast used to send ?bag=1 here) land on the bag's
  // own page now that it's a place of its own.
  const [params] = useSearchParams()
  const [atDesk, setAtDesk] = useState(false)

  useEffect(() => {
    loadDue()
    loadFavorites()
    loadInventory()
    loadPractice()
    loadAccuracy()
    // Loaded here rather than only in the sheet, so the room knows whether
    // today's welcome is still owed before anybody taps anything.
    void loadLibrary()
    seedGuestInventoryFromCollection()
  }, [loadDue, loadFavorites, loadInventory, loadPractice, loadAccuracy, loadLibrary])

  const summary = useMemo(() => summarize(stats), [stats])

  if (params.get('bag') === '1') return <Navigate to="/study/bag" replace />

  // Everything Study can do, in one list. `lend` is what Tabitha will fetch;
  // the two without it stand in the room as themselves. `name` rides along for
  // the Bible, which is the player's own and says so.
  const books: StudyBook[] = [
    {
      key: 'versus',
      title: 'Battle the CPU',
      emblem: '🤖',
      cover: 'versus',
      caption: 'Race a study partner through a verse quiz',
      to: '/battle/cpu',
      lend: 'A verse quiz with someone to race down the page',
    },
    {
      key: 'focus',
      title: 'Focus a book',
      emblem: '🎯',
      cover: 'focus',
      caption: 'Drill one book of your choosing · earns XP',
      to: '/study/focus',
      lend: 'Pick one book of the Bible and go deep on it',
    },
    {
      key: 'replay',
      title: 'The last five',
      emblem: '📚',
      cover: 'replay',
      caption:
        replays > 0
          ? 'Replay a recent verse — beat your best for XP'
          : 'Play daily verses and they land here to replay',
      to: '/study/recent',
      badge: replays > 0 ? String(replays) : undefined,
      lend: 'The daily verses you’ve already played, to play again',
    },
    {
      key: 'keep',
      title: 'Keep it',
      emblem: '🧠',
      cover: 'keep',
      caption:
        dueRefs.length > 0
          ? `${dueRefs.length} verse${dueRefs.length === 1 ? '' : 's'} ready to review`
          : 'Spaced review — verses you play come back here',
      to: '/review',
      badge: dueRefs.length > 0 ? String(dueRefs.length) : undefined,
      lend: 'Verses brought back round so they stick',
    },
    {
      key: 'bible',
      title: name ? `${name}’s Bible` : 'My Bible',
      emblem: '📖',
      caption:
        favCount > 0
          ? `${favCount} kept — see what you've studied and read`
          : 'All 66 books, lit up as you go',
      to: '/bible',
      lend: 'The whole thing — all 66 books, yours to read',
    },
    // No `lend` past here: yours, not stock.
    {
      key: 'reports',
      title: 'My reports',
      emblem: '📊',
      cover: 'reports',
      caption:
        summary.answered > 0
          ? `Accuracy by book · ${summary.pct}% overall`
          : 'Accuracy by book — fills in as you answer',
      to: '/study/reports',
    },
    {
      key: 'bag',
      title: 'Your bag',
      emblem: '🎒',
      cover: 'bag',
      caption:
        inHand > 0
          ? `${inHand} find${inHand === 1 ? '' : 's'} in hand`
          : 'What studying turns up lands here',
      to: '/study/bag',
      badge: inHand > 0 ? String(inHand) : undefined,
    },
  ]

  const byKey = (k: string) => books.find((b) => b.key === k)
  const go = (to: string) => {
    juice.select?.()
    navigate(to)
  }

  // The librarian's marker carries what's DUE, because that's the one number
  // somebody needs before deciding whether to open anything — and it lives on
  // her rather than on a row, since there are no rows any more.
  const due = byKey('keep')?.badge

  return (
    <Page>
      <div className="center" style={{ marginBottom: 12 }}>
        <h1 style={{ fontSize: 26 }}>Study</h1>
        <p className="dim" style={{ marginTop: 2, fontSize: 13 }}>
          {LIBRARIAN_NAME} is at the desk — none of this affects your rank.
        </p>
      </div>

      {/* Bled past the shell's 18px gutter, because this is not a card on the
          tab — it is the tab. The extra width is height too: the render is a
          5:8 portrait, so every pixel sideways makes the room taller and the
          floor Tabitha stands on bigger. The shell already reserves 96px at the
          bottom for the nav, so nothing here needs a spacer. */}
      <div style={{ margin: '0 -18px' }}>
        <LibraryScene
          librarian={{ onTap: () => { juice.select?.(); setAtDesk(true) }, label: 'Ask her', badge: due }}
          ledger={{ onTap: () => go('/study/reports'), label: 'Reports' }}
          satchel={{ onTap: () => go('/study/bag'), label: 'Your bag', badge: byKey('bag')?.badge }}
        />
      </div>

      {atDesk && <LibrarianSheet items={books} onClose={() => setAtDesk(false)} />}
    </Page>
  )
}
