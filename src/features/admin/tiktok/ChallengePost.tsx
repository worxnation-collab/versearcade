// The one-question challenge: "Can you beat Peter?" — ONE of yesterday's
// five questions, the clock, the reveal with its teach line, and an ask to
// comment. About twenty seconds. See make.ts (makeChallenge) for the shape
// and shared.tsx for the split.
//
// Two a day, on purpose: the first at mid-morning and the second in the
// afternoon, each a different question (two apart in the day's five) played
// by a different face on a different road, so the second is a second post
// rather than the first one again. Both are about YESTERDAY's verse for the
// replay's reason — today's answers on a public feed would spoil the drop.

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/Button'
import { todayLocalDate } from '@/lib/date'
import { getVerseForDate } from '@/data/bible/questions'
import { CPU_LEVELS, CPU_PROFILES, type CpuLevel } from '@/features/arena/cpu'
import { makeChallenge, challengeIndex, quizPlan } from './make'
import {
  READERS, SCENES, VOICES,
  autoPick, challengeCast, addDays, loadScene, useDisplayFont, DateRow, Busy, MadeCard,
  type Made,
} from './shared'

export default function ChallengePost() {
  useDisplayFont()
  const yesterday = addDays(todayLocalDate(), -1)
  const [date, setDate] = useState(yesterday)
  const [slot, setSlot] = useState<1 | 2>(1)
  const [level, setLevel] = useState<CpuLevel>('medium')
  const [windowSec, setWindowSec] = useState(12)
  const [player, setPlayer] = useState(() => challengeCast(yesterday, 1).reader)
  const [scene, setScene] = useState(() => challengeCast(yesterday, 1).scene)
  const [castAuto, setCastAuto] = useState(true)
  const [withVoice, setWithVoice] = useState(true)
  const [voice, setVoice] = useState(() => autoPick(yesterday, challengeCast(yesterday, 1).reader).voice)
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
  const cast = challengeCast(date, slot)
  useEffect(() => {
    if (!castAuto) return
    setPlayer(cast.reader)
    setScene(cast.scene)
  }, [castAuto, cast.reader, cast.scene])
  const pick = autoPick(date, player)
  useEffect(() => { if (voiceAuto) setVoice(pick.voice) }, [voiceAuto, pick.voice])
  const playerName = READERS.find((x) => x.id === player)?.name.split(' ')[0] ?? 'Peter'
  const qi = challengeIndex(date, slot, verse.questions.length)
  const q = verse.questions[qi]
  const step = quizPlan(date, level, windowSec, verse.questions)[qi]
  const right = step.pick === q.answerIndex

  useEffect(() => {
    let live = true
    setPoster(null)
    ;(async () => {
      try {
        const r = await import('@/lib/tiktokRender')
        const [backdrop, figure] = await Promise.all([loadScene(r, scene), r.loadImage(`/skins/${player}.png`)])
        const url = await r.renderQuizPoster({ reference: verse.reference, text: verse.text, questions: [q], plan: [step], windowSec, playerName, figure, backdrop, solo: true }, 0.4)
        if (live) setPoster(url)
      } catch (e) { if (live) setErr(String((e as Error).message || e)) }
    })()
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, slot, level, windowSec, player, scene])

  async function make(d: string): Promise<Made> {
    setProgress(0)
    return makeChallenge(d, {
      slot, level, windowSec,
      cast: castAuto ? undefined : { reader: player, scene },
      voice: withVoice, voiceName: voiceAuto ? undefined : voice,
      copy: withCopy, music: withMusic,
    }, (f, label) => { setProgress(f); setBusy(`${d}: ${label}`) })
  }

  const run = async (dates: string[]) => {
    if (busy) return
    cancel.current = false
    setErr(null)
    try {
      for (const d of dates) {
        if (cancel.current) break
        const m = await make(d)
        setMade((xs) => [m, ...xs.filter((x) => !(x.date === d && x.kind === m.kind))])
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
        <div style={{ display: 'flex', gap: 6 }}>
          {([1, 2] as const).map((s) => (
            <button key={s} className="pill" onClick={() => setSlot(s)} style={{ fontSize: 12, background: slot === s ? 'var(--grape)' : 'var(--card)', fontWeight: 800 }}>
              {s === 1 ? '⚡ First of the day' : '⚡ Second of the day'}
            </button>
          ))}
        </div>
        <div>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>{verse.reference}</b>
          <p style={{ fontSize: 14, lineHeight: 1.45, marginTop: 6, fontWeight: 700 }}>{q.prompt}</p>
          <ol type="A" style={{ fontSize: 12, lineHeight: 1.4, paddingLeft: 22, margin: '4px 0 0' }} className="faint">
            {q.options.map((o, i) => <li key={i} style={{ color: i === q.answerIndex ? 'var(--gold)' : undefined }}>{o}{i === step.pick ? ` ← ${playerName} at ${step.atSec.toFixed(0)}s` : ''}</li>)}
          </ol>
          <p className="faint" style={{ fontSize: 11, marginTop: 4 }}>Teach: {q.teach}</p>
        </div>
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
          <label className="faint" style={{ fontSize: 11 }}>Seconds on the clock
            <input type="number" min={8} max={16} step={1} value={windowSec} onChange={(e) => setWindowSec(Math.max(8, Math.min(16, Number(e.target.value) || 12)))} style={{ width: '100%', marginTop: 4 }} />
          </label>
        </div>
        <div className="faint" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{castAuto ? 'Picked' : 'Yours'}: {READERS.find((x) => x.id === player)?.name} · {SCENES.find((x) => x.id === scene)?.name} — question {qi + 1} of {verse.questions.length}, {playerName} {right ? 'gets it' : 'misses it'}</span>
          {!castAuto && <button className="pill" style={{ fontSize: 11, marginLeft: 'auto' }} onClick={() => setCastAuto(true)}>↺ Auto</button>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label className="faint" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={withVoice} onChange={(e) => setWithVoice(e.target.checked)} /> read the question aloud
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
          <Button variant="gold" disabled={!!busy} onClick={() => run([date])}>{busy ? 'Working…' : '⚡ Make this challenge'}</Button>
          <button className="pill" disabled={!!busy} onClick={() => run(Array.from({ length: 7 }, (_, i) => addDays(date, -i)))}>Last 7 days</button>
          {busy && <button className="pill" onClick={() => { cancel.current = true }}>Stop after this one</button>}
        </div>
        <Busy busy={busy} progress={progress} />
        {err && <p style={{ color: 'var(--coral)', fontSize: 13 }}>{err}</p>}
      </div>

      {made.map((m) => <MadeCard key={`${m.kind}-${m.date}`} m={m} />)}
    </div>
  )
}
