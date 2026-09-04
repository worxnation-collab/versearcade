// Admin → TikTok: the daily-post engine's front door.
//
// Three posts a day, each behind its own pill: the verse read over the road
// (morning), the story behind it told in the library (evening), and yesterday's
// quiz played by a CPU against the clock (a replay). Tapping a pill opens THAT
// generator and nothing else — the three forms used to share one page, and
// with the second one it had already become a page you scrolled to find
// anything on. Everything they share lives in tiktok/shared.tsx.
//
// This is an OPERATOR surface (admin-only, online-only, desktop Chrome) and
// never ships in the store build in any meaningful sense: it is behind the
// same three gates as the rest of the dashboard.

import { lazy, Suspense, useEffect, useState } from 'react'
import { todayLocalDate } from '@/lib/date'
import { getVerseForDate } from '@/data/bible/questions'
import { addDays, fetchCopy, CopyBlocks, type Copy, type Made } from './tiktok/shared'

const VersePost = lazy(() => import('./tiktok/VersePost'))
const StoryPost = lazy(() => import('./tiktok/StoryPost'))
const QuizPost = lazy(() => import('./tiktok/QuizPost'))

type Kind = 'verse' | 'story' | 'quiz'

const POSTS: Array<{ id: Kind; icon: string; name: string; when: string; line: string }> = [
  { id: 'verse', icon: '☀️', name: 'Verse reading', when: 'morning', line: 'Peter reads the day’s verse on the road, the words lighting up as he says them.' },
  { id: 'story', icon: '🌙', name: 'Story time', when: 'evening', line: 'Tabitha tells the story behind it to a circle of children in the library.' },
  { id: 'quiz', icon: '🎮', name: 'Yesterday’s quiz', when: 'replay', line: 'Peter plays yesterday’s five questions against the clock. Viewers play along and see the answers.' },
]

// The day's words, without a video. The copy for each post is written once
// per date (cached by the function), so this card shows all three sets for
// today — the quiz's for yesterday, since that is the day it replays — and
// swaps them at midnight on its own: a minute-timer watches the local date
// and refetches when it turns. Nothing here needs a render to have happened.
function TodaysWords() {
  const [today, setToday] = useState(todayLocalDate())
  const [words, setWords] = useState<Partial<Record<Kind, Copy | 'loading' | { error: string }>>>({})
  useEffect(() => {
    const t = setInterval(() => { const d = todayLocalDate(); if (d !== today) setToday(d) }, 60_000)
    return () => clearInterval(t)
  }, [today])
  const dateFor = (k: Kind) => (k === 'quiz' ? addDays(today, -1) : today)
  const load = async (k: Kind, force = false) => {
    setWords((w) => ({ ...w, [k]: 'loading' }))
    try { const c = await fetchCopy(dateFor(k), k as Made['kind'], force); setWords((w) => ({ ...w, [k]: c })) }
    catch (e) { setWords((w) => ({ ...w, [k]: { error: String((e as Error).message || e) } })) }
  }
  useEffect(() => { for (const p of POSTS) void load(p.id) }, [today]) // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = useState<Kind>('verse')
  const cur = words[open]
  return (
    <div className="card" style={{ display: 'grid', gap: 8, marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>Today’s words</b>
        <span className="faint" style={{ fontSize: 11 }}>{today} · changes at midnight</span>
        <button className="pill" style={{ fontSize: 11, marginLeft: 'auto' }} disabled={cur === 'loading'} onClick={() => load(open, true)}>↻ Rewrite</button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {POSTS.map((p) => (
          <button key={p.id} className="pill" onClick={() => setOpen(p.id)} style={{ fontSize: 12, background: open === p.id ? 'var(--grape)' : 'var(--card)', fontWeight: 800 }}>
            {p.icon} {p.name}
          </button>
        ))}
      </div>
      <div className="faint" style={{ fontSize: 12 }}>{dateFor(open)} · {getVerseForDate(dateFor(open)).reference}</div>
      {!cur || cur === 'loading'
        ? <p className="faint" style={{ fontSize: 12 }}>Writing…</p>
        : 'error' in cur
          ? <p style={{ color: 'var(--coral)', fontSize: 13 }}>{cur.error}</p>
          : <CopyBlocks copy={cur} />}
    </div>
  )
}

export default function TikTokPanel() {
  const [open, setOpen] = useState<Kind | null>(null)
  const current = POSTS.find((p) => p.id === open)

  if (!current) {
    return (
      <div>
        <p className="faint" style={{ fontSize: 12, marginBottom: 12, lineHeight: 1.4 }}>
          One post a day in each shape, 1080×1920, captioned word by word. Needs <code>GEMINI_API_KEY</code> set in Supabase and the <code>tiktok-gen</code> function deployed.
          Use desktop Chrome — the video is encoded in this tab.
        </p>
        <div style={{ display: 'grid', gap: 10 }}>
          {POSTS.map((p) => (
            <button key={p.id} className="card" onClick={() => setOpen(p.id)}
              style={{ textAlign: 'left', cursor: 'pointer', display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center', border: '1px solid var(--stroke)' }}>
              <span style={{ fontSize: 28 }}>{p.icon}</span>
              <span>
                <b style={{ fontFamily: 'var(--font-display)', fontSize: 16, display: 'block' }}>{p.name}</b>
                <span className="faint" style={{ fontSize: 12, lineHeight: 1.4 }}>{p.line}</span>
              </span>
              <span className="pill" style={{ fontSize: 11 }}>{p.when} →</span>
            </button>
          ))}
        </div>
        <TodaysWords />
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <button className="pill" style={{ fontSize: 12 }} onClick={() => setOpen(null)}>← All posts</button>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>{current.icon} {current.name}</b>
        <span className="faint" style={{ fontSize: 11 }}>{current.line}</span>
      </div>
      <Suspense fallback={<p className="faint" style={{ fontSize: 12 }}>Opening…</p>}>
        {open === 'verse' && <VersePost />}
        {open === 'story' && <StoryPost />}
        {open === 'quiz' && <QuizPost />}
      </Suspense>
    </div>
  )
}
