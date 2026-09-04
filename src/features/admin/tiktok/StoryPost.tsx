// The evening post: Tabitha tells the story behind the day's verse to a
// circle of children, her words lit a word at a time on the panel above her.
// See shared.tsx for the split.

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/Button'
import { todayLocalDate } from '@/lib/date'
import { getVerseForDate } from '@/data/bible/questions'
import { pickStoryVoice } from '@/data/tiktokVoice'
import { makeStory as makeStoryPost, storyAssets } from './make'
import {
  TELLERS, ROOMS, VOICES, TEXTAREA_STYLE,
  seedFor, addDays, fetchStory, useDisplayFont, DateRow, Busy, MadeCard,
  type Made, type Story,
} from './shared'

export default function StoryPost() {
  useDisplayFont()
  const [date, setDate] = useState(todayLocalDate())
  const [teller, setTeller] = useState('tabitha')
  const [room, setRoom] = useState(ROOMS[0].id)
  const [castAuto, setCastAuto] = useState(true)
  const [story, setStory] = useState<Story | null>(null)
  const [poster, setPoster] = useState<string | null>(null)
  const [voice, setVoice] = useState(() => pickStoryVoice(seedFor(todayLocalDate()), 'tabitha').voice)
  const [style, setStyle] = useState(() => pickStoryVoice(seedFor(todayLocalDate()), 'tabitha').style)
  const [voiceAuto, setVoiceAuto] = useState(true)
  const [withCopy, setWithCopy] = useState(true)
  const [withMusic, setWithMusic] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [made, setMade] = useState<Made[]>([])
  const cancel = useRef(false)

  const verse = getVerseForDate(date)
  const pick = pickStoryVoice(seedFor(date), teller)
  useEffect(() => {
    if (!voiceAuto) return
    setVoice(pick.voice)
    setStyle(pick.style)
  }, [voiceAuto, pick.voice, pick.style])
  useEffect(() => {
    if (!castAuto) return
    setTeller('tabitha')
    setRoom(ROOMS[0].id)
  }, [castAuto, date])

  async function posterFor(d: string, st: Story): Promise<string> {
    const r = await import('@/lib/tiktokRender')
    const { roomImg, tellerImg } = await storyAssets(r, teller, room)
    const v = getVerseForDate(d)
    return r.renderStoryPoster({ title: st.title, reference: v.reference, verseText: v.text, paragraphs: [...st.paragraphs, v.text], hook: st.hook, room: roomImg, teller: tellerImg })
  }

  // Fetch (or reuse) the day's story and draw a poster of it.
  useEffect(() => {
    let live = true
    setStory(null); setPoster(null)
    ;(async () => {
      try {
        const st = await fetchStory(date, false)
        if (!live) return
        setStory(st)
        setPoster(await posterFor(date, st))
      } catch (e) { if (live) setErr(String((e as Error).message || e)) }
    })()
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, teller, room])

  // The evening job for one date: story → voice → copy → render.
  // The evening job for one date lives in make.ts; the story already on
  // screen is handed over so it is not fetched twice.
  async function makeStory(d: string): Promise<Made> {
    setProgress(0)
    return makeStoryPost(d, {
      cast: castAuto ? undefined : { teller, room },
      voice: voiceAuto ? undefined : { voice, style },
      story: d === date && story ? story : undefined,
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
        const m = await makeStory(d)
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
        <DateRow date={date} setDate={setDate} homeDate={todayLocalDate()} />
        <div>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>{verse.reference}</b>
          <p className="faint" style={{ fontSize: 13, lineHeight: 1.45, marginTop: 4 }}>{verse.text}</p>
        </div>
        {story ? (
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <b style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>{story.title}</b>
              <span className="faint" style={{ fontSize: 11 }}>· {story.hook}</span>
              <button className="pill" style={{ fontSize: 11, marginLeft: 'auto' }} disabled={!!busy}
                onClick={async () => { setErr(null); setBusy('rewriting the story'); try { const st = await fetchStory(date, true); setStory(st); setPoster(await posterFor(date, st)) } catch (e) { setErr(String((e as Error).message || e)) } finally { setBusy(null) } }}>
                ↻ Rewrite
              </button>
            </div>
            {story.paragraphs.map((pg, i) => <p key={i} style={{ marginTop: 6 }}>{pg}</p>)}
          </div>
        ) : <p className="faint" style={{ fontSize: 12 }}>Writing tonight’s story…</p>}
        {poster && <img src={poster} alt="" style={{ width: 180, borderRadius: 12, justifySelf: 'center' }} />}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <select value={teller} onChange={(e) => { setCastAuto(false); setTeller(e.target.value) }}>{TELLERS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          <select value={room} onChange={(e) => { setCastAuto(false); setRoom(e.target.value) }}>{ROOMS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        </div>
        <div className="faint" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{castAuto ? 'Picked: Tabitha · Story circle — the words light up as she says them' : `Yours: ${TELLERS.find((x) => x.id === teller)?.name} · ${ROOMS.find((x) => x.id === room)?.name}`}</span>
          {!castAuto && <button className="pill" style={{ fontSize: 11, marginLeft: 'auto' }} onClick={() => setCastAuto(true)}>↺ Auto</button>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label className="faint" style={{ fontSize: 11 }}>Voice {voiceAuto ? '· auto' : '· yours'}
            <select value={voice} onChange={(e) => { setVoiceAuto(false); setVoice(e.target.value) }} style={{ width: '100%', marginTop: 4 }}>
              {VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="faint" style={{ fontSize: 11, display: 'flex', alignItems: 'end', gap: 6, paddingBottom: 6 }}>
            <input type="checkbox" checked={withCopy} onChange={(e) => setWithCopy(e.target.checked)} /> caption too
          </label>
          <label className="faint" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={withMusic} onChange={(e) => setWithMusic(e.target.checked)} /> the library’s music underneath
          </label>
        </div>
        <div className="faint" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Picked: {pick.why}</span>
          {!voiceAuto && <button className="pill" style={{ fontSize: 11, marginLeft: 'auto' }} onClick={() => setVoiceAuto(true)}>↺ Auto</button>}
        </div>
        <textarea value={style} onChange={(e) => { setVoiceAuto(false); setStyle(e.target.value.slice(0, 400)) }} rows={3} style={TEXTAREA_STYLE} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="gold" disabled={!!busy || !story} onClick={() => run([date])}>{busy ? 'Working…' : '🌙 Make tonight’s story'}</Button>
          <button className="pill" disabled={!!busy} onClick={() => run(Array.from({ length: 7 }, (_, i) => addDays(date, i)))}>Next 7 nights</button>
          {busy && <button className="pill" onClick={() => { cancel.current = true }}>Stop after this one</button>}
        </div>
        <Busy busy={busy} progress={progress} />
        {err && <p style={{ color: 'var(--coral)', fontSize: 13 }}>{err}</p>}
      </div>

      {made.map((m) => <MadeCard key={m.date} m={m} />)}
    </div>
  )
}
