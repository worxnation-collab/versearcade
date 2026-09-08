import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BookHeader, BookPage } from './BookPage'
import { PaperCard } from './tiers'
import { PAPER } from './paper'
import { useBibleMarks } from './useBibleMarks'
import { useJuice } from '@/juice/useJuice'
import { Seal } from '@/components/Seal'
import {
  DIVISIONS,
  chaptersOpened,
  chaptersReadIn,
  nearestSeal,
  sealPressed,
  sealsIn,
} from '@/data/seals'
import { READING_COSMETICS } from '@/data/cosmetics'

// The Book Collection — 66 seals, one per book, pressed when you finish reading
// one. See the header in data/seals.ts for why it is derived and what keeps it
// inside the no-losers rule.
//
// The page shows what you HAVE and one thing within reach. It deliberately does
// not draw a bar for the whole 66: a denominator you will be under for years is
// the one shape this app doesn't put in front of anybody, which is the same
// call `built` made when the Cross Word stopped counting to fifty-two.
export default function SealsScreen() {
  const navigate = useNavigate()
  const juice = useJuice()
  const { marks } = useBibleMarks()
  const chapters = marks.chapters

  const pressedCount = useMemo(
    () => DIVISIONS.reduce((n, d) => n + sealsIn(d.id).filter((s) => sealPressed(s.book, chapters)).length, 0),
    [chapters],
  )
  const opened = chaptersOpened(chapters)
  const near = useMemo(() => nearestSeal(chapters), [chapters])
  const nextCosmetic = READING_COSMETICS.find((c) => opened < c.chapters)

  return (
    <BookPage
      header={
        <BookHeader
          onBack={() => navigate('/bible')}
          backLabel="Back to my Bible"
          title="Seals"
          note={pressedCount > 0 ? `${pressedCount} pressed` : undefined}
        />
      }
    >
      <PaperCard>
        <p style={{ fontSize: 13, lineHeight: 1.55, color: PAPER.inkDim, margin: 0 }}>
          Read every chapter of a book and its seal is pressed here, for good. Nothing about
          this is scored or shown to anybody — it’s the record of where you’ve read.
        </p>
        {near && (
          <p style={{ fontSize: 12.5, marginTop: 10, color: PAPER.ink }}>
            <b style={{ fontFamily: 'var(--font-display)' }}>{near.seal.book}</b> is closest —{' '}
            {near.seal.chapters - near.read} chapter
            {near.seal.chapters - near.read === 1 ? '' : 's'} to go.
          </p>
        )}
        {nextCosmetic && (
          <p style={{ fontSize: 12, marginTop: 8, color: PAPER.inkFaint, lineHeight: 1.5 }}>
            {opened.toLocaleString()} chapter{opened === 1 ? '' : 's'} opened. The{' '}
            {nextCosmetic.name} {nextCosmetic.kind} comes at {nextCosmetic.chapters.toLocaleString()}.
          </p>
        )}
      </PaperCard>

      {DIVISIONS.map((d) => {
        const seals = sealsIn(d.id)
        const got = seals.filter((s) => sealPressed(s.book, chapters)).length
        return (
          <section key={d.id} style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <b style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: PAPER.ink }}>{d.name}</b>
              <span style={{ fontSize: 11, color: PAPER.inkFaint }}>{d.blurb}</span>
              {got > 0 && (
                <span style={{ fontSize: 11, marginLeft: 'auto', color: PAPER.inkDim }}>
                  {got} pressed
                </span>
              )}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(58px, 1fr))',
                gap: 10,
                marginTop: 10,
              }}
            >
              {seals.map((s, i) => {
                const pressed = sealPressed(s.book, chapters)
                const read = chaptersReadIn(s.book, chapters)
                return (
                  <motion.button
                    key={s.book}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: Math.min(0.012 * i, 0.2), type: 'spring', stiffness: 320, damping: 24 }}
                    onClick={() => { juice.select(); navigate(`/bible/${encodeURIComponent(s.book)}`) }}
                    title={
                      pressed
                        ? `${s.book} — sealed`
                        : `${s.book} — ${read} of ${s.chapters} chapter${s.chapters === 1 ? '' : 's'} opened`
                    }
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                      padding: '6px 2px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: PAPER.ink,
                      minWidth: 0,
                    }}
                  >
                    <Seal seal={s} pressed={pressed} size={40} />
                    <span
                      style={{
                        fontSize: 9.5,
                        lineHeight: 1.2,
                        textAlign: 'center',
                        color: pressed ? PAPER.inkDim : PAPER.inkFaint,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '100%',
                      }}
                    >
                      {s.book}
                    </span>
                  </motion.button>
                )
              })}
            </div>
          </section>
        )
      })}

      <p style={{ fontSize: 11, marginTop: 22, lineHeight: 1.5, textAlign: 'center', color: PAPER.inkFaint }}>
        Seals are yours alone — never ranked, never compared, and never taken back.
      </p>
    </BookPage>
  )
}
