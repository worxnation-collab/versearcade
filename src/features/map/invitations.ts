import { useEffect } from 'react'
import { useAuth } from '@/store/auth'
import { useGame } from '@/store/game'
import { useCollection } from '@/store/collection'
import { useReviews } from '@/store/reviews'
import { usePrayer } from '@/store/prayer'
import { useLibrary } from '@/store/library'
import { useDailyTrivia } from '@/store/dailyTrivia'
import { useArcadeXp } from '@/store/arcadeXp'
import { useBuddies } from '@/store/buddies'
import { useGifts } from '@/store/gifts'
import { useWashing } from '@/store/washing'
import { usePrayerWall } from '@/store/prayerWall'
import { useAccountLocked } from '@/components/AccountWall'
import { gatheringOpen } from '@/data/gathering'
import { todayLocalDate } from '@/lib/date'

// What is open right now — and, deliberately, NOT a checklist.
//
// The difference is the whole design, so it is written here rather than left to
// be re-derived. A checklist has a denominator: it says 2 of 6, it remembers
// what you skipped, and at the end of a quiet day it tells you that you fell
// short of a target the app set for you. This app does not do those (see the
// review dot, which carries no count; the prayer lamp, which can only ever say
// "today, yes"; the library, which stores a boolean rather than a streak). An
// app whose whole rule is that nobody loses must not open with a scoreboard of
// the things you have not done.
//
// So the shape here is INVITATIONS:
//
// - **Only what is genuinely open.** Nothing appears to say it is finished, so
//   the list gets SHORTER as the day goes on rather than filling with ticks.
//   There is no strikethrough state and nothing to clear.
// - **No count anywhere.** Not "3 open", not "2 of 6", not a ring, not a
//   percentage. `count` fields on these entries would be the first step back to
//   a ladder, and `MapInvite` deliberately has nowhere to put one — the review
//   entry says "some verses want another look" and not how many, for exactly
//   the reason the nav's dot doesn't.
// - **It forgets.** Every source below is a per-day flag that resets at the
//   player's own midnight. Nothing accumulates, nothing is stored about a day
//   that has passed, and skipping one costs nothing you could later see.
// - **Empty is a good state, not a zero.** When there is nothing open the
//   sheet says something warm and points at the arcade, which pays nothing and
//   asks nothing. It never renders "0".
//
// If a future session wants a completion number here, understand it is not a
// tweak to this file: it is the thing four other features in this app were
// deliberately built without.

// ── The first week ──────────────────────────────────────────────────────────
//
// A brand-new player used to get every open door on day one — six rows on a
// screen they had opened for the first time, which is a menu, not an
// invitation. So the rows PACE THEMSELVES over the first days: the verse and
// its chest on day one, trivia the next, then the arcade and praying, then
// Study, then the two gestures toward other people. Clash Royale staggers its
// features by arena for the same reason.
//
// Three things about it are deliberate. It gates INVITATIONS ONLY — every
// door on the map is reachable from the first minute, and a player who finds
// the arcade on day one is welcome in it. It is measured from the day this
// device first ran the panel (`va.firstSeen`), and it stands down entirely for
// anyone with five plays behind them, so a long-time player on a new phone is
// never treated as new. And a row about a PERSON waiting on you (a buddy
// request, the mailbox) is never held back: somebody else is on the other end
// of those.
const FIRST_SEEN_KEY = 'va.firstSeen'
const VETERAN_PLAYS = 5

function daysSinceFirstSeen(): number {
  try {
    const today = todayLocalDate()
    let first = localStorage.getItem(FIRST_SEEN_KEY)
    if (!first) {
      localStorage.setItem(FIRST_SEEN_KEY, today)
      first = today
    }
    const ms = new Date(`${today}T12:00:00`).getTime() - new Date(`${first}T12:00:00`).getTime()
    return Math.max(0, Math.round(ms / 86_400_000))
  } catch {
    return 99
  }
}

/** The day (0-based, from first sight) each invitation starts being made. */
const OPENS_ON: Record<string, number> = {
  verse: 0,
  chest: 0,
  trivia: 1,
  arcade: 2,
  pray: 2,
  library: 3,
  review: 3,
  wash: 4,
  wall: 4,
  gathering: 4,
}

export interface MapInvite {
  id: string
  icon: string
  /** The invitation itself, as a sentence. Never a quantity. */
  label: string
  /** Where it goes. */
  to: string
}

/**
 * Today's open doors, best-first. Reads only stores that are already loaded
 * app-wide or loaded by the effect below — the sheet must not become a burst of
 * network calls every time somebody opens the map.
 */
