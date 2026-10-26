import { useEffect, useRef, useState } from 'react'
import {
  MEMO_ACCEPT,
  MEMO_BYTES_MAX,
  MEMO_SECONDS_MAX,
  memoSeconds,
  type MemoBackend,
  type MemoUpload,
} from '@/store/churchAdmin'

// "Record or upload a voice memo" — the second way into the three drafting
// forms' transcript box (TodayVerseForm, WeekDraftPanel, StudyTopicWeek), one
// component so they cannot drift. It only ever FILLS THE BOX: the transcript
// comes back as text the leader reads and edits, and drafting is the same
// button and the same call as a paste. Nothing here spends a draft unit.
//
// Two doors, because they suit different Sundays: a file (the phone's own
// voice-memo app, or the recording the church already makes — the picker is
// the native one on iOS and Android) and recording right here, which asks for
// the microphone and keeps the screen awake while it runs. The upload is kept
// between "transcribe" attempts, so a busy model costs a retry, not a re-upload.
//
// With `queue` (the sermon week's "draft my week for me", 0148) the upload is
// handed to the SERVER instead of transcribed here: the function transcribes
// it and drafts the week by itself, and the leader can close the app. `queue`
// may refuse before anything is uploaded (`ready` says why — no passage yet),
// and if the hand-off itself fails, the same upload can still be transcribed
// here the ordinary way.

const MSG: Record<string, string> = {
  memo_format: 'That file type can’t be read. Try an M4A, MP3 or WAV.',
  memo_too_big: `That file is over ${MEMO_BYTES_MAX / 1024 / 1024} MB. Share it at a lower quality, or trim it to the sermon.`,
  memo_too_long: 'That recording is over an hour. Trim it to the sermon itself and try again.',
  memo_limit: 'That’s all the voice memos your church can transcribe today. Paste a transcript instead, or try tomorrow.',
  memo_silent: 'We couldn’t hear any speech in that recording.',
  memo_missing: 'That upload has expired — choose the file again.',
  model_busy: 'The transcriber is busy — try again in a minute. Nothing was used up.',
  timeout: 'That took too long to transcribe — try again. Nothing was used up.',
  upload_failed: 'The upload didn’t finish — check your connection and try again.',
  no_reply: 'Lost the connection while transcribing — try again.',
  no_mic: 'This browser couldn’t use the microphone. Record in your phone’s voice memo app and upload it instead.',
  unavailable: 'Voice memos aren’t available right now — you can still paste a transcript.',
}
/** Why the server wouldn't take the week (the upload itself is fine). */
const QUEUE_MSG: Record<string, string> = {
  bad_passages: 'One of those passages couldn’t be used — keep each inside one chapter, 40 verses at most.',
  passage_unavailable: 'Couldn’t fetch the words of that passage — check your connection.',
  needs_series: 'Give the week a series name.',
  no_addon: 'Drafting a week is part of the Content Generation package, which this church doesn’t have.',
  no_reply: 'Lost the connection handing it over — check Plan in a minute; it may have started anyway.',
}
/** A failure the same upload can be sent again for. */
const RETRY = new Set(['model_busy', 'timeout', 'no_reply', 'unavailable', 'transcribe_failed'])

type Phase = 'idle' | 'recording' | 'checking' | 'uploading' | 'transcribing' | 'queueing'

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const minutes = (s: number) => (s < 90 ? `${Math.max(1, Math.round(s))} sec` : `${Math.round(s / 60)} min`)

