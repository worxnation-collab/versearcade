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

import { lazy, Suspense, useState } from 'react'

const VersePost = lazy(() => import('./tiktok/VersePost'))
const StoryPost = lazy(() => import('./tiktok/StoryPost'))
const QuizPost = lazy(() => import('./tiktok/QuizPost'))

type Kind = 'verse' | 'story' | 'quiz'

const POSTS: Array<{ id: Kind; icon: string; name: string; when: string; line: string }> = [
  { id: 'verse', icon: '☀️', name: 'Verse reading', when: 'morning', line: 'Peter reads the day’s verse on the road, the words lighting up as he says them.' },
  { id: 'story', icon: '🌙', name: 'Story time', when: 'evening', line: 'Tabitha tells the story behind it to a circle of children in the library.' },
  { id: 'quiz', icon: '🎮', name: 'Yesterday’s quiz', when: 'replay', line: 'Peter plays yesterday’s five questions against the clock. Viewers play along and see the answers.' },
]

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
