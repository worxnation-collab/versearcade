// Admin → TikTok: the daily-post engine's front door.
//
// Five posts a day, each behind its own pill: the verse read over the road
// (morning), a one-question challenge (mid-morning), yesterday's quiz played
// by a CPU against the clock (a replay, at lunch), a second challenge
// (afternoon), and the story behind the verse told in the library (evening).
// Tapping a pill opens THAT generator and nothing else — the forms used to
// share one page, and with the second one it had already become a page you
// scrolled to find anything on. Everything they share lives in
// tiktok/shared.tsx. Two more cards are not generators: a clip the operator
// recorded themselves, captioned and posted through the same door, and the
// week's numbers from every network.
//
// This is an OPERATOR surface (admin-only, online-only, desktop Chrome) and
// never ships in the store build in any meaningful sense: it is behind the
// same three gates as the rest of the dashboard.

import { lazy, Suspense, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { todayLocalDate } from '@/lib/date'
import { getVerseForDate } from '@/data/bible/questions'
import { Button } from '@/components/Button'
import { addDays, call, fetchCopy, publicUrl, CopyBlocks, MadeCard, type Copy, type Made, type Kind, type Platform } from './tiktok/shared'
import { challengeQuestion } from '@/lib/tiktokChallenge'

const VersePost = lazy(() => import('./tiktok/VersePost'))
const StoryPost = lazy(() => import('./tiktok/StoryPost'))
const QuizPost = lazy(() => import('./tiktok/QuizPost'))
const ChallengePost = lazy(() => import('./tiktok/ChallengePost'))
const YourVoice = lazy(() => import('./tiktok/YourVoice'))

// `voice` is not a post kind: it is the operator's recording that changes
// how the VERSE post is made on the days one is parked (tiktok/YourVoice.tsx).
type Door = Kind | 'voice'
const POSTS: Array<{ id: Door; icon: string; name: string; when: string; line: string }> = [
  { id: 'verse', icon: '☀️', name: 'Verse reading', when: 'morning', line: 'The day’s reader stands on a road and reads the verse, the words lighting up as they are said. The hook is the first frame.' },
  { id: 'challenge', icon: '⚡', name: 'Beat the reader', when: 'twice a day', line: 'One of yesterday’s questions, a twelve-second clock, the answer and why. Two a day, different questions, different faces.' },
  { id: 'quiz', icon: '🎮', name: 'Yesterday’s quiz', when: 'replay', line: 'Yesterday’s five questions played against the clock. Viewers play along and see the answers.' },
  { id: 'story', icon: '🌙', name: 'Story time', when: 'evening', line: 'Tabitha tells the story behind it in about a minute, opening on the dramatic moment.' },
  { id: 'voice', icon: '🎙️', name: 'Your voice', when: 'Sunday batch', line: 'Read the verse yourself and say one thing about it. Drafts to read, a slot per day; the morning post uses your recording when there is one.' },
  { id: 'own', icon: '🎤', name: 'Your own clip', when: 'weekly', line: 'A clip you recorded yourself — your face, your voice — captioned for every network and posted through the same door.' },
]
/** The kinds the day's words are written for on their own: everything a generator makes. */
const WORD_KINDS: Kind[] = ['verse', 'challenge', 'quiz', 'challenge2', 'story']
const KIND_LABEL: Record<Kind, string> = { verse: '☀️ Verse', challenge: '⚡ Challenge 1', quiz: '🎮 Quiz', challenge2: '⚡ Challenge 2', story: '🌙 Story', own: '🎤 Own clip', note: '📖 Note' }

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
  const dateFor = (k: Kind) => (k === 'quiz' || k.startsWith('challenge') ? addDays(today, -1) : today)
  const load = async (k: Kind, force = false) => {
    setWords((w) => ({ ...w, [k]: 'loading' }))
    try {
      // A challenge's caption teases its question, so the words need it.
      let question: string | undefined
      if (k.startsWith('challenge')) {
        const { challengeIndex } = await import('./tiktok/make')
        const v = getVerseForDate(dateFor(k))
        question = v.questions[challengeIndex(dateFor(k), k === 'challenge2' ? 2 : 1, v.questions.length)]?.prompt
      }
      const c = await fetchCopy(dateFor(k), k as Made['kind'], force, question ? { question } : {})
      setWords((w) => ({ ...w, [k]: c }))
    } catch (e) { setWords((w) => ({ ...w, [k]: { error: String((e as Error).message || e) } })) }
  }
  useEffect(() => { for (const k of WORD_KINDS) void load(k) }, [today]) // eslint-disable-line react-hooks/exhaustive-deps
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
        {WORD_KINDS.map((k) => (
          <button key={k} className="pill" onClick={() => setOpen(k)} style={{ fontSize: 12, background: open === k ? 'var(--grape)' : 'var(--card)', fontWeight: 800 }}>
            {KIND_LABEL[k]}
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

// A clip the operator recorded themselves. The engine's one job here is the
// part a phone cannot do: write each network's words in the operator's own
// voice from a line about what the clip is, park the file in the bucket and
// post it everywhere through the same `post` action — with the same AI note
// deliberately NOT added, because nothing in it is generated. MP4 only, for
// the reason every other card has: TikTok and Instagram refuse anything else.
function OwnClip() {
  const [date, setDate] = useState(todayLocalDate())
  const [about, setAbout] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [made, setMade] = useState<Made | null>(null)
  const go = async () => {
    if (!file || busy) return
    setErr(null)
    if (!/\.mp4$/i.test(file.name) && file.type !== 'video/mp4') { setErr('An MP4, please — TikTok and Instagram refuse anything else. iPhone: Settings → Camera → Formats → Most Compatible, or export from Photos.'); return }
    setBusy('Writing the caption')
    try {
      const copy = await fetchCopy(date, 'own', true, { about })
      setMade({ date, kind: 'own', reference: getVerseForDate(date).reference, url: URL.createObjectURL(file), ext: 'mp4', size: file.size, copy, phrases: [], tier: 'your clip' })
    } catch (e) { setErr(String((e as Error).message || e)) } finally { setBusy(null) }
  }
  return (
    <div className="card" style={{ display: 'grid', gap: 8, marginTop: 12 }}>
      <b style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>🎤 Your own clip</b>
      <p className="faint" style={{ fontSize: 12, lineHeight: 1.4, margin: 0 }}>
        The one post a painted figure cannot make: you, on camera, once a week. Say in a line what the clip is and the caption is written in your voice for every network; the video is posted as it is, with no AI label, because none of it is generated.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value || todayLocalDate())} style={{ width: 170 }} />
        <input type="file" accept="video/mp4,.mp4" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ fontSize: 12 }} />
      </div>
      <textarea value={about} onChange={(e) => setAbout(e.target.value)} rows={2} placeholder="What’s in it — e.g. why I built this, or a word about this week’s verses" style={{ padding: 8, borderRadius: 10, background: 'var(--card-solid)', color: 'var(--ink)', border: '1px solid var(--stroke)', font: 'inherit', fontSize: 12 }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button variant="gold" disabled={!file || !!busy} onClick={go}>{busy ?? '✍️ Write the caption'}</Button>
        {err && <span style={{ color: 'var(--coral)', fontSize: 12 }}>{err}</span>}
      </div>
      {made && <MadeCard m={made} />}
    </div>
  )
}

// What the last seven days did on every network: views, likes, comments,
// shares, new followers, per platform and per kind. One function call per
// (day, kind), cached six hours server-side, so the button is cheap to press
// twice. Operator numbers about posts elsewhere — nothing here is a player.
type Row = { platform: Platform; views: number | null; likes: number | null; comments: number | null; shares: number | null; watched: number | null; followers: number | null; error: string | null }
function WeekNumbers() {
  const [rows, setRows] = useState<Array<Row & { date: string; kind: Kind }> | null>(null)
  // Sign-ups in the same seven days, by the network their first tracked link
  // named (0106, `?src=` on every posted link). The one column here that is
  // about the app rather than about the posts — and the one goal one is
  // judged by. '' is an account that arrived with no source at all.
  const [signups, setSignups] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const fetchAll = async (force = false) => {
    if (busy) return
    setErr(null)
    const out: Array<Row & { date: string; kind: Kind }> = []
    try {
      setBusy('sign-ups')
      const { data: srcRows } = await supabase!.rpc('admin_signup_sources', { p_days: 7 })
      const map: Record<string, number> = {}
      for (const r of (Array.isArray(srcRows) ? srcRows : []) as Array<{ src?: string; n?: number }>) map[String(r.src ?? '')] = Number(r.n ?? 0)
      setSignups(map)
      for (let i = 1; i <= 7; i++) {
        const date = addDays(todayLocalDate(), -i)
        for (const kind of WORD_KINDS) {
          setBusy(`${date} · ${kind}`)
          const r = await call<{ rows?: Row[] }>('analytics', { date, kind, force })
          for (const row of r.rows ?? []) out.push({ ...row, date, kind })
        }
      }
      setRows(out)
    } catch (e) { setErr(String((e as Error).message || e)) } finally { setBusy(null) }
  }
  const sum = (xs: Array<Row>, k: keyof Row) => xs.reduce((a, r) => a + (typeof r[k] === 'number' ? (r[k] as number) : 0), 0)
  const platforms = rows ? Array.from(new Set(rows.map((r) => r.platform))) : []
  const kinds = rows ? WORD_KINDS.filter((k) => rows.some((r) => r.kind === k)) : []
  const cell = { padding: '3px 8px', textAlign: 'right' as const }
  return (
    <div className="card" style={{ display: 'grid', gap: 8, marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>📈 The last seven days</b>
        <span className="faint" style={{ fontSize: 11 }}>{busy ? `reading ${busy}…` : rows ? `${rows.length} posts` : 'what every network did with the week’s posts'}</span>
        <button className="pill" style={{ fontSize: 11, marginLeft: 'auto' }} disabled={!!busy} onClick={() => fetchAll(!!rows)}>{rows ? '↻ Refresh' : '📈 Fetch'}</button>
      </div>
      {err && <p style={{ color: 'var(--coral)', fontSize: 12, margin: 0 }}>{err}</p>}
      {rows && rows.length > 0 && (
        <div style={{ overflowX: 'auto', fontSize: 12 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr className="faint"><th style={{ ...cell, textAlign: 'left' }}>Network</th><th style={cell}>Posts</th><th style={cell}>Views</th><th style={cell}>Likes</th><th style={cell}>Comments</th><th style={cell}>Shares</th><th style={cell}>New followers</th><th style={{ ...cell, color: 'var(--gold)' }}>Sign-ups</th></tr></thead>
            <tbody>
              {platforms.map((p) => { const xs = rows.filter((r) => r.platform === p); return (
                <tr key={p}><td style={{ ...cell, textAlign: 'left', fontWeight: 700 }}>{p}</td><td style={cell}>{xs.length}</td><td style={cell}>{sum(xs, 'views')}</td><td style={cell}>{sum(xs, 'likes')}</td><td style={cell}>{sum(xs, 'comments')}</td><td style={cell}>{sum(xs, 'shares')}</td><td style={cell}>{sum(xs, 'followers')}</td><td style={{ ...cell, fontWeight: 700 }}>{signups[p] ?? 0}</td></tr>
              ) })}
            </tbody>
          </table>
          <p className="faint" style={{ fontSize: 11, margin: '4px 0 0' }}>
            Sign-ups are accounts made in the last seven days, filed by the first tracked link this device saw (<code>?src=</code>).
            {' '}{signups[''] ?? 0} arrived with no source{Object.entries(signups).filter(([k]) => k && !platforms.includes(k as Platform)).map(([k, n]) => `, ${n} from ${k}`).join('')}.
          </p>
          <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 8 }}>
            <thead><tr className="faint"><th style={{ ...cell, textAlign: 'left' }}>Kind</th><th style={cell}>Posts</th><th style={cell}>Views</th><th style={cell}>Likes</th><th style={cell}>Comments</th><th style={cell}>Shares</th></tr></thead>
            <tbody>
              {kinds.map((k) => { const xs = rows.filter((r) => r.kind === k); return (
                <tr key={k}><td style={{ ...cell, textAlign: 'left', fontWeight: 700 }}>{KIND_LABEL[k]}</td><td style={cell}>{xs.length}</td><td style={cell}>{sum(xs, 'views')}</td><td style={cell}>{sum(xs, 'likes')}</td><td style={cell}>{sum(xs, 'comments')}</td><td style={cell}>{sum(xs, 'shares')}</td></tr>
              ) })}
            </tbody>
          </table>
          {rows.some((r) => r.error) && <p className="faint" style={{ fontSize: 11, marginTop: 6 }}>{rows.filter((r) => r.error).length} posts returned no numbers yet (a scheduled post that hasn’t published, or a network still counting).</p>}
        </div>
      )}
      {rows && rows.length === 0 && <p className="faint" style={{ fontSize: 12, margin: 0 }}>Nothing recorded in the last seven days.</p>}
    </div>
  )
}

// What the account has said back. The challenge posts ask for a comment,
// and the replier (the function's `replies` action, run every couple of
// hours by .github/workflows/tiktok-replies.yml) answers each answer-shaped
// one in one line — whether they got it, the right answer, the teach line.
// This card is every word it has said in the last three days, read straight
// out of the bucket, and a button to run it now. Nothing here names a
// player of the app; these are strangers' comments on other people's
// networks, and the operator should be able to read what was said to them.
type Reply = { platform: string; username?: string; comment: string; reply: string; at: string; status: string; error?: string | null }
function Replies() {
  const [rows, setRows] = useState<Array<Reply & { date: string; kind: Kind }>>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const days = () => [1, 2, 3].map((i) => addDays(todayLocalDate(), -i))
  const load = async () => {
    const out: Array<Reply & { date: string; kind: Kind }> = []
    for (const date of days()) {
      for (const kind of ['challenge', 'challenge2'] as Kind[]) {
        try {
          const r = await fetch(publicUrl(`days/${date}/replies-${kind}.json`) + '?v=' + Date.now(), { cache: 'no-store' })
          if (!r.ok) continue
          const j = (await r.json()) as { replies?: Reply[] }
          for (const x of j.replies ?? []) out.push({ ...x, date, kind })
        } catch { /* no record */ }
      }
    }
    out.sort((a, b) => (a.at < b.at ? 1 : -1))
    setRows(out)
  }
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (dryRun: boolean) => {
    if (busy) return
    setErr(null); setNote(null)
    let added = 0, skipped = 0
    try {
      for (const date of days().slice(0, 2)) {
        for (const [kind, slot] of [['challenge', 1], ['challenge2', 2]] as Array<[Kind, 1 | 2]>) {
          setBusy(`${date} · ${kind}`)
          const q = challengeQuestion(date, slot)
          const r = await call<{ added?: Reply[]; skipped?: unknown[] }>('replies', { date, kind, dryRun, ...q })
          added += r.added?.length ?? 0
          skipped += r.skipped?.length ?? 0
          if (dryRun) for (const x of r.added ?? []) setRows((xs) => [{ ...x, date, kind }, ...xs])
        }
      }
      setNote(`${added} ${dryRun ? 'drafted' : 'replied'}, ${skipped} left alone`)
      if (!dryRun) await load()
    } catch (e) { setErr(String((e as Error).message || e)) } finally { setBusy(null) }
  }
  return (
    <div className="card" style={{ display: 'grid', gap: 8, marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>💬 Replies</b>
        <span className="faint" style={{ fontSize: 11 }}>{busy ? `reading ${busy}…` : note ?? 'what the account said back to answers under the challenges, last three days'}</span>
        <button className="pill" style={{ fontSize: 11, marginLeft: 'auto' }} disabled={!!busy} onClick={() => run(true)}>Draft only</button>
        <button className="pill" style={{ fontSize: 11 }} disabled={!!busy} onClick={() => run(false)}>💬 Reply now</button>
      </div>
      {err && <p style={{ color: 'var(--coral)', fontSize: 12, margin: 0 }}>{err}</p>}
      {rows.length === 0 && !busy && <p className="faint" style={{ fontSize: 12, margin: 0 }}>Nothing replied yet. The cron runs every two hours; "Reply now" runs it here.</p>}
      {rows.slice(0, 40).map((r, i) => (
        <div key={`${r.platform}-${r.at}-${i}`} style={{ fontSize: 12, lineHeight: 1.4, background: 'var(--card)', borderRadius: 10, padding: '6px 10px' }}>
          <div className="faint" style={{ fontSize: 11 }}>{r.platform} · @{r.username || 'someone'} · {r.date} {r.kind === 'challenge2' ? '2nd' : '1st'} · {r.status}{r.error ? ` — ${r.error}` : ''}</div>
          <div>“{r.comment}”</div>
          <div style={{ color: 'var(--gold)' }}>↳ {r.reply}</div>
        </div>
      ))}
    </div>
  )
}

// Which networks Ayrshare has connected, and how much of the month's quota is
// used. A failed lookup renders nothing rather than a warning: the posting
// buttons say what is wrong at the moment it matters.
function SocialStatus() {
  const [s, setS] = useState<{ accounts: Array<{ platform: string; name: string }>; posts: number; quota: number } | null>(null)
  useEffect(() => { call<typeof s>('social', {}).then((x) => setS(x)).catch(() => setS(null)) }, [])
  if (!s) return null
  return (
    <p className="faint" style={{ fontSize: 11, marginTop: 10, lineHeight: 1.5 }}>
      Posting through Ayrshare · {s.accounts.map((a) => `${a.platform} (${a.name})`).join(' · ')} · {s.posts} of {s.quota} posts used this month
      {s.quota > 0 && s.quota < 800 && <span style={{ color: 'var(--coral)' }}> — five videos on five networks is twenty-five a day; this plan will run out</span>}
    </p>
  )
}

export default function TikTokPanel() {
  const [open, setOpen] = useState<Door | null>(null)
  const current = POSTS.find((p) => p.id === open)

  if (!current) {
    return (
      <div>
        <p className="faint" style={{ fontSize: 12, marginBottom: 12, lineHeight: 1.4 }}>
          Five posts a day, 1080×1920, captioned word by word. Needs <code>GEMINI_API_KEY</code> set in Supabase and the <code>tiktok-gen</code> function deployed.
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
        <OwnClip />
        <WeekNumbers />
        <Replies />
        <SocialStatus />
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
        {(open === 'challenge' || open === 'challenge2') && <ChallengePost />}
        {open === 'own' && <OwnClip />}
        {open === 'voice' && <YourVoice />}
      </Suspense>
    </div>
  )
}
