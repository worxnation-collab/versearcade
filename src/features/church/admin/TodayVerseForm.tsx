import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/Button'
import { useJuice } from '@/juice/useJuice'
import { todayLocalDate, addDays } from '@/lib/date'
import { parseReference } from '@/lib/bibleProgress'
import { verseFromReference } from '@/data/bible/questions'
import { cleanQuestions, fetchWeek, fillDays, serverVerseBackend, type DayVerse, type VerseBackend, type WeekDay } from '@/store/churchAdmin'
import type { Question } from '@/types'

// "Set today's verse" — the verified layer's one write (0119).
//
// A reference, the words, and five questions of the church's own, saved for a
// date. Saving the same date again replaces it (`set_church_verse` is an
// upsert), so the form loads whatever is already there first and edits it
// rather than overwriting blind. Members of the church play it as that day's
// drop; everybody else is untouched.
//
// A pastor prepares weekly, so the form sits under a WEEK STRIP: seven days,
// each marked set or not, tapping one edits it. A day nobody set quietly plays
// the global verse, and the strip is what makes that visible before it happens.
// After a save, one tap copies the verse to the window's other EMPTY days —
// never over a day already set — optionally dealing each day's questions in a
// different order so the week isn't the same five taps every morning.
//
// When the arcade's library already carries the verse, one tap fills its words
// and the five questions the app would have asked — a starting point to edit,
// not a requirement. Validation mirrors `church_clean_questions` (`cleanQuestions`),
// so the form says what is missing before the server has to refuse it.

const OPTIONS = 4

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

