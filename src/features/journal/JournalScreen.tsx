import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { useAuth } from '@/store/auth'
import { useBible } from '@/store/bible'
import { useCollection } from '@/store/collection'
import { useKeep } from '@/store/keep'
import { useWashing } from '@/store/washing'
import { useJuice } from '@/juice/useJuice'
import { roomProgress } from '@/lib/roomProgress'
import { ownedFurnishings } from '@/data/room'
import {
  JOURNAL,
  nextRung,
  rungsPassed,
  totalPassed,
  totalRungs,
  type JournalNumbers,
} from '@/data/journal'

// The Journal — what you have done, on one page.
//
// See data/journal.ts for why this is safe to have at all: every rung is a
// number you passed, never a place you hold. Nothing here compares you to
// anybody, nothing expires, and the whole page is derived from numbers the app
// already keeps — there is no journal table and nothing to grant.
//
// The one number at the top is rungs passed out of rungs that exist. It is a
// completion count of YOUR OWN ladder, which is the only kind of total this app
// is allowed to show.

export default function JournalScreen() {
  const navigate = useNavigate()
  const juice = useJuice()
  const profile = useAuth((s) => s.profile)

  // Every store a rung reads from. Loading only some of them would quietly
  // report 0 on those tracks and tell the player they had done nothing — the
  // same trap lib/petProgress.ts documents, and the reason it is worth doing
  // all five here rather than trusting whatever happened to be warm.
  useEffect(() => {
    if (!useBible.getState().loaded) void useBible.getState().load()
    if (!useCollection.getState().loaded) void useCollection.getState().load()
    if (!useKeep.getState().loaded) void useKeep.getState().load()
    void useWashing.getState().load()
  }, [])

  const studied = useBible((s) => Object.keys(s.studied).length)
  const chapters = useBible((s) => Object.keys(s.chapters).length)
  const cards = useCollection((s) => s.owned.length)
  const battles = useKeep((s) => s.counters.battle_played + s.counters.cpu_played)
  const washed = useWashing((s) => s.lifetime)

  if (!profile) return null

  const numbers: JournalNumbers = {
    days: profile.totalPlays,
    streak: profile.longestStreak,
    level: profile.level,
    study: studied,
    reading: chapters,
    collection: cards,
    room: ownedFurnishings(roomProgress()).length,
    battles,
    washing: washed,
  }

  const passed = totalPassed(numbers)

  return (
    <Page>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <h2 style={{ fontSize: 24, margin: 0 }}>📔 Journal</h2>
        <div style={{ flex: 1 }} />
        <button
          className="pill"
          onClick={() => { juice.select(); navigate(-1) }}
          style={{ fontSize: 13, fontWeight: 800, padding: '7px 14px' }}
        >
          Back
        </button>
      </div>

      <p className="faint" style={{ fontSize: 12.5, margin: '0 0 16px', lineHeight: 1.55 }}>
        <b style={{ color: 'var(--gold)', fontFamily: 'var(--font-display)', fontSize: 15 }}>
          {passed}
        </b>{' '}
        of {totalRungs()} marks. Every one of them is a number you passed — nothing here is a
        place you hold, nothing runs out, and none of it is anybody else&rsquo;s business.
      </p>

      {JOURNAL.map((track) => {
        const n = numbers[track.id] ?? 0
        const done = rungsPassed(track, n)
        const next = nextRung(track, n)
        const top = track.rungs[track.rungs.length - 1].goal
        return (
          <div className="card" key={track.id} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 18 }}>{track.icon}</span>
              <b style={{ fontFamily: 'var(--font-display)', fontSize: 15, flex: 1, minWidth: 0 }}>
                {track.title}
              </b>
              <span className="faint" style={{ fontSize: 12 }}>
                {n.toLocaleString()} {track.unit}
              </span>
            </div>

            {/* The rungs themselves. Passed ones are gold and named; the one
                being climbed says what it needs; the rest stay visible and
                dimmed, because a hidden goal is one nobody is working toward. */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {track.rungs.map((r) => {
                const hit = n >= r.goal
                return (
                  <span
                    key={r.goal}
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      padding: '5px 9px',
                      borderRadius: 999,
                      border: `1px solid ${hit ? 'var(--gold)' : 'var(--stroke)'}`,
                      color: hit ? 'var(--gold)' : 'var(--ink-dim)',
                      background: hit ? 'rgba(255,210,63,0.10)' : 'transparent',
                      opacity: hit ? 1 : 0.6,
                    }}
                  >
                    {hit ? '✓ ' : ''}
                    {r.name}
                  </span>
                )
              })}
            </div>

            <div style={{ height: 6, borderRadius: 999, background: 'rgba(0,0,0,0.3)', overflow: 'hidden', marginTop: 10 }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(n / top, 1) * 100}%`,
                  borderRadius: 999,
                  background: 'linear-gradient(90deg, var(--gold), var(--tangerine))',
                  transition: 'width 0.3s',
                }}
              />
            </div>

            <p className="faint" style={{ fontSize: 11.5, margin: '8px 0 0', lineHeight: 1.5 }}>
              {next
                ? `${(next.goal - n).toLocaleString()} more and that's ${next.name}.`
                : `${done}/${track.rungs.length} — the whole track.`}
            </p>
          </div>
        )
      })}

      <div style={{ marginTop: 14 }}>
        <Button variant="secondary" full onClick={() => { juice.select(); navigate('/you') }}>
          Back to you
        </Button>
      </div>
    </Page>
  )
}
