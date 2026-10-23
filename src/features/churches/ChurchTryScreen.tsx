import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { TabbedSection } from '@/components/TabbedSection'
import { useJuice } from '@/juice/useJuice'
import { addDays, todayLocalDate } from '@/lib/date'
import { parseReference } from '@/lib/bibleProgress'
import { TodayVerseForm } from '@/features/church/admin/TodayVerseForm'
import { activeThisWeek, liveStreak, OverviewPanel, PeoplePanel } from '@/features/church/admin/InsightsPanel'
import { QuizRunner } from '@/features/daily/QuizRunner'
import { verseFromReference } from '@/data/bible/questions'
import { MissedList } from '@/features/daily/MissedList'
import { memoryVerseBackend, type DayVerse, type InsightMember, type LeaderInsights } from '@/store/churchAdmin'
import type { DailyVerse, PlayResult } from '@/types'

// /churches/try — a pastor uses the REAL leadership tools before their church
// is set up, then plays what they wrote as a member would.
//
// Public, no account, and NOTHING LEAVES THE PAGE:
//   * The week planner and verse form are the same components leadership uses,
//     handed `memoryVerseBackend()` instead of the server. Validation is the
//     same (`cleanQuestions`), so what works here works for real.
//   * The quiz is the real `QuizRunner` with `demo`, which records no accuracy,
//     no Bible mark, no road miles and no drop, and is given no `runId`.
//   * The planner opens on a SAMPLE series — three days of "Abiding (John 15)"
//     from the library, starting in two days, one with a pastor's note — so
//     the series bar, the note mark and the copy panel's "these days already
//     have a verse" list all have something real to show on the first tap.
//     It lives in the same memory backend, so a reload clears it too.
//   * The Overview and People tabs are the REAL leadership panels over an
//     invented congregation (`sampleInsights`), labelled as a sample in their
//     first line, so the demo shows what leadership actually gets since 0128:
//     members by name, exact totals, the quiet ones folded away with a
//     check-in. `PeoplePanel`'s `demo` keeps it from sending anything. No real
//     church's people or numbers are ever shown here.
// A reload forgets everything, which is the point of a demo.
//
// It ends on the inquiry form with the verse they wrote in the message, so the
// first call starts from their sermon.

const DEMO_CHURCH = 'demo'
const DEMO_NAME = 'your church'

// An invented congregation, in join order, as `church_leader_insights` returns
// it: [name, emoji, days since last play (null = never), streak, drops, church
// verses this week]. Plain names, so nobody reads one as a real account.
const SAMPLE_PEOPLE: [string, string, number | null, number, number, number][] = [
  ['pastor_jen', '🙂', 0, 21, 7, 3],
  ['ruth.a', '🌻', 0, 12, 6, 3],
  ['marcus_t', '😄', 1, 5, 4, 2],
  ['the_okafors', '🏡', 0, 9, 5, 3],
  ['grace_l', '🕊️', 2, 0, 3, 1],
  ['sam_youth', '⚡', 0, 3, 3, 2],
  ['eleanor', '📖', 4, 0, 2, 1],
  ['danny.r', '🎸', 1, 2, 2, 1],
  ['hope_w', '🌿', 9, 0, 0, 0],
  ['mike_and_sue', '☕', 15, 0, 0, 0],
  ['tomasz', '🙂', null, 0, 0, 0],
]
const SAMPLE_DAYS = [8, 7, 9, 6, 8, 10, 7, 8, 9, 7, 8, 9, 8, 7]

