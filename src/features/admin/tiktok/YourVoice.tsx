// Admin → TikTok → Your voice: the operator reads the verse.
//
// The morning post is Gemini's voice unless a recording is parked for the
// date, and this card is where recordings get parked. It is built around
// one Sunday sitting: the next seven verses, a drafted thought under each
// to read or ignore, and an upload slot per day. Everything a recording
// needs happens in this tab — decode, transcribe, split, correct — and the
// morning runner then makes the video from what was approved here, with no
// Whisper and no Gemini voice on a voiced day (lib/tiktokVoice.ts).
//
// Why this is the human element and not decoration: the platforms that pay
// judge whether a person produced the video, and a person's voice reading
// the verse and saying one thing about it is that. The painting, the
// reader figure and the gold captions are untouched; the thought section
// adds one photo in a round frame with a ring that breathes with the voice.

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/Button'
import { todayLocalDate } from '@/lib/date'
import { getVerseForDate } from '@/data/bible/questions'
import { makeVerse } from './make'
import {
  FOUNDER_PHOTO, VOICE_LABEL, TEXTAREA_STYLE,
  addDays, call, publicUrl, existsAt, parkFile, fetchThought, peekThought, saveThought, fetchVoice, fetchCopy,
  voiceWavPath, voiceJsonPath, useDisplayFont, Busy, MadeCard,
  type Made, type Thought, type VoiceTrack,
} from './shared'

const DAYS = 7

/** What the operator does, in order. The card says it because the card is the workflow. */
function HowTo() {
  return (
    <div className="card" style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
      <b style={{ fontFamily: 'var(--font-display)' }}>🎙️ Your voice on the morning post</b>
      <ol style={{ fontSize: 13, lineHeight: 1.5, margin: 0, paddingLeft: 20, display: 'grid', gap: 4 }}>
        <li><b>Draft</b> a thought under each day’s verse (or write your own in the box). About 110 words is 45 seconds; the count is under the box.</li>
        <li><b>Record</b> on your phone — Voice Memos, in a quiet room, a hand’s width from your mouth. One take per verse: a beat of silence, <b>read the verse</b> a touch slower than you’d speak it, <b>don’t say the reference</b>, a beat of silence, then <b>say your thought</b>, then stop. A stumble is fine: restart the sentence and keep going.</li>
        <li><b>Upload</b> the memo on its day. It’s decoded, listened to, and split into the verse and your thought. Read the transcript, fix any word it misheard, and <b>Save</b>.</li>
        <li>That’s it. The 07:00 runner uses your recording for that date and Gemini’s voice for any date you skipped. <b>Make the post</b> here first if you want to see it.</li>
      </ol>
      <p className="faint" style={{ fontSize: 12, margin: 0, lineHeight: 1.4 }}>
        The photo below appears in a round frame while you speak, and small on the end card. The caption’s AI note becomes “AI-generated art; the voice is our own.”
      </p>
    </div>
  )
}

/** The one photo the thought section draws: uploaded once, replaced whenever. */
function FounderPhoto() {
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const refresh = async () => {
    const u = publicUrl(FOUNDER_PHOTO) + '?v=' + Date.now()
    setUrl((await existsAt(u, 'image/')) ? u : null)
  }
  useEffect(() => { void refresh() }, [])
  const upload = async (f: File | undefined) => {
    if (!f) return
    setErr(null); setBusy(true)
    try {
      // A square crop, centred a little above the middle where a portrait's
      // face sits, at 720px — the frame draws it at 270 and 180.
      const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(f) })
      const s = Math.min(img.naturalWidth, img.naturalHeight)
      const sx = (img.naturalWidth - s) / 2, sy = Math.max(0, (img.naturalHeight - s) * 0.3)
      const c = document.createElement('canvas'); c.width = 720; c.height = 720
      c.getContext('2d')!.drawImage(img, sx, sy, s, s, 0, 0, 720, 720)
      const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('no jpeg'))), 'image/jpeg', 0.9))
      await parkFile(FOUNDER_PHOTO, blob, 'image/jpeg')
      await refresh()
    } catch (e) { setErr(String((e as Error).message || e)) } finally { setBusy(false) }
  }
  return (
    <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
      {url
        ? <img src={url} alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--gold)' }} />
        : <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--card)', display: 'grid', placeItems: 'center' }}>🙂</div>}
      <div style={{ display: 'grid', gap: 4, flex: 1, minWidth: 200 }}>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 14 }}>{VOICE_LABEL}</b>
        <span className="faint" style={{ fontSize: 12 }}>{url ? 'This is the photo on the thought and the end card.' : 'No photo yet — the thought plays over the painting alone until there is one.'}</span>
        {err && <span style={{ color: 'var(--coral)', fontSize: 12 }}>{err}</span>}
      </div>
      <label className="pill" style={{ fontSize: 12, cursor: 'pointer' }}>
        {busy ? 'Uploading…' : url ? 'Replace photo' : 'Upload photo'}
        <input type="file" accept="image/*" style={{ display: 'none' }} disabled={busy} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = '' }} />
      </label>
    </div>
  )
}

