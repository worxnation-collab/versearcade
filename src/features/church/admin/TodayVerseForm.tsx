import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/Button'
import { useJuice } from '@/juice/useJuice'
import { todayLocalDate, addDays } from '@/lib/date'
import { parseReference } from '@/lib/bibleProgress'
import { verseFromReference } from '@/data/bible/questions'
import { cleanLine, cleanQuestions, fetchDays, NOTE_MAX, SERIES_MAX, serverVerseBackend, type DayVerse, type VerseBackend, type WeekDay } from '@/store/churchAdmin'
import type { Question } from '@/types'
import { SeriesCopyPanel } from './SeriesCopyPanel'

// "Set today's verse" — the verified layer's one write (0119).
//
// A reference, the words, and five questions of the church's own, saved for a
// date. Saving the same date again replaces it (`set_church_verse` is an
// upsert), so the form loads whatever is already there first and edits it
// rather than overwriting blind. Members of the church play it as that day's
// drop; everybody else is untouched.
//
// A pastor prepares weekly and preaches by the SERIES, so the form sits under a
// three-week strip: twenty-one days, each marked set or not, tapping one edits
// it, and a run of days filed under one series name is drawn as one. A day
// nobody set quietly plays the global verse, and the strip is what makes that
// visible before it happens. After a save, `SeriesCopyPanel` carries the verse
// through a chosen date, listing every day it would replace before it touches
// one (nothing is replaced unless ticked).
//
// Each day may carry a SERIES name and a short NOTE from the pastor (0123), both
// optional plain text. The note is what members read beside the verse on the
// Play tab that day (the church card, `ChurchWindow`); the series is the quiet label beside it
// and what "This week we're in …" puts on the church's page in one tap.
//
// When the arcade's library already carries the verse, one tap fills its words
// and the five questions the app would have asked — a starting point to edit,
// not a requirement. Validation mirrors `church_clean_questions` (`cleanQuestions`),
// so the form says what is missing before the server has to refuse it.

const OPTIONS = 4
/** Three weeks: a series is usually longer than one and rarely longer than this. */
const WINDOW = 21

interface Draft {
  prompt: string
  options: string[]
  answerIndex: number
  teach: string
}

const blank = (): Draft => ({ prompt: '', options: Array(OPTIONS).fill(''), answerIndex: 0, teach: '' })
const toDraft = (q: Question): Draft => ({
  prompt: q.prompt,
  options: [...q.options, ...Array(OPTIONS).fill('')].slice(0, OPTIONS),
  answerIndex: q.answerIndex,
  teach: q.teach,
})

/** Blank options drop out; the correct one has to survive that. */
function fromDraft(d: Draft): Question | null {
  const kept: string[] = []
  let answer = -1
  d.options.forEach((o, i) => {
    if (!o.trim()) return
    if (i === d.answerIndex) answer = kept.length
    kept.push(o)
  })
  if (answer < 0) return null
  return { prompt: d.prompt, options: kept, answerIndex: answer, teach: d.teach }
}

const REASONS: Record<string, string> = {
  bad_date: 'Pick today or a day ahead.',
  bad_reference: 'That reference doesn’t look right — try “John 3:16” or “Psalm 23:1-3”.',
  bad_text: 'Add the words of the verse.',
  bad_questions: 'Each question needs a prompt, at least two different answers, the right one marked, and a line that explains it.',
  not_verified: 'This isn’t available for your church right now.',
  not_leadership: 'Only this church’s leadership can set the verse.',
}