/** The real panels' input, invented and dated around today. */
function sampleInsights(today: string): LeaderInsights {
  const roster: InsightMember[] = SAMPLE_PEOPLE.map(([username, avatarEmoji, ago, streak, drop7d, church7d], i) => ({
    username,
    avatarEmoji,
    avatarCharacter: null,
    joinedAt: addDays(today, -200 + i * 15),
    streak,
    lastPlayedOn: ago == null ? null : addDays(today, -ago),
    drop7d,
    church7d,
    churchAvg: null,
    leader: i === 0,
  }))
  const live = roster.map((m) => liveStreak(m, today))
  const active7d = roster.filter((m) => activeThisWeek(m, today)).length
  return {
    today,
    members: roster.length,
    active7d,
    quiet: roster.length - active7d,
    days: SAMPLE_DAYS.map((drop, i) => {
      const date = addDays(today, i - 13)
      const scheduled = i >= 11
      return { date, drop, church: scheduled ? Math.max(1, drop - 3) : 0, scheduled }
    }),
    series: [{ series: 'Fruit of the Spirit', starts: addDays(today, -2), ends: addDays(today, 4), days: 7, soFar: 3, plays: 16, players: 7, completion: 48 }],
    streaks: {
      s0: live.filter((n) => n === 0).length,
      s1: live.filter((n) => n === 1).length,
      s2_6: live.filter((n) => n >= 2 && n <= 6).length,
      s7: live.filter((n) => n >= 7).length,
    },
    notice: { message: 'Potluck after the 10:30 service — bring a dish to share!', createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), expiresAt: null },
    roster,
  }
}

function SampleLabel() {
  return (
    <p style={{ margin: '0 0 10px', fontSize: 12.5, fontWeight: 700, color: 'var(--mint)' }}>
      A sample congregation — your own members appear here, by name, once your church is set up.
    </p>
  )
}

const SAMPLE_SERIES = 'Abiding (John 15)'
const SAMPLE_REFS = ['John 15:5', 'John 15:12', 'John 15:13']
const SAMPLE_NOTE = 'Read all of John 15 before Sunday — we pick up at verse 9.'

/** Three library verses on consecutive days from `start`, filed under one series. */
function sampleSeries(start: string): Record<string, DayVerse> {
  const out: Record<string, DayVerse> = {}
  SAMPLE_REFS.forEach((ref, i) => {
    const v = verseFromReference(ref)
    if (!v) return
    out[addDays(start, i)] = {
      reference: v.reference,
      text: v.text,
      questions: v.questions.slice(0, 5),
      series: SAMPLE_SERIES,
      note: i === 0 ? SAMPLE_NOTE : null,
    }
  })
  return out
}