const wordCount = (t: string) => t.split(/\s+/).filter(Boolean).length

function Day({ date, samples, onVoiced }: { date: string; samples: string[]; onVoiced: (d: string, text: string | null) => void }) {
  const verse = getVerseForDate(date)
  const [thought, setThought] = useState<Thought | null | 'loading'>('loading')
  const [text, setText] = useState('')
  const [voice, setVoice] = useState<(VoiceTrack & { wavUrl: string }) | null>(null)
  const [pending, setPending] = useState<VoiceTrack | null>(null)
  const [transcript, setTranscript] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [made, setMade] = useState<Made | null>(null)
  const [open, setOpen] = useState(false)
  const live = useRef(true)
  useEffect(() => () => { live.current = false }, [])

  useEffect(() => {
    let on = true
    setThought('loading'); setVoice(null); setPending(null); setMade(null)
    ;(async () => {
      const [t, v] = await Promise.all([peekThought(date).catch(() => null), fetchVoice(date).catch(() => null)])
      if (!on) return
      setThought(t); setText(t?.text ?? '')
      setVoice(v); setTranscript(v?.text ?? '')
      if (v) onVoiced(date, v.text)
    })()
    return () => { on = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  const run = async (label: string, f: () => Promise<void>) => {
    if (busy) return
    setErr(null); setBusy(label); setProgress(0)
    try { await f() } catch (e) { if (live.current) setErr(String((e as Error).message || e)) } finally { if (live.current) setBusy(null) }
  }

  const draft = (force: boolean) => run('Drafting', async () => {
    const t = await fetchThought(date, force, samples)
    setThought(t); setText(t.text)
  })
  const save = () => run('Saving', async () => {
    const t = await saveThought(date, text)
    setThought(t); setText(t.text)
  })

  // The recording: decode → park the WAV → listen → split. The transcript is
  // shown for correction before anything the renderer reads is written.
  const upload = (f: File | undefined) => {
    if (!f) return
    void run('Decoding', async () => {
      const m = await import('@/lib/tiktokVoice')
      const dec = await m.decodeRecording(f)
      if (dec.seconds < 8) throw new Error('That recording is under eight seconds — is it the right file?')
      setBusy('Uploading the recording'); setProgress(0.1)
      await parkFile(voiceWavPath(date), dec.wav, 'audio/wav')
      setProgress(0.2)
      const track = await m.splitRecording(dec.samples, dec.sampleRate, verse.text, verse.reference, (label) => { setBusy(label); setProgress(0.5) })
      setPending(track); setTranscript(track.text)
    })
  }
  const commit = () => run('Saving', async () => {
    const m = await import('@/lib/tiktokVoice')
    const base = pending ?? voice
    if (!base) return
    const track = m.refit(base, transcript)
    await parkFile(voiceJsonPath(date), new Blob([JSON.stringify(track)], { type: 'application/json' }), 'application/json')
    // The caption is rewritten now that the verse is a person reading it —
    // a copy cached earlier credits a painted Peter with the voice.
    try { await fetchCopy(date, 'verse', true) } catch { /* the caption is written at render time otherwise */ }
    setVoice({ ...track, wavUrl: publicUrl(voiceWavPath(date)) }); setPending(null)
    onVoiced(date, track.text)
  })
  const remove = () => run('Removing', async () => {
    await call('voice-clear', { date })
    setVoice(null); setPending(null); setTranscript('')
    onVoiced(date, null)
  })
  const make = () => run('Making the post', async () => {
    const mm = await makeVerse(date, {}, (f, label) => { setProgress(f); setBusy(label) })
    setMade(mm)
  })

  const status = voice ? `🎙 parked · ${Math.round(voice.seconds)}s · verse ${voice.verseMatched}/${voice.verse.length} words heard · thought ${wordCount(voice.text)} words`
    : pending ? 'listened — read the transcript, then Save'
      : thought && thought !== 'loading' ? `draft ready · ${thought.words} words · ~${Math.round(thought.words / 2.4)}s` : 'nothing yet'
  const total = voice ? Math.round(voice.seconds + 3) : null

  return (
    <div className="card" style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
      <button onClick={() => setOpen((o) => !o)} style={{ all: 'unset', cursor: 'pointer', display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 22 }}>{voice ? '🎙️' : pending ? '👂' : '📅'}</span>
        <span>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>{date} · {verse.reference}</b>
          <span className="faint" style={{ fontSize: 11, display: 'block' }}>{status}{total ? ` · post ≈ ${total}s${total < 60 ? ' (under a minute — say a little more for TikTok’s rewards floor)' : ''}` : ''}</span>
        </span>
        <span className="pill" style={{ fontSize: 11 }}>{open ? 'fold' : 'open'}</span>
      </button>
      {open && (
        <>
          <p style={{ fontSize: 14, lineHeight: 1.45, margin: 0 }}>{verse.text}</p>

          <div style={{ display: 'grid', gap: 4 }}>
            <div className="faint" style={{ fontSize: 11, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span>Your thought {thought && thought !== 'loading' ? `· ${thought.source === 'operator' ? 'your edit' : 'drafted'}` : ''}</span>
              <span style={{ marginLeft: 'auto' }}>{wordCount(text)} words · ~{Math.round(wordCount(text) / 2.4)}s</span>
            </div>
            <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 1600))} rows={5} placeholder="Press Draft, or write what you want to say." style={TEXTAREA_STYLE} disabled={thought === 'loading'} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="pill" style={{ fontSize: 12 }} disabled={!!busy || thought === 'loading'} onClick={() => draft(!!thought && thought !== 'loading')}>{thought && thought !== 'loading' ? '↻ Redraft' : '✍️ Draft'}</button>
              <button className="pill" style={{ fontSize: 12 }} disabled={!!busy || !text.trim() || (thought !== 'loading' && thought?.text === text)} onClick={save}>Save my edit</button>
              <button className="pill" style={{ fontSize: 12 }} onClick={() => navigator.clipboard.writeText(text)} disabled={!text.trim()}>📋 Copy</button>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 6, borderTop: '1px solid var(--stroke)', paddingTop: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label className="pill" style={{ fontSize: 12, cursor: busy ? 'default' : 'pointer', fontWeight: 800 }}>
                {voice ? '🎙 Replace the recording' : '🎙 Upload the recording'}
                <input type="file" accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg,.aac" style={{ display: 'none' }} disabled={!!busy} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = '' }} />
              </label>
              {voice && <a className="faint" style={{ fontSize: 11 }} href={voice.wavUrl} target="_blank" rel="noreferrer">listen ↗</a>}
              {voice && <button className="pill" style={{ fontSize: 11, marginLeft: 'auto' }} disabled={!!busy} onClick={remove}>✕ Remove</button>}
            </div>
            {(pending || voice) && (
              <>
                <div className="faint" style={{ fontSize: 11 }}>
                  {pending
                    ? `Heard the verse (${pending.verseMatched} of ${pending.verse.length} words) ending at ${pending.verse[pending.verse.length - 1]?.end.toFixed(1)}s; your thought starts at ${pending.thought[0]?.start.toFixed(1) ?? '—'}s. Fix any misheard word below — the timing stays.`
                    : 'The thought as it will be captioned. Edit and Save to change a word.'}
                </div>
                <textarea value={transcript} onChange={(e) => setTranscript(e.target.value.slice(0, 2000))} rows={5} style={TEXTAREA_STYLE} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="gold" disabled={!!busy || !transcript.trim() || (!pending && voice?.text === transcript)} onClick={commit}>{pending ? '✓ Save the recording' : 'Save the words'}</Button>
                </div>
              </>
            )}
            {voice && !pending && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="pill" style={{ fontSize: 12 }} disabled={!!busy} onClick={make}>🎬 Make the post with my voice</button>
              </div>
            )}
          </div>
          <Busy busy={busy} progress={progress} />
          {err && <p style={{ color: 'var(--coral)', fontSize: 12, margin: 0 }}>{err}</p>}
          {made && <MadeCard m={made} />}
        </>
      )}
    </div>
  )
}

export default function YourVoice() {
  useDisplayFont()
  const [start, setStart] = useState(todayLocalDate())
  // The texts of parked recordings, so a draft can be asked for in the
  // operator's own register once a few exist.
  const [voiced, setVoiced] = useState<Record<string, string>>({})
  const onVoiced = (d: string, text: string | null) => setVoiced((v) => { const n = { ...v }; if (text) n[d] = text; else delete n[d]; return n })
  const samples = Object.values(voiced).slice(-4)
  const dates = Array.from({ length: DAYS }, (_, i) => addDays(start, i))
  return (
    <div>
      <HowTo />
      <FounderPhoto />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <input type="date" value={start} onChange={(e) => setStart(e.target.value || todayLocalDate())} style={{ width: 170 }} />
        <button className="pill" style={{ fontSize: 12 }} onClick={() => setStart(todayLocalDate())}>Today</button>
        <button className="pill" style={{ fontSize: 12 }} onClick={() => setStart(addDays(start, 7))}>Next week</button>
        <span className="faint" style={{ fontSize: 11, marginLeft: 'auto' }}>{Object.keys(voiced).length} of these {DAYS} days recorded</span>
      </div>
      {dates.map((d) => <Day key={d} date={d} samples={samples} onVoiced={onVoiced} />)}
    </div>
  )
}
