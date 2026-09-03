// Admin → TikTok: the daily-post engine.
//
// One post a day: a painted figure (Peter/Cephas by default) hovering over a
// Verse Arcade scene, reading the verse of the day, captioned. This panel is
// the whole workflow — pick a day, press one button, download the MP4 and copy
// the caption. It is an OPERATOR surface (admin-only, online-only, desktop
// Chrome) and never ships in the store build in any meaningful sense: it is
// behind the same three gates as the rest of the dashboard.
//
// The split, and why:
//  - The Gemini key lives in the `tiktok-gen` Edge Function and nowhere else.
//    It makes the reading (TTS), the reader (a Nano Banana still, optionally a
//    Veo loop) and the post copy, and parks each in the `tiktok` bucket.
//  - The VIDEO is assembled here, in the browser (src/lib/tiktokRender.ts):
//    WebCodecs + a muxer, so no server has to own ffmpeg. That module is
//    dynamically imported so nothing here weighs on the player bundle.
//  - `getVerseForDate` is deterministic, so any date can be made ahead of
//    time; "Next 7 days" queues a week.
//
// Three tiers of reader, best available wins, each generated ONCE per
// figure+scene and reused by every day after: the Veo loop (real motion), the
// Nano Banana still (Ken Burns), and — with no generation at all — the app's
// own skin PNG bobbing over a road scene. The engine works on first open with
// only the TTS secret set.

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/Button'
import { supabase } from '@/lib/supabase'
import { todayLocalDate } from '@/lib/date'
import { getVerseForDate } from '@/data/bible/questions'
import type { Backdrop, TimedPhrase } from '@/lib/tiktokRender'

const BUCKET = 'tiktok'
const READERS = [
  { id: 'cephas', name: 'Peter (Cephas)' },
  { id: 'moses', name: 'Moses' },
  { id: 'esther', name: 'Esther' },
  { id: 'david', name: 'David' },
  { id: 'elijah', name: 'Elijah' },
  { id: 'mary', name: 'Mary' },
]
const SCENES = [
  { id: 'harvest', name: 'Harvest Road' },
  { id: 'lamplight', name: 'Lamplight' },
  { id: 'advent', name: 'Advent' },
]
const VOICES = ['Charon', 'Orus', 'Algenib', 'Sadaltager', 'Iapetus', 'Enceladus', 'Fenrir', 'Schedar', 'Kore', 'Aoede']
const DEFAULT_STYLE = 'Read this slowly and warmly, like a fisherman reading scripture aloud to a small room. Pause at the punctuation.'

// Reference images for Nano Banana have to be https for the function to
// fetch them, so a dev build points at production for the app's own art.
const ART_ORIGIN = typeof location !== 'undefined' && location.protocol === 'https:' ? location.origin : 'https://versearcade.org'

const STILL_PROMPT = (reader: string) =>
  `Vertical 9:16 poster. The FIRST reference image is the figure — ${reader}, exactly as painted there: same face, robe, colours, props and proportions, full length head to feet. The SECOND reference image is the background scene. Paint the figure floating a hand's height above the ground in the centre of that scene, calm, looking toward the viewer, lit softly from below by a warm gold glow. Keep the top quarter and the bottom third of the picture free of detail (soft sky above, plain ground below) — words are drawn over them later. Same painterly style as the references. NO text, NO letters, NO logos, NO borders, NO frame.`
const LOOP_PROMPT =
  'The figure floats gently up and down in place, robe and hair moving softly in a slow breeze, the warm glow beneath him slowly breathing. The camera is locked off: no cuts, no zoom, no pan. He stays centred and keeps exactly the face, colours and clothing of the image. Slow, seamless, loopable motion. No text, no captions.'

// "Matthew 16:18" → "Matthew 16, verse 18", so the voice doesn't read a colon.
function spokenReference(ref: string): string {
  const m = /^(.+?)\s+(\d+):(\d+)(?:[-–](\d+))?$/.exec(ref.trim())
  if (!m) return ref
  return m[4] ? `${m[1]} ${m[2]}, verses ${m[3]} to ${m[4]}` : `${m[1]} ${m[2]}, verse ${m[3]}`
}

async function call<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase!.functions.invoke('tiktok-gen', { body: { action, ...body } })
  if (error) throw new Error((error as { message?: string }).message || String(error))
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
  return data as T
}

function publicUrl(path: string): string {
  return supabase!.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}
async function existsAt(url: string): Promise<boolean> {
  try { const r = await fetch(url, { method: 'HEAD', cache: 'no-store' }); return r.ok } catch { return false }
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return t.toISOString().slice(0, 10)
}

