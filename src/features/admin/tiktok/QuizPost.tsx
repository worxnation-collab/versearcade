// The replay post: a CPU player plays YESTERDAY's five questions against the
// clock, and the viewer plays along. See shared.tsx for the split.
//
// Three things are load-bearing:
//  - YESTERDAY, by default and by name. The five questions are the same five
//    for everybody on a date, so a public replay of today's would hand out
//    today's answers. The date row's home button says "Yesterday".
//  - The CPU is the game's own CPU (features/arena/cpu.ts): the same profiles,
//    the same seeded plan, the same scoring. Nothing here invents a player.
//  - The clock runs all the way down on every question. The CPU locks in
//    partway through, but the reveal waits for zero, so a viewer always has
//    the whole window to pick. The window is shorter than the game's 16.5s —
//    a video is not a game, and the game is the payoff at the end.

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/Button'
import { todayLocalDate } from '@/lib/date'
import { SCORING } from '@/lib/config'
import { scoreQuestion } from '@/lib/progress'
import { getVerseForDate } from '@/data/bible/questions'
import { buildCpuPlan, CPU_LEVELS, CPU_PROFILES, type CpuLevel } from '@/features/arena/cpu'
import type { QuizStep } from '@/lib/tiktokRender'
import {
  READERS, SCENES, VOICES,
  autoPick, autoCast, spokenReference, call, addDays, bedFor, useDisplayFont, DateRow, Busy, MadeCard,
  fetchCopy, type Copy, type Made,
} from './shared'

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

// The CPU's play for a date: the game's own plan, mapped onto the video's
// shorter window. A wrong answer picks a wrong OPTION deterministically so the
// same date replays the same way on every device. Points are the game's
// (`scoreQuestion`, with the combo counted as the game counts it), scaled so
// the CPU's speed means the same fraction of the window it would in the app.
function planFor(date: string, level: CpuLevel, windowSec: number, questions: Array<{ answerIndex: number; options: string[] }>): QuizStep[] {
  const steps = buildCpuPlan(hash(date), questions.length, CPU_PROFILES[level])
  let combo = 0
  return questions.map((q, i) => {
    const s = steps[i]
    const frac = s.answerMs / SCORING.answerWindowMs
    const atSec = Math.max(1.2, Math.min(windowSec - 0.6, frac * windowSec))
    const wrong = (hash(`${date}:${i}`) % (q.options.length - 1))
    const pick = s.correct ? q.answerIndex : (wrong >= q.answerIndex ? wrong + 1 : wrong)
    const points = scoreQuestion(s.correct, Math.round(frac * SCORING.answerWindowMs), combo)
    combo = s.correct ? combo + 1 : 0
    return { pick, atSec, points }
  })
}