const DRAFT_REASONS: Record<string, string> = {
  limit: 'That’s the drafting limit for today — write these by hand, or draft again tomorrow.',
  not_verified: 'Drafting is part of a Founding Church.',
  not_leadership: 'Only this church’s leadership can draft questions.',
  draft_failed: 'Couldn’t draft good questions for that one — try again, or write your own.',
  demo_library_only: 'In this demo, drafting works for verses in our library (try John 15:5). A Founding Church can draft from any passage.',
  unavailable: 'Drafting isn’t available just now — check your connection and try again.',
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
  const [mix, setMix] = useState(true)
  const [filling, setFilling] = useState(false)

  const loadWeek = async (start = weekStart) => {
    const r = await fetchWeek(churchId, start, backend)
    if (r.ok) { setWeek(r.data); setWeekErr(false) } else { setWeek(null); setWeekErr(true) }
  }
  useEffect(() => { void loadWeek(weekStart) }, [churchId, weekStart, backend]) // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (d: string) => {
    if (d < weekStart || d > addDays(weekStart, 6)) setWeekStart(d < today ? today : d)
    setDate(d)
  }
  const emptyLater = (week ?? []).filter((w) => !w.verse && w.date !== date && w.date >= today).map((w) => w.date)

  const fillWeek = async () => {
    if (!saved || !emptyLater.length) return
    setFilling(true)
    const { filled } = await fillDays(churchId, emptyLater, saved, mix, backend)
    setFilling(false)
    juice.select?.()
    setSaved(null)
    setMsg({ ok: true, text: filled.length
      ? `Copied to ${filled.length} more ${filled.length === 1 ? 'day' : 'days'}. Tap any day to change it.`
      : 'Those days were already set — nothing was overwritten.' })
    void loadWeek()
  }

  // Load what this date already holds, so a second save edits the first.
  useEffect(() => {
    let alive = true
    setLoading(true)
    setMsg(null)
    setSaved(null)
    backend.get(churchId, date).then((r) => {
      if (!alive) return
      const v = r.ok ? r.data : null
      setExisting(!!v)
      setReference(v?.reference ?? '')
      setText(v?.text ?? '')
      setQs(v ? v.questions.map(toDraft) : Array.from({ length: 5 }, blank))
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

  // "✨ Draft questions" — five questions written from the passage by the
  // server (`church-draft`, 0122) for ANY reference, not only the library's.
  // It fills the form and saves nothing. Over questions the pastor already
  // typed, the first tap only warns; the second replaces.
  const [drafting, setDrafting] = useState(false)
  const [armed, setArmed] = useState(false)
  const typed = qs.some((q) => q.prompt.trim() || q.teach.trim() || q.options.some((o) => o.trim()))
  const canDraft = !!backend.draft && !!parseReference(reference) && text.trim().length >= 3
  const draft = async () => {
    if (!backend.draft || !canDraft) return
    if (typed && !armed) { setArmed(true); return }
    setArmed(false)
    setMsg(null)
    setDrafting(true)
    const r = await backend.draft(churchId, reference.trim(), text.trim())
    setDrafting(false)
    if (!r.ok) return setMsg({ ok: false, text: DRAFT_REASONS[r.reason] ?? DRAFT_REASONS.unavailable })
    juice.select?.()
    setQs(r.data.map(toDraft))
    setMsg({ ok: true, text: 'Drafted. Read each one before you save — change anything that isn’t how you’d say it.' })
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
    const v: DayVerse = { reference: reference.trim(), text: text.trim(), questions: built as Question[] }
    const r = await backend.save(churchId, date, v)
    setBusy(false)
    if (!r.ok) return setMsg({ ok: false, text: REASONS[r.reason] ?? 'That didn’t save — check your connection and try again.' })
    juice.select?.()
    setExisting(true)
    setSaved(v)
    onSaved?.(date, v)
    void loadWeek()
    setMsg({
      ok: true,
      text: date === today
        ? `Saved. It’s today’s drop for ${churchName}’s members — anyone who already played keeps their run.`
        : `Saved for ${pretty(date)}.`,
    })
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <WeekStrip
        week={week}
        error={weekErr}
        selected={date}
        today={today}
        canBack={weekStart > today}
        canForward={addDays(weekStart, 13) <= addDays(today, 366)}
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

      {backend.draft && (
        <div style={{ display: 'grid', gap: 4 }}>
          <button
            className="pill"
            onClick={draft}
            disabled={!canDraft || drafting}
            style={{ justifySelf: 'start', fontSize: 12.5, fontWeight: 800, opacity: canDraft ? 1 : 0.55 }}
          >
            {drafting ? 'Drafting five questions…' : armed ? 'Tap again to replace your questions' : '✨ Draft five questions from this passage'}
          </button>
          <span className="faint" style={{ fontSize: 11.5, lineHeight: 1.4 }}>
            {canDraft
              ? 'A first draft to edit — nothing is saved until you tap Set.'
              : 'Add the reference and the words of the verse first.'}
          </span>
        </div>
      )}

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
      {saved && emptyLater.length > 0 && (
        <div className="card" style={{ padding: 12, display: 'grid', gap: 8, background: 'var(--card-raised)' }}>
          <b style={{ fontSize: 13.5 }}>
            {emptyLater.length} {emptyLater.length === 1 ? 'day' : 'days'} this week still {emptyLater.length === 1 ? 'plays' : 'play'} the global verse.
          </b>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={mix} onChange={(e) => setMix(e.target.checked)} style={{ width: 18, height: 18, flexShrink: 0 }} />
            Mix the order of the questions and answers each day
          </label>
          <Button variant="secondary" full disabled={filling} onClick={fillWeek}>
            {filling ? 'Copying…' : `Use ${saved.reference} for ${emptyLater.length === 1 ? 'that day' : `all ${emptyLater.length}`}`}
          </Button>
          <p className="faint" style={{ margin: 0, fontSize: 11.5 }}>Days you&rsquo;ve already set are never changed.</p>
        </div>
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
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <b style={{ flex: 1, fontSize: 13, fontWeight: 800 }}>
          {week ? `${pretty(week[0].date)} – ${pretty(week[6].date)}` : 'This week'}
        </b>
        <button className="pill" onClick={props.onBack} disabled={!props.canBack} aria-label="Earlier week" style={{ opacity: props.canBack ? 1 : 0.4 }}>‹</button>
        <button className="pill" onClick={props.onForward} disabled={!props.canForward} aria-label="Next week" style={{ opacity: props.canForward ? 1 : 0.4 }}>›</button>
      </div>
      {error ? (
        <button className="pill" onClick={props.onRetry} style={{ justifySelf: 'start', fontSize: 12.5 }}>Couldn&rsquo;t load the week — try again</button>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
          {(week ?? Array.from({ length: 7 }, () => null)).map((w, i) => {
            if (!w) return <div key={i} className="skeleton" style={{ height: 58, borderRadius: 10 }} />
            const on = w.date === selected
            const [y, m, d] = w.date.split('-').map(Number)
            const day = new Date(y, m - 1, d)
            return (
              <button
                key={w.date}
                onClick={() => props.onPick(w.date)}
                aria-pressed={on}
                aria-label={`${day.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}: ${w.verse ? w.verse.reference : 'not set, plays the global verse'}`}
                style={{
                  minWidth: 0, padding: '6px 2px', borderRadius: 10, display: 'grid', gap: 2, justifyItems: 'center',
                  border: `1.5px solid ${on ? 'var(--ink-dim)' : 'transparent'}`,
                  background: w.verse ? 'var(--select)' : 'var(--card-raised)',
                  color: 'var(--ink)', cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-dim)' }}>
                  {w.date === today ? 'Today' : day.toLocaleDateString(undefined, { weekday: 'short' })}
                </span>
                <span style={{ fontSize: 15, fontWeight: 800 }}>{d}</span>
                <span aria-hidden="true" style={{ fontSize: 10, color: w.verse ? 'var(--mint)' : 'var(--ink-dim)' }}>{w.verse ? '✓' : '—'}</span>
              </button>
            )
          })}
        </div>
      )}
      {week && (
        <p className="faint" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45 }}>
          {unset === 0
            ? 'Every day this week has your verse.'
            : `${unset} of these 7 days ${unset === 1 ? 'plays' : 'play'} the global verse. ✓ marks a day with yours.`}
        </p>
      )}
    </div>
  )
}

function pretty(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const labelStyle: React.CSSProperties = { display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--ink-dim)' }