/** The recorder's own format, the one Safari and Chrome each produce natively. */
function recorderType(): string | undefined {
  const MR = typeof MediaRecorder !== 'undefined' ? MediaRecorder : null
  if (!MR?.isTypeSupported) return undefined
  // AAC in MP4 first (Safari's only option, and the most ordinary file), then
  // Chrome's native WebM/Opus — never MP4 carrying Opus, the least standard pair.
  return ['audio/mp4;codecs=mp4a.40.2', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find((t) => MR.isTypeSupported(t))
}

export function MemoInput({
  churchId, memo, hasText, disabled, onTranscript, queue,
}: {
  churchId: string
  memo: MemoBackend
  /**
   * Hand the upload to the server to transcribe AND draft the week (0148).
   * `ready` is null when it can go, else the line saying what's missing.
   */
  queue?: { ready: string | null; run: (up: MemoUpload) => Promise<{ ok: true } | { ok: false; reason: string }> }
  /** Whether the box already holds text — then the leader chooses replace or add. */
  hasText: boolean
  disabled?: boolean
  onTranscript: (text: string, how: 'replace' | 'append') => void
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [upload, setUpload] = useState<MemoUpload | null>(null)
  const [elapsed, setElapsed] = useState(0)
  // The last upload went to the server to draft the week (so "Try again" there means transcribe here).
  const [queued, setQueued] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const rec = useRef<{ mr: MediaRecorder; stream: MediaStream; chunks: Blob[]; started: number; lock?: { release: () => Promise<void> }; cancel?: boolean } | null>(null)
  const mounted = useRef(true)
  // Set on mount too: StrictMode (dev) mounts, unmounts and mounts again.
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stopStream() } }, [])

  const canRecord = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  const busy = phase !== 'idle' && phase !== 'recording'

  function stopStream() {
    const r = rec.current
    r?.stream.getTracks().forEach((t) => t.stop())
    void r?.lock?.release().catch(() => {})
  }

  const deliver = (text: string, seconds?: number) => {
    setDone(`Transcribed${seconds ? ` ${minutes(seconds)}` : ''}. Read it over and fix any names it misheard — then draft.`)
    if (hasText) setPending(text)
    else onTranscript(text, 'replace')
  }

  const transcribe = async (up: MemoUpload) => {
    setPhase('transcribing')
    const r = await memo.transcribe(churchId, up)
    if (!mounted.current) return
    setPhase('idle')
    if (r.ok) { setUpload(null); deliver(r.data.transcript, r.data.seconds); return }
    setErr(MSG[r.reason] ?? MSG.unavailable)
    setUpload(RETRY.has(r.reason) ? up : null)
  }

  const handOff = async (up: MemoUpload) => {
    if (!queue) return
    setPhase('queueing')
    const r = await queue.run(up)
    if (!mounted.current) return
    setPhase('idle')
    if (r.ok) { setUpload(null); setQueued(true); setDone('Sent. Your week is being drafted on our side — you can close the app. It’ll be waiting on Plan for you to review; nothing goes to your members until you approve it.'); return }
    setErr(QUEUE_MSG[r.reason] ?? MSG[r.reason] ?? 'Couldn’t start the week for you.')
    setUpload(up)
  }

  const send = async (file: Blob, name: string, knownSeconds?: number) => {
    setErr(null); setDone(null); setPending(null); setUpload(null); setQueued(false)
    if (queue?.ready) return setErr(queue.ready)
    if (file.size > MEMO_BYTES_MAX) return setErr(MSG.memo_too_big)
    setPhase('checking')
    const secs = knownSeconds ?? (await memoSeconds(file))
    if (!mounted.current) return
    if (secs != null && secs > MEMO_SECONDS_MAX + 30) { setPhase('idle'); return setErr(MSG.memo_too_long) }
    setPhase('uploading')
    const up = await memo.upload(churchId, file, name)
    if (!mounted.current) return
    if (!up.ok) { setPhase('idle'); return setErr(MSG[up.reason] ?? MSG.unavailable) }
    if (queue) await handOff(up.data)
    else await transcribe(up.data)
  }

  const startRecording = async () => {
    setErr(null); setDone(null); setPending(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      return setErr(MSG.no_mic)
    }
    const type = recorderType()
    const mr = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 48_000 } : undefined)
    const r: NonNullable<typeof rec.current> = { mr, stream, chunks: [], started: Date.now() }
    rec.current = r
    mr.ondataavailable = (e) => { if (e.data.size) r.chunks.push(e.data) }
    mr.onstop = () => {
      stopStream()
      if (r.cancel || !mounted.current) { setPhase('idle'); return }
      const blob = new Blob(r.chunks, { type: mr.mimeType || type || 'audio/webm' })
      const ext = (mr.mimeType || '').includes('mp4') ? 'm4a' : (mr.mimeType || '').includes('ogg') ? 'ogg' : 'webm'
      // A recorded WebM reports no duration, so the clock is the length.
      void send(blob, `sermon.${ext}`, (Date.now() - r.started) / 1000)
    }
    mr.start(10_000)
    // Keep the screen on: a locked phone stops the recording.
    try { r.lock = await (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') } catch { /* not offered */ }
    setElapsed(0)
    setPhase('recording')
  }

  const stopRecording = (cancel = false) => {
    const r = rec.current
    if (!r) return
    r.cancel = cancel
    if (r.mr.state !== 'inactive') r.mr.stop()
    else { stopStream(); setPhase('idle') }
  }

  useEffect(() => {
    if (phase !== 'recording') return
    const t = setInterval(() => {
      const s = (Date.now() - (rec.current?.started ?? Date.now())) / 1000
      setElapsed(s)
      if (s >= MEMO_SECONDS_MAX) stopRecording()
    }, 500)
    return () => clearInterval(t)
  }, [phase])

  const status =
    phase === 'checking' ? 'Checking the recording…'
      : phase === 'uploading' ? 'Uploading… a long sermon can take a minute.'
        : phase === 'transcribing' ? 'Listening to it… up to two minutes for an hour-long sermon.'
          : phase === 'queueing' ? 'Handing it over…'
            : null

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {phase === 'recording' ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--coral)' }} aria-live="polite">● Recording {clock(elapsed)}</span>
          <button className="pill" onClick={() => stopRecording()} style={{ fontSize: 12.5, fontWeight: 800 }}>{queue ? '■ Stop and send' : '■ Stop and transcribe'}</button>
          <button className="faint" onClick={() => stopRecording(true)} style={{ padding: 0, fontSize: 12, fontWeight: 700, color: 'var(--ink-dim)', cursor: 'pointer' }}>Cancel</button>
          <span className="faint" style={{ flexBasis: '100%', fontSize: 11.5 }}>Keep this screen open while it records — up to an hour.</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <button className="pill" disabled={disabled || busy} onClick={() => fileRef.current?.click()} style={{ fontSize: 12.5, fontWeight: 800 }}>
            🎙 Upload a voice memo
          </button>
          {canRecord && (
            <button className="pill" disabled={disabled || busy} onClick={() => void startRecording()} style={{ fontSize: 12.5, fontWeight: 800 }}>
              ● Record here
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept={MEMO_ACCEPT}
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void send(f, f.name)
            }}
          />
        </div>
      )}
      {status && <span className="dim" style={{ fontSize: 12, lineHeight: 1.4 }} aria-live="polite">{status}</span>}
      {err && (
        <span style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--coral)' }}>
          {err}{' '}
          {upload && (
            <button className="faint" onClick={() => { setErr(null); void transcribe(upload) }} style={{ padding: 0, fontSize: 12, fontWeight: 800, color: 'var(--ink)', cursor: 'pointer', textDecoration: 'underline' }}>
              {queue && !queued ? 'Transcribe it here instead' : 'Try again'}
            </button>
          )}
        </span>
      )}
      {pending && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span className="dim" style={{ fontSize: 12 }}>The box already has text.</span>
          <button className="pill" onClick={() => { onTranscript(pending, 'replace'); setPending(null) }} style={{ fontSize: 12, fontWeight: 800 }}>Replace it</button>
          <button className="pill" onClick={() => { onTranscript(pending, 'append'); setPending(null) }} style={{ fontSize: 12, fontWeight: 800 }}>Add below</button>
        </div>
      )}
      {done && !pending && !err && <span style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--mint)' }}>{done}</span>}
    </div>
  )
}

/** The box's new text for a transcript and the leader's choice. */
export const placeTranscript = (current: string, text: string, how: 'replace' | 'append') =>
  how === 'append' && current.trim() ? `${current.trimEnd()}\n\n${text}` : text