export function TodayVerseForm({
  churchId,
  churchName,
  backend = serverVerseBackend,
  onSaved,
}: {
  churchId: string
  churchName: string
  /** Where days are read and written — the server, or memory for the demo. */
  backend?: VerseBackend
  /** After a successful save, with the verse as saved. */
  onSaved?: (date: string, v: DayVerse) => void
}) {
  const juice = useJuice()
  const today = todayLocalDate()
  const [date, setDate] = useState(today)
  const [reference, setReference] = useState('')
  const [text, setText] = useState('')
  const [qs, setQs] = useState<Draft[]>(() => Array.from({ length: 5 }, blank))
  const [loading, setLoading] = useState(true)
  const [existing, setExisting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [weekStart, setWeekStart] = useState(today)
  const [week, setWeek] = useState<WeekDay[] | null>(null)
  const [weekErr, setWeekErr] = useState(false)
  const [saved, setSaved] = useState<DayVerse | null>(null)
  const [series, setSeries] = useState('')
  const [note, setNote] = useState('')
  const [pageLine, setPageLine] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle')
  // The copy panel closes once it has run; the verse it copied stays `saved`,
  // so "This week we're in …" is still one tap away afterwards.
  const [copied, setCopied] = useState(false)
  const weekRef = useRef<WeekDay[] | null>(null)
  weekRef.current = week

  const loadWeek = async (start = weekStart) => {
    const r = await fetchDays(churchId, start, WINDOW, backend)
    if (r.ok) { setWeek(r.data); setWeekErr(false) } else { setWeek(null); setWeekErr(true) }
  }
  useEffect(() => { void loadWeek(weekStart) }, [churchId, weekStart, backend]) // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (d: string) => {
    if (d < weekStart || d > addDays(weekStart, WINDOW - 1)) setWeekStart(d < today ? today : d)
    setDate(d)
  }

  // Load what this date already holds, so a second save edits the first.
  useEffect(() => {
    let alive = true
    setLoading(true)
    setMsg(null)
    setSaved(null)
    setCopied(false)
    setPageLine('idle')
    backend.get(churchId, date).then((r) => {
      if (!alive) return
      const v = r.ok ? r.data : null
      setExisting(!!v)
      setReference(v?.reference ?? '')
      setText(v?.text ?? '')
      setQs(v ? v.questions.map(toDraft) : Array.from({ length: 5 }, blank))
      // An empty day right after a day in a series most likely continues it,
      // so the name is offered — visible in the field, and one tap to clear.
      const before = weekRef.current?.find((w) => w.date === addDays(date, -1))?.verse
      setSeries(v ? (v.series ?? '') : (before?.series ?? ''))
      setNote(v?.note ?? '')
      setLoading(false)
    })
    return () => { alive = false }
  }, [churchId, date, backend])

  const library = useMemo(() => (parseReference(reference) ? verseFromReference(reference.trim()) : null), [reference])

  const useLibrary = () => {
    if (!library) return
    setMsg(null)
    setText(library.text)
    setQs(library.questions.slice(0, 5).map(toDraft))
  }

  const setQ = (i: number, patch: Partial<Draft>) => setQs((all) => all.map((q, j) => (j === i ? { ...q, ...patch } : q)))
  const setOpt = (i: number, k: number, v: string) =>
    setQs((all) => all.map((q, j) => (j === i ? { ...q, options: q.options.map((o, m) => (m === k ? v : o)) } : q)))

  const save = async () => {
    setMsg(null)
    if (!parseReference(reference)) return setMsg({ ok: false, text: REASONS.bad_reference })
    if (!text.trim()) return setMsg({ ok: false, text: REASONS.bad_text })
    const built = qs.map(fromDraft)
    const bad = built.findIndex((q) => !q || !cleanQuestions([q, q, q, q, q]))
    if (bad >= 0) return setMsg({ ok: false, text: `Question ${bad + 1} isn’t finished. ${REASONS.bad_questions}` })

    setBusy(true)
    const v: DayVerse = {
      reference: reference.trim(),
      text: text.trim(),
      questions: built as Question[],
      series: cleanLine(series, SERIES_MAX),
      note: cleanLine(note, NOTE_MAX),
    }
    const r = await backend.save(churchId, date, v)
    setBusy(false)
    if (!r.ok) return setMsg({ ok: false, text: REASONS[r.reason] ?? 'That didn’t save — check your connection and try again.' })
    juice.select?.()
    setExisting(true)
    setSaved(v)
    setCopied(false)
    setPageLine('idle')
    onSaved?.(date, v)
    void loadWeek()
    const lost = r.data?.extras === false && (v.series || v.note)
    setMsg({
      ok: !lost,
      text: (date === today
        ? `Saved. It’s today’s drop for ${churchName}’s members — anyone who already played keeps their run.`
        : `Saved for ${pretty(date)}.`) + (lost ? ' The series name and note didn’t save — try again in a moment.' : ''),
    })
  }

  const putOnPage = async () => {
    if (!saved?.series || !backend.setThisWeek) return
    setPageLine('busy')
    const r = await backend.setThisWeek(churchId, thisWeekLine(saved.series))
    setPageLine(r.ok ? 'done' : 'failed')
    if (r.ok) juice.select?.()
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <WeekStrip
        week={week}
        error={weekErr}
        selected={date}
        today={today}
        canBack={weekStart > today}
        canForward={addDays(weekStart, WINDOW + 6) <= addDays(today, 366)}
        onBack={() => setWeekStart(addDays(weekStart, -7) < today ? today : addDays(weekStart, -7))}
        onForward={() => setWeekStart(addDays(weekStart, 7))}
        onPick={pick}
        onRetry={() => void loadWeek()}
      />

      <label style={labelStyle}>
        Day
        <input type="date" value={date} min={today} max={addDays(today, 366)} onChange={(e) => e.target.value && pick(e.target.value)} />
      </label>
      <p className="faint" style={{ margin: '-4px 0 0', fontSize: 11.5, lineHeight: 1.45 }}>
        {loading
          ? 'Checking that day…'
          : existing
            ? 'A verse is set for this day — saving replaces it.'
            : 'Nothing set — your members get the same verse as everyone else that day.'}
      </p>

      <label style={labelStyle}>
        Verse reference
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="John 15:5"
          autoCapitalize="words"
          autoCorrect="off"
          maxLength={40}
        />
      </label>
      {library && (
        <button className="pill" onClick={useLibrary} style={{ justifySelf: 'start', fontSize: 12.5 }}>
          ✨ Fill in the words and five questions for {library.reference}
        </button>
      )}

      <label style={labelStyle}>
        The verse
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1000} placeholder="I am the vine; you are the branches…" style={{ resize: 'vertical' }} />
      </label>

      <label style={labelStyle}>
        Series (optional)
        <input value={series} onChange={(e) => setSeries(e.target.value)} placeholder="John 15–17, Advent…" maxLength={SERIES_MAX} autoCapitalize="words" />
      </label>

      <label style={labelStyle}>
        A note to your members (optional)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={NOTE_MAX} placeholder="Read the whole chapter before Sunday — we’ll pick up at verse 9." style={{ resize: 'vertical' }} />
      </label>
      <p className="faint" style={{ margin: '-4px 0 0', fontSize: 11.5, lineHeight: 1.45 }}>
        Members see the note beside this day&rsquo;s verse on their Play tab, that day only. {note.length > NOTE_MAX - 40 ? `${NOTE_MAX - note.length} characters left.` : ''}
      </p>

      {qs.map((q, i) => (
        <div key={i} className="card" role="group" aria-label={`Question ${i + 1}`} style={{ padding: '12px 12px 10px', display: 'grid', gap: 8, minWidth: 0 }}>
          <b style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-dim)' }}>Question {i + 1}</b>
          <input value={q.prompt} onChange={(e) => setQ(i, { prompt: e.target.value })} placeholder="What does Jesus call himself here?" maxLength={300} aria-label={`Question ${i + 1}`} />
          {q.options.map((o, k) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="radio"
                name={`answer-${i}`}
                checked={q.answerIndex === k}
                onChange={() => setQ(i, { answerIndex: k })}
                aria-label={`Answer ${k + 1} is correct`}
                style={{ flexShrink: 0, width: 18, height: 18 }}
              />
              <input
                value={o}
                onChange={(e) => setOpt(i, k, e.target.value)}
                placeholder={k < 2 ? `Answer ${k + 1}` : `Answer ${k + 1} (optional)`}
                maxLength={120}
                style={{ flex: 1, minWidth: 0 }}
              />
            </div>
          ))}
          <input value={q.teach} onChange={(e) => setQ(i, { teach: e.target.value })} placeholder="Shown after answering — what a wrong answer should learn" maxLength={400} aria-label={`Question ${i + 1} explanation`} />
        </div>
      ))}
      <p className="faint" style={{ margin: '-4px 0 0', fontSize: 11.5, lineHeight: 1.45 }}>
        Mark the right answer with the circle. The last line shows after every answer, right or wrong — a miss should still teach something.
      </p>

      {msg && <p style={{ margin: 0, fontSize: 13, color: msg.ok ? 'var(--mint)' : 'var(--coral)' }}>{msg.text}</p>}
      {saved?.series && backend.setThisWeek && (
        <button
          className="pill"
          onClick={putOnPage}
          disabled={pageLine === 'busy' || pageLine === 'done'}
          style={{ justifySelf: 'start', fontSize: 12.5, whiteSpace: 'normal', textAlign: 'left', lineHeight: 1.4 }}
        >
          {pageLine === 'done'
            ? `✓ Your church page says “${thisWeekLine(saved.series)}”`
            : pageLine === 'failed'
              ? 'Couldn’t update your page — tap to try again'
              : `📌 Put “${thisWeekLine(saved.series)}” on your church page`}
        </button>
      )}
      {saved && !copied && date < addDays(today, 365) && (
        <SeriesCopyPanel
          key={`${date}:${saved.reference}`}
          churchId={churchId}
          from={date}
          today={today}
          defaultUntil={addDays(date, 6)}
          verse={saved}
          backend={backend}
          onDone={(t) => { setCopied(true); setMsg({ ok: true, text: `${t} Tap any day to change it.` }); void loadWeek() }}
        />
      )}
      <Button variant="gold" full disabled={busy || loading} onClick={save}>
        {busy ? 'Saving…' : date === today ? 'Set today’s verse' : `Set the verse for ${pretty(date)}`}
      </Button>
    </div>
  )
}

