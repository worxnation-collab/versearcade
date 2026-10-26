import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Page } from '@/components/Page'
import { Collapsible } from '@/components/Collapsible'
import { FirstVisitTip } from '@/features/home/FirstVisitTip'
import { LibraryScene } from './LibraryScene'
import { LibrarianSheet, Cover } from './LibrarianSheet'
import { useLibrary } from '@/store/library'
import { GREETINGS, LIBRARIAN_NAME, LIBRARY_XP, lineFrom, type StudyBook } from '@/data/library'
import { GENERATED_ART } from '@/data/generatedArt'
import { Icon } from '@/data/icons'
import { useJuice } from '@/juice/useJuice'
import { useReviews } from '@/store/reviews'
import { useFavorites } from '@/store/favorites'
import { useInventory, seedGuestInventoryFromCollection } from '@/store/inventory'
import { usePractice } from '@/store/practice'
import { useBookAccuracy } from '@/store/bookAccuracy'
import { useAuth } from '@/store/auth'
import {
  TIERS,
  accuracyPct,
  reviewOrder,
  summarize,
  tierOf,
  type AccuracySummary,
  type BookStat,
} from '@/lib/bookAccuracy'

// The Study tab — everything that's practice rather than the daily drop or a
// real battle. Since 2026-10-26 it is a REPORTS-FIRST DASHBOARD, top to bottom:
//
//   1. Tabitha, reduced — a strip with her portrait (the `librarian` render),
//      one line from GREETINGS and an "Ask" button that opens LibrarianSheet.
//      She is still the one who lends: the stamp and the day's first-book
//      5 XP (checkout_library_book, 0083) live ONLY in her sheet. The tool
//      cards below are plain doors and pay nothing at the door.
//   2. Your progress — overall accuracy and books answered (`summarize`), and
//      the three most recently answered books, softest first on a tie. "See
//      all reports" goes to /study/reports; the full BookAccuracyChart is NOT
//      repeated here. Every word on it is about you against you.
//   3. Study tools — every StudyBook but reports, as a 2-column grid.
//   4. "Visit the library" — the painted room, folded. Kept, not deleted;
//      tapping it opens her desk as it always did.
//
// It used to open on the room itself (and before that on a grid of tiles).
// The room read beautifully and buried the one thing a returning studier
// wants to know — how am I doing, and what next — under a picture.
//
// ONE LIST, TWO SURFACES. `books` below is built once and handed BOTH to the
// dashboard's tool grid and to Tabitha (for what she lends). A book carrying
// `lend` is stock; one without it is yours (reports, bag). Deciding that
// here, once, is what stops the grid and her desk becoming two menus that
// can disagree.
//
// ?desk=1 still opens her sheet on arrival (the compass's "borrow today's
// book" row points here), and ?bag=1 still redirects to /study/bag.
//
// Nothing here touches your rank. The one exception is deliberately tiny and
// deliberately server-granted: the FIRST BOOK OF THE DAY pays 5 XP, and
// nothing anywhere counts how many days in a row you have collected it.
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
  const accuracyLoaded = useBookAccuracy((s) => s.loaded)
  const borrowedToday = useLibrary((s) => s.borrowedToday)
  const libraryLoaded = useLibrary((s) => s.loaded)
  const name = useAuth((s) => s.profile?.username ?? '')
  const loadLibrary = useLibrary((s) => s.load)

  // Old deep links (the drop toast used to send ?bag=1 here) land on the bag's
  // own page now that it's a place of its own.
  //
  // ?desk=1 opens Tabitha straight away. The compass's "borrow today's book"
  // row and any quest naming `borrow_book` point here, because the checkout is
  // her sheet rather than a route — landing in the library and
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
    // Loaded here rather than only in the sheet, so her strip knows whether
    // today's welcome is still owed before anybody taps anything.
    void loadLibrary()
    seedGuestInventoryFromCollection()
  }, [loadDue, loadFavorites, loadInventory, loadPractice, loadAccuracy, loadLibrary])

  const summary = useMemo(() => summarize(stats), [stats])
  // The three books you touched most recently; on a tie (same day, or no
  // date) the softer one first — the chart's own review order.
  const recent = useMemo(() => {
    const soft = reviewOrder(stats)
    const rank = new Map(soft.map((s, i) => [s.book, i]))
    return [...soft]
      .sort((a, b) => {
        const d = (b.lastPlayedOn ?? '').localeCompare(a.lastPlayedOn ?? '')
        return d !== 0 ? d : rank.get(a.book)! - rank.get(b.book)!
      })
      .slice(0, 3)
  }, [stats])

  if (params.get('bag') === '1') return <Navigate to="/study/bag" replace />

  // Everything Study can do, in one list. `lend` is what Tabitha will fetch;
  // the two without it (reports, bag) are yours rather than stock. `name` rides along for
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
  const openDesk = () => {
    juice.select?.()
    setAtDesk(true)
  }

  // What's DUE rides on her button, because that's the one number somebody
  // needs before deciding whether to open anything.
  const due = byKey('keep')?.badge
  // The tools on the dashboard: everything she lends, plus the bag (yours,
  // not stock). Reports is left out — it IS the panel above.
  // Her two leads first (verses you've already met), then the rest in order.
  const LEAD = ['keep', 'replay']
  const tools = [
    ...LEAD.map((k) => byKey(k)).filter((b): b is StudyBook => !!b),
    ...books.filter((b) => b.key !== 'reports' && !LEAD.includes(b.key)),
  ]

  return (
    <Page>
      <FirstVisitTip id="study" />
      <div className="center" style={{ marginBottom: 12 }}>
        <h1 style={{ fontSize: 26 }}>Study</h1>
        <p className="dim" style={{ marginTop: 2, fontSize: 13 }}>
          Your progress — only ever against yourself.
        </p>
      </div>

      <TabithaStrip due={due} owed={libraryLoaded && !borrowedToday} onOpen={openDesk} />

      <ProgressPanel
        summary={summary}
        loaded={accuracyLoaded}
        recent={recent}
        onAll={() => go('/study/reports')}
        onBook={(book) => go(`/study/focus?book=${encodeURIComponent(book)}`)}
      />

      <h3 className="dim" style={{ fontSize: 16, margin: '18px 0 10px' }}>Study tools</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        {tools.map((b) => (
          <ToolCard key={b.key} item={b} onTap={() => go(b.to)} />
        ))}
      </div>

      {/* The room, kept rather than deleted, folded under everything else:
          the art is still the library you're in, it just isn't the first
          thing on the tab any more. Tapping it still opens her desk. */}
      <div style={{ marginTop: 18 }}>
        <Collapsible icon={<Icon id="study" size={18} style={{ display: 'inline-block', verticalAlign: '-3px' }} />} title="Visit the library">
          <button
            onClick={openDesk}
            aria-label={due ? `Ask ${LIBRARIAN_NAME}, ${due} due` : `Ask ${LIBRARIAN_NAME}`}
            style={{
              display: 'block',
              width: '100%',
              padding: 0,
              border: 0,
              background: 'none',
              cursor: 'pointer',
              marginBottom: 10,
            }}
          >
            <LibraryScene />
          </button>
        </Collapsible>
      </div>

      {atDesk && <LibrarianSheet items={books} onClose={() => setAtDesk(false)} />}
    </Page>
  )
}

