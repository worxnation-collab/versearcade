import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/Button'
import { useJuice } from '@/juice/useJuice'
import { todayLocalDate, addDays } from '@/lib/date'
import { parseReference } from '@/lib/bibleProgress'
import { verseFromReference } from '@/data/bible/questions'
import { cleanQuestions, fetchDayVerse, saveDayVerse } from '@/store/churchAdmin'
import type { Question } from '@/types'

// "Set today's verse" — the verified layer's one write (0119).
//
// A reference, the words, and five questions of the church's own, saved for a
// date. Saving the same date again replaces it (`set_church_verse` is an
// upsert), so the form loads whatever is already there first and edits it
// rather than overwriting blind. Members of the church play it as that day's
// drop; everybody else is untouched.
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

export function TodayVerseForm({ churchId, churchName }: { churchId: string; churchName: string }) {
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

  // Load what this date already holds, so a second save edits the first.
  useEffect(() => {
    let alive = true
    setLoading(true)
    setMsg(null)
    fetchDayVerse(churchId, date).then((r) => {
      if (!alive) return
      const v = r.ok ? r.data : null
      setExisting(!!v)
      setReference(v?.reference ?? '')
      setText(v?.text ?? '')
      setQs(v ? v.questions.map(toDraft) : Array.from({ length: 5 }, blank))
      setLoading(false)
    })
    return () => { alive = false }
  }, [churchId, date])

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
    const r = await saveDayVerse(churchId, date, { reference: reference.trim(), text: text.trim(), questions: built as Question[] })
    setBusy(false)
    if (!r.ok) return setMsg({ ok: false, text: REASONS[r.reason] ?? 'That didn’t save — check your connection and try again.' })
    juice.select?.()
    setExisting(true)
    setMsg({
      ok: true,
      text: date === today
        ? `Saved. It’s today’s drop for ${churchName}’s members — anyone who already played keeps their run.`
        : `Saved for ${pretty(date)}.`,
    })
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <label style={labelStyle}>
        Day
        <input type="date" value={date} min={today} max={addDays(today, 366)} onChange={(e) => e.target.value && setDate(e.target.value)} />
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
      <Button variant="gold" full disabled={busy || loading} onClick={save}>
        {busy ? 'Saving…' : date === today ? 'Set today’s verse' : `Set the verse for ${pretty(date)}`}
      </Button>
    </div>
  )
}

function pretty(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const labelStyle: React.CSSProperties = { display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--ink-dim)' }
