import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { CountUp } from '@/components/CountUp'
import { FavoriteButton } from '@/components/FavoriteButton'
import { QuizRunner } from '@/features/daily/QuizRunner'
import { MissedList } from '@/features/daily/MissedList'
import { useChurchVerse } from '@/store/churchVerse'
import { SeriesTrail } from './SeriesTrail'
import { ChurchAssetCard } from './ChurchAssetCard'
import { useMyChurchAssets } from '@/store/churchAssets'
import { aboutVerseSeed } from '@/data/cardAbout'
import { parseReference } from '@/lib/bibleProgress'
import type { DailyVerse, PlayResult } from '@/types'
import { LeaderBeside } from './LeaderBeside'

// /play/church — today's verse from YOUR church, as its own run (0128).
//
// It sits beside the global drop rather than replacing it: everybody plays the
// day's shared verse, and a member of a verified church that scheduled one
// also gets this. It runs through `QuizRunner` like every quiz here, carries a
// `runId` so a reload can't re-deal it, and records to `church_verse_plays`
// (which is what the congregation's feed and the leader's dashboard read).
// No XP — see the header in `store/churchVerse.ts`.
export default function ChurchVerseScreen() {
  const navigate = useNavigate()
  const today = useChurchVerse((s) => s.today)
  const series = useChurchVerse((s) => s.series)
  const verseCard = useMyChurchAssets((s) => s.assets.find((a) => a.kind === 'verse_card') ?? null)
  const loadCards = useMyChurchAssets((s) => s.load)
  const loaded = useChurchVerse((s) => s.loaded)
  const load = useChurchVerse((s) => s.load)
  const submit = useChurchVerse((s) => s.submit)
  const [result, setResult] = useState<PlayResult | null>(null)

  useEffect(() => {
    void load()
    void loadCards()
  }, [load, loadCards])

  const verse: DailyVerse | null = useMemo(() => {
    if (!today) return null
    const ref = parseReference(today.reference)
    const seed = aboutVerseSeed(today.reference)
    return {
      dropDate: today.date,
      // `church` set keeps QuizRunner from re-cutting the blanks into another
      // translation: these are the pastor's questions about these words.
      church: { id: today.churchId, name: today.churchName, series: today.series, note: today.note },
      translation: today.churchName,
      reference: today.reference,
      book: ref?.book ?? '',
      chapter: ref?.chapter ?? 0,
      verseStart: ref?.start ?? 0,
      verseEnd: ref && ref.end !== ref.start ? ref.end : undefined,
      text: today.text,
      speaker: seed?.speaker,
      testament: seed?.testament,
      questions: today.questions,
      facts: seed?.facts ?? [],
    }
  }, [today])

  if (!loaded) return <Page noNav><div className="skeleton" style={{ height: 300 }} /></Page>

  if (!today || !verse) {
    return (
      <Page noNav>
        <div className="card center" style={{ marginTop: 24 }}>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>No church verse today</b>
          <p className="dim" style={{ margin: '8px 0 14px', fontSize: 13.5 }}>
            Your church hasn’t set one for today. Today’s drop is still waiting on the Play tab.
          </p>
          <Button variant="secondary" full onClick={() => navigate('/play')}>Back to Play</Button>
        </div>
      </Page>
    )
  }

  // Already played on another visit: show the result card rather than a run.
  const shown = result ?? (today.played ? null : undefined)
  if (shown === undefined) {
    return (
      <QuizRunner
        verse={verse}
        label={`⛪ ${today.churchName}`}
        runId={`church:${today.churchId}:${today.date}`}
        onExit={() => navigate('/play')}
        onComplete={async (r) => {
          await submit(r)
          setResult(r)
        }}
      />
    )
  }

  const score = result?.score ?? today.played?.score ?? 0
  const correct = result?.correctCount ?? today.played?.correct ?? 0
  const total = result?.totalQuestions ?? today.played?.total ?? verse.questions.length
  const p = today.progress
  const arc = series && series.churchId === today.churchId && series.name === today.series ? series : null

  return (
    <Page noNav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <button className="pill" onClick={() => navigate('/play')} aria-label="Done">✕</button>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 18, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {today.churchName}
        </b>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 16 }}
        style={{ textAlign: 'center', margin: '10px 0 16px' }}
      >
        <div style={{ fontSize: 48 }}>⛪</div>
        <p className="dim" style={{ marginTop: 2 }}>You scored</p>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 52, lineHeight: 1 }}>
          <CountUp to={score} duration={1000} className="gradient-text" />
        </div>
        <h1 style={{ fontSize: 20, marginTop: 6 }}>{correct}/{total} on {today.reference}</h1>
        {today.series && p && !arc && (
          <p className="dim" style={{ marginTop: 4 }}>
            Day {p.soFar} of {p.total} · {today.series}
          </p>
        )}
      </motion.div>

      {/* The series as the run it is — today's day joins the ones before it,
          so finishing one reads as a step in something rather than a drop. */}
      {arc && (
        <div className="card" style={{ marginBottom: 12 }}>
          <SeriesTrail series={arc} />
        </div>
      )}

      {result && <MissedList result={result} questions={verse.questions} />}

      {/* The church's approved verse card for today (0133), the keepsake of
          the run — only ever an approved, current card, or nothing. */}
      {verseCard && (
        <div style={{ margin: '12px auto 0', maxWidth: 360 }}>
          <ChurchAssetCard kind="verse_card" templateId={verseCard.templateId} payload={verseCard.payload} />
        </div>
      )}

      <div className="card" style={{ textAlign: 'left', marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 17, flex: 1, minWidth: 0 }}>{today.reference}</b>
          <FavoriteButton reference={today.reference} variant="icon" />
        </div>
        <p style={{ margin: '8px 0 0', lineHeight: 1.55 }}>{today.text}</p>
        {today.note && (
          // The leader who wrote it stands beside it (0146) — or nothing does.
          <div style={{ marginTop: 10 }}>
            <LeaderBeside churchId={today.churchId} size={40}>
              <p className="dim" style={{ margin: 0, paddingLeft: 10, borderLeft: '2px solid var(--edge)', fontSize: 13.5, lineHeight: 1.45 }}>
                {today.note}
              </p>
            </LeaderBeside>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
        <Button variant="secondary" full onClick={() => navigate('/church')}>See what your church is up to</Button>
        <Button variant="ghost" full onClick={() => navigate('/play')}>Back to Play</Button>
      </div>
      <div style={{ height: 24 }} />
    </Page>
  )
}
