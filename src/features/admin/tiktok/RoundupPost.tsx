// The weekly roundup: the operator's own countdown of his week's top posts,
// for his PERSONAL profile rather than for Verse Arcade. His figure stands in
// modern scenes (art/roundup-scenes.json → public/roundup/), one per item,
// holding up each post's photo while his recording plays, captioned word by
// word. See `renderRoundup` in lib/tiktokRender.ts.
//
// Deliberately NOT a post kind: a personal profile has no publishing API, so
// nothing here touches the bucket, Ayrshare or the copy prompts. It renders in
// this tab and hands back an MP4 to download and post by hand.

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/Button'
import { TEXTAREA_STYLE, useDisplayFont, Busy } from './shared'

const SCENES = [
  { id: 'roundup-driveway', name: 'Driveway' },
  { id: 'roundup-garage', name: 'Garage' },
  { id: 'roundup-front-yard', name: 'Front yard' },
  { id: 'roundup-kitchen', name: 'Kitchen' },
  { id: 'roundup-living-room', name: 'Living room' },
]
/** What a scene that has not been generated yet draws instead. */
const FALLBACK_SCENE = '/tiktok/roads/wheat-noon.jpg'
const FIGURE = '/skins/sharkey.png'

interface Item { label: string; title: string; stat: string; scene: string; text: string; photo: File | null }

const blank = (label: string, scene: string): Item => ({ label, title: '', stat: '', scene, text: '', photo: null })

// This week's script (Sep 24 - Oct 1), pre-filled so the card opens ready to
// record. Replace each week; the words must match what is read.
const START: Item[] = [
  { ...blank('#5', 'roundup-living-room'), title: 'Brock', stat: '$1.70',
    text: 'Number five. Brock. A Poke-a-man card. One dollar seventy. Brock is just a chill guy, and apparently so are you, because nobody argued. One comment. Peaceful.' },
  { ...blank('#4', 'roundup-driveway'), title: 'Is it normal?', stat: '$1.87',
    text: 'Number four. I asked if something on my car was normal. Ten of you said no. None of you said what it was. One eighty-seven, and I am still bothered.' },
  { ...blank('#3', 'roundup-garage'), title: 'Three dollars for air', stat: '$2.05',
    text: 'Number three. The robots charge three dollars for air now. We should have seen it coming. Two oh five, which is not enough to fill one tire.' },
  { ...blank('#2', 'roundup-kitchen'), title: 'Beetle or roach', stat: '$2.22',
    text: 'Number two. Beetle or roach. Almost ten thousand of you looked at it. One person hit like. Sixteen people fought in the comments. Team Roach, you know who you are.' },
  { ...blank('Honorable mention', 'roundup-garage'), title: 'Mac, and the brake job',
    text: 'Honorable mentions. Should I switch to Mac. Forty-eight comments, fifty-four cents. You argued for free. And the brake job. Eleven thousand views, the most of anything, sixty-two cents. Pics for attention. Attention received.' },
  { ...blank('#1', 'roundup-front-yard'), title: 'Boom boom', stat: '$2.40',
    text: 'And number one. Boom boom. Two dollars and forty cents. I do not know what boom boom was trying to say. Neither do you. That is why it won.' },
]

async function sceneImage(id: string, load: (u: string) => Promise<HTMLImageElement>) {
  try { return await load(`/roundup/${id}.jpg`) } catch { return await load(FALLBACK_SCENE) }
}

function fileImage(f: File, load: (u: string) => Promise<HTMLImageElement>) {
  return load(URL.createObjectURL(f))
}

