import { useEffect, useMemo } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { Page } from '@/components/Page'
import { StudyShelf, type ShelfItem } from './StudyShelf'
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

  useEffect(() => {
    loadDue()
    loadFavorites()
    loadInventory()
    loadPractice()
    loadAccuracy()
    seedGuestInventoryFromCollection()
  }, [loadDue, loadFavorites, loadInventory, loadPractice, loadAccuracy])

  const summary = useMemo(() => summarize(stats), [stats])

  if (params.get('bag') === '1') return <Navigate to="/study/bag" replace />

  // The shelf, in reading order: things to do first, then things to look at.
  // "Keep it" earns its spot only when something is actually due — an empty
  // review book would be a dead tap, and the shelf shouldn't sell those.
  const items: ShelfItem[] = [
    {
      key: 'versus',
      title: 'Battle the CPU',
      emblem: '🤖',
      skin: 'versus',
      caption: 'Race a study partner through a verse quiz',
      to: '/battle/cpu',
    },
    {
      key: 'focus',
      title: 'Focus a book',
      emblem: '🎯',
      skin: 'focus',
      caption: 'Drill one book of your choosing · earns XP',
      to: '/study/focus',
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
    },
    ...(dueRefs.length > 0
      ? [
          {
            key: 'keep',
            title: 'Keep it',
            emblem: '🧠',
            skin: 'keep',
            caption: `${dueRefs.length} verse${dueRefs.length === 1 ? '' : 's'} ready to review — make ${dueRefs.length === 1 ? 'it' : 'them'} stick`,
            to: '/review',
            badge: String(dueRefs.length),
          } satisfies ShelfItem,
        ]
      : []),
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
      <div className="center" style={{ marginBottom: 22 }}>
        <div className="floaty" style={{ fontSize: 44 }}>📚</div>
        <h1 style={{ fontSize: 28, marginTop: 4 }}>Study</h1>
        <p className="dim" style={{ marginTop: 4 }}>
          Pick a book off the shelf — none of it affects your rank.
        </p>
      </div>

      <StudyShelf items={items} />

      <div style={{ height: 90 }} />
    </Page>
  )
}
