import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Page } from '@/components/Page'
import { FirstVisitTip } from '@/features/home/FirstVisitTip'
import { LibraryScene } from './LibraryScene'
import { LibrarianSheet, Cover } from './LibrarianSheet'
import { GENERATED_ART } from '@/data/generatedArt'
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
  //
  // ?desk=1 opens Tabitha straight away. The compass's "borrow today's book"
  // row and any quest naming `borrow_book` point here, because the checkout is
  // a HOTSPOT in the room rather than a route — landing in the library and
  // leaving somebody to work out that the librarian is the thing to tap is the
  // gap that row exists to close. Frozen at mount and the param dropped on the
  // way past, so a reload doesn't re-open the desk over whatever they went on
  // to do.
  const [params, setParams] = useSearchParams()
  const [wantsDesk] = useState(() => params.get('desk') === '1')
  const [atDesk, setAtDesk] = useState(wantsDesk)

  useEffect(() => {
    if (!wantsDesk) return
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('desk')
        return next
      },
      { replace: true },
    )
  }, [wantsDesk, setParams])

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
      key: 'trivia',
      title: 'Bonus trivia',
      emblem: '✨',
      caption: 'Five questions about a book of your choosing',
      to: '/study/trivia',
      lend: 'The bonus questions from the daily verse, five at a time',
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

  // Her row carries what's DUE, because that's the one number somebody needs
  // before deciding whether to open anything.
  const due = byKey('keep')?.badge

  return (
    <Page>
      <FirstVisitTip id="study" />
      <div className="center" style={{ marginBottom: 12 }}>
        <h1 style={{ fontSize: 26 }}>Study</h1>
        <p className="dim" style={{ marginTop: 2, fontSize: 13 }}>
          {LIBRARIAN_NAME} is at the desk — none of this affects your rank.
        </p>
      </div>

      {/* The room is ATMOSPHERE now: the painting and Tabitha, with no
          markers on the art and no bag on the floor (2026-10-21, the owner's
          call). Bled past the shell's 18px gutter because it is the tab's
          picture rather than a card on it. Every action it used to carry is a
          row in the list under it, with the same door and the same badge. */}
      <div style={{ margin: '0 -18px' }}>
        <LibraryScene />
      </div>

      <h3 className="dim" style={{ fontSize: 16, margin: '16px 0 10px' }}>At the desk</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        <DeskRow
          visual={<HerFace />}
          title="Ask her"
          caption="What she can lend you — practice, replays, kept verses"
          badge={due}
          onTap={() => { juice.select?.(); setAtDesk(true) }}
        />
        {byKey('reports') && (
          <DeskRow
            visual={<Cover item={byKey('reports')!} />}
            title="Reports"
            caption={byKey('reports')!.caption}
            onTap={() => go('/study/reports')}
          />
        )}
        {byKey('bag') && (
          <DeskRow
            visual={<Cover item={byKey('bag')!} />}
            title="Your bag"
            caption={byKey('bag')!.caption}
            badge={byKey('bag')!.badge}
            onTap={() => go('/study/bag')}
          />
        )}
      </div>

      {atDesk && <LibrarianSheet items={books} onClose={() => setAtDesk(false)} />}
    </Page>
  )
}

// One row of the list under the room — the desk sheet's own row shape, so the
// tab and her sheet read as one set of shelves. The badge is the same count
// the marker on the art used to carry; never anything new.
function DeskRow({
  visual,
  title,
  caption,
  badge,
  onTap,
}: {
  visual: React.ReactNode
  title: string
  caption?: string
  badge?: string
  onTap: () => void
}) {
  return (
    <button
      onClick={onTap}
      aria-label={badge ? `${title}, ${badge}` : title}
      className="vellum"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        textAlign: 'left',
        padding: '11px 12px',
        borderRadius: 12,
        backgroundColor: 'var(--card-solid)',
        border: '1px solid var(--stroke)',
        cursor: 'pointer',
        color: 'var(--ink)',
        width: '100%',
      }}
    >
      {visual}
      <span style={{ minWidth: 0, flex: 1 }}>
        <b style={{ display: 'block', fontSize: 14 }}>{title}</b>
        {caption && <span className="faint" style={{ fontSize: 11.5, lineHeight: 1.35 }}>{caption}</span>}
      </span>
      {badge && (
        <span
          style={{
            flexShrink: 0,
            minWidth: 22,
            padding: '2px 7px',
            borderRadius: 999,
            background: 'var(--gold)',
            color: '#3a2200',
            fontSize: 11.5,
            fontWeight: 800,
            textAlign: 'center',
          }}
        >
          {badge}
        </span>
      )}
      <span className="faint" style={{ fontSize: 13, flexShrink: 0 }}>→</span>
    </button>
  )
}

// Tabitha's own render, cropped to her head and shoulders in the same 30x42
// box the book covers use, so her row sits in line with theirs.
function HerFace() {
  const her = GENERATED_ART['librarian']
  return (
    <span
      aria-hidden
      style={{
        flexShrink: 0,
        width: 30,
        height: 42,
        borderRadius: 6,
        overflow: 'hidden',
        background: her ? `top center/180% auto no-repeat url(${her}), var(--card-raised)` : 'var(--card-raised)',
        display: 'grid',
        placeItems: 'center',
        fontSize: 18,
      }}
    >
      {her ? null : '📚'}
    </span>
  )
}
