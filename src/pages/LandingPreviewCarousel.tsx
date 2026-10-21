import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, type PanInfo } from 'framer-motion'
import { Character } from '@/components/Character'
import { ChurchArt } from '@/features/church/ChurchArt'
import { Icon, type IconId } from '@/data/icons'
import { DEFAULT_AVATAR } from '@/data/avatar'
import { getVerseForDate } from '@/data/bible/questions'
import { todayLocalDate } from '@/lib/date'
import { useSettings } from '@/store/settings'
import type { AvatarSpec } from '@/types'

// The front door's "what is inside" — five slides drawn with the app's REAL
// components (today's actual verse, the starter characters, a church building)
// rather than screenshots, so the preview can never drift from the app it
// describes. Auto-advances, swipes, pauses on touch, and holds still under
// reduce-motion.
//
// Nothing here carries a score or a rank: a preview that showed "you vs. them,
// 576 to 197" would be selling the comparison this app refuses.

const ADVANCE_MS = 4200

const CAST: AvatarSpec[] = [
  DEFAULT_AVATAR,
  { ...DEFAULT_AVATAR, figure: 'fem', skin: 'bronze', hair: 'jet' },
  { ...DEFAULT_AVATAR, figure: 'fem', skin: 'porcelain', hair: 'auburn' },
  { ...DEFAULT_AVATAR, figure: 'masc', skin: 'ebony', hair: 'jet' },
]

type Slide = { id: string; icon: IconId; title: string; line: string; art: ReactNode }