export function useInvitations(): MapInvite[] {
  const locked = useAccountLocked()
  const profile = useAuth((s) => s.profile)
  const playedToday = useGame((s) => s.playedToday)
  const todayDate = useGame((s) => s.todayDate)
  const chestOpenedOn = useCollection((s) => s.chestOpenedOn)
  const reviewsDue = useReviews((s) => s.dueRefs.length)
  const prayedToday = usePrayer((s) => s.today > 0)
  const borrowedToday = useLibrary((s) => s.borrowedToday)
  const triviaDone = useDailyTrivia((s) => !!s.done[todayDate])
  const paidGames = useArcadeXp((s) => s.paidToday.length)
  const buddyRequests = useBuddies((s) => s.requests.length)
  const unseenGifts = useGifts((s) => s.unseen)
  const online = useAuth((s) => s.mode === 'online')
  const washedSomeoneToday = useWashing((s) => s.today > 0)
  const kneltAtWallToday = usePrayerWall((s) => s.today > 0)
  const wallOpen = usePrayerWall((s) => s.available)
  const totalPlays = useAuth((s) => s.profile?.totalPlays ?? 0)
  const gathering = gatheringOpen()

  // The four day-flags nothing else on a given screen necessarily loads. The
  // three app-wide ones (buddies, gifts, the road) are already pulled in
  // App.tsx, and reviews/game are loaded by the home screen everybody lands on.
  // Guarded on `loaded` so opening the map twice is not two round trips.
  useEffect(() => {
    if (!useCollection.getState().loaded) void useCollection.getState().load()
    if (!usePrayer.getState().loaded) void usePrayer.getState().load()
    if (!useLibrary.getState().loaded) void useLibrary.getState().load()
    if (!useDailyTrivia.getState().loaded) useDailyTrivia.getState().load()
    if (!useArcadeXp.getState().loaded) void useArcadeXp.getState().load()
    if (!useWashing.getState().loaded) void useWashing.getState().load()
    if (!usePrayerWall.getState().loaded) void usePrayerWall.getState().load()
  }, [])

  const out: MapInvite[] = []
  if (!profile) return out
  const day = totalPlays >= VETERAN_PLAYS ? 99 : daysSinceFirstSeen()
  const opens = (id: string) => (OPENS_ON[id] ?? 0) <= day

  // Today's verse first, always — it is the one thing this app is actually for,
  // and every other entry here is something to do around it.
  if (!playedToday) {
    out.push({ id: 'verse', icon: '✦', label: 'Today’s verse is live', to: '/play' })
  } else if (!chestOpenedOn(todayDate)) {
    // Only once the verse is done: that is when the chest unlocks, and an
    // invitation to something still locked is a tease rather than an offer.
    out.push({ id: 'chest', icon: '🎁', label: 'Your chest is waiting to be opened', to: '/play' })
  }

  // The day's trivia round, right behind the verse: it is the Play tab's other
  // box, it is open to a guest (it pays nothing rankable), and it is gone at
  // midnight like everything else here. Deliberately not "you have not done it
  // yet" — it is a round that is available, and it says so.
  if (!triviaDone && opens('trivia')) {
    out.push({ id: 'trivia', icon: '✨', label: 'Today’s trivia round is open', to: '/play/trivia' })
  }

  // Everything past here is walled for a guest who could get an account, and an
  // invitation you cannot accept is worse than no invitation. The MAP still
  // shows these places with their padlocks — that is the pitch — but this panel
  // is about what you can do in the next minute.
  if (!locked) {
    if (reviewsDue > 0 && opens('review')) {
      // No number. "15 verses overdue" is a backlog to feel behind on; the nav
      // dot has said this without a count since it replaced a whole card.
      out.push({ id: 'review', icon: '🧠', label: 'Some kept verses want another look', to: '/review' })
    }
    if (!borrowedToday && opens('library')) {
      // Says what to DO. "Tabitha has a book for you" read as a fact about the
      // librarian, and people went to Study, did something else, and watched
      // the line stay. Any study run now borrows the book (QuizRunner →
      // useLibrary.borrowIfNeeded), so the door and the deed agree.
      out.push({ id: 'library', icon: '📚', label: 'Borrow today’s book from Tabitha', to: '/study' })
    }
    // The Basin. Open until you have knelt for ONE person today — not "until
    // your twelve are done", which would keep the compass lit all day for a
    // thing few people can finish and turn a gift into a quota. Online-only
    // like the gesture itself: a keyless build has nobody's feet to wash.
    if (online && !washedSomeoneToday && opens('wash')) {
      out.push({ id: 'wash', icon: '🪣', label: 'Kneel and wash a friend’s feet', to: '/you' })
    }
    // The wall. Same shape as the Basin's line: open until you have knelt for
    // ONE note today, never "until your twelve are done". Gated on the server
    // actually having the wall (0099), so an older backend never invites it.
    if (online && wallOpen && !kneltAtWallToday && opens('wall')) {
      out.push({ id: 'wall', icon: '🕯️', label: 'Hold a candle for someone at the wall', to: '/pray' })
    }
    // The gathering hour — the one time a day everybody is told to come
    // looking for a live match (data/gathering.ts). Only while it is open, so
    // the row is an invitation to something happening NOW rather than a
    // schedule; and online-only, like the match itself.
    if (online && gathering && opens('gathering')) {
      out.push({ id: 'gathering', icon: '🎲', label: 'It’s the gathering hour — find a live match', to: '/battle/live' })
    }
    if (buddyRequests > 0) {
      out.push({ id: 'buddies', icon: '🤝', label: 'Someone is waiting on you', to: '/you' })
    }
    if (unseenGifts > 0) {
      out.push({ id: 'mail', icon: '📬', label: 'There’s something in your mailbox', to: '/mail' })
    }
  }

  // The two that ask nothing of anybody, last: praying is not a task, and a
  // machine is what is left when everything else is done.
  if (!prayedToday && opens('pray')) {
    out.push({ id: 'pray', icon: '🙏', label: 'Pray, in your own room', to: '/you?pray=1' })
  }
  if (paidGames === 0 && opens('arcade')) {
    out.push({ id: 'arcade', icon: '🕹️', label: 'The arcade is open', to: '/arcade' })
  }

  return out
}