export default function RoundupPost() {
  useDisplayFont()
  const [brand, setBrand] = useState('The weekly roundup')
  const [hook, setHook] = useState('Thirty-six posts. One of them is a bug.')
  const [home, setHome] = useState('roundup-driveway')
  const [intro, setIntro] = useState('Alright. Weekly roundup. Thirty-six posts this week, and Facebook paid me in what I can only describe as couch change. Let us count it down.')
  const [items, setItems] = useState<Item[]>(START)
  const [outro, setOutro] = useState('That is the week. Seventeen dollars and sixty-four cents. Like I said, couch change. See you next week.')
  const [signoff, setSignoff] = useState('See you next week')
  const [audio, setAudio] = useState<File | null>(null)
  const [align, setAlign] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [out, setOut] = useState<{ url: string; ext: string; sec: number } | null>(null)
  const lastUrl = useRef<string | null>(null)
  useEffect(() => () => { if (lastUrl.current) URL.revokeObjectURL(lastUrl.current) }, [])

  const set = (i: number, patch: Partial<Item>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const move = (i: number, d: number) => setItems((xs) => {
    const j = i + d
    if (j < 0 || j >= xs.length) return xs
    const c = [...xs]; [c[i], c[j]] = [c[j], c[i]]; return c
  })

  const ready = !!audio && !!intro.trim() && items.length > 0 && items.every((x) => x.text.trim() && x.label.trim())

  const render = async () => {
    if (!audio) return
    setErr(null); setBusy('Loading the scenes'); setProgress(0)
    try {
      const r = await import('@/lib/tiktokRender')
      const [homeImg, figure, buf] = await Promise.all([
        sceneImage(home, r.loadImage),
        r.loadImage(FIGURE).catch(() => null),
        audio.arrayBuffer(),
      ])
      const built = await Promise.all(items.map(async (x) => ({
        label: x.label.trim(),
        title: x.title.trim(),
        stat: x.stat.trim() || undefined,
        text: x.text.trim(),
        scene: x.scene === home ? homeImg : await sceneImage(x.scene, r.loadImage),
        photo: x.photo ? await fileImage(x.photo, r.loadImage).catch(() => null) : null,
      })))
      const res = await r.renderRoundup({
        hook, brand, intro, outro, signoff, align, figure, home: homeImg, audio: buf, items: built,
        onProgress: (f, label) => { setProgress(f); setBusy(label) },
      })
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current)
      const url = URL.createObjectURL(res.blob)
      lastUrl.current = url
      setOut({ url, ext: res.ext, sec: res.durationSec })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const label = { fontSize: 11, display: 'block', marginBottom: 4 } as const
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <p className="faint" style={{ fontSize: 12, lineHeight: 1.5, margin: 0 }}>
        Your figure, your voice, a scene per post and the post's own photo held up beside you. Record the intro, each item in order,
        then the outro as ONE memo, and paste what you said into the boxes below in the same order — the captions are matched to the
        recording, so the words need to be close. Nothing here posts anywhere: download the video and post it yourself.
      </p>

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <label><span className="faint" style={label}>Hook (first frame)</span><input value={hook} onChange={(e) => setHook(e.target.value)} placeholder="Five posts. One of them is a bug." style={{ width: '100%' }} /></label>
        <label><span className="faint" style={label}>Title line</span><input value={brand} onChange={(e) => setBrand(e.target.value)} style={{ width: '100%' }} /></label>
        <label><span className="faint" style={label}>Intro and outro scene</span>
          <select value={home} onChange={(e) => setHome(e.target.value)} style={{ width: '100%' }}>
            {SCENES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label><span className="faint" style={label}>End card</span><input value={signoff} onChange={(e) => setSignoff(e.target.value)} style={{ width: '100%' }} /></label>
      </div>

      <label><span className="faint" style={label}>Intro — what you say first</span>
        <textarea rows={3} value={intro} onChange={(e) => setIntro(e.target.value)} style={{ ...TEXTAREA_STYLE, width: '100%' }} /></label>

      {items.map((x, i) => (
        <div key={i} className="card" style={{ display: 'grid', gap: 8, border: '1px solid var(--stroke)' }}>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '90px 1fr 140px 150px' }}>
            <input value={x.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="#5" />
            <input value={x.title} onChange={(e) => set(i, { title: e.target.value })} placeholder="The post in a few words" />
            <input value={x.stat} onChange={(e) => set(i, { stat: e.target.value })} placeholder="$2.40" />
            <select value={x.scene} onChange={(e) => set(i, { scene: e.target.value })}>
              {SCENES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <textarea rows={3} value={x.text} onChange={(e) => set(i, { text: e.target.value })} placeholder="What you say about this one" style={TEXTAREA_STYLE} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="faint" style={{ fontSize: 11 }}>Post photo <input type="file" accept="image/*" onChange={(e) => set(i, { photo: e.target.files?.[0] ?? null })} /></label>
            <span style={{ flex: 1 }} />
            <button className="pill" style={{ fontSize: 11 }} onClick={() => move(i, -1)}>↑</button>
            <button className="pill" style={{ fontSize: 11 }} onClick={() => move(i, 1)}>↓</button>
            <button className="pill" style={{ fontSize: 11 }} onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>Remove</button>
          </div>
        </div>
      ))}
      <div>
        <button className="pill" style={{ fontSize: 12 }} onClick={() => setItems((xs) => [...xs, blank('Honorable mention', home)])}>+ Add an item</button>
      </div>

      <label><span className="faint" style={label}>Outro — what you say last</span>
        <textarea rows={2} value={outro} onChange={(e) => setOutro(e.target.value)} style={{ ...TEXTAREA_STYLE, width: '100%' }} /></label>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label className="faint" style={{ fontSize: 12 }}>Your recording <input type="file" accept="audio/*" onChange={(e) => setAudio(e.target.files?.[0] ?? null)} /></label>
        <label className="faint" style={{ fontSize: 12 }}><input type="checkbox" checked={align} onChange={(e) => setAlign(e.target.checked)} /> Time captions by listening (slower, exact)</label>
      </div>

      <Busy busy={busy} progress={progress} />
      {err && <p style={{ color: 'var(--coral)', fontSize: 12, margin: 0 }}>{err}</p>}
      <Button onClick={render} disabled={!ready || !!busy}>{busy ? 'Rendering…' : 'Render the roundup'}</Button>

      {out && (
        <div style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
          <video src={out.url} controls playsInline style={{ width: 270, borderRadius: 12 }} />
          <a className="pill" href={out.url} download={`roundup.${out.ext}`}>Download ({Math.round(out.sec)}s {out.ext.toUpperCase()})</a>
        </div>
      )}
    </div>
  )
}