/**
 * Tabitha, reduced: her portrait, one line from her greeting pool, and the
 * door to her desk. She is still the one who lends — every practice door and
 * the day's first-book stamp live in her sheet — but she no longer fills the
 * tab. The line is drawn once per visit, like the sheet's own greeting.
 */
function TabithaStrip({ due, owed, onOpen }: { due?: string; owed: boolean; onOpen: () => void }) {
  const line = useMemo(() => lineFrom(GREETINGS), [])
  const art = GENERATED_ART['librarian']
  return (
    <div
      className="card"
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', marginBottom: 12 }}
    >
      <span
        aria-hidden
        style={{
          flexShrink: 0,
          width: 46,
          height: 46,
          borderRadius: '50%',
          border: '1.5px solid var(--edge)',
          background: art
            ? `var(--card-raised) url(${art}) center -3px / 104px auto no-repeat`
            : 'var(--card-raised)',
          display: 'grid',
          placeItems: 'center',
          fontSize: 22,
        }}
      >
        {!art && '📚'}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <b style={{ display: 'block', fontSize: 13.5 }}>{LIBRARIAN_NAME}</b>
        <span className="dim" style={{ fontSize: 12, lineHeight: 1.35, display: 'block' }}>
          “{line}”
        </span>
        {owed && (
          <span className="faint" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>
            Today’s first book comes with +{LIBRARY_XP} XP.
          </span>
        )}
      </span>
      <button
        className="pill"
        onClick={onOpen}
        aria-label={due ? `Ask ${LIBRARIAN_NAME}, ${due} due` : `Ask ${LIBRARIAN_NAME}`}
        style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 800 }}
      >
        Ask
        {due && <CountBadge>{due}</CountBadge>}
      </button>
    </div>
  )
}