export default function ChurchTryScreen() {
  const navigate = useNavigate()
  const juice = useJuice()
  const today = todayLocalDate()
  // The demo's "Draft" answers from the library (no model call, nothing sent):
  // the real button drafts any passage, so off the library it says that
  // plainly instead of pretending.
  const backend = useMemo(
    () =>
      memoryVerseBackend(sampleSeries(addDays(today, 2)), async (_c, reference) => {
        const v = verseFromReference(reference)
        return v ? { ok: true, data: { questions: v.questions.slice(0, 5) } } : { ok: false, reason: 'demo_library_only' }
      }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const sample = useMemo(() => sampleInsights(today), [today])

  const [saved, setSaved] = useState<DayVerse | null>(null)
  const [phase, setPhase] = useState<'build' | 'play' | 'done'>('build')
  const [result, setResult] = useState<PlayResult | null>(null)
  const [runs, setRuns] = useState(0)

  const verse = useMemo<DailyVerse | null>(() => {
    if (!saved) return null
    const ref = parseReference(saved.reference)
    return {
      dropDate: today,
      translation: 'BSB',
      reference: saved.reference,
      book: ref?.book ?? saved.reference,
      chapter: ref?.chapter ?? 1,
      verseStart: ref?.start ?? 1,
      verseEnd: ref && ref.end !== ref.start ? ref.end : undefined,
      text: saved.text,
      questions: saved.questions,
      facts: [],
    }
  }, [saved, today])

  const toForm = () => {
    juice.select?.()
    const note = saved
      ? `I tried the demo with ${saved.reference} — we'd like to use it for our sermons.`
      : 'I tried the demo.'
    navigate('/churches', { state: { prefill: note } })
  }

  if (phase === 'play' && verse) {
    return (
      <QuizRunner
        key={runs}
        verse={verse}
        demo
        label="⛪ Demo · as your congregation"
        onExit={() => setPhase('build')}
        onComplete={async (r) => {
          setResult(r)
          setPhase('done')
        }}
      />
    )
  }

  if (phase === 'done' && verse && result) {
    return (
      <Page noNav>
        <div className="center" style={{ paddingTop: 20 }}>
          <div style={{ fontSize: 44 }}>⛪</div>
          <h1 style={{ fontSize: 24, margin: '6px 0 4px' }}>That&rsquo;s what your people play.</h1>
          <p className="dim" style={{ margin: '0 auto', maxWidth: 340, fontSize: 14, lineHeight: 1.5 }}>
            {result.correctCount} of {result.totalQuestions} right on {verse.reference}. Every member gets your
            questions, and every wrong answer shows the line you wrote to teach it.
          </p>
        </div>
        <div style={{ marginTop: 16 }}>
          <MissedList questions={verse.questions} result={result} />
        </div>
        <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
          <Button variant="gold" full onClick={toForm}>Want this for your church?</Button>
          <Button variant="secondary" full onClick={() => { juice.select?.(); setRuns((n) => n + 1); setPhase('play') }}>
            Play it again
          </Button>
          <Button variant="ghost" full onClick={() => { juice.select?.(); setPhase('build') }}>
            Back to your week
          </Button>
        </div>
        <p className="faint center" style={{ fontSize: 12, marginTop: 14 }}>
          This was a demo — nothing was saved and nothing was counted.
        </p>
        <div style={{ height: 32 }} />
      </Page>
    )
  }

  const tabs = [
    {
      key: 'verse',
      label: 'Your verse',
      content: (
        <TodayVerseForm
          churchId={DEMO_CHURCH}
          churchName={DEMO_NAME}
          backend={backend}
          onSaved={(_d, v) => setSaved(v)}
        />
      ),
    },
    { key: 'overview', label: 'Overview', content: <><SampleLabel /><OverviewPanel insights={sample} failed={false} summary={null} /></> },
    { key: 'people', label: 'People', content: <><SampleLabel /><PeoplePanel churchId={DEMO_CHURCH} insights={sample} failed={false} demo /></> },
  ]

  return (
    <Page noNav>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <button className="pill" onClick={() => { juice.select?.(); navigate('/churches') }} aria-label="Back">← For Churches</button>
      </div>

      <h1 style={{ fontSize: 24, margin: '0 0 4px' }}>Try it as a pastor</h1>
      <p className="dim" style={{ margin: '0 0 12px', fontSize: 13.5, lineHeight: 1.5 }}>
        These are the real leadership tools. Type the verse you&rsquo;re preaching on — or tap{' '}
        <b>✨ Fill in</b> for one from our library — name the series, save it, then play it the way your
        congregation will. A sample series is already on the calendar so you can see how a run of days
        looks. Nothing here is saved.
      </p>

      {saved && (
        <div className="card" style={{ marginBottom: 12, display: 'grid', gap: 8 }}>
          <b style={{ fontSize: 14 }}>{saved.reference} is set{saved.series ? ` · ${saved.series}` : ''}.</b>
          {saved.note && (
            <p className="dim" style={{ margin: 0, fontSize: 13, lineHeight: 1.45, overflowWrap: 'anywhere' }}>
              Your members see beside it: ✉️ {saved.note}
            </p>
          )}
          <Button variant="gold" full onClick={() => { juice.select?.(); setRuns((n) => n + 1); setPhase('play') }}>
            Play it as your congregation →
          </Button>
        </div>
      )}

      <TabbedSection tabs={tabs} defaultOpen defaultTab="verse" />

      <div style={{ marginTop: 16 }}>
        <Button variant={saved ? 'secondary' : 'ghost'} full onClick={toForm}>Want this for your church?</Button>
      </div>
      <div style={{ height: 32 }} />
    </Page>
  )
}