export function LandingPreviewCarousel() {
  const reduceMotion = useSettings((s) => s.reduceMotion)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const dir = useRef(1)

  const verse = useMemo(() => {
    try {
      return getVerseForDate(todayLocalDate())
    } catch {
      return null
    }
  }, [])

  const slides: Slide[] = useMemo(
    () => [
      {
        id: 'verse',
        icon: 'verse',
        title: 'One verse a day',
        line: 'The same drop for everyone. Read it, then five quick questions.',
        art: <VerseArt text={verse?.text} reference={verse?.reference} />,
      },
      {
        id: 'you',
        icon: 'you',
        title: 'A character that’s you',
        line: 'Made in a few taps. It walks the road, the hall and the churchyard.',
        art: (
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 0 }}>
            {CAST.slice(0, 3).map((spec, i) => (
              <div key={i} style={{ transform: i === 1 ? 'translateY(-4px)' : undefined }}>
                <Character spec={spec} size={i === 1 ? 160 : 136} fullBody />
              </div>
            ))}
          </div>
        ),
      },
      {
        id: 'battle',
        icon: 'battle',
        title: 'Race a friend',
        line: 'Same verse, same clock. Win or lose, you both learn it.',
        art: (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
            <Character spec={CAST[0]} size={140} fullBody />
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 22,
                fontWeight: 800,
                color: 'var(--gold)',
              }}
            >
              vs
            </span>
            <div style={{ transform: 'scaleX(-1)' }}>
              <Character spec={CAST[1]} size={140} fullBody />
            </div>
          </div>
        ),
      },
      {
        id: 'study',
        icon: 'study',
        title: 'Study what sticks',
        line: 'Drills, replays and trivia — see which books you know best.',
        art: <StudyArt />,
      },
      {
        id: 'church',
        icon: 'church',
        title: 'Play for your church',
        line: 'Every verse you play helps your congregation’s building grow.',
        art: <ChurchArt level={9} size={200} />,
      },
    ],
    [verse],
  )

  const go = (next: number) => {
    const n = slides.length
    dir.current = next > index || (index === n - 1 && next === 0) ? 1 : -1
    setIndex(((next % n) + n) % n)
  }

  useEffect(() => {
    if (reduceMotion || paused) return
    const t = window.setTimeout(() => {
      dir.current = 1
      setIndex((i) => (i + 1) % slides.length)
    }, ADVANCE_MS)
    return () => window.clearTimeout(t)
  }, [index, paused, reduceMotion, slides.length])

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -40 || info.velocity.x < -300) go(index + 1)
    else if (info.offset.x > 40 || info.velocity.x > 300) go(index - 1)
  }

  const slide = slides[index]

  return (
    <section
      aria-roledescription="carousel"
      aria-label="What’s inside Verse Arcade"
      style={{ width: '100%', maxWidth: 380, marginInline: 'auto' }}
      onPointerDown={() => setPaused(true)}
      onPointerUp={() => setPaused(false)}
      onPointerCancel={() => setPaused(false)}
    >
      <div
        className="card"
        style={{ position: 'relative', overflow: 'hidden', padding: 0, height: 262, touchAction: 'pan-y' }}
      >
        <AnimatePresence initial={false} custom={dir.current} mode="popLayout">
          <motion.div
            key={slide.id}
            custom={dir.current}
            variants={{
              enter: (d: number) => ({ x: reduceMotion ? 0 : d * 60, opacity: 0 }),
              center: { x: 0, opacity: 1 },
              exit: (d: number) => ({ x: reduceMotion ? 0 : d * -60, opacity: 0 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.25}
            onDragEnd={onDragEnd}
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${slides.length}: ${slide.title}`}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              cursor: 'grab',
            }}
          >
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '14px 16px 0',
                pointerEvents: 'none',
              }}
            >
              {slide.art}
            </div>
            <div style={{ padding: '10px 18px 16px', textAlign: 'center' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontFamily: 'var(--font-display)',
                  fontSize: 18,
                  fontWeight: 800,
                }}
              >
                <Icon id={slide.icon} size={18} style={{ color: 'var(--gold)' }} />
                {slide.title}
              </div>
              <p className="dim" style={{ fontSize: 13.5, lineHeight: 1.4, marginTop: 3 }}>
                {slide.line}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 2, marginTop: 8 }}>
        {slides.map((s, i) => (
          <button
            key={s.id}
            onClick={() => go(i)}
            aria-label={`Show ${s.title}`}
            aria-current={i === index}
            style={{
              // A 24px target around an 8px dot — the dot is the look, the
              // padding is for thumbs.
              padding: 8,
              background: 'none',
              border: 0,
              cursor: 'pointer',
              lineHeight: 0,
            }}
          >
            <motion.span
              animate={{ width: i === index ? 20 : 8, opacity: i === index ? 1 : 0.4 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              style={{
                display: 'block',
                height: 8,
                borderRadius: 'var(--r-pill)',
                background: i === index ? 'var(--gold)' : 'var(--ink-faint)',
              }}
            />
          </button>
        ))}
      </div>
    </section>
  )
}

function VerseArt({ text, reference }: { text?: string; reference?: string }) {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: 300,
        background: 'var(--card-raised)',
        borderRadius: 'var(--r-md)',
        padding: '14px 16px',
        boxShadow: 'var(--lit-edge)',
      }}
    >
      <div
        className="faint"
        style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}
      >
        Today’s verse
      </div>
      <p
        style={{
          fontSize: 14.5,
          lineHeight: 1.4,
          marginTop: 6,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        “{text ?? 'Your word is a lamp to my feet and a light to my path.'}”
      </p>
      <div style={{ color: 'var(--gold)', fontWeight: 800, fontSize: 13, marginTop: 6 }}>
        {reference ?? 'Psalm 119:105'}
      </div>
    </div>
  )
}

// Illustrative bars only — no numbers, no axis. It shows the SHAPE of the
// Study chart (mint / gold / coral, the colourblind-checked trio), not anybody's
// results.
function StudyArt() {
  const rows: { book: string; pct: number; color: string }[] = [
    { book: 'Psalms', pct: 0.86, color: 'var(--mint)' },
    { book: 'John', pct: 0.68, color: 'var(--mint)' },
    { book: 'Genesis', pct: 0.52, color: 'var(--gold)' },
    { book: 'Romans', pct: 0.34, color: 'var(--coral)' },
  ]
  return (
    <div style={{ width: '100%', maxWidth: 280, display: 'grid', gap: 9 }}>
      {rows.map((r, i) => (
        <div key={r.book} style={{ display: 'grid', gridTemplateColumns: '64px 1fr', alignItems: 'center', gap: 10 }}>
          <span className="dim" style={{ fontSize: 12.5, fontWeight: 700, textAlign: 'right' }}>
            {r.book}
          </span>
          <div style={{ height: 12, borderRadius: 'var(--r-pill)', background: 'var(--card-sunken)', overflow: 'hidden' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${r.pct * 100}%` }}
              transition={{ delay: 0.15 + i * 0.08, type: 'spring', stiffness: 120, damping: 20 }}
              style={{ height: '100%', borderRadius: 'var(--r-pill)', background: r.color }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