function WeekStrip(props: {
  week: WeekDay[] | null
  error: boolean
  selected: string
  today: string
  canBack: boolean
  canForward: boolean
  onBack: () => void
  onForward: () => void
  onPick: (d: string) => void
  onRetry: () => void
}) {
  const { week, error, selected, today } = props
  const unset = week ? week.filter((w) => !w.verse).length : 0
  const runs = week ? seriesRuns(week) : []
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <b style={{ flex: 1, fontSize: 13, fontWeight: 800 }}>
          {week ? `${pretty(week[0].date)} – ${pretty(week[week.length - 1].date)}` : 'The next three weeks'}
        </b>
        <button className="pill" onClick={props.onBack} disabled={!props.canBack} aria-label="Earlier week" style={{ opacity: props.canBack ? 1 : 0.4 }}>‹</button>
        <button className="pill" onClick={props.onForward} disabled={!props.canForward} aria-label="Next week" style={{ opacity: props.canForward ? 1 : 0.4 }}>›</button>
      </div>
      {error ? (
        <button className="pill" onClick={props.onRetry} style={{ justifySelf: 'start', fontSize: 12.5 }}>Couldn&rsquo;t load the week — try again</button>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
          {(week ?? Array.from({ length: WINDOW }, () => null)).map((w, i) => {
            if (!w) return <div key={i} className="skeleton" style={{ height: 58, borderRadius: 10 }} />
            const on = w.date === selected
            const [y, m, d] = w.date.split('-').map(Number)
            const day = new Date(y, m - 1, d)
            return (
              <button
                key={w.date}
                onClick={() => props.onPick(w.date)}
                aria-pressed={on}
                aria-label={`${day.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}: ${w.verse ? `${w.verse.reference}${w.verse.series ? `, ${w.verse.series}` : ''}` : 'not set, plays the global verse'}`}
                style={{
                  minWidth: 0, padding: '6px 2px', borderRadius: 10, display: 'grid', gap: 2, justifyItems: 'center',
                  border: `1.5px solid ${on ? 'var(--ink-dim)' : 'transparent'}`,
                  background: w.verse ? 'var(--select)' : 'var(--card-raised)',
                  // A day filed under a series wears a bar along its top, so a
                  // run reads as one stretch of the strip.
                  boxShadow: w.verse?.series ? 'inset 0 3px 0 var(--edge)' : undefined,
                  color: 'var(--ink)', cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-dim)' }}>
                  {w.date === today ? 'Today' : day.toLocaleDateString(undefined, { weekday: 'short' })}
                </span>
                <span style={{ fontSize: 15, fontWeight: 800 }}>{d}</span>
                <span aria-hidden="true" style={{ fontSize: 10, color: w.verse ? 'var(--mint)' : 'var(--ink-dim)' }}>{w.verse ? (w.verse.note ? '✓✉' : '✓') : '—'}</span>
              </button>
            )
          })}
        </div>
      )}
      {runs.length > 0 && (
        <div style={{ display: 'grid', gap: 2 }}>
          {runs.map((r) => (
            <span key={`${r.from}:${r.name}`} style={{ fontSize: 12, lineHeight: 1.4, overflowWrap: 'anywhere' }}>
              <b>{r.name}</b> <span className="dim">· {r.from === r.to ? pretty(r.from) : `${pretty(r.from)} – ${pretty(r.to)}`}</span>
            </span>
          ))}
        </div>
      )}
      {week && (
        <p className="faint" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45 }}>
          {unset === 0
            ? 'Every one of these days has your verse.'
            : `${unset} of these ${week.length} days ${unset === 1 ? 'plays' : 'play'} the global verse. ✓ marks a day with yours, ✉ one with a note, and a bar along the top a day in a series.`}
        </p>
      )}
    </div>
  )
}

/** Consecutive days in the window filed under the same series name. */
function seriesRuns(days: WeekDay[]): { name: string; from: string; to: string }[] {
  const out: { name: string; from: string; to: string }[] = []
  for (const d of days) {
    const name = d.verse?.series
    const last = out[out.length - 1]
    if (name && last && last.name === name && addDays(last.to, 1) === d.date) last.to = d.date
    else if (name) out.push({ name, from: d.date, to: d.date })
  }
  return out
}

/** The church page's "This week" line for a series — 140 chars, like the field. */
export function thisWeekLine(series: string): string {
  return `This week we’re in ${series}`.slice(0, 140)
}

function pretty(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const labelStyle: React.CSSProperties = { display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--ink-dim)' }
