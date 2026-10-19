import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { TabbedSection } from '@/components/TabbedSection'
import { useJuice } from '@/juice/useJuice'
import { todayLocalDate } from '@/lib/date'
import { parseReference } from '@/lib/bibleProgress'
import { TodayVerseForm } from '@/features/church/admin/TodayVerseForm'
import { ParticipationPanel } from '@/features/church/admin/ParticipationPanel'
import { QuizRunner } from '@/features/daily/QuizRunner'
import { MissedList } from '@/features/daily/MissedList'
import { memoryVerseBackend, type DayVerse } from '@/store/churchAdmin'
import type { ChurchParticipation } from '@/types/churchPackages'
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
//   * The Congregation tab shows SAMPLE totals, labelled as such in its first
//     line, with one bucket under five so the floor is visible rather than
//     claimed. No real church's numbers are ever shown here.
// A reload forgets everything, which is the point of a demo.
//
// It ends on the inquiry form with the verse they wrote in the message, so the
// first call starts from their sermon.

const DEMO_CHURCH = 'demo'
const DEMO_NAME = 'your church'

const SAMPLE: ChurchParticipation = {
  days: 14,
  from: '',
  to: '',
  members: 48,
  players: 31,
  plays: 214,
  avg_score: 412,
  pct_played_today: 38,
  streaks: { s1: 9, s2_6: 12, s7: null },
}

export default function ChurchTryScreen() {
  const navigate = useNavigate()
  const juice = useJuice()
  const today = todayLocalDate()
  const backend = useMemo(() => memoryVerseBackend(), [])
  const sample = useMemo<ChurchParticipation>(() => {
    const d = new Date()
    d.setDate(d.getDate() - 13)
    const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { ...SAMPLE, from, to: today }
  }, [today])

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
    { key: 'people', label: 'Congregation', content: <ParticipationPanel churchId={DEMO_CHURCH} sample={sample} /> },
  ]

  return (
    <Page noNav>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <button className="pill" onClick={() => { juice.select?.(); navigate('/churches') }} aria-label="Back">← For Churches</button>
      </div>

      <h1 style={{ fontSize: 24, margin: '0 0 4px' }}>Try it as a pastor</h1>
      <p className="dim" style={{ margin: '0 0 12px', fontSize: 13.5, lineHeight: 1.5 }}>
        These are the real leadership tools. Type the verse you&rsquo;re preaching on — or tap{' '}
        <b>✨ Fill in</b> for one from our library — save it, then play it the way your congregation will.
        Nothing here is saved.
      </p>

      {saved && (
        <div className="card" style={{ marginBottom: 12, display: 'grid', gap: 8 }}>
          <b style={{ fontSize: 14 }}>{saved.reference} is set.</b>
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
