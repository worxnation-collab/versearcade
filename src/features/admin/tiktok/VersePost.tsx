// The morning post: a reader stands in a Verse Arcade scene and reads the
// verse of the day, captioned word by word. See shared.tsx for the split.

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/Button'
import { todayLocalDate } from '@/lib/date'
import { getVerseForDate } from '@/data/bible/questions'
import { gradeFor, secondVoiceFor } from '@/data/tiktokVoice'
import {
  READERS, SCENES, VOICES, ART_ORIGIN, STILL_PROMPT, LOOP_PROMPT, TEXTAREA_STYLE,
  seedFor, autoPick, autoCast, spokenReference, call, publicUrl, existsAt, addDays,
  loopUrlFor, backdropFor, tierFor, bedFor, useDisplayFont, DateRow, Busy, MadeCard,
  fetchCopy, type Copy, type Made,
} from './shared'

export default function VersePost() {
  useDisplayFont()
  const [date, setDate] = useState(todayLocalDate())
  const [reader, setReader] = useState(() => autoCast(todayLocalDate()).reader)
  const [scene, setScene] = useState(() => autoCast(todayLocalDate()).scene)
  const [castAuto, setCastAuto] = useState(true)
  const [voice, setVoice] = useState(() => autoPick(todayLocalDate(), autoCast(todayLocalDate()).reader).voice)
  const [style, setStyle] = useState(() => autoPick(todayLocalDate(), autoCast(todayLocalDate()).reader).style)
  const [voiceAuto, setVoiceAuto] = useState(true)
  const [withCopy, setWithCopy] = useState(true)
  const [withMusic, setWithMusic] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [made, setMade] = useState<Made[]>([])
  const [assets, setAssets] = useState<{ still: boolean; loop: boolean }>({ still: false, loop: false })
  const [poster, setPoster] = useState<string | null>(null)
  const [loopOp, setLoopOp] = useState<string | null>(null)
  const cancel = useRef(false)

  const verse = getVerseForDate(date)
  const cast = autoCast(date)
  useEffect(() => {
    if (!castAuto) return
    setReader(cast.reader)
    setScene(cast.scene)
  }, [castAuto, cast.reader, cast.scene])
  const key = `${reader}-${scene}`
  const pick = autoPick(date, reader)
  useEffect(() => {
    if (!voiceAuto) return
    setVoice(pick.voice)
    setStyle(pick.style)
  }, [voiceAuto, pick.voice, pick.style])
  const stillUrl = publicUrl(`readers/${key}.png`)
  const loopUrl = publicUrl(`readers/${key}.mp4`)

  // Which reader tier exists for this figure+scene, and a poster preview.
  useEffect(() => {
    let live = true
    setAssets({ still: false, loop: false })
    setPoster(null)
    ;(async () => {
      const [still, loop] = await Promise.all([existsAt(stillUrl, 'image/'), loopUrlFor(key).then((u) => !!u)])
      if (!live) return
      setAssets({ still, loop })
      try {
        const r = await import('@/lib/tiktokRender')
        const bd = await backdropFor(r, still ? 'still' : loop ? 'loop' : 'builtin', reader, scene)
        const url = await r.renderPoster({ reference: verse.reference, text: verse.text, backdrop: bd })
        if (live) setPoster(url)
      } catch (e) { if (live) setErr(String((e as Error).message || e)) }
    })()
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, verse.reference])

  // The whole daily job for one date: voice → copy → render.
  async function makeOne(d: string): Promise<Made> {
    const v = getVerseForDate(d)
    setBusy(`${d}: asking for the reading`)
    setProgress(0)
    // A batch reads each day in its own voice when the pick is automatic;
    // an operator's override applies to every day in the batch.
    const c = castAuto ? autoCast(d) : { reader, scene }
    const p = voiceAuto ? autoPick(d, c.reader) : { voice, style }
    const sd = seedFor(d)
    // The words of God or Jesus are read by a second voice; the reader
    // says the reference. Anyone else's verse is one voice as before.
    const second = voiceAuto ? secondVoiceFor(sd) : null
    const readerName = READERS.find((x) => x.id === c.reader)?.name.split(' ')[0] ?? 'Reader'
    const spoken = second
      ? `${second.name}: ${v.text.trim()}\n${readerName}: ${spokenReference(v.reference)}.`
      : `${v.text.trim()} ${spokenReference(v.reference)}.`
    const tts = await call<{ url: string; cached: boolean }>('tts', {
      date: d, text: spoken, voice: p.voice, style: p.style,
      speakers: second ? [{ name: second.name, voice: second.voice }, { name: readerName, voice: p.voice }] : undefined,
    })
    const audio = await (await fetch(tts.url + '?v=' + Date.now())).arrayBuffer()

    let copy: Copy | null = null
    if (withCopy) {
      setBusy(`${d}: writing the caption`)
      try { copy = await fetchCopy(d, 'verse') } catch { copy = null }
    }

    setBusy(`${d}: rendering`)
    const r = await import('@/lib/tiktokRender')
    const tier = await tierFor(c.reader, c.scene)
    const backdrop = await backdropFor(r, tier, c.reader, c.scene)
    const bed = withMusic ? await bedFor(await r.plannedDuration(audio, copy?.hook, false), 'morning') : undefined
    const out = await r.renderTikTok({
      reference: v.reference, text: v.text, hook: copy?.hook, audio, backdrop, bed,
      grade: castAuto ? gradeFor(sd) : undefined,
      onProgress: (f, label) => { setProgress(f); setBusy(`${d}: ${label}`) },
    })
    return { date: d, kind: 'verse', reference: v.reference, url: URL.createObjectURL(out.blob), ext: out.ext, size: out.blob.size, copy, phrases: out.phrases, tier: `${c.reader} · ${c.scene} · ${tier}` }
  }

  const run = async (dates: string[]) => {
    if (busy) return
    cancel.current = false
    setErr(null)
    try {
      for (const d of dates) {
        if (cancel.current) break
        const m = await makeOne(d)
        setMade((xs) => [m, ...xs.filter((x) => x.date !== d)])
      }
    } catch (e) {
      setErr(String((e as Error).message || e))
    } finally {
      setBusy(null)
    }
  }

  const paintStill = async () => {
    if (busy) return
    setErr(null); setBusy('painting the still (Nano Banana)')
    try {
      const name = READERS.find((x) => x.id === reader)?.name ?? reader
      await call('still', {
        key, prompt: STILL_PROMPT(name), force: true,
        refs: [`${ART_ORIGIN}/skins/${reader}.png`, `${ART_ORIGIN}/road/${scene}.jpg`],
      })
      setAssets((a) => ({ ...a, still: true }))
      const r = await import('@/lib/tiktokRender')
      setPoster(await r.renderPoster({ reference: verse.reference, text: verse.text, backdrop: await backdropFor(r, 'still', reader, scene) }))
    } catch (e) { setErr(String((e as Error).message || e)) } finally { setBusy(null) }
  }

  const animate = async () => {
    if (busy) return
    setErr(null); setBusy('starting Veo')
    try {
      // Veo animates the still if there is one; otherwise the app's own
      // composed poster (no text on it) so the step never needs Nano Banana first.
      const body: Record<string, unknown> = { prompt: LOOP_PROMPT }
      if (assets.still) body.imageUrl = stillUrl
      else {
        const r = await import('@/lib/tiktokRender')
        body.imageBase64 = await r.renderPoster({ reference: verse.reference, text: verse.text, backdrop: await backdropFor(r, 'builtin', reader, scene) }, 0.6, false)
      }
      const { op } = await call<{ op: string }>('loop-start', body)
      setLoopOp(op)
      setBusy('Veo is rendering (1–3 min)')
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 8000))
        const s = await call<{ done: boolean; url?: string; error?: string }>('loop-status', { key, op })
        if (!s.done) continue
        if (s.error) throw new Error(s.error)
        setAssets((a) => ({ ...a, loop: true }))
        setLoopOp(null)
        return
      }
      throw new Error('Veo did not finish in time — press Animate again to keep polling.')
    } catch (e) { setErr(String((e as Error).message || e)) } finally { setBusy(null) }
  }

  const tierLabel = assets.still ? 'painted still' : assets.loop ? 'Veo loop' : 'built-in (skin on the road)'

  return (
    <div>
      <div className="card" style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
        <DateRow date={date} setDate={setDate} homeDate={todayLocalDate()} right={<span className="faint" style={{ fontSize: 11, marginLeft: 'auto' }}>reader: {tierLabel}</span>} />
        <div>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>{verse.reference}</b>
          <p style={{ fontSize: 14, lineHeight: 1.45, marginTop: 4 }}>{verse.text}</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label className="faint" style={{ fontSize: 11 }}>Voice {voiceAuto ? '· auto' : '· yours'}
            <select value={voice} onChange={(e) => { setVoiceAuto(false); setVoice(e.target.value) }} style={{ width: '100%', marginTop: 4 }}>
              {VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="faint" style={{ fontSize: 11, display: 'flex', alignItems: 'end', gap: 6, paddingBottom: 6 }}>
            <input type="checkbox" checked={withCopy} onChange={(e) => setWithCopy(e.target.checked)} /> write the caption + hook too
          </label>
          <label className="faint" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={withMusic} onChange={(e) => setWithMusic(e.target.checked)} /> the road’s music underneath
          </label>
        </div>
        <div className="faint" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Picked: {pick.why}</span>
          {!voiceAuto && <button className="pill" style={{ fontSize: 11, marginLeft: 'auto' }} onClick={() => setVoiceAuto(true)}>↺ Auto</button>}
        </div>
        <textarea value={style} onChange={(e) => { setVoiceAuto(false); setStyle(e.target.value.slice(0, 400)) }} rows={3} style={TEXTAREA_STYLE} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="gold" disabled={!!busy} onClick={() => run([date])}>{busy ? 'Working…' : '🎬 Make this day’s post'}</Button>
          <button className="pill" disabled={!!busy} onClick={() => run(Array.from({ length: 7 }, (_, i) => addDays(date, i)))}>Next 7 days</button>
          {busy && <button className="pill" onClick={() => { cancel.current = true }}>Stop after this one</button>}
        </div>
        <Busy busy={busy} progress={progress} />
        {err && <p style={{ color: 'var(--coral)', fontSize: 13 }}>{err}</p>}
      </div>

      {made.map((m) => <MadeCard key={m.date} m={m} />)}

      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <b style={{ fontFamily: 'var(--font-display)' }}>The reader</b>
        <p className="faint" style={{ fontSize: 12, lineHeight: 1.4 }}>
          Generated once per figure and scene, then reused every day. The still is Nano Banana and wins when it exists; the loop is Veo and takes a few minutes.
          Without either, the app’s own skin stands on the road — the post still works.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <select value={reader} onChange={(e) => { setCastAuto(false); setReader(e.target.value) }}>{READERS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
          <select value={scene} onChange={(e) => { setCastAuto(false); setScene(e.target.value) }}>{SCENES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </div>
        <div className="faint" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{castAuto ? 'Picked' : 'Yours'}: {castAuto ? cast.why : `${READERS.find((x) => x.id === reader)?.name} · ${SCENES.find((x) => x.id === scene)?.name}`}</span>
          {!castAuto && <button className="pill" style={{ fontSize: 11, marginLeft: 'auto' }} onClick={() => setCastAuto(true)}>↺ Auto</button>}
        </div>
        {poster && <img src={poster} alt="" style={{ width: 180, borderRadius: 12, justifySelf: 'center' }} />}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="pill" disabled={!!busy} onClick={paintStill}>{assets.still ? '🎨 Repaint the still' : '🎨 Paint the still'}</button>
          <button className="pill" disabled={!!busy} onClick={animate}>{assets.loop ? '🎞️ Re-animate (Veo)' : '🎞️ Animate (Veo)'}</button>
          {loopOp && <span className="faint" style={{ fontSize: 11 }}>polling…</span>}
          <span className="faint" style={{ fontSize: 11, marginLeft: 'auto' }}>
            still {assets.still ? '✓' : '—'} · loop {assets.loop ? '✓' : '—'}
          </span>
        </div>
        {assets.still && <a className="faint" style={{ fontSize: 11 }} href={stillUrl} target="_blank" rel="noreferrer">open still ↗</a>}
        {assets.loop && <a className="faint" style={{ fontSize: 11 }} href={loopUrl} target="_blank" rel="noreferrer">open loop ↗</a>}
      </div>
    </div>
  )
}