/**
 * Your progress, compact: overall accuracy, how many books it covers, and
 * the three most recently answered books. The full chart lives on
 * /study/reports and is NOT duplicated here. Nothing on it is about anybody
 * else — no average, no percentile, no "better than".
 */
function ProgressPanel({
  summary,
  loaded,
  recent,
  onAll,
  onBook,
}: {
  summary: AccuracySummary
  loaded: boolean
  recent: BookStat[]
  onAll: () => void
  onBook: (book: string) => void
}) {
  const empty = summary.answered === 0
  return (
    <section className="card" style={{ padding: '14px 14px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 16, flex: 1 }}>Your progress</b>
        <span className="faint" style={{ fontSize: 11 }}>only against yourself</span>
      </div>

      {empty ? (
        <p className="faint" style={{ fontSize: 13, lineHeight: 1.45, margin: '8px 0 6px' }}>
          {loaded
            ? 'Answer a few questions anywhere — the daily verse, a replay, a race — and every book you touch fills in here.'
            : 'Reading your answers…'}
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, margin: '10px 0 12px' }}>
            <Stat value={`${summary.pct}%`} label="right overall" />
            <Stat
              value={String(summary.books)}
              label={summary.books === 1 ? 'book answered' : 'books answered'}
            />
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {recent.map((s) => (
              <BookRow key={s.book} stat={s} onTap={() => onBook(s.book)} />
            ))}
          </div>
        </>
      )}

      <button
        onClick={onAll}
        style={{
          display: 'block',
          width: '100%',
          marginTop: 8,
          padding: '8px 0 4px',
          border: 0,
          background: 'none',
          color: 'var(--ink-dim)',
          fontSize: 13,
          fontWeight: 700,
          textAlign: 'right',
          cursor: 'pointer',
        }}
      >
        See all reports →
      </button>
    </section>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div
      style={{
        flex: 1,
        padding: '8px 10px',
        borderRadius: 10,
        background: 'var(--card-raised)',
      }}
    >
      <b style={{ display: 'block', fontFamily: 'var(--font-display)', fontSize: 22 }}>{value}</b>
      <span className="faint" style={{ fontSize: 11 }}>{label}</span>
    </div>
  )
}

/** One book, compact: name, tier in words, a thin meter. Tapping drills it —
 *  the same single action the full chart offers. */
function BookRow({ stat, onTap }: { stat: BookStat; onTap: () => void }) {
  const tier = TIERS[tierOf(stat)]
  const pct = accuracyPct(stat)
  return (
    <button
      onClick={onTap}
      aria-label={`${stat.book}, ${pct}% right, ${tier.label}. Drill it`}
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: '4px 10px',
        alignItems: 'center',
        width: '100%',
        padding: '7px 2px',
        border: 0,
        borderTop: '1px solid var(--stroke)',
        background: 'none',
        color: 'var(--ink)',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <b style={{ fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {stat.book}
      </b>
      <span style={{ fontSize: 12, color: tier.color, fontWeight: 700 }}>
        {pct}% · {tier.label}
      </span>
      <span
        aria-hidden
        style={{ gridColumn: '1 / -1', height: 6, borderRadius: 999, background: 'var(--card-raised)', overflow: 'hidden' }}
      >
        <span style={{ display: 'block', height: '100%', width: `${pct}%`, borderRadius: 999, background: tier.color }} />
      </span>
    </button>
  )
}

/** A study tool on the dashboard. Its route is the same one Tabitha opens;
 *  her sheet is still where the stamp and the day's XP happen. */
function ToolCard({ item, onTap }: { item: StudyBook; onTap: () => void }) {
  return (
    <button
      onClick={onTap}
      aria-label={item.badge ? `${item.title}, ${item.badge}` : item.title}
      className="vellum"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        textAlign: 'left',
        padding: '9px 10px',
        borderRadius: 12,
        backgroundColor: 'var(--card-solid)',
        border: '1px solid var(--stroke)',
        cursor: 'pointer',
        color: 'var(--ink)',
        width: '100%',
        minWidth: 0,
      }}
    >
      <Cover item={item} />
      <b style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.25 }}>{item.title}</b>
      {item.badge && <CountBadge>{item.badge}</CountBadge>}
    </button>
  )
}

function CountBadge({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        flexShrink: 0,
        minWidth: 20,
        padding: '1px 6px',
        borderRadius: 999,
        background: 'var(--gold)',
        color: '#3a2200',
        fontSize: 11.5,
        fontWeight: 800,
        textAlign: 'center',
      }}
    >
      {children}
    </span>
  )
}