export default function QuizPost() {
  useDisplayFont()
  const yesterday = addDays(todayLocalDate(), -1)
  const [date, setDate] = useState(yesterday)
  const [level, setLevel] = useState<CpuLevel>('medium')
  const [windowSec, setWindowSec] = useState(12)
  const [player, setPlayer] = useState(() => autoCast(yesterday).reader)
  const [scene, setScene] = useState(() => autoCast(yesterday).scene)
  const [castAuto, setCastAuto] = useState(true)
  const [withVoice, setWithVoice] = useState(true)
  const [voice, setVoice] = useState(() => autoPick(yesterday, autoCast(yesterday).reader).voice)
  const [voiceAuto, setVoiceAuto] = useState(true)
  const [withCopy, setWithCopy] = useState(true)
  const [withMusic, setWithMusic] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [made, setMade] = useState<Made[]>([])
  const [poster, setPoster] = useState<string | null>(null)
  const cancel = useRef(false)

  const verse = getVerseForDate(date)
  const cast = autoCast(date)
  useEffect(() => {
    if (!castAuto) return
    setPlayer(cast.reader)
    setScene(cast.scene)
  }, [castAuto, cast.reader, cast.scene])
  const pick = autoPick(date, player)
  useEffect(() => { if (voiceAuto) setVoice(pick.voice) }, [voiceAuto, pick.voice])
  const playerName = READERS.find((x) => x.id === player)?.name.split(' ')[0] ?? 'Peter'
  const plan = planFor(date, level, windowSec, verse.questions)
  const right = plan.filter((s, i) => s.pick === verse.questions[i].answerIndex).length
  const points = plan.reduce((a, s) => a + s.points, 0)

  // A poster: mid-clock on the first question, with the CPU locked in.
  useEffect(() => {
    let live = true
    setPoster(null)
    ;(async () => {
      try {
        const r = await import('@/lib/tiktokRender')
        const [backdrop, figure] = await Promise.all([r.loadImage(`/road/${scene}.jpg`), r.loadImage(`/skins/${player}.png`)])
        const url = await r.renderQuizPoster({ reference: verse.reference, text: verse.text, questions: verse.questions, plan, windowSec, playerName, figure, backdrop })
        if (live) setPoster(url)
      } catch (e) { if (live) setErr(String((e as Error).message || e)) }
    })()
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, level, windowSec, player, scene])

  async function makeQuiz(d: string): Promise<Made> {
    const v = getVerseForDate(d)
    const c = castAuto ? autoCast(d) : { reader: player, scene }
    const name = READERS.find((x) => x.id === c.reader)?.name.split(' ')[0] ?? 'Peter'
    const steps = planFor(d, level, windowSec, v.questions)
    setProgress(0)
    let audio: ArrayBuffer | undefined
    if (withVoice) {
      // The same reading the morning post makes, so it is usually cached.
      setBusy(`${d}: asking for the reading`)
      const p = voiceAuto ? autoPick(d, c.reader) : { voice, style: autoPick(d, c.reader).style }
      const tts = await call<{ url: string; cached: boolean }>('tts', { date: d, text: `${v.text.trim()} ${spokenReference(v.reference)}.`, voice: p.voice, style: p.style })
      audio = await (await fetch(tts.url + '?v=' + Date.now())).arrayBuffer()
    }
    let copy: Copy | null = null
    if (withCopy) {
      setBusy(`${d}: writing the caption`)
      try { copy = await fetchCopy(d, 'quiz') } catch { copy = null }
    }
    setBusy(`${d}: rendering`)
    const r = await import('@/lib/tiktokRender')
    const [backdrop, figure] = await Promise.all([r.loadImage(`/road/${c.scene}.jpg`), r.loadImage(`/skins/${c.reader}.png`)])
    const base = { reference: v.reference, text: v.text, questions: v.questions, plan: steps, windowSec, playerName: name, figure, backdrop, hook: copy?.hook }
    const tl = r.quizTimeline(audio ? await r.audioSeconds(audio) : null, base)
    const [bed, cues] = await Promise.all([withMusic ? bedFor(tl.total, 'morning') : Promise.resolve(undefined), r.quizCues(tl.events, tl.total)])
    const out = await r.renderQuiz({ ...base, audio, bed, cues, onProgress: (f, label) => { setProgress(f); setBusy(`${d}: ${label}`) } })
    const won = steps.filter((s, i) => s.pick === v.questions[i].answerIndex).length
    return { date: d, kind: 'quiz', reference: v.reference, url: URL.createObjectURL(out.blob), ext: out.ext, size: out.blob.size, copy, phrases: out.phrases, tier: `${name} · ${CPU_PROFILES[level].name} · ${won}/${v.questions.length}` }
  }

  const run = async (dates: string[]) => {
    if (busy) return
    cancel.current = false
    setErr(null)
    try {
      for (const d of dates) {
        if (cancel.current) break
        const m = await makeQuiz(d)
        setMade((xs) => [m, ...xs.filter((x) => x.date !== d)])
      }
    } catch (e) {
      setErr(String((e as Error).message || e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <div className="card" style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
        <DateRow date={date} setDate={setDate} home="Yesterday" homeDate={yesterday}
          right={date >= todayLocalDate() ? <span style={{ fontSize: 11, marginLeft: 'auto', color: 'var(--coral)' }}>this day isn’t over — posting it spoils the drop</span> : undefined} />
        <div>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>{verse.reference}</b>
          <p className="faint" style={{ fontSize: 13, lineHeight: 1.45, marginTop: 4 }}>{verse.text}</p>
        </div>
        <ol style={{ fontSize: 12, lineHeight: 1.4, paddingLeft: 18, margin: 0 }} className="faint">
          {verse.questions.map((q, i) => {
            const s = plan[i]
            const ok = s.pick === q.answerIndex
            return <li key={i}>{q.prompt} <span style={{ color: ok ? 'var(--gold)' : 'var(--coral)' }}>{ok ? `✓ ${q.options[s.pick]} at ${s.atSec.toFixed(0)}s, +${s.points}` : `✗ picks “${q.options[s.pick]}” at ${s.atSec.toFixed(0)}s`}</span></li>
          })}
        </ol>
        {poster && <img src={poster} alt="" style={{ width: 180, borderRadius: 12, justifySelf: 'center' }} />}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label className="faint" style={{ fontSize: 11 }}>Who plays
            <select value={player} onChange={(e) => { setCastAuto(false); setPlayer(e.target.value) }} style={{ width: '100%', marginTop: 4 }}>{READERS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
          </label>
          <label className="faint" style={{ fontSize: 11 }}>Where
            <select value={scene} onChange={(e) => { setCastAuto(false); setScene(e.target.value) }} style={{ width: '100%', marginTop: 4 }}>{SCENES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </label>
          <label className="faint" style={{ fontSize: 11 }}>How good
            <select value={level} onChange={(e) => setLevel(e.target.value as CpuLevel)} style={{ width: '100%', marginTop: 4 }}>
              {CPU_LEVELS.map((l) => <option key={l} value={l}>{CPU_PROFILES[l].emoji} {CPU_PROFILES[l].name} · {Math.round(CPU_PROFILES[l].accuracy * 100)}%</option>)}
            </select>
          </label>
          <label className="faint" style={{ fontSize: 11 }}>Seconds per question (the game gives {SCORING.answerWindowMs / 1000})
            <input type="number" min={6} max={16} step={1} value={windowSec} onChange={(e) => setWindowSec(Math.max(6, Math.min(16, Number(e.target.value) || 12)))} style={{ width: '100%', marginTop: 4 }} />
          </label>
        </div>
        <div className="faint" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{castAuto ? 'Picked' : 'Yours'}: {castAuto ? cast.why : `${READERS.find((x) => x.id === player)?.name} · ${SCENES.find((x) => x.id === scene)?.name}`} — {playerName} gets {right} of {verse.questions.length}, {points} points</span>
          {!castAuto && <button className="pill" style={{ fontSize: 11, marginLeft: 'auto' }} onClick={() => setCastAuto(true)}>↺ Auto</button>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label className="faint" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={withVoice} onChange={(e) => setWithVoice(e.target.checked)} /> read the verse first
          </label>
          <label className="faint" style={{ fontSize: 11 }}>Voice {voiceAuto ? '· auto' : '· yours'}
            <select value={voice} disabled={!withVoice} onChange={(e) => { setVoiceAuto(false); setVoice(e.target.value) }} style={{ width: '100%', marginTop: 4 }}>
              {VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="faint" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={withCopy} onChange={(e) => setWithCopy(e.target.checked)} /> caption too
          </label>
          <label className="faint" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={withMusic} onChange={(e) => setWithMusic(e.target.checked)} /> the road’s music underneath
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="gold" disabled={!!busy} onClick={() => run([date])}>{busy ? 'Working…' : '🎮 Make this replay'}</Button>
          <button className="pill" disabled={!!busy} onClick={() => run(Array.from({ length: 7 }, (_, i) => addDays(date, -i)))}>Last 7 days</button>
          {busy && <button className="pill" onClick={() => { cancel.current = true }}>Stop after this one</button>}
        </div>
        <Busy busy={busy} progress={progress} />
        {err && <p style={{ color: 'var(--coral)', fontSize: 13 }}>{err}</p>}
      </div>

      {made.map((m) => <MadeCard key={m.date} m={m} />)}
    </div>
  )
}
