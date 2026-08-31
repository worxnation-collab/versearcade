import { useEffect, useMemo, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { Page } from '@/components/Page'
import { StudyShelf, type ShelfItem } from './StudyShelf'
import { LibraryWindow } from './LibraryWindow'
import { LibrarianSheet } from './LibrarianSheet'
import { useLibrary } from '@/store/library'
import { useReviews } from '@/store/reviews'
import { useFavorites } from '@/store/favorites'
import { useInventory, seedGuestInventoryFromCollection } from '@/store/inventory'
import { usePractice } from '@/store/practice'
import { useBookAccuracy } from '@/store/bookAccuracy'
import { useAuth } from '@/store/auth'
import { summarize } from '@/lib/bookAccuracy'

// The Study tab — everything that's practice rather than the daily drop or a
// real battle, laid out as a shelf of books. Each surface is a bound volume
// (CPU battles, focus drills, the last-five replays, reviews, your reports,
// your bag) and tapping one swings its cover open onto that surface's own
// page. The player's actual Bible stands among them, wearing its real board.
// Nothing here touches your rank.
//
// The lending library stands above the shelf, because every other section here
// opens with the place it is about (the road, the hall, the churchyard, your
// room) and Study opened with a menu. Tapping it puts you in front of a
// librarian who fetches the same books — the long way round, for players who
// would rather be somewhere than pick something. The shelf's boards came down
// to 108px to make room for her; see the note on BOOK_SCALE in StudyShelf.
//
// EVERY DESTINATION SHE OFFERS IS ONE OF THESE ITEMS. The `lend` line below is
// what makes a book borrowable, so the room and the shelf cannot drift into
// two different lists of things to do.
export default function StudyScreen() {
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

  // Old deep links (the drop toast used to send ?bag=1 here) land on the bag's
  // own page now that it's a book of its own.
  const [params] = useSearchParams()
  const [atDesk, setAtDesk] = useState(false)
  const loadLibrary = useLibrary((s) => s.load)

  useEffect(() => {
    loadDue()
    loadFavorites()
    loadInventory()
    loadPractice()
    loadAccuracy()
    // Loaded here rather than only in the sheet, so the librarian knows
    // whether a card has already been stamped before anybody taps her.
    void loadLibrary()
    seedGuestInventoryFromCollection()
  }, [loadDue, loadFavorites, loadInventory, loadPractice, loadAccuracy, loadLibrary])

  const summary = useMemo(() => summarize(stats), [stats])

  if (params.get('bag') === '1') return <Navigate to="/study/bag" replace />

  // The shelf, in reading order: things to do first, then things to look at.
  // Every book stands on the shelf all the time — a shelf that grows and
  // shrinks makes the player hunt for their place. When "Keep it" has nothing
  // due, its caption says what the book is for and the badge stays off.
  const items: ShelfItem[] = [
    {
      key: 'versus',
      title: 'Battle the CPU',
      emblem: '🤖',
      skin: 'versus',
      caption: 'Race a study partner through a verse quiz',
      to: '/battle/cpu',
      lend: 'A verse quiz with someone to race down the page',
    },
    {
      key: 'focus',
      title: 'Focus a book',
      emblem: '🎯',
      skin: 'focus',
      caption: 'Drill one book of your choosing · earns XP',
      to: '/study/focus',
      lend: 'Pick one book of the Bible and go deep on it',
    },
    {
      key: 'replay',
      title: 'The last five',
      emblem: '📚',
      skin: 'replay',
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
      skin: 'keep',
      caption:
        dueRefs.length > 0
          ? `${dueRefs.length} verse${dueRefs.length === 1 ? '' : 's'} ready to review — make ${dueRefs.length === 1 ? 'it' : 'them'} stick`
          : 'Spaced review — verses you play come back here',
      to: '/review',
      badge: dueRefs.length > 0 ? String(dueRefs.length) : undefined,
      lend: 'Verses brought back round so they stick',
    },
    {
      key: 'bible',
      title: 'My Bible',
      emblem: '📖',
      skin: 'bible',
      name,
      caption:
        favCount > 0
          ? `${favCount} kept — see what you've studied and read`
          : 'All 66 books, lit up as you go',
      to: '/bible',
      lend: 'The whole thing — all 66 books, yours to read',
    },
    {
      key: 'reports',
      title: 'My reports',
      emblem: '📊',
      skin: 'reports',
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
      skin: 'bag',
      caption:
        inHand > 0
          ? `${inHand} find${inHand === 1 ? '' : 's'} in hand — give ${inHand === 1 ? 'it' : 'one'} to your church`
          : 'What studying turns up lands here',
      to: '/study/bag',
      badge: inHand > 0 ? String(inHand) : undefined,
    },
  ]

  return (
    <Page>
      <div className="center" style={{ marginBottom: 16 }}>
        <div className="floaty" style={{ fontSize: 44 }}>📚</div>
        <h1 style={{ fontSize: 28, marginTop: 4 }}>Study</h1>
        <p className="dim" style={{ marginTop: 4 }}>
          Pick a book off the shelf — none of it affects your rank.
        </p>
      </div>

      {/* The room, above the shelf it belongs to — the same placement the road,
          the hall, the churchyard and the Upper Room use. */}
      <div style={{ marginBottom: 18 }}>
        <LibraryWindow onEnter={() => setAtDesk(true)} />
      </div>

      <StudyShelf items={items} />

      {atDesk && <LibrarianSheet items={items} onClose={() => setAtDesk(false)} />}

      <div style={{ height: 90 }} />
    </Page>
  )
}