interface Copy { hook: string; caption: string; hashtags: string[] }
interface Made { date: string; reference: string; url: string; ext: string; size: number; copy: Copy | null; phrases: TimedPhrase[]; tier: string }

export default function TikTokPanel() {
  const [date, setDate] = useState(todayLocalDate())
  const [reader, setReader] = useState('cephas')
  const [scene, setScene] = useState('harvest')
  const [voice, setVoice] = useState('Charon')
  const [style, setStyle] = useState(DEFAULT_STYLE)
  const [withCopy, setWithCopy] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [made, setMade] = useState<Made[]>([])
  const [assets, setAssets] = useState<{ still: boolean; loop: boolean }>({ still: false, loop: false })
  const [poster, setPoster] = useState<string | null>(null)
  const [loopOp, setLoopOp] = useState<string | null>(null)
  const cancel = useRef(false)

  const verse = getVerseForDate(date)
  const key = `${reader}-${scene}`
  const stillUrl = publicUrl(`readers/${key}.png`)
  const loopUrl = publicUrl(`readers/${key}.mp4`)

  // The display font, loaded only here: the app itself never fetches it, and
  // the canvas needs the real face or the captions render in system-ui.
  useEffect(() => {
    if (document.getElementById('va-tiktok-font')) return
    const link = document.createElement('link')
    link.id = 'va-tiktok-font'
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@700;800&display=swap'
    document.head.appendChild(link)
  }, [])

  // Which reader tier exists for this figure+scene, and a poster preview.
  useEffect(() => {
    let live = true
    setAssets({ still: false, loop: false })
    setPoster(null)
    ;(async () => {
      const [still, loop] = await Promise.all([existsAt(stillUrl), existsAt(loopUrl)])
      if (!live) return
      setAssets({ still, loop })
      try {
        const r = await import('@/lib/tiktokRender')
        const bd = await backdropFor(r, still ? 'still' : 'builtin')
        const url = await r.renderPoster({ reference: verse.reference, text: verse.text, backdrop: bd })
        if (live) setPoster(url)
      } catch (e) { if (live) setErr(String((e as Error).message || e)) }
    })()
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, verse.reference])

  async function backdropFor(r: typeof import('@/lib/tiktokRender'), tier: 'loop' | 'still' | 'builtin'): Promise<Backdrop> {
    if (tier === 'loop') return { kind: 'loop', video: await r.loadVideo(loopUrl + '?v=' + Date.now()) }
    if (tier === 'still') return { kind: 'still', image: await r.loadImage(stillUrl + '?v=' + Date.now()) }
    const [sceneImg, figure] = await Promise.all([r.loadImage(`/road/${scene}.jpg`), r.loadImage(`/skins/${reader}.png`)])
    return { kind: 'builtin', scene: sceneImg, figure }
  }

  // The whole daily job for one date: voice → copy → render.
  async function makeOne(d: string, tierOverride?: 'loop' | 'still' | 'builtin'): Promise<Made> {
    const v = getVerseForDate(d)
    setBusy(`${d}: asking for the reading`)
    setProgress(0)
    const spoken = `${v.text.trim()} ${spokenReference(v.reference)}.`
    const tts = await call<{ url: string; cached: boolean }>('tts', { date: d, text: spoken, voice, style })
    const audio = await (await fetch(tts.url + '?v=' + Date.now())).arrayBuffer()

    let copy: Copy | null = null
    if (withCopy) {
      setBusy(`${d}: writing the caption`)
      try { copy = await call<Copy>('copy', { reference: v.reference, text: v.text, theme: v.theme }) } catch { copy = null }
    }

    setBusy(`${d}: rendering`)
    const r = await import('@/lib/tiktokRender')
    const tier = tierOverride ?? (assets.loop ? 'loop' : assets.still ? 'still' : 'builtin')
    const backdrop = await backdropFor(r, tier)
    const out = await r.renderTikTok({
      reference: v.reference, text: v.text, hook: copy?.hook, audio, backdrop,
      onProgress: (f, label) => { setProgress(f); setBusy(`${d}: ${label}`) },
    })
    return { date: d, reference: v.reference, url: URL.createObjectURL(out.blob), ext: out.ext, size: out.blob.size, copy, phrases: out.phrases, tier }
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
      setPoster(await r.renderPoster({ reference: verse.reference, text: verse.text, backdrop: await backdropFor(r, 'still') }))
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
        body.imageBase64 = await r.renderPoster({ reference: verse.reference, text: verse.text, backdrop: await backdropFor(r, 'builtin') }, 0.6, false)
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

  const tierLabel = assets.loop ? 'Veo loop' : assets.still ? 'painted still' : 'built-in (skin over road)'

  return (
    <div>
      <p className="faint" style={{ fontSize: 12, marginBottom: 10, lineHeight: 1.4 }}>
        One post a day: {READERS.find((x) => x.id === reader)?.name} reads the verse over a Verse Arcade scene, captioned, 1080×1920.
        Needs <code>GEMINI_API_KEY</code> set in Supabase and the <code>tiktok-gen</code> function deployed. Use desktop Chrome — the video is encoded in this tab.
      </p>

      {/* ---- the day ---- */}
      <div className="card" style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value || todayLocalDate())} style={{ width: 170 }} />
          <button className="pill" style={{ fontSize: 12 }} onClick={() => setDate(todayLocalDate())}>Today</button>
          <button className="pill" style={{ fontSize: 12 }} onClick={() => setDate(addDays(date, 1))}>+1 day</button>
          <span className="faint" style={{ fontSize: 11, marginLeft: 'auto' }}>reader: {tierLabel}</span>
        </div>
        <div>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>{verse.reference}</b>
          <p style={{ fontSize: 14, lineHeight: 1.45, marginTop: 4 }}>{verse.text}</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label className="faint" style={{ fontSize: 11 }}>Voice
            <select value={voice} onChange={(e) => setVoice(e.target.value)} style={{ width: '100%', marginTop: 4 }}>
              {VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="faint" style={{ fontSize: 11, display: 'flex', alignItems: 'end', gap: 6, paddingBottom: 6 }}>
            <input type="checkbox" checked={withCopy} onChange={(e) => setWithCopy(e.target.checked)} /> write the caption + hook too
          </label>
        </div>
        <textarea value={style} onChange={(e) => setStyle(e.target.value.slice(0, 400))} rows={2}
          style={{ padding: '8px', borderRadius: 10, background: 'var(--card-solid)', color: 'var(--ink)', border: '1px solid var(--stroke)', resize: 'vertical', font: 'inherit', fontSize: 12 }} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="gold" disabled={!!busy} onClick={() => run([date])}>{busy ? 'Working…' : '🎬 Make this day’s post'}</Button>
          <button className="pill" disabled={!!busy} onClick={() => run(Array.from({ length: 7 }, (_, i) => addDays(date, i)))}>Next 7 days</button>
          {busy && <button className="pill" onClick={() => { cancel.current = true }}>Stop after this one</button>}
        </div>
        {busy && (
          <div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--card)', overflow: 'hidden' }}>
              <div style={{ width: `${Math.round(progress * 100)}%`, height: '100%', background: 'var(--gold)', transition: 'width .2s' }} />
            </div>
            <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>{busy}</div>
          </div>
        )}
        {err && <p style={{ color: 'var(--coral)', fontSize: 13 }}>{err}</p>}
      </div>

      {/* ---- what got made ---- */}
      {made.map((m) => (
        <div key={m.date} className="card" style={{ marginBottom: 12, display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <b style={{ fontFamily: 'var(--font-display)' }}>{m.date} · {m.reference}</b>
            <span className="faint" style={{ fontSize: 11, marginLeft: 'auto' }}>{(m.size / 1e6).toFixed(1)} MB · {m.ext} · {m.tier}</span>
          </div>
          <video src={m.url} controls playsInline style={{ width: 200, borderRadius: 12, justifySelf: 'center', background: '#000' }} />
          <a href={m.url} download={`verse-arcade-${m.date}.${m.ext}`} className="pill" style={{ textAlign: 'center', fontWeight: 800 }}>⬇️ Download verse-arcade-{m.date}.{m.ext}</a>
          {m.copy && (
            <div style={{ fontSize: 13, lineHeight: 1.45 }}>
              <div><span className="faint">Hook:</span> {m.copy.hook}</div>
              <div style={{ marginTop: 4 }}>{m.copy.caption}</div>
              <div className="faint" style={{ marginTop: 4 }}>{m.copy.hashtags.map((t) => '#' + t).join(' ')}</div>
              <button className="pill" style={{ marginTop: 6, fontSize: 12 }}
                onClick={() => navigator.clipboard.writeText(`${m.copy!.caption}\n\n${m.copy!.hashtags.map((t) => '#' + t).join(' ')}`)}>
                📋 Copy caption + tags
              </button>
            </div>
          )}
        </div>
      ))}

      {/* ---- the reader ---- */}
      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <b style={{ fontFamily: 'var(--font-display)' }}>The reader</b>
        <p className="faint" style={{ fontSize: 12, lineHeight: 1.4 }}>
          Generated once per figure and scene, then reused every day. The still is Nano Banana; the loop is Veo and takes a few minutes.
          Without either, the app’s own skin bobs over the road — the post still works.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <select value={reader} onChange={(e) => setReader(e.target.value)}>{READERS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
          <select value={scene} onChange={(e) => setScene(e.target.value)}>{SCENES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
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
